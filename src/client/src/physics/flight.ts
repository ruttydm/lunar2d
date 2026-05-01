import type { Vec2 } from '../domain/model';

export const SHIP_FRAME_POINTS = {
  nose: { x: 0, y: -42 },
  canopy: { x: 0, y: -18 },
  lowerHull: { x: 0, y: 8 },
  leftHull: { x: -14, y: 10 },
  rightHull: { x: 14, y: 10 },
  engineNozzle: { x: 0, y: 20 },
  leftMarker: { x: -20, y: 18 },
  rightMarker: { x: 20, y: 18 },
} as const satisfies Record<string, Vec2>;

export function speed(vector: Vec2) {
  return Math.hypot(vector.x, vector.y);
}

export function normalizeAngle(angle: number) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

export function positiveAngle(angle: number) {
  const full = Math.PI * 2;
  return ((angle % full) + full) % full;
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function hasBrakingIntent(direction: Vec2, velocity: Vec2, threshold: number) {
  const currentSpeed = speed(velocity);
  if (currentSpeed < 0.5) return false;
  const directionLength = speed(direction) || 1;
  const alongVelocity = (direction.x * velocity.x + direction.y * velocity.y) / (currentSpeed * directionLength);
  return alongVelocity < threshold;
}

export function capVelocitySpeed(velocity: Vec2, maxSpeed: number) {
  const currentSpeed = speed(velocity);
  if (currentSpeed <= maxSpeed || currentSpeed <= 0) return velocity;
  const scale = maxSpeed / currentSpeed;
  return { x: velocity.x * scale, y: velocity.y * scale };
}

export function preventBrakingBurnSpeedup(velocity: Vec2, previousSpeed: number) {
  return capVelocitySpeed(velocity, previousSpeed);
}

export function cappedProjectileMuzzleSpeed(args: {
  origin: Vec2;
  inheritedVelocity: Vec2;
  direction: Vec2;
  gravity: number;
  muzzleSpeed: number;
  minMuzzleSpeed: number;
  escapeSpeedFraction: number;
}) {
  const localEscapeSpeed = Math.sqrt(2 * args.gravity * Math.max(1, speed(args.origin)));
  const maxSpeed = localEscapeSpeed * args.escapeSpeedFraction;
  const fullVelocity = {
    x: args.inheritedVelocity.x + args.direction.x * args.muzzleSpeed,
    y: args.inheritedVelocity.y + args.direction.y * args.muzzleSpeed,
  };
  if (speed(fullVelocity) <= maxSpeed) return args.muzzleSpeed;

  const inheritedSpeed = speed(args.inheritedVelocity);
  const alongDirection = args.inheritedVelocity.x * args.direction.x + args.inheritedVelocity.y * args.direction.y;
  const discriminant = alongDirection * alongDirection - (inheritedSpeed * inheritedSpeed - maxSpeed * maxSpeed);
  if (discriminant <= 0) return args.minMuzzleSpeed;

  const allowed = -alongDirection + Math.sqrt(discriminant);
  if (allowed <= 0) return args.minMuzzleSpeed;
  return Math.max(args.minMuzzleSpeed, Math.min(args.muzzleSpeed, allowed));
}

export function projectileLaunchVelocity(args: {
  origin: Vec2;
  inheritedVelocity: Vec2;
  direction: Vec2;
  gravity: number;
  muzzleSpeed: number;
  minMuzzleSpeed: number;
  escapeSpeedFraction: number;
}) {
  const muzzleSpeed = cappedProjectileMuzzleSpeed(args);
  return {
    x: args.inheritedVelocity.x + args.direction.x * muzzleSpeed,
    y: args.inheritedVelocity.y + args.direction.y * muzzleSpeed,
  };
}

export function bodyPointToWorld(point: Vec2, body: { x: number; y: number; angle: number }) {
  const sin = Math.sin(body.angle);
  const cos = Math.cos(body.angle);
  const screenX = point.x * cos - point.y * sin;
  const screenY = point.x * sin + point.y * cos;
  return {
    x: body.x + screenX,
    y: body.y - screenY,
  };
}

export function normalizedDirection(from: Vec2, to: Vec2) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  return { x: dx / length, y: dy / length };
}

export function shipFrame(body: { x: number; y: number; angle: number }) {
  const center = { x: body.x, y: body.y };
  const nose = bodyPointToWorld(SHIP_FRAME_POINTS.nose, body);
  const nozzle = bodyPointToWorld(SHIP_FRAME_POINTS.engineNozzle, body);
  const leftMarker = bodyPointToWorld(SHIP_FRAME_POINTS.leftMarker, body);
  const rightMarker = bodyPointToWorld(SHIP_FRAME_POINTS.rightMarker, body);
  return {
    center,
    nose,
    nozzle,
    leftMarker,
    rightMarker,
    forward: normalizedDirection(center, nose),
    exhaust: normalizedDirection(center, nozzle),
  };
}

export function shipScreenRotation(bodyAngle: number, cameraRotation: number) {
  return normalizeAngle(bodyAngle - cameraRotation);
}

export function projectWorldVectorToScreen(vector: Vec2, cameraRotation: number) {
  const cos = Math.cos(cameraRotation);
  const sin = Math.sin(cameraRotation);
  return {
    x: vector.x * cos - vector.y * sin,
    y: -(vector.x * sin + vector.y * cos),
  };
}

export function screenAngleForWorldVector(vector: Vec2, cameraRotation: number) {
  const projected = projectWorldVectorToScreen(vector, cameraRotation);
  return Math.atan2(projected.y, projected.x);
}
