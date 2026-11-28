// 卷二:910 第 4a 条（V-2.b）门禁读数（chore/s2-any0 出题，黑盒）：经门禁公共入口 accRun('pre_commit') 只跑 V-2.b 这一条（不跑全量），
// c_escape_hatch 分量的现值须为 0。期望 0 由卡目标推出（mount.mjs 的 anyType 清零），不抄仓库当前计数。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROOT } from '../../accept/temp-root.mjs';
import { accRun } from '../../../tools/accept/run.mjs';

test('门禁读数：V-2.b 的 c_escape_hatch 命中数为 0，且 V-2.b 不在判败清单里', async () => {
  const { report } = await accRun('pre_commit', '', null, { root: ROOT, filter: { itemKey: 'vol1.V-2.b' } });
  const current = report.components.c_escape_hatch?.current ?? 0;
  assert.equal(current, 0, 'V-2.b 的 escape_hatch 命中数应为 0（mount.mjs 的 anyType 须全部清零）');
  assert.ok(!report.items.failed.some((f) => f.itemKey === 'vol1.V-2.b'), 'V-2.b 不应判败');
});
