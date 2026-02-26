# Traxettle - Expense Splitting Application Design Document

## 1. System Overview

Traxettle is a comprehensive expense splitting application that supports both web (React/Next.js) and mobile (React Native) platforms. The application enables users to create events/trips, invite participants, track expenses, and settle payments efficiently using a greedy algorithm for optimal settlement.

## 2. Technology Stack

### Frontend
- **Web**: React 19+ with Next.js 16+, TypeScript
- **Mobile**: React Native with TypeScript, Expo
- **State Management**: React Context + hooks (Phase 1), Redux Toolkit + RTK Query (Phase 2+)
- **UI Components**: styled-components + @traxettle/ui shared library (Web & Mobile)
- **Icons**: Lucide React

### Backend
- **API**: Node.js with Express/Fastify + TypeScript
- **Database**: Firebase Firestore (NoSQL) + Firebase Authentication
- **Real-time**: Firebase Realtime Database for live updates
- **File Storage**: Firebase Storage
- **Notifications**: Firebase Cloud Messaging (FCM)
- **Payments**: Stripe/Razorpay integration

### DevOps & Infrastructure
- **Monorepo**: Rush.js (v5) for managing multiple packages
- **Package Management**: pnpm via Rush
- **CI/CD**: GitHub Actions
- **Environment**: Firebase Hosting (Web), App Store/Play Store (Mobile)
- **Monorepo Structure**:
  - `apps/web` — Next.js web application (@traxettle/web)
  - `apps/api` — Express API backend (@traxettle/api)
  - `apps/mobile` — React Native/Expo mobile app (@traxettle/mobile)
  - `libraries/shared` — Shared types and utilities (@traxettle/shared)
  - `libraries/ui` — Shared UI components, theme, and toast system (@traxettle/ui)

## 2.1 Technology Recommendations

### 2.1.1 Node.js vs Java for Backend

**Node.js Recommended - Key Reasons:**

1. **Unified Language Stack**: TypeScript across frontend and backend reduces context switching, enables code sharing, and simplifies hiring/training

2. **Firebase Integration**: 
   - Superior Firebase Admin SDK support
   - Native real-time capabilities with WebSocket
   - Better handling of Firebase's JSON-like data structures

3. **Rapid Development**:
   - Faster prototyping and iteration cycles
   - Rich ecosystem for expense/payment processing
   - Hot reloading during development

4. **Cost Efficiency**:
   - Lower server costs for startup phase
   - Serverless deployment options (Firebase Functions)
   - Better resource utilization for I/O-bound operations

5. **Real-time Features**:
   - Native support for WebSockets
   - Event-driven architecture perfect for live expense updates
   - Better handling of concurrent user operations

**Java Considerations (Why Not Chosen):**
- Higher infrastructure costs
- Slower development cycles
- More complex Firebase integration
- Over-engineering for current requirements

### 2.1.2 NoSQL (Firestore) vs SQL Database

**Firestore (NoSQL) Recommended - Key Reasons:**

1. **Real-time Synchronization**:
   - Native real-time listeners across web/mobile
   - Automatic offline data synchronization
   - Instant updates when expenses are added/settled

2. **Flexible Schema**:
   - Expense structures vary greatly (attachments, custom splits)
   - Easy evolution of data model as features grow
   - No complex migrations required

3. **Mobile-First Architecture**:
   - Built-in offline support for mobile apps
   - Efficient data synchronization for poor connectivity
   - Local caching capabilities

4. **Scalability & Performance**:
   - Horizontal scaling built-in
   - Geographic distribution for global users
   - Pay-as-you-go pricing model

5. **Firebase Ecosystem Integration**:
   - Seamless auth integration
   - Unified security rules
   - Built-in file storage for expense receipts
   - Push notifications through FCM

**SQL Considerations (Why Not Chosen):**
- Complex real-time sync implementation required
- Higher operational overhead
- Less flexible for evolving expense models
- Additional integration complexity with Firebase services

## 3. System Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Web App       │    │  Mobile App     │    │   Admin Panel   │
│  (Next.js)      │    │ (React Native)  │    │  (Next.js)      │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │
                    ┌─────────────▼─────────────┐
                    │      API Gateway          │
                    │   (Express/Fastify)       │
                    └─────────────┬─────────────┘
                                 │
          ┌──────────────────────┼──────────────────────┐
          │                      │                      │
    ┌─────▼──────┐       ┌───────▼───────┐      ┌──────▼──────┐
    │   Auth     │       │   Business   │      │ Payment     │
    │ Service    │       │   Logic      │      │ Gateway     │
    └─────┬──────┘       └───────┬───────┘      └──────┬──────┘
          │                      │                     │
          └──────────────────────┼─────────────────────┘
                                 │
                    ┌─────────────▼─────────────┐
                    │     Firebase Services     │
                    │  (Firestore, Auth, FCM)   │
                    └───────────────────────────┘
```

## 4. Module Design

### 4.1 Frontend Components

#### 4.1.1 Web Application (packages/web)

**Authentication Components:**
- `LoginForm`: Phone/Email login with OTP
- `OAuthButtons`: Google/Microsoft sign-in
- `UserProfile`: Profile management and preferences
- `ProtectedRoute`: Authentication guard components

**Event Management Components:**
- `EventList`: Dashboard showing user's events
- `EventCard`: Event preview card
- `CreateEventForm`: Event creation wizard
- `EventDetails`: Complete event information
- `ParticipantManager`: Add/remove participants
- `GroupManager`: Create and manage groups

**Expense Management Components:**
- `ExpenseList`: List of expenses with filters
- `ExpenseCard`: Individual expense display
- `AddExpenseForm`: Expense creation with split options
- `ExpenseSplitEditor`: Visual split configuration
- `ExpenseAttachments`: Receipt upload and display
- `PrivateExpenseToggle`: Privacy controls

**Settlement Components:**
- `BalanceOverview`: Current balances display
- `SettlementPreview`: Proposed settlement plan
- `PaymentButton**: Initiate payment flow
- `SettlementHistory**: Past settlements
- `PaymentMethodSelector**: UPI/Card/Wallet options

**Group Management Components:**
- `GroupCard`: Group display with members
- `CreateGroupForm`: Group creation
- `MemberSelector`: User selection for groups
- `PayerSelector`: Group payer assignment
- `GroupExpenses`: Group-specific expense view

**Notification Components:**
- `NotificationCenter`: Central notification hub
- `NotificationItem`: Individual notification
- `NotificationSettings`: Preference management
- `RealtimeUpdates**: Live expense updates

**Dashboard Components:**
- `SummaryCards`: Event/expense statistics
- `QuickActions`: Common action buttons
- `RecentActivity`: Latest updates
- `Charts`: Expense analytics

#### 4.1.2 Mobile Application (packages/mobile)

**Shared Components:**
- `Button`: Consistent button styling
- `Input`: Form input components
- `Card`: Reusable card layout
- `Modal**: Modal dialogs
- `Loading`: Loading states
- `ErrorBoundary`: Error handling

**Navigation Components:**
- `AppNavigator`: Main navigation stack
- `AuthNavigator`: Authentication flow
- `TabNavigator`: Bottom tab navigation
- `Header`: Custom headers

**Native Feature Components:**
- `CameraPicker`: Receipt photo capture
- `ContactSelector`: Phone contact integration
- `PushNotificationHandler`: Notification management
- `OfflineIndicator`: Connection status
- `BiometricAuth`: Fingerprint/Face ID

**Platform-Specific Components:**
- `UPIPayment`: India-specific UPI integration
- `ShareButton**: Native sharing capabilities
- `DeepLinkHandler**: URL scheme handling

### 4.2 Backend Modules

#### 4.2.1 API Services (packages/api)

**Authentication Service:**
```typescript
// services/auth.service.ts
class AuthService {
  signInWithPhone(phoneNumber: string): Promise<string>
  verifyOTP(otp: string): Promise<User>
  signInWithGoogle(token: string): Promise<User>
  signInWithMicrosoft(token: string): Promise<User>
  refreshToken(refreshToken: string): Promise<TokenPair>
  logout(userId: string): Promise<void>
}
```

**User Service:**
```typescript
// services/user.service.ts
class UserService {
  createProfile(userData: UserProfile): Promise<User>
  updateProfile(userId: string, data: Partial<User>): Promise<User>
  getPreferences(userId: string): Promise<Preferences>
  updatePreferences(userId: string, prefs: Partial<Preferences>): Promise<void>
  searchUsers(query: string): Promise<User[]>
}
```

**Event Service:**
```typescript
// services/event.service.ts
class EventService {
  createEvent(eventData: CreateEventDto): Promise<Event>
  getEvent(eventId: string): Promise<Event>
  updateEvent(eventId: string, data: Partial<Event>): Promise<Event>
  deleteEvent(eventId: string): Promise<void>
  addParticipants(eventId: string, participants: ParticipantDto[]): Promise<void>
  removeParticipant(eventId: string, userId: string): Promise<void>
  validateEventMembership(eventId: string, userId: string): Promise<boolean>
}
```

**Group Service:**
```typescript
// services/group.service.ts
class GroupService {
  createGroup(groupData: CreateGroupDto): Promise<Group>
  updateGroup(groupId: string, data: Partial<Group>): Promise<Group>
  addMembers(groupId: string, userIds: string[]): Promise<void>
  removeMember(groupId: string, userId: string): Promise<void>
  assignPayer(groupId: string, payerUserId: string): Promise<void>
  validateGroupMembership(eventId: string, userId: string): Promise<Group | null>
}
```

**Expense Service:**
```typescript
// services/expense.service.ts
class ExpenseService {
  createExpense(expenseData: CreateExpenseDto): Promise<Expense>
  updateExpense(expenseId: string, userId: string, data: UpdateExpenseDto, isAdmin?: boolean): Promise<Expense>
  deleteExpense(expenseId: string, userId: string, isAdmin?: boolean): Promise<boolean>
  getEventExpenses(eventId: string): Promise<Expense[]>
  getExpense(expenseId: string): Promise<Expense | null>
  calculateEqualSplits(amount: number, entityIds: string[]): ExpenseSplit[]
  calculateRatioSplits(amount: number, entries: RatioEntry[]): ExpenseSplit[]
  getEventBalances(eventId: string): Promise<Balance[]>
}
```

**Settlement Service:**
```typescript
// services/settlement.service.ts
class SettlementService {
  calculateEntityBalances(eventId: string): Promise<EntityBalance[]>
  calculateSettlementPlan(balances: EntityBalance[], eventId: string, currency: string): SettlementPlan
  generateSettlement(eventId: string, userId: string): Promise<SettlementPlan> // admin-only; sets event to 'payment' (or 'settled' if no payments needed)
  initiatePayment(settlementId: string, userId: string): Promise<Settlement> // payer-only; mock payment; sets to 'initiated'
  approvePayment(settlementId: string, userId: string): Promise<{ settlement: Settlement; allComplete: boolean }> // payee-only; auto-settles event when all complete
  getEventSettlements(eventId: string): Promise<Settlement[]>
  getPendingSettlementTotal(eventId: string): Promise<number>
}

// Greedy algorithm minimizes number of transactions
// Groups treated as single entities in balance calculation
// Private expenses excluded from settlement
```

**Notification Service:**
```typescript
// services/notification.service.ts
class NotificationService {
  sendPushNotification(userId: string, notification: NotificationData): Promise<void>
  sendEmailNotification(userId: string, template: string, data: any): Promise<void>
  markNotificationRead(notificationId: string): Promise<void>
  getNotifications(userId: string): Promise<Notification[]>
  unsubscribeFromNotifications(userId: string, type: string): Promise<void>
}
```

**Payment Service:**
```typescript
// services/payment.service.ts
class PaymentService {
  createPaymentIntent(settlementId: string, amount: number, currency: string): Promise<PaymentIntent>
  processUPIPayment(paymentData: UPIData): Promise<PaymentResult>
  processCardPayment(paymentData: CardData): Promise<PaymentResult>
  refundPayment(paymentId: string): Promise<RefundResult>
  getPaymentMethods(userId: string): Promise<PaymentMethod[]>
}
```

#### 4.2.2 Shared Libraries (packages/shared)

**Types Module:**
```typescript
// types/index.ts
export interface User { /* ... */ }
export interface Event { /* ... */ }
export interface Group { /* ... */ }
export interface Expense { /* ... */ }
export interface Settlement { /* ... */ }
export interface Notification { /* ... */ }
export enum UserRole { ADMIN, MEMBER }
export enum ExpenseType { SHARED, PRIVATE }
export enum SettlementStatus { PENDING, COMPLETED, FAILED }
```

**Utils Module:**
```typescript
// utils/index.ts
export const currencyConverter = { /* ... */ }
export const settlementCalculator = { /* ... */ }
export const validationHelpers = { /* ... */ }
export const formatters = { /* ... */ }
export const constants = { /* ... */ }
```

**Validation Module:**
```typescript
// validation/schemas.ts
export const eventSchema = { /* ... */ }
export const expenseSchema = { /* ... */ }
export const userSchema = { /* ... */ }
export const groupSchema = { /* ... */ }
```

### 4.3 Database Components

#### 4.3.1 Firestore Collections

**User Management:**
```typescript
// collections/users.ts
export const usersCollection = {
  create: (userData: CreateUserDto) => firestore.collection('users').add(userData),
  getById: (userId: string) => firestore.collection('users').doc(userId).get(),
  update: (userId: string, data: Partial<User>) => firestore.collection('users').doc(userId).update(data),
  delete: (userId: string) => firestore.collection('users').doc(userId).delete(),
  search: (query: string) => firestore.collection('users').where('displayName', '>=', query).get()
}
```

**Event Management:**
```typescript
// collections/events.ts
export const eventsCollection = {
  create: (eventData: CreateEventDto) => firestore.collection('events').add(eventData),
  getById: (eventId: string) => firestore.collection('events').doc(eventId).get(),
  update: (eventId: string, data: Partial<Event>) => firestore.collection('events').doc(eventId).update(data),
  getParticipants: (eventId: string) => firestore.collection('events').doc(eventId).collection('participants').get(),
  addParticipant: (eventId: string, participant: EventParticipant) => firestore.collection('events').doc(eventId).collection('participants').add(participant)
}
```

**Expense Management:**
```typescript
// collections/expenses.ts
export const expensesCollection = {
  create: (expenseData: CreateExpenseDto) => firestore.collection('expenses').add(expenseData),
  getByEventId: (eventId: string) => firestore.collection('expenses').where('eventId', '==', eventId).get(),
  update: (expenseId: string, data: Partial<Expense>) => firestore.collection('expenses').doc(expenseId).update(data),
  delete: (expenseId: string) => firestore.collection('expenses').doc(expenseId).delete(),
  getPrivateExpenses: (userId: string) => firestore.collection('expenses').where('paidBy', '==', userId).where('isPrivate', '==', true).get()
}
```

**Real-time Listeners:**
```typescript
// realtime/listeners.ts
export const realtimeListeners = {
  onExpenseUpdate: (eventId: string, callback: (expenses: Expense[]) => void) => 
    firestore.collection('expenses').where('eventId', '==', eventId).onSnapshot(callback),
  onSettlementUpdate: (eventId: string, callback: (settlements: Settlement[]) => void) =>
    firestore.collection('settlements').where('eventId', '==', eventId).onSnapshot(callback),
  onNotificationUpdate: (userId: string, callback: (notifications: Notification[]) => void) =>
    firestore.collection('notifications').where('userId', '==', userId).onSnapshot(callback)
}
```

**Security Rules:**
```typescript
// firestore.rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    match /events/{eventId} {
      allow read: if isParticipant(eventId);
      allow write: if isAdmin(eventId);
      
      match /participants/{participantId} {
        allow read, write: if isAdmin(eventId);
      }
    }
    
    match /expenses/{expenseId} {
      allow read: if isParticipantInExpense(expenseId);
      allow write: if isExpenseCreator(expenseId) || isAdmin(getExpenseEvent(expenseId));
    }
    
    function isParticipant(eventId) {
      return exists(/databases/$(database)/documents/events/$(eventId)/participants/$(request.auth.uid));
    }
    
    function isAdmin(eventId) {
      return get(/databases/$(database)/documents/events/$(eventId)).data.admins.includes(request.auth.uid);
    }
  }
}
```

## 5. Database Design

### 5.1 Recommended Database: Firebase Firestore (NoSQL)

**Why Firestore:**
- Real-time synchronization across devices
- Offline-first capabilities
- Scalable and serverless
- Built-in security rules
- Seamless integration with Firebase Auth
- Geographic distribution

### 5.2 Collection Structure

```typescript
// Users Collection
interface User {
  id: string;
  email: string;
  phoneNumber: string;
  displayName: string;
  photoURL?: string;
  authProviders: ('google' | 'microsoft' | 'phone')[];
  preferences: {
    notifications: boolean;
    currency: string;
    timezone: string;
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Events Collection
interface Event {
  id: string;
  name: string;
  description?: string;
  type: 'trip' | 'event';
  startDate: Timestamp;
  endDate?: Timestamp;
  currency: string;
  status: 'active' | 'payment' | 'settled' | 'closed'; // Active → Payment (settlement generated) → Settled (all payments confirmed) → Closed (admin action)
  createdBy: string; // User ID
  admins: string[]; // User IDs
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
// Event lifecycle rules:
// - Active: all operations allowed
// - Payment: all mutations blocked; only pay/approve settlement transactions allowed
// - Settled: only status→closed allowed (admin); all other mutations blocked
// - Closed: all mutations blocked; event hidden from dashboard

// Event Participants Subcollection
interface EventParticipant {
  userId: string;
  groupId?: string; // If user is in a group
  role: 'admin' | 'member';
  joinedAt: Timestamp;
  invitedBy: string;
  status: 'pending' | 'accepted' | 'declined';
}

// Groups Collection
interface Group {
  id: string;
  eventId: string; // Primary event
  eventIds: string[]; // All events this group is part of (reusability)
  name: string;
  description?: string;
  createdBy: string;
  members: string[]; // User IDs
  payerUserId: string; // Designated payer for group settlements
  representative: string; // Group representative (first member by default)
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Expenses Collection
interface Expense {
  id: string;
  eventId: string;
  title: string;
  description?: string;
  amount: number;
  currency: string;
  paidBy: string; // User ID who paid
  paidOnBehalfOf?: string; // Group ID if paid on behalf of group
  isPrivate: boolean;
  splitType: 'equal' | 'ratio' | 'custom';
  splits: ExpenseSplit[];
  attachments: string[]; // File URLs
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

interface ExpenseSplit {
  entityType: 'user' | 'group';
  entityId: string; // User ID or Group ID
  amount: number;
  ratio?: number; // For ratio-based splits
}

// Settlements Collection
interface Settlement {
  id: string;
  eventId: string;
  fromEntityId: string; // User ID or Group ID
  fromEntityType: 'user' | 'group';
  toEntityId: string; // User ID or Group ID
  toEntityType: 'user' | 'group';
  amount: number;
  currency: string;
  status: 'pending' | 'initiated' | 'completed';
  paymentMethod?: string;
  paymentId?: string;
  createdAt: Timestamp;
  completedAt?: Timestamp;
}

// Notifications Collection
interface Notification {
  id: string;
  userId: string;
  type: 'expense_added' | 'expense_updated' | 'expense_deleted' | 'settlement_requested' | 'settlement_calculated' | 'event_closed' | 'event_deleted' | 'group_deleted' | 'invitation';
  title: string;
  message: string;
  data?: Record<string, any>;
  read: boolean;
  createdAt: Timestamp;
}
```

## 6. Use Cases

### 6.1 Primary Use Cases

#### UC-001: User Registration & Authentication
- **Actor**: New User
- **Preconditions**: None
- **Flow**:
  1. User selects authentication method (Phone/Google/Microsoft)
  2. Complete OAuth/OTP verification
  3. Create user profile with basic information
  4. Set preferences (currency, notifications)
- **Postconditions**: User is authenticated and profile created

#### UC-002: Event/Trip Creation
- **Actor**: Authenticated User
- **Preconditions**: User is logged in
- **Flow**:
  1. User selects "Create Event/Trip"
  2. Enter event details (name, dates, type)
  3. Set default currency
  4. Create groups and assign users to groups (optional)
  5. Add participants (individual users or groups)
  6. **Validation**: Ensure each user is either individual or in exactly one group, not both
  7. Send invitations
- **Postconditions**: Event created with user as admin, groups established

#### UC-003: Group Management
- **Actor**: Event Admin
- **Preconditions**: User is event admin
- **Flow**:
  1. Admin selects "Manage Groups"
  2. Create new group with name and description
  3. Add users to group (from event participants)
  4. Assign group payer (one group member)
  5. **Validation**: Ensure no user is in multiple groups or also individual
  6. Save group configuration
- **Postconditions**: Group created with validated membership

#### UC-004: Expense Management
- **Actor**: Event Participant
- **Preconditions**: User is event member
- **Flow**:
  1. User selects "Add Expense"
  2. Enter expense details
  3. Choose split type (equal/ratio/custom)
  4. **Group Member Logic**: 
     - If user is in a group, expense is created on behalf of the group
     - User cannot split expense with their own group members
     - Expense is split with other groups and individual users only
  5. Select participants for split (other groups and/or individual users)
  6. Mark as private if needed (private to group or individual)
  7. Save expense
- **Postconditions**: Expense recorded and notifications sent

#### UC-005: Settlement Calculation
- **Actor**: Event Admin
- **Preconditions**: Event has expenses
- **Flow**:
  1. Admin initiates settlement
  2. **Entity Validation**: Ensure all users are either individual or in groups (not both)
  3. System calculates net balances using greedy algorithm
  4. **Group Settlement**: Group members settle internally, group settles externally as one entity
  5. Generate settlement plan with minimum transactions
  6. Present settlement overview
  7. Confirm and create settlement records
- **Postconditions**: Settlement plan created

#### UC-006: Payment Processing
- **Actor**: User who owes money
- **Preconditions**: Settlement exists
- **Flow**:
  1. User views pending settlements
  2. **Group Payment**: If user is group member, only group payer can initiate external payments
  3. Clicks "Pay Now" for specific settlement
  4. Select payment method (UPI/Card/Wallet)
  5. Redirect to payment gateway
  6. Complete payment
  7. System updates settlement status
- **Postconditions**: Payment completed and recorded

### 6.2 Edge Cases

#### EC-001: Private Expense Visibility
- Private expenses only visible to creator and group members
- Not included in final settlement calculations
- Group admins can view group private expenses

#### EC-002: Currency Conversion
- Support for multiple currencies in same event
- Real-time exchange rate conversion
- Settlement in event's default currency

#### EC-003: Partial Payments
- Users can make partial payments
- System tracks remaining balance
- Multiple payment methods allowed

#### EC-004: Event Closure Validation
- Prevent closure if pending settlements exist
- Admin approval required for closure
- Archive closed events with read-only access

#### EC-006: Group Membership Validation
- Users cannot be both individual and group members in same event
- Users cannot be in multiple groups within same event
- System validates membership during event creation and group management
- Prevents conflicting expense creation and settlement scenarios

#### EC-007: Group Expense Creation
- Group members can only create expenses on behalf of their group
- Expenses cannot be split with creator's own group members
- Expense creator chooses which other groups/individuals to split with
- Ensures clear financial boundaries between entities

## 7. Settlement Algorithm

### 7.1 Greedy Algorithm Implementation

```typescript
interface Balance {
  entityId: string; // User ID or Group ID
  entityType: 'user' | 'group';
  amount: number; // Positive = owed, Negative = to receive
}

function calculateSettlement(balances: Balance[]): Settlement[] {
  const creditors: Balance[] = [];
  const debtors: Balance[] = [];
  
  // Separate creditors and debtors
  balances.forEach(balance => {
    if (balance.amount > 0) {
      debtors.push(balance);
    } else if (balance.amount < 0) {
      creditors.push({ ...balance, amount: Math.abs(balance.amount) });
    }
  });
  
  const settlements: Settlement[] = [];
  let i = 0, j = 0;
  
  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    
    const settlementAmount = Math.min(debtor.amount, creditor.amount);
    
    settlements.push({
      fromEntityId: debtor.entityId,
      fromEntityType: debtor.entityType,
      toEntityId: creditor.entityId,
      toEntityType: creditor.entityType,
      amount: settlementAmount
    });
    
    debtor.amount -= settlementAmount;
    creditor.amount -= settlementAmount;
    
    if (debtor.amount === 0) i++;
    if (creditor.amount === 0) j++;
  }
  
  return settlements;
}
```

## 8. Sample Settlement Example

### Scenario: Goa Trip Event

**Participants:**
- Alice (Event Creator, Admin)
- Bob (Individual)
- Family Group (Charlie + Dana + Eve) - Payer: Charlie

**Expenses:**
1. Hotel Booking: $300 (paid by Alice, split equally among Alice, Bob, and Family Group - $100 each)
2. Dinner: $150 (paid by Bob, split equally among Alice, Bob, and Family Group - $50 each)
3. Taxi: $60 (paid by Charlie, private to Family Group)
4. Sightseeing: $200 (paid by Alice, split equally among Alice, Bob, and Family Group - ~$66.67 each)

### Calculations:

**Individual Balances:**
- Alice: Paid $500, Owes $216.67 → Net: +$283.33 (to receive)
- Bob: Paid $150, Owes $116.67 → Net: +$33.33 (to receive)

**Group Balance (Family Group):**
- Total Owed: $216.67 (Hotel $100 + Dinner $50 + Sightseeing $66.67)
- Total Paid: $60 (Charlie's taxi, private - not included in settlement)
- Net: -$216.67 (group owes $216.67)

**Final Settlement Plan:**
Since Family Group owes $216.67 total and Alice + Bob are owed $316.66 total:
1. Family Group (Charlie as payer) pays Alice $216.67
2. Bob receives nothing directly (his small net is covered by Alice's larger credit)

**Optimized Settlement:**
1. Charlie pays Alice $216.67 (on behalf of Family Group)
2. Internal group settlement: Dana and Eve pay Charlie their shares (~$72.22 each) if needed

Total external transactions: 1 (minimum possible)

## 9. Authentication & Registration Process

### 9.1 Registration Flow

```
┌─────────────────┐
│   Welcome       │
│   Screen        │
└─────────┬───────┘
          │
    ┌─────▼─────┐
    │ Choose    │
    │ Auth      │
    │ Method    │
    └─────┬─────┘
          │
    ┌─────▼─────┐
    │ OAuth/OTP │
    │ Verification│
    └─────┬─────┘
          │
    ┌─────▼─────┐
    │ Profile   │
    │ Setup     │
    └─────┬─────┘
          │
    ┌─────▼─────┐
    │ Preferences│
    │ Configuration│
    └─────┬─────┘
          │
    ┌─────▼─────┐
    │ Dashboard │
    └───────────┘
```

### 9.2 Authentication Methods

1. **Phone Number**: SMS OTP verification
2. **Google OAuth**: Google Sign-In with Firebase
3. **Microsoft OAuth**: Microsoft Account integration
4. **Multi-provider**: Link multiple auth methods to one account

### 9.3 Security Measures

- JWT tokens with refresh mechanism
- Firebase Security Rules for data access
- Rate limiting on authentication endpoints
- Device tracking and session management
- Two-factor authentication option

## 10. Backend Technology Recommendation

### Recommended: Node.js with TypeScript

**Advantages:**
- **Unified Language**: TypeScript across frontend and backend
- **Firebase Integration**: Excellent Firebase Admin SDK support
- **Real-time Features**: Native WebSocket support
- **Rapid Development**: Faster iteration and prototyping
- **Community**: Large ecosystem and community support
- **Performance**: Sufficient for this use case
- **Cost-effective**: Lower hosting costs compared to Java

**Architecture:**
- **Framework**: Express.js
- **Validation**: Zod
- **Database**: Firebase Firestore (direct SDK, no ORM)
- **Testing**: Jest + Supertest
- **Documentation**: Swagger/OpenAPI

## 11. Phase-wise Development Plan

### Phase 1: Foundation (4-6 weeks) ✅ COMPLETED
- **Week 1-2**: Project setup with Rush monorepo, shared UI library (@traxettle/ui) with styled-components theme system
- **Week 3-4**: Basic authentication system (Google OAuth via Firebase, phone OTP mock, email/password mock)
- **Week 5-6**: User profile management (GET/PUT /api/users/profile, /profile page)
- **Deliverables**: Login/registration, user profiles, theme system, toast notifications
- **Tech decisions**: styled-components (not Tailwind), pnpm via Rush (not npm), Firebase Auth + Firestore

### Phase 2: Core Features (6-8 weeks) ✅ COMPLETED
- **Week 1-2**: Event CRUD (create, read, update, delete), dashboard page, event detail page with tabbed UI
- **Week 3-4**: Expense tracking with equal/ratio/custom splitting, entity selection (groups + individuals), private expenses
- **Week 5-6**: Group management (create, update, delete, add/remove members, representative, reusability, suggestions)
- **Week 7-8**: Invitation system (email/phone/userId, accept/decline/revoke, token-based links, group assignment)
- **Deliverables**: Complete event and expense management, 332 tests, 31 E2E tests, 48 regression tests
- **Key files**: Event detail page, expense create page, group/invitation routes, Playwright E2E suite

### Phase 3: Advanced Features (6-8 weeks) ✅ COMPLETED
- **Week 1-2**: Settlement algorithm (greedy, entity-level balances, admin-only generation)
- **Week 3-4**: Group-as-entity splitting, group reusability across events, group suggestions (70% overlap)
- **Week 5-6**: WebSocket real-time updates (Socket.IO), granular event handlers, email notifications (Nodemailer SMTP + mock mode)
- **Week 7-8**: UI/UX overhaul (5 themes, semantic colors, shadows, radii, responsive shell, skeleton loading, gradient accents)
- **Deliverables**: Settlement service, WebSocket infrastructure, email service, professional UI
- **Key files**: settlement.service.ts, websocket.ts, email.service.ts, ThemeProvider.tsx, WebAppShell.tsx

### Phase 3.5: Expense Management Refinement ✅ COMPLETED
- **Ratio split fix**: Fixed `useEffect` dependency array so ratio changes trigger recalculation
- **Split validation**: Sum of splits must equal total expense; submit disabled with mismatch error message
- **Expense editing**: Dedicated edit page with pre-populated form; accessible to creator or event admin
- **Admin permissions**: Event admins can edit/delete any expense (not just the payer)
- **Event lifecycle**: Active → Settled → Closed; backend guards (`requireActiveEvent`) block all mutations on settled/closed events
- **Event lock UI**: All mutating buttons hidden when event is not active; "Close Event" button for admins on settled events
- **Dashboard filtering**: Closed events hidden from all users' dashboards
- **Deliverables**: 362 tests across 14 suites, 92.7% statement / 80.3% branch coverage
- **Key files**: event-guards.ts, expense edit page, event detail page (conditional rendering), dashboard page (filter)

### Phase 4: Settlement Flow Overhaul ✅ COMPLETED
- **Multi-stage settlement**: Active → Payment → Settled → Closed lifecycle; settlement generation enters Payment mode
- **Payment initiation**: `POST /api/settlements/:id/pay` — payer-only mock payment; sets transaction to `initiated`
- **Payment approval**: `POST /api/settlements/:id/approve` — payee-only confirmation; sets transaction to `completed`
- **Auto-settle**: When all transactions are confirmed, event auto-transitions from `payment` to `settled`
- **Event locking**: Payment/settled/closed events block all mutations; error messages indicate reason
- **Group payer resolution**: `fromUserId`/`toUserId` on Settlement resolve group entities to their designated payer
- **Settlement summary UI**: Professional card-based layout with progress bar, per-transaction status dots, Pay/Confirm Receipt buttons
- **Real-time updates**: `settlement:updated` WebSocket event for granular transaction status changes
- **Edge case**: No payments needed (all balanced) → event goes directly to `settled`; admin can close immediately
- **Deliverables**: 375 tests across 14 suites, 92.5% statement / 80.7% branch coverage
- **Key files**: settlement.service.ts (initiatePayment, approvePayment), settlements.ts routes, event-guards.ts, shared/index.ts (Settlement type), event detail page (settlement summary UI)

### Phase 4.5: UX Polish ✅ COMPLETED
- **Confirmation modals**: Replaced all 5 browser `confirm()` dialogs with themed `<Modal>` components using danger/warning variants (settle, close event, delete group, remove participant, delete expense)
- **No browser dialogs**: Zero `window.alert()`, `window.confirm()`, or `window.prompt()` calls anywhere in the frontend; all user feedback via toast notifications and modals
- **Consistent badge colors**: Unified `statusBadgeVariant()` across Dashboard tiles and Event detail page — `active`=success (green), `payment`=info (blue), `settled`=warning (amber)
- **Real-time dashboard**: Added `useMultiEventSocket` hook that subscribes to all visible event rooms; dashboard tiles update status in-place when events transition (e.g., `active` → `payment` → `settled`); closed events removed automatically; deleted events removed automatically
- **Backend emit**: Settlement generation route now emits `event:updated` with new status so dashboard picks up `payment`/`settled` transitions immediately
- **Deliverables**: 375 tests across 14 suites (unchanged); zero new backend logic, purely frontend UX + one backend WebSocket emit
- **Key files**: event detail page (confirmModal state, 5 handler refactors, generic Modal JSX), dashboard page (statusBadgeVariant fix, useMultiEventSocket subscription), useSocket.ts (useMultiEventSocket hook), settlements.ts route (event:updated emit on generate)

### Phase 5: Mobile App & Advanced Features (8-10 weeks)
- **Week 1-3**: React Native setup and navigation, core features porting
- **Week 4-6**: Real payment gateway integration (Stripe/Razorpay), replace mock payments
- **Week 7-8**: Native features (camera for receipts, contacts for invites)
- **Week 9-10**: Advanced analytics, multi-currency, CI/CD pipeline
- **Deliverables**: Fully functional mobile app, payment processing, production deployment

### Phase 6: Polish & Launch (4-6 weeks)
- **Week 1-2**: Closed events archive section, expense categories/tags
- **Week 3-4**: Performance optimization, accessibility (WCAG)
- **Week 5-6**: Deployment, monitoring, documentation
- **Deliverables**: Production-ready application

## 12. Risk Assessment & Mitigation

### Technical Risks
- **Firebase Costs**: Monitor usage, implement caching
- **Real-time Complexity**: Start simple, add features gradually
- **Payment Integration**: Use reliable providers, handle failures gracefully

### Business Risks
- **User Adoption**: Focus on UX, provide tutorials
- **Competition**: Differentiate with unique features
- **Scaling**: Design for scale from the beginning

## 13. Success Metrics

- **User Engagement**: Daily active users, expense creation rate
- **Settlement Efficiency**: Average transactions per settlement
- **User Satisfaction**: App store ratings, feedback scores
- **Technical Performance**: API response times, uptime

---

This design document provides a comprehensive foundation for building the Traxettle expense splitting application. The modular approach ensures maintainability, while the phased development plan allows for iterative improvement and early user feedback.

## 16. Free/Pro Entitlement Architecture (2026 Update)

### 16.1 Tier Model
- Tier values: `free`, `pro`
- Entitlement lifecycle: `active`, `grace_period`, `billing_retry`, `expired`, `revoked`
- Entitlement source: `revenuecat`, `manual_override`, `system`

### 16.2 Capability Model
- Capabilities are derived server-side from entitlement state.
- Current capability:
  - `multiCurrencySettlement` (Pro-only when entitlement is active/grace)

### 16.3 Enforcement Boundaries
- API is source of truth for all entitlement checks.
- Existing Free event cap (3 active/closed events) remains unchanged.
- FX/multi-currency fields are denied server-side for Free users.

### 16.4 Environment Matrix
- Local:
  - Tier switch enabled on Mobile + Web
  - Payments mocked by default
- Staging/Internal/TestFlight:
  - Tier switch enabled on Mobile only (internal testers)
  - Web read-only for tier switching
  - Payments mocked by default
  - Real Razorpay/Stripe allowed only by explicit policy flags + tester authorization
- Production:
  - No manual tier switching
  - RevenueCat webhook lifecycle drives entitlements

### 16.5 Real-time Propagation
- API emits websocket event `user:tier-updated` on entitlement changes.
- Active web sessions re-fetch profile and update capability-driven UI.

### 16.6 RevenueCat Integration
- RevenueCat webhook endpoint updates entitlement state idempotently.
- Replay-safe event handling stores processed webhook IDs.
- Runbook/scripts:
  - `traxettle-rush/docs/REVENUECAT_INTEGRATION_RUNBOOK.md`
  - `traxettle-rush/scripts/revenuecat/bootstrap.sh`
  - `traxettle-rush/scripts/revenuecat/check-config.sh`
  - `traxettle-rush/scripts/revenuecat/smoke-webhook.sh`
