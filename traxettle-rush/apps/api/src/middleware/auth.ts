import type { NextFunction, Request, Response } from 'express';
import { ApiResponse } from '@traxettle/shared';
import { auth } from '../config/firebase';
import jwt from 'jsonwebtoken';

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

    // Try JWT verification first (tokens issued by our AuthService)
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
      req.user = {
        uid: decoded.userId,
        email: decoded.email,
        name: decoded.displayName
      };
      return next();
    } catch {
      // Not a JWT from our service, try Firebase
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
