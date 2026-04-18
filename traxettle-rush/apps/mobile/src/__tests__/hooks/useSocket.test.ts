type Handler = (payload: any) => void;

const createSocketMock = () => {
  const handlers = new Map<string, Handler[]>();

  const socket = {
    emit: jest.fn(),
    on: jest.fn((type: string, handler: Handler) => {
      handlers.set(type, [...(handlers.get(type) || []), handler]);
    }),
    off: jest.fn((type: string, handler: Handler) => {
      handlers.set(type, (handlers.get(type) || []).filter((h) => h !== handler));
    }),
  };

  return {
    socket,
    fire: (type: string, payload: any) => {
      for (const handler of handlers.get(type) || []) {
        handler(payload);
      }
    },
  };
};

describe('useSocket hooks', () => {
  let cleanupFn: (() => void) | undefined;

  const loadHooks = () => {
    jest.resetModules();

    jest.doMock('react', () => ({
      useRef: jest.fn((value: any) => ({ current: value })),
      useEffect: jest.fn((effect: () => void | (() => void)) => {
        cleanupFn = effect() as (() => void) | undefined;
      }),
    }));

    const mock = createSocketMock();
    jest.doMock('socket.io-client', () => ({ io: jest.fn(() => mock.socket) }));

    const hooks = require('../../hooks/useSocket') as typeof import('../../hooks/useSocket');
    return { hooks, mock };
  };

  afterEach(() => {
    cleanupFn = undefined;
    jest.clearAllMocks();
    jest.resetModules();
  });

  it('subscribes to an event room and cleans up listeners', () => {
    const updates: Array<{ type: string; payload: any }> = [];
    const { hooks, mock } = loadHooks();

    hooks.useEventSocket('evt-1', (type, payload) => updates.push({ type, payload }));

    expect(mock.socket.emit).toHaveBeenCalledWith('join-event', 'evt-1');
    expect(mock.socket.on).toHaveBeenCalled();

    mock.fire('settlement:generated', { id: 's-1' });
    mock.fire('expense:updated', { id: 'e-1' });

    expect(updates).toEqual([
      { type: 'settlement:generated', payload: { id: 's-1' } },
      { type: 'expense:updated', payload: { id: 'e-1' } },
    ]);

    cleanupFn?.();

    expect(mock.socket.emit).toHaveBeenCalledWith('leave-event', 'evt-1');
    expect(mock.socket.off).toHaveBeenCalled();
  });

  it('skips subscription when eventId is missing', () => {
    const { hooks, mock } = loadHooks();

    hooks.useEventSocket(undefined, () => {});

    expect(mock.socket.emit).not.toHaveBeenCalled();
    expect(mock.socket.on).not.toHaveBeenCalled();
    expect(cleanupFn).toBeUndefined();
  });

  it('joins multiple rooms and listens to event-level updates', () => {
    const updates: Array<{ type: string; payload: any }> = [];
    const { hooks, mock } = loadHooks();

    hooks.useMultiEventSocket(['evt-1', 'evt-2'], (type, payload) => updates.push({ type, payload }));

    expect(mock.socket.emit).toHaveBeenCalledWith('join-event', 'evt-1');
    expect(mock.socket.emit).toHaveBeenCalledWith('join-event', 'evt-2');

    mock.fire('event:updated', { id: 'evt-1' });
    mock.fire('settlement:updated', { id: 's-2' });

    expect(updates).toEqual([
      { type: 'event:updated', payload: { id: 'evt-1' } },
      { type: 'settlement:updated', payload: { id: 's-2' } },
    ]);

    cleanupFn?.();

    expect(mock.socket.emit).toHaveBeenCalledWith('leave-event', 'evt-1');
    expect(mock.socket.emit).toHaveBeenCalledWith('leave-event', 'evt-2');
    expect(mock.socket.off).toHaveBeenCalled();
  });

  it('does not subscribe multi-event when ids are empty', () => {
    const { hooks, mock } = loadHooks();

    hooks.useMultiEventSocket([], () => {});

    expect(mock.socket.emit).not.toHaveBeenCalled();
    expect(mock.socket.on).not.toHaveBeenCalled();
    expect(cleanupFn).toBeUndefined();
  });
});
