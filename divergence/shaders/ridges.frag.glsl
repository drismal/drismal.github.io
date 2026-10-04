uniform vec3 uDot;
uniform float uAlpha;
varying float vA;
void main(){
  float d = length(gl_PointCoord - .5);
  float a = vA * smoothstep(.5, .05, d) * uAlpha;   // soft round dot
  if(a < .01) discard;
  gl_FragColor = vec4(uDot, a);
}
