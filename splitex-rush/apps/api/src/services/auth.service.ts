import { User, TokenPair, LoginRequest, RegisterRequest, ApiResponse } from '@splitex/shared';
import { auth } from '../config/firebase';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

export class AuthService {
  private auth = auth;

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
      const decodedToken = await this.auth.verifyIdToken(token);
      const firebaseUser = await this.auth.getUser(decodedToken.uid);
      
      let user = await this.findUserById(firebaseUser.uid);
      if (!user) {
        user = await this.createUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email || '',
          displayName: firebaseUser.displayName || '',
          photoURL: firebaseUser.photoURL || '',
          provider: 'google'
        });
      }
      
      return user;
    } catch (error) {
      throw new Error('Google sign-in failed');
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

  async generateTokens(user: User): Promise<TokenPair> {
    const payload = {
      userId: user.id,
      email: user.email,
      displayName: user.displayName
    };

    const accessToken = jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: '1h' });
    const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET!, { expiresIn: '7d' });

    return {
      accessToken,
      refreshToken,
      expiresIn: 3600
    };
  }

  async refreshTokens(refreshToken: string): Promise<TokenPair> {
    try {
      const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET!) as any;
      const user = await this.findUserById(decoded.userId);
      
      if (!user) {
        throw new Error('User not found');
      }

      return this.generateTokens(user);
    } catch (error) {
      throw new Error('Invalid refresh token');
    }
  }

  async logout(userId: string): Promise<void> {
    try {
      // In a real implementation, you might:
      // - Revoke Firebase tokens
      // - Add refresh token to blacklist
      // - Clear user sessions
      console.log(`User ${userId} logged out`);
    } catch (error) {
      throw new Error('Logout failed');
    }
  }

  private async findUserById(userId: string): Promise<User | null> {
    // Implementation would query Firestore
    return null; // Mock
  }

  private async findUserByPhone(phoneNumber: string): Promise<User | null> {
    // Implementation would query Firestore
    return null; // Mock
  }

  private async createUser(userData: any): Promise<User> {
    const user: User = {
      id: userData.uid || `user-${Date.now()}`,
      email: userData.email,
      phoneNumber: userData.phoneNumber,
      displayName: userData.displayName,
      photoURL: userData.photoURL,
      authProviders: [userData.provider],
      preferences: {
        notifications: true,
        currency: 'USD',
        timezone: 'UTC'
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // In real implementation, save to Firestore
    console.log('Created user:', user);
    return user;
  }
}
