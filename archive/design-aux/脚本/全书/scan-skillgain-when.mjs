// 只读扫描：全书每处 process.skillGain 的 when（求值主体、可读范围）是"定义"还是"引用"。
// 只读 F:/dnd/docs/统一底层设计/卷*.md 顶层文件（版本快照/、审查/、素材包/ 是子目录，不扫）；
// 已停用的 卷三-物品与材料.md 不扫。不写任何文件。用法：node scan-skillgain-when.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = 'F:/dnd/docs/统一底层设计';
const RETIRED = new Set(['卷三-物品与材料.md']);
const HOME = /^卷十四-/;
// 自写约束的措辞：出现即视为在本行写了定义内容，而不是只指向表 F
const NORM = /不得使用|只能读|只许读|同受约束|同等对待|一次学习过程/;

export function scan() {
  const files = fs.readdirSync(DIR).filter(f => /^卷.+\.md$/.test(f) && !RETIRED.has(f)).sort();
  const rows = [];
  let tableF = 0, mentions = 0;
  for (const f of files) {
    const home = HOME.test(f);
    const lines = fs.readFileSync(path.join(DIR, f), 'utf8').split(/\r?\n/);
    let h2 = '', inF = false;
    lines.forEach((t, i) => {
      if (/^## /.test(t)) h2 = t.slice(3).trim();
      if (home && /^\*\*表 F /.test(t)) { inF = true; tableF++; rows.push({ f, no: i + 1, kind: '定义（表 F 起始）', t }); return; }
      if (inF && (/^\*\*把守\*\*/.test(t) || /^#{2,4} /.test(t) || /^---/.test(t))) inF = false;
      if (t.includes('skillGain')) mentions++;
      // 候选：同行提到 skillGain 与 when；或卷十四里泛指"过程槽"的 when（专指检定类过程槽的不算，它归表 C）
      const generic = t.replace(/检定类过程槽/g, '').includes('过程槽');
      const cand = /when/.test(t) && (t.includes('skillGain') || (home && generic));
      if (!cand) return;
      if (inF) { rows.push({ f, no: i + 1, kind: '定义（表 F 块内，同属一处）', t }); return; }
      if (/^附/.test(h2)) { rows.push({ f, no: i + 1, kind: '记录（附表，不计）', t }); return; }
      const cites = home ? /表 F/.test(t) : /卷十四/.test(t) && /表 F/.test(t);
      if (cites && !NORM.test(t)) rows.push({ f, no: i + 1, kind: '引用', t });
      else rows.push({ f, no: i + 1, kind: cites ? '定义（表 F 外自写约束）' : '定义（未指向表 F）', t });
    });
  }
  const outside = rows.filter(r => /^定义（(表 F 外|未指向)/.test(r.kind));
  return { files, rows, tableF, outside, mentions, defs: tableF + outside.length };
}

// 入库（甲-0）：仓库路径含中文，URL pathname 是百分号编码，改用 fileURLToPath 判主模块
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const r = scan();
  for (const x of r.rows) console.log(`${x.f}:${x.no}  ${x.kind}  ${x.t.slice(0, 70).replace(/\s+/g, ' ')}…`);
  console.log('');
  console.log(`扫描 ${r.files.length} 卷；提到 skillGain 的行 ${r.mentions}；表 F 定义块 ${r.tableF} 处；表 F 外定义 ${r.outside.length} 处；定义处合计 ${r.defs}`);
  console.log(r.defs === 1 && r.tableF === 1 ? '结论  只有表 F 一处定义' : '结论  定义不止一处');
}
