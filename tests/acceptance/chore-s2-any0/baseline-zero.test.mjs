// 卷二:910 第 4a 条（V-2.b）基线读数（chore/s2-any0 出题，黑盒）：tools/accept/baseline.json 里 c_escape_hatch 分量须 current 为 0、
// rowKeys 为空、仍锁定（locked 为真）。只读登记文件，不写。期望值由卡目标推出，不抄当前读数。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROOT } from '../../accept/temp-root.mjs';
import { accBaseline } from '../../../tools/accept/read.mjs';

test('基线：c_escape_hatch 分量 current 为 0、rowKeys 为空、locked 为真', () => {
  const rows = accBaseline(ROOT).filter((r) => r.compCode === 'c_escape_hatch');
  assert.equal(rows.length, 1, 'baseline.json 里 c_escape_hatch 分量应恰有一行');
  const [row] = rows;
  assert.equal(row.current, 0, 'c_escape_hatch 分量 current 应为 0');
  assert.deepEqual(row.rowKeys, [], 'c_escape_hatch 分量 rowKeys 应为空');
  assert.equal(row.locked, true, 'c_escape_hatch 分量应仍是锁定状态');
});
