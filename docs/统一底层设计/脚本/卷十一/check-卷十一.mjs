// 卷十一 自检脚本（只读成稿，逐项输出 PASS/FAIL）
// 用法：node F:/dnd/docs/统一底层设计/脚本/卷十一/check-卷十一.mjs [成稿路径]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
// 生成器以仓库版为准：与本脚本同目录
const GEN = fileURLToPath(new URL('./gen-卷十一-卡族.mjs', import.meta.url)).replace(/\\/g, '/');
// 路径取自本脚本所在位置，不写死盘符（李白终核卷十一 三-4）
const DOCDIR = fileURLToPath(new URL('../..', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const SCRDIR = fileURLToPath(new URL('.', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const path = process.argv[2] ?? `${DOCDIR}/卷十一-迁移路线与卡清单.md`;
const all0 = readFileSync(path, 'utf8').split('\n').map(l => l.replace(/\r$/, ''));
const cutAt = all0.findIndex(l => l.startsWith('## 附录 自检脚本输出'));
const lines = cutAt >= 0 ? all0.slice(0, cutAt) : all0;
let fails = 0;
const report = (name, ok, detail = '') => { if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : '')); };
const N = 9;

const meta = []; let h2 = '', h3 = '', h4 = '', fence = null;
for (const line of lines) {
  let inFence = fence;
  if (/^```/.test(line)) { if (fence === null) { fence = line.slice(3).trim() || 'plain'; inFence = fence; } else { inFence = fence; fence = null; } }
  else if (fence === null) {
    if (/^## /.test(line)) { h2 = line; h3 = ''; h4 = ''; }
    else if (/^### /.test(line)) { h3 = line; h4 = ''; }
    else if (/^#### /.test(line)) { h4 = line; }
  }
  meta.push({ line, h2, h3, h4, fence: inFence });
}
const all = lines.join('\n');
const sec = re => meta.filter(m => re.test(m.h2)).map(m => m.line).join('\n');
const sub = re => meta.filter(m => re.test(m.h3)).map(m => m.line).join('\n');

// 1 章节
const need2 = ['## §0 ', '## §1 ', '## §2 ', '## §3 ', '## §4 ', '## §5 ', '## §6 ', '## §7 ', '## §8 ', '## 附 术语与代号表', '## 附录 待补清单', '## 附录甲 ', '## 附录 修订记录'];
const miss2 = need2.filter(p => !lines.some(l => l.startsWith(p)));
report('1 章节 §0–§8、术语表、待补清单、卡族表、修订记录齐全', miss2.length === 0, miss2.join(','));
report('1b 卷首模型行', lines.slice(0, 5).includes('起草 claude-fable-5-2 中档／改稿 claude-opus-5-5 中档（第二版起）／审查 claude-opus-5-5 中档'));
const need0 = ['### 0.1 范围', '### 0.2 依赖卷', '### 0.3 覆盖的卷零行', '### 0.4 参照的五款游戏行', '### 0.5 读法'];
report('1c §0 五小节齐全', need0.every(p => lines.includes(p)), need0.filter(p => !lines.includes(p)).join(','));

// 2 子系统各六小节
const six = ['维度', '统一入口', '规则', '交互', '数据实例', '验收断言'];
const miss4 = [];
for (let n = 1; n <= N; n++) {
  if (!lines.some(l => l.startsWith(`### 4.${n} `))) miss4.push(`4.${n}`);
  six.forEach((t, i) => { if (!lines.includes(`#### 4.${n}.${i + 1} ${t}`)) miss4.push(`4.${n}.${i + 1}`); });
}
const extra4 = lines.filter(l => /^### 4\.\d+ /.test(l)).length;
report('2 九个子系统各六小节齐全', miss4.length === 0 && extra4 === N, miss4.join(',') + (extra4 !== N ? ` 子系统标题数=${extra4}` : ''));

// 3 数据实例
const inst = [];
for (let n = 1; n <= N; n++) {
  const tagged = meta.filter(m => m.h4 === `#### 4.${n}.5 数据实例` && m.fence === null).map(m => m.line).filter(l => /^- 【/.test(l));
  const ok = tagged.length >= 3 && tagged.some(l => l.startsWith('- 【非西陲】')) && tagged.some(l => /^- 【(非人类|超自然)】/.test(l));
  if (!ok) inst.push(`4.${n}(${tagged.length})`);
}
report('3 数据实例至少三条，含非西陲、含非人类或超自然', inst.length === 0, inst.join(','));

// 4 验收断言三式且带编号
const asr = [];
for (let n = 1; n <= N; n++) {
  const s = meta.filter(m => m.h4 === `#### 4.${n}.6 验收断言`).map(m => m.line);
  ['扫描式', '不变量式', '扩展性式'].forEach((k, i) => {
    const l = s.find(x => x.startsWith(`- ${k}：`));
    if (!l) asr.push(`4.${n}:${k}`); else if (!l.startsWith(`- ${k}：A11-${n}.${i + 1} `)) asr.push(`4.${n}:${k}编号`);
  });
}
report('4 验收断言三式齐全且编号规整', asr.length === 0, asr.join(','));

// 5 正文无具体 id 字面量（允许区：代码块、附与附录；本卷连数据实例也不许）
const idRe = /\b(?:npc|creature|item|mat|species|flora|body|loc|bld|fac|recipe|org|office|polity|law|deity|faith|culture|profession|skill|lore|offense|status|etype|eff|mod|note|comp|class|terrain|biome|site|monster)_[a-z0-9][a-z0-9_]*/g;
const allowWords = new Set(['body_plan', 'law_code', 'status_family', 'facility_type', 'event_type']);
const idHits = [];
meta.forEach((m, i) => {
  if (m.fence !== null) return;
  if (/^## 附/.test(m.h2)) return;
  for (const hit of m.line.match(idRe) ?? []) if (!allowWords.has(hit)) idHits.push(`L${i + 1}:${hit}`);
});
report('5 正文无具体 id 字面量（含数据实例）', idHits.length === 0, idHits.slice(0, 10).join(' '));

// 6 无用于判断的描述性文本：规则与入口里不出现字符串匹配写法、中文正则、中文参与比较
const textRe = /\.test\(|\.match\(|\.includes\(|startsWith\(|indexOf\(|\/[^\/\s`]*[\u4e00-\u9fff][^\/\s`]*\//;
const textHits = [];
meta.forEach((m, i) => {
  const inRule = /(规则|统一入口)$/.test(m.h4) || /^## §[235] /.test(m.h2);
  if (inRule && textRe.test(m.line)) textHits.push(`L${i + 1}`);
  if (inRule && m.fence === null && /`[^`]*[\u4e00-\u9fff][^`]*`\s*(===|==|!==)/.test(m.line)) textHits.push(`L${i + 1}(cmp)`);
});
// 枚举值与字段名一律 ASCII；枚举每个值带中英显示名
const s21 = sub(/^### 2\.1 /);
const enumRows = s21.split('\n').filter(l => /^\| (`[a-z_0-9]+`)? ?\| `/.test(l));
const badEnum = enumRows.filter(l => { const c = l.split('|').map(x => x.trim()); return !/^`[a-z][a-z_0-9]*`$/.test(c[2]) || !c[3] || !/[\u4e00-\u9fff]/.test(c[3]) || !/^[A-Za-z][A-Za-z -]*$/.test(c[4] ?? ''); });
for (const t of [sub(/^### 2\.2 /), sub(/^### 2\.3 /), sub(/^### 2\.4 /)]) for (const l of t.split('\n')) { const c = l.split('|').map(x => x.trim()); if (c.length > 3 && /^`/.test(c[1]) && !c[1].split('、').every(x => /^`[a-zA-Z0-9]+`$/.test(x))) textHits.push('字段名非 ASCII:' + c[1]); }
report(`6 无用于判断的描述性文本；枚举值与字段名为 ASCII 且带中英显示名（枚举值 ${enumRows.length} 个）`, textHits.length === 0 && badEnum.length === 0 && enumRows.length >= 30, [...textHits.slice(0, 8), ...badEnum.slice(0, 4)].join(' '));

// 7 台账判给本卷的概念写全
const heads = lines.filter(l => l.startsWith('### 4.')).join('|');
const kw = ['退役口径', '迁移清单汇总', '卡清单', '并行规则', '阶段退出标准', '测试重推口径', '阶段划分', '回滚', '冻结', '卷零回填'];
const missKw = kw.filter(k => !heads.includes(k));
const body4 = sec(/^## §4 /);
const whole = sec(/^## §[2-4] /);
const codes = ['migRows(', 'migCard(', 'migCards(', 'migReceiver(', 'migReady(', 'migParallelOk(', 'migPhaseCount(', 'migExit(', 'migBackfill(', 'migFrozen(', 'migEvents(', 'card_kind', 'card_object', 'card_state', 'card_seg', 'mig_disp', 'tfail_kind', 'freeze_cause', 'mig_event', 'col3', 'rules.migration.maxParallel', 'rules.migration.maxFiles', 'rules.migration.maxLedgerChildren', 'rules.migration.maxFails', 'rules.migration.reviewRounds', 'rules.migration.exitFailsToFreeze', 'rules.migration.freezeRules', 'tools/migrate/migrows.json', 'tools/migrate/cards.json', 'tools/migrate/freeze.json', 'tools/migrate/events.json', 'LEDGER-1', 'G-1', 'G-3'];
// 第二版删去的：阶段数不再是规则表键，文件搬迁表不在本卷另立
const gone = ['rules.migration.phaseCount', 'tools/migrate/filemoves.json'].filter(c => whole.includes(c));
const missCode = codes.filter(c => !whole.includes(c));
const gaps = [];
for (let n = 1; n <= N; n++) {
  const defs = meta.filter(m => m.h4 === `#### 4.${n}.3 规则`).map(m => (m.line.match(/^- \*\*R11-(\d+)\.(\d+) /) ?? [])).filter(x => x.length).map(x => [+x[1], +x[2]]);
  if (!defs.length) gaps.push(`4.${n} 无规则条`);
  defs.forEach(([a, b], i) => { if (a !== n || b !== i + 1) gaps.push(`R11-${a}.${b}@4.${n}`); });
}
report('7 台账各概念写全（标题、关键代号、每节有规则且编号连续；第二版删去的键与文件不再出现）', missKw.length === 0 && missCode.length === 0 && gaps.length === 0 && gone.length === 0, [...missKw, ...missCode, ...gaps, ...gone.map(g => '仍出现 ' + g)].join(','));

// 8 跨卷引用带标题；编号引用不悬空
const refRe = /卷[零一二三四五六七八九十]+[b甲乙]? §[^\s（）、，。；：|]*/g;
const badRef = [];
meta.forEach((m, i) => {
  if (m.fence !== null) return;
  if (/^## (§7|§8|附)/.test(m.h2)) return;
  if (/^### 5\.3 /.test(m.h3)) return;
  let r; refRe.lastIndex = 0;
  while ((r = refRe.exec(m.line)) !== null) { if (m.line[r.index + r[0].length] !== '（') badRef.push(`L${i + 1}:${r[0]}`); }
});
const defined = new Set(meta.map(m => (m.line.match(/^- \*\*(R11-\d+\.\d+) /) ?? [])[1]).filter(Boolean));
const dangling = [...new Set(all.match(/R11-\d+\.\d+/g) ?? [])].filter(r => !defined.has(r));
const definedA = new Set(all.match(/(?<=：)A11-\d+\.\d+/g) ?? []);
const danglingA = [...new Set(all.match(/A11-\d+\.\d+/g) ?? [])].filter(r => !definedA.has(r));
const definedS = new Set(all.match(/(?<=\*\*)S11-\d+(?=\*\*)/g) ?? []);
const danglingS = [...new Set(all.match(/S11-\d+/g) ?? [])].filter(r => !definedS.has(r));
const definedC = new Set(meta.filter(m => /^### 5\.3 /.test(m.h3)).map(m => (m.line.match(/^\| (C11-\d+) \|/) ?? [])[1]).filter(Boolean));
const danglingC = [...new Set(all.match(/C11-\d+/g) ?? [])].filter(r => !definedC.has(r));
const definedQ = new Set(meta.filter(m => /^## §8 /.test(m.h2)).map(m => (m.line.match(/^- \*\*(Q11-\d+)/) ?? [])[1]).filter(Boolean));
const danglingQ = [...new Set(all.match(/Q11-\d+/g) ?? [])].filter(r => !definedQ.has(r));
const definedM = new Set(meta.filter(m => /^## §7 /.test(m.h2)).map(m => (m.line.match(/^\| (M11-\d+) \|/) ?? [])[1]).filter(Boolean));
const danglingM = [...new Set(all.match(/M11-\d+/g) ?? [])].filter(r => !definedM.has(r));
const seqOk = (set, cut) => [...set].map(x => +x.slice(cut)).every((v, i) => v === i + 1);
const seqBad = [['S11', definedS, 4], ['C11', definedC, 4], ['Q11', definedQ, 4], ['M11', definedM, 4]].filter(([, s, c]) => !seqOk(s, c)).map(([n]) => n + ' 编号不连续');
report('8 跨卷引用带标题；R/A/S/C/Q/M 编号引用不悬空且连续', badRef.length === 0 && dangling.length === 0 && danglingA.length === 0 && danglingS.length === 0 && danglingC.length === 0 && danglingQ.length === 0 && danglingM.length === 0 && seqBad.length === 0, [...badRef.slice(0, 8), ...dangling, ...danglingA, ...danglingS, ...danglingC, ...danglingQ, ...danglingM, ...seqBad].join(' '));

// 9 登记落实：错误码、入口、规则表键、枚举值
const r9 = [];
const s27 = sub(/^### 2\.7 /);
const usedErr = new Set(all.match(/E-MIG-[A-Z]+(?:-[A-Z]+)*/g) ?? []);
for (const e of usedErr) if (!s27.includes('| ' + e + ' |')) r9.push('§2.7 缺 ' + e);
const regErr = (s27.match(/^\| (E-MIG-[A-Z-]+) \|/gm) ?? []).map(x => x.slice(2, -2));
for (const e of regErr) if ((all.split(e).length - 1) < 2) r9.push('错误码只登记未使用 ' + e);
const s31 = sub(/^### 3\.1 /);
const usedFn = new Set((all.match(/`(mig[A-Z][A-Za-z]+)(?:\(|`)/g) ?? []).map(x => x.replace(/[`(]/g, '')));
for (const f of usedFn) if (!s31.includes('| `' + f + '(')) r9.push('§3.1 缺入口 ' + f);
const s25 = sub(/^### 2\.5 /);
const usedKeys = new Set(all.match(/rules\.migration\.[A-Za-z]+/g) ?? []);
for (const k of usedKeys) if (!s25.includes('| `' + k + '` |')) r9.push('§2.5 缺键 ' + k);
const enumVals = new Set(enumRows.map(l => l.split('|')[2].trim().replace(/`/g, '')));
const tickWords = new Set((sec(/^## §[3-8] /).match(/`([a-z][a-z_]+)`/g) ?? []).map(x => x.slice(1, -1)));
const fieldNames = new Set([sub(/^### 2\.2 /), sub(/^### 2\.3 /), sub(/^### 2\.4 /)].join('\n').split('\n').flatMap(l => { const c = l.split('|').map(x => x.trim()); return /^`/.test(c[1] ?? '') ? c[1].split('、').map(x => x.replace(/`/g, '')) : []; }));
const enumNames = new Set(['card_kind', 'card_object', 'card_state', 'card_seg', 'mig_disp', 'tfail_kind', 'freeze_cause', 'mig_event', 'col3']);
const tableCodes = new Set(['item', 'material', 'species', 'body_plan', 'person', 'place', 'facility_type', 'org', 'office', 'polity', 'deity', 'faith', 'culture', 'profession', 'skill', 'offense', 'status', 'recipe', 'plant', 'law_code', 'knowledge', 'event_type', 'card', 'migrow', 'migevent']);
// 别卷登记、本卷只引用的代号（卷二声明表字段、卷零机读列、各卷钩子先后列）
// 处理代号（zeroKind 取值）不在此写死，从卷零定义处解析：卷零-覆盖表.md 第 31 行“处理代号（A 表机读列 `zeroKind`…”
const ZERO = (process.argv[3] ?? `${DOCDIR}/卷零-覆盖表.md`);
const zeroDefLine = readFileSync(ZERO, 'utf8').split('\n').find(l => l.startsWith('处理代号（A 表机读列 `zeroKind`')) ?? '';
const zeroKinds = (zeroDefLine.match(/= `([a-z_]+)`/g) ?? []).map(x => x.slice(3, -1));
if (zeroKinds.length === 0) r9.push('卷零处理代号定义处未找到（' + ZERO + '）');
const extCodes = new Set(['systems', 'tables', 'writers', 'entryCallerFiles', 'view', 'predicates', 'phase', 'sortKey', 'retired', 'owner', 'vol', 'splitFrom', 'zeroKind', 'spotKey', 'after', ...zeroKinds]);
for (const w of tickWords) if (!enumVals.has(w) && !fieldNames.has(w) && !enumNames.has(w) && !tableCodes.has(w) && !extCodes.has(w)) r9.push('未登记的代号 ' + w);
for (const f of ['tools/migrate/collect.mjs', 'tools/migrate/card-ledger.mjs']) if (!sub(/^### 3\.2 /).includes(f)) r9.push('§3.2 缺写者 ' + f);
report('9 错误码、入口、规则表键、枚举值、写者登记落实', r9.length === 0, r9.slice(0, 12).join(' | '));

// 10 红线
const r10 = [];
meta.forEach((m, i) => {
  if (m.fence !== null || /^## (附|§7|§8)/.test(m.h2)) return;
  if (/Date\.now|new Date|performance\.now|Math\.random|process\.env/.test(m.line)) r10.push(`L${i + 1}:墙钟或非登记随机`);
  if (/(规则|维度)$/.test(m.h4) && /÷/.test(m.line) && !/正整数|不做除法|恒为正/.test(m.line)) r10.push(`L${i + 1}:除数未说明`);
});
for (const [name, needle] of [['不派实现', '不派任何实现卡'], ['不改冻结', '本卷写成、审过，都不改变冻结状态'], ['不重写卷一条款', '本卷不重写'], ['只许收紧', '任何放宽都要李白批']]) if (!all.includes(needle)) r10.push('缺：' + name);
const ruleLines = meta.filter(m => /规则$/.test(m.h4)).map(m => m.line).join('\n');
if (/读各卷正文/.test(ruleLines.replace(/不读各卷正文|不读正文/g, ''))) r10.push('程序读正文');
report('10 红线：不读墙钟、除数有下界、不派实现、不解冻、不重写卷一条款、只许收紧', r10.length === 0, r10.slice(0, 10).join(' | '));

// 11 算术复算与附录甲读数对账
const U = (b, k, n) => Math.floor(b * (n - k) * (n - k) / (n * n));
const calc = [
  ['U(1) 子基线 120', U(120, 1, 5), 76, '120 × 16 ÷ 25 取整得 76'], ['子基线 198 − 120', 198 - 120, 78, '另外 78 行'], ['U(n) 全量 198', U(198, 5, 5), 0, '子基线是全部 198 行，上限为 0'],
  ['U(2) 子基线 3', U(3, 2, 5), 1, '3 × 9 ÷ 25 取整得 1'], ['U(1) 子基线 0', U(0, 1, 5), 0, '阶段 1 的子基线为 0']
];
// 第二版：正文（§0–§8）不再抄卷零 §3.5.5 的处数（一审真问题 7）
const bodyText = meta.filter(m => !/^## 附/.test(m.h2)).map(m => m.line).join('\n');
const staleNum = ['146 处', '23/102/21', '共 5 张'].filter(s => bodyText.includes(s));
const badCalc = calc.filter(([, got, want]) => got !== want).map(([n]) => n);
const missNum = calc.filter(([, , , needle]) => !all.includes(needle)).map(([n, , , s]) => n + '缺原句:' + s);
// U 的性质：随 k 不增、U(n)=0、不超过 B0
const r11 = [];
for (const b of [0, 1, 3, 26, 74, 198, 219, 852, 9554]) for (const n of [1, 2, 5, 6, 9]) { let prev = b; for (let k = 1; k <= n; k++) { const u = U(b, k, n); if (u > prev || u < 0) r11.push(`U 不单调 b=${b} n=${n} k=${k}`); prev = u; } if (U(b, n, n) !== 0) r11.push(`U(n)≠0 b=${b}`); }
// 附录甲表内算术（与生成器逐行比对在第 14 项）
const ga = meta.filter(m => /^## 附录甲 /.test(m.h2)).map(m => m.line);
const gRows = ga.filter(l => /^\| 卷[^|]+\| /.test(l) && !/^\| 卷 \|/.test(l)).map(l => l.split('|').map(x => x.trim()));
const inLine = ga.find(l => l.startsWith('输入行数：')) ?? '';
const migSum = gRows.reduce((a, c) => a + (+c[4] || 0), 0);
if (!inLine.includes(`各卷编号迁移行 ${migSum} 行`)) r11.push(`附录甲编号迁移行合计与表不符（表 ${migSum}）`);
if (gRows.length < 10) r11.push('附录甲表未贴入');
if (all.includes('@@GEN@@')) r11.push('生成器输出占位未替换');
if (gRows.some(c => c.length !== 9)) r11.push('附录甲列数不是 7');
report(`11 算术复算（${calc.length} 项加 U 的性质 45 组）、正文不抄过期处数、附录甲表内算术（${gRows.length} 行）`, badCalc.length === 0 && missNum.length === 0 && r11.length === 0 && staleNum.length === 0, [...badCalc, ...missNum, ...r11, ...staleNum.map(s => '正文仍有 ' + s)].join(','));

// 12 接口、配合项、迁移清单、待补清单落实
const r12 = [];
const s5 = sec(/^## §5 /);
for (const v of ['卷零', '卷一', '卷二', '卷十二', '卷二十七', '各领域卷']) if (!new RegExp(`^\\| [^|]*\\| ${v} \\|`, 'm').test(sub(/^### 5\.2 /))) r12.push('§5.2 缺 ' + v);
for (const v of ['卷零', '卷一', '卷二', '卷十二', '全部已写领域卷', '全书概念台账', '未写的十卷', '计划文档']) if (!new RegExp(`^\\| C11-\\d+ \\| ${v} \\|`, 'm').test(s5)) r12.push('§5.3 缺 ' + v);
for (const n of ['C11-8', 'C11-9']) if (!new RegExp(`^\\| ${n} \\| —（第二版`, 'm').test(s5)) r12.push(`§5.3 ${n} 未标第二版处置`);
if (definedC.size < 8) r12.push('配合项过少');
const s7 = sec(/^## §7 /);
for (const f of ['migrations.mjs', 'migrations/r1.mjs', 'rule-state-migration.mjs', 'world-upgrade.mjs', 'compat/v2-phase1-*.mjs', 'legacy/core.js', 'legacy/seed.json', 'legacy-primitives.mjs', 'holding-sources.mjs', 'money.mjs', 'stock.mjs', 'tools/k8-guard.mjs', 'tools/test-impact', 'tools/derived-scan.mjs', 'balance-metrics.mjs', 'content-pipeline.mjs', 'content-budget.mjs', '9554', '337']) if (!s7.includes(f)) r12.push('§7 缺 ' + f);
const s03 = sub(/^### 0\.3 /);
for (const r of ['21.1', '21.2', '41 项', 'A 0、B 0']) if (!s03.includes(r)) r12.push('§0.3 缺 ' + r);
const s04 = sub(/^### 0\.4 /);
for (const g of ['DF', 'CDDA', 'RW', 'EVE', 'CK3']) if (!new RegExp(`^\\| ${g} \\|`, 'm').test(s04)) r12.push('§0.4 缺 ' + g);
const todo = meta.filter(m => /^## 附录 待补清单/.test(m.h2) && /^\| \d+ \|/.test(m.line)).length;
if (todo < 5) r12.push('待补清单过少');
// 第二版：阶段由数据派生，§4.7.3 不再有"阶段 k = 波 k"的对照表
const stageTab = meta.filter(m => /^#### 4\.7\.3 /.test(m.h4) && /^\| 阶段 \d /.test(m.line)).length;
if (stageTab !== 0) r12.push(`§4.7.3 仍有阶段对波的表 ${stageTab} 行`);
const todoDone = meta.filter(m => /^## 附录 待补清单/.test(m.h2) && /^\| (8|9|11) \|/.test(m.line)).map(m => m.line);
if (todoDone.length !== 3 || !todoDone.every(l => /移交计划文档|结案/.test(l))) r12.push('待补第 8、9、11 项未按裁定处置');
report('12 接口表、配合项、本卷迁移清单、卷零行、五款游戏、待补清单、阶段表落实', r12.length === 0, r12.slice(0, 12).join(' | '));

// 13 关键条文在位
const r13 = [];
for (const [name, needle] of [
  ['同卡删旧', '就在同一张卡里删掉它取代的旧路径'], ['退役的判定', '留着不调用、加废弃标记、注释掉、改名保留、用开关关掉，都不算'], ['归后续要有卡号', '是 E-MIG-DEFER-UNBOUND'],
  ['一组一卡', '每个位置组恰有一张接收卡'], ['扫描命中都有人认', '都要落在某条迁移行的锚点范围内'], ['对象是整体', '对象不能是一件物品、一个地点、一种职业、一个类别'],
  ['拆分轴唯一', '唯一的拆分轴是消费者组'], ['判据只写编号', '验收判据只写编号'], ['同卷串行', '同时处于 `open` 或 `review` 的卡至多一张'],
  ['不看测试通过数', '输出里没有测试通过数'], ['期望值从规则来', '不是把期望值改成新代码跑出来的数'], ['四种改法打回', '四种都是 E-MIG-TEST-PATCH'],
  ['波只是写卷顺序', '波是写卷的先后，不兼作迁移的依赖序'], ['整卡回退', '不在主干上打补丁修到测试通过'], ['两次失败即停', '不再换个办法试第三次'],
  ['回填由程序', '手填无效'], ['卡清单是数据', '本卷正文不列卡'],
  ['U 只对子基线', '硬上限只对可归属的子基线生效'], ['基线行必须归卡', '汇总器不替它挑卡，也不允许记成"归后续"'], ['n 派生', 'n 等于卡账里非清扫卡的最大阶段号'],
  ['可开不可退', '实际只放开当前这一个阶段'], ['文件级迁移表只引用', '本卷不另立一份'], ['对象是系统登记项整体', '不落到某一条状态路径'], ['回退重扫', '基线元组按回退后的版本库重扫得出']
]) if (!all.includes(needle)) r13.push('缺：' + name);
report('13 关键条文在位（24 条）', r13.length === 0, r13.join(' | '));

// 14 重跑生成器，与附录甲逐行比对（一审小项 11）
const r14 = [];
{
  const { execFileSync } = await import('node:child_process');
  let gen = [];
  try { gen = execFileSync(process.execPath, [GEN], { encoding: 'utf8' }).trimEnd().split(/\r?\n/); }
  catch (e) { r14.push('生成器运行失败：' + String(e.message).split('\n')[0]); }
  const a = all0.findIndex(l => l.startsWith('生成器 `' + GEN + '`'));
  const b = all0.findIndex((l, i) => i > a && l === '读法：');
  if (a < 0 || b < 0) r14.push('附录甲定位失败');
  else {
    const doc = all0.slice(a + 1, b);
    while (doc.length && doc[0] === '') doc.shift();
    while (doc.length && doc[doc.length - 1] === '') doc.pop();
    if (gen.length && doc.length !== gen.length) r14.push(`行数不同：附录 ${doc.length}，生成器 ${gen.length}`);
    for (let i = 0; i < Math.min(doc.length, gen.length); i++) if (doc[i] !== gen[i]) { r14.push(`第 ${i + 1} 行不同：附录「${doc[i].slice(0, 60)}」生成器「${gen[i].slice(0, 60)}」`); break; }
  }
  // 生成器代码里不得有卷名字面量（李白 11-13 裁定⑧）
  const src = readFileSync(GEN, 'utf8').split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
  const lit = src.match(/卷[零一二三四五六七八九十]+[b甲乙]?/g) ?? [];
  if (lit.length) r14.push('生成器代码含卷名字面量 ' + [...new Set(lit)].join('、'));
  // 扩到脚本/卷十一/ 下全部生成脚本 gen-*.mjs（李白终核卷十一 三-4）：
  // ① 逻辑位置（startsWith、includes、相等比较、正则开头、Map 的 get/has 取键，以及整个字符串就是卷名或"卷名加冒号"的字面量、"卷名加冒号再拼变量"的写法如 `卷一:${t}`）不得出现卷名字面量；输出给人看的说明文字、注释里的卷名不算；
  // ② 代码里不得写盘符路径字面量（本机路径）；③ 连跑两次，标准输出逐行一致；
  // ④ 读规则表键的上限值不得在脚本里另写成数字常量（MAXFILES 一类：不许出现"= 数字"的 MAXFILES 赋值）
  const { readdirSync } = await import('node:fs');
  const gens = readdirSync(SCRDIR).filter(f => /^gen-.*\.mjs$/.test(f)).sort();
  const LOGIC = /(?:startsWith|endsWith|includes|indexOf|\.get|\.has)\(\s*['"`]卷[零一二三四五六七八九十]|[=!]==?\s*['"`]卷[零一二三四五六七八九十]|\/\^卷[零一二三四五六七八九十]|['"`]卷[零一二三四五六七八九十]+[b甲乙]?[:：]?['"`]|`卷[零一二三四五六七八九十]+[b甲乙]?[:：]\$\{/g;
  for (const g of gens) {
    const p = `${SCRDIR}/${g}`;
    const code = readFileSync(p, 'utf8').split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
    const hit = code.match(LOGIC) ?? [];
    if (hit.length) r14.push(`${g} 逻辑位置含卷名字面量 ${[...new Set(hit)].slice(0, 3).join('、')}`);
    const drive = code.match(/['"`][A-Za-z]:[\\/][^'"`\n]*/g) ?? [];
    if (drive.length) r14.push(`${g} 代码含盘符路径字面量 ${[...new Set(drive)].slice(0, 2).join('、')}`);
    if (/MAXFILES\s*=\s*\d/.test(code)) r14.push(`${g} 把 maxFiles 写成数字常量，应读规则表键 rules.migration.maxFiles`);
    let o1 = '', o2 = '';
    try { o1 = execFileSync(process.execPath, [p], { encoding: 'utf8', maxBuffer: 1 << 26 }); o2 = execFileSync(process.execPath, [p], { encoding: 'utf8', maxBuffer: 1 << 26 }); }
    catch (e) { r14.push(`${g} 运行失败：` + String(e.message).split('\n')[0]); continue; }
    if (o1 !== o2) r14.push(`${g} 两次运行输出不一致`);
  }
}
report('14 重跑全部生成脚本：卡族表与附录甲逐行比对；逻辑位置无卷名字面量、无盘符路径、两次运行一致', r14.length === 0, r14.join(' | '));

console.log(`行数 ${lines.length}；子系统 ${N}；规则条数 ${defined.size}；断言 ${definedA.size}；扫描条 ${definedS.size}；配合项 ${definedC.size}；开放问题 ${definedQ.size}；本卷迁移行 ${definedM.size}；枚举值 ${enumRows.length}；错误码 ${regErr.length}；待补清单 ${todo} 条；附录甲卡族 ${gRows.length} 行；失败项 ${fails}`);
process.exit(fails ? 1 : 0);
