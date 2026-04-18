type Listener = () => void;

const listeners = new Set<Listener>();

export function subscribeToAppRebootstrap(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function requestAppRebootstrap(): void {
  for (const listener of Array.from(listeners)) {
    try {
      listener();
    } catch (error) {
      console.error('[AppRebootstrap] Listener failed:', error);
    }
  }
}
