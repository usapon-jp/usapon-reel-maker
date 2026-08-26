import {homedir} from 'node:os';
import {isAbsolute, join, resolve} from 'node:path';

export type DataPaths = ReturnType<typeof getDataPaths>;

export function getDataRoot(): string {
  const configured = process.env.USAPON_REEL_DATA_DIR;
  if (configured) {
    const launchDirectory = process.env.INIT_CWD ?? process.cwd();
    return isAbsolute(configured)
      ? configured
      : resolve(/* turbopackIgnore: true */ launchDirectory, configured);
  }
  return join(homedir(), 'Library', 'Application Support', 'うさぽん リールメーカー');
}

export function getDataPaths(root = getDataRoot()) {
  return {
    root,
    database: join(root, 'db', 'app.sqlite'),
    assets: join(root, 'assets'),
    outputs: join(root, 'outputs'),
    thumbnails: join(root, 'thumbnails'),
    temp: join(root, 'tmp'),
  };
}
