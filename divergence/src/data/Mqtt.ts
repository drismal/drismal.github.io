// MQTT over WebSocket (mqtt.js is loaded only when this adapter is used).
import type { Adapter, AdapterHooks } from './types';
import type { SensorCfg } from '../config';

export class Mqtt implements Adapter {
  private client: { end(force?: boolean): void } | null = null;

  constructor(private url: string, private sensors: SensorCfg[], private hooks: AdapterHooks,
    private auth: { username?: string; password?: string } = {}) {}

  async start() {
    const mqtt = await import('mqtt');
    const client = mqtt.connect(this.url, { ...this.auth, reconnectPeriod: 2000, connectTimeout: 8000 });
    this.client = client;
    const topics = this.sensors.filter((s) => s.topic).map((s) => s.topic!);
    client.on('connect', () => { this.hooks.onStatus(true); if (topics.length) client.subscribe(topics); });
    client.on('close', () => this.hooks.onStatus(false));
    client.on('offline', () => this.hooks.onStatus(false));
    client.on('message', (topic: string, payload: Uint8Array) => {
      const text = new TextDecoder().decode(payload).trim();
      const cfg = this.sensors.find((s) => s.topic === topic);
      if (!cfg) return;
      let state = text, attrs: Record<string, unknown> = {};
      if (text.startsWith('{')) {
        try {
          const obj = JSON.parse(text);
          attrs = obj;
          const v = (cfg.valuePath ?? 'value').split('.').reduce<any>((o, k) => (o == null ? o : o[k]), obj);
          state = v == null ? text : String(v);
        } catch { /* plain text */ }
      }
      this.hooks.onState(topic, state, attrs);
    });
  }

  stop() { this.client?.end(true); }
}
