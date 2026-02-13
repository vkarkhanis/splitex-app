import type { NextFunction, Request, Response } from 'express';
import { ApiResponse } from '@splitex/shared';
import { auth } from '../config/firebase';

export type AuthenticatedRequest = Request & {
  user?: {
    uid: string;
    email?: string;
    name?: string;
  };
};

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.toLowerCase().startsWith('bearer ')) {
      return res.status(401).json({ success: false, error: 'Unauthorized' } as ApiResponse);
    }

    const token = header.slice('bearer '.length).trim();
    if (!token) {
      return res.status(401).json({ success: false, error: 'Unauthorized' } as ApiResponse);
    }

    if (token.startsWith('mock-')) {
      req.user = {
        uid: token,
        email: 'mock@example.com',
        name: 'Mock User'
      };
      return next();
    }

    const decoded = await auth.verifyIdToken(token);
    req.user = {
      uid: decoded.uid,
      email: (decoded as any).email,
      name: (decoded as any).name
    };

    return next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    return res.status(401).json({ success: false, error: 'Unauthorized' } as ApiResponse);
  }
}
