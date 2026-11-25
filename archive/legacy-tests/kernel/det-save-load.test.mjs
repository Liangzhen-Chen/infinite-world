// 块 6 第 6-20 张：确定性模板 det_save_load 存读恒等（卷十二 R12-6.7、§2.8 模板表"中途存盘读回与不存盘 / 各快照点的存档摘要"；卷二十七 A27-4.3）。
// A27-4.3：任意时刻存盘后读回，继续推进同样的指令序列，与不存盘直接推进相比，存档摘要在每个快照点相等（不开文字模型）。
// 做法：同一串请求（含处理函数另写的非请求记录）先不存盘一路推完，记下每步之后的存档摘要（参照边）；再对每个存盘时刻 k（0 到 N，含快照点与日志尾长短不同的各种位置）：
// 推 k 步、存盘、读回（快照 + 其后日志重跑）、继续推完，读回后与其后每一步的存档摘要都等于参照边的同一步；存盘时清单里记的存档摘要也等于参照边第 k 步。
// 夹具是 tests/kernel/save-world.mjs 的虚构状态（不是世界内容）；快照间隔 4、封段 2（夹具的 LAYOUT），请求 7 条 + 记录 2 条，所以 k 取遍 0–7 会落在快照之前、快照点、封段之后各种位置。
// 推进世界的长局（块 6 一局：开局、买卖、走动、推进 30 日）的同一模板登记在 tools/accept/items.json，由 6-26 在腾讯云测试台复跑，本机不跑（卷十二 R12-9.7）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { saveAction } from '../../server-plugin/kernel/save.mjs';
import { loadAction } from '../../server-plugin/kernel/load/save.mjs';
import { currentGame } from '../../server-plugin/kernel/save-session.mjs';
import { lv, pu, ho, digestNow, step, startNew } from './save-world.mjs';

// 请求序列：7 条；第 2、5 条的处理函数各另写一条非请求记录（像 emit 写的事件记录）。
const SEQ = [lv(1, 1), pu(2, 7, true), lv(3, 2), ho(4, 4), pu(5, 5, true), lv(6, 3), ho(7, 2)];
const N = SEQ.length;

// 参照边：不存盘一路推完，digests[i] 是推 i 步之后的存档摘要。
function reference() {
  startNew();
  const digests = [digestNow()];
  for (const p of SEQ) { step(p); digests.push(digestNow()); }
  const g = currentGame();
  return { digests, final: structuredClone(g.state), entries: structuredClone(g.book.entries) };
}
const REF = reference();

test('参照边本身：7 条请求加 2 条记录共 9 条日志；终局状态 level 3、purse 5、holdings 2（手算）；每一步的摘要都不同', () => {
  assert.equal(REF.entries.length, 9);
  assert.equal(REF.final.gauge.gad_one.level, 3);
  assert.equal(REF.final.purse.gad_one.amount, 5);
  assert.equal(REF.final.holdings.gad_one.gad_two, 2);
  assert.equal(new Set(REF.digests).size, N + 1);
});

for (let k = 0; k <= N; k++) {
  test(`det_save_load：第 ${k} 步之后存盘读回，再推完其余 ${N - k} 步，每一步的存档摘要与不存盘相同`, () => {
    const root = startNew();
    for (const p of SEQ.slice(0, k)) step(p);
    assert.equal(digestNow(), REF.digests[k]);
    assert.deepEqual(saveAction(0), { resultCode: 'ok' });
    const manifest = JSON.parse(readFileSync(join(root, 'slot-0', 'manifest.json'), 'utf8'));
    assert.equal(manifest.saveDigest, REF.digests[k]);
    // 存盘之后世界继续往前走一步（会被读档丢掉），再读回：读回的就是存盘那一刻。
    if (k < N) step(SEQ[k]);
    assert.deepEqual(loadAction(0), { resultCode: 'ok' });
    assert.equal(digestNow(), REF.digests[k]);
    for (let i = k; i < N; i++) {
      step(SEQ[i]);
      assert.equal(digestNow(), REF.digests[i + 1], `step ${i + 1}`);
    }
    // 推完后再存再读一轮，终局仍与参照边逐值相同。
    assert.deepEqual(saveAction(1), { resultCode: 'ok' });
    assert.deepEqual(loadAction(1), { resultCode: 'ok' });
    assert.equal(digestNow(), REF.digests[N]);
    assert.deepEqual(currentGame().state, REF.final);
    assert.deepEqual(currentGame().book.entries, REF.entries);
  });
}
