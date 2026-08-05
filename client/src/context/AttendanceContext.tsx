'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api-client';
import { useAuth } from './AuthContext';

export interface AttendanceSession {
  id: string;
  userId: string;
  clockInAt: string;
  clockOutAt: string | null;
  lastSeenAt: string;
  closedBy: 'MANUAL' | 'TIMEOUT' | 'ADMIN' | null;
  notes: string | null;
  minutes: number;
}

interface AttendanceState {
  openSession: AttendanceSession | null;
  todayMinutes: number;
  sessions: AttendanceSession[];
  idleTimeoutMinutes: number;
  loading: boolean;
  clockIn: () => Promise<void>;
  clockOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AttendanceContext = createContext<AttendanceState>({
  openSession: null,
  todayMinutes: 0,
  sessions: [],
  idleTimeoutMinutes: 15,
  loading: true,
  clockIn: async () => {},
  clockOut: async () => {},
  refresh: async () => {},
});

/** How often the open session's "still here" timestamp is refreshed. */
const HEARTBEAT_MS = 60_000;

/**
 * Attendance, and the inactivity rule that ends a shift.
 *
 * Staff close the tab and go home; nobody clocks out. So the browser reports that it is still in
 * use once a minute, and the server closes any session that has gone quiet — backdating the
 * clock-out to the last heartbeat rather than leaving a shift running all night. If the tab is
 * still open but untouched past the same limit, the session is signed out here too, so an
 * unattended counter machine does not stay logged in.
 */
export const AttendanceProvider = ({ children }: { children: React.ReactNode }) => {
  const { user, logout } = useAuth();
  const [openSession, setOpenSession] = useState<AttendanceSession | null>(null);
  const [todayMinutes, setTodayMinutes] = useState(0);
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [idleTimeoutMinutes, setIdleTimeoutMinutes] = useState(15);
  const [loading, setLoading] = useState(true);

  /**
   * Last real interaction. A ref, not state: it changes on every keystroke.
   *
   * Seeded to 0 and stamped by the first activity listener rather than `Date.now()` at render —
   * calling the clock during render is not idempotent, and the value is only ever read inside
   * the heartbeat, which cannot run before the listeners are attached.
   */
  const lastActivity = useRef(0);

  /*
   * Written as a promise chain rather than async/await so every setState sits in a callback —
   * the effect lint rule cannot see that an awaited call only sets state after it resolves.
   */
  const refresh = useCallback((): Promise<void> => {
    if (!user) return Promise.resolve();
    return api
      .get('/attendance/me')
      .then((res) => {
        setOpenSession(res.data.openSession ?? null);
        setTodayMinutes(res.data.todayMinutes ?? 0);
        setSessions(res.data.sessions ?? []);
        setIdleTimeoutMinutes(res.data.idleTimeoutMinutes ?? 15);
      })
      .catch(() => {
        /* attendance is not worth blocking the app over */
      })
      .finally(() => setLoading(false));
  }, [user]);

  useEffect(() => {
    // Signing out clears the shift state through the same path, so there is only one place
    // where these values are set.
    void refresh();
  }, [user, refresh]);

  // Nothing to show once signed out; derived rather than wiped by an effect.
  const activeSession = user ? openSession : null;

  // Track interaction so "idle" means idle, not merely "no page loads".
  useEffect(() => {
    const mark = () => {
      lastActivity.current = Date.now();
    };
    mark();
    const events: (keyof WindowEventMap)[] = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'focus'];
    events.forEach((e) => window.addEventListener(e, mark, { passive: true }));
    return () => events.forEach((e) => window.removeEventListener(e, mark));
  }, []);

  // Heartbeat while on shift; sign out when the machine has been left alone too long.
  useEffect(() => {
    if (!user || !activeSession) return;

    const tick = async () => {
      const idleMs = Date.now() - lastActivity.current;
      if (idleMs > idleTimeoutMinutes * 60 * 1000) {
        // The server will close the session at its last heartbeat; here we only end the login,
        // so an unattended till cannot be used by whoever walks up to it next.
        logout();
        return;
      }

      try {
        await api.post('/attendance/heartbeat');
      } catch {
        /* a missed beat is harmless; the next one carries the same meaning */
      }
    };

    const id = setInterval(tick, HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [user, activeSession, idleTimeoutMinutes, logout]);

  const clockIn = useCallback(async () => {
    await api.post('/attendance/clock-in');
    lastActivity.current = Date.now();
    await refresh();
  }, [refresh]);

  const clockOut = useCallback(async () => {
    await api.post('/attendance/clock-out');
    await refresh();
  }, [refresh]);


  return (
    <AttendanceContext.Provider
      value={{
        openSession: activeSession,
        todayMinutes: user ? todayMinutes : 0,
        sessions: user ? sessions : [],
        idleTimeoutMinutes,
        loading,
        clockIn,
        clockOut,
        refresh,
      }}
    >
      {children}
    </AttendanceContext.Provider>
  );
};

export const useAttendance = () => useContext(AttendanceContext);

/** "7h 20m" — the way a shift is spoken about, rather than 440 minutes. */
export function formatWorkedMinutes(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  if (hours === 0) return `${mins}m`;
  return `${hours}h ${String(mins).padStart(2, '0')}m`;
}
