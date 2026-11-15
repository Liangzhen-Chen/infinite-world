// 卷二第五版自动对账脚本（只读 .md，纯算术与字串处理；不读项目代码）。
// 用法：node check-vol2.mjs <卷二路径> [各卷目录，缺省 F:/dnd/docs/统一底层设计；第 2b 项跨卷核"内核信号代号"小族引用]
import { readFileSync, readdirSync } from 'node:fs';
const path = process.argv[2] ?? 'F:/dnd/docs/统一底层设计/卷二-维度表规范与统一入口.md';
const md = readFileSync(path, 'utf8');
const lines = md.split('\n');
const out = [];
const log = (s) => { out.push(s); console.log(s); };
let fail = 0;
const bad = (s) => { fail++; log('  FAIL ' + s); };

// ---------- 1. 错误码 ----------
const codeRe = /\b[EW]-[A-Z0-9]+(?:-[A-Z0-9]+)+\b/g;
const sec43Start = lines.findIndex(l => l.startsWith('### 4.3'));
const sec43End = lines.findIndex((l, i) => i > sec43Start && l.startsWith('---'));
const tableLines = lines.slice(sec43Start, sec43End).filter(l => l.startsWith('|'));
const bodyLines = lines.filter((_, i) => i < sec43Start || i >= sec43End);
const bodyText = bodyLines.join('\n').replace(/[EW]-[A-Z0-9-]+-\*/g, ''); // 去掉 "E-DIM-DOMAIN-*" 这类通配提法
const bodyCodes = new Set(bodyText.match(codeRe) ?? []);
// 登记表：展开 "E-X-Y-Z / -W" 简写：-W 匹配正文中以 -W 结尾且前两段相同的码
const registered = new Set();
for (const l of tableLines) {
  const cell = l.split('|')[1] ?? '';
  const tokens = cell.split(/\s*[\/；;]\s*/).map(t => t.trim()).filter(Boolean);
  let lastFull = null;
  for (let t of tokens) {
    t = t.replace(/（.*?）|\(.*?\)/g, '').trim();
    const full = t.match(/^[EW]-[A-Z0-9]+(?:-[A-Z0-9]+)+/);
    if (full) { registered.add(full[0]); lastFull = full[0]; continue; }
    const short = t.match(/^-([A-Z0-9]+(?:-[A-Z0-9]+)*)/);
    if (short && lastFull) {
      const head = lastFull.split('-').slice(0, 2).join('-');
      let hit = false;
      for (const c of bodyCodes) if (c.startsWith(head + '-') && c.endsWith('-' + short[1])) { registered.add(c); hit = true; }
      if (!hit) registered.add(lastFull.split('-').slice(0, -1).join('-') + '-' + short[1]);
    }
  }
}
log('== 1 错误码');
const unregistered = [...bodyCodes].filter(c => !registered.has(c) && !/<|名>/.test(c)).sort();
const unused = [...registered].filter(c => !bodyCodes.has(c)).sort();
log(`  正文错误码 ${bodyCodes.size} 个；登记表展开 ${registered.size} 个`);
if (unregistered.length) bad('正文用到但未登记: ' + unregistered.join(', ')); else log('  OK 正文码全部已登记');
if (unused.length) log('  注意 登记但正文未用到（含简写展开的候选）: ' + unused.join(', ')); else log('  OK 登记码全部有用到');

// ---------- 2. 前缀 ----------
log('== 2 前缀登记');
const sec19 = lines.findIndex(l => l.startsWith('### 1.9'));
const sec110 = lines.findIndex((l, i) => i > sec19 && l.startsWith('### 1.10'));
const prefixText = lines.slice(sec19, sec110).join('\n');
const entityLine = (prefixText.match(/^实体前缀（[^\n]*/m)?.[0] ?? '').replace(/原 [a-z]+_ 改名/g, '');
const entityPrefixes = new Set(entityLine.match(/\b[a-z]+_(?![a-z])/g) ?? []);
const vocabPrefixes = new Set([...prefixText.matchAll(/→`([a-z]+_)`/g)].map(m => m[1]));
const registeredPrefixes = new Set([...entityPrefixes, ...vocabPrefixes]);
log(`  实体前缀 ${entityPrefixes.size}，词表族前缀 ${vocabPrefixes.size}`);
// 候选 id：反引号或 JSON 字串中的 snake 代号
const idRe = /["`]([a-z][a-z0-9]*)_([a-z0-9_]+)["`,\]\)\}:\s]/g;
// 非代号的 snake 词：族名、实体类名、持有种类、行为代号、事件动词、数学记号、文件名
const ignoreFamilies = new Set(['status_family','body_part','doctrine_group','usage_per','faith_layer','know_family','evt_family','plant_part','eff_output','error_code','orgkind','politykind',
  'body_plan','facility_type','law_code','event_type','member_of','devotee_of','fuel_use','status_tick','personality_default','h_i','z_j','input_view','name_blocklist','check_vol2',
  'consent_mode','status_target','eff_output','error_code','basis_kind','rx_cmp','rx_clock','slot_kind', // 代码内封闭枚举的名字
  'successor_mode','term_account','gate_verdict','wire_route','save_export', // 第十三版新增的代码内封闭枚举名与其值
  'save_import','wire_body','event_role','thought_role', // 第十五版新增的代码内封闭枚举名与其值（thought_role 是卷二十六的旧枚举名，只在 D.1 牵连清单里提到）
  // 第十三版新增的事件动词已全部移出（entity_terminated、entity_revived 第十六版改为 verb 族条目；naming_intent、note_intent 与 dimension_write_rejected 封卷后勘误改为按 §2.9 第 0 条"内核信号代号"小族登记校验，见 2b）
  'stock_mode','reply_result','narrate_result','term_record','revive_record','writer_role','save_unavailable','decision_card','record_class','due_kind', // due_kind 是卷二十的族名 // 第十六版新增的代码内封闭枚举名、枚举值与族名
  'kernel_signal', // 封卷后勘误 1114t 补登的代码内封闭枚举名（§1.9）
  'holding_kind','rx_op','stack_group','child_process','node_modules']); // 族名与非代号 snake 词
const ignorePrefix = new Set(['kg','m','mj','satiety','per','copper','class']); // 单位与 class 另算
// 内核信号代号小族（§2.9 第 0 条，唯一登记处）：表行 | `代号` | 含义 | 唯一发出方 | 接收方（有序名单） | 定义处 |
// 接收名单（李白 11-14 裁定）：①②…连写，每项带"卷零 #N"（卷零 §1 加卷记录表"#"登记序号）与"所写字段：…"；
// 核四项：发出方唯一；名单非空且每项序号已登记、未退役、项内点到该序号的卷名；序号由小到大；各项所写字段两两无交集
// 执行相（李白 11-14 执行相裁定，封卷后勘误 1114bb）：每项须写"执行相：事务内|提交后"（只此两值）；名单按相分组，
// 事务内各项须全部排在提交后各项前；序号只在同一执行相内比较；事务内项所读字段（"读 `x`、`y`"）与提交后项所写字段有交集即 FAIL，
// 某事务内项正文未写"读 …"时，以其所写字段代替所读字段作近似（即退化为所写字段交集）
const docsDir = process.argv[3] ?? 'F:/dnd/docs/统一底层设计';
const volReg = new Map(); // 卷零 §1 "#" -> { name, retired }
try {
  const f0 = readdirSync(docsDir).find(f => /^卷零.*\.md$/.test(f));
  const l0 = readFileSync(docsDir + '/' + f0, 'utf8').split('\n');
  const s1 = l0.findIndex(l => l.startsWith('## §1'));
  for (let i = s1 + 1; i >= 1 && i < l0.length && !l0[i].startsWith('## '); i++) {
    const c = l0[i].trim().replace(/^\||\|$/g, '').split('|').map(x => x.trim());
    if (!/^\d+$/.test(c[0] ?? '')) continue;
    const name = (c[1].replace(/\*\*/g, '').match(/^卷\S+/) ?? [''])[0];
    volReg.set(Number(c[0]), { name, retired: /退役/.test(c[1]) });
  }
} catch { /* volReg 空，下面逐项报未登记 */ }
const CIRC = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
const splitItems = (s) => { // 只在括号外按圈码切分
  const items = []; let depth = 0, cur = null, lead = '';
  for (const ch of s) {
    if ('（('.includes(ch)) depth++; else if ('）)'.includes(ch)) depth--;
    if (depth === 0 && CIRC.includes(ch)) { cur = { mark: ch, text: '' }; items.push(cur); continue; }
    if (cur) cur.text += ch; else lead += ch;
  }
  return { items, lead: lead.trim() };
};
const kernelCodes = new Map(); // 代号 -> 行号
const kHead = lines.findIndex(l => l.includes('**内核信号代号（小族；唯一登记处）**'));
const kRowProblems = [];
if (kHead >= 0) {
  let i = kHead + 1;
  while (i < lines.length && !lines[i].trim().startsWith('|')) { if (lines[i].trim() && !/^\s/.test(lines[i])) break; i++; }
  for (; i < lines.length && lines[i].trim().startsWith('|'); i++) {
    const cells = lines[i].trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
    if (cells[0] === '代号' || /^-+$/.test(cells[0])) continue;
    const code = cells[0].match(/^`([a-z][a-z0-9]*_[a-z0-9_]+)`$/)?.[1];
    if (cells.length !== 5 || !code) { kRowProblems.push(`第 ${i + 1} 行格式不合（须 5 列、首列为单个反引号代号）`); continue; }
    if (kernelCodes.has(code)) kRowProblems.push(`代号 ${code} 重复登记（第 ${kernelCodes.get(code)}、${i + 1} 行）`);
    kernelCodes.set(code, i + 1);
    // ① 唯一发出方：去掉括注与引号内的说明后，不得为空、不得并列多方
    const core = s => { let t = s; for (let k = 0; k < 3; k++) t = t.replace(/（[^（）]*）|\([^()]*\)|"[^"]*"|“[^”]*”/g, ''); return t.trim(); };
    const snd = core(cells[2]);
    if (!snd) kRowProblems.push(`${code} 缺发出方`);
    else if (/、|或|；|(?:^|[^a-z.])和|与/.test(snd) || CIRC.split('').some(c => snd.includes(c))) kRowProblems.push(`${code} 的发出方不唯一: ${snd}`);
    // ② 接收名单非空、每项已在卷零 §1 登记
    const { items, lead } = splitItems(cells[3]);
    if (!items.length) { kRowProblems.push(`${code} 接收名单为空: ${core(cells[3]) || '（空）'}`); continue; }
    if (lead) kRowProblems.push(`${code} 接收名单首个圈码前有多余文字: ${lead}`);
    const nums = [], fieldsOf = [], phaseOf = [], readsOf = [];
    items.forEach((it, k) => {
      const tag = `${code} 接收名单第 ${it.mark} 项`;
      if (it.mark !== CIRC[k]) kRowProblems.push(`${tag} 圈码不连号（应为 ${CIRC[k]}）`);
      // ⑤ 执行相：恰好一处"执行相：值"，值只许 事务内 / 提交后（值截到"；，,（("或项末）
      const ph = [...it.text.matchAll(/执行相：\s*([^；，,（(]*)/g)].map(m => m[1].trim());
      if (ph.length !== 1) { kRowProblems.push(`${tag} 须恰好登记一个"执行相"，现 ${ph.length} 个`); phaseOf.push(null); }
      else if (ph[0] !== '事务内' && ph[0] !== '提交后') { kRowProblems.push(`${tag} 执行相取值须为"事务内"或"提交后"，现为"${ph[0]}"`); phaseOf.push(null); }
      else phaseOf.push(ph[0]);
      // ⑥ 所读字段："读 `x`、`y`"（"读取"同），取紧随其后连写的反引号代号；未写则为 null，下面以所写字段近似
      const rd = new Set();
      for (const m of it.text.matchAll(/读取?\s*((?:`[^`]+`\s*[、，,和与及]?\s*)+)/g)) for (const c of m[1].matchAll(/`([^`]+)`/g)) rd.add(c[1]);
      readsOf.push(rd.size ? rd : null);
      const ns = [...it.text.matchAll(/卷零\s*#\s*(\d+)/g)].map(m => Number(m[1]));
      if (ns.length !== 1) { kRowProblems.push(`${tag} 须恰好写一个"卷零 #序号"，现 ${ns.length} 个`); nums.push(null); }
      else {
        const n = ns[0], r = volReg.get(n);
        nums.push(n);
        if (!r) kRowProblems.push(`${tag} 卷零 #${n} 未在卷零 §1 登记`);
        else if (r.retired) kRowProblems.push(`${tag} 卷零 #${n}（${r.name}）已退役`);
        else if (!new RegExp(r.name + '(?![一二三四五六七八九十甲乙b])').test(it.text)) kRowProblems.push(`${tag} 卷零 #${n} 登记为${r.name}，项内未写该卷`);
      }
      // ④ 所写字段：截到同层的"；"或项末；"不写 state"为空集；有反引号取反引号代号，另加整段文字
      const fm = it.text.match(/所写字段：([^；]*)/);
      if (!fm) { kRowProblems.push(`${tag} 未写"所写字段"`); fieldsOf.push(new Set()); return; }
      let ft = fm[1]; let d = 0, cut = ft.length;
      for (let j = 0; j < ft.length; j++) { if ('（('.includes(ft[j])) d++; else if ('）)'.includes(ft[j])) { if (d === 0) { cut = j; break; } d--; } }
      ft = ft.slice(0, cut).trim();
      if (/^不写\s*state/.test(ft)) { fieldsOf.push(new Set()); return; }
      const fs = new Set([...ft.matchAll(/`([^`]+)`/g)].map(m => m[1]));
      fs.add(ft.replace(/\s+/g, ''));
      fieldsOf.push(fs);
    });
    // ③ 按执行相分组：事务内各项全部在提交后各项前；组内按卷零登记序号由小到大（两组之间不比序号）
    const firstPost = phaseOf.indexOf('提交后');
    if (firstPost >= 0) for (let k = firstPost + 1; k < phaseOf.length; k++) if (phaseOf[k] === '事务内') kRowProblems.push(`${code} 接收名单未按执行相分组：事务内项 ${items[k].mark} 排在提交后项 ${items[firstPost].mark} 后`);
    for (const g of ['事务内', '提交后']) {
      const idx = phaseOf.map((p, k) => p === g ? k : -1).filter(k => k >= 0);
      for (let j = 1; j < idx.length; j++) { const a = idx[j - 1], b = idx[j];
        if (nums[a] != null && nums[b] != null && nums[b] < nums[a]) kRowProblems.push(`${code} 接收名单${g}组顺序违反卷零登记序号：${items[a].mark} #${nums[a]} 在 ${items[b].mark} #${nums[b]} 前`); }
    }
    // ⑥ 事务内项不读提交后项产物：事务内项所读（未写"读"则以其所写字段近似）∩ 提交后项所写 ≠ ∅ 即 FAIL
    for (let a = 0; a < items.length; a++) if (phaseOf[a] === '事务内') for (let b = 0; b < items.length; b++) if (phaseOf[b] === '提交后') {
      const rs = readsOf[a] ?? fieldsOf[a] ?? new Set();
      const both = [...rs].filter(x => fieldsOf[b]?.has(x));
      if (both.length) kRowProblems.push(`${code} 接收名单事务内项 ${items[a].mark} 读取提交后项 ${items[b].mark} 所写字段${readsOf[a] ? '' : '（未写所读字段，以所写字段近似）'}: ${both.join(', ')}`);
    }
    // ④ 同一字段无两个写者
    for (let a = 0; a < fieldsOf.length; a++) for (let b = a + 1; b < fieldsOf.length; b++) {
      const both = [...fieldsOf[a]].filter(x => fieldsOf[b].has(x));
      if (both.length) kRowProblems.push(`${code} 接收名单 ${items[a].mark}、${items[b].mark} 写同一字段: ${both.join(', ')}`);
    }
  }
}
const unknown = new Map();
for (const m of md.matchAll(idRe)) {
  const token = m[1] + '_' + m[2], p = m[1] + '_';
  if (registeredPrefixes.has(p) || kernelCodes.has(token)) continue;
  if (ignoreFamilies.has(token) || ignorePrefix.has(m[1])) continue;
  if (/_per_|_kg|_mm|_c$|_m$|_days?$|_minute|_year|_l$/.test(token) && /^(kg|m|mj|copper|satiety|per)/.test(m[1])) continue;
  if (!unknown.has(p)) unknown.set(p, new Set());
  unknown.get(p).add(token);
}
if (unknown.size) { for (const [p, ts] of unknown) log(`  注意 未登记前缀 ${p}: ${[...ts].slice(0, 6).join(', ')}`); } else log('  OK 全部候选 id 的前缀均已登记');

// ---------- 2b. 内核信号代号小族 ----------
log('== 2b 内核信号代号登记');
if (kHead < 0) bad('§2.9 第 0 条未找到"内核信号代号（小族；唯一登记处）"');
else if (!kernelCodes.size) bad('内核信号代号小族表为空');
for (const p of kRowProblems) bad('内核信号代号表 ' + p);
log(`  小族登记 ${kernelCodes.size} 个: ${[...kernelCodes.keys()].join(', ')}`);
// 正文（附录 D 处置史除外）里作为事件发出、或带载荷写出的代号：前缀不属于 §1.9 词表族的，须在小族登记里
const apD = lines.findIndex(l => l.startsWith('## 附录 D'));
const apDEnd = apD < 0 ? -1 : lines.findIndex((l, i) => i > apD && /^## /.test(l));
const sigRe = /(?:事件|代号|emit[^`\n]{0,3}|发)\s*`([a-z][a-z0-9]*_[a-z0-9_]+)(?: \{[^`]*\})?`|`([a-z][a-z0-9]*_[a-z0-9_]+) \{[^`]*\}`/g;
const sigBad = new Map();
lines.forEach((l, i) => {
  if (apD >= 0 && i >= apD && (apDEnd < 0 || i < apDEnd)) return;
  for (const m of l.matchAll(sigRe)) {
    const token = m[1] ?? m[2];
    // 事件/信号代号只可能是词表族代号或内核信号代号；实体前缀（id）不算登记
    if (vocabPrefixes.has(token.split('_')[0] + '_') || kernelCodes.has(token)) continue;
    if (!sigBad.has(token)) sigBad.set(token, []);
    sigBad.get(token).push(i + 1);
  }
});
for (const [t, ls] of sigBad) bad(`内核信号代号 ${t} 未在小族登记（行 ${ls.join(', ')}）`);
if (!sigBad.size) log('  OK 正文发出的非词表代号均在小族登记');
// 引用本小族的行（本卷全文与同目录各卷）：同一行里点到的 snake 代号须已登记
const citeSrc = [['卷二', lines]];
try { for (const f of readdirSync(docsDir)) if (/^卷.*\.md$/.test(f) && !f.startsWith('卷二-')) citeSrc.push([f, readFileSync(docsDir + '/' + f, 'utf8').split('\n')]); } catch { log('  注意 未能读取 ' + docsDir + '，跨卷引用未核'); }
let citeBad = 0;
for (const [name, ls] of citeSrc) ls.forEach((l, i) => {
  if (name === '卷二' && i === kHead) return;
  if (name === '卷二' && apD >= 0 && i >= apD && (apDEnd < 0 || i < apDEnd)) return; // 附录 D 处置史/勘误行只是记录，不当作信号引用
  if (name === '卷二' && l.includes('**词表族的键就是族名**') && l.includes('**代码内封闭枚举**')) return; // §1.9 族登记整段（一行），其中"内核信号代号"只是 kernel_signal 的说明，其后各族名不是信号引用；按内容锚定
  if (!l.includes('内核信号代号')) return;
  for (const m of l.slice(l.indexOf('内核信号代号')).matchAll(/`([a-z][a-z0-9]*_[a-z0-9_]+)/g)) {
    if (kernelCodes.has(m[1]) || vocabPrefixes.has(m[1].split('_')[0] + '_')) continue;
    if (ignoreFamilies.has(m[1]) && !sigBad.has(m[1])) continue; // 第 2 项已声明的非代号名（如封闭枚举名），且未被当信号发出
    citeBad++; bad(`${name}:${i + 1} 引用内核信号代号小族的 ${m[1]} 未登记`);
  }
});
if (!citeBad) log(`  OK 引用小族的代号均已登记（核 ${citeSrc.length} 卷）`);

// ---------- 2c. readShapes 行格式（§2.7"读入口返回形状登记"，李白 11-14 bc698ed3 及其后两项裁定）----------
// 行格式五字段封闭：entry field type refFamily nullable；所指族、可空两栏每行必写。现无数据行时只核表头与字段说明在位
log('== 2c readShapes 行格式');
const RS_KEYS = ['entry', 'field', 'type', 'refFamily', 'nullable'];
const rsHead = lines.findIndex(l => /"readShapes":/.test(l));
if (rsHead < 0) bad('state-owners.json 骨架未找到 "readShapes"');
else for (const k of ['refFamily', 'nullable']) if (!lines[rsHead].includes(`"${k}"`)) bad(`卷二:${rsHead + 1} readShapes 表头说明缺 "${k}"`);
const rsDef = lines.findIndex(l => l.includes('**读入口返回形状登记（唯一定义）**'));
if (rsDef < 0) bad('§2.7 未找到"读入口返回形状登记（唯一定义）"');
else {
  let rsEnd = rsDef + 1; while (rsEnd < lines.length && !/^(- |#)/.test(lines[rsEnd])) rsEnd++;
  const fmt = lines.slice(rsDef + 1, rsEnd).find(l => /\*\*行格式\*\*/.test(l));
  if (!fmt) bad('readShapes 定义缺"行格式"一项');
  else {
    const lit = fmt.match(/`(\{"entry":[^`]*\})`/)?.[1] ?? '';
    const keys = [...lit.matchAll(/"([A-Za-z]+)":/g)].map(m => m[1]);
    if (keys.join() !== RS_KEYS.join()) bad(`readShapes 行格式字段应为 ${RS_KEYS.join(', ')}，实为 ${keys.join(', ') || '（未找到）'}`);
    if (!/\*\*所指族\*\*\s*`refFamily`/.test(fmt)) bad('readShapes 行格式缺所指族 refFamily 的字段说明');
    if (!/\*\*可空\*\*\s*`nullable`/.test(fmt)) bad('readShapes 行格式缺可空 nullable 的字段说明');
  }
}
// 数据行（各卷所填 {"entry": …} 行，格式定义本身除外）须写齐五字段
let rsRows = 0;
for (const [name, ls] of citeSrc) ls.forEach((l, i) => {
  for (const m of l.matchAll(/\{"entry":[^}]*\}/g)) {
    if (m[0].includes('<文件>#')) continue; // 格式定义里的模板
    rsRows++;
    const ks = [...m[0].matchAll(/"([A-Za-z]+)":/g)].map(x => x[1]);
    for (const k of RS_KEYS) if (!ks.includes(k)) bad(`${name}:${i + 1} readShapes 行缺 ${k}`);
    for (const k of ks) if (!RS_KEYS.includes(k)) bad(`${name}:${i + 1} readShapes 行多出字段 ${k}`);
  }
});
log(`  数据行 ${rsRows} 行${rsRows ? '' : '（尚无，只核表头与字段说明）'}`);

// ---------- 3. 类型数 ----------
log('== 3 类型数');
const counts = [...md.matchAll(/(\d+)\s*种(?:\*\*)?类型|类型清单[^\n]*?(\d+)\s*种|共\s*\*\*(\d+)\s*种\*\*/g)].map(m => m[1] ?? m[2] ?? m[3]).filter(Boolean);
const sec15 = lines.findIndex(l => l.startsWith('### 1.5'));
const sec16 = lines.findIndex((l, i) => i > sec15 && l.startsWith('### 1.6'));
const typeRows = lines.slice(sec15, sec16).filter(l => /^\| `[a-z]/.test(l));
const typeCount = typeRows.reduce((n, l) => n + (l.split('|')[1].match(/`[a-z]+`/g)?.length ?? 0), 0);
log(`  §1.5 表计 ${typeCount} 种；全文提到的类型数：${counts.join(', ') || '（无）'}`);
if (counts.some(c => Number(c) !== typeCount)) bad('类型数不一致'); else log('  OK 类型数一致');

// ---------- 4. 附录 A 夹具 ----------
log('== 4 附录 A 夹具');
const apA = lines.findIndex(l => l.startsWith('## 附录 A'));
const blocks = [];
for (let i = apA, inB = false, buf = []; i < lines.length && blocks.length < 3; i++) {
  if (lines[i].startsWith('```json')) { inB = true; buf = []; continue; }
  if (lines[i].startsWith('```') && inB) { inB = false; blocks.push(buf.join('\n')); continue; }
  if (inB) buf.push(lines[i]);
}
let fx, vocab, effects;
try { fx = JSON.parse(blocks[0]); vocab = JSON.parse(blocks[1]); effects = JSON.parse(blocks[2]); log('  OK 三段 JSON 可解析'); } catch (e) { bad('JSON 解析失败: ' + e.message); }
if (fx) {
  const TYPES = new Set(['number','integer','boolean','string','enum','ref','union','set','map','list','struct','curve','distribution','rx']);
  for (const k of ['kind','namespace','version','entity','behaviors','dimensions','precedenceGroups','classes','rows','generated']) if (!(k in fx)) bad('表头缺 ' + k);
  if (!Array.isArray(fx.entity?.idPrefix) || !fx.entity.classPrefix || !('instanceTable' in fx.entity)) bad('entity 字段不全');
  if (!fx.behaviors?.length) bad('behaviors 为空');
  const dims = fx.dimensions ?? {};
  for (const [d, def] of Object.entries(dims)) {
    if (!TYPES.has(def.type)) bad(`${d}: type ${def.type} 不在清单`);
    if (!/^[a-z][a-zA-Z0-9]{0,47}$/.test(d)) bad(`${d}: 维度键格式`);
    if (['number','integer'].includes(def.type)) { if (!def.unit) bad(`${d}: 缺 unit`); if (!(Number.isInteger(def.precision) && def.precision >= 0 && def.precision <= 4)) bad(`${d}: precision`); if (!Array.isArray(def.domain)) bad(`${d}: domain`); }
    if (!def.required) bad(`${d}: 缺 required`);
    if (def.required !== 'always' && !def.onUnknown) bad(`${d}: 非 always 缺 onUnknown`);
    if (def.onUnknown && !['skip','gap','error'].includes(def.onUnknown)) bad(`${d}: onUnknown 值`);
    if (!('modifiable' in def)) bad(`${d}: 缺 modifiable`);
    if (def.modifiable) { if (!['none','penalized'].includes(def.stacking)) bad(`${d}: stacking`); if (!Array.isArray(def.bounds)) bad(`${d}: bounds`); if (!(def.type === 'number' || def.type === 'integer' || (def.type === 'map' && ['number','integer'].includes(def.value?.type)))) bad(`${d}: modifiable 类型`); }
    if (['set','list'].includes(def.type) && !def.of) bad(`${d}: 缺 of`);
    if (def.type === 'map' && !(def.key && def.value)) bad(`${d}: map 缺 key/value`);
    if (!def.source || !def.owner) bad(`${d}: 缺 source/owner`);
  }
  // 类别行：展平与检查
  const classes = fx.classes ?? {};
  const flat = {};
  const flatten = (id, seen = []) => {
    if (flat[id]) return flat[id];
    if (seen.includes(id)) { bad('extends 成环 ' + seen.join('>')); return {}; }
    const row = classes[id]; if (!row) { bad('extends 目标不存在 ' + id); return {}; }
    const base = row.extends ? { ...flatten(row.extends, [...seen, id]) } : {};
    const used = {};
    for (const [k, v] of Object.entries(row)) {
      if (['extends','abstract','basis','status','sources'].includes(k)) continue;
      const m = k.match(/^([a-zA-Z0-9]+)([+\-~*])?$/); if (!m) { bad(`${id}.${k} 键格式`); continue; }
      const dim = m[1], op = m[2];
      if (!dims[dim]) bad(`${id}.${k}: 维度未声明`);
      if (used[dim]) bad(`${id}.${dim}: 同维两种写法`); used[dim] = true;
      if (!op) base[dim] = v;
      else if (op === '+') base[dim] = Array.isArray(base[dim]) ? [...new Set([...base[dim], ...v])] : { ...(base[dim] ?? {}), ...v };
      else if (op === '-') base[dim] = Array.isArray(base[dim]) ? base[dim].filter(x => !v.includes(x)) : Object.fromEntries(Object.entries(base[dim] ?? {}).filter(([kk]) => !v.includes(kk)));
      else if (op === '~') { if (base[dim] === undefined) bad(`${id}.${k}: 父无值`); base[dim] = (base[dim] ?? 0) + v; }
      else if (op === '*') { if (base[dim] === undefined) bad(`${id}.${k}: 父无值`); base[dim] = Math.round((base[dim] ?? 0) * v * 1e4) / 1e4; }
    }
    if (!row.basis) bad(`${id}: 缺 basis`);
    return (flat[id] = base);
  };
  for (const id of Object.keys(classes)) flatten(id);
  const prec = fx.precedenceGroups?.default ?? [];
  for (const c of prec) { if (!classes[c]) bad('precedence 引用无行 ' + c); if (classes[c]?.abstract) bad('precedence 含 abstract ' + c); }
  if (Object.values(classes).some(r => r.sources) && typeof fx.memberDeviationThreshold !== 'number') bad('有 sources 但缺 memberDeviationThreshold');
  // broader 深度与手写顺序
  const classEntries = vocab?.families?.class?.entries ?? {};
  const depth = (c) => { let d = 0, cur = classEntries[c]; while (cur?.broader) { d++; cur = classEntries[cur.broader]; } return d; };
  for (let i = 1; i < prec.length; i++) if (depth(prec[i - 1]) < depth(prec[i])) bad(`precedence 顺序与 broader 深度矛盾: ${prec[i - 1]} 在 ${prec[i]} 前`);
  // 词表引用闭合
  const vocabIds = new Set(); for (const fam of Object.values(vocab?.families ?? {})) for (const id of Object.keys(fam.entries ?? {})) vocabIds.add(id);
  const checkRefs = (val, where) => { if (typeof val === 'string' && /^[a-z]+_[a-z0-9_]+$/.test(val) && !val.startsWith('fac_')) { if (!vocabIds.has(val) && !(effects && effects[val])) bad(`${where}: 引用 ${val} 不在词表/效果族夹具`); } else if (Array.isArray(val)) val.forEach((v, i) => checkRefs(v, where + '[' + i + ']')); else if (val && typeof val === 'object') for (const [k, v] of Object.entries(val)) { if (/^[a-z]+_[a-z0-9_]+$/.test(k) && !vocabIds.has(k)) bad(`${where}.${k}: 键 ${k} 不在词表夹具`); checkRefs(v, where + '.' + k); } };
  for (const [id, row] of Object.entries(classes)) for (const [k, v] of Object.entries(row)) if (!['basis','status','sources','extends','abstract'].includes(k)) checkRefs(v, id + '.' + k);
  // 实体行
  const rows = fx.rows ?? {};
  for (const [id, row] of Object.entries(rows)) {
    if (!fx.entity.idPrefix.some(p => id.startsWith(p))) bad(`实体行 ${id} 前缀不符`);
    if (!row.basis) bad(`${id}: 缺 basis`);
    for (const c of row.classes ?? []) if (!classes[c] && !(c.startsWith('comp_') && vocab?.families?.component?.entries?.[c])) bad(`${id}: classes 引用无行 ${c}`);
    for (const k of Object.keys(row)) if (/[+\-~*]$/.test(k)) bad(`${id}: 实体行用了 ${k}（允许，仅检查维度存在）`);
    // 有效值 = own ∪ 类别链（按 precedence）
    const eff = {}; for (const c of prec) if ((row.classes ?? []).includes(c)) for (const [k, v] of Object.entries(flat[c])) if (!(k in eff)) eff[k] = v;
    for (const [k, v] of Object.entries(row)) if (dims[k]) eff[k] = v;
    for (const [d, def] of Object.entries(dims)) if (def.required === 'always' && eff[d] === undefined) bad(`${id}: 必填 ${d} 缺失`);
    for (const call of row.serviceEffects ?? []) { if (!call.family || !call.params) bad(`${id}: effectCall 形状`); if (!effects?.[call.family]) bad(`${id}: 效果族 ${call.family} 不在夹具`); for (const p of Object.keys(call.params)) if (!effects?.[call.family]?.params?.[p]) bad(`${id}: 参数 ${p} 未在族声明`); }
    for (const [k, v] of Object.entries(row)) if (!['basis','status','classes','serviceEffects'].includes(k)) checkRefs(v, id + '.' + k);
  }
  if (!Object.keys(rows).length) bad('rows 为空');
  log(`  维度 ${Object.keys(dims).length} 个，类别行 ${Object.keys(classes).length}，实体行 ${Object.keys(rows).length}；展平 class_workshop_hot = ${JSON.stringify(flat.class_workshop_hot)}`);
}
log(`== 结果：${fail === 0 ? 'PASS' : 'FAIL ' + fail + ' 项'}`);
