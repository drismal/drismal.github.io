// ---- ring at rest + needles + eclipse (full-screen pass) -----------------
uniform vec2 uRes;      // CSS px
uniform float uDpr;
uniform vec2 uC;        // ring centre, CSS px (y down)
uniform float uR;       // inner radius, CSS px
uniform vec3 uBg, uInk;
uniform float uNight;
uniform float uLobeAmp, uRippleAmp, uBoil, uThreadOff, uCoreW, uCore, uStipple, uStippleT;
uniform vec4 uNeedle[24];   // θ, base radius (R), length (R), alpha
uniform float uEclipse, uEclAng, uEclWidth, uRayLen, uEclInner, uRayFreq, uRayDensity;
uniform float uThreadDim, uInnerWobble;
uniform vec4 uNeedleP;      // width ×, wave amplitude (R), waves along needle, phase

float seg(float x, float a, float b, float va, float vb){ return mix(va, vb, smoothstep(a, b, x)); }
// Section 3.1: darkness across the ring, r/R -> 0..1
float profile(float x){
  if(x < 1.00) return 0.;
  if(x < 1.02) return seg(x, 1.00, 1.02, .20, .60);
  if(x < 1.04) return seg(x, 1.02, 1.04, .60, .85);
  if(x < 1.06) return seg(x, 1.04, 1.06, .85, .45);
  if(x < 1.08) return seg(x, 1.06, 1.08, .45, .15);
  if(x < 1.10) return seg(x, 1.08, 1.10, .15, .05);
  if(x < 1.12) return seg(x, 1.10, 1.12, .05, .00);
  return 0.;
}

void main(){
  vec2 px = vec2(gl_FragCoord.x, uRes.y*uDpr - gl_FragCoord.y) / uDpr;
  vec2 p = px - uC;
  float x = length(p) / uR;
  float th = atan(p.y, p.x);            // screen space: clockwise from the right
  float aa = 1.2 / uR;                  // ~1 px in R units
  float d = 0., innerDark = 0.;

  if(x > .97 && x < 1.62){
    // 3.3 outer edge: 6–7 petals + 13–17 ripple, boiling ~1 % R / s
    float n1 = (ringNT(th, 1.05, uBoil, 0.) - .5) * 2.2;
    float n2 = (ringNT(th, 2.4, uBoil*1.7, 13.) - .5) * 2.2;
    float delta = uLobeAmp*n1 + uRippleAmp*n2;
    float rr = x - delta*smoothstep(1.0, 1.05, x);
    float base = profile(max(rr, 1.0));

    // 3.2 double thread: the second thread drifts apart / crosses, 30 % lighter
    float off = uThreadOff * (ringNT(th, 2., .05, 41.) - .5) * 3.2;
    float w = uCoreW * uCore;
    float c1 = 1.03;
    float t1 = .92 * exp(-pow((x - c1) / w, 2.));
    float t2 = .92 * uThreadDim * exp(-pow((x - c1 - off) / w, 2.));
    d = 1. - (1. - base*.8) * (1. - t1) * (1. - t2);

    // 3.1 inner edge: sharp mask, almost a perfect circle (≤ 0.3 % R)
    float xin = x + uInnerWobble * (ringNT(th, 3., uBoil*.5, 29.) - .5);
    d *= smoothstep(1. - aa*.6, 1. + aa*.6, xin);

    // 3.5 / 4.4 needles: thin dark cones growing from the outer edge
    float nd = 0.;
    if(x > 1.) for(int i = 0; i < 24; i++){
      vec4 n = uNeedle[i];
      if(n.w < .004) continue;
      float u = (x - n.y) / max(n.z, 1e-4);
      if(u < -.05 || u > 1.) continue;
      float uc = clamp(u, 0., 1.);
      // waviness: the centre line bends sideways, more toward the tip
      float bend = uNeedleP.y * uc * sin(uc * uNeedleP.z * 6.2832 + n.x * 13.7 + uNeedleP.w) / max(x, .5);
      float lat = angDiff(th, n.x + bend) * x;
      float hw = (.004 + .02*n.z) * uNeedleP.x * (1. - uc);
      nd = max(nd, (1. - smoothstep(hw, hw + aa, lat)) * n.w * .9);
    }
    d = 1. - (1. - d) * (1. - nd);
  }

  // 6.2 eclipse: thick soft crescent with blurred radial rays on the event side
  if(uEclipse > .001){
    float side = pow(max(0., cos(th - uEclAng)), 1.5);
    float rel = x - 1.04;
    float cw = max(uEclWidth * side * uEclipse, 1e-4);
    float cres = (1. - smoothstep(cw*.45, cw, rel)) * smoothstep(-.04, 0., rel) * side * uEclipse;
    float rmask = smoothstep(1. - uRayDensity, 1. - uRayDensity + .28, ringN(th, uRayFreq, uTA*.08));
    float rl = max(uRayLen * side * uEclipse * (.35 + .65*ringN(th, 9., uTA*.05 + 5.)), 1e-4);
    float ray = rmask * exp(-max(rel, 0.) / (rl*.45)) * step(0., rel) * side * uEclipse;
    d = 1. - (1. - d) * (1. - cres*.95) * (1. - ray*.7);
    innerDark = uEclInner * side * uEclipse * smoothstep(.25, 1., x) * (1. - step(1., x));
    d += uNight * uEclipse * .15 * exp(-max(x - 1.04, 0.) / .15) * step(1., x);   // soft glow at night
  }

  // 3.4 printed-ink grain, slowly breathing
  vec2 cell = floor(gl_FragCoord.xy);
  float s = mix(hash12(cell + floor(uStippleT)*17.13), hash12(cell + floor(uStippleT + 1.)*17.13), fract(uStippleT));
  d *= 1. + uStipple * (s*2. - 1.);

  vec3 col = mix(uBg, uInk, clamp(d, 0., 1.));
  col = mix(col, uInk, innerDark);
  gl_FragColor = vec4(col, 1.);
}
