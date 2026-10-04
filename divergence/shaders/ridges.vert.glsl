// ---- ridges and main spikes: GPU particles --------------------------------
attribute vec4 aSeed;   // four uniform randoms
attribute float aKind;  // 0 ridge, 1 main spike
uniform vec2 uC;
uniform float uR, uDpr, uWavePhase, uJitPhase;
uniform vec4 uEv[8];    // θ0, half-width (rad), height (R), energy
uniform vec4 uEvS[8];   // spike length * energy (R), jitter phase, -, -
uniform float uShareR[8], uShareS[8];   // used fraction of each slot's fixed partition
uniform float uLayers, uWaveFreq, uWaveAmp, uSize, uSpikeW;
uniform vec4 uPeak;      // summits per rad, sharpness, amount, swell
uniform vec4 uSpikeP;    // storeys, step depth, taper, layer waviness
uniform float uRidgeFill, uJitAmp;
varying float vA;

float bump(float d, float w){ float u = d / max(w, 1e-4); return exp(-u*u*2.5); }
float H(float th){
  float h = 0.;
  for(int i = 0; i < 8; i++){ vec4 e = uEv[i]; if(e.w <= 0.) continue; h += e.w*e.z*bump(angDiff(th, e.x), e.y); }
  float swell = ringNT(th, 7., .06, 0.);
  float peaks = pow(ringNT(th, uPeak.x, .05, 11.), uPeak.y);     // sharp, sparse summits
  return h * (.4 + uPeak.w*swell + uPeak.z*peaks);
}

void main(){
  // every particle belongs to one slot forever (no hopping between events);
  // a slot shows the first `share` of its partition, energy only fades it
  float sx = aSeed.x * 8.;
  int k = int(min(floor(sx), 7.));
  float share = aKind < .5 ? uShareR[k] : uShareS[k];
  vec4 e = uEv[k];
  vA = 0.;
  if(fract(sx) >= share || e.w <= 0.){ gl_Position = vec4(2., 2., 2., 1.); gl_PointSize = 0.; return; }
  float h1 = hash12(aSeed.yz*41.3), h2 = hash12(aSeed.zw*17.9), h3 = hash12(aSeed.wy*29.1);
  float th, r, a;

  if(aKind < .5){
    // 4.2 ridge: stacked wavy contour layers — dark crest line + sparse stipple below it
    th = e.x + e.y * 1.25 * (aSeed.y - h1);              // triangular ≈ bell across the sector
    float h = H(th);
    float L = floor(aSeed.w * uLayers);
    float fr = uWaveFreq * (.8 + .5*hash12(vec2(L, 9.1)));
    float wave = sin(th*fr + hash12(vec2(L, 3.7))*6.2831 + uWavePhase*(1. + .3*hash12(vec2(L, 1.3))));
    float wn = ringNT(th, 5., .03, L*7.) - .5;
    float crest = (L + .75 + wave*uWaveAmp + wn*1.2) / uLayers;
    bool onCrest = aSeed.z < uRidgeFill;
    float rr = onCrest ? crest + (h2 - .5)*.22/uLayers : crest - h2*1.05/uLayers;
    rr = clamp(rr, 0., 1.08);
    r = 1.03 + h * rr;
    a = (onCrest ? .95 : .7) * (.8 + .2*wave) * mix(1., .75, rr) * (1. - .6*smoothstep(.85, 1.05, rr));
    a *= smoothstep(.002, .008, h) * min(1., e.w*1.4);
  } else {
    // 4.3 main spike: a tongue of the same dots, narrowing to a 1–2 px point
    float Ls = uEvS[k].x;
    float s = pow(aSeed.y, .85);
    // storeys: the width stays constant inside a storey and steps down at each floor
    float N = uSpikeP.x;
    float sq = N > .5 ? floor(s*N)/N : s;
    float hw = uSpikeW*.5*pow(1. - mix(s, sq, uSpikeP.y), uSpikeP.z) + .0012;
    float lay = floor(aSeed.w * 7.);
    float wv = sin(s*38. + lay*1.9 + uWavePhase*8.);
    float lat = ((aSeed.z*2. - 1.)*(1. - uSpikeP.w) + wv*uSpikeP.w) * hw;
    r = 1.04 + s*Ls;
    th = e.x + lat/r + uJitAmp*sin(uJitPhase + uEvS[k].y)*s;   // tip jitter mirrored on the CPU
    a = (.9 - .3*s) * smoothstep(.003, .015, Ls) * min(1., e.w*1.4);
    if(N > .5) a *= 1. + 1.2*uSpikeP.y*smoothstep(.8, 1., fract(s*N));   // dark floor ledges
  }
  vec2 pos = uC + uR * r * vec2(cos(th), sin(th));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 0., 1.);
  gl_PointSize = uSize * uDpr * (.6 + .9*h3);
  vA = a;
}
