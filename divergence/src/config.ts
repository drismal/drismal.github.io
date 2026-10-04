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
  particles: 120000,
  lobeAmp: 0.03,
  rippleAmp: 0.012,
  boil: 0.25,
  threadOffset: 0.012,
  coreWidth: 0.0065,
  stipple: 0.08,
  ridgeHeightScale: 1.6,
  ridgeLayers: 9,
  ridgeWaveFreq: 7.0,
  ridgeWaveAmp: 0.6,
  ridgeAlpha: 1.0,
  dotSize: 2.0,
  spikeWidth: 0.06,
  tau: 1.8,
  eclipseWidth: 0.35,
  rayLength: 0.6,
  breathAmp: 0.02,
  breathPeriod: 20,
  driftAmp: 0.008,
  driftPeriod: 90,
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
