// Full-screen ring pass (sections 3, 6.2, 6.3).
import * as THREE from 'three';
import common from '../../shaders/common.glsl?raw';
import frag from '../../shaders/ring.frag.glsl?raw';

export const NEEDLES = 24;

export class RingPass {
  readonly mesh: THREE.Mesh;
  readonly u = {
    uRes: { value: new THREE.Vector2() },
    uDpr: { value: 1 },
    uC: { value: new THREE.Vector2() },
    uR: { value: 100 },
    uBg: { value: new THREE.Color() },
    uInk: { value: new THREE.Color() },
    uNight: { value: 0 },
    uLobeAmp: { value: 0.02 },
    uRippleAmp: { value: 0.009 },
    uBoil: { value: 0.25 },
    uThreadOff: { value: 0.012 },
    uCoreW: { value: 0.0045 },
    uCore: { value: 1 },
    uStipple: { value: 0.08 },
    uStippleT: { value: 0 },
    uNeedle: { value: Array.from({ length: NEEDLES }, () => new THREE.Vector4()) },
    uEclipse: { value: 0 },
    uEclAng: { value: 0 },
    uEclWidth: { value: 0.35 },
    uRayLen: { value: 0.6 },
    uTA: { value: 0 }, uTB: { value: 0 }, uWA: { value: 1 },
  };

  constructor() {
    const mat = new THREE.ShaderMaterial({
      uniforms: this.u,
      vertexShader: 'void main(){ gl_Position = vec4(position.xy, 0., 1.); }',
      fragmentShader: common + '\n' + frag,
      depthTest: false,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 0;
  }
}
