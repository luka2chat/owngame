import * as THREE from 'three';
export const RADIUS = 7.5;
export const UP = new THREE.Vector3(0, 1, 0);
export function normalAt(x, z) { return new THREE.Vector3(x, Math.sqrt(Math.max(.1, RADIUS * RADIUS - x*x - z*z)), z).normalize(); }
export function surfaceRadius(n) {
  return RADIUS + .11 * Math.sin(n.x * 15) * Math.sin(n.z * 13) + .08 * Math.cos(n.x * 23 + n.y * 11);
}
export function tangent(vector, normal) { return vector.clone().addScaledVector(normal, -vector.dot(normal)).normalize(); }
export function stepOnSphere(normal, direction, distance) {
  const t = tangent(direction, normal);
  if (t.lengthSq() < .001 || !distance) return normal.clone();
  const angle = distance / RADIUS;
  return normal.clone().multiplyScalar(Math.cos(angle)).addScaledVector(t, Math.sin(angle)).normalize();
}
export function seededRandom(seed = 612) {
  return () => { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return seed / 4294967296; };
}
