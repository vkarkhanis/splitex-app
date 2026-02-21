import { Router, Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { ApiResponse, LoginRequest, RegisterRequest, User } from '@splitex/shared';
import { db } from '../config/firebase';
import bcrypt from 'bcryptjs';

const router: Router = Router();
const authService = new AuthService();

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
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
