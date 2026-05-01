import { describe, expect, test } from 'bun:test';
import { BODIES, LANDERS } from '../../src/client/src/domain/model';
import { nextObjectivePhase, objectiveText } from '../../src/client/src/systems/objectives';

describe('objectives', () => {
  test('advances orbit objective only for a stable orbit', () => {
    expect(nextObjectivePhase({
      phase: 'orbit',
      destroyed: false,
      landed: false,
      altitude: 1200,
      speed: 100,
      orbitalSpeed: 105,
      radialSpeed: 2,
    })).toEqual({ phase: 'return', completedOrbit: true });

    expect(nextObjectivePhase({
      phase: 'orbit',
      destroyed: false,
      landed: false,
      altitude: 1200,
      speed: 40,
      orbitalSpeed: 105,
      radialSpeed: 2,
    })).toEqual({ phase: 'orbit', completedOrbit: false });
  });

  test('formats objective text for landing and portal phases', () => {
    expect(objectiveText({
      phase: 'land',
      targetName: 'Tranquility',
      body: BODIES[0],
      lander: LANDERS[1],
      localTwr: '2.55',
      landingSafety: 'SAFE',
      orbitalSpeedMps: 100,
      currentSpeedMps: 20,
    }).title).toBe('LAND TRANQUILITY');

    expect(objectiveText({
      phase: 'return',
      targetName: 'Tranquility',
      body: BODIES[0],
      lander: LANDERS[1],
      localTwr: '2.55',
      landingSafety: 'SAFE',
      orbitalSpeedMps: 100,
      currentSpeedMps: 20,
    }).detail).toContain('Vibe Jam');
  });
});
