import { Request, Response, NextFunction } from 'express';

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const timestamp = new Date().toISOString();
  const method = req.method;
  const url = req.url;
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  
  console.log(`[${timestamp}] ${method} ${url} - IP: ${ip}`);
  
  next();
};
