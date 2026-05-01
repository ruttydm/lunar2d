import { describe, expect, test } from 'bun:test';
import type { Pad } from '../../src/client/src/domain/model';
import { BODIES } from '../../src/client/src/domain/model';
import {
  padPlatformRadius,
  rawTerrainRadiusAtAngle,
  rebuildTerrainCache,
  terrainRadiusAtAngle,
} from '../../src/client/src/physics/terrain';

describe('terrain model', () => {
  const body = BODIES[0];
  const bodyRadius = body.gameRadiusM / 10;

  test('pads are raised to a flat platform above local terrain', () => {
    const angle = 0.42;
    const radius = 280;
    const platformRadius = padPlatformRadius(angle, radius, body, bodyRadius);
    const pad: Pad = {
      id: 1,
      name: 'Test',
      x: Math.cos(angle) * platformRadius,
      y: Math.sin(angle) * platformRadius,
      radius,
      angle,
      platformRadius,
      damaged: false,
    };

    expect(rawTerrainRadiusAtAngle(angle, body, bodyRadius, [pad])).toBe(platformRadius);
    expect(rawTerrainRadiusAtAngle(angle + radius / bodyRadius * 0.5, body, bodyRadius, [pad])).toBe(platformRadius);
  });

  test('sampled terrain interpolation remains close to raw terrain', () => {
    const samples = rebuildTerrainCache({ sampleCount: 512, body, bodyRadius, pads: [] });
    const angle = 1.234;
    const sampled = terrainRadiusAtAngle(angle, samples, () => 0);
    const raw = rawTerrainRadiusAtAngle(angle, body, bodyRadius, []);
    expect(Math.abs(sampled - raw)).toBeLessThan(1);
  });
});
