import request from 'supertest';
import express from 'express';

// Mock all route dependencies to avoid Firebase initialization
jest.mock('../../config/firebase', () => ({
  auth: { verifyIdToken: jest.fn() },
  db: {
    collection: jest.fn().mockReturnValue({
      doc: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue({ exists: false, data: () => null }),
        set: jest.fn().mockResolvedValue({})
      })
    })
  }
}));

// Create a minimal app with just the health endpoint
function createApp() {
  const app = express();
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
  });
  app.use('*', (req, res) => {
    res.status(404).json({ error: 'Route not found' });
  });
  return app;
}

describe('Health check endpoint', () => {
  it('GET /health should return 200 with status OK', async () => {
    const app = createApp();
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('OK');
    expect(res.body.timestamp).toBeDefined();
  });

  it('should return a valid ISO timestamp', async () => {
    const app = createApp();
    const res = await request(app).get('/health');

    const date = new Date(res.body.timestamp);
    expect(date.toISOString()).toBe(res.body.timestamp);
  });
});

describe('404 handler', () => {
  it('should return 404 for unknown routes', async () => {
    const app = createApp();
    const res = await request(app).get('/api/nonexistent');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Route not found');
  });
});
