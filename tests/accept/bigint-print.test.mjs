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
  // L-09 检测器加固改了 typed_pos（接 tsc）与 import_edge（导出级默认拒绝），前两条字面量随之重算；js-scan、js-state 未动。
  // 门禁封口卡 B 改了 js-state（排除绑定声明）与 typed_pos（tsc 临时目录走临时根设施），三条字面量随之重算。
  assert.equal(codePrint(ctx, ['tools/accept/detectors/typed_pos.mjs']), '4fe676f94f055cf0dcf353d81f02dcfed09468c6c04d8d8ff4cba001df68ccaa');
  assert.equal(codePrint(ctx, ['tools/accept/lib/js-scan.mjs', 'tools/accept/lib/js-state.mjs']), 'f132a3f1bb98a1d68d6f42cb4b8082a69bee828e4246247ce6407502f3f474a6');
  assert.equal(codePrint(ctx, ['tools/accept/detectors/import_edge.mjs', 'tools/accept/detectors/typed_pos.mjs']), '4bf284b8c26d3b6a987f83c926b43e4e97e82215bfaefcf810aba6f3eae17ae6');
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
