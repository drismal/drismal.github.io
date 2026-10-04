// SVG callouts (section 5): hexagon marker on the spike tip, one-bend leader that becomes
// the underline, bracket with three serifs, four lines of text — always OUTSIDE the ring.
import type { Slot } from '../events/EventBus';
import type { Strings } from '../config';
import { spikeTip } from '../ring/shapes';

const NS = 'http://www.w3.org/2000/svg';
const MAX_CALLOUTS = 8;          // pool size; params.maxCallouts limits how many show
// timeline after the event appears (ms): spike 0–400, marker, leader, text
const T_MARK = [400, 700], T_LEAD = [700, 1100];
const T_OUT = 800;
const RAD = Math.PI / 180;
const SLANT_ALT = [0, -10, 10, 20];   // tried after the user's leader angle
// gap between the text block and the ring: `ridge` = count the ridge height, `gap` in R.
// 0.25 R beyond the ridges is the target (5.2); the rest are fallbacks so nothing ever leaves the screen.
const CLEAR_ALT = [1, 0.6, 0.25];      // × the user's gap, then a last resort without ridges
const TIERS = [0.7, 1.3, 2.6];          // max leader height (R): short leaders first
const SCALES = [1, 0.9, 0.8, 0.7, 0.6, 0.5];
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%/:АБВГДЕЖЗИКЛМНПРСТУФЦШЭЮЯ';

// font sizes and baselines in fractions of R (5.1)
const FS = [0.07, 0.09, 0.055, 0.055];
const W8 = ['400', '400', '500', '500'];

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string> = {}): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}
function hexPoints(r: number): string {
  let s = '';
  for (let k = 0; k < 6; k++) {
    const a = ((-90 + 60 * k) * Math.PI) / 180;
    s += `${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)} `;
  }
  return s;
}
function fmtDate(ms: number): string {
  const d = new Date(ms), p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${String(d.getFullYear()).slice(2)} · ${p(d.getHours())}:${p(d.getMinutes())}`;
}

interface Rect { x0: number; y0: number; x1: number; y1: number }
interface Choice { dy: number; v: number; s: number; sc: number; slant: number; clear: number; ridge: number }

export interface Palette { line: string; dot: string; date: string; key: string; title: string; body: string }

class Callout {
  readonly g = el('g');
  readonly marker = el('g');
  readonly hexO = el('polygon', { fill: 'none' });
  readonly hexI = el('polygon', { fill: 'none' });
  readonly dot = el('circle', { r: '1.3' });
  readonly leader = el('polyline', { fill: 'none', pathLength: '1' });
  readonly bracket = el('path', { fill: 'none', pathLength: '1' });
  readonly txt: SVGTextElement[] = [];
  readonly key = el('tspan');
  readonly title = el('tspan');
  slotRef: Slot | null = null;
  eventId = '';
  state: 'idle' | 'in' | 'out' = 'idle';
  t0 = 0; tOut = 0; outFrom = 1;
  lines = ['', '', '', ''];
  keyText = ''; titleText = '';
  widths = [0, 0, 0, 0];         // measured at R = measureR, scale 1
  measureR = 0;
  dy = -1; side = 1; vdir = -1; sc = 1; slant = 60 * RAD;
  choice: Choice | null = null;
  lastSearch = 0;
  private shown = ['', '', '', '', ''];

  constructor(root: SVGSVGElement) {
    this.marker.append(this.hexO, this.hexI, this.dot);
    for (let i = 0; i < 4; i++) {
      const t = el('text');
      t.style.fontWeight = W8[i];
      this.txt.push(t);
    }
    this.title.style.fontWeight = '300';
    this.txt[1].append(this.key, this.title);
    this.g.append(this.leader, this.bracket, this.marker, ...this.txt);
    this.g.style.display = 'none';
    root.appendChild(this.g);
  }

  bind(s: Slot, strings: Strings, now: number) {
    this.slotRef = s;
    this.eventId = s.ev.id;
    this.state = 'in';
    this.t0 = now;
    this.dy = -1;
    this.choice = null;
    this.setTexts(s, strings);
    this.g.style.display = '';
  }

  setTexts(s: Slot, strings: Strings) {
    const ev = s.ev;
    const value = /:/.test(ev.value) ? ev.value : strings.valuePrefix + ev.value;
    const next = [fmtDate(ev.startedAt), '', ev.text.toUpperCase(), value.toUpperCase()];
    const k = `${strings.divergence} : `, t = ev.title.toUpperCase();
    if (next.join('|') + k + t !== this.lines.join('|') + this.keyText + this.titleText) {
      this.lines = next; this.keyText = k; this.titleText = t;
      this.measureR = 0;   // re-measure
    }
  }

  /** Measure the full strings once per text change / radius change (not every frame). */
  measure(R: number) {
    if (this.measureR && Math.abs(R / this.measureR - 1) < 0.08) return;
    this.measureR = R;
    for (let i = 0; i < 4; i++) {
      const t = this.txt[i];
      t.style.fontSize = `${FS[i] * R}px`;
      if (i === 1) { this.key.textContent = this.keyText; this.title.textContent = this.titleText; }
      else t.textContent = this.lines[i];
      this.widths[i] = t.getComputedTextLength();
    }
    this.shown.fill('\u0000');
  }

  /** Typewriter with 2–3 flickering glyphs before each character settles. */
  renderText(p: number) {
    const all = [this.lines[0], this.keyText, this.titleText, this.lines[2], this.lines[3]];
    const total = all.reduce((n, s) => n + s.length, 0);
    const n = Math.floor(p * total);
    let idx = 0;
    for (let j = 0; j < all.length; j++) {
      const s = all[j];
      let out = '';
      for (let c = 0; c < s.length; c++, idx++) {
        if (idx >= n) break;
        out += idx >= n - 3 && p < 1 && s[c] !== ' ' ? GLYPHS[(Math.random() * GLYPHS.length) | 0] : s[c];
      }
      if (out !== this.shown[j]) {
        this.shown[j] = out;
        const target = j === 0 ? this.txt[0] : j === 1 ? this.key : j === 2 ? this.title : this.txt[j - 1];
        target.textContent = out;
      }
    }
  }
}

export class Callouts {
  private items: Callout[] = [];
  private placed: Rect[] = [];
  /** user settings */
  textScale = 1;
  maxCallouts = 4;
  leaderAngle = 60;   // deg
  markerSize = 0.15;  // R
  gap = 0.25;         // R
  typeMs = 600;
  private tip = { x: 0, y: 0 };

  constructor(private root: SVGSVGElement, private strings: Strings) {
    for (let i = 0; i < MAX_CALLOUTS; i++) this.items.push(new Callout(root));
    document.fonts?.addEventListener?.('loadingdone', () => this.items.forEach((c) => (c.measureR = 0)));
  }

  resize(W: number, H: number) {
    this.root.setAttribute('viewBox', `0 0 ${W} ${H}`);
  }

  update(now: number, dt: number, slots: Slot[], cx: number, cy: number, R: number, R0: number,
    W: number, H: number, jitPhase: number, maxRidge: number, pal: Palette) {
    // 1) which events deserve a callout: level ≥ 1, not settling, top 4 by level then age
    const want = slots
      .filter((s) => (s.phase === 'attack' || s.phase === 'hold') && s.ev.level >= 1)
      .sort((a, b) => b.ev.level - a.ev.level || a.ev.startedAt - b.ev.startedAt)
      .slice(0, Math.max(0, Math.min(MAX_CALLOUTS, Math.round(this.maxCallouts))));
    for (const c of this.items) {
      if (c.state === 'in' && (!c.slotRef || c.slotRef.ev.id !== c.eventId || !want.includes(c.slotRef))) {
        c.state = 'out'; c.tOut = now; c.outFrom = 1;
      }
    }
    for (const s of want) {
      if (this.items.some((c) => c.state === 'in' && c.slotRef === s)) continue;
      const free = this.items.find((c) => c.state === 'idle');
      if (free) free.bind(s, this.strings, now);
    }

    // 2) layout, in priority order, with repulsion against already placed blocks
    this.placed.length = 0;
    const order = this.items
      .filter((c) => c.state !== 'idle' && c.slotRef)
      .sort((a, b) => (b.slotRef!.ev.level - a.slotRef!.ev.level) || (a.slotRef!.ev.startedAt - b.slotRef!.ev.startedAt));
    const mx = W * 0.04, my = H * 0.04;

    for (const c of order) {
      const s = c.slotRef!;
      if (c.state === 'in') c.setTexts(s, this.strings);
      c.measure(R0);
      // live tip: only the marker and the first leader segment follow it
      spikeTip(s, cx, cy, R, jitPhase, this.tip);
      const M = this.tip;
      // the text block is anchored to a *still* tip: resting ring (no breathing, drift or jitter)
      // and the full spike length (no energy boil) — so the text never shivers
      const cx0 = W / 2, cy0 = H / 2, Rk = R0 * 1.03;   // 1.03: room for breathing + drift
      const rA = 1.04 + s.spike;
      const A = { x: cx0 + R0 * rA * Math.cos(s.theta), y: cy0 + R0 * rA * Math.sin(s.theta) };
      const ro = 0.5 * this.markerSize * R0;
      const mDist = R0 * rA;
      const side0 = Math.cos(s.theta) >= 0 ? 1 : -1;
      const v0 = Math.sin(s.theta) < 0 ? -1 : 1;

      // a placement is valid when the block is on screen, outside the ring + ridges + clearance,
      // does not cover the marker, other blocks or their leaders
      const ok = (ch: Choice) => {
        const g = this.geometry(c, A, ch.dy, ch.s, ch.v, ch.sc * this.textScale, R0, ch.slant);
        if (g.r.x0 < mx || g.r.x1 > W - mx || g.r.y0 < my || g.r.y1 > H - my) return false;
        if (rectDist(g.r, cx0, cy0) < Rk * (1.03 + maxRidge * ch.ridge + ch.clear)) return false;
        // the leader must not cut across the ring or the ridges
        if (segDist(A.x, A.y, g.ux, g.uy, cx0, cy0) < Math.min(Rk * (1.1 + maxRidge), mDist * 0.98)) return false;
        if (inRect(g.r, A.x, A.y, ro * 1.3)) return false;
        if (this.placed.some((p) => overlap(p, g.r, 10))) return false;
        if (this.placed.some((p) => segHits(p, A.x, A.y, g.ux, g.uy))) return false;
        return true;
      };
      // keep the current placement while it stays valid (no jumps); search only when it breaks
      if (!c.choice || !ok(c.choice)) {
        c.lastSearch = now;
        const found = this.search(ok, R0, side0, v0);
        if (found) c.choice = found;
        else if (!c.choice) c.choice = { dy: 0.4 * R0, v: v0, s: side0, sc: 0.5, slant: this.leaderAngle * RAD, clear: 0, ridge: 0 };
      }
      const best = c.choice;
      // smooth (snap on first frame or when the block flips)
      if (c.dy < 0 || best.v !== c.vdir || best.s !== c.side || best.slant !== c.slant) {
        c.dy = best.dy; c.vdir = best.v; c.side = best.s; c.sc = best.sc; c.slant = best.slant;
      } else { const k = Math.min(1, dt * 8); c.dy += (best.dy - c.dy) * k; c.sc += (best.sc - c.sc) * k; }
      const g = this.geometry(c, A, c.dy, c.side, c.vdir, c.sc * this.textScale, R0, c.slant);
      this.placed.push(g.r);
      this.draw(c, now, M, g, R0, c.sc * this.textScale, ro, pal);
    }
  }

  /** First valid placement in priority order: leader length, clearance, text size, side, angle, direction, height. */
  private search(ok: (ch: Choice) => boolean, R: number, s0: number, v0: number): Choice | null {
    let lo = 0.12 * R;
    for (const tier of TIERS) {
      for (const cl of [...CLEAR_ALT.map((k) => ({ ridge: 1, gap: this.gap * k })), { ridge: 0, gap: 0.12 }])
        for (const sc of SCALES)
          for (const s of [s0, -s0])
            for (const slant of SLANT_ALT.map((d) => Math.min(85, Math.max(20, this.leaderAngle + d)) * RAD))
              for (const v of [v0, -v0])
                for (let dy = lo; dy < tier * R; dy += 6) {
                  const ch = { dy, v, s, sc, slant, clear: cl.gap, ridge: cl.ridge };
                  if (ok(ch)) return ch;
                }
      lo = tier * R;
    }
    return null;
  }

  /** Block geometry for a given leader height. Text aligns to the bracket (outer side). */
  private geometry(c: Callout, M: { x: number; y: number }, dy: number, s: number, v: number, sc: number, R: number, slant: number) {
    const uy = M.y + v * dy;
    const ux = M.x + s * (dy / Math.tan(slant));
    const textW = Math.max(...c.widths) * sc;
    const ext = 0.15 * textW, gap = 0.03 * R * sc;
    const xb = ux + s * (ext + textW + gap);
    const y4 = uy - 0.02 * R * sc, y3 = y4 - 0.064 * R * sc, y2 = y3 - 0.074 * R * sc, y1 = y2 - 0.095 * R * sc;
    const top = y1 - 0.062 * R * sc;
    const r: Rect = { x0: Math.min(ux, xb) - 2, x1: Math.max(ux, xb) + 2, y0: top, y1: uy + 3 };
    const px = (v: number) => Math.round(v) + 0.5;          // crisp 1 px lines, whole-pixel text
    return { ux: px(ux), uy: px(uy), xb: px(xb), y: [y1, y2, y3, y4].map(Math.round), gap: Math.round(gap), r };
  }

  private draw(c: Callout, now: number, M: { x: number; y: number },
    g: ReturnType<Callouts['geometry']>, R: number, sc: number, ro: number, pal: Palette) {
    // timeline
    let kMark: number, kLead: number, kText: number;
    if (c.state === 'in') {
      const t = now - c.t0;
      kMark = easeOut(seg(t, T_MARK[0], T_MARK[1]));
      kLead = easeOut(seg(t, T_LEAD[0], T_LEAD[1]));
      kText = seg(t, 1100, 1100 + Math.max(50, this.typeMs));
    } else {
      const t = now - c.tOut;                    // reverse order, 0.8 s
      kText = 1 - seg(t, 0, 300);
      kLead = 1 - seg(t, 300, 550);
      kMark = 1 - seg(t, 550, T_OUT);
      if (t >= T_OUT) { c.state = 'idle'; c.slotRef = null; c.g.style.display = 'none'; return; }
    }

    // marker: scale 0 → 1 with a 30° turn
    const rot = 30 * (1 - kMark);
    c.marker.setAttribute('transform', `translate(${M.x.toFixed(1)},${M.y.toFixed(1)}) rotate(${rot.toFixed(1)}) scale(${kMark.toFixed(3)})`);
    c.hexO.setAttribute('points', hexPoints(ro));
    c.hexI.setAttribute('points', hexPoints(ro / 3));
    c.hexO.style.stroke = c.hexI.style.stroke = pal.line;
    c.dot.style.fill = pal.dot;
    c.marker.style.opacity = kMark > 0.001 ? '1' : '0';

    // leader: marker edge → bend → underline → bracket foot
    const dx = g.ux - M.x, dyy = g.uy - M.y, L = Math.hypot(dx, dyy) || 1;
    const sx = M.x + (dx / L) * ro, sy = M.y + (dyy / L) * ro;
    c.leader.setAttribute('points', `${sx.toFixed(1)},${sy.toFixed(1)} ${g.ux.toFixed(1)},${g.uy.toFixed(1)} ${g.xb.toFixed(1)},${g.uy.toFixed(1)}`);
    c.leader.style.stroke = pal.line;
    c.leader.style.strokeDasharray = '1 1.001';
    c.leader.style.strokeDashoffset = String(1 - kLead);

    // bracket on the outer side, three serifs (rows 2–4); the bottom one is the underline
    const s = c.side, ser = 0.022 * R * sc;
    const yTop = g.y[1] - 0.072 * R * sc;
    const ys2 = g.y[1] - 0.032 * R * sc, ys3 = g.y[2] - 0.02 * R * sc;
    c.bracket.setAttribute('d',
      `M${g.xb.toFixed(1)},${g.uy.toFixed(1)} L${g.xb.toFixed(1)},${yTop.toFixed(1)} ` +
      `M${g.xb.toFixed(1)},${ys2.toFixed(1)} L${(g.xb - s * ser).toFixed(1)},${ys2.toFixed(1)} ` +
      `M${g.xb.toFixed(1)},${ys3.toFixed(1)} L${(g.xb - s * ser).toFixed(1)},${ys3.toFixed(1)}`);
    c.bracket.style.stroke = pal.line;
    c.bracket.style.strokeDasharray = '1 1.001';
    c.bracket.style.strokeDashoffset = String(1 - clamp01((kLead - 0.6) / 0.4));

    // text, aligned to the bracket
    const anchor = s > 0 ? 'end' : 'start';
    const tx = s > 0 ? g.xb - g.gap : g.xb + g.gap;
    const fills = [pal.date, pal.key, pal.body, pal.body];
    for (let i = 0; i < 4; i++) {
      const t = c.txt[i];
      t.setAttribute('x', tx.toFixed(1));
      t.setAttribute('y', g.y[i].toFixed(1));
      t.setAttribute('text-anchor', anchor);
      t.style.fontSize = `${(Math.round(FS[i] * R * sc * 2) / 2).toFixed(1)}px`;
      t.style.fill = fills[i];
    }
    c.title.style.fill = pal.title;
    c.renderText(kText);
  }
}

// ---- geometry helpers ----
function rectDist(r: Rect, x: number, y: number): number {
  const qx = Math.max(r.x0, Math.min(x, r.x1)), qy = Math.max(r.y0, Math.min(y, r.y1));
  return Math.hypot(qx - x, qy - y);
}
function inRect(r: Rect, x: number, y: number, pad: number): boolean {
  return x > r.x0 - pad && x < r.x1 + pad && y > r.y0 - pad && y < r.y1 + pad;
}
function overlap(a: Rect, b: Rect, pad: number): boolean {
  return a.x0 - pad < b.x1 && b.x0 - pad < a.x1 && a.y0 - pad < b.y1 && b.y0 - pad < a.y1;
}
function segDist(x0: number, y0: number, x1: number, y1: number, px: number, py: number): number {
  const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / l2));
  return Math.hypot(x0 + dx * t - px, y0 + dy * t - py);
}
function segHits(r: Rect, x0: number, y0: number, x1: number, y1: number): boolean {
  for (let i = 1; i < 10; i++) {
    const t = i / 10;
    if (inRect(r, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 4)) return true;
  }
  return false;
}
