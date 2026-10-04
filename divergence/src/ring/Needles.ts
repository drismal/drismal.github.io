// Small needles (3.5) and secondary spikes (4.4): a fixed CPU pool drawn by the ring shader.
// All counts, lengths and timings come from the user's params.
import type * as THREE from 'three';
import type { Slot } from '../events/EventBus';
import type { Params } from '../config';
import { ridgeHeight } from './shapes';
import { NEEDLES } from './RingPass';

interface Needle {
  on: boolean; mini: boolean;
  theta: number; maxLen: number;
  born: number; grow: number; life: number; retract: number;
}

// Section 4.4: secondary needle count per level (× params.secNeedleCount)
const COUNT: [number, number][] = [[0, 0], [4, 6], [6, 10], [12, 20]];
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export class Needles {
  private pool: Needle[] = Array.from({ length: NEEDLES }, () => ({
    on: false, mini: true, theta: 0, maxLen: 0, born: 0, grow: 0, life: 0, retract: 0,
  }));
  private target = 3;
  private retarget = 0;
  private nextSpawn = 0;
  private lastLevel = 0;
  private lastSig = '';

  update(now: number, slots: Slot[], level: number, P: Params, out: THREE.Vector4[]) {
    const sig = `${P.bgNeedleMin}|${P.bgNeedleMax}|${P.secNeedleCount}`;
    if (now > this.retarget || level !== this.lastLevel || sig !== this.lastSig) {
      let a: number, b: number;
      if (level === 0) { a = Math.min(P.bgNeedleMin, P.bgNeedleMax); b = Math.max(P.bgNeedleMin, P.bgNeedleMax); }
      else { [a, b] = COUNT[level]; a *= P.secNeedleCount; b *= P.secNeedleCount; }
      this.target = Math.min(NEEDLES, Math.round(rnd(a, b + 0.49)));
      this.retarget = now + rnd(4000, 9000);
      this.lastLevel = level;
      this.lastSig = sig;
    }
    let alive = 0;
    for (const p of this.pool) if (p.on) alive++;
    if (alive < this.target && now > this.nextSpawn) {
      const bunch = level > 0 && Math.random() < P.needleBunch ? (Math.random() < 0.5 ? 2 : 3) : 1;
      const theta = this.pickAngle(slots, level, P);
      for (let b = 0; b < bunch; b++) this.spawn(now, level, theta + (b ? rnd(-0.05, 0.05) : 0), P);
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

  private pickAngle(slots: Slot[], level: number, P: Params): number {
    if (level > 0 && Math.random() < P.needleNearEvent) {
      const act = slots.filter((s) => s.phase === 'attack' || s.phase === 'hold');
      if (act.length) {
        const s = act[Math.floor(Math.random() * act.length)];
        return s.theta + rnd(-1.1, 1.1) * s.width;
      }
    }
    return rnd(0, Math.PI * 2);
  }

  private spawn(now: number, level: number, theta: number, P: Params) {
    const p = this.pool.find((x) => !x.on);
    if (!p) return;
    p.on = true;
    p.theta = theta;
    p.born = now;
    if (level === 0) {           // 3.5: tiny, slow
      p.mini = true;
      p.maxLen = rnd(P.bgNeedleLenMin, Math.max(P.bgNeedleLenMin, P.bgNeedleLenMax));
      p.grow = 2000; p.retract = 2000;
      p.life = Math.max(500, rnd(P.bgNeedleLifeMin, Math.max(P.bgNeedleLifeMin, P.bgNeedleLifeMax)) * 1000 - 4000);
    } else {                     // 4.4: the most mobile elements
      p.mini = false;
      p.maxLen = rnd(P.secNeedleLenMin, Math.max(P.secNeedleLenMin, P.secNeedleLenMax));
      p.grow = P.needleGrow * 1000;
      p.life = rnd(P.secNeedleLifeMin, Math.max(P.secNeedleLifeMin, P.secNeedleLifeMax)) * 1000;
      p.retract = P.needleRetract * 1000 * rnd(0.7, 1.3);
    }
  }
}
