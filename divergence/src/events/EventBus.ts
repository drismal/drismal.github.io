// Event bus: the renderer only knows DivergenceEvents and their envelopes.
import type { Level } from '../config';

export type DivergenceEvent = {
  id: string;
  sensorId: string;
  /** degrees, 0 = right, clockwise */
  angle: number;
  level: Level;
  title: string;
  text: string;
  value: string;
  startedAt: number;
  active: boolean;
  oneShot?: boolean;
};

/** Section 6.1: sector half-width (deg), ridge height and main spike length (fractions of R). */
export const LEVELS: Record<1 | 2 | 3, { width: number; height: number; spike: number }> = {
  1: { width: 12, height: 0.04, spike: 0.15 },
  2: { width: 40, height: 0.10, spike: 0.30 },
  3: { width: 130, height: 0.18, spike: 0.45 },
};

export const MAX_SLOTS = 8;
const TWEEN_MS = 500;
/** attack and one-shot hold (ms), set from params */
export const timing = { attackMs: 400, oneShotHoldMs: 8000 };

export type Phase = 'free' | 'attack' | 'hold' | 'decay';

/** Global multiplier for ridge heights (params.ridgeHeightScale). */
export const shape = { heightScale: 1 };

export class Slot {
  phase: Phase = 'free';
  ev!: DivergenceEvent;
  theta = 0;            // radians, screen space (clockwise)
  energy = 0;
  phaseStart = 0;
  energyAtPhase = 0;
  holdUntil = Infinity;
  jitter = 0;           // per-event phase for the spike tip jitter
  boil = 0;
  // current shape (tweened) and tween endpoints
  width = 0; height = 0; spike = 0;
  private from = { width: 0, height: 0, spike: 0 };
  private to = { width: 0, height: 0, spike: 0 };
  private tweenStart = 0;

  setLevel(level: Level, now: number, instant: boolean) {
    const L = LEVELS[(Math.max(1, level) as 1 | 2 | 3)];
    const target = { width: (L.width * Math.PI) / 180, height: L.height * shape.heightScale, spike: L.spike };
    if (instant) {
      this.width = target.width; this.height = target.height; this.spike = target.spike;
      this.from = { ...target }; this.to = { ...target };
      return;
    }
    this.from = { width: this.width, height: this.height, spike: this.spike };
    this.to = target;
    this.tweenStart = now;
  }

  tween(now: number) {
    const p = Math.min(1, (now - this.tweenStart) / TWEEN_MS);
    const k = p * p * (3 - 2 * p);
    this.width = this.from.width + (this.to.width - this.from.width) * k;
    this.height = this.from.height + (this.to.height - this.from.height) * k;
    this.spike = this.from.spike + (this.to.spike - this.from.spike) * k;
  }
}

const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);

export class EventBus {
  readonly slots: Slot[] = Array.from({ length: MAX_SLOTS }, () => new Slot());
  private byId = new Map<string, Slot>();
  tau = 1.8;

  /** Insert, update or end an event. */
  emit(ev: DivergenceEvent, now = performance.now()) {
    let s = this.byId.get(ev.id);
    if (!ev.active) {
      if (s && s.phase !== 'decay' && s.phase !== 'free') this.startDecay(s, now);
      return;
    }
    if (s && s.phase !== 'free') {
      const levelChanged = s.ev.level !== ev.level;
      s.ev = ev;
      if (levelChanged) s.setLevel(ev.level, now, false);
      if (s.phase === 'decay') { s.phase = 'attack'; s.phaseStart = now; s.energyAtPhase = s.energy; }
      return;
    }
    s = this.slots.find((x) => x.phase === 'free') ?? this.evict();
    s.ev = ev;
    s.theta = (ev.angle * Math.PI) / 180;
    s.phase = 'attack';
    s.phaseStart = now;
    s.energyAtPhase = 0;
    s.energy = 0;
    s.jitter = Math.random() * Math.PI * 2;
    s.boil = Math.random() * 100;
    s.holdUntil = ev.oneShot ? now + timing.attackMs + timing.oneShotHoldMs : Infinity;
    s.setLevel(ev.level, now, true);
    this.byId.set(ev.id, s);
  }

  end(id: string, now = performance.now()) {
    const s = this.byId.get(id);
    if (s && s.phase !== 'free' && s.phase !== 'decay') this.startDecay(s, now);
  }

  endAll(now = performance.now()) {
    for (const s of this.slots) if (s.phase === 'attack' || s.phase === 'hold') this.startDecay(s, now);
  }

  clear() {
    for (const s of this.slots) { s.phase = 'free'; s.energy = 0; }
    this.byId.clear();
  }

  private startDecay(s: Slot, now: number) {
    s.phase = 'decay';
    s.phaseStart = now;
    s.energyAtPhase = s.energy;
  }

  /** Evict the weakest slot when all 8 are busy. */
  private evict(): Slot {
    let best = this.slots[0];
    for (const s of this.slots) {
      const score = (s.phase === 'decay' ? 0 : 10) + s.energy * (s.ev?.level ?? 0);
      const bestScore = (best.phase === 'decay' ? 0 : 10) + best.energy * (best.ev?.level ?? 0);
      if (score < bestScore) best = s;
    }
    if (best.ev) this.byId.delete(best.ev.id);
    best.phase = 'free';
    return best;
  }

  /** Envelopes (section 6): attack 0.4 s ease-out-cubic, hold with ±10 % boil, exp decay τ. */
  update(now: number) {
    for (const s of this.slots) {
      if (s.phase === 'free') continue;
      s.tween(now);
      const dt = now - s.phaseStart;
      if (s.phase === 'attack') {
        const p = Math.min(1, dt / Math.max(16, timing.attackMs));
        s.energy = s.energyAtPhase + (1 - s.energyAtPhase) * easeOutCubic(p);
        if (p >= 1) { s.phase = 'hold'; s.phaseStart = now; }
      } else if (s.phase === 'hold') {
        const t = now / 1000 + s.boil;
        s.energy = 1 + 0.1 * (0.6 * Math.sin(t * 1.3) + 0.4 * Math.sin(t * 2.9 + 1.1));
        if (now >= s.holdUntil) this.startDecay(s, now);
      } else if (s.phase === 'decay') {
        s.energy = s.energyAtPhase * Math.exp(-dt / (this.tau * 1000));
        if (s.energy < 0.003) {
          s.phase = 'free';
          s.energy = 0;
          if (this.byId.get(s.ev.id) === s) this.byId.delete(s.ev.id);
        }
      }
    }
  }

  active(): Slot[] {
    return this.slots.filter((s) => s.phase !== 'free');
  }

  /** Highest level among non-decaying events, weighted by energy (for needles, core, eclipse). */
  maxLevel(): number {
    let m = 0;
    for (const s of this.slots) if (s.phase === 'attack' || s.phase === 'hold') m = Math.max(m, s.ev.level);
    return m;
  }
}
