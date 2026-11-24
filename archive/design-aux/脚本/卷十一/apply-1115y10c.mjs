// 乙-6a/6b 第三轮（李白 11-15 18:50 第 1 条）落地：先存快照 1115y10c，再用重跑后的 乙6a-系统登记六列.json 重写卷二 §2.7 六列转录表与补全表末栏、记卷二勘误行；
// 卷十一待补清单第 2 项接读数、记勘误行，覆盖卷十一现行快照。一次性落地脚本；机械改写，不改规则正文。用法：node apply-1115y10c.mjs
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const CFG = JSON.parse(readFileSync(`${HERE}/gen-卷十一-inputs.json`, 'utf8'));
const OUT = `${HERE}/../../审查/脚本输出`.replace(/\\/g, '/');
const SNAP = `${CFG.dir}/版本快照`;
const F2 = `${CFG.dir}/${CFG.registry.file}`, F11 = `${CFG.dir}/卷十一-迁移路线与卡清单.md`;
const TAG = '1115y10c';
const S2 = `${SNAP}/卷二-v17补26-勘误前-${TAG}.md`, S11 = `${SNAP}/卷十一-封卷-勘误前-${TAG}.md`;
if (existsSync(S2) || existsSync(S11)) throw new Error('快照已存在，本脚本只跑一次');
copyFileSync(F2, S2); copyFileSync(F11, S11);

const J = JSON.parse(readFileSync(`${OUT}/乙6a-系统登记六列.json`, 'utf8'));
const LED = JSON.parse(readFileSync(`${OUT}/卡账-v0.json`, 'utf8'));
const sum = readFileSync(`${OUT}/卡账-v0-摘要.md`, 'utf8');
const forms = readFileSync(`${OUT}/乙6b-编号写法清单.md`, 'utf8');
const mdTable = readFileSync(`${OUT}/乙6a-系统登记六列.md`, 'utf8').trim();
const COLS = ['predicates', 'writers', 'sources', 'sinks', 'entryJudges', 'view'];
const c = J.counts, bc = c.byCol;
const nForms = +(forms.match(/、(\d+) 种写法/) ?? [])[1];
const nEmpty = LED.cards.filter(x => !x.accept.length).length;
const nCheck = +(sum.match(/标“待查”（(\d+) 张）/) ?? [])[1];

// ---- 卷二 ----
const L = readFileSync(F2, 'utf8').split('\n');
const eol = L.some(l => l.endsWith('\r')) ? '\r' : '';
const strip = l => l.replace(/\r$/, '');
const pendOf = new Map(J.systems.map(s => [s.system, COLS.filter(k => s.cols[k].value === '待补')]));
let nRows = 0;
for (let i = 0; i < L.length; i++) {
  const m = strip(L[i]).match(/^\| (sys\.[a-z0-9_]+) \|/);
  if (!m || !pendOf.has(m[1])) continue;
  const cs = strip(L[i]).split(/(?<!\\)\|/);
  if (cs.length !== 9) continue; // 只改补全表的 7 栏行
  cs[cs.length - 2] = ' ' + (pendOf.get(m[1]).length ? pendOf.get(m[1]).join('、') : '无') + ' ';
  L[i] = cs.join('|') + eol; nRows++;
}
const a = L.findIndex(l => l.startsWith('**六列转录表**'));
if (a < 0) throw new Error('转录表段落找不到');
let b = a + 1; while (strip(L[b]) === '') b++; while (/^\|/.test(L[b])) b++;
const para = `**六列转录表**（封卷后勘误 1115y10、1115y10b、${TAG}，李白 11-15 16:05 第 2 条、18:05 第 2 条②、18:50 第 1 条，乙-6a、chk-1115-y10、chk-1115-y11；脚本 脚本/卷十一/extract-systems-six.mjs，明细含每项出处与全部条目见 审查/脚本输出/乙6a-系统登记六列.json，新旧逐格差异见 审查/脚本输出/乙6-1115y10c-差异清单.md，手改无效）：这是转录，不是推断。各卷 §3.1、§3.2、§3.3 写成表格或条目的，照抄并标出处；卷文没有写成条目的格写"待补"，不猜。本表共 ${c.total} 格：转录 ${c.filled}、待补 ${c.pending}（转录数 predicates ${bc.predicates.filled}、writers ${bc.writers.filled}、sources ${bc.sources.filled}、sinks ${bc.sinks.filled}、entryJudges ${bc.entryJudges.filled}、view ${bc.view.filled}）。每格写"项数（出处）：前三项"；"0 项"是卷文明写为无。口径：\`predicates\` 取 §3.2 标题含"谓词"的节里的条目，没有条目时取第一段第一句里的反引号标识符；§3.2 没有时取 §3.1 以"谓词："开头的一行列出的函数，或标题含"谓词"的 §3.1 表里写明是谓词的行；卷文明写"无""不新增""不定义任何"的为空表。\`writers\` 只收本系统写的路径，用路径不用函数名：取 §3.2、§3.3 标题含"写"的节里的写者表（表头有"本卷怎样请求"的除外）与表前的列表、段落；写者栏取第一个本卷模块——模块前写了别卷卷名、前面是"经"、所在分句明写只提交或不写、紧后括注写"卷X声明/登记的"、或全书别处写成别卷模块的都不算，第一分句是"本卷的…写者"的记本卷写者；路径只取路径栏第一句里括注外的反引号路径（括注外没有才取括注里的），调用与明写不写的分句不取，函数、模块文件、小写下划线代号、类型字面量不取，路径紧后写了本卷模块的归那个模块；路径栏只有文字的行不转；节里写明"没有任何写者""不拥有任何状态键"的为 0 项。\`sources\`、\`sinks\` 取卷六 §4.22.1 登记表首格里的全部源汇代号；\`entryJudges\` 取卷五、卷十九正文列出的 文件#函数；\`view\` 只有一张表的系统才取该表读入口（§2.1）在本卷 §3.1 读入口表里的"所在文件"栏，多表系统卷文没写系统的 view，待补。本节 JSON 示例登记的系统（\`sys.status\`、\`sys.capacity\`）与别的系统同一判法：示例里有的字段取示例，没有的按卷文转录或待补。`;
L.splice(a, b - a, para + eol, '' + eol, ...mdTable.split('\n').map(x => x + eol));
const k = L.findIndex(l => /^\| — \| — \| 封卷后勘误 1115y10b（/.test(l));
if (k < 0) throw new Error('1115y10b 勘误行找不到');
L.splice(k + 1, 0, `| — | — | 封卷后勘误 ${TAG}（依据：李白 18:50 第 1 条（11-15）、chk-1115-y11 乙-6a 真问题 1–2；不升版本号；改前快照 版本快照/卷二-v17补26-勘误前-${TAG}.md，改后覆盖 版本快照/卷二-v17补26-现行.md）：§2.7 六列转录表重写——writers 全部格对照原卷按整类取法重转（只收本系统写的路径；写者以分句判，别卷模块、"经"之后的通道、只提交或明写不写的不算；括注里的路径在括注外没有路径时取；节首列表与段落、"没有任何写者"一并认），卷二十七、卷十六、卷二十九、卷二十六补齐，卷十一、卷十二写者表只有文字没有路径改回待补；predicates 补认 §3.1"谓词："行与表里写明是谓词的行；新旧逐格差异见 审查/脚本输出/乙6-1115y10c-差异清单.md；补全表末栏同改；按 脚本/卷十一/apply-${TAG}.mjs 机械改写。不改规则正文。 |` + eol);
writeFileSync(F2, L.join('\n'));
copyFileSync(F2, `${SNAP}/卷二-v17补26-现行.md`);

// ---- 卷十一 ----
const M = readFileSync(F11, 'utf8').split('\n');
const e11 = M.some(l => l.endsWith('\r')) ? '\r' : '';
const r2 = M.findIndex(l => l.startsWith('| 2 | 每个对象的消费者组与后续卡数'));
if (r2 < 0) throw new Error('待补清单第 2 项找不到');
const add = `；${TAG} 起：系统登记项六列按整类取法重转（180 格转录 ${c.filled}、待补 ${c.pending}，writers 转录 ${bc.writers.filled} 格，见卷二勘误 ${TAG}）；验收编号按通用识别规则取（脚本/卷十一/id-defs.mjs，全书 ${nForms} 种编号写法见 审查/脚本输出/乙6b-编号写法清单.md；只取断言、扫描、不变量一类，影响面表与修订记录里的意见号、规则号不取），accept 仍为空的疑点 ${nEmpty} 张，其中原因写不出原文出处、标"待查"的 ${nCheck} 张 |`;
M[r2] = M[r2].replace(/ \|\r?$/, add + e11);
const k11 = M.findIndex(l => l.startsWith('- 封卷后勘误 1115y11b'));
if (k11 < 0) throw new Error('1115y11b 勘误行找不到');
M.splice(k11 + 1, 0, `- 封卷后勘误 ${TAG}（依据：李白 18:50 第 1 条（11-15）、chk-1115-y11 乙-6a、乙-6b 真问题；不升版本号，不改卷首；改前快照 版本快照/卷十一-封卷-勘误前-${TAG}.md，改后覆盖 版本快照/卷十一-封卷.md、版本快照/卷十一-v2.md）：待补清单第 2 项读数更新——系统登记六列重转（卷二勘误 ${TAG}）；卡账 v0 重跑，accept 的编号按 脚本/卷十一/id-defs.mjs 的通用识别规则取：编号写法含"X式：A17-1.3""**扫描式** VA-4.1-S"一类前缀、".S"与"-S"后缀、卷二十 T-n 与卷二 A1 一类短写法，性质按所在标题与表首列判，只取验收类（§2.2 \`accept\` 的取值范围），影响面表、修订记录、记账栏里的意见号（卷五 A-5）与规则号不取；疑点名单原因有原文出处的引文件:行，其余标"待查"。未改任何规则正文。` + e11);
writeFileSync(F11, M.join('\n'));
copyFileSync(F11, `${SNAP}/卷十一-封卷.md`); copyFileSync(F11, `${SNAP}/卷十一-v2.md`);
console.log(`卷二：补全表 ${nRows} 行、转录表 ${J.systems.length} 行；卷十一：第 2 项与勘误行；写法 ${nForms} 种，accept 空 ${nEmpty}、待查 ${nCheck}`);
