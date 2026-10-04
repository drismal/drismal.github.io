// Rule engine: sensor states -> DivergenceEvents. Expressions are parsed by a tiny
// recursive-descent parser (no eval), e.g.
//   state == 'on' && minutes >= 10      outside(207, 253)      abs(delta(60)) > 5
import type { Level, SensorCfg, Strings } from '../config';
import type { DivergenceEvent } from '../events/EventBus';

export interface SensorState {
  state: string;
  value: number;          // NaN when not numeric
  attrs: Record<string, unknown>;
  lastChanged: number;    // ms
  lastUpdated: number;    // ms
  history: { t: number; v: number }[];   // up to 6 h, ≥ 30 s apart
}

// ---------- expressions ----------
type Tok = { k: 'num' | 'str' | 'id' | 'op'; v: string };
type Ctx = { vars: Record<string, number | string>; fn: Record<string, (...a: (number | string)[]) => number | string | boolean> };
type Node = (c: Ctx) => number | string | boolean;

function lex(src: string): Tok[] {
  const out: Tok[] = [];
  const re = /\s*(?:(\d+(?:[.,]\d+)?)|'([^']*)'|"([^"]*)"|([A-Za-z_][\w.]*)|(==|!=|<=|>=|&&|\|\||[-+*/<>!(),]))/y;
  let m: RegExpExecArray | null;
  re.lastIndex = 0;
  while (re.lastIndex < src.length && (m = re.exec(src))) {
    if (m[1] !== undefined) out.push({ k: 'num', v: m[1].replace(',', '.') });
    else if (m[2] !== undefined || m[3] !== undefined) out.push({ k: 'str', v: (m[2] ?? m[3])! });
    else if (m[4] !== undefined) out.push({ k: 'id', v: m[4] });
    else if (m[5] !== undefined) out.push({ k: 'op', v: m[5] });
    if (/^\s*$/.test(src.slice(re.lastIndex))) break;
  }
  return out;
}

export function compile(src: string): Node {
  const t = lex(src);
  let i = 0;
  const peek = () => t[i], eat = (v?: string) => { const x = t[i++]; if (v && (!x || x.v !== v)) throw new Error(`rule "${src}": expected ${v}`); return x; };
  const num = (x: unknown) => (typeof x === 'number' ? x : typeof x === 'boolean' ? (x ? 1 : 0) : parseFloat(String(x)));
  const truthy = (x: unknown) => (typeof x === 'string' ? x.length > 0 : !!x && !Number.isNaN(x));
  const bin = (lhs: () => Node, ops: string[], f: (o: string, a: any, b: any) => any): (() => Node) => () => {
    let a = lhs();
    while (peek() && peek().k === 'op' && ops.includes(peek().v)) {
      const o = eat().v, b = lhs(), A = a;
      a = (c) => f(o, A(c), b(c));
    }
    return a;
  };
  const primary = (): Node => {
    const x = eat();
    if (!x) throw new Error(`rule "${src}": unexpected end`);
    if (x.k === 'num') { const v = parseFloat(x.v); return () => v; }
    if (x.k === 'str') return () => x.v;
    if (x.k === 'op' && x.v === '(') { const e = or(); eat(')'); return e; }
    if (x.k === 'op' && x.v === '!') { const e = primary(); return (c) => !truthy(e(c)); }
    if (x.k === 'op' && x.v === '-') { const e = primary(); return (c) => -num(e(c)); }
    if (x.k === 'id') {
      if (peek() && peek().v === '(') {
        eat('(');
        const args: Node[] = [];
        if (peek() && peek().v !== ')') { args.push(or()); while (peek() && peek().v === ',') { eat(','); args.push(or()); } }
        eat(')');
        return (c) => { const f = c.fn[x.v]; if (!f) throw new Error(`unknown function ${x.v}`); return f(...args.map((a) => a(c) as number | string)); };
      }
      if (x.v === 'true') return () => true;
      if (x.v === 'false') return () => false;
      return (c) => c.vars[x.v] ?? NaN;
    }
    throw new Error(`rule "${src}": unexpected ${x.v}`);
  };
  const mul = bin(primary, ['*', '/'], (o, a, b) => (o === '*' ? num(a) * num(b) : num(a) / num(b)));
  const add = bin(mul, ['+', '-'], (o, a, b) => (o === '+' ? num(a) + num(b) : num(a) - num(b)));
  const cmp = bin(add, ['<', '>', '<=', '>=', '==', '!='], (o, a, b) => {
    if (o === '==') return typeof a === 'string' || typeof b === 'string' ? String(a) === String(b) : num(a) === num(b);
    if (o === '!=') return typeof a === 'string' || typeof b === 'string' ? String(a) !== String(b) : num(a) !== num(b);
    const A = num(a), B = num(b);
    return o === '<' ? A < B : o === '>' ? A > B : o === '<=' ? A <= B : A >= B;
  });
  const and = bin(cmp, ['&&'], (_o, a, b) => truthy(a) && truthy(b));
  const or = bin(and, ['||'], (_o, a, b) => truthy(a) || truthy(b));
  const root = or();
  if (i < t.length) throw new Error(`rule "${src}": trailing ${t[i].v}`);
  return (c) => truthy(root(c));
}

// ---------- engine ----------
const fmt = (v: number, d = 1) => (Number.isFinite(v) ? v.toFixed(d).replace('-', '−') : '—');

export class RuleEngine {
  readonly states = new Map<string, SensorState>();
  private compiled = new Map<string, Node>();
  private activeLevel = new Map<string, Level>();
  private startedAt = new Map<string, number>();

  constructor(private sensors: SensorCfg[], private strings: Strings, private emit: (e: DivergenceEvent) => void) {
    for (const s of sensors) for (const r of s.rules) {
      try { this.compiled.set(r.when, compile(r.when)); } catch (e) { console.warn(e); }
    }
  }

  sensorByKey(key: string): SensorCfg | undefined {
    return this.sensors.find((s) => s.entity === key || s.topic === key || s.id === key);
  }

  /** Feed a new reading (from HA, MQTT, ...). */
  update(key: string, state: string, attrs: Record<string, unknown> = {}, now = Date.now()) {
    const cfg = this.sensorByKey(key);
    if (!cfg) return;
    let st = this.states.get(cfg.id);
    const value = parseFloat(String(state).replace(',', '.'));
    if (!st) {
      st = { state, value, attrs, lastChanged: now, lastUpdated: now, history: [] };
      this.states.set(cfg.id, st);
    } else {
      if (st.state !== state) st.lastChanged = now;
      st.state = state; st.value = value; st.attrs = attrs; st.lastUpdated = now;
    }
    if (Number.isFinite(value)) {
      const h = st.history, last = h[h.length - 1];
      if (!last || now - last.t >= 30000) h.push({ t: now, v: value });
      while (h.length && now - h[0].t > 6 * 3600e3) h.shift();
    }
    this.evaluate(cfg, now);
  }

  /** Time-based rules (durations, stale data, deltas): call every few seconds. */
  tick(now = Date.now()) {
    for (const cfg of this.sensors) this.evaluate(cfg, now);
  }

  private evaluate(cfg: SensorCfg, now: number) {
    const st = this.states.get(cfg.id);
    let level: Level = 0, text = '', valueTpl = '';
    const staleMin = cfg.staleMinutes ?? 15;
    if (st) {
      const delta = (min: number) => {
        const t = now - min * 60000;
        const h = st.history;
        if (!h.length || h[0].t > t + 60000) return NaN;          // not enough history yet
        let past = h[0].v;
        for (const p of h) { if (p.t <= t) past = p.v; else break; }
        return st.value - past;
      };
      const ctx: Ctx = {
        vars: {
          state: st.state, value: st.value,
          seconds: (now - st.lastChanged) / 1000, minutes: (now - st.lastChanged) / 60000,
          stale: (now - st.lastUpdated) / 60000,
        },
        fn: {
          outside: (a, b) => st.value < +a || st.value > +b,
          between: (a, b) => st.value >= +a && st.value <= +b,
          abs: (x) => Math.abs(+x),
          delta: (m) => delta(+m),
          attr: (n) => (st.attrs[String(n)] as string | number) ?? '',
        },
      };
      for (const r of cfg.rules) {
        const f = this.compiled.get(r.when);
        try {
          if (f && f(ctx) && r.level > level) { level = r.level; text = r.text; valueTpl = r.value ?? '{value} {unit}'; }
        } catch { /* ignore broken rule */ }
      }
      if (level === 0 && staleMin > 0 && (now - st.lastUpdated) / 60000 > staleMin) {
        level = 1; text = this.strings.lostConnection;
        valueTpl = this.strings.lostConnectionValue.replace('{minutes}', String(Math.round((now - st.lastUpdated) / 60000)));
      }
      if (level > 0) {
        valueTpl = valueTpl
          .replace(/\{value\}/g, Number.isFinite(st.value) ? fmt(st.value, Math.abs(st.value) >= 100 ? 0 : 1) : st.state)
          .replace(/\{state\}/g, st.state)
          .replace(/\{unit\}/g, cfg.unit ?? '')
          .replace(/\{delta:(\d+)\}/g, (_m, m) => { const d = delta(+m); return (d > 0 ? '+' : '') + fmt(d, 1); })
          .trim();
      }
    }
    const prev = this.activeLevel.get(cfg.id) ?? 0;
    if (level > 0) {
      if (prev === 0) this.startedAt.set(cfg.id, now);
      this.activeLevel.set(cfg.id, level);
      this.emit({
        id: `sensor:${cfg.id}`, sensorId: cfg.id, angle: cfg.angle, level, title: cfg.title,
        text, value: valueTpl, startedAt: this.startedAt.get(cfg.id) ?? now, active: true,
      });
    } else if (prev > 0) {
      this.activeLevel.set(cfg.id, 0);
      this.emit({
        id: `sensor:${cfg.id}`, sensorId: cfg.id, angle: cfg.angle, level: prev, title: cfg.title,
        text: '', value: '', startedAt: this.startedAt.get(cfg.id) ?? now, active: false,
      });
    }
  }
}
