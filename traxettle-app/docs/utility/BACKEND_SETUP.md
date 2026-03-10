# Backend Setup Guide

Complete setup for Traxettle backend API, including all services and dependencies.

## Overview

The Traxettle backend provides:
- REST API for web and mobile
- Firebase authentication integration
- Email notifications
- File storage
- WebSocket real-time updates
- Multi-currency support

## Prerequisites

- Node.js v24+
- Firebase project setup
- SMTP configuration
- Environment variables configured

## Step-by-Step Setup

### 1. Install Dependencies

```bash
# Install all monorepo dependencies
rush install

# Or install backend-specific dependencies
cd apps/api
npm install
```

### 2. Firebase Configuration

#### Service Account Setup

1. Download service account key from Firebase Console
2. Place in `apps/api/`:
   ```
   traxettle-test-service-account.json    # Local development
   traxettle-staging-service-account.json  # Staging
   traxettle-prod-service-account.json     # Production
   ```

#### Initialize Firebase Admin SDK

The backend automatically initializes Firebase with the service account key based on the environment.

### 3. Environment Configuration

Create `apps/api/.env` (see [Environment Setup](./ENVIRONMENT_SETUP.md)):

```bash
# Firebase Admin SDK
FIREBASE_PROJECT_ID=traxettle-test
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@traxettle-test.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_STORAGE_BUCKET=traxettle-test.firebasestorage.app

# Server
PORT=3001

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=Traxettle <noreply@traxettle.app>

# Web App
APP_URL=http://localhost:3000
MOBILE_APP_SCHEME=com.traxettle.app
```

### 4. Database Setup

#### Firestore Collections

The backend uses these Firestore collections:

```
users/
├── {userId}
│   ├── email
│   ├── name
│   ├── avatar
│   ├── tier (free|pro)
│   ├── createdAt
│   └── updatedAt

events/
├── {eventId}
│   ├── name
│   ├── description
│   ├── type (event|trip)
│   ├── startDate
│   ├── endDate
│   ├── currency
│   ├── settlementCurrency
│   ├── status (active|payment|settled|closed)
│   ├── createdBy
│   ├── participants[]
│   ├── createdAt
│   └── updatedAt

expenses/
├── {expenseId}
│   ├── eventId
│   ├── description
│   ├── amount
│   ├── currency
│   ├── paidBy
│   ├── paidOnBehalfOf
│   ├── splits[]
│   ├── attachments[]
│   ├── createdAt
│   └── updatedAt

groups/
├── {groupId}
│   ├── name
│   ├── description
│   ├── createdBy
│   ├── representative
│   ├── members[]
│   ├── payerUserId
│   ├── eventIds[]
│   ├── createdAt
│   └── updatedAt

settlements/
├── {settlementId}
│   ├── eventId
│   ├── fromUserId
│   ├── toUserId
│   ├── amount
│   ├── currency
│   ├── status (pending|initiated|completed)
│   ├── initiatedAt
│   ├── completedAt
│   ├── paymentMethod
│   ├── paymentId
│   └── createdAt

invitations/
├── {invitationId}
│   ├── eventId
│   ├── inviterId
│   ├── recipientEmail
│   ├── token
│   ├── status (pending|accepted|expired)
│   ├── expiresAt
│   ├── createdAt
│   └── updatedAt
```

#### Security Rules

Apply these Firestore security rules (see [Firebase Setup](./FIREBASE_SETUP.md)):

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Traxettle clients (web/mobile) should NOT talk to Firestore directly.
    // The Traxettle API uses the Firebase Admin SDK and is NOT restricted by rules.
    //
    // Lock down client access to prevent accidental data exposure.

    // Allow a signed-in user to read/write only their own user document subtree.
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    // Everything else is blocked from client access by default.
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

### 5. Email Service Configuration

#### Gmail Setup (Development)

1. Enable 2-factor authentication on your Google account
2. Generate app-specific password:
   - Go to https://myaccount.google.com/apppasswords
   - Select "Mail" on "Device: Other (Custom name)"
   - Enter "Traxettle" as the name
   - Copy the 16-character password

#### SendGrid Setup (Production)

1. Sign up at https://sendgrid.com/
2. Verify your sender domain
3. Create API key
4. Configure environment variables

#### Email Templates

The backend includes these email templates:

1. **Invitation Emails**: Event invitations with accept links
2. **Notification Emails**: Changes to events, expenses, groups
3. **Auth Emails**: Email-based authentication

### 6. WebSocket Configuration

Real-time updates are handled via WebSocket:

```javascript
// WebSocket endpoint: ws://localhost:3001/ws
// Events:
// - event:updated
// - expense:created
// - expense:updated
// - expense:deleted
// - group:created
// - group:updated
// - group:deleted
// - settlement:updated
```

### 7. File Storage Configuration

#### Firebase Storage Rules

Apply these storage security rules:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // Same philosophy as Firestore: prefer API-controlled access.

    // If you ever allow direct client uploads/downloads, confine them to /users/<uid>/...
    match /users/{userId}/{allPaths=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    // Everything else is blocked from client access by default.
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

### 8. API Endpoints

#### Authentication
```
POST /api/auth/google          # Google Sign-In
POST /api/auth/email-link     # Email link auth
GET  /api/auth/me             # Get current user
POST /api/auth/logout         # Logout
```

#### Users
```
GET    /api/users/profile     # Get user profile
PUT    /api/users/profile     # Update user profile
DELETE /api/users/account     # Delete account
```

#### Events
```
GET    /api/events            # List events
POST   /api/events            # Create event
GET    /api/events/:id        # Get event details
PUT    /api/events/:id        # Update event
DELETE /api/events/:id        # Delete event
POST   /api/events/:id/close  # Close event
```

#### Expenses
```
GET    /api/events/:id/expenses     # List expenses
POST   /api/events/:id/expenses     # Create expense
GET    /api/expenses/:id             # Get expense
PUT    /api/expenses/:id             # Update expense
DELETE /api/expenses/:id             # Delete expense
```

#### Groups
```
GET    /api/groups/my        # User's groups
POST   /api/groups            # Create group
GET    /api/groups/:id        # Get group details
PUT    /api/groups/:id        # Update group
DELETE /api/groups/:id        # Delete group
POST   /api/groups/suggest    # Suggest groups
POST   /api/groups/:id/add-to-event  # Add to event
```

#### Settlements
```
GET    /api/events/:id/settlements     # List settlements
POST   /api/events/:id/settle         # Generate settlements
GET    /api/events/:id/balances       # Get balances
POST   /api/settlements/:id/pay       # Initiate payment
POST   /api/settlements/:id/approve   # Approve payment
```

#### Invitations
```
POST   /api/invitations        # Send invitation
GET    /api/invitations/:token # Accept invitation
DELETE /api/invitations/:id    # Delete invitation
```

### 9. Start Development Server

```bash
cd apps/api

# Development mode with hot reload
npm run dev

# Production build
npm run build

# Start production server
npm start

# Run tests
npm test

# Run tests with coverage
npm run test:coverage
```

### 10. API Documentation

The API includes Swagger documentation:

```
Development: http://localhost:3001/api-docs
Staging:    https://traxettle-api-staging-lomxjapdhq-uc.a.run.app/api-docs
Production: https://api.traxettle.app/api-docs
```

### 11. Testing

#### Unit Tests
```bash
cd apps/api
npm test                    # Run all tests
npm run test:watch        # Watch mode
npm run test:coverage     # With coverage
```

#### Integration Tests
```bash
npm run test:integration   # API integration tests
```

#### Manual Testing

Use these tools for API testing:

1. **Postman Collection**: Import from `docs/api-collection.json`
2. **Swagger UI**: Interactive API documentation
3. **curl**: Command line testing

Example curl commands:
```bash
# Health check
curl http://localhost:3001/health

# Get events (requires auth token)
curl -H "Authorization: Bearer <token>" http://localhost:3001/api/events

# Create event
curl -X POST http://localhost:3001/api/events \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"name":"Test Event","type":"event","currency":"USD"}'
```

### 12. Deployment

#### Local Development
```bash
npm run dev
```

#### Staging (Cloud Run)
```bash
# Build and deploy to staging
gcloud builds submit --tag gcr.io/traxettle-staging/traxettle-api
gcloud run deploy traxettle-api --image gcr.io/traxettle-staging/traxettle-api --platform managed
```

#### Production (Cloud Run)
```bash
# Build and deploy to production
gcloud builds submit --tag gcr.io/traxettle-prod/traxettle-api
gcloud run deploy traxettle-api --image gcr.io/traxettle-prod/traxettle-api --platform managed
```

### 13. Monitoring and Logging

#### Application Logs
```bash
# View logs
npm run logs

# View logs in production
gcloud logs read "resource.type=cloud_run_revision" --limit 50
```

#### Error Tracking
- Firebase Crashlytics for error tracking
- Custom error logging in API routes

#### Performance Monitoring
- Firebase Performance Monitoring
- API response time tracking
- Database query optimization

### 14. Security

#### Authentication
- Firebase Auth integration
- JWT token validation
- Session management

#### Data Validation
- Input sanitization
- Request validation with Joi
- SQL injection prevention (NoSQL injection)

#### Rate Limiting
```javascript
// Rate limiting middleware
app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
}));
```

#### CORS Configuration
```javascript
// CORS settings
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));
```

### 15. Troubleshooting

#### Common Issues

1. **Firebase connection failed**:
   - Check service account key
   - Verify project ID
   - Check network connectivity

2. **Email not sending**:
   - Verify SMTP credentials
   - Check app-specific password
   - Test SMTP connection

3. **Database permission denied**:
   - Check security rules
   - Verify user authentication
   - Check collection structure

4. **WebSocket connection failed**:
   - Check firewall settings
   - Verify WebSocket endpoint
   - Check browser compatibility

#### Debug Commands

```bash
# Check environment variables
npm run env:check

# Test Firebase connection
npm run test:firebase

# Test email configuration
npm run test:email

# Test database connection
npm run test:database

# Health check
curl http://localhost:3001/health
```

### 16. Performance Optimization

#### Database Optimization
- Use composite indexes
- Optimize query patterns
- Implement pagination
- Cache frequently accessed data

#### API Optimization
- Implement response caching
- Use compression middleware
- Optimize bundle size
- Implement request batching

#### Memory Management
- Monitor memory usage
- Implement connection pooling
- Optimize garbage collection
- Use streaming for large responses

## Verification

Test your backend setup:

```bash
# 1. Check dependencies
cd apps/api && npm list

# 2. Test environment
npm run env:check

# 3. Start server
npm run dev

# 4. Test API
curl http://localhost:3001/health

# 5. Run tests
npm test

# 6. Check documentation
open http://localhost:3001/api-docs
```

## Next Steps

After backend setup:
1. Configure [Firebase](./FIREBASE_SETUP.md)
2. Set up [Email Service](../SETUP.md#email-setup)
3. Deploy to [Staging](#deployment)
4. Configure [Monitoring](#monitoring-and-logging)
