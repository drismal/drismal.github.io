// ---- ridges and main spikes: GPU particles --------------------------------
attribute vec4 aSeed;   // four uniform randoms
attribute float aKind;  // 0 ridge, 1 main spike
uniform vec2 uC;
uniform float uR, uDpr, uWavePhase, uJitPhase;
uniform vec4 uEv[8];    // θ0, half-width (rad), height (R), energy
uniform vec4 uEvS[8];   // spike length * energy (R), jitter phase, -, -
uniform float uCdfR[8], uCdfS[8];   // cumulative particle shares; above the last = idle
uniform float uLayers, uWaveFreq, uWaveAmp, uSize, uSpikeW;
varying float vA;

float bump(float d, float w){ float u = d / max(w, 1e-4); return exp(-u*u*2.5); }
float H(float th){
  float h = 0.;
  for(int i = 0; i < 8; i++){ vec4 e = uEv[i]; if(e.w <= 0.) continue; h += e.w*e.z*bump(angDiff(th, e.x), e.y); }
  return h * (.6 + .4*ringFT(th, 8., .1, 0.));
}

void main(){
  int k = -1;
  for(int i = 0; i < 8; i++){ float c = aKind < .5 ? uCdfR[i] : uCdfS[i]; if(k < 0 && aSeed.x < c) k = i; }
  vA = 0.;
  if(k < 0){ gl_Position = vec4(2., 2., 2., 1.); gl_PointSize = 0.; return; }
  vec4 e = uEv[k];
  float h1 = hash12(aSeed.yz*41.3), h2 = hash12(aSeed.zw*17.9), h3 = hash12(aSeed.wy*29.1);
  float th, r, a;

  if(aKind < .5){
    // 4.2 ridge: stacked wavy contour layers — dark crest line + sparse stipple below it
    th = e.x + e.y * 1.25 * (aSeed.y - h1);              // triangular ≈ bell across the sector
    float h = H(th);
    float L = floor(aSeed.w * uLayers);
    float fr = uWaveFreq * (.8 + .5*hash12(vec2(L, 9.1)));
    float wave = sin(th*fr + hash12(vec2(L, 3.7))*6.2831 + uWavePhase*(1. + .3*hash12(vec2(L, 1.3))));
    float wn = ringFT(th, 5., .03, L*7.) - .5;
    float crest = (L + .75 + wave*uWaveAmp + wn*1.2) / uLayers;
    bool onCrest = aSeed.z < .55;
    float rr = onCrest ? crest + (h2 - .5)*.18/uLayers : crest - h2*1.05/uLayers;
    rr = clamp(rr, 0., 1.08);
    r = 1.03 + h * rr;
    a = (onCrest ? .95 : .4) * (.65 + .35*wave) * mix(1., .4, rr) * (1. - .6*smoothstep(.85, 1.05, rr));
    a *= smoothstep(.002, .008, h);
  } else {
    // 4.3 main spike: a tongue of the same dots, narrowing to a 1–2 px point
    float Ls = uEvS[k].x;
    float s = pow(aSeed.y, .85);
    float hw = uSpikeW*.5*pow(1. - s, 1.15) + .0012;
    float lay = floor(aSeed.w * 7.);
    float wv = sin(s*38. + lay*1.9 + uWavePhase*8.);
    float lat = ((aSeed.z*2. - 1.)*.8 + wv*.2) * hw;
    r = 1.04 + s*Ls;
    th = e.x + lat/r + .004*sin(uJitPhase + uEvS[k].y)*s;   // tip jitter mirrored on the CPU
    a = (.8 - .35*s) * smoothstep(.003, .015, Ls);
  }
  vec2 pos = uC + uR * r * vec2(cos(th), sin(th));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 0., 1.);
  gl_PointSize = uSize * uDpr * (.8 + .5*h3);
  vA = a;
}
