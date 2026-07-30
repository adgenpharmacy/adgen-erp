import { Request, Response, NextFunction } from 'express';

/**
 * Maintenance mode.
 *
 * Set MAINTENANCE_MODE=1 to make the API refuse every call with 503 until it is unset. It exists
 * for the database region migration: the copy is a snapshot, so any bill written after the dump
 * is taken exists only in the old database and is silently lost at switch-over. Closing the shop
 * door is not enough when the software is reachable from any browser — the server has to say no.
 *
 * Reads are refused as well as writes. A screen that still lists yesterday's stock while the
 * database is being moved invites someone to act on it.
 *
 * /health stays up so the platform's checks (and you) can still tell the process is alive.
 */
export const maintenanceMode = (req: Request, res: Response, next: NextFunction) => {
  const enabled = process.env.MAINTENANCE_MODE === '1' || process.env.MAINTENANCE_MODE === 'true';
  if (!enabled) return next();

  return res.status(503).json({
    maintenance: true,
    error:
      process.env.MAINTENANCE_MESSAGE ||
      'The system is briefly down for scheduled database maintenance. Do not raise bills until it returns — anything entered now cannot be saved.',
  });
};
