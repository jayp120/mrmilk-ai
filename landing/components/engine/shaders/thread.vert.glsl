uniform float uTime;
uniform float uPhase;
uniform float uWave;
uniform vec2  uPointer;
uniform float uPointerActive;
uniform float uPointerRadius;

varying float vAlongTaper;
varying float vWaveRamp;
varying float vLocalR;

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);

  vec4 clip = projectionMatrix * viewMatrix * world;
  vec2 ndc  = clip.xy / max(0.0001, clip.w);
  vec2 d    = uPointer - ndc;
  float r   = length(d);
  float attract = smoothstep(uPointerRadius, 0.0, r) * uPointerActive;
  vec3 pointerPush = vec3(d, 0.0) * attract * 0.22;

  float alignWeight = smoothstep(0.25, 0.72, uPhase);
  vec3 field = vec3(
    sin(position.y * 1.3 + uTime * 0.18),
    cos(position.z * 1.1 - uTime * 0.22),
    sin(position.x * 1.4 + uTime * 0.26)
  );
  vec3 drift = field * 0.02 * (1.0 - alignWeight);
  vec3 settle = -position * 0.04 * alignWeight;

  world.xyz += pointerPush + drift + settle;

  float localR = length(position);
  vLocalR   = localR;
  vWaveRamp = 1.0 - clamp(abs(localR - uWave) / 0.18, 0.0, 1.0);
  vAlongTaper = smoothstep(0.0, 0.12, uv.x) * (1.0 - smoothstep(0.88, 1.0, uv.x));

  gl_Position = projectionMatrix * viewMatrix * world;
}
