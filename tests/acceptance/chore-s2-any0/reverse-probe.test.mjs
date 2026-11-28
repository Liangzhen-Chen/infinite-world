// 反向验证（chore/s2-any0 出题，黑盒）：在隔离副本（HEAD 的临时 worktree 副本）的 mount.mjs 末尾塞一处 `@param {any}`，
// V-2.b 的 escape_hatch 命中须恰增 1，且该条判败（E-ACC-BASELINE-UP）。只用门禁的 V-2.b 条目过滤跑 accRun，不跑全量；真仓库不改。
// 命中增量 1 由探针行推出；基线值不写死，取副本里 accRun 的实测前值作对照。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { ROOT, writeUnderTempRoot } from '../../accept/temp-root.mjs';
import { withIsolatedRepo } from '../../support/isolated-repo.mjs';
import { accRun } from '../../../tools/accept/run.mjs';

const MOUNT_REL = 'server-plugin/rules/load/mount.mjs';
const PROBE = '\n/** @param {any} 反向探针 */\n';
const FILTER = { itemKey: 'vol1.V-2.b' };

test('反向：副本 mount.mjs 塞一处 @param {any}，V-2.b 命中恰增 1 且判败', async () => {
  const realBefore = readFileSync(join(ROOT, MOUNT_REL), 'utf8');
  await withIsolatedRepo(async (copyRoot) => {
    const before = await accRun('pre_commit', '', null, { root: copyRoot, filter: FILTER });
    const n0 = before.report.components.c_escape_hatch?.current ?? 0;

    const text = readFileSync(join(copyRoot, MOUNT_REL), 'utf8');
    writeUnderTempRoot(dirname(copyRoot), `repo/${MOUNT_REL}`, text + PROBE);

    const after = await accRun('pre_commit', '', null, { root: copyRoot, filter: FILTER });
    const n1 = after.report.components.c_escape_hatch?.current ?? 0;
    assert.equal(n1 - n0, 1, 'V-2.b 的 escape_hatch 命中应恰增 1（探针一处 any）');
    assert.ok(
      after.report.items.failed.some((f) => f.itemKey === 'vol1.V-2.b' && f.codes.includes('E-ACC-BASELINE-UP')),
      'V-2.b 应因超出基线判败（E-ACC-BASELINE-UP）',
    );
  });
  assert.equal(readFileSync(join(ROOT, MOUNT_REL), 'utf8'), realBefore, '真仓库的 mount.mjs 不应被改动');
});
