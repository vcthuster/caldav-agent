/**
 * Contrat des futurs plugins locaux. Un plugin reçoit le bus d'événements
 * et des accès en lecture/écriture via les services du Core — jamais la BDD brute.
 * Seul le contrat existe pour l'instant ; le chargeur viendra plus tard.
 */

import type { EventBus } from '../core/events.js';

export interface AgentPlugin {
  name: string;
  register(bus: EventBus): void;
}
