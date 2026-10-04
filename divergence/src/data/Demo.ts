// Demo / simulator: random events of all levels every 15–60 s.
import type { SensorCfg } from '../config';
import type { DivergenceEvent } from '../events/EventBus';
import type { Level } from '../config';
import type { Adapter } from './types';
import type { Params } from '../config';

export const SAMPLES: { title: string; text: string; value: string }[] = [
  { title: 'GATE, FRONT YARD', text: 'ENTRY GATE OPEN', value: 'STATUS: OPEN' },
  { title: 'MAINS, SWITCHBOARD', text: 'VOLTAGE SURGE', value: '258 V · NORM 207–253' },
  { title: 'OUTDOOR, NORTH', text: 'ABNORMAL HEAT', value: '+36.4 °C' },
  { title: 'LIVING ROOM', text: 'HUMIDITY BELOW NORM', value: '22 % · NORM 25–70' },
  { title: 'WEATHER STATION', text: 'PRESSURE DROPPING', value: '−3.4 hPa / 3 H' },
  { title: 'WEATHER', text: 'STORM WARNING', value: 'WIND 24 M/S' },
  { title: 'HALLWAY', text: 'DOORBELL RANG', value: 'STATUS: CALL' },
];

export class Demo implements Adapter {
  private timer = 0;
  private n = 0;

  constructor(private sensors: SensorCfg[], private emit: (e: DivergenceEvent) => void, private P: Params) {}

  start() { clearTimeout(this.timer); this.schedule(4000); }
  stop() { clearTimeout(this.timer); }

  private schedule(ms: number) {
    this.timer = window.setTimeout(() => {
      this.fire();
      const a = Math.max(1, this.P.demoMin), b = Math.max(a, this.P.demoMax);
      this.schedule((a + Math.random() * (b - a)) * 1000);
    }, ms);
  }

  fire(level?: Level, angle?: number) {
    const r = Math.random();
    const w1 = Math.max(0, this.P.demoP1), w2 = Math.max(0, this.P.demoP2), w3 = Math.max(0, this.P.demoP3);
    const rw = r * (w1 + w2 + w3 || 1);
    const lv: Level = level ?? (rw < w1 ? 1 : rw < w1 + w2 ? 2 : 3);
    const s = this.sensors.length ? this.sensors[Math.floor(Math.random() * this.sensors.length)] : null;
    const sample = SAMPLES[Math.floor(Math.random() * SAMPLES.length)];
    const rule = s?.rules.find((x) => x.level === lv) ?? s?.rules[0];
    const ev: DivergenceEvent = {
      id: `demo:${++this.n}`,
      sensorId: s?.id ?? 'demo',
      angle: angle ?? (s ? s.angle + (Math.random() - 0.5) * 20 : Math.random() * 360),
      level: lv,
      title: s?.title ?? sample.title,
      text: rule?.text ?? sample.text,
      value: (rule?.value ?? sample.value).replace(/\{value\}/g, '—').replace(/\{unit\}|\{delta:\d+\}|\{state\}/g, ''),
      startedAt: Date.now(),
      active: true,
      oneShot: Math.random() < this.P.demoOneShot,
    };
    this.emit(ev);
    if (!ev.oneShot) {
      const a = this.P.demoHoldMin, b = Math.max(a, this.P.demoHoldMax);
      const hold = (a + Math.random() * (b - a)) * 1000;
      window.setTimeout(() => this.emit({ ...ev, active: false }), hold);
    }
    return ev.id;
  }
}
