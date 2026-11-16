// 封卷后勘误 1116s2（李白 11-16 11:36 ⑤）：各卷 §7 迁移表前说明里处置值 `mig_disp` 的"五值之一"改"六值之一"，每卷写一条封后勘误。
// 判法（整类）：只改第一个附录标题（"## 附"开头）之前的正文行；修订记录（在附录里）是历史，不回改；只改"五值之一"这一个词组；
// 其余写"五值"的地方（词表族条目、成功度档、知情来源档、习惯层等）与处置值无关，不动，只列出。
// 修订记录加在该卷最后一条"封卷后勘误"记录之后，写法照该条（表格行、列表项或段落）。
// 用法：node apply-1116s2.mjs [--dry]   改前须先做快照（snap.sh pre 1116s2 ...）
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const CFG = JSON.parse(readFileSync(`${HERE}/gen-卷十一-inputs.json`, 'utf8'));
const DIR = CFG.dir;
const DRY = process.argv.includes('--dry');
const SELF = /^卷十一-/; // 卷十一单独处理
const snaps = new Map(readFileSync('F:/dnd-tmp/y1/w/snaps.txt', 'utf8').split('\n').filter(Boolean).map(l => { const [f, pre, post] = l.split('|'); return [f, { pre, posts: post.split(',') }]; }));
const START = /^(?:\|\s*(?:\d+\s*\|\s*)?(?:—\s*\|\s*—\s*\|\s*)?|- |### )?封卷后勘误/;
let total = 0, nVol = 0; const touched = [];
for (const f of readdirSync(DIR).filter(x => new RegExp(CFG.volFile).test(x)).sort()) {
  if (SELF.test(f)) continue;
  const raw = readFileSync(`${DIR}/${f}`, 'utf8');
  const crlf = raw.includes('\r\n'); const L = raw.replace(/\r\n/g, '\n').split('\n');
  const app = L.findIndex(l => /^## 附/.test(l));
  const cut = app < 0 ? L.length : app;
  let n = 0;
  for (let i = 0; i < cut; i++) if (L[i].includes('五值之一')) { n += L[i].split('五值之一').length - 1; L[i] = L[i].split('五值之一').join('六值之一'); }
  if (!n) continue;
  const sn = snaps.get(f); if (!sn) throw new Error('无快照映射 ' + f);
  let last = -1; L.forEach((l, i) => { if (START.test(l)) last = i; });
  if (last < 0) throw new Error('找不到封后勘误记录位置 ' + f);
  const text = `封卷后勘误 1116s2（依据：李白 11-16 11:36 ⑤；不升版本号；改前快照 版本快照/${sn.pre}-1116s2.md，改后覆盖 ${sn.posts.map(p => '版本快照/' + p + '.md').join('、')}）：§7 迁移表前说明里处置（\`mig_disp\`）的"五值之一"改"六值之一"（处置值已是六值，见卷十一 §2.1（封闭枚举）），共 ${n} 处；不改规则正文`;
  const l0 = L[last];
  if (l0.startsWith('|')) {
    let e = last; while (e + 1 < L.length && L[e + 1].startsWith('|')) e++;
    const cs = l0.split(/(?<!\\)\|/); // 首尾为空串
    const cells = cs.slice(1, -1).map(c => {
      if (c.includes('封卷后勘误')) return ' ' + text + '。 ';
      if (/^\s*\d+\s*$/.test(c)) return ` ${+c.trim() + 1} `;
      return ' — ';
    });
    L.splice(e + 1, 0, '|' + cells.join('|') + '|');
    touched.push(`${f} 表格行（插在第 ${e + 2} 行，${cells.length} 栏）`);
  } else if (l0.startsWith('- ')) {
    L.splice(last + 1, 0, '- ' + text + '。');
    touched.push(`${f} 列表项（插在第 ${last + 2} 行）`);
  } else {
    L.splice(last + 1, 0, '', text + '。');
    touched.push(`${f} 段落（插在第 ${last + 3} 行）`);
  }
  total += n; nVol++;
  if (!DRY) writeFileSync(`${DIR}/${f}`, L.join('\n').replace(/\n/g, crlf ? '\r\n' : '\n'));
}
console.log(`${DRY ? '[dry] ' : ''}改了 ${nVol} 卷、${total} 处`);
for (const t of touched) console.log(t);
