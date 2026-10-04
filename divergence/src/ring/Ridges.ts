// Ridges and main spikes as one particle pool (section 4). Allocated once; positions are
// computed in the vertex shader from per-particle seeds and the event uniforms.
import * as THREE from 'three';
import common from '../../shaders/common.glsl?raw';
import vert from '../../shaders/ridges.vert.glsl?raw';
import frag from '../../shaders/ridges.frag.glsl?raw';
import { MAX_SLOTS, type Slot } from '../events/EventBus';

export const POOL_MAX = 250000;
const SPIKE_SHARE = 0.12;
// Particle density targets: shares are normalised by at least these capacities, so a
// small event gets a proportional (not the whole) part of the pool.
const RIDGE_CAP = 0.2;    // ≈ half of a level-3 sector (0.18 R × 2.27 rad)
const SPIKE_CAP = 0.9;

export class Ridges {
  readonly points: THREE.Points;
  readonly geo = new THREE.BufferGeometry();
  readonly u = {
    uC: { value: new THREE.Vector2() },
    uR: { value: 100 },
    uDpr: { value: 1 },
    uWavePhase: { value: 0 },
    uJitPhase: { value: 0 },
    uEv: { value: Array.from({ length: MAX_SLOTS }, () => new THREE.Vector4()) },
    uEvS: { value: Array.from({ length: MAX_SLOTS }, () => new THREE.Vector4()) },
    uCdfR: { value: new Array(MAX_SLOTS).fill(0) as number[] },
    uCdfS: { value: new Array(MAX_SLOTS).fill(0) as number[] },
    uLayers: { value: 9 },
    uWaveFreq: { value: 7 },
    uWaveAmp: { value: 0.35 },
    uSize: { value: 1.25 },
    uSpikeW: { value: 0.06 },
    uDot: { value: new THREE.Color(0x1a1a1a) },
    uAlpha: { value: 1 },
    uTA: { value: 0 }, uTB: { value: 0 }, uWA: { value: 1 },
  };

  constructor() {
    const seed = new Float32Array(POOL_MAX * 4);
    const kind = new Float32Array(POOL_MAX);
    for (let i = 0; i < POOL_MAX; i++) {
      for (let j = 0; j < 4; j++) seed[i * 4 + j] = Math.random();
      kind[i] = Math.random() < SPIKE_SHARE ? 1 : 0;
    }
    this.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(POOL_MAX * 3), 3));
    this.geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    this.geo.setAttribute('aKind', new THREE.BufferAttribute(kind, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: this.u,
      vertexShader: common + '\n' + vert,
      fragmentShader: frag,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 1;
  }

  setCount(n: number) {
    this.geo.setDrawRange(0, Math.max(0, Math.min(POOL_MAX, Math.round(n))));
  }

  /** Copy slot state into uniforms and recompute the particle shares (no allocations). */
  sync(slots: Slot[]) {
    let sumR = 0, sumS = 0;
    for (let i = 0; i < MAX_SLOTS; i++) {
      const s = slots[i];
      const on = s.phase !== 'free' && s.energy > 0;
      const e = on ? s.energy : 0;
      this.u.uEv.value[i].set(s.theta, s.width, s.height, e);
      this.u.uEvS.value[i].set(s.spike * e, s.jitter, 0, 0);
      sumR += e * s.height * s.width;
      sumS += e * s.spike;
    }
    const capR = Math.max(sumR, RIDGE_CAP), capS = Math.max(sumS, SPIKE_CAP);
    let accR = 0, accS = 0;
    for (let i = 0; i < MAX_SLOTS; i++) {
      const s = slots[i];
      const e = s.phase !== 'free' ? s.energy : 0;
      accR += (e * s.height * s.width) / capR;
      accS += (e * s.spike) / capS;
      this.u.uCdfR.value[i] = e > 0 ? accR : -1;
      this.u.uCdfS.value[i] = e > 0 ? accS : -1;
    }
  }
}
