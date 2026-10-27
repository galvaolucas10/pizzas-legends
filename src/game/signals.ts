/** Pub/sub tipado (ARCHITECTURE 8.2): só notifica UI, áudio e efeitos; nunca altera estado. */
export class Signals<Events extends Record<string, unknown>> {
  private readonly listeners = new Map<keyof Events, Set<(payload: never) => void>>();

  on<K extends keyof Events>(name: K, listener: (payload: Events[K]) => void): () => void {
    let set = this.listeners.get(name);
    if (!set) this.listeners.set(name, (set = new Set()));
    set.add(listener as (payload: never) => void);
    return () => set.delete(listener as (payload: never) => void);
  }

  emit<K extends keyof Events>(name: K, payload: Events[K]): void {
    for (const listener of this.listeners.get(name) ?? [])
      (listener as (p: Events[K]) => void)(payload);
  }
}
