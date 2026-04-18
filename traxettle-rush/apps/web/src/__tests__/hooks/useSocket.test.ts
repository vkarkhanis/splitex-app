type HandlerMap = Record<string, Array<(payload: any) => void>>;

function createSocketMock() {
  const handlers: HandlerMap = {};
  return {
    emit: jest.fn(),
    on: jest.fn((type: string, cb: (payload: any) => void) => {
      handlers[type] = handlers[type] || [];
      handlers[type].push(cb);
    }),
    off: jest.fn((type: string, cb: (payload: any) => void) => {
      handlers[type] = (handlers[type] || []).filter((h) => h !== cb);
    }),
    trigger: (type: string, payload: any) => {
      (handlers[type] || []).forEach((h) => h(payload));
    },
  };
}

describe('socket hooks', () => {
  let cleanups: Array<() => void>;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    cleanups = [];
  });

  function mockReactHooks() {
    const actualReact = jest.requireActual('react');
    const useRef = jest.fn((initial: any) => ({ current: initial }));
    const useEffect = jest.fn((effect: () => void | (() => void)) => {
      const cleanup = effect();
      if (typeof cleanup === 'function') {
        cleanups.push(cleanup);
      }
    });

    jest.doMock('react', () => ({
      ...actualReact,
      useRef,
      useEffect,
    }));
  }

  test('useEventSocket joins room, forwards updates, and cleans up', async () => {
    mockReactHooks();
    const socket = createSocketMock();
    const io = jest.fn(() => socket);
    jest.doMock('socket.io-client', () => ({ io }));

    const { useEventSocket } = await import('../../hooks/useSocket');
    const onUpdate = jest.fn();
    useEventSocket('event-1', onUpdate);

    expect(io).toHaveBeenCalledTimes(1);
    expect(socket.emit).toHaveBeenCalledWith('join-event', 'event-1');

    socket.trigger('expense:created', { id: 'exp-1' });
    expect(onUpdate).toHaveBeenCalledWith('expense:created', { id: 'exp-1' });

    cleanups.forEach((fn) => fn());
    expect(socket.emit).toHaveBeenCalledWith('leave-event', 'event-1');
    expect(socket.off).toHaveBeenCalled();
  });

  test('useEventSocket skips setup when no eventId provided', async () => {
    mockReactHooks();
    const socket = createSocketMock();
    const io = jest.fn(() => socket);
    jest.doMock('socket.io-client', () => ({ io }));

    const { useEventSocket } = await import('../../hooks/useSocket');
    useEventSocket(undefined, jest.fn());

    expect(io).not.toHaveBeenCalled();
    expect(socket.emit).not.toHaveBeenCalled();
  });

  test('useMultiEventSocket joins and leaves all rooms', async () => {
    mockReactHooks();
    const socket = createSocketMock();
    const io = jest.fn(() => socket);
    jest.doMock('socket.io-client', () => ({ io }));

    const { useMultiEventSocket } = await import('../../hooks/useSocket');
    const onUpdate = jest.fn();
    useMultiEventSocket(['a', 'b'], onUpdate);

    expect(socket.emit).toHaveBeenCalledWith('join-event', 'a');
    expect(socket.emit).toHaveBeenCalledWith('join-event', 'b');

    socket.trigger('settlement:updated', { id: 'set-1' });
    expect(onUpdate).toHaveBeenCalledWith('settlement:updated', { id: 'set-1' });

    cleanups.forEach((fn) => fn());
    expect(socket.emit).toHaveBeenCalledWith('leave-event', 'a');
    expect(socket.emit).toHaveBeenCalledWith('leave-event', 'b');
  });

  test('useUserSocket subscribes to notification and tier update events', async () => {
    mockReactHooks();
    const socket = createSocketMock();
    const io = jest.fn(() => socket);
    jest.doMock('socket.io-client', () => ({ io }));

    const { useUserSocket } = await import('../../hooks/useSocket');
    const onNotification = jest.fn();
    useUserSocket('user-1', onNotification);

    expect(socket.emit).toHaveBeenCalledWith('join-user', 'user-1');
    socket.trigger('notification', { kind: 'invite' });
    expect(onNotification).toHaveBeenCalledWith('notification', { kind: 'invite' });
    socket.trigger('user:tier-updated', { tier: 'pro' });
    expect(onNotification).toHaveBeenCalledWith('user:tier-updated', { tier: 'pro' });

    cleanups.forEach((fn) => fn());
    expect(socket.off).toHaveBeenCalledWith('notification', expect.any(Function));
    expect(socket.off).toHaveBeenCalledWith('user:tier-updated', expect.any(Function));
  });

  test('useUserSocket skips setup when no userId provided', async () => {
    mockReactHooks();
    const socket = createSocketMock();
    const io = jest.fn(() => socket);
    jest.doMock('socket.io-client', () => ({ io }));

    const { useUserSocket } = await import('../../hooks/useSocket');
    useUserSocket(undefined, jest.fn());

    expect(io).not.toHaveBeenCalled();
    expect(socket.emit).not.toHaveBeenCalled();
  });
});
