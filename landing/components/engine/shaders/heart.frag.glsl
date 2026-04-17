uniform vec3  uBase;
uniform vec3  uSSS;
uniform vec3  uLightDir;
uniform float uTime;
uniform float uPhase;

varying vec3 vN;
varying vec3 vV;
varying vec3 vWP;

void main() {
  vec3 L = normalize(uLightDir);
  float ndl = max(0.0, dot(vN, L));
  float bsl = max(0.0, dot(-vN, L));
  float wrap = (ndl + 0.5) / 1.5;
  float fres = pow(1.0 - max(0.0, dot(vN, vV)), 2.2);

  vec3 base = uBase * wrap;
  vec3 sss  = uSSS * bsl * 0.7;
  vec3 rim  = vec3(0.98, 0.94, 0.86) * fres * 0.32;

  float breathe = 1.0 + sin(uTime * (6.2831 / 4.0)) * 0.02;
  float calm    = smoothstep(0.4, 0.85, uPhase);
  vec3 col = (base + sss + rim) * (0.72 + calm * 0.4) * breathe;

  gl_FragColor = vec4(col, 1.0);
}
