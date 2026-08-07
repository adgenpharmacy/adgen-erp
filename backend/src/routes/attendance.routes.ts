import { Router, Response } from 'express';
import { prisma } from '../config/prisma';
import { authenticate, AuthenticatedRequest, requireOwner } from '../middlewares/auth.middleware';

const router = Router();
router.use(authenticate);

/**
 * How long a session may go unheard from before it is treated as ended.
 *
 * Somebody closing the browser and going home is the normal case, not the exception — nobody
 * remembers to clock out. Rather than leaving the session open and recording a fourteen-hour
 * shift, it is closed at `lastSeenAt`: the last moment the app knows the person was there.
 */
const IDLE_TIMEOUT_MINUTES = Number(process.env.ATTENDANCE_IDLE_MINUTES || 60);

/**
 * Close any session that has gone quiet for longer than the timeout.
 *
 * Run before every read and before opening a new session, so the sweep needs no scheduler: the
 * data is corrected the moment anybody looks at it or starts a shift.
 */
async function closeStaleSessions(): Promise<number> {
  const cutoff = new Date(Date.now() - IDLE_TIMEOUT_MINUTES * 60 * 1000);

  const stale = await prisma.attendanceSession.findMany({
    where: { clockOutAt: null, lastSeenAt: { lt: cutoff } },
    select: { id: true, lastSeenAt: true },
  });

  for (const session of stale) {
    await prisma.attendanceSession.update({
      where: { id: session.id },
      data: { clockOutAt: session.lastSeenAt, closedBy: 'TIMEOUT' },
    });
  }

  return stale.length;
}

/** Minutes worked, counting an open session up to now. */
function minutesOf(session: { clockInAt: Date; clockOutAt: Date | null }): number {
  const end = session.clockOutAt ?? new Date();
  return Math.max(0, Math.round((end.getTime() - new Date(session.clockInAt).getTime()) / 60000));
}

/** Local calendar day. Never toISOString(): that is UTC and rolls over at 05:30 in IST. */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// GET /api/attendance/me — the caller's own shift state and recent history
router.get('/me', async (req: AuthenticatedRequest, res: Response) => {
  try {
    await closeStaleSessions();
    const userId = req.user!.id;

    const since = new Date();
    since.setDate(since.getDate() - 30);

    const sessions = await prisma.attendanceSession.findMany({
      where: { userId, clockInAt: { gte: since } },
      orderBy: { clockInAt: 'desc' },
    });

    const open = sessions.find((s) => s.clockOutAt === null) ?? null;
    const today = dayKey(new Date());
    const todaysSessions = sessions.filter((s) => dayKey(new Date(s.clockInAt)) === today);

    res.json({
      idleTimeoutMinutes: IDLE_TIMEOUT_MINUTES,
      openSession: open ? { ...open, minutes: minutesOf(open) } : null,
      todayMinutes: todaysSessions.reduce((sum, s) => sum + minutesOf(s), 0),
      sessions: sessions.map((s) => ({ ...s, minutes: minutesOf(s) })),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/attendance/clock-in
router.post('/clock-in', async (req: AuthenticatedRequest, res: Response) => {
  try {
    await closeStaleSessions();
    const userId = req.user!.id;

    // Already on shift: hand back the open session rather than opening a second one. Two open
    // sessions would double-count the day, and the button is easy to press twice.
    const existing = await prisma.attendanceSession.findFirst({
      where: { userId, clockOutAt: null },
      orderBy: { clockInAt: 'desc' },
    });
    if (existing) {
      return res.json({ ...existing, minutes: minutesOf(existing), alreadyOpen: true });
    }

    const session = await prisma.attendanceSession.create({
      data: { userId, clockInAt: new Date(), lastSeenAt: new Date() },
    });
    res.status(201).json({ ...session, minutes: 0 });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// POST /api/attendance/clock-out
router.post('/clock-out', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const open = await prisma.attendanceSession.findFirst({
      where: { userId, clockOutAt: null },
      orderBy: { clockInAt: 'desc' },
    });

    if (!open) return res.status(400).json({ error: 'You are not clocked in.' });

    const session = await prisma.attendanceSession.update({
      where: { id: open.id },
      data: { clockOutAt: new Date(), lastSeenAt: new Date(), closedBy: 'MANUAL', notes: req.body?.notes || open.notes },
    });
    res.json({ ...session, minutes: minutesOf(session) });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

/**
 * POST /api/attendance/heartbeat
 *
 * The app calls this while someone is working. It is what makes the idle close-out land at the
 * right time — without it the only known timestamp would be clock-in.
 */
router.post('/heartbeat', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const open = await prisma.attendanceSession.findFirst({
      where: { userId, clockOutAt: null },
      orderBy: { clockInAt: 'desc' },
    });
    if (!open) return res.json({ open: false });

    await prisma.attendanceSession.update({ where: { id: open.id }, data: { lastSeenAt: new Date() } });
    res.json({ open: true, sessionId: open.id, minutes: minutesOf(open) });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

/**
 * GET /api/attendance — everyone's attendance over a date range (owner only).
 *
 * Returns the raw sessions plus a per-person-per-day roll-up, because the question an owner
 * asks is "who was in on Tuesday and for how long", not "list me every row".
 */
router.get('/', requireOwner, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await closeStaleSessions();

    const from = req.query.from ? new Date(String(req.query.from)) : new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const to = req.query.to ? new Date(String(req.query.to)) : new Date();
    to.setHours(23, 59, 59, 999);

    const sessions = await prisma.attendanceSession.findMany({
      where: { clockInAt: { gte: from, lte: to } },
      orderBy: { clockInAt: 'desc' },
      include: { user: { select: { id: true, name: true, email: true, role: true, designation: true } } },
    });

    const days = new Map<string, {
      day: string;
      userId: string;
      userName: string;
      designation: string | null;
      role: string;
      firstIn: Date;
      lastOut: Date | null;
      minutes: number;
      sessionCount: number;
      stillOpen: boolean;
      autoClosed: boolean;
    }>();

    for (const s of sessions) {
      const day = dayKey(new Date(s.clockInAt));
      const key = `${s.userId}|${day}`;
      const row = days.get(key);
      const mins = minutesOf(s);

      if (!row) {
        days.set(key, {
          day,
          userId: s.userId,
          userName: s.user?.name ?? 'Unknown',
          designation: s.user?.designation ?? null,
          role: s.user?.role ?? 'EMPLOYEE',
          firstIn: s.clockInAt,
          lastOut: s.clockOutAt,
          minutes: mins,
          sessionCount: 1,
          stillOpen: s.clockOutAt === null,
          autoClosed: s.closedBy === 'TIMEOUT',
        });
        continue;
      }

      row.minutes += mins;
      row.sessionCount += 1;
      if (new Date(s.clockInAt) < new Date(row.firstIn)) row.firstIn = s.clockInAt;
      if (s.clockOutAt && (!row.lastOut || new Date(s.clockOutAt) > new Date(row.lastOut))) row.lastOut = s.clockOutAt;
      if (s.clockOutAt === null) row.stillOpen = true;
      if (s.closedBy === 'TIMEOUT') row.autoClosed = true;
    }

    res.json({
      idleTimeoutMinutes: IDLE_TIMEOUT_MINUTES,
      from,
      to,
      sessions: sessions.map((s) => ({ ...s, minutes: minutesOf(s) })),
      days: [...days.values()].sort((a, b) => (a.day === b.day ? a.userName.localeCompare(b.userName) : b.day.localeCompare(a.day))),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
