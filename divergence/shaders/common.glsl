// ---- shared noise -------------------------------------------------------
#define PI 3.14159265359
float hash13(vec3 p3){ p3=fract(p3*.1031); p3+=dot(p3,p3.zyx+31.32); return fract((p3.x+p3.y)*p3.z); }
float hash12(vec2 p){ vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
float vnoise(vec3 x){
  vec3 i=floor(x), f=fract(x); f=f*f*(3.-2.*f);
  float a=hash13(i),             b=hash13(i+vec3(1,0,0));
  float c=hash13(i+vec3(0,1,0)), d=hash13(i+vec3(1,1,0));
  float e=hash13(i+vec3(0,0,1)), g=hash13(i+vec3(1,0,1));
  float h=hash13(i+vec3(0,1,1)), k=hash13(i+vec3(1,1,1));
  return mix(mix(mix(a,b,f.x),mix(c,d,f.x),f.y), mix(mix(e,g,f.x),mix(h,k,f.x),f.y), f.z);
}
float fbm3(vec3 p){ float s=0., a=.5; for(int i=0;i<4;i++){ s+=a*vnoise(p); p=p*2.03+vec3(1.7,9.2,3.1); a*=.5; } return s/.9375; }
float angDiff(float a, float b){ return abs(mod(a-b+PI, 2.*PI)-PI); }

// Seamless around the ring: θ lives on a circle of radius k in noise space, time is the
// 3rd axis — shapes boil in place and never rotate. k ≈ "frequency per radian".
float ringN(float th, float k, float t){ return vnoise(vec3(cos(th)*k, sin(th)*k, t)); }
float ringF(float th, float k, float t){ return fbm3(vec3(cos(th)*k, sin(th)*k, t)); }

// Two clocks wrapping at different moments, cross-faded (float precision on a 24/7 screen).
uniform float uTA, uTB, uWA;
float xfade(float a, float b){ float wb=1.-uWA; return .5+((a-.5)*uWA+(b-.5)*wb)/sqrt(uWA*uWA+wb*wb); }
float ringNT(float th, float k, float s, float o){ return xfade(ringN(th,k,uTA*s+o), ringN(th,k,uTB*s+o+57.)); }
float ringFT(float th, float k, float s, float o){ return xfade(ringF(th,k,uTA*s+o), ringF(th,k,uTB*s+o+57.)); }
