// 验收：卡 chore/s12-3-ledger（S12-3 全卷登记，黑盒验收）。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-s123；未参与写码，未看写码分支。
// 依据：卷十二:601（S12-3 各卷正文里有、登记表里没有的条目编号数为 0；登记表里有、定义处没有的条目数为 0；各卷转录条数与正文带编号条目数不等的卷数为 0）。
// 测什么：
//   L1 整仓（主会话裁定：本卡不升 in_core）：整仓 item_ledger 命中数不多于开发.md 的剩余数，且每条都列在开发.md 剩余清单里（反）；pre_commit 的 items.failed 里 vol12.S12-3 若仍在，码只限三个 item_ledger 码（反）；items.json 里 state 仍为 implemented（正）。
// 不写死卷名单与编号：判据参数（卷文路径、编号族、形式名）从 tools/accept/scanclasses.json 里 scanClass 为 item_ledger 的行读出；
// 条目从 tools/accept/items.json 读；L2–L4 的样本卷文与条目全部在内存里构造，不落盘，故不需要临时根的写入。
// 唯一写死的是 L1 的目标条目键 vol12.S12-3（卡文点名的验收对象，不是判据）；剩余数与剩余清单从开发.md 读。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../../accept/temp-root.mjs';
import { LAYOUT, REGISTRY, loadContext } from '../../../tools/accept/read.mjs';
import { detect } from '../../../tools/accept/detectors/doc_struct.mjs';

const TARGET = 'vol12.S12-3';
const ITEMS_REL = `${LAYOUT.accDir}/${REGISTRY.items.file}`;
const itemRows = () => JSON.parse(readFileSync(join(ROOT, ITEMS_REL), 'utf8')).rows;
const SCAN = JSON.parse(readFileSync(join(ROOT, 'tools/accept/scanclasses.json'), 'utf8')).rows.find((r) => r.scanClass === 'item_ledger');

// 样本：卷代号取自判据行的第一个卷，编号前缀取自该卷的第一个编号族；卷文路径用合成路径，内容由测试给出。
const VOL = Object.keys(SCAN.docVolumes).sort()[0];
const PREFIX = SCAN.docFamilies[VOL][0];
const DOC = 'docs/synthetic/ledger-sample.md';
const CLS = { docVolumes: { [VOL]: DOC }, docFamilies: { [VOL]: [PREFIX] }, formNames: SCAN.formNames };
const num = (n) => `${PREFIX}${n}`;
const docText = (ns) => `# 样本卷\n\n| 编号 | 内容 |\n|---|---|\n${ns.map((n) => `| ${num(n)} | 样本 |\n`).join('')}`;
const row = (n) => ({ itemKey: `${VOL}.${num(n)}`, volume: VOL, localNo: num(n) });

// 内存里的最小仓库：只放样本条目与样本卷文，检测器经 ctx.files / ctx.read 取数。
function sampleCtx(rows, definedNs) {
  const files = new Map([[ITEMS_REL, JSON.stringify({ rows })], [DOC, docText(definedNs)]]);
  return { files: [...files.keys()], read: (p) => files.get(p) };
}
const ALL = { checks: ['orphan', 'unregistered', 'count'] };
const hitsOf = (code, rows, definedNs) => detect(sampleCtx(rows, definedNs), ALL, CLS).filter((h) => h.code === code);

// ---------- L1：pre_commit 黑盒（整仓） ----------

// 主会话裁定（本卡不升 in_core）：S12-8/9/10 留待卷十二补对照表，剩余命中以实现交付的开发.md 为准。
// 剩余数（"后：N"）与剩余清单全部从 docs/卡档案/chore-s12-3-ledger/开发.md 读，不写死数字或编号。
const DEV = join(ROOT, 'docs/卡档案/chore-s12-3-ledger/开发.md');
const devText = readFileSync(DEV, 'utf8');
const section = (from, to) => {
  const a = devText.indexOf(from);
  assert.ok(a >= 0, `开发.md 缺段：${from}`);
  const b = devText.indexOf(to, a + from.length);
  return devText.slice(a, b < 0 ? devText.length : b);
};
const HITS_SEC = section('## S12-3 命中数', '## 条目 →');
const UNREG_SEC = section('## 未找到类别、未登', '## 已登行改挂');
const LISTED = `${HITS_SEC}\n${UNREG_SEC}`;
const LEFT = Number((HITS_SEC.match(/后：\s*(\d+)/) || [])[1]);
const CLS_LEDGER = JSON.parse(readFileSync(join(ROOT, 'tools/accept/scanclasses.json'), 'utf8')).rows.find((r) => r.scanClass === 'item_ledger');
const LEDGER_CODES = ['E-ACC-ITEM-ORPHAN', 'E-ACC-ITEM-UNREGISTERED', 'E-ACC-ITEM-COUNT'];

test('L1 反：整仓 item_ledger 命中数不多于开发.md 给出的剩余数，且每条命中都列在剩余清单里', { timeout: 600000 }, () => {
  assert.ok(Number.isFinite(LEFT), '开发.md「S12-3 命中数」段缺「后：N」');
  const params = itemRows().find((r) => r.itemKey === TARGET).params;
  const hits = detect(loadContext(ROOT), params, CLS_LEDGER);
  assert.ok(hits.length <= LEFT, `命中应不多于 ${LEFT} 条，实际 ${hits.length}`);
  for (const h of hits) {
    assert.ok(LEDGER_CODES.includes(h.code), `未知命中码：${h.code}`);
    assert.ok(LISTED.includes(h.symbolPath), `命中未列入开发.md 剩余清单：${h.code} ${h.symbolPath}`);
  }
});

test('L1 反：pre_commit 输出里 vol12.S12-3 若仍在 items.failed，其码只限 item_ledger 的三个码', { timeout: 600000 }, () => {
  const r = spawnSync(process.execPath, [join(ROOT, 'tools/accept/run.mjs'), 'pre_commit'], {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024,
  });
  const report = JSON.parse(r.stdout);
  assert.ok(report.items && Array.isArray(report.items.failed), 'pre_commit 输出缺 items.failed');
  const hit = report.items.failed.find((x) => x.itemKey === TARGET);
  if (hit) assert.deepEqual(hit.codes.filter((c) => !LEDGER_CODES.includes(c)), [], `${TARGET} 残留未知码：${hit.codes}`);
});

test('L1 正：items.json 里 vol12.S12-3 的 state 仍为 implemented（本卡不升 in_core）', () => {
  const row = itemRows().find((r) => r.itemKey === TARGET);
  assert.ok(row, `缺登记行：${TARGET}`);
  assert.equal(row.state, 'implemented', `${TARGET} 本卡不升，state 应仍为 implemented`);
});

// ---------- L2：E-ACC-ITEM-UNREGISTERED ----------

test('L2 反：卷文定义了 S 编号 2 而登记表未登记 → 报 E-ACC-ITEM-UNREGISTERED，符号为该编号', () => {
  const miss = hitsOf('E-ACC-ITEM-UNREGISTERED', [row(1)], [1, 2]);
  assert.deepEqual(miss.map((h) => h.symbolPath), [`${VOL}.${num(2)}`]);
});

test('L2 正：定义的编号全部登记后不再报 E-ACC-ITEM-UNREGISTERED，整体无命中', () => {
  const hits = detect(sampleCtx([row(1), row(2)], [1, 2]), ALL, CLS);
  assert.equal(hits.filter((h) => h.code === 'E-ACC-ITEM-UNREGISTERED').length, 0);
  assert.equal(hits.length, 0, `不应有命中：${JSON.stringify(hits)}`);
});

// ---------- L3：E-ACC-ITEM-ORPHAN ----------

test('L3 反：登记了卷文没有定义的编号 99 → 报 E-ACC-ITEM-ORPHAN，符号为该条目键', () => {
  const orphan = hitsOf('E-ACC-ITEM-ORPHAN', [row(1), row(2), row(99)], [1, 2]);
  assert.deepEqual(orphan.map((h) => h.symbolPath), [`${VOL}.${num(99)}`]);
});

test('L3 正：登记的编号都在定义处 → 不报 E-ACC-ITEM-ORPHAN', () => {
  assert.equal(hitsOf('E-ACC-ITEM-ORPHAN', [row(1), row(2)], [1, 2]).length, 0);
});

// ---------- L4：E-ACC-ITEM-COUNT ----------

test('L4 反：登记条数多于定义处编号数 → 报 E-ACC-ITEM-COUNT，符号为该卷', () => {
  const count = hitsOf('E-ACC-ITEM-COUNT', [row(1), row(2), row(99)], [1, 2]);
  assert.deepEqual(count.map((h) => h.symbolPath), [VOL]);
});

test('L4 反：登记条数少于定义处编号数 → 报 E-ACC-ITEM-COUNT，符号为该卷', () => {
  const count = hitsOf('E-ACC-ITEM-COUNT', [row(1)], [1, 2]);
  assert.deepEqual(count.map((h) => h.symbolPath), [VOL]);
});

test('L4 正：登记条数与定义处编号数相等 → 不报 E-ACC-ITEM-COUNT', () => {
  assert.equal(hitsOf('E-ACC-ITEM-COUNT', [row(1), row(2)], [1, 2]).length, 0);
});
