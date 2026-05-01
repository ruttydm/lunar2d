import type { CelestialBody, LanderStats } from '../domain/model';

export type ObjectivePhase = 'land' | 'orbit' | 'return';

export function nextObjectivePhase(args: {
  phase: ObjectivePhase;
  destroyed: boolean;
  landed: boolean;
  altitude: number;
  speed: number;
  orbitalSpeed: number;
  radialSpeed: number;
}) {
  if (args.destroyed || args.landed || args.phase !== 'orbit') return { phase: args.phase, completedOrbit: false };
  const inStableOrbit = args.altitude > 900
    && args.radialSpeed < 5
    && Math.abs(args.speed - args.orbitalSpeed) / args.orbitalSpeed < 0.22;
  return inStableOrbit
    ? { phase: 'return' as const, completedOrbit: true }
    : { phase: args.phase, completedOrbit: false };
}

export function objectiveText(args: {
  phase: ObjectivePhase;
  targetName: string;
  body: CelestialBody;
  lander: LanderStats;
  localTwr: string;
  landingSafety: string;
  orbitalSpeedMps: number;
  currentSpeedMps: number;
}) {
  if (args.phase === 'orbit') {
    return {
      title: `ORBIT ${args.body.name.toUpperCase()}`,
      detail: `hold ${args.orbitalSpeedMps.toFixed(0)}m/s | now ${args.currentSpeedMps.toFixed(0)}m/s | M map`,
    };
  }
  if (args.phase === 'return') {
    return {
      title: 'FIND PORTAL',
      detail: 'three Vibe Jam portals are marked on the minimap',
    };
  }
  return {
    title: `LAND ${args.targetName.toUpperCase()}`,
    detail: `${args.landingSafety} | ${args.body.name} ${args.body.type} | ${args.lander.name} TWR ${args.localTwr} | F3 debug`,
  };
}
