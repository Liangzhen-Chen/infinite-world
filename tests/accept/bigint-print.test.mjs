// BigInt 指纹修复卡（卷十二 S12-13、R12-14.3）：read.mjs 的 codePrint 给 BigInt 定一种确定的序列化写法，
// 不改其他类型的序列化结果（不含 BigInt 的输入指纹与改前 master 逐字相同）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codePrint, classPrint, loadContext } from '../../tools/accept/read.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const vctx = (map) => ({ read: (p) => map.get(p) });
const print = (src, name = 'x.mjs') => codePrint(vctx(new Map([[name, src]])), [name]);

test('codePrint 不含 BigInt 的输入与改前 master 的指纹逐字相同', () => {
  const ctx = loadContext(ROOT);
  // 下列字面量是固定文件内容的指纹，用来钉死 codePrint 的序列化写法；所取文件不属于会随新检测方式改动的 path_access、call_edge
  // （块 3 第 3-3 张第二部分改了这两个检测器，原先取它们的两条字面量随之作废，改取 typed_pos；第二条 js-scan、js-state 的字面量取自改前 master 未变）。
  assert.equal(codePrint(ctx, ['tools/accept/detectors/typed_pos.mjs']), '4d6035fe84dec2c9c02d51ba4fcdc8d54345469649de89a6ef64bc69e2449be7');
  assert.equal(codePrint(ctx, ['tools/accept/lib/js-scan.mjs', 'tools/accept/lib/js-state.mjs']), '434d6196a6cfb92c945bd66d2e83dffbd3153603af0cf228e491f89d47785b2b');
  assert.equal(codePrint(ctx, ['tools/accept/detectors/import_edge.mjs', 'tools/accept/detectors/typed_pos.mjs']), 'eb82a96d09a863ac785a16b25dcb62198b7cc18788209f4638334694e7632c2f');
  // 判据闭包为空的类别（登记了检测器代号但仓库里没有该模块）：指纹是空序列的 sha256，改前改后一样。
  assert.equal(classPrint(ctx, 'flow_taint'), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(classPrint(ctx, 'legacy_symbol'), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
});

test('codePrint 遇 BigInt 不崩、同值同指纹、与数值和普通字串不撞', () => {
  assert.doesNotThrow(() => print('const x = 10n;'));
  assert.equal(print('const x = 10n;'), print('const x = 0xAn;'));
  assert.notEqual(print('const x = 10n;'), print('const x = 11n;'));
  assert.notEqual(print('const x = 10n;'), print('const x = 10;'));
  assert.notEqual(print('const x = 10n;'), print('const x = "10";'));
  assert.notEqual(print('const x = 10n;'), print('const x = "{\\"$bigint\\":\\"10\\"}";'));
});
