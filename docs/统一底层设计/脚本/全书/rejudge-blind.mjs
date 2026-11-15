// 收卷批复跑盲区 88 条重判辅助：对每条命中，在各目标卷与声明卷正文（"## 附录"前）查标识符的出现与定义形态。只读。
// 用法：node F:/dnd/docs/统一底层设计/脚本/全书/rejudge-blind.mjs <复跑输出.txt> <起行> <止行>
import { readFileSync, readdirSync } from 'node:fs';
const DIR = 'F:/dnd/docs/统一底层设计/';
const [src, a, b] = process.argv.slice(2);
const rows = readFileSync(src, 'utf8').replace(/\r\n/g, '\n').split('\n').slice(Number(a) - 1, Number(b)).map((l) => l.split('\t'));
const vols = new Map();
for (const f of readdirSync(DIR).filter((x) => /^卷.*\.md$/.test(x))) { const ls = readFileSync(DIR + f, 'utf8').replace(/\r\n/g, '\n').split('\n'); const e = ls.findIndex((l) => l.startsWith('## 附录')); vols.set(f.replace(/-.*$/, ''), e >= 0 ? ls.slice(0, e) : ls); }
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const probe = (v, id) => {
  const ls = vols.get(v); if (!ls) return '无此卷';
  const re = new RegExp('(?<![A-Za-z0-9_])' + esc(id) + '(?![A-Za-z0-9_])');
  const def = new RegExp('^\\| `' + esc(id) + '`|"' + esc(id) + '"\\s*:|[{，,；(（\\s`]' + esc(id) + '\\??: |`' + esc(id) + '`（requires|`' + esc(id) + ': ');
  const hits = ls.map((l, i) => (re.test(l) ? i + 1 : 0)).filter(Boolean);
  const defs = ls.map((l, i) => (def.test(l) ? i + 1 : 0)).filter(Boolean);
  return hits.length ? `出现${hits.length}(首${hits[0]})` + (defs.length ? ` 定义形态@${defs.slice(0, 3).join(',')}` : ' 无定义形态') : '0';
};
rows.forEach((r, n) => {
  if (r.length < 4 || r[0] === '类别') return;
  const [cls, decl, id, tgt] = r; const dv = decl.split(':')[0];
  const t = tgt.split('/').map((v) => v + ':' + probe(v, id)).join('；');
  const all = [...vols.keys()].filter((v) => probe(v, id).includes('定义形态@')).join('、');
  console.log(`${n + 1}\t${decl}\t${id}\t${t}\t声明卷:${probe(dv, id)}\t全书有定义形态:${all || '无'}`);
});
