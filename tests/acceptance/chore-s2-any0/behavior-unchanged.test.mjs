// 卷二:910 第 4a 条（V-2.b）行为不变（chore/s2-any0 出题，黑盒）：经 server-plugin/index.mjs 启动（真宿主路由，不 mock），
// 开局、存槽、推进时间、读档复演，读档后再存的 saveDigest 须与读档前存档逐字节一致（卷二 R27 复演口径）。
// 复用 tests/support/wire-host.mjs 的公共辅助；临时根走 tests/accept/temp-root.mjs。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as plugin from '../../../server-plugin/index.mjs';
import { startHost, view, act, saveAt, loadAt, exportAt, unpack } from '../../support/wire-host.mjs';
import { testTempRoot, removeTempRoot } from '../../accept/temp-root.mjs';

test('行为不变：开局、存槽、读档复演后，saveDigest 逐字节一致', async (t) => {
  const root = testTempRoot('s2-any0-beh-');
  let h = null;
  t.after(async () => {
    if (h) await h.close();
    removeTempRoot(root);
  });
  h = await startHost({ plugin, saveRoot: root });
  const B = h.base;

  const v = await view(B);
  assert.equal(v.json?.result, 'ok', `界面命令 view 未返回 ok：${v.text}`);
  const o = await act(B, 'act_choose_origin', { species: 0, origin: 0, place: 0, lodge: 0 });
  assert.equal(o.json?.result, 'ok', `act_choose_origin 未 ok：${o.text}`);

  const s1 = await saveAt(B, 1);
  assert.equal(s1.json?.result, 'ok', `存槽 1 未 ok：${s1.text}`);
  const d1 = unpack((await exportAt(B, 1)).buf).manifest.saveDigest;
  assert.equal(typeof d1, 'string', '存档清单缺 saveDigest');

  const w = await act(B, 'act_wait', {}, { minutes: 7 });
  assert.equal(w.json?.result, 'ok', `act_wait 7 未 ok：${w.text}`);

  const l1 = await loadAt(B, 1);
  assert.equal(l1.json?.result, 'ok', `读档 slot 1 未 ok（读档内部复演校验 saveDigest）：${l1.text}`);
  const s2 = await saveAt(B, 2);
  assert.equal(s2.json?.result, 'ok', `读档后存槽 2 未 ok：${s2.text}`);
  const d2 = unpack((await exportAt(B, 2)).buf).manifest.saveDigest;
  assert.equal(d2, d1, '读档复演后再存的 saveDigest 应与读档前存档逐字节相同');
});
