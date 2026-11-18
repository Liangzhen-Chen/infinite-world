// 4-4a：冻结分布表的离线生成与逐位比对（卷二 §1.10 :324–:325 表内容、:327 截断/clamp；卷二十七 R27-5.2 :572–:574）。
// 表由 tools/gen-det-tables.mjs 用 BigInt 高精度算出，入库带摘要；--check 重新生成并逐位比对入库文件，不一致退出码 1。
// 本测试只跑 --check 与读入库文件的点数/端点，不现算数学期望（期望值由生成脚本的 BigInt 算法负责）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FILE = 'world/ontology/dimensions/_distributions.json';

test('det 表 --check：重新生成与入库文件逐位一致（退出码 0）', () => {
  const out = execFileSync('node', ['tools/gen-det-tables.mjs', '--check'], { cwd: ROOT, encoding: 'utf8' });
  assert.match(out, /up to date/);
});

test('冻结表点数 4097/81/4097，分位数端点钳 ±39000，各表带 sha256（卷二十七 R27-5.2 :574）', () => {
  const doc = JSON.parse(readFileSync(join(ROOT, FILE), 'utf8'));
  assert.equal(doc.normalQuantile.values.length, 4097);
  assert.equal(doc.normalQuantile.values[0], -39000);
  assert.equal(doc.normalQuantile.values[4096], 39000);
  assert.equal(doc.expTable.expInt.values.length, 81); // k=-40..40
  assert.equal(doc.expTable.expFrac.values.length, 4097); // m=0..4096
  for (const t of [doc.normalQuantile, doc.expTable.expInt, doc.expTable.expFrac]) assert.match(t.sha256, /^[0-9a-f]{64}$/);
});

test('分位数手算对照：Φ⁻¹(0.25)=−0.674489750196…、Φ⁻¹(0.75)=+0.674489750196…，按向零截断到 4 位', () => {
  const doc = JSON.parse(readFileSync(join(ROOT, FILE), 'utf8'));
  // j=1024 → p=0.25：−0.67448975×10⁴ = −6744.8975…，向零截断 −6744；j=3072 → +6744。
  assert.equal(doc.normalQuantile.values[1024], -6744);
  assert.equal(doc.normalQuantile.values[3072], 6744);
});
