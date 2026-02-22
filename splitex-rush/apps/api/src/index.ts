import express, { Express } from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';
import { authRoutes } from './routes/auth';
import { userRoutes } from './routes/users';
import { eventRoutes } from './routes/events';
import { expenseRoutes } from './routes/expenses';
import { settlementRoutes } from './routes/settlements';
import { groupRoutes } from './routes/groups';
import { invitationRoutes } from './routes/invitations';
import { billingRoutes } from './routes/billing';
import { internalEntitlementRoutes } from './routes/internal-entitlements';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/logger';
import { initWebSocket } from './config/websocket';

// Load .env files from monorepo root: .env first, then .env.local overrides
const rootDir = path.resolve(__dirname, '..', '..', '..');
dotenv.config({ path: path.join(rootDir, '.env') });
dotenv.config({ path: path.join(rootDir, '.env.local'), override: true });

const app: Express = express();
const PORT = process.env.PORT || 3001;
const MOBILE_DEEP_LINK_SCHEME = process.env.MOBILE_DEEP_LINK_SCHEME || 'com.splitex.app';

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/settlements', settlementRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/invitations', invitationRoutes);

// Firebase email-link fallback page:
// If the link opens in browser, send the user back into the mobile app.
app.get('/auth/email-link', (req, res) => {
  const mode = typeof req.query.mode === 'string' ? req.query.mode : '';
  const oobCode = typeof req.query.oobCode === 'string' ? req.query.oobCode : '';
  const apiKey = typeof req.query.apiKey === 'string' ? req.query.apiKey : '';
  const continueUrl = typeof req.query.continueUrl === 'string' ? req.query.continueUrl : '';
  const lang = typeof req.query.lang === 'string' ? req.query.lang : '';

  const query = new URLSearchParams();
  if (mode) query.set('mode', mode);
  if (oobCode) query.set('oobCode', oobCode);
  if (apiKey) query.set('apiKey', apiKey);
  if (continueUrl) query.set('continueUrl', continueUrl);
  if (lang) query.set('lang', lang);

  const deepLink = `${MOBILE_DEEP_LINK_SCHEME}://auth/email-link${query.toString() ? `?${query.toString()}` : ''}`;
  const escapedDeepLink = deepLink.replace(/"/g, '&quot;');

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Open Splitex</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; background: #f8fafc; color: #0f172a; }
      .wrap { max-width: 560px; margin: 10vh auto; padding: 24px; }
      .card { background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; box-shadow: 0 8px 30px rgba(15,23,42,0.08); }
      h1 { margin: 0 0 12px; font-size: 24px; color: #2563eb; }
      p { margin: 0 0 16px; line-height: 1.5; color: #334155; }
      a.btn { display: inline-block; background: #2563eb; color: white; text-decoration: none; padding: 12px 16px; border-radius: 8px; font-weight: 600; }
      .muted { margin-top: 14px; font-size: 12px; color: #64748b; word-break: break-all; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="card">
        <h1>Open Splitex</h1>
        <p>Tap below to continue sign-in in the Splitex app.</p>
        <a class="btn" href="${escapedDeepLink}">Open Splitex App</a>
        <p class="muted">If app does not open automatically, copy this link and open it in your device browser:<br>${escapedDeepLink}</p>
      </div>
    </div>
    <script>
      setTimeout(function () {
        window.location.href = "${escapedDeepLink}";
      }, 300);
    </script>
  </body>
</html>`;

  res.status(200).type('html').send(html);
});
app.use('/api/billing', billingRoutes);
app.use('/api/internal/entitlements', internalEntitlementRoutes);

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Create HTTP server and attach Socket.IO
const server = http.createServer(app);
initWebSocket(server);

server.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`🚀 Splitex API server running on 0.0.0.0:${PORT}`);
});

export default app;
