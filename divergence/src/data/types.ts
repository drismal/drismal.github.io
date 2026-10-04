export interface Adapter {
  start(): void;
  stop(): void;
}
export interface AdapterHooks {
  /** a reading: entity_id / topic, state string, attributes */
  onState(key: string, state: string, attrs?: Record<string, unknown>): void;
  onStatus(connected: boolean): void;
  /** optional: night from sun.sun */
  onSun?(belowHorizon: boolean): void;
}
