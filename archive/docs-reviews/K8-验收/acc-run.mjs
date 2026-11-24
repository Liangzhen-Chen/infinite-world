// helper: run guard on a root, write json to out
import { spawnSync } from 'node:child_process';
import path from 'node:path';
export function runGuard(root, out) {
  return spawnSync('node', [path.join(root, 'tools/k8-guard.mjs'), '--root', root, '--json', out],
    { env: { ...process.env, TEMP: 'F:/dnd-tmp', TMP: 'F:/dnd-tmp' }, encoding: 'utf8', maxBuffer: 1 << 28 });
}
