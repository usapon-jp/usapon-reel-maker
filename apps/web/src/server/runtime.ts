import 'server-only';

import {LocalBlobStorage, LocalDatabase} from '@usapon-reel/local';

type Runtime = {database: LocalDatabase; storage: LocalBlobStorage};
const runtimeGlobal = globalThis as typeof globalThis & {__usaponReelRuntime?: Runtime};

export function getRuntime(): Runtime {
  if (!runtimeGlobal.__usaponReelRuntime) {
    runtimeGlobal.__usaponReelRuntime = {
      database: new LocalDatabase(),
      storage: new LocalBlobStorage(),
    };
  }
  return runtimeGlobal.__usaponReelRuntime;
}

export function errorResponse(error: unknown, status = 400): Response {
  const message = error instanceof Error ? error.message : String(error);
  return Response.json({error: message}, {status});
}
