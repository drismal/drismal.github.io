// ?debug=1 or a double tap: lil-gui panel (loaded on demand).
import type { Params, Level } from './config';

export interface DebugApi {
  params: Params;
  trigger(level: Level, angle: number): void;
  endAll(): void;
  toggleNight(): void;
  toggleEclipse(): void;
  setParticles(n: number): void;
  stats: { fps: number; particles: number };
}

let gui: { show(v?: boolean): void; hide(): void; _hidden: boolean } | null = null;

export async function toggleDebug(api: DebugApi) {
  if (gui) { if (gui._hidden) gui.show(); else gui.hide(); return; }
  const { default: GUI } = await import('lil-gui');
  const g = new GUI({ title: 'Divergence · debug' });
  gui = g as unknown as typeof gui;
  const ev = { level: 2 as Level, angle: 315, go: () => api.trigger(ev.level, ev.angle), end: () => api.endAll() };
  const f1 = g.addFolder('Event');
  f1.add(ev, 'level', [1, 2, 3]).name('level');
  f1.add(ev, 'angle', 0, 359, 1).name('angle °');
  f1.add(ev, 'go').name('trigger');
  f1.add(ev, 'end').name('end all');
  const st = g.addFolder('State');
  st.add(api.stats, 'fps').listen().disable();
  st.add(api.stats, 'particles', 60000, 250000, 1000).name('particles').onChange((v: number) => api.setParticles(v)).listen();
  st.add({ night: () => api.toggleNight() }, 'night').name('day / night');
  st.add({ ecl: () => api.toggleEclipse() }, 'ecl').name('eclipse');
  const p = api.params;
  const f2 = g.addFolder('Ring (3)');
  f2.add(p, 'lobeAmp', 0, 0.05, 0.001).name('petals');
  f2.add(p, 'rippleAmp', 0, 0.03, 0.001).name('ripple');
  f2.add(p, 'boil', 0, 1, 0.01).name('boil');
  f2.add(p, 'threadOffset', 0, 0.03, 0.001).name('double thread');
  f2.add(p, 'coreWidth', 0.001, 0.012, 0.0005).name('thread width');
  f2.add(p, 'stipple', 0, 0.3, 0.01).name('grain');
  f2.add(p, 'breathAmp', 0, 0.05, 0.001).name('breathing');
  const f3 = g.addFolder('Ridges (4)');
  f3.add(p, 'ridgeHeightScale', 0.5, 3, 0.05).name('height ×');
  f3.add(p, 'ridgeLayers', 4, 14, 1).name('layers');
  f3.add(p, 'ridgeWaveFreq', 2, 14, 0.1).name('waves / rad');
  f3.add(p, 'ridgeWaveAmp', 0, 1, 0.01).name('amplitude');
  f3.add(p, 'ridgeAlpha', 0.2, 2, 0.01).name('density');
  f3.add(p, 'dotSize', 0.6, 3, 0.05).name('dot size');
  f3.add(p, 'spikeWidth', 0.02, 0.12, 0.001).name('spike width');
  const f4 = g.addFolder('Dynamics (6)');
  f4.add(p, 'tau', 0.5, 5, 0.1).name('settle τ, s');
  f4.add(p, 'eclipseWidth', 0.1, 0.6, 0.01).name('crescent width');
  f4.add(p, 'rayLength', 0.1, 1, 0.01).name('ray length');
  g.add({
    save: () => {
      const blob = new Blob([JSON.stringify({ params: p }, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'divergence-params.json'; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },
  }, 'save').name('save params as JSON');
}
