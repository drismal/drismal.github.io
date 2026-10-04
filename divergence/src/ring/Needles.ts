// Small needles (3.5) and secondary spikes (4.4): a fixed CPU pool drawn by the ring shader.
import type * as THREE from 'three';
import type { Slot } from '../events/EventBus';
import { ridgeHeight } from './shapes';
import { NEEDLES } from './RingPass';

interface Needle {
  on: boolean; mini: boolean;
  theta: number; maxLen: number;
  born: number; grow: number; life: number; retract: number;
}

// Section 4.4: needle count per level
const COUNT: [number, number][] = [[2, 5], [4, 6], [6, 10], [12, 20]];
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export class Needles {
  private pool: Needle[] = Array.from({ length: NEEDLES }, () => ({
    on: false, mini: true, theta: 0, maxLen: 0, born: 0, grow: 0, life: 0, retract: 0,
  }));
  private target = 3;
  private retarget = 0;
  private nextSpawn = 0;
  private lastLevel = 0;

  update(now: number, slots: Slot[], level: number, out: THREE.Vector4[]) {
    if (now > this.retarget || level !== this.lastLevel) {
      const [a, b] = COUNT[level];
      this.target = Math.round(rnd(a, b + 0.49));
      this.retarget = now + rnd(4000, 9000);
      this.lastLevel = level;
    }
    const alive = this.pool.reduce((n, p) => n + (p.on ? 1 : 0), 0);
    if (alive < this.target && now > this.nextSpawn) {
      const bunch = level > 0 && Math.random() < 0.35 ? (Math.random() < 0.5 ? 2 : 3) : 1;
      const theta = this.pickAngle(slots, level);
      for (let b = 0; b < bunch; b++) this.spawn(now, level, theta + (b ? rnd(-0.05, 0.05) : 0));
      this.nextSpawn = now + (level === 0 ? rnd(1500, 4000) : rnd(80, 350));
    }
    for (let i = 0; i < NEEDLES; i++) {
      const p = this.pool[i];
      const v = out[i];
      if (!p.on) { v.set(0, 0, 0, 0); continue; }
      const t = now - p.born;
      let k: number;                       // 0..1 growth
      if (t < p.grow) k = t / p.grow;
      else if (t < p.grow + p.life) k = 1;
      else if (t < p.grow + p.life + p.retract) k = 1 - (t - p.grow - p.life) / p.retract;
      else { p.on = false; v.set(0, 0, 0, 0); continue; }
      const e = k * k * (3 - 2 * k);           // smooth in and out
      const len = p.maxLen * (p.mini ? 0.6 + 0.4 * e : e);
      const alpha = p.mini ? e : Math.min(1, e * 2);
      const base = 1.045 + ridgeHeight(p.theta, slots) * 0.75;   // needles stick out of the ridges
      v.set(p.theta, base, len, alpha);
    }
  }

  private pickAngle(slots: Slot[], level: number): number {
    if (level > 0 && Math.random() < 0.6) {
      const act = slots.filter((s) => s.phase === 'attack' || s.phase === 'hold');
      if (act.length) {
        const s = act[Math.floor(Math.random() * act.length)];
        return s.theta + rnd(-1.1, 1.1) * s.width;
      }
    }
    return rnd(0, Math.PI * 2);
  }

  private spawn(now: number, level: number, theta: number) {
    const p = this.pool.find((x) => !x.on);
    if (!p) return;
    p.on = true;
    p.theta = theta;
    p.born = now;
    if (level === 0) {           // 3.5: tiny, slow (8–20 s)
      p.mini = true;
      p.maxLen = rnd(0.03, 0.06);
      p.grow = 2000; p.life = rnd(4000, 16000); p.retract = 2000;
    } else {                     // 4.4: grow 0.3 s, retract 1–2 s — the most mobile elements
      p.mini = false;
      p.maxLen = rnd(0.05, 0.2);
      p.grow = 300; p.life = rnd(1000, 4000); p.retract = rnd(1000, 2000);
    }
  }
}
