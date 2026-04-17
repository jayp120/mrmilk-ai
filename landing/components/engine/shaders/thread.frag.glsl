uniform float uPhase;
uniform vec3  uColor;
uniform float uIntensity;

varying float vAlongTaper;
varying float vWaveRamp;
varying float vLocalR;

void main() {
  float baseEmit = mix(0.08, 0.32, smoothstep(0.0, 0.25, uPhase));
  float waveEmit = vWaveRamp * smoothstep(0.22, 0.52, uPhase) * 0.9;
  float resolved = smoothstep(0.52, 0.85, uPhase) * 0.22;
  float emit = baseEmit + waveEmit + resolved;

  float alpha = vAlongTaper * (0.45 + emit);
  vec3 col = uColor * (0.55 + emit * 1.6);

  gl_FragColor = vec4(col, alpha);
}
