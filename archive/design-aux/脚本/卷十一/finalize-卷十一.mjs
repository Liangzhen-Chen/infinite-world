// 卷十一 收尾：把生成器输出贴进附录甲、把自检输出贴进卷末附录，并存快照。可重复运行。
// 生成器、自检与它们的输出都在本脚本同目录（仓库 docs/统一底层设计/脚本/卷十一/）。
// 用法：node finalize-卷十一.mjs gen     （运行生成器，输出写 gen-卷十一-卡族.out.txt，贴卡族表）
//       node finalize-卷十一.mjs check   （运行自检，输出写 check-卷十一.out.txt，贴自检输出并写快照）
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
const HERE = dirname(fileURLToPath(import.meta.url)).replace(/\\/g, '/');
const GEN = `${HERE}/gen-卷十一-卡族.mjs`, CHECK = `${HERE}/check-卷十一.mjs`;
const P = 'F:/dnd/docs/统一底层设计/卷十一-迁移路线与卡清单.md';
const SNAP = 'F:/dnd/docs/统一底层设计/版本快照/卷十一-v2.md';
const mode = process.argv[2];
let L = readFileSync(P, 'utf8').split(/\r?\n/); // 工作区可能是 CRLF（git 换行转换），按行读不受影响
if (mode === 'gen') {
  const txt = execFileSync(process.execPath, [GEN], { encoding: 'utf8' });
  writeFileSync(`${HERE}/gen-卷十一-卡族.out.txt`, txt);
  const gen = txt.trimEnd().split(/\r?\n/);
  const a = L.findIndex(l => l.startsWith('生成器 `' + GEN + '`'));
  const b = L.findIndex((l, i) => i > a && l === '读法：');
  if (a < 0 || b < 0) throw new Error('附录甲定位失败');
  L = [...L.slice(0, a + 1), '', ...gen, '', ...L.slice(b)];
  // 卷首说明这一行是锚点，它与"读法："之间整段由生成器输出替换
  writeFileSync(P, L.join('\n'));
  console.log(`贴入卡族表 ${gen.length} 行`);
} else if (mode === 'check') {
  let txt;
  try { txt = execFileSync(process.execPath, [CHECK], { encoding: 'utf8' }); } catch (e) { txt = e.stdout; }
  writeFileSync(`${HERE}/check-卷十一.out.txt`, txt);
  const out = txt.trimEnd().split(/\r?\n/);
  const a = L.findIndex(l => l.startsWith('## 附录 自检脚本输出'));
  if (a < 0) throw new Error('自检附录定位失败');
  L = [...L.slice(0, a + 1), '', '`node ' + CHECK + '` 的输出：', '', '```text', ...out, '```', ''];
  writeFileSync(P, L.join('\n'));
  copyFileSync(P, SNAP);
  console.log(`贴入自检输出 ${out.length} 行；已写快照`);
} else throw new Error('用法：gen | check');
