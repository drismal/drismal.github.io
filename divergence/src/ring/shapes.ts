// CPU mirror of the shader formulas that the HUD must agree with.
import type { Slot } from '../events/EventBus';

export const RIDGE_BASE = 1.03;   // ridges start at 1.03 R
export const SPIKE_BASE = 1.04;   // main spike starts at 1.04 R
export const TIP_JITTER = 0.004;  // radians

export function angDiff(a: number, b: number): number {
  const d = Math.abs((((a - b + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - Math.PI);
  return d;
}

export function bump(d: number, w: number): number {
  const u = d / Math.max(w, 1e-4);
  return Math.exp(-u * u * 2.5);
}

/** Ridge height H(θ) without the fbm factor (its mean ≈ 0.8). */
export function ridgeHeight(theta: number, slots: Slot[]): number {
  let h = 0;
  for (const s of slots) {
    if (s.phase === 'free' || s.energy <= 0) continue;
    h += s.energy * s.height * bump(angDiff(theta, s.theta), s.width);
  }
  return h * 0.8;
}

/** Main spike tip in CSS pixels — identical to the vertex shader (s = 1). */
export function spikeTip(s: Slot, cx: number, cy: number, R: number, jitPhase: number, out: { x: number; y: number }) {
  const r = SPIKE_BASE + s.spike * s.energy;
  const th = s.theta + TIP_JITTER * Math.sin(jitPhase + s.jitter);
  out.x = cx + R * r * Math.cos(th);
  out.y = cy + R * r * Math.sin(th);
  return out;
}
