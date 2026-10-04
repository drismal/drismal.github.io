// Ridges and main spikes as one particle pool (section 4). Allocated once; positions are
// computed in the vertex shader from per-particle seeds and the event uniforms.
import * as THREE from 'three';
import common from '../../shaders/common.glsl?raw';
import vert from '../../shaders/ridges.vert.glsl?raw';
import frag from '../../shaders/ridges.frag.glsl?raw';
import { MAX_SLOTS, type Slot } from '../events/EventBus';

export const POOL_MAX = 250000;
const SPIKE_SHARE = 0.12;
// Each of the 8 slots owns a fixed 1/8 of the pool. A slot shows weight / CAP of its
// partition (clamped to 1): one level-3 sector fills it, smaller events show less.
const RIDGE_CAP = 0.3;    // height × half-width (R·rad)
const SPIKE_CAP = 0.45;   // spike length (R)

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
    uShareR: { value: new Array(MAX_SLOTS).fill(0) as number[] },
    uShareS: { value: new Array(MAX_SLOTS).fill(0) as number[] },
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

  /** Copy slot state into uniforms. Shares follow the (tweened) shape, never the boiling
   *  energy, so the set of visible particles is stable from frame to frame. */
  sync(slots: Slot[]) {
    for (let i = 0; i < MAX_SLOTS; i++) {
      const s = slots[i];
      const e = s.phase !== 'free' ? Math.max(0, s.energy) : 0;
      this.u.uEv.value[i].set(s.theta, s.width, s.height, e);
      this.u.uEvS.value[i].set(s.spike * e, s.jitter, 0, 0);
      if (s.phase !== 'free') {
        this.u.uShareR.value[i] = Math.min(1, (s.height * s.width) / RIDGE_CAP);
        this.u.uShareS.value[i] = Math.min(1, s.spike / SPIKE_CAP);
      }
    }
  }
}
