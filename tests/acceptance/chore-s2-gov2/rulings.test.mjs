// 规矩清尾（chore/s2-gov2）黑盒验收：现行有效裁定.json。
// 出题方 haiku-orca-test-gov2，依据卷十二:108（门禁是拦不是报）与卷十二:163（提交关口）。
// 只读 JSON 文本与结构断言；不抄裁定条数与行号。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { ROOT } from '../../accept/temp-root.mjs';

const RAW = readFileSync(join(ROOT, 'docs/审查/现行有效裁定.json'), 'utf8');

let DOC;
test('现行有效裁定.json 可解析为 JSON（卷十二:108）', () => {
  DOC = JSON.parse(RAW);
  assert.ok(DOC && typeof DOC === 'object', '解析结果不是对象');
});

// 递归收集所有 {key:'id'} 与所有 {key:'source'} 的位置，供下面各断言用。
function walk(node, path, visit) {
  if (Array.isArray(node)) {
    node.forEach((v, i) => walk(v, `${path}[${i}]`, visit));
    return;
  }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      visit(k, v, `${path}.${k}`, node);
      walk(v, `${path}.${k}`, visit);
    }
  }
}

const ids = () => {
  const out = [];
  walk(DOC, '$', (k, v, p) => { if (k === 'id' && typeof v === 'string') out.push({ id: v, path: p }); });
  return out;
};

test('现行有效裁定里不再有已废止的 K1125-DATE（卷十二:108）', () => {
  const found = ids().filter((x) => x.id === 'K1125-DATE');
  assert.deepEqual(found.map((x) => x.id), [], `仍挂着过期项：${found.map((x) => x.path).join('、')}`);
});

test('K1125-P3 若保留，其条目须注明取代情况（未被取代 或 部分取代，主会话裁定 msg_0b46859e6d2c）', () => {
  const holders = [];
  walk(DOC, '$', (k, v, p, parent) => { if (k === 'id' && v === 'K1125-P3') holders.push(parent); });
  for (const obj of holders) {
    const s = JSON.stringify(obj);
    assert.ok(s.includes('未被取代') || s.includes('部分取代'), 'K1125-P3 仍保留，但条目未注明取代情况');
  }
});

test('K1125-P4 若保留，其条目必须注明未被取代（卷十二:108；以写码方开发.md 为准）', () => {
  // 含 id === K1125-P4 的裁定对象本身；若存在，整条 JSON 须写明「未被取代」。
  const holders = [];
  walk(DOC, '$', (k, v, p, parent) => { if (k === 'id' && v === 'K1125-P4') holders.push(parent); });
  for (const obj of holders) {
    assert.ok(JSON.stringify(obj).includes('未被取代'), 'K1125-P4 仍保留，但条目未注明「未被取代」');
  }
});

test('任何条目的 source 字段都不引 archive/（卷十二:108；archive 为物理隔离历史仓）', () => {
  const bad = [];
  walk(DOC, '$', (k, v, p) => {
    if (k === 'source' && typeof v === 'string' && v.includes('archive/')) bad.push(p);
  });
  assert.deepEqual(bad, [], `source 仍引 archive/：${bad.join('、')}`);
});
