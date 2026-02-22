import { Router, Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { ApiResponse, LoginRequest, RegisterRequest, User } from '@splitex/shared';
import { auth, db } from '../config/firebase';
import bcrypt from 'bcryptjs';
import { EmailService } from '../services/email.service';

const router: Router = Router();
const authService = new AuthService();
const emailService = new EmailService();

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function getActionCodeSettings() {
  return {
    url: process.env.AUTH_EMAIL_LINK_CONTINUE_URL || `${process.env.APP_URL || 'http://localhost:3000'}/auth/email-link`,
    handleCodeInApp: true,
    iOS: process.env.AUTH_IOS_BUNDLE_ID ? { bundleId: process.env.AUTH_IOS_BUNDLE_ID } : undefined,
    android: process.env.AUTH_ANDROID_PACKAGE_NAME
      ? {
          packageName: process.env.AUTH_ANDROID_PACKAGE_NAME,
          installApp: true,
          minimumVersion: process.env.AUTH_ANDROID_MIN_VERSION || '1',
        }
      : undefined,
  };
}

function extractOobCode(link?: string, code?: string): string | undefined {
  if (code) return code;
  if (!link) return undefined;
  try {
    const parsed = new URL(link);
    return parsed.searchParams.get('oobCode') || undefined;
  } catch {
    const match = link.match(/[?&]oobCode=([^&]+)/);
    return match ? decodeURIComponent(match[1]) : undefined;
  }
}

async function upsertEmailUserFromFirebase(uid: string, email: string, displayName?: string): Promise<User> {
  const now = new Date().toISOString();
  const userRef = db.collection('users').doc(uid);
  const existing = await userRef.get();
  const existingData = existing.exists ? existing.data() || {} : {};

  const userDoc = {
    userId: uid,
    email,
    phoneNumber: typeof existingData.phoneNumber === 'string' ? existingData.phoneNumber : '',
    displayName:
      (typeof existingData.displayName === 'string' && existingData.displayName) ||
      displayName ||
      email.split('@')[0],
    photoURL: typeof existingData.photoURL === 'string' ? existingData.photoURL : '',
    authProviders: Array.from(
      new Set([...(Array.isArray(existingData.authProviders) ? existingData.authProviders : []), 'email'])
    ),
    tier: existingData.tier || 'free',
    entitlementStatus: existingData.entitlementStatus || 'active',
    entitlementExpiresAt: existingData.entitlementExpiresAt || null,
    entitlementSource: existingData.entitlementSource || 'system',
    internalTester: Boolean(existingData.internalTester),
    preferences: existingData.preferences || {
      notifications: true,
      currency: 'USD',
      timezone: 'UTC'
    },
    createdAt: existingData.createdAt || now,
    updatedAt: now
  };

  await userRef.set(userDoc, { merge: true });

  return {
    id: uid,
    email: userDoc.email,
    phoneNumber: userDoc.phoneNumber,
    displayName: userDoc.displayName,
    photoURL: userDoc.photoURL,
    authProviders: userDoc.authProviders as any,
    preferences: userDoc.preferences,
    createdAt: new Date(userDoc.createdAt),
    updatedAt: new Date(userDoc.updatedAt)
  };
}

// Email Register (mobile compatibility)
router.post('/register', async (req, res) => {
  try {
    const { email, password, displayName } = req.body || {};

    if (!email || !password || !displayName) {
      return res.status(400).json({
        success: false,
        error: 'Email, password and display name are required'
      } as ApiResponse);
    }

    const normalizedEmail = normalizeEmail(email);
    const existingSnap = await db.collection('users')
      .where('email', '==', normalizedEmail)
      .limit(1)
      .get();

    if (!existingSnap.empty) {
      return res.status(409).json({
        success: false,
        error: 'User already exists'
      } as ApiResponse);
    }

    const userId = `email-${Date.now()}`;
    const passwordHash = await bcrypt.hash(password, 10);
    const now = new Date().toISOString();

    const user: User = {
      id: userId,
      email: normalizedEmail,
      phoneNumber: '',
      displayName: displayName.trim(),
      photoURL: '',
      authProviders: ['phone'],
      preferences: {
        notifications: true,
        currency: 'USD',
        timezone: 'UTC'
      },
      createdAt: new Date(now),
      updatedAt: new Date(now)
    };

    await db.collection('users').doc(userId).set({
      userId,
      email: normalizedEmail,
      phoneNumber: '',
      displayName: displayName.trim(),
      photoURL: '',
      authProviders: ['email'],
      tier: 'free',
      entitlementStatus: 'active',
      entitlementExpiresAt: null,
      entitlementSource: 'system',
      internalTester: false,
      passwordHash,
      preferences: user.preferences,
      createdAt: now,
      updatedAt: now
    });

    const tokens = await authService.generateTokens(user);

    return res.json({
      success: true,
      data: {
        user,
        tokens,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        token: tokens.accessToken
      }
    } as ApiResponse);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Registration failed'
    } as ApiResponse);
  }
});

// Email Login (mobile compatibility)
router.post('/login', async (req, res) => {
  try {
    const { identifier, password, provider } = req.body || {};

    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        error: 'Identifier and password are required'
      } as ApiResponse);
    }

    if (provider && provider !== 'email') {
      return res.status(400).json({
        success: false,
        error: 'Unsupported provider'
      } as ApiResponse);
    }

    const normalizedEmail = normalizeEmail(identifier);
    const userSnap = await db.collection('users')
      .where('email', '==', normalizedEmail)
      .limit(1)
      .get();

    if (userSnap.empty) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      } as ApiResponse);
    }

    const doc = userSnap.docs[0];
    const data = doc.data() || {};
    const passwordHash = data.passwordHash as string | undefined;

    if (!passwordHash) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      } as ApiResponse);
    }

    const isValid = await bcrypt.compare(password, passwordHash);
    if (!isValid) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      } as ApiResponse);
    }

    const user: User = {
      id: (data.userId as string) || doc.id,
      email: (data.email as string) || normalizedEmail,
      phoneNumber: (data.phoneNumber as string) || '',
      displayName: (data.displayName as string) || normalizedEmail.split('@')[0],
      photoURL: (data.photoURL as string) || '',
      authProviders: (Array.isArray(data.authProviders) ? data.authProviders : ['phone']) as any,
      preferences: data.preferences || {
        notifications: true,
        currency: 'USD',
        timezone: 'UTC'
      },
      createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
      updatedAt: data.updatedAt ? new Date(data.updatedAt) : new Date()
    };

    const tokens = await authService.generateTokens(user);

    return res.json({
      success: true,
      data: {
        user,
        tokens,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        token: tokens.accessToken
      }
    } as ApiResponse);
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: 'Login failed'
    } as ApiResponse);
  }
});

// Forgot Password (email)
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      } as ApiResponse);
    }

    const normalizedEmail = normalizeEmail(email);
    try {
      const link = await auth.generatePasswordResetLink(normalizedEmail, getActionCodeSettings() as any);
      await emailService.sendAuthLinkEmail(normalizedEmail, link, 'reset-password');
    } catch (err) {
      // Keep response generic to avoid account enumeration.
      console.warn('forgot-password link generation failed:', err);
    }

    return res.json({
      success: true,
      data: { message: 'If an account exists, a reset link has been sent.' }
    } as ApiResponse);
  } catch {
    return res.json({
      success: true,
      data: { message: 'If an account exists, a reset link has been sent.' }
    } as ApiResponse);
  }
});

// Send email link (passwordless sign-in)
router.post('/email-link/send', async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      } as ApiResponse);
    }

    const normalizedEmail = normalizeEmail(email);
    try {
      const link = await auth.generateSignInWithEmailLink(normalizedEmail, getActionCodeSettings() as any);
      await emailService.sendAuthLinkEmail(normalizedEmail, link, 'sign-in');
    } catch (err) {
      console.error('email-link send failed:', err);
      return res.status(500).json({
        success: false,
        error: 'Failed to send sign-in link'
      } as ApiResponse);
    }

    return res.json({
      success: true,
      data: { message: 'Sign-in link sent if email is valid.' }
    } as ApiResponse);
  } catch {
    return res.status(500).json({
      success: false,
      error: 'Failed to send sign-in link'
    } as ApiResponse);
  }
});

// Complete email-link sign-in and issue Splitex JWT tokens
router.post('/email-link/complete', async (req, res) => {
  try {
    const { email, link, oobCode } = req.body || {};
    if (!email || (!link && !oobCode)) {
      return res.status(400).json({
        success: false,
        error: 'Email and link (or oobCode) are required'
      } as ApiResponse);
    }

    const webApiKey = process.env.FIREBASE_WEB_API_KEY;
    if (!webApiKey) {
      return res.status(501).json({
        success: false,
        error: 'Email link sign-in is not configured on server'
      } as ApiResponse);
    }

    const normalizedEmail = normalizeEmail(email);
    const resolvedCode = extractOobCode(link, oobCode);
    if (!resolvedCode) {
      return res.status(400).json({
        success: false,
        error: 'Invalid sign-in link'
      } as ApiResponse);
    }

    const signInResp = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithEmailLink?key=${webApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: normalizedEmail, oobCode: resolvedCode, returnSecureToken: true })
    });

    const signInData: any = await signInResp.json().catch(() => ({}));
    if (!signInResp.ok || !signInData?.idToken) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired sign-in link'
      } as ApiResponse);
    }

    const decoded = await auth.verifyIdToken(signInData.idToken);
    const firebaseEmail = ((decoded as any).email || normalizedEmail) as string;
    const user = await upsertEmailUserFromFirebase(decoded.uid, normalizeEmail(firebaseEmail), (decoded as any).name);
    const tokens = await authService.generateTokens(user);

    return res.json({
      success: true,
      data: {
        user,
        tokens,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        token: tokens.accessToken
      }
    } as ApiResponse);
  } catch (err) {
    console.error('email-link complete failed:', err);
    return res.status(401).json({
      success: false,
      error: 'Email link sign-in failed'
    } as ApiResponse);
  }
});

// Send OTP
router.post('/send-otp', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        error: 'Phone number is required'
      } as ApiResponse);
    }

    const otp = await authService.signInWithPhone(phoneNumber);
    
    res.json({
      success: true,
      data: { message: 'OTP sent successfully', otp } // Only in development
    } as ApiResponse);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to send OTP'
    } as ApiResponse);
  }
});

// Verify OTP
router.post('/verify-otp', async (req, res) => {
  try {
    const { phoneNumber, otp } = req.body;
    
    if (!phoneNumber || !otp) {
      return res.status(400).json({
        success: false,
        error: 'Phone number and OTP are required'
      } as ApiResponse);
    }

    const user = await authService.verifyOTP(phoneNumber, otp);
    const tokens = await authService.generateTokens(user);
    
    res.json({
      success: true,
      data: { user, tokens }
    } as ApiResponse);
  } catch (error) {
    res.status(401).json({
      success: false,
      error: 'Invalid OTP'
    } as ApiResponse);
  }
});

// Google Sign-In
router.post('/google', async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Google token is required'
      } as ApiResponse);
    }

    const user = await authService.signInWithGoogle(token);
    const tokens = await authService.generateTokens(user);
    
    res.json({
      success: true,
      data: { user, tokens }
    } as ApiResponse);
  } catch (error) {
    res.status(401).json({
      success: false,
      error: 'Google sign-in failed'
    } as ApiResponse);
  }
});

// Microsoft Sign-In
router.post('/microsoft', async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Microsoft token is required'
      } as ApiResponse);
    }

    const user = await authService.signInWithMicrosoft(token);
    const tokens = await authService.generateTokens(user);
    
    res.json({
      success: true,
      data: { user, tokens }
    } as ApiResponse);
  } catch (error) {
    res.status(401).json({
      success: false,
      error: 'Microsoft sign-in failed'
    } as ApiResponse);
  }
});

// Refresh Token
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: 'Refresh token is required'
      } as ApiResponse);
    }

    const tokens = await authService.refreshTokens(refreshToken);
    
    res.json({
      success: true,
      data: { tokens }
    } as ApiResponse);
  } catch (error) {
    res.status(401).json({
      success: false,
      error: 'Invalid refresh token'
    } as ApiResponse);
  }
});

// Logout
router.post('/logout', async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      } as ApiResponse);
    }

    await authService.logout(userId);
    
    res.json({
      success: true,
      data: { message: 'Logged out successfully' }
    } as ApiResponse);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Logout failed'
    } as ApiResponse);
  }
});

export { router as authRoutes };
