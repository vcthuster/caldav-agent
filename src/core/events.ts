/**
 * Bus d'événements interne — unique point de greffe des futurs plugins.
 * Volontairement minimal : typé, synchrone, sans dépendance.
 */

export interface AgentEvents {
  'object.created': { calendar_id: number; uid: string };
  'object.updated': { calendar_id: number; uid: string };
  'object.deleted': { calendar_id: number; uid: string };
  'sync.completed': { calendar_id: number; changed: number; removed: number };
}

type Handler<E extends keyof AgentEvents> = (payload: AgentEvents[E]) => void;

export class EventBus {
  private handlers = new Map<keyof AgentEvents, Set<Handler<never>>>();

  on<E extends keyof AgentEvents>(event: E, handler: Handler<E>): void {
    let set = this.handlers.get(event);
    if (!set) this.handlers.set(event, (set = new Set()));
    set.add(handler as Handler<never>);
  }

  emit<E extends keyof AgentEvents>(event: E, payload: AgentEvents[E]): void {
    this.handlers.get(event)?.forEach((h) => (h as Handler<E>)(payload));
  }
}
