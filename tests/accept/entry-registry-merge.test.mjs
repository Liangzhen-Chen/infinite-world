// 总登记表合并脚本（tools/entry-registry-merge.mjs）的行为测试：自造小卷文与小登记表，期望值手算。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeNeeds } from '../../tools/entry-registry-merge.mjs';

const DOC = ['# 卷测', '### 3.1 读入口', '| `alpha(x)` | 说明 |', '| `beta(x)` | 说明 |', '### 3.2 别节', '内部只调 `beta`，读 rules.t.curve。', '`alpha` 算法：先调 `beta(x)` 再取 rules.t.curve'];
const reg = () => ({ version: 1, kinds: ['read'], entries: [
  { name: 'alpha', file: 'a.mjs', vol: '卷测', sec: '§3.1', kind: 'read', needs: [], rules: [] },
  { name: 'beta', file: 'b.mjs', vol: '卷测', sec: '§3.1', kind: 'read', needs: [], rules: [] },
] });
const run = (shard, doc = DOC) => mergeNeeds({ registry: reg(), shards: [{ volume: '卷测', ...shard }], volumes: new Map([['卷测', doc]]) });
const alpha = (r) => r.registry.entries.find((e) => e.name === 'alpha');

test('按原文找行，行号错了也采信；采信要求行里有目标名与入口名', () => {
  const r = run({ needs: [{ entry: 'alpha', targets: ['beta'], line: 99, quote: '先调 `beta(x)` 再取' }], rules: [{ entry: 'alpha', rules: ['rules.t.curve'], line: 1, quote: '再取 rules.t.curve' }] });
  assert.deepEqual(alpha(r).needs, ['b.mjs#beta']);
  assert.deepEqual(alpha(r).rules, ['rules.t.curve']);
  assert.equal(r.rejects.length, 0);
});

test('卷文上面插行后同一份抽取仍采信（锚定不靠行号）', () => {
  const r = run({ needs: [{ entry: 'alpha', targets: ['beta'], line: 7, quote: '先调 `beta(x)` 再取' }] }, ['', '', '插入', ...DOC]);
  assert.deepEqual(alpha(r).needs, ['b.mjs#beta']);
});

test('行里没有入口名、也不在其节内的，拒收并列出原因', () => {
  const r = run({ needs: [{ entry: 'alpha', targets: ['beta'], line: 6, quote: '内部只调 `beta`' }] });
  assert.deepEqual(alpha(r).needs, []);
  assert.equal(r.rejects.length, 1);
  assert.equal(r.rejects[0].target, 'beta');
});

test('规则键在行里找不到，拒收', () => {
  const r = run({ rules: [{ entry: 'alpha', rules: ['rules.t.nothing'], line: 7, quote: '再取 rules.t.curve' }] });
  assert.deepEqual(alpha(r).rules, []);
  assert.equal(r.rejects.length, 1);
});

test('判不是的条目取消已抽到的边，并单列在 decided 里', () => {
  const r = run({ needs: [{ entry: 'alpha', targets: ['beta'], line: 7, quote: '先调 `beta(x)` 再取' }], dropped: [{ entry: 'alpha', target: 'beta', reason: '写给别人的规矩' }] });
  assert.deepEqual(alpha(r).needs, []);
  assert.equal(r.rejects.length, 0);
  assert.deepEqual(r.decided.map((x) => [x.entry, x.item, x.原因]), [['alpha', 'beta', '写给别人的规矩']]);
});

test('连跑两次结果逐项相同', () => {
  const s = { needs: [{ entry: 'alpha', targets: ['beta'], line: 7, quote: '先调 `beta(x)` 再取' }], rules: [{ entry: 'alpha', rules: ['rules.t.curve'], line: 7, quote: '再取 rules.t.curve' }] };
  assert.deepEqual(run(s), run(s));
});
