# Splitex - Expense Splitting Application

A comprehensive expense splitting application that supports both web (React/Next.js) and mobile (React Native) platforms. The application enables users to create events/trips, invite participants, track expenses, and settle payments efficiently using a greedy algorithm for optimal settlement.

## 🚀 Quick Start

### Prerequisites
- Node.js 24.11.1+ 
- npm or pnpm
- Rush.js (for monorepo management)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd splitex-rush

# Install dependencies
rush update

# Build all packages
rush build
```

## 📱 Project Structure

This is a Rush monorepo with the following structure:

```
splitex-rush/
├── apps/
│   ├── web/          # Next.js web application
│   ├── mobile/       # React Native mobile app
│   └── api/          # Node.js backend API
├── libraries/
│   └── shared/       # Common types and utilities
└── common/config/rush/    # Rush monorepo configuration
```

## 🏗️ Architecture

### Technology Stack

- **Frontend**: React 18+, Next.js 14+, TypeScript, Tailwind CSS
- **Mobile**: React Native, Expo, TypeScript
- **Backend**: Node.js, Express, Firebase Admin SDK
- **Database**: Firebase Firestore (NoSQL)
- **Authentication**: Firebase Auth + JWT tokens
- **Monorepo**: Rush.js with PNPM workspaces

## 📦 Packages

### @splitex/web
Next.js web application with authentication and user management.

**Scripts:**
```bash
rushx web dev          # Start development server
rushx web build         # Build for production
rushx web start         # Start production server
```

### @splitex/mobile
React Native mobile app with Expo.

**Scripts:**
```bash
rushx mobile start       # Start Expo development server
rushx mobile build       # Build mobile app
```

### @splitex/api
Node.js Express API with Firebase integration.

**Scripts:**
```bash
rushx api dev          # Start API development server
rushx api build         # Build TypeScript
rushx api start         # Start production server
```

### @splitex/shared
Common TypeScript types and utilities shared across all packages.

## 🔐 Development Workflow

### Environment Setup
1. Copy `.env.example` to `.env.local` and configure:
   - Firebase project credentials (see [Firebase Setup Guide](docs/FIREBASE_SETUP.md))
   - JWT secrets
   - Database connection strings

**Quick Firebase Setup:** See [Firebase Quick Start](docs/FIREBASE_QUICK_START.md) for 5-minute setup

### Running Applications

#### Web Application
```bash
cd apps/web
rushx web dev
```
Visit: http://localhost:3000

#### Mobile Application
```bash
cd apps/mobile
rushx mobile start
```
Install Expo Go app and scan QR code

#### API Server
```bash
cd apps/api
rushx api dev
```
API runs on: http://localhost:3001

## 🧪 Available Scripts

### Development Commands
```bash
# Install all dependencies
rush update

# Build all packages
rush build

# Start all development servers
rushx start

# Clean all build artifacts
rush clean

# Lint all packages
rush lint

# Run tests
rush test
```

### Environment Variables

Create a `.env.local` file in the root:

```env
# Firebase Configuration
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=your-service-account@project-id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key
JWT_REFRESH_SECRET=your-super-secret-refresh-key

# API Configuration
PORT=3001
NODE_ENV=development
```

## 🔐 Authentication

The application supports multiple authentication methods:

### Phone Authentication
1. User enters phone number
2. System sends OTP (mock: `123456`)
3. User verifies OTP and receives JWT tokens

### Social Authentication
- **Google OAuth**: Sign in with Google account
- **Microsoft OAuth**: Sign in with Microsoft account

### Token Management
- Access tokens (1 hour expiry)
- Refresh tokens (7 days expiry)
- Automatic token refresh

## 📱 API Endpoints

### Authentication
- `POST /api/auth/send-otp` - Send OTP to phone
- `POST /api/auth/verify-otp` - Verify OTP and login
- `POST /api/auth/google` - Google OAuth sign-in
- `POST /api/auth/microsoft` - Microsoft OAuth sign-in
- `POST /api/auth/refresh` - Refresh JWT tokens
- `POST /api/auth/logout` - User logout

### Users
- `GET /api/users/profile` - Get user profile
- `PUT /api/users/profile` - Update user profile

### Events (Coming Soon)
- `GET /api/events` - List user events
- `POST /api/events` - Create new event

### Expenses (Coming Soon)
- `GET /api/expenses` - List event expenses
- `POST /api/expenses` - Create new expense

### Settlements (Coming Soon)
- `GET /api/settlements` - List settlements
- `POST /api/settlements` - Create settlement

## 🎯 Key Features

### ✅ Phase 1 Complete (Foundation)
- [x] Rush monorepo setup
- [x] Shared types package
- [x] Next.js web application
- [x] React Native mobile app
- [x] Node.js backend API
- [x] Firebase configuration
- [x] Authentication system (Phone, Google, Microsoft)
- [x] JWT token management
- [x] User registration and login UI
- [x] Basic API structure

### 🚧 Phase 2 In Progress (Core Features)
- [ ] Event management system
- [ ] Expense tracking and splitting
- [ ] Group management
- [ ] Settlement algorithm implementation
- [ ] Real-time updates with Firebase
- [ ] Payment gateway integration

### 🔮 Phase 3 Planned (Advanced Features)
- [ ] Push notifications
- [ ] Offline support
- [ ] Advanced analytics
- [ ] Multi-currency support
- [ ] Receipt upload and processing
- [ ] Admin dashboard

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `rush test`
5. Build: `rush build`
6. Submit pull request

## 📄 License

MIT License - see LICENSE file for details

## 👥 Team

- Backend API: Port 3001
- Web App: Port 3000  
- Mobile App: Expo Go (port varies)

---

**Splitex** - Making expense splitting simple and fair! 💰
