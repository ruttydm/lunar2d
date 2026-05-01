export type EngineStatus = 'READY' | 'NO FUEL' | 'LANDED' | 'DESTROYED';

export function resolveEngineStatus(args: {
  destroyed: boolean;
  landed: boolean;
  fuel: number;
}) {
  if (args.destroyed) return 'DESTROYED';
  if (args.landed) return 'LANDED';
  if (args.fuel <= 0) return 'NO FUEL';
  return 'READY';
}

export function canApplyMainThrust(status: EngineStatus) {
  return status === 'READY';
}
