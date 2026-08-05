'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api-client';
import { formatDate, cn } from '@/lib/utils';
import { formatWorkedMinutes } from '@/context/AttendanceContext';
import { CalendarDays, Clock, AlertTriangle, Users } from 'lucide-react';
import {
  Card, CardHeader, TableWrap, Table, THead, TH, TR, TD, TableSkeleton, EmptyState, StatusChip,
} from '@/components/ui';

interface AttendanceSessionRow {
  id: string;
  userId: string;
  clockInAt: string;
  clockOutAt: string | null;
  lastSeenAt: string;
  closedBy: 'MANUAL' | 'TIMEOUT' | 'ADMIN' | null;
  minutes: number;
  user?: { id: string; name: string; role: string; designation: string | null };
}

interface AttendanceDayRow {
  day: string;
  userId: string;
  userName: string;
  designation: string | null;
  role: string;
  firstIn: string;
  lastOut: string | null;
  minutes: number;
  sessionCount: number;
  stillOpen: boolean;
  autoClosed: boolean;
}

const time = (value?: string | null) =>
  value ? new Date(value).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : '—';

/**
 * Attendance for the whole shop.
 *
 * Two views of the same rows: a day-by-day roll-up, which is what a payroll question needs, and
 * the individual sessions behind it — a day of three short sessions and a day of one long one are
 * not the same thing, and the roll-up alone would hide that.
 */
export default function AttendancePanel() {
  const [days, setDays] = useState<AttendanceDayRow[]>([]);
  const [sessions, setSessions] = useState<AttendanceSessionRow[]>([]);
  const [idleTimeout, setIdleTimeout] = useState(15);
  const [loading, setLoading] = useState(true);
  const [rangeDays, setRangeDays] = useState(30);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  useEffect(() => {
    const from = new Date();
    from.setDate(from.getDate() - rangeDays);

    // No synchronous spinner flip here: `loading` starts true, and on a range change the table
    // keeps showing the previous window until the new one lands, which reads better than a
    // skeleton flashing over data that was already correct.
    api
      .get('/attendance', { params: { from: from.toISOString() } })
      .then((res) => {
        setDays(res.data.days ?? []);
        setSessions(res.data.sessions ?? []);
        setIdleTimeout(res.data.idleTimeoutMinutes ?? 15);
      })
      .catch(() => {
        setDays([]);
        setSessions([]);
      })
      .finally(() => setLoading(false));
  }, [rangeDays]);

  const totals = useMemo(() => {
    const byPerson = new Map<string, { name: string; minutes: number; days: Set<string> }>();
    for (const d of days) {
      const row = byPerson.get(d.userId) || { name: d.userName, minutes: 0, days: new Set<string>() };
      row.minutes += d.minutes;
      row.days.add(d.day);
      byPerson.set(d.userId, row);
    }
    return [...byPerson.entries()]
      .map(([userId, r]) => ({ userId, name: r.name, minutes: r.minutes, daysPresent: r.days.size }))
      .sort((a, b) => b.minutes - a.minutes);
  }, [days]);

  const onShiftNow = sessions.filter((s) => s.clockOutAt === null);

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <CardHeader
          title="Attendance"
          subtitle={`Clock-ins over the last ${rangeDays} days · auto clock-out after ${idleTimeout} minutes idle`}
          action={
            <div className="flex items-center gap-1 rounded-md bg-sunken p-1">
              {[7, 30, 90].map((n) => (
                <button
                  key={n}
                  onClick={() => setRangeDays(n)}
                  aria-pressed={rangeDays === n}
                  className={cn(
                    'rounded-sm px-2.5 py-1 text-xs font-bold transition-colors',
                    rangeDays === n ? 'bg-surface text-fg shadow-card' : 'text-fg-muted hover:text-fg'
                  )}
                >
                  {n}d
                </button>
              ))}
            </div>
          }
        />

        {loading ? (
          <TableSkeleton rows={5} cols={6} />
        ) : (
          <>
            {onShiftNow.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2 border-b border-line bg-brand-subtle/40 px-4 py-2.5">
                <Users className="h-4 w-4 text-brand" aria-hidden />
                <span className="text-xs font-bold text-fg">On shift now:</span>
                {onShiftNow.map((s) => (
                  <span key={s.id} className="rounded-md bg-surface px-2 py-0.5 text-xs font-semibold text-fg">
                    {s.user?.name ?? 'Staff'} · since {time(s.clockInAt)}
                  </span>
                ))}
              </div>
            ) : null}

            {totals.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 border-b border-line p-4 sm:grid-cols-2 lg:grid-cols-4">
                {totals.map((t) => (
                  <div key={t.userId} className="rounded-md border border-line bg-raised px-3 py-2.5">
                    <span className="block truncate text-xs font-bold text-fg">{t.name}</span>
                    <span className="mt-0.5 block font-mono text-lg font-black text-brand">
                      {formatWorkedMinutes(t.minutes)}
                    </span>
                    <span className="block text-[11px] text-fg-subtle">
                      {t.daysPresent} {t.daysPresent === 1 ? 'day' : 'days'} present
                    </span>
                  </div>
                ))}
              </div>
            ) : null}

            {days.length === 0 ? (
              <EmptyState
                icon={Clock}
                title="No attendance recorded yet"
                message="Staff clock in from the sidebar. Sessions appear here as soon as someone starts a shift."
              />
            ) : (
              <TableWrap>
                <Table>
                  <THead>
                    <tr>
                      <TH>Date</TH>
                      <TH>Staff</TH>
                      <TH>First in</TH>
                      <TH>Last out</TH>
                      <TH align="right">Sessions</TH>
                      <TH align="right">Worked</TH>
                      <TH>Status</TH>
                    </tr>
                  </THead>
                  <tbody>
                    {days.map((d) => {
                      const key = `${d.userId}|${d.day}`;
                      const open = expandedDay === key;
                      const daySessions = sessions.filter(
                        (s) => s.userId === d.userId && new Date(s.clockInAt).toDateString() === new Date(d.day).toDateString()
                      );

                      return (
                        <Fragment key={key}>
                          <TR onClick={() => setExpandedDay(open ? null : key)} className="cursor-pointer">
                            <TD className="whitespace-nowrap font-semibold">
                              <CalendarDays className="mr-1.5 inline h-3.5 w-3.5 text-fg-subtle" aria-hidden />
                              {formatDate(d.day)}
                            </TD>
                            <TD>
                              <span className="block font-semibold">{d.userName}</span>
                              <span className="block text-[11px] text-fg-subtle">{d.designation || d.role}</span>
                            </TD>
                            <TD className="font-mono text-xs">{time(d.firstIn)}</TD>
                            <TD className="font-mono text-xs">{d.stillOpen ? '—' : time(d.lastOut)}</TD>
                            <TD align="right" className="font-mono">{d.sessionCount}</TD>
                            <TD align="right" className="font-mono font-bold text-brand-hover">
                              {formatWorkedMinutes(d.minutes)}
                            </TD>
                            <TD>
                              {d.stillOpen ? (
                                <StatusChip tone="success" small>On shift</StatusChip>
                              ) : d.autoClosed ? (
                                <StatusChip tone="warning" small>Auto closed</StatusChip>
                              ) : (
                                <StatusChip tone="info" small>Complete</StatusChip>
                              )}
                            </TD>
                          </TR>

                          {open ? (
                            <TR>
                              <TD colSpan={7} className="bg-sunken/60 p-3">
                                <div className="space-y-1.5">
                                  {daySessions.map((s) => (
                                    <div
                                      key={s.id}
                                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-surface px-3 py-2 text-xs"
                                    >
                                      <span className="font-mono">
                                        {time(s.clockInAt)} → {s.clockOutAt ? time(s.clockOutAt) : 'still open'}
                                      </span>
                                      <span className="font-mono font-bold">{formatWorkedMinutes(s.minutes)}</span>
                                      <span className="text-fg-subtle">
                                        {s.closedBy === 'TIMEOUT' ? (
                                          <span className="flex items-center gap-1 text-warn">
                                            <AlertTriangle className="h-3 w-3" aria-hidden />
                                            closed automatically at last activity
                                          </span>
                                        ) : s.closedBy === 'MANUAL' ? (
                                          'clocked out'
                                        ) : s.closedBy === 'ADMIN' ? (
                                          'closed by owner'
                                        ) : (
                                          'open'
                                        )}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </TD>
                            </TR>
                          ) : null}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </Table>
              </TableWrap>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
