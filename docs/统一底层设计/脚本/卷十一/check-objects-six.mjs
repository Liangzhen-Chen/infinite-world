// 乙-1/乙-4 补 1115y5：列出落点对象不在卷十一 §2.3 六类里的迁移行。
// 六类（封闭）：表代号、词表族条目、规则表键 rules.*、系统登记项键、模块组键、门禁设施代号。
// 本脚本能认出的：表代号（卷二各表节，取表主表）、规则表键（rules. 开头）、系统登记项键（卷二 §2.7 补全表与 JSON 里的 sys. 键）、
// 模块组键（卷二 §2.7 七个运行时模块组加离线模块组键 content-scripts）、门禁设施代号（卷十二 §2.11 登记行与卷二十八 §2.12）。
// 词表族条目没有机读登记表，认不出，所以与"真不在六类"的一起列出，标"六类归属待核"。只读、确定性、不联网。
// 用法：node check-objects-six.mjs   输出：审查/脚本输出/乙5-对象不在六类清单.md
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const CFG = JSON.parse(readFileSync(`${HERE}/gen-卷十一-inputs.json`, 'utf8'));
const OUT = `${HERE}/../../审查/脚本输出`.replace(/\\/g, '/');
const mig = JSON.parse(readFileSync(`${HERE}/migrows-input.json`, 'utf8'));
const sysJ = JSON.parse(readFileSync(`${OUT}/乙4补-systems补全.json`, 'utf8')).systems;
const reg = readFileSync(`${CFG.dir}/${CFG.registry.file}`, 'utf8').split(/\r?\n/);
const tables = new Set();
for (const l of reg) if (l.startsWith(CFG.registry.tables)) { const m = l.match(/`([a-z_]+)`/); if (m) tables.add(m[1]); }
const sysKeys = new Set([...sysJ.map(s => s.system), 'sys.capacity', 'sys.status']);
const groups = new Set(['kernel', 'inputEdge', 'display', 'gate', 'outputGate', 'aiGate', 'host', 'content-scripts']);
const gates = new Set(['cloud-gate', 'content-build-check', 'content-approve']);
const cls = o => (tables.has(o) ? '表代号' : o.startsWith('rules.') ? '规则表键' : sysKeys.has(o) ? '系统登记项键' : groups.has(o) ? '模块组键' : gates.has(o) ? '门禁设施代号' : null);

const stat = new Map(); const bad = new Map();
let n = 0;
for (const r of mig.rows) {
  if (r.aliasOf) continue;
  n++;
  const o = r.targetObject.replace(/`/g, '').trim();
  const c = cls(o);
  if (c) stat.set(c, (stat.get(c) ?? 0) + 1);
  else (bad.get(o) ?? bad.set(o, []).get(o)).push(r.rowKey);
}
const badRows = [...bad.values()].reduce((s, x) => s + x.length, 0);
const md = [
  '# 乙-1/乙-4 补 1115y5：落点对象不在 §2.3 六类里的迁移行（脚本生成，勿手改）',
  '',
  '- 生成脚本：脚本/卷十一/check-objects-six.mjs；输入：脚本/卷十一/migrows-input.json（别名行不计）、乙4补-systems补全.json、卷二各表节、卷十二 §2.11。',
  '- 能认出的六类：表代号、规则表键、系统登记项键（含卷二 §2.7 JSON 的 sys.status、sys.capacity）、模块组键（七个运行时组加 content-scripts）、门禁设施代号。词表族条目没有机读登记，认不出，与真不在六类的一起列出，标"六类归属待核"。',
  `- 不单独计数的别名行除外，共 ${n} 行：${[...stat].map(([k, v]) => `${k} ${v}`).join('、')}；认不出的 ${badRows} 行，对象 ${bad.size} 种。`,
  '',
  '| 对象 | 行数 | 迁移行 |', '|---|---:|---|',
  ...[...bad].sort((a, b) => b[1].length - a[1].length || (a[0] < b[0] ? -1 : 1)).map(([o, ks]) => `| ${o} | ${ks.length} | ${ks.join('、')} |`),
  '',
].join('\n');
writeFileSync(`${OUT}/乙5-对象不在六类清单.md`, md);
console.log(`非别名行 ${n}；认得出 ${n - badRows}；认不出 ${badRows} 行、${bad.size} 种对象`);
console.log([...bad].map(([o, ks]) => `${o}:${ks.length}`).join(' '));
