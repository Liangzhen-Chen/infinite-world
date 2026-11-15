// 乙-6a 修订（chk-1115-y10）落地：用重跑后的 乙6a-系统登记六列.json 重写卷二 §2.7 的六列转录表与补全表末栏，记勘误行。
// 一次性落地脚本；机械改写，不改规则正文。用法：node apply-1115y10b.mjs（改前先做快照 1115y10b）
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
const eol = crlf ? '\r' : '';

// 1 补全表最后一栏
let nRows = 0;
for (let i = 0; i < L.length; i++) {
  const m = strip(L[i]).match(/^\| (sys\.[a-z0-9_]+) \|/);
  if (!m || !pendOf.has(m[1])) continue;
  const c = strip(L[i]).split(/(?<!\\)\|/);
  if (c.length !== 9) continue; // 只改补全表的 7 栏行
  c[c.length - 2] = ' ' + (pendOf.get(m[1]).length ? pendOf.get(m[1]).join('、') : '无') + ' ';
  L[i] = c.join('|') + eol; nRows++;
}
// 2 重写转录表段落与表
const a = L.findIndex(l => l.startsWith('**六列转录表**'));
if (a < 0) throw new Error('转录表段落找不到');
let b = a + 1; while (strip(L[b]) === '') b++; while (/^\|/.test(L[b])) b++;
const para = `**六列转录表**（封卷后勘误 1115y10、1115y10b，李白 11-15 16:05 第 2 条、18:05 第 2 条②、乙-6a、chk-1115-y10；脚本 脚本/卷十一/extract-systems-six.mjs，明细含每项出处与全部条目见 审查/脚本输出/乙6a-系统登记六列.json，手改无效）：这是转录，不是推断。各卷 §3.1、§3.2、§3.3 写成表格或条目的，照抄并标出处；卷文没有写成条目的格写"待补"，不猜。本表共 ${J.counts.total} 格：转录 ${J.counts.filled}、待补 ${J.counts.pending}（predicates 转录 ${J.counts.byCol.predicates.filled}、writers ${J.counts.byCol.writers.filled}、sources ${J.counts.byCol.sources.filled}、sinks ${J.counts.byCol.sinks.filled}、entryJudges ${J.counts.byCol.entryJudges.filled}、view ${J.counts.byCol.view.filled}）。每格写"项数（出处）：前三项"；"0 项"是卷文明写为无。口径：\`predicates\` 取 §3.2 标题含"谓词"的节里的条目，没有条目时取第一段第一句里的反引号标识符，卷文明写"无""不新增""不定义任何"的为空表；\`writers\` 只收本卷的写者——写者表里写者栏是本卷模块的行，条目取路径栏里的路径（首格是函数的表取"写什么"栏里的路径，没有路径的写文字），别系统写的行（表头写"本卷怎样请求"、写者栏写"卷X的…"或"本卷不写"）和去留登记表不收；\`sources\`、\`sinks\` 取卷六 §4.22.1 登记表首格里的全部源汇代号；\`entryJudges\` 取卷五、卷十九正文列出的 文件#函数；\`view\` 只有一张表的系统才取该表读入口（§2.1）在本卷 §3.1 读入口表里的"所在文件"栏，多表系统卷文没写系统的 view，待补。本节 JSON 示例登记的系统（\`sys.status\`、\`sys.capacity\`）与别的系统同一判法：示例里有的字段取示例，没有的按卷文转录或待补。`;
L.splice(a, b - a, para + eol, '' + eol, ...mdTable.split('\n').map(x => x + eol));
// 3 勘误行：接在 1115y10 勘误行之后
const k = L.findIndex(l => /^\| — \| — \| 封卷后勘误 1115y10（/.test(l));
if (k < 0) throw new Error('1115y10 勘误行找不到');
L.splice(k + 1, 0, '| — | — | 封卷后勘误 1115y10b（依据：chk-1115-y10 乙-6a 真问题 1–4；不升版本号；改前快照 版本快照/卷二-v17补26-勘误前-1115y10b.md，改后覆盖 版本快照/卷二-v17补26-现行.md）：§2.7 六列转录表重写——writers 只收本卷写者并取路径、漏转补齐（谓词、写者行、卷六源汇代号全转）、多表系统的 view 改回待补、JSON 示例登记的系统与别的系统同一判法；补全表末栏同改；按 脚本/卷十一/apply-1115y10b.mjs 机械改写。不改规则正文。 |' + eol);
writeFileSync(F, L.join('\n'));
console.log(`补全表改写 ${nRows} 行；转录表 ${J.systems.length} 行；转录 ${J.counts.filled} 格、待补 ${J.counts.pending} 格`);
