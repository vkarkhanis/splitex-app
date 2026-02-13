import { Router, Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { ApiResponse, LoginRequest, RegisterRequest } from '@splitex/shared';

const router: Router = Router();
const authService = new AuthService();

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
