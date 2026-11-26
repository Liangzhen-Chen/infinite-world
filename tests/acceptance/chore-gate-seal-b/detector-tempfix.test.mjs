// 验收：卡 chore/gate-seal-b 子卡 B（检测器误判与临时根删除助手）。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-gsb；未参与写码与审卡。
// 依据：卷十二:600（S12-2 登记器与执行器之外写 §2.11 文件的位置为 0）；卷十二:722（R12-3.2 越系统写按声明表判，本卡修声明误判为写）；卷十二:723（R12-3.3 分量按声明项派生）。
// 测什么：
//   S1 stateChains（tools/accept/lib/js-state.mjs）：5 例不算写（const/let 声明、for-of 绑定、逗号声明、形参默认值），5 例算写（赋值、属性赋值、delete、自增、复合赋值）；写链段取值正确。
//   S2 removeTempRoot（tests/accept/temp-root.mjs）：仓库内的根拒删；合法临时根删除成功。
//   S3 removeUnderTempRoot：rel 越出根（相对 ../、绝对路径）拒删；rel 命中 §2.11 登记模式（取自 scanclasses.json 的 registry_write.guardedPaths，不写死）拒删；合法 rel 删除成功。
// 预期：写码分支（chore/gate-seal-b）合入前，S2、S3 因助手尚不存在而红；S1 因 stateChains 仍把声明误判为写而红。
// 临时根只用 testTempRoot，写文件只用 writeUnderTempRoot，删除只用本卡新助手。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { testTempRoot, writeUnderTempRoot, removeTempRoot, removeUnderTempRoot } from '../../accept/temp-root.mjs';
import { stateChains } from '../../../tools/accept/lib/js-state.mjs';
import { tokenize } from '../../../tools/accept/lib/js-scan.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

// 源码里所有写链（write 为真）。
const writesOf = (src) => stateChains(tokenize(src)).filter((c) => c.write);

// ---------- S1：stateChains 写判定 ----------

const NOT_WRITES = [
  'const state = f();',
  'let state = 1;',
  'for (const state of xs) { use(state); }',
  'let a = 1, state = 2;',
  'function g(state = {}) { return state; }',
];
for (const src of NOT_WRITES) {
  test(`S1 声明不算写：${src}`, () => {
    assert.equal(writesOf(src).length, 0, `不应判为写链：${src}`);
  });
}

const WRITES = [
  'state = x;',
  'state.a = 1;',
  'delete state.a;',
  'state.n++;',
  'state.a.b += 2;',
];
for (const src of WRITES) {
  test(`S1 写入算写：${src}`, () => {
    assert.equal(writesOf(src).length, 1, `应判为一条写链：${src}`);
  });
}

test('S1 写链段取值：state.a.b += 2 的段为 a、b', () => {
  const [ch] = writesOf('state.a.b += 2;');
  assert.deepEqual(ch.segs, ['a', 'b']);
});

// ---------- S2：removeTempRoot ----------

test('S2 removeTempRoot：仓库内的根拒删', () => {
  const inRepo = join(ROOT, 'tests', 'zz-gsb-not-a-real-root');
  assert.throws(() => removeTempRoot(inRepo));
});

test('S2 removeTempRoot：合法临时根删除成功', () => {
  const root = testTempRoot('gsb-rm-root-');
  writeUnderTempRoot(root, 'a/b.txt', 'x');
  removeTempRoot(root);
  assert.equal(existsSync(root), false);
});

// ---------- S3：removeUnderTempRoot ----------

test('S3 removeUnderTempRoot：rel 为相对 ../ 越出根 → 拒删', () => {
  const root = testTempRoot('gsb-rmu-esc-');
  try {
    assert.throws(() => removeUnderTempRoot(root, '../gsb-escape.txt'));
  } finally {
    removeTempRoot(root);
  }
});

test('S3 removeUnderTempRoot：rel 为绝对路径 → 拒删', () => {
  const root = testTempRoot('gsb-rmu-abs-');
  try {
    assert.throws(() => removeUnderTempRoot(root, resolve(root, '..', 'gsb-escape.txt')));
  } finally {
    removeTempRoot(root);
  }
});

test('S3 removeUnderTempRoot：rel 命中 §2.11 登记路径 → 拒删', () => {
  const rows = JSON.parse(readFileSync(join(ROOT, 'tools/accept/scanclasses.json'), 'utf8')).rows;
  const guarded = (rows.find((c) => c.scanClass === 'registry_write') || {}).guardedPaths || [];
  const plain = guarded.find((p) => !p.includes('*'));
  assert.ok(plain, 'registry_write.guardedPaths 中应有不含通配符的登记路径');
  const root = testTempRoot('gsb-rmu-reg-');
  try {
    assert.throws(() => removeUnderTempRoot(root, plain));
  } finally {
    removeTempRoot(root);
  }
});

test('S3 removeUnderTempRoot：合法 rel 删除成功', () => {
  const root = testTempRoot('gsb-rmu-ok-');
  try {
    const full = writeUnderTempRoot(root, 'docs/x.md', 'y');
    removeUnderTempRoot(root, 'docs/x.md');
    assert.equal(existsSync(full), false);
  } finally {
    removeTempRoot(root);
  }
});
