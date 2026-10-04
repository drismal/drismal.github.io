// Configuration: public/config.json is fetched at start-up, so sensors, rules and
// look can be changed without rebuilding.

export type Level = 0 | 1 | 2 | 3;

export interface RuleCfg {
  /** Expression, e.g. "state == 'on' && minutes >= 10", "outside(207, 253)", "delta(180) < -3". */
  when: string;
  level: Level;
  text: string;
  /** Template for the 4th line: {value} {unit} {state} {delta:180} */
  value?: string;
}

export interface SensorCfg {
  id: string;
  /** Home Assistant entity_id */
  entity?: string;
  /** MQTT topic (payload: number, text or JSON) */
  topic?: string;
  /** dotted path inside a JSON payload, e.g. "voltage" or "data.temp" */
  valuePath?: string;
  /** side of the ring for this sensor: 0° = right, clockwise */
  angle: number;
  title: string;
  unit?: string;
  /** "no data" rule; 0 disables. Default 15 min. */
  staleMinutes?: number;
  rules: RuleCfg[];
}

export interface Strings {
  divergence: string;
  valuePrefix: string;
  noConnection: string;
  lostConnection: string;
  lostConnectionValue: string;
}

export interface Params {
  particles: number;          // particle pool in use (adaptive 60k..250k)
  lobeAmp: number;            // outer-edge petals, fraction of R
  rippleAmp: number;          // outer-edge ripple, fraction of R
  boil: number;               // edge boiling speed
  threadOffset: number;       // double-thread separation, fraction of R
  coreWidth: number;          // thread half-width, fraction of R
  stipple: number;            // ink grain, ±fraction of darkness
  ridgeHeightScale: number;   // × the level heights of 6.1 (the ring's own halo covers 1.03–1.10 R)
  ridgeLayers: number;        // wavy contour layers in a ridge
  ridgeWaveFreq: number;      // waves per radian along a layer
  ridgeWaveAmp: number;       // wave amplitude in layer units
  ridgeAlpha: number;
  dotSize: number;            // particle size, CSS px
  spikeWidth: number;         // main spike base width, fraction of R
  tau: number;                // settle time constant, s
  eclipseWidth: number;       // crescent width, fraction of R
  rayLength: number;          // eclipse rays, fraction of R
  breathAmp: number;
  breathPeriod: number;
  driftAmp: number;
  driftPeriod: number;
  // background needles (level 0) and secondary needles (events)
  bgNeedleMin: number; bgNeedleMax: number;          // count at rest
  bgNeedleLenMin: number; bgNeedleLenMax: number;    // R
  bgNeedleLifeMin: number; bgNeedleLifeMax: number;  // s
  secNeedleCount: number;     // × the 4.4 counts per level
  secNeedleLenMin: number; secNeedleLenMax: number;  // R
  secNeedleLifeMin: number; secNeedleLifeMax: number; // s
  needleWidth: number;        // × cone base width
  needleWave: number;         // lateral waviness, R
  needleWaveFreq: number;     // waves along a needle
  needleWaveSpeed: number;
  needleBunch: number;        // chance of a bunch of 2–3
  needleNearEvent: number;    // share of needles near events (vs anywhere)
  needleGrow: number;         // s
  needleRetract: number;      // s
  // main divergence spikes
  spikeLen1: number; spikeLen2: number; spikeLen3: number;   // R per level
  spikeTiers: number;         // storeys (0 = smooth cone)
  spikeTierDepth: number;     // 0 smooth … 1 sharp steps
  spikeTaper: number;         // profile exponent
  spikeWave: number;          // dot layers waviness
  spikeJitter: number;        // tip tremble, rad
  // ridges per level
  ridgeH1: number; ridgeH2: number; ridgeH3: number;         // R
  ridgeW1: number; ridgeW2: number; ridgeW3: number;         // sector half-width, deg
  ridgePeakFreq: number;      // summits per radian
  ridgePeakSharp: number;     // summit sharpness (power)
  ridgePeakAmt: number;
  ridgeSwell: number;
  ridgeFill: number;          // share of dots on contour lines (rest is dust)
  ridgeWaveSpeed: number;
  // events
  attack: number;             // s
  oneShotHold: number;        // s
  demoMin: number; demoMax: number;                          // s between demo events
  demoP1: number; demoP2: number; demoP3: number;            // level weights
  demoHoldMin: number; demoHoldMax: number;                  // s
  demoOneShot: number;        // chance of a one-shot event
  // eclipse
  eclipseIn: number; eclipseOut: number;                     // s
  eclipseInner: number;       // inner darkening
  rayFreq: number; rayDensity: number;
  // callouts
  maxCallouts: number;
  leaderAngle: number;        // deg
  markerSize: number;         // R (hexagon diameter)
  calloutGap: number;         // R from the ridges
  typeTime: number;           // s
  // ring extras
  threadDim: number;          // second thread brightness (× first)
  innerWobble: number;        // inner edge deviation, R
  // night
  nightDim: number;
  nightFade: number;          // s
  ringScale: number;          // × the radius of section 2
  textScale: number;          // × callout text size
  dayBg: string; dayInk: string; nightBg: string; nightInk: string;
}

export interface AppConfig {
  adapter: 'demo' | 'homeassistant' | 'mqtt' | 'none';
  homeassistant?: { url: string; token: string; sunEntity?: string };
  mqtt?: { url: string; username?: string; password?: string };
  night?: { source: 'ha_sun' | 'time' | 'off'; from?: string; to?: string };
  strings: Strings;
  params: Params;
  sensors: SensorCfg[];
}

export const DEFAULT_PARAMS: Params = {
  particles: 200000,
  lobeAmp: 0.03,
  rippleAmp: 0.012,
  boil: 0.25,
  threadOffset: 0.012,
  coreWidth: 0.0065,
  stipple: 0.08,
  ridgeHeightScale: 1.5,
  ridgeLayers: 6,
  ridgeWaveFreq: 16.0,
  ridgeWaveAmp: 0.55,
  ridgeAlpha: 1.0,
  dotSize: 1.6,
  spikeWidth: 0.09,
  tau: 1.8,
  eclipseWidth: 0.35,
  rayLength: 0.6,
  breathAmp: 0.02,
  breathPeriod: 20,
  driftAmp: 0.008,
  driftPeriod: 90,
  bgNeedleMin: 2, bgNeedleMax: 5, bgNeedleLenMin: 0.03, bgNeedleLenMax: 0.06, bgNeedleLifeMin: 8, bgNeedleLifeMax: 20,
  secNeedleCount: 1, secNeedleLenMin: 0.05, secNeedleLenMax: 0.2, secNeedleLifeMin: 1, secNeedleLifeMax: 4,
  needleWidth: 1, needleWave: 0, needleWaveFreq: 2, needleWaveSpeed: 1, needleBunch: 0.35, needleNearEvent: 0.6,
  needleGrow: 0.3, needleRetract: 1.5,
  spikeLen1: 0.15, spikeLen2: 0.3, spikeLen3: 0.45, spikeTiers: 0, spikeTierDepth: 0.8, spikeTaper: 1.15, spikeWave: 0.2, spikeJitter: 0.0015,
  ridgeH1: 0.04, ridgeH2: 0.1, ridgeH3: 0.18, ridgeW1: 12, ridgeW2: 40, ridgeW3: 130,
  ridgePeakFreq: 24, ridgePeakSharp: 3, ridgePeakAmt: 1.1, ridgeSwell: 0.5, ridgeFill: 0.3, ridgeWaveSpeed: 1,
  attack: 0.4, oneShotHold: 8,
  demoMin: 15, demoMax: 60, demoP1: 0.5, demoP2: 0.32, demoP3: 0.18, demoHoldMin: 6, demoHoldMax: 24, demoOneShot: 0.25,
  eclipseIn: 1.5, eclipseOut: 3, eclipseInner: 0.15, rayFreq: 40, rayDensity: 0.4,
  maxCallouts: 4, leaderAngle: 60, markerSize: 0.15, calloutGap: 0.25, typeTime: 0.6,
  threadDim: 0.7, innerWobble: 0.0025,
  nightDim: 0.3, nightFade: 10,
  ringScale: 1,
  textScale: 1,
  dayBg: '#f9f9f9', dayInk: '#111111', nightBg: '#050505', nightInk: '#a6a6a6',
};

export const DEFAULT_STRINGS: Strings = {
  divergence: 'DIVERGENCE',
  valuePrefix: 'VALUE: ',
  noConnection: 'NO CONNECTION TO HOME',
  lostConnection: 'SENSOR CONNECTION LOST',
  lostConnectionValue: 'NO DATA FOR {minutes} MIN',
};

export async function loadConfig(): Promise<AppConfig> {
  let raw: Partial<AppConfig> = {};
  try {
    const r = await fetch('config.json', { cache: 'no-store' });
    if (r.ok) raw = await r.json();
  } catch {
    // no config: demo with defaults
  }
  return {
    adapter: raw.adapter ?? 'demo',
    homeassistant: raw.homeassistant,
    mqtt: raw.mqtt,
    night: raw.night ?? { source: 'time', from: '22:00', to: '07:00' },
    strings: { ...DEFAULT_STRINGS, ...(raw.strings ?? {}) },
    params: { ...DEFAULT_PARAMS, ...(raw.params ?? {}) },
    sensors: raw.sensors ?? [],
  };
}
