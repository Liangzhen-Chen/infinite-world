// 乙-6a 落地：把 乙6a-系统登记六列.json 写进卷二 §2.7（转录表）、改补全表的"待补字段"栏与说明句、记勘误行。
// 一次性落地脚本；机械改写，不改规则正文。用法：node apply-1115y10a.mjs（改前先做快照 1115y10）
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const CFG = JSON.parse(readFileSync(`${HERE}/gen-卷十一-inputs.json`, 'utf8'));
const OUT = `${HERE}/../../审查/脚本输出`.replace(/\\/g, '/');
const F = `${CFG.dir}/${CFG.registry.file}`;
const J = JSON.parse(readFileSync(`${OUT}/乙6a-系统登记六列.json`, 'utf8'));
const mdTable = readFileSync(`${OUT}/乙6a-系统登记六列.md`, 'utf8').trim();
const COLS = ['predicates', 'writers', 'sources', 'sinks', 'entryJudges', 'view'];
const pendOf = new Map(J.systems.map(s => [s.system, COLS.filter(c => s.cols[c].value === '待补')]));
const L = readFileSync(F, 'utf8').split('\n');
const crlf = L.some(l => l.endsWith('\r'));
const strip = l => l.replace(/\r$/, '');

// 1 补全表的最后一栏：只留仍待补的列
let nRows = 0, end = -1;
for (let i = 0; i < L.length; i++) {
  const l = strip(L[i]);
  const m = l.match(/^\| (sys\.[a-z0-9_]+) \|/);
  if (!m || !pendOf.has(m[1])) continue;
  const c = l.split(/(?<!\\)\|/);
  const last = c.length - 2;
  c[last] = ' ' + (pendOf.get(m[1]).length ? pendOf.get(m[1]).join('、') : '无') + ' ';
  L[i] = c.join('|') + (crlf ? '\r' : '');
  nRows++; end = i;
}
// 2 说明句
const iDesc = L.findIndex(l => l.includes('六个字段各卷只在 §3.2、§3.3 写成文字，没有机读来源，一律待补，不由 import 图推出。'));
if (iDesc < 0) throw new Error('说明句找不到（已改过？）');
L[iDesc] = L[iDesc].replace('`predicates`、`writers`、`sources`、`sinks`、`entryJudges`、`phase` 六个字段各卷只在 §3.2、§3.3 写成文字，没有机读来源，一律待补，不由 import 图推出。',
  '`predicates`、`writers`、`sources`、`sinks`、`entryJudges` 与 `view` 六列已由 脚本/卷十一/extract-systems-six.mjs 从各卷 §3.1、§3.2、§3.3 等卷文转录（封卷后勘误 1115y10，乙-6a），转录结果见本表后的"六列转录表"，本表最后一栏只留仍待补的列；`phase` 不手填，按卷十一 R11-3.14 派生。');
// 3 转录表：紧接补全表之后
const intro = [
  '',
  `**六列转录表**（封卷后勘误 1115y10，李白 11-15 16:05 第 2 条、18:05 第 2 条②、乙-6a；脚本 脚本/卷十一/extract-systems-six.mjs，明细含每项出处与全部条目见 审查/脚本输出/乙6a-系统登记六列.json，手改无效）：这是转录，不是推断。各卷 §3.1、§3.2、§3.3 写成表格或条目的，照抄并标出处；卷文没有写成条目的格写"待补"，不猜。本表共 ${J.counts.total} 格：转录 ${J.counts.filled}、待补 ${J.counts.pending}（predicates 转录 ${J.counts.byCol.predicates.filled}、writers ${J.counts.byCol.writers.filled}、sources ${J.counts.byCol.sources.filled}、sinks ${J.counts.byCol.sinks.filled}、entryJudges ${J.counts.byCol.entryJudges.filled}、view ${J.counts.byCol.view.filled}）。每格写"项数（出处）：前三项"；"0 项"是卷文明写为无。\`writers\` 一栏的条目是卷文写者表的首格（状态路径或写入口函数）→ 写者模块。\`sys.status\`、\`sys.capacity\` 两行取自本节 JSON 示例。\`view\` 取该系统第一张表的读入口（§2.1）在本卷 §3.1 读入口表里的"所在文件"栏。\`sources\`、\`sinks\` 只有卷六在 §4.22.1 登记了源汇代号。\`entryJudges\` 只有卷五、卷十九在正文写出。`,
  '',
  mdTable,
];
L.splice(end + 1, 0, ...intro.map(x => x + (crlf ? '\r' : '')));
// 4 勘误行：接在最后一条 1115y 勘误行之后
let last = -1; L.forEach((l, i) => { if (/^\| — \| — \| 封卷后勘误 1115y/.test(l)) last = i; });
if (last < 0) throw new Error('勘误行位置找不到');
L.splice(last + 1, 0, '| — | — | 封卷后勘误 1115y10（依据：李白 11-15 18:05 第 2 条②、乙-6a；必要理由：卷十一 R11-3.14 与 §2.2 需要系统登记项的六列读卷文转录值，不再一律待补；不升版本号；改前快照 版本快照/卷二-v17补26-勘误前-1115y10.md，改后覆盖 版本快照/卷二-v17补26-现行.md）：§2.7 systems 补全表加"六列转录表"，补全表最后一栏只留仍待补的列；按 脚本/卷十一/apply-1115y10a.mjs 机械改写。不改规则正文。 |' + (crlf ? '\r' : ''));
writeFileSync(F, L.join('\n'));
console.log(`补全表改写 ${nRows} 行；转录表 ${J.systems.length} 行；转录 ${J.counts.filled} 格、待补 ${J.counts.pending} 格`);
