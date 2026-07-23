import { Request, Response, NextFunction } from 'express';

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  const timestamp = new Date().toISOString();
  const { method, originalUrl, ip } = req;

  // Log incoming request
  console.log(`[${timestamp}] 📥 HTTP ${method} ${originalUrl} from ${ip || 'unknown'}`);

  // Intercept response finish to log status code and execution duration
  res.on('finish', () => {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;
    const statusIcon = statusCode >= 500 ? '💥' : statusCode >= 400 ? '⚠️' : '✅';
    
    console.log(
      `[${new Date().toISOString()}] ${statusIcon} HTTP ${method} ${originalUrl} -> Status ${statusCode} (${duration}ms)`
    );
  });

  next();
};
