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
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/logger';
import { initWebSocket } from './config/websocket';

// Load .env files from monorepo root: .env first, then .env.local overrides
const rootDir = path.resolve(__dirname, '..', '..', '..');
dotenv.config({ path: path.join(rootDir, '.env') });
dotenv.config({ path: path.join(rootDir, '.env.local'), override: true });

const app: Express = express();
const PORT = process.env.PORT || 3001;

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
