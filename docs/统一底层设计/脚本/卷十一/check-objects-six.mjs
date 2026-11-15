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
const md = [
  '# 乙-1/乙-4 补 1115y6：落点对象不在 §2.3 六类里的迁移行（脚本生成，勿手改）',
  '',
  '- 生成脚本：脚本/卷十一/check-objects-six.mjs；输入：脚本/卷十一/migrows-input.json（别名行不计）、乙4补-systems补全.json、卷二各表节、卷二 §1.9 词表族登记（第七种输入）、卷十二 §2.11。',
  `- 词表族登记读到 ${vocab.size} 个族名；表代号 ${tables.size} 个。`,
  `- 共 ${n} 行（别名行不计）：${[...stat].map(([k, v]) => `${k} ${v}`).join('、')}；认不出的 ${badRows} 行，对象 ${bad.size} 种。`,
  '',
  '| 迁移行 | 对象 | 落点（原文） | 候选 |', '|---|---|---|---|',
  ...rowsMd, '',
].join('\n');
writeFileSync(`${OUT}/乙5-对象不在六类清单.md`, md);
console.log(`非别名行 ${n}；认得出 ${n - badRows}；认不出 ${badRows} 行、${bad.size} 种对象；词表族 ${vocab.size} 个`);
console.log([...stat].map(([k, v]) => `${k}:${v}`).join(' '));
console.log([...bad].map(([o, rs]) => `${o}:${rs.length}`).join(' '));
