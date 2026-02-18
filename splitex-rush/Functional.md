# Splitex — Functional Guide

This document tracks all functionalities of the Splitex application. It is kept up-to-date as features are implemented.

**Status Legend:**

| Icon | Meaning |
|------|---------|
| ✅ | **Supported** — Fully implemented and tested |
| 🚧 | **In Progress** — Partially implemented or under active development |
| ❌ | **Not Currently Supported** — Planned but not yet implemented |

---

## 1. Authentication & User Management

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 1.1 | Phone OTP sign-in | ✅ Supported | Send OTP → verify → receive JWT tokens. Mock OTP: `123456` |
| 1.2 | Google OAuth sign-in | ✅ Supported | Firebase client-side Google auth |
| 1.3 | Microsoft OAuth sign-in | ✅ Supported | Firebase client-side Microsoft auth |
| 1.4 | JWT access token (1h expiry) | ✅ Supported | Sent as `Authorization: Bearer <token>` |
| 1.5 | JWT refresh token (7d expiry) | ✅ Supported | Used via `/api/auth/refresh` |
| 1.6 | Automatic token refresh | ✅ Supported | Client-side token refresh on expiry |
| 1.7 | User logout | ✅ Supported | Invalidates session |
| 1.8 | User profile — view | ✅ Supported | `GET /api/users/profile` |
| 1.9 | User profile — update | ✅ Supported | `PUT /api/users/profile` (name, preferences) |
| 1.10 | Mock auth mode (dev) | ✅ Supported | `Bearer mock-<userId>` for development without Firebase |
| 1.11 | Email/password sign-in | ❌ Not Currently Supported | — |
| 1.12 | Apple sign-in | ❌ Not Currently Supported | — |
| 1.13 | Multi-factor authentication | ❌ Not Currently Supported | — |
| 1.14 | Account deletion | ❌ Not Currently Supported | — |

---

## 2. Event Management

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 2.1 | Create event (trip or event) | ✅ Supported | Name, type, dates, currency, description |
| 2.2 | View event list (dashboard) | ✅ Supported | Shows all events user created or is admin of; real-time status updates via WebSocket |
| 2.3 | View event details | ✅ Supported | Tabbed UI: Expenses, Participants, Groups, Invitations |
| 2.4 | Update event | ✅ Supported | Admin-only; name, description, dates, currency, status |
| 2.5 | Delete event | ✅ Supported | Creator or admin; blocked for settled/closed events; confirmation modal shows pending settlement amount |
| 2.6 | Event status management | ✅ Supported | Active → Payment → Settled → Closed lifecycle; settlement generation enters Payment mode; auto-transitions to Settled when all payments confirmed; Close Event button for admins on settled events |
| 2.7 | Event types | ✅ Supported | Trip and Event |
| 2.8 | Event lock on settle/close | ✅ Supported | Payment/settled/closed events block all mutations (expenses, groups, invitations, participants); only status→closed allowed on settled events |
| 2.9 | Hide closed events from dashboard | ✅ Supported | Closed events filtered out of dashboard; not visible to any user; removed in real-time when closed via WebSocket |
| 2.10 | Multi-currency settlement | ✅ Supported | Event can have different expense currency and settlement currency; FX conversion via EOD API or predefined rates |
| 2.11 | Event archiving / closed events section | ❌ Not Currently Supported | Planned: view past closed events and their details |
| 2.12 | Event search / filter | ❌ Not Currently Supported | — |
| 2.13 | Event duplication | ❌ Not Currently Supported | — |

---

## 3. Participant Management

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 3.1 | View event participants | ✅ Supported | List all participants with roles |
| 3.2 | Add participant (admin) | ✅ Supported | Admin-only; assign role (member/admin) |
| 3.3 | Remove participant | ✅ Supported | Admin can remove others; users can remove themselves |
| 3.4 | Creator protection | ✅ Supported | Event creator cannot be removed |
| 3.5 | Role-based access (admin/member) | ✅ Supported | Admins can manage participants and invitations |
| 3.6 | Participant status tracking | ✅ Supported | Accepted, pending |
| 3.7 | Bulk participant import | ❌ Not Currently Supported | — |

---

## 4. Expense Tracking

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 4.1 | Create expense | ✅ Supported | Title, amount, currency, description, split type |
| 4.2 | View expenses for event | ✅ Supported | List all expenses with split details |
| 4.3 | View single expense | ✅ Supported | Full expense details with splits |
| 4.4 | Update expense | ✅ Supported | Creator or event admin; all fields editable; dedicated edit page |
| 4.5 | Delete expense | ✅ Supported | Creator or event admin |
| 4.6 | Equal split | ✅ Supported | Amount divided equally among participants |
| 4.7 | Ratio-based split | ✅ Supported | Custom ratios per participant |
| 4.8 | Custom split | ✅ Supported | Exact amounts per participant (must sum to total) |
| 4.9 | Split validation | ✅ Supported | All split types validated: sum of splits must equal total expense; submit disabled with mismatch error message |
| 4.10 | Event balance calculation | ✅ Supported | Net balance per participant across all expenses |
| 4.11 | Calculate splits helper API | ✅ Supported | `POST /api/expenses/calculate-splits` |
| 4.12 | Private expenses | ✅ Supported | Expenses visible only to creator, not shared with anyone |
| 4.13 | Entity selection for splits | ✅ Supported | Select which groups/individuals to split with; groups as single entities |
| 4.14 | Currency symbols | ✅ Supported | $, €, £, ₹, ¥ displayed in UI instead of currency codes |
| 4.15 | Edit expense page | ✅ Supported | Dedicated edit page with pre-populated form, same split validation as create |
| 4.16 | "On Behalf Of" expenses | ✅ Supported | Payer fronts money for another entity; payer's share = 0; splits exclude payer's entity; toggle + entity selector in create/edit UI |
| 4.17 | Expense categories / tags | ❌ Not Currently Supported | — |
| 4.18 | Receipt upload / attachment | ❌ Not Currently Supported | — |
| 4.19 | Recurring expenses | ❌ Not Currently Supported | — |
| 4.20 | Expense comments / notes | ❌ Not Currently Supported | — |
| 4.21 | Expense history / audit log | ❌ Not Currently Supported | — |
| 4.22 | Multi-currency expenses | ❌ Not Currently Supported | — |

---

## 5. Group Management

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 5.1 | Create group within event | ✅ Supported | Name, members, designated payer |
| 5.2 | View groups for event | ✅ Supported | List all groups with member details |
| 5.3 | View single group | ✅ Supported | Group details with members |
| 5.4 | Update group | ✅ Supported | Creator or representative; name, members, payerUserId, representative editable |
| 5.5 | Delete group | ✅ Supported | Creator or representative |
| 5.6 | Add member to group | ✅ Supported | Creator-only |
| 5.7 | Remove member from group | ✅ Supported | Creator or self-removal |
| 5.8 | Group-as-entity expense splitting | ✅ Supported | Groups treated as single entities in splits and settlements |
| 5.9 | Group representative | ✅ Supported | Designated payer/representative per group; first member by default |
| 5.10 | Group reusability across events | ✅ Supported | Groups can be added to multiple events via `eventIds` array |
| 5.11 | Group suggestions (70% overlap) | ✅ Supported | `POST /api/groups/suggest` suggests existing groups matching member overlap |
| 5.12 | Transfer representative | ✅ Supported | `PUT /api/groups/:id/transfer-representative` |
| 5.13 | Get user's groups | ✅ Supported | `GET /api/groups/my` returns all groups where user is a member |
| 5.14 | Group mutability | ✅ Supported | Groups are fully mutable — name, members, payer, representative can all be updated |
| 5.15 | Nested groups | ❌ Not Currently Supported | — |

---

## 6. Invitation System

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 6.1 | Create invitation (by email) | ✅ Supported | Admin-only; generates unique token; sends email |
| 6.2 | Create invitation (by phone) | ✅ Supported | Admin-only |
| 6.3 | Create invitation (by userId) | ✅ Supported | Admin-only |
| 6.4 | View user's invitations | ✅ Supported | `GET /api/invitations/my` |
| 6.5 | View event invitations | ✅ Supported | Admin can see all invitations for an event |
| 6.6 | Accept invitation | ✅ Supported | Adds user as event participant; auto-joins group if specified |
| 6.7 | Decline invitation | ✅ Supported | Updates status to declined |
| 6.8 | Revoke invitation | ✅ Supported | Inviter can revoke pending invitations |
| 6.9 | Token-based invitation link | ✅ Supported | Public endpoint: `GET /api/invitations/token/:token` |
| 6.10 | Invitation expiry (7 days) | ✅ Supported | Expired invitations cannot be accepted |
| 6.11 | Invitation message | ✅ Supported | Optional message when inviting |
| 6.12 | Invitation role assignment | ✅ Supported | Assign member or admin role |
| 6.13 | Email notification on invite | ✅ Supported | Nodemailer SMTP; mock mode logs to console when no SMTP_HOST |
| 6.14 | SMS notification on invite | ❌ Not Currently Supported | — |
| 6.15 | Push notification on invite | ❌ Not Currently Supported | — |
| 6.16 | Shareable invite link (deep link) | ❌ Not Currently Supported | Token exists but no deep link UI |
| 6.17 | Assign invitee to group | ✅ Supported | Optional `groupId` on invite; invitee auto-added to group on accept |
| 6.18 | Invite without group (independent) | ✅ Supported | Invitee joins event only, no group assignment |

---

## 7. Settlement & Payments

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 7.1 | Settlement algorithm (greedy) | ✅ Supported | Minimizes number of transactions; entity-level (groups + individuals) |
| 7.2 | Settlement plan generation | ✅ Supported | `POST /api/settlements/event/:eventId/generate` (admin-only) |
| 7.3 | Entity-level balance calculation | ✅ Supported | `GET /api/settlements/event/:eventId/balances` — groups as single entities |
| 7.4 | Get event settlements | ✅ Supported | `GET /api/settlements/event/:eventId` |
| 7.5 | Pending settlement total | ✅ Supported | `GET /api/settlements/event/:eventId/pending-total` |
| 7.6 | Initiate payment (mock) | ✅ Supported | `POST /api/settlements/:id/pay` — payer-only; mock payment with toast notification; sets transaction to `initiated` |
| 7.7 | Approve/confirm payment | ✅ Supported | `POST /api/settlements/:id/approve` — payee-only; confirms receipt; sets transaction to `completed` |
| 7.8 | Auto-settle on all complete | ✅ Supported | When all transactions are confirmed, event auto-transitions from `payment` to `settled` |
| 7.9 | Payment mode (event lock) | ✅ Supported | Settlement generation puts event in `payment` mode; all mutations blocked; only pay/approve allowed |
| 7.10 | No-payment edge case | ✅ Supported | If all balances are zero, event goes directly to `settled`; admin can close immediately |
| 7.11 | Settlement summary UI | ✅ Supported | Card-based layout with progress bar, per-transaction status (pending/initiated/completed), Pay/Confirm Receipt buttons |
| 7.12 | Group payer resolution | ✅ Supported | For group entities, the group's designated payer sees Pay button; group's payer receives Confirm Receipt button |
| 7.13 | Real-time settlement broadcast | ✅ Supported | WebSocket emits `settlement:generated`, `settlement:updated`, and `event:updated` to all event room clients; dashboard tiles update in real-time via multi-event room subscription |
| 7.14 | FX rate service (EOD + predefined) | ✅ Supported | Fetches rates from open.er-api.com with Firestore caching; supports predefined rates with reverse lookup; `convert()` helper |
| 7.15 | Dual currency settlement display | ✅ Supported | Settlement summary shows original + converted amounts with FX rate; total converted amount shown |
| 7.16 | Settlement currency configuration | ✅ Supported | Event creation UI: settlement currency selector, FX rate mode (EOD/predefined), predefined rate input |
| 7.17 | Payment gateway integration | ❌ Not Currently Supported | Mock only for now |
| 7.18 | UPI / bank transfer support | ❌ Not Currently Supported | — |
| 7.19 | Partial settlements | ❌ Not Currently Supported | — |
| 7.20 | Settlement reminders | ❌ Not Currently Supported | — |

---

## 8. Web Application (Frontend)

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 8.1 | Login page | ✅ Supported | Phone OTP, Google, Microsoft |
| 8.2 | Registration page | ✅ Supported | New user sign-up flow |
| 8.3 | Forgot password page | ✅ Supported | Password reset flow |
| 8.4 | Dashboard page | ✅ Supported | Event list with create button, empty state |
| 8.5 | Create event page | ✅ Supported | Full form with validation; settlement currency, FX rate mode, predefined FX rate inputs |
| 8.6 | Event detail page | ✅ Supported | Tabbed UI (Expenses, Participants, Groups, Invitations) |
| 8.7 | Create expense page | ✅ Supported | Entity selection (groups + individuals), radio split type, private toggle, currency symbols, split validation, "On Behalf Of" toggle + entity selector |
| 8.7a | Edit expense page | ✅ Supported | Pre-populated form, same validation as create, accessible to creator or admin, onBehalfOf editing |
| 8.8 | Invitations page | ✅ Supported | View and accept/decline pending invitations |
| 8.9 | Profile page | ✅ Supported | View and edit user profile |
| 8.10 | Navigation shell | ✅ Supported | Dashboard, Invitations, Profile links |
| 8.11 | Edit event modal | ✅ Supported | In-page modal on event detail |
| 8.12 | Invite user modal | ✅ Supported | In-page modal on event detail |
| 8.13 | Create group modal | ✅ Supported | In-page modal on event detail |
| 8.14 | Toast notifications | ✅ Supported | Success/error/warning feedback on all actions; no browser `alert()` or `confirm()` dialogs used anywhere |
| 8.15 | Loading states | ✅ Supported | CSS spinner animation and skeleton states |
| 8.16a | Real-time updates (WebSocket) | ✅ Supported | Socket.IO; auto-refresh event detail page on expense/group/settlement changes; dashboard event tiles update status in real-time via multi-event room subscription |
| 8.16 | Error states | ✅ Supported | Error messages with retry |
| 8.17 | Confirmation modals | ✅ Supported | All destructive/important actions (settle, close event, delete group/expense, remove participant) use themed modals with danger/warning variants instead of browser dialogs |
| 8.18 | Consistent status badges | ✅ Supported | Event status badges (active/payment/settled) use identical color mapping across Dashboard tiles and Event detail page: active=success, payment=info, settled=warning |
| 8.19 | Responsive design | ❌ Not Currently Supported | Desktop-first, mobile not optimized |
| 8.20 | Dark mode | ❌ Not Currently Supported | — |
| 8.21 | PWA support | ❌ Not Currently Supported | — |
| 8.22 | Accessibility (WCAG) | ❌ Not Currently Supported | — |

---

## 9. Mobile Application

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 9.1 | React Native + Expo setup | ✅ Supported | Full Expo project with NativeStackNavigator, theme, API client |
| 9.2 | Mobile authentication | ✅ Supported | Login + Register screens; AuthContext with token persistence via AsyncStorage |
| 9.3 | Mobile dashboard | ✅ Supported | Event list with pull-to-refresh, FX badge, status badges, create event button |
| 9.4 | Mobile event detail | ✅ Supported | Summary cards, expense list, settlement cards with dual currency, pay/approve actions, groups |
| 9.5 | Mobile create expense | ✅ Supported | Full form with entity selection, split calculation, "On Behalf Of" toggle + selector |
| 9.6 | Mobile create event | ✅ Supported | Event form with settlement currency, FX rate mode, predefined rate input; Pro tier gating |
| 9.7 | Free/Pro monetization tiers | ✅ Supported | Free tier: all basic features; Pro tier: multi-currency FX settlement; tier state in AuthContext |
| 9.8 | Push notifications | ❌ Not Currently Supported | — |
| 9.9 | Offline support | ❌ Not Currently Supported | — |
| 9.10 | Camera for receipt capture | ❌ Not Currently Supported | — |
| 9.11 | In-app purchase (IAP) | ❌ Not Currently Supported | Pro tier upgrade ready but IAP not integrated |

---

## 10. Shared Libraries

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 10.1 | Shared TypeScript types | ✅ Supported | User, Event, Expense, Group, Invitation, Settlement, FxRate, SupportedCurrency, etc. |
| 10.2 | Shared enums | ✅ Supported | UserRole, EventType, EventStatus, SplitType, InvitationStatus, FxRateMode, PaymentProvider, SUPPORTED_CURRENCIES |
| 10.3 | Shared DTOs | ✅ Supported | CreateEventDto, CreateExpenseDto, CreateGroupDto, CreateInvitationDto, Update DTOs |
| 10.4 | API response types | ✅ Supported | ApiResponse, PaginatedResponse, ValidationError |
| 10.5 | UI component library | ✅ Supported | Button, Input, Card, Select, TextArea, Modal, Badge, Tabs, EmptyState, Toast |
| 10.6 | Theme system | ✅ Supported | Colors, spacing, typography via styled-components |
| 10.7 | Shared validation utilities | ❌ Not Currently Supported | — |
| 10.8 | Shared date/currency formatters | ❌ Not Currently Supported | — |

---

## 11. Testing

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 11.1 | API unit tests (Jest + Supertest) | ✅ Supported | 392 tests across 15 suites, 92.9% statement / 83.6% branch coverage |
| 11.2 | Shared library unit tests | ✅ Supported | 36 tests, 100% coverage |
| 11.3 | E2E tests (Playwright) | ✅ Supported | 31 tests: navigation, events, expenses, invitations, groups |
| 11.4 | Regression test suite | ✅ Supported | 48 tests covering all Phase 2 functionality; `rush test:regression` |
| 11.5a | Settlement service tests | ✅ Supported | 38+ tests — greedy algorithm, entity balances, generation, entity-aware tile calculations, initiatePayment, approvePayment, auto-settle, onBehalfOf (3 scenarios), edge cases |
| 11.5d | FX rate service tests | ✅ Supported | 14 tests — getRate (predefined, reverse, fallback), getEodRate (cache hit, API fetch, errors, reverse fallback), convert, getPaymentProvider |
| 11.5b | Event guards tests | ✅ Supported | 10 tests — getEventLockStatus, requireActiveEvent for active/payment/settled/closed states |
| 11.5c | Expense admin auth tests | ✅ Supported | Tests for admin update/delete permissions, ratio split edge cases |
| 11.6 | EmailService unit tests | ✅ Supported | Mock mode, SMTP mode, error handling, email content |
| 11.7 | Web component unit tests | ❌ Not Currently Supported | — |
| 11.8 | Mobile unit tests | ❌ Not Currently Supported | — |
| 11.9 | Performance / load tests | ❌ Not Currently Supported | — |
| 11.10 | Visual regression tests | ❌ Not Currently Supported | — |

---

## 12. DevOps & Infrastructure

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 12.1 | Rush.js monorepo | ✅ Supported | 6 packages managed by Rush |
| 12.2 | Rush custom commands | ✅ Supported | dev, build, test, clean, lint, typecheck per-project |
| 12.3 | Environment variable management | ✅ Supported | `.env.example` template, `.env.local` for local dev |
| 12.4 | Mock mode (no Firebase) | ✅ Supported | API falls back to mock services automatically |
| 12.5 | CI/CD pipeline | ❌ Not Currently Supported | — |
| 12.6 | Docker containerization | ❌ Not Currently Supported | — |
| 12.7 | Production deployment | ❌ Not Currently Supported | — |
| 12.8 | Monitoring / logging | ❌ Not Currently Supported | Basic console logging only |
| 12.9 | Rate limiting | ❌ Not Currently Supported | — |
| 12.10 | API documentation (Swagger/OpenAPI) | ❌ Not Currently Supported | — |

---

## 13. Notifications

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 13.1 | In-app toast notifications | ✅ Supported | Success/error toasts on user actions |
| 13.2 | Email notifications (invitations) | ✅ Supported | Nodemailer SMTP; mock mode when no SMTP_HOST configured |
| 13.3 | SMS notifications | ❌ Not Currently Supported | — |
| 13.4 | Push notifications (web) | ❌ Not Currently Supported | — |
| 13.5 | Push notifications (mobile) | ❌ Not Currently Supported | — |
| 13.6 | Notification preferences | ❌ Not Currently Supported | — |

---

## 14. Analytics & Reporting

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 14.1 | Expense summary per event | ✅ Supported | Balance calculation via API |
| 14.2 | Expense charts / visualizations | ❌ Not Currently Supported | — |
| 14.3 | Export to CSV / PDF | ❌ Not Currently Supported | — |
| 14.4 | Spending trends | ❌ Not Currently Supported | — |
| 14.5 | Category-wise breakdown | ❌ Not Currently Supported | — |
| 14.6 | Admin dashboard / analytics | ❌ Not Currently Supported | — |

---

## Phase Summary

| Phase | Scope | Status |
|-------|-------|--------|
| **Phase 1** | Monorepo setup, auth, user management, basic API structure, web/mobile scaffolding | ✅ Complete |
| **Phase 2** | Event CRUD, expense tracking with splits, groups, invitations, web UI pages, unit + E2E tests | ✅ Complete |
| **Phase 3** | Settlement algorithm, group-as-entity splitting, group reusability, private expenses, WebSocket real-time, UI/UX overhaul, email notifications | ✅ Complete |
| **Phase 3.5** | Expense editing, admin permissions, split validation, event lifecycle (settled/closed lock), dashboard filtering, comprehensive tests | ✅ Complete |
| **Phase 4** | Settlement flow overhaul: payment mode, pay/approve endpoints, real-time status, settlement summary UI, auto-settle, edge cases | ✅ Complete |
| **Phase 4.5** | UX polish: confirmation modals (replace all browser dialogs), consistent badge colors, real-time dashboard updates via WebSocket | ✅ Complete |
| **Phase 5** | "On Behalf Of" expenses, multi-currency FX settlement, complete mobile app (iOS/Android), Free/Pro monetization tiers, comprehensive tests | ✅ Complete |

---

*Last updated: February 2026*
