// 全书已登记的词表族名集合（族名可与实体前缀同头，如卷二十一的 body_need，不是实体 id）。与 check-卷四.mjs 的 FAMILIES 同一解析口径。
// 来源：卷二 §1.9"词表族前缀（首批全表，族名 → 前缀）"一段的 `族名→前缀` 对；各卷标题含"词表族"的小节里，表格首列的族名（`族名` 或 族名 → `前缀`）与标题里点名的 `族名`。
// replace：{ 卷名开头: 文本 }，用正在检查的副本替换对应卷（注入反测用）。
import { readFileSync, readdirSync } from 'node:fs';

export function registeredFamilies(dir = 'F:/dnd/docs/统一底层设计/', replace = {}) {
  const fam = new Set(); const ok = (s) => /^[a-z][a-z0-9_]*$/.test(s);
  for (const f of readdirSync(dir).filter((x) => /^卷.*\.md$/.test(x))) {
    const key = Object.keys(replace).find((k) => f.startsWith(k));
    const src = key ? replace[key] : readFileSync(dir + f, 'utf8');
    const ls = src.replace(/\r\n/g, '\n').split('\n'); const end = ls.findIndex((l) => l.startsWith('## 附录')); const body = end >= 0 ? ls.slice(0, end) : ls;
    let inFam = false, in19 = false;
    for (const l of body) {
      if (/^#{2,4} /.test(l)) { inFam = /^#{3,4} .*词表族/.test(l); in19 = f.startsWith('卷二-') && /^### 1\.9 /.test(l); if (inFam) for (const m of l.matchAll(/`([a-z][a-z0-9_]*)`/g)) if (!/_$/.test(m[1])) fam.add(m[1]); continue; }
      if (in19 && l.includes('词表族前缀（首批全表')) for (const m of l.matchAll(/([a-z][a-z0-9_]*)→`[a-z0-9_]+_`/g)) fam.add(m[1]);
      if (inFam && /^\| /.test(l)) { const c0 = l.split('|')[1].trim(); const m = c0.match(/^`([a-z][a-z0-9_]*)`/) || c0.match(/^([a-z][a-z0-9_]*) *→/); if (m && ok(m[1])) fam.add(m[1]); }
    }
  }
  return fam;
}
