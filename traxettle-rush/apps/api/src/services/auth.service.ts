import { User, TokenPair } from '@traxettle/shared';
import { auth, db } from '../config/firebase';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';

type TokenPayload = {
  userId: string;
  email: string;
  displayName: string;
  sessionId: string;
};

function getJwtSecret(): string {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.APP_ENV === 'local' || process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development') {
    return 'local-dev-jwt-secret-change-me';
  }
  throw new Error('JWT_SECRET is not configured');
}

function getJwtRefreshSecret(): string {
  if (process.env.JWT_REFRESH_SECRET) return process.env.JWT_REFRESH_SECRET;
  if (process.env.APP_ENV === 'local' || process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development') {
    return 'local-dev-jwt-refresh-secret-change-me';
  }
  throw new Error('JWT_REFRESH_SECRET is not configured');
}

export class AuthService {
  private auth = auth;
  private getSessionRef(userId: string, sessionId: string) {
    return db.collection('users').doc(userId).collection('sessions').doc(sessionId);
  }

  async signInWithPhone(phoneNumber: string): Promise<string> {
    try {
      // In a real implementation, you would use Firebase Phone Auth
      // For now, return a mock OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      console.log(`Mock OTP for ${phoneNumber}: ${otp}`);
      
      // Store OTP in Firestore or Redis for verification
      return otp;
    } catch (error) {
      throw new Error('Failed to send OTP');
    }
  }

  async verifyOTP(phoneNumber: string, otp: string): Promise<User> {
    try {
      // Mock verification - in real app, verify against stored OTP
      if (otp === '123456') { // For testing
        let user = await this.findUserByPhone(phoneNumber);
        if (!user) {
          // Create new user
          user = await this.createUser({
            phoneNumber,
            displayName: `User ${phoneNumber.slice(-4)}`,
            email: `${phoneNumber}@example.com`,
            provider: 'phone'
          });
        }
        return user;
      }
      throw new Error('Invalid OTP');
    } catch (error) {
      throw new Error('OTP verification failed');
    }
  }

  async signInWithGoogle(token: string): Promise<User> {
    try {
      // First try Firebase verifyIdToken (for Firebase-issued tokens from web)
      // If that fails, verify as a raw Google OAuth ID token
      let email: string;
      let displayName: string;
      let photoURL: string;
      let uid: string;

      try {
        const decodedToken = await this.auth.verifyIdToken(token);
        const firebaseUser = await this.auth.getUser(decodedToken.uid);
        email = firebaseUser.email || '';
        displayName = firebaseUser.displayName || '';
        photoURL = firebaseUser.photoURL || '';
        uid = firebaseUser.uid;
      } catch {
        // Token is a raw Google OAuth ID token (from native mobile SDK)
        const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${token}`);
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          throw new Error(`Google tokeninfo failed (${res.status})${body ? `: ${body}` : ''}`);
        }
        const payload: any = await res.json();
        if (!payload.email) throw new Error('No email in Google token');
        email = payload.email;
        displayName = payload.name || payload.email.split('@')[0];
        photoURL = payload.picture || '';
        uid = `google-${payload.sub}`;
      }

      let user = await this.findUserById(uid);
      if (!user) {
        user = await this.findUserByEmail(email);
      }
      if (!user) {
        user = await this.createUser({
          uid,
          email,
          displayName,
          photoURL,
          provider: 'google'
        });
      } else if (!user.authProviders.includes('google')) {
        user = await this.updateUser(user.id, {
          email,
          displayName,
          photoURL,
          authProviders: Array.from(new Set([...(user.authProviders || []), 'google'])) as any,
        });
      }
      
      return user;
    } catch (error: any) {
      const reason = error?.message || 'Unknown reason';
      throw new Error(`Google sign-in failed: ${reason}`);
    }
  }

  async signInWithMicrosoft(token: string): Promise<User> {
    try {
      // Similar to Google sign-in but with Microsoft OAuth
      // For now, mock implementation
      const mockUser: User = {
        id: 'microsoft-user-id',
        email: 'user@microsoft.com',
        phoneNumber: '',
        displayName: 'Microsoft User',
        photoURL: '',
        authProviders: ['microsoft'],
        preferences: {
          notifications: true,
          currency: 'USD',
          timezone: 'UTC'
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      let user = await this.findUserById(mockUser.id);
      if (!user) {
        user = await this.createUser(mockUser);
      }
      
      return user;
    } catch (error) {
      throw new Error('Microsoft sign-in failed');
    }
  }

  async generateTokens(user: User, existingSessionId?: string): Promise<TokenPair> {
    const sessionId = existingSessionId || randomUUID();
    const payload = {
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
      sessionId,
    };

    const accessToken = jwt.sign(payload, getJwtSecret(), { expiresIn: '1h' });
    const refreshToken = jwt.sign(payload, getJwtRefreshSecret(), { expiresIn: '7d' });

    const now = new Date().toISOString();
    await this.getSessionRef(user.id, sessionId).set({
      sessionId,
      userId: user.id,
      createdAt: now,
      updatedAt: now,
      revokedAt: null,
      lastRefreshedAt: existingSessionId ? now : null,
    }, { merge: true });

    return {
      accessToken,
      refreshToken,
      expiresIn: 3600
    };
  }

  async refreshTokens(refreshToken: string): Promise<TokenPair> {
    try {
      const decoded = jwt.verify(refreshToken, getJwtRefreshSecret()) as TokenPayload;
      const user = await this.findUserById(decoded.userId);
      
      if (!user) {
        throw new Error('User not found');
      }

      const isActive = await this.isSessionActive(decoded.userId, decoded.sessionId);
      if (!isActive) {
        throw new Error('Session revoked');
      }

      return this.generateTokens(user, decoded.sessionId);
    } catch (error) {
      throw new Error('Invalid refresh token');
    }
  }

  async logout(userId: string, sessionId?: string): Promise<void> {
    try {
      const now = new Date().toISOString();
      if (sessionId) {
        await this.getSessionRef(userId, sessionId).set({
          revokedAt: now,
          updatedAt: now,
        }, { merge: true });
        return;
      }

      const snap = await db.collection('users').doc(userId).collection('sessions').get();
      if (snap.empty) return;
      const batch = db.batch();
      snap.docs.forEach((doc) => {
        batch.set(doc.ref, { revokedAt: now, updatedAt: now }, { merge: true });
      });
      await batch.commit();

      if (typeof (this.auth as any).revokeRefreshTokens === 'function') {
        await (this.auth as any).revokeRefreshTokens(userId);
      }
    } catch (error) {
      throw new Error('Logout failed');
    }
  }

  async isSessionActive(userId: string, sessionId?: string): Promise<boolean> {
    if (!sessionId) return true;
    try {
      const snap = await this.getSessionRef(userId, sessionId).get();
      if (!snap.exists) return false;
      const data = snap.data() || {};
      return !data.revokedAt;
    } catch {
      return false;
    }
  }

  private async findUserById(userId: string): Promise<User | null> {
    try {
      const snap = await db.collection('users').doc(userId).get();
      if (!snap.exists) return null;
      const data = snap.data() || {};
      return {
        id: (data.userId as string) || userId,
        email: (data.email as string) || '',
        phoneNumber: (data.phoneNumber as string) || '',
        displayName: (data.displayName as string) || (data.email as string) || 'User',
        photoURL: typeof data.photoURL === 'string' ? data.photoURL : '',
        authProviders: (Array.isArray(data.authProviders) ? data.authProviders : ['email']) as any,
        preferences: data.preferences || {
          notifications: true,
          currency: 'USD',
          timezone: 'UTC',
        },
        createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
        updatedAt: data.updatedAt ? new Date(data.updatedAt) : new Date(),
      };
    } catch {
      return null;
    }
  }

  private async findUserByPhone(phoneNumber: string): Promise<User | null> {
    try {
      const snap = await db.collection('users')
        .where('phoneNumber', '==', phoneNumber)
        .limit(1)
        .get();
      if (snap.empty) return null;
      const doc = snap.docs[0];
      const data = doc.data() || {};
      return {
        id: (data.userId as string) || doc.id,
        email: (data.email as string) || `${phoneNumber}@example.com`,
        phoneNumber: (data.phoneNumber as string) || phoneNumber,
        displayName: (data.displayName as string) || `User ${phoneNumber.slice(-4)}`,
        photoURL: typeof data.photoURL === 'string' ? data.photoURL : '',
        authProviders: (Array.isArray(data.authProviders) ? data.authProviders : ['phone']) as any,
        preferences: data.preferences || {
          notifications: true,
          currency: 'USD',
          timezone: 'UTC',
        },
        createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
        updatedAt: data.updatedAt ? new Date(data.updatedAt) : new Date(),
      };
    } catch {
      return null;
    }
  }

  private async findUserByEmail(email: string): Promise<User | null> {
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const snap = await db.collection('users')
        .where('email', '==', normalizedEmail)
        .limit(1)
        .get();
      if (snap.empty) return null;
      const doc = snap.docs[0];
      const data = doc.data() || {};
      return {
        id: (data.userId as string) || doc.id,
        email: (data.email as string) || normalizedEmail,
        phoneNumber: (data.phoneNumber as string) || '',
        displayName: (data.displayName as string) || normalizedEmail.split('@')[0],
        photoURL: typeof data.photoURL === 'string' ? data.photoURL : '',
        authProviders: (Array.isArray(data.authProviders) ? data.authProviders : ['email']) as any,
        preferences: data.preferences || {
          notifications: true,
          currency: 'USD',
          timezone: 'UTC',
        },
        createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
        updatedAt: data.updatedAt ? new Date(data.updatedAt) : new Date(),
      };
    } catch {
      return null;
    }
  }

  private async updateUser(
    userId: string,
    updates: Partial<Pick<User, 'email' | 'displayName' | 'photoURL' | 'authProviders'>>
  ): Promise<User> {
    const existing = await this.findUserById(userId);
    if (!existing) {
      throw new Error('User not found');
    }

    const now = new Date().toISOString();
    const nextDoc = {
      userId,
      email: updates.email || existing.email,
      phoneNumber: existing.phoneNumber || '',
      displayName: updates.displayName || existing.displayName,
      photoURL: updates.photoURL ?? existing.photoURL ?? '',
      authProviders: updates.authProviders || existing.authProviders,
      preferences: existing.preferences,
      updatedAt: now,
    };

    await db.collection('users').doc(userId).set(nextDoc, { merge: true });

    return {
      ...existing,
      email: nextDoc.email,
      displayName: nextDoc.displayName,
      photoURL: nextDoc.photoURL,
      authProviders: nextDoc.authProviders as any,
      updatedAt: new Date(now),
    };
  }

  private async createUser(userData: any): Promise<User> {
    const now = new Date().toISOString();
    const user: User = {
      id: userData.uid || `user-${Date.now()}`,
      email: userData.email,
      phoneNumber: userData.phoneNumber || '',
      displayName: userData.displayName,
      photoURL: userData.photoURL,
      authProviders: [userData.provider],
      preferences: {
        notifications: true,
        currency: 'USD',
        timezone: 'UTC'
      },
      createdAt: new Date(now),
      updatedAt: new Date(now)
    };

    await db.collection('users').doc(user.id).set({
      userId: user.id,
      email: user.email,
      phoneNumber: user.phoneNumber,
      displayName: user.displayName,
      photoURL: user.photoURL || '',
      authProviders: user.authProviders,
      tier: 'free',
      entitlementStatus: 'active',
      entitlementExpiresAt: null,
      entitlementSource: 'system',
      internalTester: false,
      preferences: user.preferences,
      createdAt: now,
      updatedAt: now,
    }, { merge: true });

    return user;
  }
}
