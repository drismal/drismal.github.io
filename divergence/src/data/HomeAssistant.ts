// Home Assistant WebSocket API: auth with a long-lived token, initial get_states,
// then subscribe to state_changed. Reconnects with exponential backoff.
import type { Adapter, AdapterHooks } from './types';

export class HomeAssistant implements Adapter {
  private ws: WebSocket | null = null;
  private id = 1;
  private backoff = 1000;
  private timer = 0;
  private stopped = false;

  constructor(private url: string, private token: string, private entities: Set<string>,
    private hooks: AdapterHooks, private sunEntity = 'sun.sun') {}

  private wsUrl(): string {
    let u = this.url.trim().replace(/\/+$/, '');
    if (!/^wss?:/.test(u)) u = u.replace(/^http/, 'ws');
    if (!/\/api\/websocket$/.test(u)) u += '/api/websocket';
    return u;
  }

  start() { this.stopped = false; this.connect(); }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.ws?.close();
  }

  private connect() {
    let ws: WebSocket;
    try { ws = new WebSocket(this.wsUrl()); } catch { this.retry(); return; }
    this.ws = ws;
    ws.onmessage = (m) => {
      const msg = JSON.parse(String(m.data));
      if (msg.type === 'auth_required') ws.send(JSON.stringify({ type: 'auth', access_token: this.token }));
      else if (msg.type === 'auth_ok') {
        this.backoff = 1000;
        this.hooks.onStatus(true);
        ws.send(JSON.stringify({ id: this.id++, type: 'get_states' }));
        ws.send(JSON.stringify({ id: this.id++, type: 'subscribe_events', event_type: 'state_changed' }));
      } else if (msg.type === 'auth_invalid') {
        console.error('Home Assistant: invalid token');
        ws.close();
      } else if (msg.type === 'result' && Array.isArray(msg.result)) {
        for (const s of msg.result) this.state(s);
      } else if (msg.type === 'event' && msg.event?.data?.new_state) {
        this.state(msg.event.data.new_state);
      }
    };
    ws.onclose = () => { this.hooks.onStatus(false); this.retry(); };
    ws.onerror = () => ws.close();
  }

  private state(s: { entity_id: string; state: string; attributes?: Record<string, unknown> }) {
    if (s.entity_id === this.sunEntity) this.hooks.onSun?.(s.state === 'below_horizon');
    if (this.entities.has(s.entity_id)) this.hooks.onState(s.entity_id, s.state, s.attributes ?? {});
  }

  private retry() {
    if (this.stopped) return;
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.connect(), this.backoff);
    this.backoff = Math.min(60000, this.backoff * 2);
  }
}
