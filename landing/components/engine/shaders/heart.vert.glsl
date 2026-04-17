varying vec3 vN;
varying vec3 vV;
varying vec3 vWP;

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWP = world.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vV = normalize(cameraPosition - world.xyz);
  gl_Position = projectionMatrix * viewMatrix * world;
}
