export type EventListener<T = any> = (payload: T) => Promise<void> | void;

export class EventBus {
  private listeners = new Map<string, Array<EventListener>>();

  public on<T = any>(event: string, listener: EventListener<T>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(listener);

    return () => this.off(event, listener);
  }

  public off(event: string, listener: EventListener): void {
    const list = this.listeners.get(event);
    if (!list) return;
    const idx = list.indexOf(listener);
    if (idx !== -1) list.splice(idx, 1);
  }

  public async emit<T = any>(event: string, payload: T): Promise<void> {
    const promises: Promise<void>[] = [];

    // 1. Exact match
    const exactListeners = this.listeners.get(event) || [];
    for (const fn of exactListeners) {
      try {
        const res = fn(payload);
        if (res instanceof Promise) promises.push(res);
      } catch (err) {
        console.error(`[EventBus] Error in listener for event "${event}":`, err);
      }
    }

    // 2. Wildcard match (e.g. "order.*" matches "order.paid")
    for (const [pattern, fns] of this.listeners.entries()) {
      if (pattern.includes('*') && this.matchWildcard(pattern, event)) {
        for (const fn of fns) {
          try {
            const res = fn(payload);
            if (res instanceof Promise) promises.push(res);
          } catch (err) {
            console.error(`[EventBus] Error in wildcard listener for pattern "${pattern}":`, err);
          }
        }
      }
    }

    await Promise.allSettled(promises);
  }

  private matchWildcard(pattern: string, event: string): boolean {
    const regexStr = '^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$';
    return new RegExp(regexStr).test(event);
  }

  public clear(): void {
    this.listeners.clear();
  }
}
