import { describe, expect, test } from 'bun:test';
import {
  capVelocitySpeed,
  bodyPointToWorld,
  hasBrakingIntent,
  normalizedDirection,
  normalizeAngle,
  positiveAngle,
  preventBrakingBurnSpeedup,
  projectileLaunchVelocity,
} from '../../src/client/src/physics/flight';

describe('flight physics helpers', () => {
  test('detects thrust that points against current velocity', () => {
    expect(hasBrakingIntent({ x: -1, y: 0 }, { x: 24, y: 0 }, -0.02)).toBe(true);
    expect(hasBrakingIntent({ x: 1, y: 0 }, { x: 24, y: 0 }, -0.02)).toBe(false);
    expect(hasBrakingIntent({ x: 0, y: 1 }, { x: 24, y: 0 }, -0.02)).toBe(false);
  });

  test('retrograde burn guard cannot increase speed', () => {
    const guarded = preventBrakingBurnSpeedup({ x: 14, y: 0 }, 10);
    expect(Math.hypot(guarded.x, guarded.y)).toBeCloseTo(10, 8);
  });

  test('speed cap leaves slower vectors unchanged', () => {
    expect(capVelocitySpeed({ x: 3, y: 4 }, 6)).toEqual({ x: 3, y: 4 });
  });

  test('projectiles inherit lander velocity before adding muzzle impulse', () => {
    const velocity = projectileLaunchVelocity({
      origin: { x: 4_500, y: 0 },
      inheritedVelocity: { x: 10, y: -2 },
      direction: { x: 0, y: 1 },
      gravity: 6.5,
      muzzleSpeed: 82,
      minMuzzleSpeed: 34,
      escapeSpeedFraction: 0.72,
    });

    expect(velocity.x).toBeCloseTo(10, 8);
    expect(velocity.y).toBeGreaterThan(32);
  });

  test('angle helpers normalize into expected ranges', () => {
    expect(normalizeAngle(Math.PI * 3)).toBeCloseTo(Math.PI, 8);
    expect(positiveAngle(-Math.PI / 2)).toBeCloseTo(Math.PI * 1.5, 8);
  });

  test('visual nose direction matches the ship thrust frame', () => {
    const lander = { x: 10, y: 20, angle: 0 };
    const nose = bodyPointToWorld({ x: 0, y: -42 }, lander);
    expect(normalizedDirection(lander, nose)).toEqual({ x: 0, y: 1 });

    const rightFacing = { x: 0, y: 0, angle: Math.PI / 2 };
    const rightNose = bodyPointToWorld({ x: 0, y: -42 }, rightFacing);
    expect(normalizedDirection(rightFacing, rightNose).x).toBeCloseTo(1, 8);
    expect(normalizedDirection(rightFacing, rightNose).y).toBeCloseTo(0, 8);
  });
});
