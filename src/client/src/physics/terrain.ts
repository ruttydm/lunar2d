import type { CelestialBody, Pad, TerrainSample, Vec2 } from '../domain/model';
import { lerp, positiveAngle, normalizeAngle } from './flight';

export function normalAtAngle(angle: number): Vec2 {
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

export function surfaceDistance(a: number, b: number, bodyRadius: number) {
  return Math.abs(normalizeAngle(a - b)) * bodyRadius;
}

export function baseTerrainRadiusAtAngle(angle: number, body: CelestialBody, bodyRadius: number) {
  const sx = angle * bodyRadius * body.terrainScale;
  return bodyRadius
    + Math.sin(sx * 0.004) * 38 * body.terrainAmp
    + Math.sin(sx * 0.011 + 1.8) * 22 * body.terrainAmp
    + Math.sin(sx * 0.025 + 0.4) * 9 * body.terrainAmp
    + Math.sin(sx * 0.057 + 2.7) * 3.5 * body.terrainAmp;
}

export function padPlatformRadius(angle: number, radius: number, body: CelestialBody, bodyRadius: number) {
  const halfAngle = radius / bodyRadius;
  let maxRadius = baseTerrainRadiusAtAngle(angle, body, bodyRadius);
  const samples = 18;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const sampleAngle = angle - halfAngle + t * halfAngle * 2;
    maxRadius = Math.max(maxRadius, baseTerrainRadiusAtAngle(sampleAngle, body, bodyRadius));
  }
  return maxRadius + 14;
}

export function rawTerrainRadiusAtAngle(angle: number, body: CelestialBody, bodyRadius: number, pads: Pad[]) {
  const base = baseTerrainRadiusAtAngle(angle, body, bodyRadius);
  for (const pad of pads) {
    const distance = surfaceDistance(angle, pad.angle, bodyRadius);
    if (distance <= pad.radius) return pad.platformRadius;
    if (distance <= pad.radius * 1.7) {
      const t = (distance - pad.radius) / (pad.radius * 0.7);
      const smooth = t * t * (3 - 2 * t);
      return lerp(pad.platformRadius, base, smooth);
    }
  }
  return base;
}

export function rebuildTerrainCache(args: {
  sampleCount: number;
  body: CelestialBody;
  bodyRadius: number;
  pads: Pad[];
}) {
  const samples: TerrainSample[] = [];
  for (let i = 0; i < args.sampleCount; i++) {
    const angle = (i / args.sampleCount) * Math.PI * 2;
    samples.push({
      angle,
      radius: rawTerrainRadiusAtAngle(angle, args.body, args.bodyRadius, args.pads),
    });
  }
  return samples;
}

export function terrainRadiusAtAngle(angle: number, samples: TerrainSample[], fallback: () => number) {
  if (samples.length === 0) return fallback();
  const normalized = positiveAngle(angle);
  const samplePosition = normalized / (Math.PI * 2) * samples.length;
  const index = Math.floor(samplePosition) % samples.length;
  const nextIndex = (index + 1) % samples.length;
  const t = samplePosition - Math.floor(samplePosition);
  return lerp(samples[index].radius, samples[nextIndex].radius, t);
}

export function surfacePoint(angle: number, radius: number, offset = 0): Vec2 {
  const normal = normalAtAngle(angle);
  const r = radius + offset;
  return { x: normal.x * r, y: normal.y * r };
}
