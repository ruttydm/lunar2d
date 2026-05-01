import { describe, expect, test } from 'bun:test';
import { canApplyMainThrust, resolveEngineStatus } from '../../src/client/src/systems/engine';

describe('engine status', () => {
  test('reports the first blocking reason for thrust', () => {
    expect(resolveEngineStatus({ destroyed: true, landed: false, fuel: 10 })).toBe('DESTROYED');
    expect(resolveEngineStatus({ destroyed: false, landed: true, fuel: 10 })).toBe('LANDED');
    expect(resolveEngineStatus({ destroyed: false, landed: false, fuel: 0 })).toBe('NO FUEL');
    expect(resolveEngineStatus({ destroyed: false, landed: false, fuel: 10 })).toBe('READY');
  });

  test('only ready engines can thrust', () => {
    expect(canApplyMainThrust('READY')).toBe(true);
    expect(canApplyMainThrust('NO FUEL')).toBe(false);
  });
});
