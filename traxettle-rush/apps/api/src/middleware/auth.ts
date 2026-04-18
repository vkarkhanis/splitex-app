import type { NextFunction, Request, Response } from 'express';
import { ApiResponse } from '@traxettle/shared';
import { auth } from '../config/firebase';
import jwt from 'jsonwebtoken';
import { AuthService } from '../services/auth.service';

export type AuthenticatedRequest = Request & {
  user?: {
    uid: string;
    email?: string;
    name?: string;
    sessionId?: string;
  };
};

function unauthorized(res: Response, code: string, error = 'Unauthorized') {
  return res.status(401).json({ success: false, error, code } as ApiResponse);
}

const authService = new AuthService();
const useFirebaseEmulator = process.env.FIREBASE_USE_EMULATOR === 'true';
const emulatorProjectId = process.env.FIREBASE_PROJECT_ID || 'traxettle-local';

function getJwtSecret(): string {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.APP_ENV === 'local' || process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development') {
    return 'local-dev-jwt-secret-change-me';
  }
  throw new Error('JWT_SECRET is not configured');
}

function tryDecodeEmulatorIdToken(token: string) {
  const decoded = jwt.decode(token) as
    | {
        aud?: string;
        iss?: string;
        sub?: string;
        user_id?: string;
        email?: string;
        name?: string;
      }
    | null;

  if (!decoded) return null;

  const audienceMatches = decoded.aud === emulatorProjectId;
  const issuerMatches =
    typeof decoded.iss === 'string' &&
    decoded.iss.includes(`securetoken.google.com/${emulatorProjectId}`);
  const uid = decoded.sub || decoded.user_id;

  if (!uid || !audienceMatches || !issuerMatches) {
    return null;
  }

  return {
    uid,
    email: decoded.email,
    name: decoded.name,
  };
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.toLowerCase().startsWith('bearer ')) {
      return unauthorized(res, 'AUTH_MISSING');
    }

    const token = header.slice('bearer '.length).trim();
    if (!token) {
      return unauthorized(res, 'AUTH_MISSING');
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
      const decoded = jwt.verify(token, getJwtSecret()) as any;
      const sessionActive = await authService.isSessionActive(decoded.userId, decoded.sessionId);
      if (!sessionActive) {
        return unauthorized(res, 'AUTH_SESSION_REVOKED', 'Session revoked');
      }
      req.user = {
        uid: decoded.userId,
        email: decoded.email,
        name: decoded.displayName,
        sessionId: decoded.sessionId,
      };
      return next();
    } catch {
      // Not a JWT from our service, try Firebase
    }

    try {
      const decoded = await auth.verifyIdToken(token);
      req.user = {
        uid: decoded.uid,
        email: (decoded as any).email,
        name: (decoded as any).name
      };
      return next();
    } catch (firebaseError) {
      if (useFirebaseEmulator) {
        const emulatorDecoded = tryDecodeEmulatorIdToken(token);
        if (emulatorDecoded) {
          req.user = emulatorDecoded;
          return next();
        }
      }
      throw firebaseError;
    }
  } catch (err) {
    console.error('Auth middleware error:', err);
    return unauthorized(res, 'AUTH_INVALID');
  }
}
