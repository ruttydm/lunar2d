import { describe, expect, test } from 'bun:test';
import {
  capVelocitySpeed,
  bodyPointToWorld,
  hasBrakingIntent,
  normalizedDirection,
  normalizeAngle,
  positiveAngle,
  preventBrakingBurnSpeedup,
  projectWorldVectorToScreen,
  projectileLaunchVelocity,
  screenAngleForWorldVector,
  SHIP_FRAME_POINTS,
  shipFrame,
  shipScreenRotation,
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
    const nose = bodyPointToWorld(SHIP_FRAME_POINTS.nose, lander);
    expect(normalizedDirection(lander, nose)).toEqual({ x: 0, y: 1 });

    const rightFacing = { x: 0, y: 0, angle: Math.PI / 2 };
    const rightNose = bodyPointToWorld(SHIP_FRAME_POINTS.nose, rightFacing);
    expect(normalizedDirection(rightFacing, rightNose).x).toBeCloseTo(1, 8);
    expect(normalizedDirection(rightFacing, rightNose).y).toBeCloseTo(0, 8);
  });

  test('ship frame keeps thrust, muzzle, exhaust and marker axes coherent', () => {
    const upward = shipFrame({ x: 10, y: 20, angle: 0 });
    expect(upward.forward).toEqual({ x: 0, y: 1 });
    expect(upward.exhaust).toEqual({ x: 0, y: -1 });
    expect(upward.nose.y).toBeGreaterThan(upward.center.y);
    expect(upward.nozzle.y).toBeLessThan(upward.center.y);
    expect(upward.leftMarker.x).toBeLessThan(upward.center.x);
    expect(upward.rightMarker.x).toBeGreaterThan(upward.center.x);

    const right = shipFrame({ x: 0, y: 0, angle: Math.PI / 2 });
    expect(right.forward.x).toBeCloseTo(1, 8);
    expect(right.forward.y).toBeCloseTo(0, 8);
    expect(right.exhaust.x).toBeCloseTo(-1, 8);
    expect(right.exhaust.y).toBeCloseTo(0, 8);
    expect(right.nose.x).toBeGreaterThan(right.center.x);
    expect(right.nozzle.x).toBeLessThan(right.center.x);
  });

  test('ship screen rotation matches the projected world-space nose direction', () => {
    const body = { x: 0, y: 0, angle: 1.1 };
    const cameraRotation = -0.45;
    const frame = shipFrame(body);
    const dx = frame.nose.x - frame.center.x;
    const dy = frame.nose.y - frame.center.y;
    const projected = projectWorldVectorToScreen({ x: dx, y: dy }, cameraRotation);
    const drawnRotation = shipScreenRotation(body.angle, cameraRotation);
    const drawnNose = {
      x: Math.sin(drawnRotation),
      y: -Math.cos(drawnRotation),
    };

    expect(projected.x / Math.hypot(projected.x, projected.y)).toBeCloseTo(drawnNose.x, 8);
    expect(projected.y / Math.hypot(projected.x, projected.y)).toBeCloseTo(drawnNose.y, 8);
  });

  test('screen angle helper follows camera-projected world vectors', () => {
    const projected = projectWorldVectorToScreen({ x: 0, y: 1 }, Math.PI / 6);
    expect(screenAngleForWorldVector({ x: 0, y: 1 }, Math.PI / 6)).toBeCloseTo(Math.atan2(projected.y, projected.x), 8);
    expect(screenAngleForWorldVector({ x: 1, y: 0 }, 0)).toBeCloseTo(0, 8);
  });
});
