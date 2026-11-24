// 乙-1/乙-4 补：列出落点对象不在卷十一 §2.3 六类里的迁移行（1115y6 起词表族条目作为第七种输入来认）。
// 六类（封闭）：表代号、词表族条目、规则表键 rules.*、系统登记项键、模块组键、门禁设施代号。
// 本脚本认得出的输入：
//   表代号            卷二各表节（表主节标题里的代号）；
//   词表族条目        卷二 §1.9 词表族登记（"族名→`前缀_`" 的清单，含 1115k2 等补登的行；只读已有设计文字，不造登记表）；
//   规则表键          rules. 开头；
//   系统登记项键      卷二 §2.7 补全表与 JSON 里的 sys. 键（乙4补-systems补全.json 加 sys.status、sys.capacity）；
//   模块组键          七个运行时模块组加离线模块组键 content-scripts；
//   门禁设施代号      cloud-gate、content-build-check、content-approve。
// 认完剩下的才是真不在六类的，连同疑似旧表名一起列出，每行写原文（落点）和候选。只读、确定性、不联网。
// 用法：node check-objects-six.mjs   输出：审查/脚本输出/乙5-对象不在六类清单.md
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { receivingVolume, processTable, anchorProcs, DISPLAY_DUTY, PLACEHOLDER } from './object-rules.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const CFG = JSON.parse(readFileSync(`${HERE}/gen-卷十一-inputs.json`, 'utf8'));
const OUT = `${HERE}/../../审查/脚本输出`.replace(/\\/g, '/');
const mig = JSON.parse(readFileSync(`${HERE}/migrows-input.json`, 'utf8'));
const sysJ = JSON.parse(readFileSync(`${OUT}/乙4补-systems补全.json`, 'utf8')).systems;
const regText = readFileSync(`${CFG.dir}/${CFG.registry.file}`, 'utf8');
const reg = regText.split(/\r?\n/);
const tables = new Set();
for (const l of reg) if (l.startsWith(CFG.registry.tables)) { const m = l.match(/`([a-z_]+)`/); if (m) tables.add(m[1]); }
// 词表族登记：卷二里 "族名→`前缀_`" 的写法
const vocab = new Set([...regText.matchAll(/([a-z][a-z0-9_]*)→`[a-z]+_`/g)].map(m => m[1]));
const sysKeys = new Set([...sysJ.map(s => s.system), 'sys.capacity', 'sys.status']);
const sysOfVol = new Map(sysJ.map(s => [s.volume, s.system]));
const groups = new Set(['kernel', 'inputEdge', 'display', 'gate', 'outputGate', 'aiGate', 'host', 'content-scripts']);
const gates = new Set(['cloud-gate', 'content-build-check', 'content-approve']);
const cls = o => (tables.has(o) ? '表代号' : vocab.has(o) ? '词表族条目' : o.startsWith('rules.') ? '规则表键' : sysKeys.has(o) ? '系统登记项键' : groups.has(o) ? '模块组键' : gates.has(o) ? '门禁设施代号' : null);
// 疑似旧表名：名字像某个表代号的复数或带前后缀
const sus = o => { const out = []; for (const t of tables) if (o === t + 's' || o + 's' === t || (o.startsWith(t) && o !== t && o.length <= t.length + 6)) out.push(t); return out; };

const stat = new Map(); const bad = new Map(); let n = 0;
for (const r of mig.rows) {
  if (r.aliasOf) continue;
  n++;
  const o = r.targetObject.replace(/`/g, '').trim();
  const c = cls(o);
  if (c) stat.set(c, (stat.get(c) ?? 0) + 1);
  else (bad.get(o) ?? bad.set(o, []).get(o)).push(r);
}
const badRows = [...bad.values()].reduce((s, x) => s + x.length, 0);
const rowsMd = [];
for (const [o, rs] of [...bad].sort((a, b) => b[1].length - a[1].length || (a[0] < b[0] ? -1 : 1))) {
  const s = sus(o);
  for (const r of rs) {
    const own = sysOfVol.get(r.volume);
    const cand = [...(s.length ? [`名字近似表代号 ${s.join('、')}`] : []), ...(own ? [`同卷系统键 ${own}`] : [])].join('；') || '无';
    rowsMd.push(`| ${r.rowKey} | ${o}${s.length ? '（疑似旧表名）' : ''} | ${(r.target || '（空）').replace(/\|/g, '/').slice(0, 70)} | ${cand} |`);
  }
}
// ---- 1115y8c：两条整类判据（object-rules.mjs；判据说明 审查/乙阶段-落点对象整类判据-1115y8c.md）----
// 判一：认不出的对象、和已按"原对象栏写"整类改写过的行，对象应是接收卷的系统键；
// 判二：对象是模块组键的行，锚点全在另一个进程时，取显示职责在该进程的对应组。
const pt = processTable(regText);
const SERVER = pt.groupProc.get(DISPLAY_DUTY[1]), CLIENT = pt.groupProc.get(DISPLAY_DUTY[0]);
const judge1 = [], judge2 = [], mixed2 = [], toServer = []; let n1 = 0, n2 = 0;
for (const r of mig.rows) {
  if (r.aliasOf) continue;
  const o = r.targetObject.replace(/`/g, '').trim();
  const rewritten = /；原对象栏写 /.test(r.target ?? '');
  if (!PLACEHOLDER.has(o) && !tables.has(o) && (!cls(o) || (rewritten && sysKeys.has(o)))) {
    n1++; const rv = receivingVolume(r.target, r.volume, CFG.volCode);
    const want = sysOfVol.get(rv.vol) ?? null;
    if (want !== o) judge1.push({ k: r.rowKey, o, want, how: rv.how, vol: r.volume });
  }
  if (!pt.groupProc.has(o)) continue;
  const a = anchorProcs(r, pt);
  if (!a.procs.size) continue;
  const own = pt.groupProc.get(o); n2++;
  if (a.procs.size > 1) { mixed2.push({ k: r.rowKey, o, files: a.files }); continue; }
  const p = [...a.procs][0];
  if (p === own) continue;
  if (own === CLIENT && p === SERVER) judge2.push({ k: r.rowKey, o, want: o === DISPLAY_DUTY[0] ? DISPLAY_DUTY[1] : null, files: a.files, vol: r.volume });
  else if (own === SERVER && p === CLIENT) toServer.push({ k: r.rowKey, o, files: a.files });
}
writeFileSync(`${OUT}/乙8c-整类判据结果.json`, JSON.stringify({ judge1, judge2, mixed2, toServer }, null, 1) + '\n');

const md = [
  '# 乙-1/乙-4 补 1115y6：落点对象不在 §2.3 六类里的迁移行（脚本生成，勿手改）',
  '',
  '- 生成脚本：脚本/卷十一/check-objects-six.mjs；输入：脚本/卷十一/migrows-input.json（别名行不计）、乙4补-systems补全.json、卷二各表节、卷二 §1.9 词表族登记（第七种输入）、卷十二 §2.11。',
  `- 词表族登记读到 ${vocab.size} 个族名；表代号 ${tables.size} 个。`,
  `- 共 ${n} 行（别名行不计）：${[...stat].map(([k, v]) => `${k} ${v}`).join('、')}；认不出的 ${badRows} 行，对象 ${bad.size} 种。`,
  '',
  '| 迁移行 | 对象 | 落点（原文） | 候选 |', '|---|---|---|---|',
  ...rowsMd, '',
  '## 整类判据一：接收卷系统键（1115y8c）', '',
  '范围：对象认不出的行，以及落点里带"原对象栏写"（已按 17:0x 第二条整类改写过）且对象是系统键的行。判法：落点写"迁/交/归/移 卷X"取卷X；否则取落点第一个节号引用所在卷（裸 § 为本卷）；没有节号引用取本卷；系统键按卷读 乙4补-systems补全.json。',
  `在范围内 ${n1} 行；对象与判据不一致的：${judge1.length} 行。`, '',
  ...(judge1.length ? ['| 迁移行 | 现对象 | 判据给出 | 依据 |', '|---|---|---|---|', ...judge1.map(x => `| ${x.k} | ${x.o} | ${x.want ?? '（该卷无系统键）'} | ${x.how} |`), ''] : []),
  '## 整类判据二：锚点所在进程（1115y8c）', '',
  `范围：对象是卷二 §2.9 第 0 条进程分组表成员的模块组键的行。判法：代码锚点（.mjs、.js）按该表根目录判进程，不带根目录的按同节"路径写法"相对 ${pt.defaultRoot}；对象按同表成员判进程。对象在${CLIENT}、而代码锚点全在${SERVER}的，取显示职责在${SERVER}的对应组（${DISPLAY_DUTY[0]} → ${DISPLAY_DUTY[1]}），没有对应组的列给李白。`,
  `在范围内且有代码锚点的 ${n2} 行；不一致的：${judge2.length} 行。`, '',
  ...(judge2.length ? ['| 迁移行 | 现对象 | 判据给出 | 代码锚点 |', '|---|---|---|---|', ...judge2.map(x => `| ${x.k} | ${x.o} | ${x.want ?? '（无对应组，列给李白）'} | ${x.files.join('、')} |`), ''] : []),
  `另列（不改）：代码锚点跨两个进程的 ${mixed2.length} 行；锚点在${CLIENT}、对象是${SERVER}组的 ${toServer.length} 行（迁入${SERVER}，是 §2.9 第 0 条"客户端不留"的方向，不算不一致）。`, '',
  ...(mixed2.length + toServer.length ? ['| 迁移行 | 现对象 | 情形 | 代码锚点 |', '|---|---|---|---|', ...mixed2.map(x => `| ${x.k} | ${x.o} | 跨进程 | ${x.files.join('、')} |`), ...toServer.map(x => `| ${x.k} | ${x.o} | 迁入${SERVER} | ${x.files.join('、')} |`), ''] : []),
].join('\n');
writeFileSync(`${OUT}/乙5-对象不在六类清单.md`, md);
console.log(`非别名行 ${n}；认得出 ${n - badRows}；认不出 ${badRows} 行、${bad.size} 种对象；词表族 ${vocab.size} 个`);
console.log([...stat].map(([k, v]) => `${k}:${v}`).join(' '));
console.log([...bad].map(([o, rs]) => `${o}:${rs.length}`).join(' '));
console.log(`判据一范围 ${n1} 行，不一致 ${judge1.length}：${judge1.map(x => `${x.k} ${x.o}→${x.want}`).join('；')}`);
console.log(`判据二不一致 ${judge2.length}：${judge2.map(x => `${x.k} ${x.o}→${x.want}`).join('；')}；跨进程 ${mixed2.length}：${mixed2.map(x => x.k + ' ' + x.o).join('；')}；迁入服务端 ${toServer.length}：${toServer.map(x => x.k + ' ' + x.o).join('；')}`);
