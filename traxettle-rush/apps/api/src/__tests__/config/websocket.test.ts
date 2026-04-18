import http from 'http';

// We need to test the websocket module which uses socket.io
// Mock socket.io Server
const mockEmit = jest.fn();
const mockTo = jest.fn().mockReturnValue({ emit: mockEmit });
const mockJoin = jest.fn();
const mockLeave = jest.fn();
const mockOn = jest.fn();

const mockSocketInstance = {
  id: 'mock-socket-id',
  join: mockJoin,
  leave: mockLeave,
  on: mockOn,
};

const mockIOInstance = {
  on: jest.fn(),
  to: mockTo,
};

jest.mock('socket.io', () => ({
  Server: jest.fn().mockImplementation(() => mockIOInstance),
}));

import { initWebSocket, getIO, emitToEvent, emitToUser } from '../../config/websocket';

describe('websocket', () => {
  let server: http.Server;

  beforeEach(() => {
    jest.clearAllMocks();
    mockIOInstance.on.mockReset();
    mockOn.mockReset();
    server = http.createServer();
  });

  describe('initWebSocket', () => {
    it('should create a Socket.IO server attached to the HTTP server', () => {
      const io = initWebSocket(server);
      expect(io).toBeDefined();
      expect(mockIOInstance.on).toHaveBeenCalledWith('connection', expect.any(Function));
    });

    it('should handle join-event on connection', () => {
      initWebSocket(server);

      // Get the connection handler
      const connectionHandler = mockIOInstance.on.mock.calls.find(
        (c: any[]) => c[0] === 'connection'
      )?.[1];
      expect(connectionHandler).toBeDefined();

      // Simulate a connection
      connectionHandler(mockSocketInstance);

      // Find the join-event handler
      const joinEventHandler = mockOn.mock.calls.find(
        (c: any[]) => c[0] === 'join-event'
      )?.[1];
      expect(joinEventHandler).toBeDefined();

      // Call with valid eventId
      joinEventHandler('evt-123');
      expect(mockJoin).toHaveBeenCalledWith('event:evt-123');

      // Call with empty string (should not join)
      mockJoin.mockClear();
      joinEventHandler('');
      expect(mockJoin).not.toHaveBeenCalled();

      // Call with non-string (should not join)
      joinEventHandler(null);
      expect(mockJoin).not.toHaveBeenCalled();
    });

    it('should handle leave-event on connection', () => {
      initWebSocket(server);

      const connectionHandler = mockIOInstance.on.mock.calls.find(
        (c: any[]) => c[0] === 'connection'
      )?.[1];
      connectionHandler(mockSocketInstance);

      const leaveEventHandler = mockOn.mock.calls.find(
        (c: any[]) => c[0] === 'leave-event'
      )?.[1];
      expect(leaveEventHandler).toBeDefined();

      leaveEventHandler('evt-123');
      expect(mockLeave).toHaveBeenCalledWith('event:evt-123');

      // Empty string should not leave
      mockLeave.mockClear();
      leaveEventHandler('');
      expect(mockLeave).not.toHaveBeenCalled();
    });

    it('should handle join-user on connection', () => {
      initWebSocket(server);

      const connectionHandler = mockIOInstance.on.mock.calls.find(
        (c: any[]) => c[0] === 'connection'
      )?.[1];
      connectionHandler(mockSocketInstance);

      const joinUserHandler = mockOn.mock.calls.find(
        (c: any[]) => c[0] === 'join-user'
      )?.[1];
      expect(joinUserHandler).toBeDefined();

      joinUserHandler('user-abc');
      expect(mockJoin).toHaveBeenCalledWith('user:user-abc');

      mockJoin.mockClear();
      joinUserHandler('');
      expect(mockJoin).not.toHaveBeenCalled();
    });

    it('should handle disconnect on connection', () => {
      initWebSocket(server);

      const connectionHandler = mockIOInstance.on.mock.calls.find(
        (c: any[]) => c[0] === 'connection'
      )?.[1];
      connectionHandler(mockSocketInstance);

      const disconnectHandler = mockOn.mock.calls.find(
        (c: any[]) => c[0] === 'disconnect'
      )?.[1];
      expect(disconnectHandler).toBeDefined();

      // Should not throw
      disconnectHandler();
    });
  });

  describe('getIO', () => {
    it('should return the io instance after initialization', () => {
      initWebSocket(server);
      const io = getIO();
      expect(io).toBeDefined();
    });
  });

  describe('emitToEvent', () => {
    it('should emit event to the correct room', () => {
      initWebSocket(server);
      emitToEvent('evt-1', 'expense:created', { amount: 100 });
      expect(mockTo).toHaveBeenCalledWith('event:evt-1');
      expect(mockEmit).toHaveBeenCalledWith('expense:created', expect.objectContaining({
        eventId: 'evt-1',
        amount: 100,
        timestamp: expect.any(String),
      }));
    });
  });

  describe('emitToUser', () => {
    it('should emit event to the correct user room', () => {
      initWebSocket(server);
      emitToUser('user-1', 'user:tier-updated', { tier: 'pro' });
      expect(mockTo).toHaveBeenCalledWith('user:user-1');
      expect(mockEmit).toHaveBeenCalledWith('user:tier-updated', expect.objectContaining({
        userId: 'user-1',
        tier: 'pro',
        timestamp: expect.any(String),
      }));
    });
  });
});
