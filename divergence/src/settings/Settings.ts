// Settings window: touch-friendly panel with live preview, presets, test events and
// persistence on the device (localStorage) plus JSON export / import for config.json.
import { DEFAULT_PARAMS, type Level, type Params, type Strings } from '../config';

const STORE_KEY = 'divergence.settings.v1';

export interface SettingsApi {
  params: Params;
  strings: Strings;
  trigger(level: Level, angleDeg: number): void;
  endAll(): void;
  nightMode(): 'auto' | 'day' | 'night';
  setNightMode(m: 'auto' | 'day' | 'night'): void;
  eclipse(): boolean;
  setEclipse(v: boolean): void;
  demo(): boolean;
  setDemo(v: boolean): void;
  setParticles(n: number): void;
  /** call after params that need a re-layout (ring size) */
  changed(key: keyof Params | 'strings'): void;
  stats: { fps: number; particles: number };
}

type NumKey = { [K in keyof Params]: Params[K] extends number ? K : never }[keyof Params];
type ColorKey = { [K in keyof Params]: Params[K] extends string ? K : never }[keyof Params];
interface Slider { key: NumKey; label: string; min: number; max: number; step: number; hint?: string; fmt?: (v: number) => string }

const pctR = (v: number) => `${(v * 100).toFixed(1)} % R`;
const x = (v: number) => `× ${v.toFixed(2)}`;
const sec = (v: number) => `${v.toFixed(1)} с`;
const k = (v: number) => `${Math.round(v / 1000)} тыс.`;

const TABS: { id: string; title: string; sliders?: Slider[] }[] = [
  {
    id: 'ring', title: 'Кольцо', sliders: [
      { key: 'ringScale', label: 'Размер кольца', min: 0.6, max: 1.25, step: 0.01, fmt: x, hint: 'Радиус = 0,30 ширины экрана, но не больше 0,40 высоты' },
      { key: 'coreWidth', label: 'Толщина нити', min: 0.002, max: 0.015, step: 0.0005, fmt: pctR },
      { key: 'threadOffset', label: 'Расхождение двух нитей', min: 0, max: 0.03, step: 0.001, fmt: pctR },
      { key: 'lobeAmp', label: 'Крупные лепестки края', min: 0, max: 0.06, step: 0.001, fmt: pctR, hint: '6–7 волн по окружности' },
      { key: 'rippleAmp', label: 'Мелкая рябь края', min: 0, max: 0.03, step: 0.001, fmt: pctR },
      { key: 'stipple', label: 'Зернистость туши', min: 0, max: 0.3, step: 0.01, fmt: (v) => `±${Math.round(v * 100)} %` },
    ],
  },
  {
    id: 'ridges', title: 'Хребты', sliders: [
      { key: 'ridgeHeightScale', label: 'Высота хребтов', min: 0.5, max: 3, step: 0.05, fmt: x },
      { key: 'ridgeLayers', label: 'Число слоёв (горизонталей)', min: 3, max: 14, step: 1, fmt: (v) => `${v}` },
      { key: 'ridgeWaveFreq', label: 'Частота волн', min: 3, max: 30, step: 0.5, fmt: (v) => `${v.toFixed(1)} / рад` },
      { key: 'ridgeWaveAmp', label: 'Волнистость слоёв', min: 0, max: 1.2, step: 0.01, fmt: (v) => v.toFixed(2) },
      { key: 'ridgeAlpha', label: 'Плотность туши', min: 0.2, max: 2, step: 0.01, fmt: x },
      { key: 'dotSize', label: 'Размер точки', min: 0.6, max: 4, step: 0.05, fmt: (v) => `${v.toFixed(2)} px` },
      { key: 'spikeWidth', label: 'Ширина главного шипа', min: 0.02, max: 0.16, step: 0.002, fmt: pctR },
      { key: 'particles', label: 'Число частиц', min: 60000, max: 250000, step: 5000, fmt: k, hint: 'Меньше — быстрее на слабом планшете' },
    ],
  },
  {
    id: 'callouts', title: 'Подписи', sliders: [
      { key: 'textScale', label: 'Размер текста', min: 0.6, max: 1.6, step: 0.01, fmt: x },
    ],
  },
  {
    id: 'motion', title: 'Движение', sliders: [
      { key: 'boil', label: 'Скорость «кипения» края', min: 0, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) },
      { key: 'tau', label: 'Время оседания события', min: 0.5, max: 6, step: 0.1, fmt: sec, hint: 'Через 3τ хребты почти исчезают' },
      { key: 'breathAmp', label: 'Дыхание кольца', min: 0, max: 0.05, step: 0.001, fmt: (v) => `±${(v * 100).toFixed(1)} %` },
      { key: 'breathPeriod', label: 'Период дыхания', min: 5, max: 60, step: 1, fmt: (v) => `${v} с` },
      { key: 'driftAmp', label: 'Дрейф центра', min: 0, max: 0.03, step: 0.001, fmt: (v) => `±${(v * 100).toFixed(1)} %` },
      { key: 'eclipseWidth', label: 'Ширина серпа (уровень 3)', min: 0.1, max: 0.7, step: 0.01, fmt: pctR },
      { key: 'rayLength', label: 'Длина лучей затмения', min: 0.1, max: 1.2, step: 0.01, fmt: pctR },
    ],
  },
  { id: 'color', title: 'Цвет' },
  { id: 'test', title: 'Тест' },
  { id: 'file', title: 'Файл' },
];

const PRESETS: { name: string; p: Partial<Params> }[] = [
  { name: 'Спокойный', p: { lobeAmp: 0.015, rippleAmp: 0.006, boil: 0.15, stipple: 0.05, ridgeHeightScale: 1.1, ridgeWaveAmp: 0.4, breathAmp: 0.01, driftAmp: 0.005, tau: 2.4 } },
  { name: 'Как в сериале', p: {} },
  { name: 'Драма', p: { lobeAmp: 0.04, rippleAmp: 0.016, boil: 0.4, ridgeHeightScale: 2.0, ridgeWaveAmp: 0.75, spikeWidth: 0.11, eclipseWidth: 0.45, rayLength: 0.85, tau: 1.4 } },
];

const CSS = `
#st-gear{position:fixed;right:18px;bottom:18px;width:46px;height:46px;border-radius:50%;border:1px solid #bbb;background:rgba(249,249,249,.85);
  color:#444;font-size:22px;line-height:44px;text-align:center;cursor:pointer;opacity:0;transition:opacity .5s;z-index:20;-webkit-tap-highlight-color:transparent}
#st-gear.on{opacity:.7}
#st{position:fixed;top:0;right:0;bottom:0;width:min(400px,100vw);background:rgba(250,250,248,.94);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
  border-left:1px solid #d6d6d6;box-shadow:-10px 0 40px rgba(0,0,0,.08);z-index:30;display:flex;flex-direction:column;cursor:auto;
  font-family:"Divergence","Barlow Condensed","Roboto Condensed","Arial Narrow",sans-serif;color:#222;transform:translateX(105%);visibility:hidden;transition:transform .35s cubic-bezier(.2,.8,.2,1),visibility 0s .35s}
#st.open{transform:none;visibility:visible;transition:transform .35s cubic-bezier(.2,.8,.2,1)}
#st *{box-sizing:border-box}
#st header{display:flex;align-items:center;justify-content:space-between;padding:18px 20px 8px}
#st h2{margin:0;font-weight:500;font-size:22px;letter-spacing:.12em}
#st .x{border:0;background:none;font-size:30px;line-height:1;color:#666;cursor:pointer;padding:4px 8px}
#st .presets{display:flex;gap:6px;padding:4px 20px 10px}
#st .presets button{flex:1}
#st nav{display:flex;flex-wrap:wrap;gap:4px;padding:0 20px 10px;border-bottom:1px solid #e2e2e2}
#st nav button{border:1px solid transparent;background:none;padding:7px 10px;font:inherit;font-size:15px;letter-spacing:.06em;color:#666;border-radius:6px;cursor:pointer}
#st nav button.on{border-color:#cfcfcf;background:#fff;color:#111}
#st .body{flex:1;overflow-y:auto;padding:14px 20px 30px;-webkit-overflow-scrolling:touch}
#st .row{margin:0 0 18px}
#st .lab{display:flex;justify-content:space-between;align-items:baseline;font-size:16px;margin-bottom:6px}
#st .lab output{font-variant-numeric:tabular-nums;color:#777;font-size:14px}
#st .hint{font-size:13px;color:#999;margin-top:4px;line-height:1.3}
#st input[type=range]{width:100%;height:34px;-webkit-appearance:none;appearance:none;background:transparent;touch-action:pan-y}
#st input[type=range]::-webkit-slider-runnable-track{height:2px;background:#cfcfcf}
#st input[type=range]::-moz-range-track{height:2px;background:#cfcfcf}
#st input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:24px;height:24px;margin-top:-11px;border-radius:50%;background:#fff;border:1.5px solid #333}
#st input[type=range]::-moz-range-thumb{width:22px;height:22px;border-radius:50%;background:#fff;border:1.5px solid #333}
#st button.b{border:1px solid #c9c9c9;background:#fff;border-radius:8px;padding:11px 12px;font:inherit;font-size:15px;letter-spacing:.05em;color:#222;cursor:pointer}
#st button.b:active{background:#eee}
#st button.b.dark{background:#222;color:#fff;border-color:#222}
#st .grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin:10px 0 16px}
#st .seg{display:flex;border:1px solid #c9c9c9;border-radius:8px;overflow:hidden;margin:6px 0 18px}
#st .seg button{flex:1;border:0;background:#fff;padding:11px 0;font:inherit;font-size:15px;cursor:pointer;color:#555}
#st .seg button.on{background:#222;color:#fff}
#st .color{display:flex;align-items:center;justify-content:space-between;margin:0 0 12px;font-size:16px}
#st input[type=color]{width:52px;height:34px;border:1px solid #c9c9c9;border-radius:6px;background:#fff;padding:2px}
#st input[type=text]{width:100%;padding:10px;border:1px solid #c9c9c9;border-radius:8px;font:inherit;font-size:16px;background:#fff}
#st h3{font-weight:500;font-size:15px;letter-spacing:.1em;color:#888;margin:18px 0 10px}
#st .dial{display:block;margin:6px auto 4px;touch-action:none;cursor:crosshair}
#st .toggle{display:flex;justify-content:space-between;align-items:center;font-size:16px;margin:0 0 14px}
#st .toggle input{width:22px;height:22px}
#st .fps{font-size:14px;color:#888;font-variant-numeric:tabular-nums}
#st footer{padding:12px 20px;border-top:1px solid #e2e2e2;display:flex;gap:8px;align-items:center}
#st footer .saved{flex:1;font-size:13px;color:#999}
`;

/** Load what was saved on this device over the config values. */
export function loadSaved(p: Params, s: Strings) {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const j = JSON.parse(raw);
    Object.assign(p, j.params ?? {});
    Object.assign(s, j.strings ?? {});
  } catch { /* storage unavailable */ }
}

function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...kids: (Node | string)[]) {
  const e = document.createElement(tag);
  for (const key in props) {
    if (key === 'class') e.className = String(props[key]);
    else if (key.startsWith('on')) (e as unknown as Record<string, unknown>)[key] = props[key];
    else e.setAttribute(key, String(props[key]));
  }
  e.append(...kids);
  return e;
}

export class Settings {
  private root = h('div', { id: 'st' });
  private gear = h('div', { id: 'st-gear', title: 'Настройки' }, '⚙');
  private body = h('div', { class: 'body' });
  private nav = h('nav');
  private savedMsg = h('span', { class: 'saved' });
  private tab = 'ring';
  private gearTimer = 0;
  private saveTimer = 0;
  private fpsEl: HTMLElement | null = null;
  private dialAngle = 315;

  constructor(private api: SettingsApi) {
    document.head.append(h('style', {}, CSS));
    const stop = (e: Event) => e.stopPropagation();
    this.root.addEventListener('pointerdown', stop);
    this.root.addEventListener('keydown', stop);
    this.gear.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.open(); });

    const presets = h('div', { class: 'presets' }, ...PRESETS.map((pr) =>
      h('button', { class: 'b', onclick: () => this.applyPreset(pr.p) }, pr.name)));
    for (const t of TABS) {
      const b = h('button', { onclick: () => { this.tab = t.id; this.render(); } }, t.title);
      b.dataset.id = t.id;
      this.nav.append(b);
    }
    this.root.append(
      h('header', {}, h('h2', {}, 'НАСТРОЙКИ'), h('button', { class: 'x', onclick: () => this.close(), 'aria-label': 'Закрыть' }, '×')),
      presets, this.nav, this.body,
      h('footer', {}, this.savedMsg, h('button', { class: 'b', onclick: () => this.resetTab() }, 'Сбросить вкладку')),
    );
    document.body.append(this.gear, this.root);

    // the gear shows up on any touch / mouse move and fades out again
    const wake = () => {
      this.gear.classList.add('on');
      clearTimeout(this.gearTimer);
      this.gearTimer = window.setTimeout(() => this.gear.classList.remove('on'), 4000);
    };
    addEventListener('pointerdown', wake);
    addEventListener('pointermove', wake);
    addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.close();
      if ((e.key === 's' || e.key === 'S' || e.key === 'ы' || e.key === 'Ы') && !this.isOpen()) this.open();
    });
    setInterval(() => { if (this.fpsEl) this.fpsEl.textContent = `${this.api.stats.fps} кадров/с · ${Math.round(this.api.stats.particles / 1000)} тыс. частиц`; }, 500);
  }

  isOpen() { return this.root.classList.contains('open'); }
  open() { this.render(); this.root.classList.add('open'); document.body.style.cursor = 'auto'; this.shiftStage(true); }
  close() { this.root.classList.remove('open'); document.body.style.cursor = ''; this.shiftStage(false); }
  /** slide the picture left so the whole ring stays visible next to the panel */
  private shiftStage(on: boolean) {
    const stage = document.getElementById('stage');
    if (!stage) return;
    stage.style.transition = 'transform .35s cubic-bezier(.2,.8,.2,1)';
    const w = Math.min(400, innerWidth);
    stage.style.transform = on && innerWidth > 700 ? `translateX(${-Math.round(w / 2)}px)` : '';
  }
  toggle() { if (this.isOpen()) this.close(); else this.open(); }

  // ---------- persistence ----------
  private save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify({ params: this.api.params, strings: this.api.strings }));
        this.savedMsg.textContent = 'Сохранено на этом устройстве';
      } catch {
        this.savedMsg.textContent = 'Не удалось сохранить на устройстве';
      }
    }, 300);
  }

  private set<K extends keyof Params>(key: K, v: Params[K]) {
    this.api.params[key] = v;
    if (key === 'particles') this.api.setParticles(v as number);
    this.api.changed(key);
    this.save();
  }

  private applyPreset(p: Partial<Params>) {
    const P = this.api.params;
    const keep = { particles: P.particles, ringScale: P.ringScale, textScale: P.textScale,
      dayBg: P.dayBg, dayInk: P.dayInk, nightBg: P.nightBg, nightInk: P.nightInk };
    Object.assign(P, DEFAULT_PARAMS, keep, p);
    (Object.keys(P) as (keyof Params)[]).forEach((key) => this.api.changed(key));
    this.save();
    this.render();
  }

  private resetTab() {
    const t = TABS.find((x) => x.id === this.tab);
    if (t?.sliders) for (const s of t.sliders) this.set(s.key, DEFAULT_PARAMS[s.key]);
    if (this.tab === 'color') for (const c of ['dayBg', 'dayInk', 'nightBg', 'nightInk'] as ColorKey[]) this.set(c, DEFAULT_PARAMS[c]);
    this.render();
  }

  // ---------- rendering ----------
  private render() {
    this.nav.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.id === this.tab));
    this.body.replaceChildren();
    this.fpsEl = null;
    const t = TABS.find((x) => x.id === this.tab)!;
    if (t.sliders) t.sliders.forEach((s) => this.body.append(this.slider(s)));
    if (t.id === 'ridges') { this.fpsEl = h('div', { class: 'fps' }); this.body.append(this.fpsEl); }
    if (t.id === 'callouts') this.renderCallouts();
    if (t.id === 'color') this.renderColor();
    if (t.id === 'test') this.renderTest();
    if (t.id === 'file') this.renderFile();
  }

  private slider(s: Slider): HTMLElement {
    const P = this.api.params;
    const out = h('output', {}, (s.fmt ?? String)(P[s.key] as number));
    const inp = h('input', { type: 'range', min: s.min, max: s.max, step: s.step, value: P[s.key] }) as HTMLInputElement;
    inp.addEventListener('input', () => {
      const v = parseFloat(inp.value);
      out.textContent = (s.fmt ?? String)(v);
      this.set(s.key, v);
    });
    return h('div', { class: 'row' }, h('div', { class: 'lab' }, h('span', {}, s.label), out), inp, ...(s.hint ? [h('div', { class: 'hint' }, s.hint)] : []));
  }

  private textField(label: string, get: () => string, setv: (v: string) => void, hint?: string) {
    const inp = h('input', { type: 'text', value: get() }) as HTMLInputElement;
    inp.addEventListener('input', () => { setv(inp.value); this.api.changed('strings'); this.save(); });
    return h('div', { class: 'row' }, h('div', { class: 'lab' }, h('span', {}, label)), inp, ...(hint ? [h('div', { class: 'hint' }, hint)] : []));
  }

  private renderCallouts() {
    const S = this.api.strings;
    this.body.append(
      this.textField('Слово-заголовок', () => S.divergence, (v) => { S.divergence = v.toUpperCase(); }, 'Вторая строка: «DIVERGENCE : МЕСТО»'),
      this.textField('Префикс значения', () => S.valuePrefix, (v) => { S.valuePrefix = v.toUpperCase(); }, 'Ставится перед значением, если в нём нет двоеточия'),
      this.textField('Строка «нет связи»', () => S.noConnection, (v) => { S.noConnection = v.toUpperCase(); }),
    );
  }

  private renderColor() {
    const mode = this.api.nightMode();
    const seg = h('div', { class: 'seg' }, ...([['auto', 'Авто'], ['day', 'День'], ['night', 'Ночь']] as const).map(([m, label]) =>
      h('button', { class: m === mode ? 'on' : '', onclick: () => { this.api.setNightMode(m); this.render(); } }, label)));
    const color = (key: ColorKey, label: string) => {
      const inp = h('input', { type: 'color', value: this.api.params[key] }) as HTMLInputElement;
      inp.addEventListener('input', () => this.set(key, inp.value));
      return h('label', { class: 'color' }, h('span', {}, label), inp);
    };
    this.body.append(
      h('h3', {}, 'РЕЖИМ'), seg,
      h('div', { class: 'hint' }, 'Авто — по закату (Home Assistant) или по расписанию из config.json. Переход 10 с.'),
      h('h3', {}, 'ДЕНЬ'), color('dayBg', 'Фон'), color('dayInk', 'Тушь кольца'),
      h('h3', {}, 'НОЧЬ'), color('nightBg', 'Фон'), color('nightInk', 'Свечение кольца'),
    );
  }

  private renderTest() {
    // dial: tap where the event should appear
    const size = 220, c = size / 2, r = 78;
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', String(size)); svg.setAttribute('height', String(size)); svg.setAttribute('class', 'dial');
    const ring = document.createElementNS(NS, 'circle');
    ring.setAttribute('cx', String(c)); ring.setAttribute('cy', String(c)); ring.setAttribute('r', String(r));
    ring.setAttribute('fill', 'none'); ring.setAttribute('stroke', '#222'); ring.setAttribute('stroke-width', '3');
    const dot = document.createElementNS(NS, 'circle');
    dot.setAttribute('r', '9'); dot.setAttribute('fill', '#fff'); dot.setAttribute('stroke', '#222'); dot.setAttribute('stroke-width', '2');
    const label = document.createElementNS(NS, 'text');
    label.setAttribute('x', String(c)); label.setAttribute('y', String(c + 6)); label.setAttribute('text-anchor', 'middle');
    label.setAttribute('font-size', '18'); label.setAttribute('fill', '#555');
    const place = () => {
      const a = (this.dialAngle * Math.PI) / 180;
      dot.setAttribute('cx', String(c + (r + 14) * Math.cos(a))); dot.setAttribute('cy', String(c + (r + 14) * Math.sin(a)));
      label.textContent = `${Math.round(this.dialAngle)}°`;
    };
    const pick = (e: PointerEvent) => {
      const b = svg.getBoundingClientRect();
      this.dialAngle = ((Math.atan2(e.clientY - b.top - c, e.clientX - b.left - c) * 180) / Math.PI + 360) % 360;
      place();
    };
    svg.addEventListener('pointerdown', (e) => { svg.setPointerCapture(e.pointerId); pick(e); });
    svg.addEventListener('pointermove', (e) => { if (e.buttons) pick(e); });
    svg.append(ring, dot, label);
    place();

    const toggle = (label: string, get: () => boolean, setv: (v: boolean) => void) => {
      const inp = h('input', { type: 'checkbox' }) as HTMLInputElement;
      inp.checked = get();
      inp.addEventListener('change', () => setv(inp.checked));
      return h('label', { class: 'toggle' }, h('span', {}, label), inp);
    };
    this.fpsEl = h('div', { class: 'fps' });
    this.body.append(
      h('h3', {}, 'СТОРОНА СОБЫТИЯ'),
      svg,
      h('div', { class: 'hint', style: 'text-align:center' }, 'Коснитесь круга, где должно появиться событие'),
      h('div', { class: 'grid' },
        h('button', { class: 'b', onclick: () => this.api.trigger(1, this.dialAngle) }, 'Уровень 1'),
        h('button', { class: 'b', onclick: () => this.api.trigger(2, this.dialAngle) }, 'Уровень 2'),
        h('button', { class: 'b dark', onclick: () => this.api.trigger(3, this.dialAngle) }, 'Тревога'),
      ),
      h('button', { class: 'b', style: 'width:100%;margin-bottom:18px', onclick: () => this.api.endAll() }, 'Завершить все события'),
      toggle('Демо-события (каждые 15–60 с)', () => this.api.demo(), (v) => this.api.setDemo(v)),
      toggle('Затмение вручную', () => this.api.eclipse(), (v) => this.api.setEclipse(v)),
      this.fpsEl,
    );
  }

  private renderFile() {
    const json = () => JSON.stringify({ params: this.api.params, strings: this.api.strings }, null, 2);
    const file = h('input', { type: 'file', accept: 'application/json,.json', style: 'display:none' }) as HTMLInputElement;
    file.addEventListener('change', async () => {
      const f = file.files?.[0];
      if (!f) return;
      try {
        const j = JSON.parse(await f.text());
        Object.assign(this.api.params, j.params ?? {});
        Object.assign(this.api.strings, j.strings ?? {});
        (Object.keys(this.api.params) as (keyof Params)[]).forEach((key) => this.api.changed(key));
        this.api.setParticles(this.api.params.particles);
        this.save();
        this.savedMsg.textContent = 'Настройки загружены из файла';
        this.render();
      } catch {
        this.savedMsg.textContent = 'Не удалось прочитать файл';
      }
    });
    const status = h('div', { class: 'hint' });
    this.body.append(
      h('div', { class: 'hint', style: 'margin-bottom:14px' },
        'Изменения сразу сохраняются на этом устройстве. Чтобы перенести их на другой экран, сохраните файл и вставьте его содержимое в config.json (поля "params" и "strings").'),
      h('div', { style: 'display:grid;gap:8px' },
        h('button', { class: 'b dark', onclick: () => {
          const a = h('a', { href: URL.createObjectURL(new Blob([json()], { type: 'application/json' })), download: 'divergence-settings.json' }) as HTMLAnchorElement;
          a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        } }, 'Сохранить в файл'),
        h('button', { class: 'b', onclick: async () => {
          try { await navigator.clipboard.writeText(json()); status.textContent = 'Скопировано в буфер обмена'; }
          catch { status.textContent = 'Буфер обмена недоступен — используйте «Сохранить в файл»'; }
        } }, 'Скопировать как текст'),
        h('button', { class: 'b', onclick: () => file.click() }, 'Загрузить из файла'),
        h('button', { class: 'b', onclick: () => this.applyPreset({ ...DEFAULT_PARAMS }) }, 'Сбросить всё к заводским'),
      ),
      status, file,
    );
  }
}
