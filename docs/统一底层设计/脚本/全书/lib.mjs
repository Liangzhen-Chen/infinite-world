// 全书一致性核对脚本的公共部分：读卷、分节、表格切分、排除区判定。
// 只读 F:/dnd/docs/统一底层设计/卷*.md（不含 版本快照/、审查/ 子目录）。
import fs from 'node:fs';
import path from 'node:path';

export const DIR = 'F:/dnd/docs/统一底层设计';

const CN = { '零': 0, '〇': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
export function cnToNum(s) {
  if (/^\d+$/.test(s)) return +s;
  if (s === '十') return 10;
  let n = 0;
  if (s.includes('十')) {
    const [a, b] = s.split('十');
    n = (a ? CN[a] : 1) * 10 + (b ? CN[b] : 0);
  } else n = CN[s];
  return n;
}

// 章节号：'## §3 统一入口' → '3'；'## 二 统一入口' → '2'；'### 2.9 …' → '2.9'；'## §3A' → '3A'
export function headingNum(text) {
  let m = text.match(/^§?\s*(\d+(?:\.\d+)*[A-Z]?)(?=[\s（(]|$)/);
  if (m) return m[1];
  m = text.match(/^([〇零一二三四五六七八九十]+)(?=\s)/);
  if (m) return String(cnToNum(m[1]));
  return null;
}

// 定义排除区：附录、迁移清单、开放问题、本卷使用、记账、影响面、牵连、修改记录、自检/核算输出、审查处置
const EXCL_H2 = /^(附|附录)|迁移|开放问题|修订记录|术语/;
const EXCL_ANY = /本卷使用|记账|影响面|牵连|修改记录|自检脚本|核算脚本|审查意见|处置对照|对账脚本|开放问题|迁移与退役/;

export function loadVolumes() {
  const files = fs.readdirSync(DIR).filter(f => /^卷.+\.md$/.test(f)).sort();
  return files.map(f => {
    const vol = f.split('-')[0];
    const raw = fs.readFileSync(path.join(DIR, f), 'utf8').split(/\r?\n/);
    const lines = [];
    let h2 = '', h3 = '', h4 = '', inCode = false, header = null, prevTable = false;
    let n2 = null, n3 = null, n4 = null;
    raw.forEach((t, i) => {
      const L = { no: i + 1, text: t };
      if (/^\s*```/.test(t)) { inCode = !inCode; L.fence = true; }
      L.inCode = inCode || L.fence;
      let m;
      if (!L.inCode && (m = t.match(/^(#{2,4})\s+(.*)$/))) {
        const lvl = m[1].length, ht = m[2].trim();
        if (lvl === 2) { h2 = ht; h3 = ''; h4 = ''; n2 = headingNum(ht); n3 = null; n4 = null; }
        if (lvl === 3) { h3 = ht; h4 = ''; n3 = headingNum(ht); n4 = null; }
        if (lvl === 4) { h4 = ht; n4 = headingNum(ht); }
        L.heading = { lvl, text: ht, num: headingNum(ht) };
      }
      L.h2 = h2; L.h3 = h3; L.h4 = h4;
      L.sec = n2; L.sub = n4 || n3 || n2; L.nums = [n2, n3, n4].filter(Boolean);
      L.excluded = EXCL_H2.test(h2.replace(/^§?\S*\s*/, '')) || /^(附|附录)/.test(h2) ||
        EXCL_ANY.test(h2) || EXCL_ANY.test(h3) || EXCL_ANY.test(h4) || /^7$/.test(n2 || '') && /迁移/.test(h2);
      // 表格
      if (!L.inCode && /^\s*\|/.test(t)) {
        const cells = splitRow(t);
        if (!prevTable) { header = cells; L.isHeader = true; }
        else if (cells.every(c => /^:?-{2,}:?$/.test(c) || c === '')) L.isSep = true;
        else L.cells = cells;
        L.tableHeader = header;
        prevTable = true;
      } else { prevTable = false; header = null; }
      lines.push(L);
    });
    // 节号集合（供 B 类核对节是否存在）
    const secs = new Map();
    for (const L of lines) if (L.heading && L.heading.num) secs.set(L.heading.num, L);
    return { vol, file: f, lines, secs, num: cnToNum(vol.slice(1)) };
  });
}

// 表格行切分：反引号内的 | 与转义的 \| 不切
export function splitRow(t) {
  const s = t.trim().replace(/^\|/, '').replace(/\|$/, '');
  const out = []; let cur = '', bt = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\' && s[i + 1] === '|') { cur += '|'; i++; continue; }
    if (c === '`') bt = !bt;
    if (c === '|' && !bt) { out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  out.push(cur.trim());
  return out;
}

export const ticks = s => [...s.matchAll(/`([^`]+)`/g)].map(m => m[1]);

// 行内"引用"标记：命中则该行不算定义
export const REF_MARK = /见卷|卷[〇零一二三四五六七八九十]+已定|归卷|本卷不定义|引用/;

// 卷名正则（最长匹配）
export const VOLREF = /卷([〇零一二三四五六七八九十]+)/g;

export function volByNum(vols) {
  const m = new Map();
  for (const v of vols) m.set(v.num, v);
  return m;
}

// 切参数表：顶层逗号计数
export function splitArgs(s) {
  const out = []; let depth = 0, cur = '';
  for (const c of s) {
    if ('([{<（'.includes(c)) depth++;
    if (')]}>）'.includes(c)) depth--;
    if ((c === ',' || c === '，') && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// 取出与首个左括号配对的括号内容
export function parenAt(s, start) {
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    if (s[i] === '(' || s[i] === '（') depth++;
    else if (s[i] === ')' || s[i] === '）') { depth--; if (depth === 0) return s.slice(start + 1, i); }
  }
  return null;
}

export function writeOut(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, 'utf8');
}
