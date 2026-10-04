// Divergence ring — wall screen for a smart home.
import * as THREE from 'three';
import { loadConfig, type Level } from './config';
import { EventBus, shape, type DivergenceEvent } from './events/EventBus';
import { RingPass } from './ring/RingPass';
import { Ridges, POOL_MAX } from './ring/Ridges';
import { Needles } from './ring/Needles';
import { Callouts, type Palette } from './callouts/Callouts';
import { RuleEngine } from './data/rules';
import { HomeAssistant } from './data/HomeAssistant';
import { Mqtt } from './data/Mqtt';
import { Demo, SAMPLES } from './data/Demo';
import type { Adapter, AdapterHooks } from './data/types';
import { toggleDebug, type DebugApi } from './debug';

THREE.ColorManagement.enabled = false;   // colours are used as plain sRGB values in custom shaders
const Q = new URLSearchParams(location.search);
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const TAU = Math.PI * 2;

// colours (6.3): day / night; night is also 30 % dimmer
const C = {
  dayBg: new THREE.Color('#F9F9F9'), nightBg: new THREE.Color('#050505'),
  dayInk: new THREE.Color('#111111'), nightInk: new THREE.Color('#EDEDED').multiplyScalar(0.7),
  dayDot: new THREE.Color('#1a1a1a'),
};
const PAL_DAY: Palette = { line: '#999999', dot: '#333333', date: '#666666', key: '#111111', title: '#777777', body: '#444444' };
const PAL_NIGHT: Palette = { line: '#888888', dot: '#cccccc', date: '#999999', key: '#ededed', title: '#999999', body: '#cccccc' };

function mixHex(a: string, b: string, t: number, k = 1): string {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round((((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t) * k);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

async function main() {
  const cfg = await loadConfig();
  const P = cfg.params;
  const stage = document.getElementById('stage')!;
  const svg = document.getElementById('callouts') as unknown as SVGSVGElement;
  const status = document.getElementById('status')!;

  // ---- renderer ----
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: Q.has('test') });
  let dprCap = Q.has('dpr') ? +Q.get('dpr')! : 1.5;
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, dprCap));
  stage.insertBefore(renderer.domElement, svg);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(0, 1, 0, 1, -1, 1);   // CSS px, y down
  const ring = new RingPass();
  const ridges = new Ridges();
  scene.add(ring.mesh, ridges.points);
  const bus = new EventBus();
  const needles = new Needles();
  const callouts = new Callouts(svg, cfg.strings);

  let W = 0, H = 0, R0 = 0;
  const resize = () => {
    W = innerWidth; H = innerHeight;
    renderer.setSize(W, H);
    camera.right = W; camera.bottom = H; camera.updateProjectionMatrix();
    R0 = Math.min(0.30 * W, 0.40 * H);                 // section 2
    callouts.resize(W, H);
  };
  addEventListener('resize', resize);
  resize();
  await document.fonts?.ready;

  // ---- data ----
  const emit = (e: DivergenceEvent) => bus.emit(e);
  const engine = new RuleEngine(cfg.sensors, cfg.strings, emit);
  const adapterName = Q.get('adapter') ?? (Q.get('demo') === '1' ? 'demo' : cfg.adapter);
  let connected = true, lostSince = 0, sunNight: boolean | null = null;
  const hooks: AdapterHooks = {
    onState: (k, s, a) => engine.update(k, s, a),
    onStatus: (c) => { connected = c; if (!c && !lostSince) lostSince = performance.now(); if (c) lostSince = 0; },
    onSun: (b) => { sunNight = b; },
  };
  let adapter: Adapter | null = null;
  if (adapterName === 'homeassistant' && cfg.homeassistant) {
    const ents = new Set(cfg.sensors.map((s) => s.entity).filter((e): e is string => !!e));
    adapter = new HomeAssistant(cfg.homeassistant.url, cfg.homeassistant.token, ents, hooks, cfg.homeassistant.sunEntity);
    hooks.onStatus(false);
  } else if (adapterName === 'mqtt' && cfg.mqtt) {
    adapter = new Mqtt(cfg.mqtt.url, cfg.sensors, hooks, cfg.mqtt);
    hooks.onStatus(false);
  } else if (adapterName === 'demo') {
    adapter = new Demo(cfg.sensors, emit);
  }
  adapter?.start();
  setInterval(() => engine.tick(), 5000);

  // ---- manual events (keys, debug panel, tests) ----
  let manualN = 0;
  const trigger = (level: Level, angle = Math.random() * 360, holdMs = 8000 + Math.random() * 6000) => {
    const id = `manual:${++manualN}`;
    const s = SAMPLES[manualN % SAMPLES.length];
    bus.emit({ id, sensorId: 'manual', angle, level, title: s.title, text: s.text, value: s.value, startedAt: Date.now(), active: true });
    if (holdMs > 0) setTimeout(() => bus.end(id), holdMs);
    return id;
  };
  let manualNight: boolean | null = Q.has('night') ? Q.get('night') === '1' : null;
  let manualEclipse = false;
  const stats = { fps: 0, particles: 0 };
  const debugApi: DebugApi = {
    params: P,
    trigger: (l, a) => trigger(l, a),
    endAll: () => bus.endAll(),
    toggleNight: () => { manualNight = !(manualNight ?? nightTarget()); },
    toggleEclipse: () => { manualEclipse = !manualEclipse; },
    setParticles: (n) => { particles = clamp(n, 60000, POOL_MAX); adaptive = false; },
    stats,
  };
  (window as unknown as Record<string, unknown>).divergence = {
    trigger, end: (id: string) => bus.end(id), endAll: () => bus.endAll(), clear: () => bus.clear(),
    bus, params: P, get state() { return { W, H, R, cx, cy, night, eclipse: ecl, particles, fps: stats.fps }; },
    setNight: (v: boolean | null) => { manualNight = v; }, setEclipse: (v: boolean) => { manualEclipse = v; },
  };
  addEventListener('keydown', (e) => {
    if (e.key >= '1' && e.key <= '3') trigger(+e.key as Level);
    else if (e.key === '0') bus.clear();
    else if (e.key === 'n' || e.key === 'N' || e.key === 'т' || e.key === 'Т') debugApi.toggleNight();
    else if (e.key === 'e' || e.key === 'E' || e.key === 'у' || e.key === 'У') debugApi.toggleEclipse();
  });
  let lastTap = 0;
  addEventListener('pointerdown', () => { const t = performance.now(); if (t - lastTap < 350) toggleDebug(debugApi); lastTap = t; });
  if (Q.get('debug') === '1') toggleDebug(debugApi);

  // ---- night (6.3) ----
  const hm = (s = '00:00') => { const [h, m] = s.split(':').map(Number); return h * 60 + (m || 0); };
  function nightTarget(): boolean {
    if (manualNight !== null) return manualNight;
    const n = cfg.night;
    if (!n || n.source === 'off') return false;
    if (n.source === 'ha_sun' && sunNight !== null) return sunNight;
    const d = new Date(), m = d.getHours() * 60 + d.getMinutes(), a = hm(n.from ?? '22:00'), b = hm(n.to ?? '07:00');
    return a > b ? m >= a || m < b : m >= a && m < b;
  }
  let night = nightTarget() ? 1 : 0;

  // ---- adaptive quality (1) ----
  let particles = clamp(P.particles, 60000, POOL_MAX);
  let adaptive = !Q.has('particles');
  if (Q.has('particles')) particles = clamp(+Q.get('particles')!, 1000, POOL_MAX);
  let shown = particles;          // drawn count glides toward `particles` (no density pops)
  ridges.setCount(shown);
  let qStart = performance.now(), qFrames = 0, qRound = 0;
  let fpsT = performance.now(), fpsN = 0;

  // ---- frame loop (no allocations) ----
  let R = R0, cx = W / 2, cy = H / 2, ecl = 0, eclAng = 0, core = 1, last = performance.now();
  const t0 = performance.now();
  const bg = new THREE.Color(), ink = new THREE.Color(), dot = new THREE.Color();
  const pal: Palette = { ...PAL_DAY };

  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const t = (now - t0) / 1000;
    bus.tau = P.tau;
    shape.heightScale = P.ridgeHeightScale;
    bus.update(now);

    // breathing and slow drift of the centre (2)
    R = R0 * (1 + P.breathAmp * Math.sin((TAU * t) / P.breathPeriod));
    cx = W / 2 + P.driftAmp * W * Math.sin((TAU * t) / P.driftPeriod);
    cy = H / 2 + P.driftAmp * H * Math.cos((TAU * t) / (P.driftPeriod * 1.37));

    // clocks: two wrapping clocks cross-faded; periodic phases computed in double precision
    const tA = t % 4096, tB = (t + 2048) % 4096, wA = 1 - Math.abs(tA / 2048 - 1);
    const wavePhase = (t * 0.05) % TAU, jitPhase = (t * 7.3) % TAU;

    // level-driven globals
    const maxLevel = bus.maxLevel();
    let lvl2 = 0, eclTarget = manualEclipse ? 1 : 0, eclTargetAng = eclAng, maxRidge = 0;
    for (const s of bus.slots) {
      if (s.phase === 'free') continue;
      if (s.ev.level >= 2) lvl2 = Math.max(lvl2, Math.min(1, s.energy));
      if (s.ev.level === 3 && (s.phase === 'attack' || s.phase === 'hold')) { eclTarget = 1; eclTargetAng = s.theta; }
      maxRidge = Math.max(maxRidge, s.energy * s.height);
    }
    core += (1 + 0.35 * lvl2 - core) * Math.min(1, dt * 3);
    ecl = eclTarget > ecl ? Math.min(1, ecl + dt / 1.5) : Math.max(0, ecl - dt / 3);           // in 1.5 s, out 3 s
    const da = Math.atan2(Math.sin(eclTargetAng - eclAng), Math.cos(eclTargetAng - eclAng));
    eclAng = ecl < 0.01 ? eclTargetAng : eclAng + da * Math.min(1, dt * 2);
    const nt = nightTarget() ? 1 : 0;
    night = nt > night ? Math.min(1, night + dt / 10) : Math.max(0, night - dt / 10);          // 10 s transition

    // colours
    bg.copy(C.dayBg).lerp(C.nightBg, night);
    ink.copy(C.dayInk).lerp(C.nightInk, night);
    dot.copy(C.dayDot).lerp(C.nightInk, night);
    const k = 1 - 0.3 * night;
    (Object.keys(PAL_DAY) as (keyof Palette)[]).forEach((key) => { pal[key] = mixHex(PAL_DAY[key], PAL_NIGHT[key], night, k); });
    renderer.setClearColor(bg);
    document.body.style.background = `#${bg.getHexString()}`;

    // ring uniforms
    const u = ring.u;
    u.uRes.value.set(W, H); u.uDpr.value = renderer.getPixelRatio();
    u.uC.value.set(cx, cy); u.uR.value = R;
    u.uBg.value.copy(bg); u.uInk.value.copy(ink); u.uNight.value = night;
    u.uLobeAmp.value = P.lobeAmp; u.uRippleAmp.value = P.rippleAmp; u.uBoil.value = P.boil;
    u.uThreadOff.value = P.threadOffset; u.uCoreW.value = P.coreWidth; u.uCore.value = core;
    u.uStipple.value = P.stipple; u.uStippleT.value = (t * 0.5) % 1000;
    u.uEclipse.value = ecl; u.uEclAng.value = eclAng; u.uEclWidth.value = P.eclipseWidth; u.uRayLen.value = P.rayLength;
    u.uTA.value = tA; u.uTB.value = tB; u.uWA.value = wA;
    needles.update(now, bus.slots, maxLevel, u.uNeedle.value);

    // particle uniforms
    const v = ridges.u;
    v.uC.value.set(cx, cy); v.uR.value = R; v.uDpr.value = renderer.getPixelRatio();
    v.uWavePhase.value = wavePhase; v.uJitPhase.value = jitPhase;
    v.uLayers.value = Math.round(P.ridgeLayers); v.uWaveFreq.value = P.ridgeWaveFreq; v.uWaveAmp.value = P.ridgeWaveAmp;
    v.uSize.value = P.dotSize; v.uSpikeW.value = P.spikeWidth; v.uAlpha.value = P.ridgeAlpha;
    v.uDot.value.copy(dot);
    v.uTA.value = tA; v.uTB.value = tB; v.uWA.value = wA;
    ridges.sync(bus.slots);
    if (Math.abs(shown - particles) > 1) { shown += (particles - shown) * Math.min(1, dt * 0.8); ridges.setCount(shown); }

    renderer.render(scene, camera);
    callouts.update(now, dt, bus.slots, cx, cy, R, R0, W, H, jitPhase, maxRidge, pal);

    // status line: only after 5 s without connection
    status.textContent = cfg.strings.noConnection;
    status.style.color = pal.line;
    status.style.opacity = !connected && lostSince && now - lostSince > 5000 ? '1' : '0';

    // fps + adaptive quality: measure 5 s windows, step particles down (or up on fast devices)
    fpsN++;
    if (now - fpsT > 1000) { stats.fps = Math.round((fpsN * 1000) / (now - fpsT)); fpsN = 0; fpsT = now; }
    stats.particles = particles;
    qFrames++;
    if (adaptive && now - qStart > 5000 && qRound < 4) {
      const fps = (qFrames * 1000) / (now - qStart);
      if (fps < 28) {
        particles = Math.max(60000, particles * 0.6);
        if (dprCap > 1) { dprCap = 1; renderer.setPixelRatio(1); resize(); }
      } else if (fps < 40) particles = Math.max(60000, particles * 0.8);
      else if (fps > 57 && qRound > 0) particles = Math.min(POOL_MAX, particles * 1.3);
      qRound++; qStart = now; qFrames = 0;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

main();
