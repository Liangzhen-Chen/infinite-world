// 只核用（2026-11-14，claude-opus-5-5 中档）：李白 11-14 ③ kind-only 与 ab8e3bcf ②④ 只核
// ① 全书动词：登记行、声明的发出系统、kindOnly、kindFrom 引用；核"非 kindOnly 恰一个发出系统、kindOnly 零发出且被至少一条 kindFrom 取值引用"
// ② 事件 id 位次代号（pos.*）无撞号：卷九 §2.9 事件 id 表、卷二十四 R24-1.1、卷二十七 R27-8.9
// ③ 行上必写栏（2026-11-15 甲-0 扩展）：各卷登记的动词行补没补表 B 必写栏、事件类型行补没补表 C 六栏、due_kind 行补没补
//    calendarBound。栏名从定义处读（卷二十四 §2.2 表 B / 表 C、C24-12 行、卷二十 §2.1 词表族 due_kind 表），不写死。
// 只读正文，不改任何文件。正文是散文，"发出系统"抽取是启发式：判不了的列"需人工"，由报告给人工结果。
// 用法：node check-verb-emitter.mjs [卷文目录]   （目录缺省为仓库 docs/统一底层设计；注入测试时给副本目录）
import fs from 'fs';
import path from 'path';

const ROOT = process.argv[2] ?? 'F:/dnd/docs/统一底层设计';
const files = fs.readdirSync(ROOT).filter(f => /^卷.*\.md$/.test(f)).sort();
const vol = f => f.replace(/-.*$/, '').replace(/\.md$/, '');
const LOGHEAD = /修订|处置|自检|记账|影响面|审查意见|版本说明|改动|勘误/;

// 读全书，标出每行所在的二级标题；卷首（第一个 ## 之前）与修订/处置类附录视为"记录行"，不参与判定
const L = []; // {f, v, n, t, log}
for (const f of files) {
  const lines = fs.readFileSync(path.join(ROOT, f), 'utf8').split(/\r?\n/);
  let head = null, sub = null;
  lines.forEach((t, i) => {
    if (/^## /.test(t)) { head = t; sub = t; }
    else if (/^### /.test(t)) sub = t;
    L.push({ f, v: vol(f), n: i + 1, t, log: head === null || LOGHEAD.test(head), h2: head, h3: sub });
  });
}
console.log(`扫描卷文件 ${files.length} 个：${files.map(vol).join('、')}`);
console.log(`总行数 ${L.length}；记录行（卷首说明或修订/处置/自检/记账类附录下）${L.filter(x => x.log).length}，只列出不作判定`);

// ---------- ① 动词清单 ----------
const H = new Map(); // handle 名 -> 出现
const C = new Map(); // verb_ 代号 -> 出现
const add = (m, k, x) => { if (!m.has(k)) m.set(k, []); m.get(k).push(x); };
for (const x of L) {
  for (const m of x.t.matchAll(/roles\.verbs\.([A-Za-z]+)/g)) add(H, m[1], x);
  for (const m of x.t.matchAll(/\bverb_([a-z0-9]+(?:_[a-z0-9]+)*)(_?)/g)) add(C, 'verb_' + m[1] + m[2], x);
}
// 句柄名的裸写（反引号内）也算引用
for (const x of L) for (const m of x.t.matchAll(/`([A-Za-z]+)`/g)) if (H.has(m[1]) && !x.t.includes('roles.verbs.' + m[1])) add(H, m[1], x);

// 别名：表格行首格是中文、同行恰一个 verb_ 代号 → 首格作别名（如“常住变化事件”）
const alias = new Map();
for (const x of L) {
  if (!x.t.startsWith('|')) continue;
  const codes = [...new Set([...x.t.matchAll(/\bverb_[a-z0-9_]+[a-z0-9]/g)].map(m => m[0]))];
  if (codes.length !== 1) continue;
  const c0 = x.t.split('|')[1].trim();
  if (/^[\u4e00-\u9fa5、]{2,12}事件$/.test(c0)) add(alias, codes[0], c0);
}

const NEG = /(不|不得|不再|不以|不另|不重|没有|无)[^，；。]{0,8}$/;
const EMIT_RX = [
  [/发出系统为([^，；。）|]{1,30})/g, '发出系统为'],
  [/唯一发出方（([^）]{1,40})）/g, '唯一发出方'],
  [/发出者[是为]([^，；。|]{1,30})/g, '发出者'],
  [/由([^，；。|（“”]{1,24}?)发出/g, '由…发出'],
  [/(本卷登记，别卷发出)/g, '登记卷≠发出卷'],
];
function windowAround(t, key, w = 160) {
  const out = []; let i = t.indexOf(key);
  while (i >= 0) { out.push(t.slice(Math.max(0, i - w), i + key.length + w)); i = t.indexOf(key, i + 1); }
  return out;
}
// 发出者声明的取窗（2026-11-14 逐格）：先按表格单元（| 分格）切，再按句号切句，窗口不跨格、不跨句；
// 句柄形还要求该处是动词句柄（roles.verbs.<k>，或反引号裸写且不是状态字段用法）。
// 状态字段用法：`x.k`（点号取字段）或 `k` 后接 为真/为假/取真/取假/置真/置假（布尔状态谓词）。
const FIELD_AFTER = /^`\s*(为真|为假|取真|取假|置真|置假)/;
function isVerbHandleAt(s, i, k) {
  const pre = s.slice(Math.max(0, i - 12), i);
  if (/roles\.verbs\.$/.test(pre)) return true;
  if (!pre.endsWith('`') || !s.startsWith('`', i + k.length)) return false;
  return !FIELD_AFTER.test(s.slice(i + k.length));
}
// 句子归属：下一句以指代开头（这/该/此/其/它/上述/两行/三行/二者/两者）时视为同一主语，并入本句窗口。
// 表格行：键在行首格（行的主语格）时，同行其余各格都在说它，整行各格逐格加入窗口；键在其他格时只取本格本句。
const ANAPHOR = /^\s*(这|该|此|其|它|上述|两行|三行|二者|两者)/;
// 省略主语的发出声明（2026-11-14 逐格二）：下一句直接以发出声明句式开头、且该句没有别的动词键（本动词的键/别名之外的
// roles.verbs.*、反引号裸写句柄、verb_* 代号）时，主语承上句，同样并入窗口。
const EMIT_LEAD = /^\s*(发出系统为|发出者[是为]|唯一发出方|由[^，；。]{1,24}?发出)/;
function hasOtherVerbKey(s, same) {
  for (const m of s.matchAll(/roles\.verbs\.([A-Za-z]+)/g)) if (!same.includes(m[1])) return true;
  for (const m of s.matchAll(/`([A-Za-z]+)`/g)) if (!same.includes(m[1]) && H.has(m[1])) return true;
  for (const m of s.matchAll(/\bverb_[a-z0-9_]+[a-z0-9]/g)) if (!same.includes(m[0])) return true;
  return false;
}
const continues = (s, same) => ANAPHOR.test(s) || (EMIT_LEAD.test(s) && !hasOtherVerbKey(s, same));
function emitWindows(t, key, w, handleForm, same = [key]) {
  const isRow = t.startsWith('|');
  const cells = isRow ? t.split('|').slice(1, -1) : [t];
  const out = [];
  cells.forEach((cell, ci) => {
    const ss = cell.split(/(?<=。)/);
    ss.forEach((s, si) => {
      let i = s.indexOf(key);
      while (i >= 0) {
        const wordOk = !handleForm || (!/[A-Za-z_]/.test(s[i - 1] || '') && !/[A-Za-z_]/.test(s[i + key.length] || ''));
        if (wordOk && (!handleForm || isVerbHandleAt(s, i, key))) {
          out.push(s.slice(Math.max(0, i - w), i + key.length + w));
          for (let j = si + 1; j < ss.length && continues(ss[j], same); j++) out.push(ss[j].slice(0, w));
          if (isRow && ci === 0) cells.slice(1).forEach(c => out.push(c));
        }
        i = s.indexOf(key, i + 1);
      }
    });
  });
  return out;
}
function analyze(name, occ, keys, handleForm = false) {
  const body = occ.filter(x => !x.log);
  const reg = new Set(), regLines = [], emitters = [], emitStmts = [], kindOnlyLines = [], kfRefs = [];
  for (const x of body) {
    const t = x.t;
    const vrow = /^\| `verb`（卷二十四/.test(t);
    const isReg = vrow ? keys.some(k => (t.split('|')[2] || '').includes(k))
      : keys.some(k => windowAround(t, k, 60).some(w => /本卷(自)?登记|由本卷登记|verb 族条目|本卷登记的/.test(w)));
    if (isReg) { reg.add(x.v); regLines.push(`${x.v}:${x.n}`); }
    for (const k of keys) for (const w of emitWindows(t, k, 160, handleForm, keys)) {
      for (const [rx, tag] of EMIT_RX) for (const m of w.matchAll(rx)) if (!/^零/.test(m[1].trim())) emitters.push(`${x.v}:${x.n} [${tag}] ${m[1].trim()}`);
    }
    // 发出语句：“发(出|一条)? <代号或别名>”，排除否定
    for (const k of keys) {
      const re = new RegExp('(发出?(?:一条)?(?:通用动词)?\\s*`?)(?:roles\\.verbs\\.)?' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![A-Za-z_])', 'g');
      for (const m of t.matchAll(re)) {
        const pre = t.slice(Math.max(0, m.index - 12), m.index);
        emitStmts.push(`${x.v}:${x.n}${NEG.test(pre) ? '（否定句，不计）' : ''}`);
      }
    }
    if (/kindOnly/.test(t) && keys.some(k => windowAround(t, k, 400).some(w => /kindOnly/.test(w)))) kindOnlyLines.push(`${x.v}:${x.n}`);
    for (const m of t.matchAll(/`(startVerb|stageVerb|endVerb|kindFrom)`\s*(?:取|=|为)\s*`(?:roles\.verbs\.)?([A-Za-z_]+)`/g))
      if (keys.includes(m[2])) kfRefs.push(`${x.v}:${x.n} ${m[1]}`);
  }
  // 未抽到登记句时：正文只在一卷出现，则该卷视为登记卷（句柄由各卷自登，roles.* 为本卷句柄）
  if (reg.size === 0) { const vs = new Set(body.map(x => x.v)); if (vs.size === 1) { reg.add([...vs][0] + '(唯一出现卷)'); } }
  return { name, reg: [...reg], regLines, emitters: [...new Set(emitters)], emitStmts: [...new Set(emitStmts)], kindOnlyLines, kfRefs, all: occ.map(x => `${x.v}:${x.n}${x.log ? '*' : ''}`) };
}

// kindOnly 成员：登记行里列在“三行 `kindOnly`”或“`kindOnly` 为真”同一句中的句柄
const kindOnlySet = new Set();
for (const x of L) {
  if (x.log) continue;
  for (const m of x.t.matchAll(/((?:`roles\.verbs\.[A-Za-z]+`（[^）]*）、?){1,6})三行 `kindOnly`/g))
    for (const h of m[1].matchAll(/roles\.verbs\.([A-Za-z]+)/g)) kindOnlySet.add(h[1]);
}
console.log(`\n== ① 动词清单：句柄形 roles.verbs.* ${H.size} 个，代号形 verb_* ${C.size} 个（其中 verb_example_* 示例 ${[...C.keys()].filter(k => k.startsWith('verb_example_')).length} 个，不计入判定）`);
console.log(`kindOnly 成员（按登记行“三行 \`kindOnly\`”抽取）：${[...kindOnlySet].join('、') || '（无）'}`);

const results = [];
for (const [h, occ] of [...H].sort()) results.push({ form: 'handle', ...analyze(h, occ, [h], true) });
for (const [c, occ] of [...C].sort()) {
  if (c.startsWith('verb_example_')) continue;
  results.push({ form: 'code', ...analyze(c, occ, [c, ...(alias.get(c) || [])]), alias: alias.get(c) || [] });
}

let pass = 0, fail = 0, manual = 0;
const P = [];
for (const r of results) {
  const isKO = r.form === 'handle' && kindOnlySet.has(r.name);
  const live = r.emitStmts.filter(s => !s.includes('否定句'));
  let verdict, why;
  if (isKO) {
    const ok = r.emitters.length === 0 && live.length === 0 && r.kfRefs.length >= 1;
    verdict = ok ? 'PASS' : 'FAIL';
    why = `kindOnly；声明发出 ${r.emitters.length} 处；发出语句(非否定) ${live.length} 处；kindFrom/三栏引用 ${r.kfRefs.length} 处`;
  } else {
    const emitVols = new Set(live.map(s => s.split(':')[0]));
    const declared = r.emitters;
    if (r.reg.length === 1 && declared.length === 0 && [...emitVols].every(v => v === r.reg[0].replace('(唯一出现卷)', ''))) {
      verdict = 'PASS'; why = `非 kindOnly；登记卷 ${r.reg[0]}，无另行声明的发出者，发出语句只在登记卷（登记者即发送者）→ 1 个`;
    } else {
      verdict = '需人工';
      why = `非 kindOnly；登记卷 {${r.reg.join('、') || '未抽到'}}；声明发出 ${declared.length} 处；发出语句所在卷 {${[...emitVols].join('、')}}`;
    }
  }
  if (verdict === 'PASS') pass++; else if (verdict === 'FAIL') fail++; else manual++;
  P.push(`- [${verdict}] ${r.form === 'handle' ? 'roles.verbs.' : ''}${r.name}${r.alias && r.alias.length ? `（别名 ${[...new Set(r.alias)].join('/')}）` : ''}：${why}\n    登记行 ${r.regLines.join(' ') || '—'}\n    声明 ${r.emitters.join(' ； ') || '—'}\n    发出语句 ${r.emitStmts.join(' ') || '—'}\n    kindOnly 行 ${r.kindOnlyLines.join(' ') || '—'}；kindFrom/三栏引用 ${r.kfRefs.join(' ') || '—'}\n    全部出现（*=记录行）${r.all.join(' ')}`);
}
console.log(P.join('\n'));
console.log(`\n① 小计：PASS ${pass}，FAIL ${fail}，需人工 ${manual}（共 ${results.length}）`);

// kindOnly 专项：所引通用动词与表 C 三栏
console.log('\n== ① 专项：kindOnly 行的 parent、表 C 三栏、通用动词 kindFrom = kind');
const v24 = L.filter(x => x.v === '卷二十四' && !x.log);
const tc = v24.find(x => /^\| `startVerb` \/ `stageVerb` \/ `endVerb`/.test(x.t));
console.log(`卷二十四表 C 三栏行 ${tc ? tc.n : '未找到'}：取值域含“kindOnly 为真” ${tc && /`kindOnly` 为真/.test(tc.t) ? '是' : '否'}；通用动词 kindFrom = kind ${tc && /`kindFrom = kind`/.test(tc.t) ? '是' : '否'}；发出系统为本卷实例系统 ${tc && /发出系统为本卷实例系统/.test(tc.t) ? '是' : '否'}`);
const r21 = v24.find(x => x.t.startsWith('- **R24-2.1 '));
console.log(`R24-2.1 行 ${r21 ? r21.n : '未找到'}：非 kindOnly 恰一个 ${/非 `kindOnly` 的动词行恰有一个登记的发出系统/.test(r21?.t || '') ? '有' : '无'}；kindOnly 零个且被引用 ${/`kindOnly` 行（表 B）登记的发出系统为零，且至少被一处/.test(r21?.t || '') ? '有' : '无'}；E-EVT-EMITTER ${/E-EVT-EMITTER/.test(r21?.t || '') ? '有' : '无'}`);
const ecode = v24.filter(x => /^\| E-EVT-EMITTER \|/.test(x.t)).map(x => x.n);
console.log(`E-EVT-EMITTER 错误码表登记行：${ecode.join('、') || '无'}（应恰 1 行）`);
const a244 = v24.filter(x => /A24-2\.4/.test(x.t)).map(x => x.n);
console.log(`A24-2.4 出现行：${a244.join('、')}`);
const v23 = L.filter(x => x.v === '卷二十三' && !x.log);
const et = v23.find(x => /^\| 事件类型表/.test(x.t));
if (et) {
  const sv = [...et.t.matchAll(/`(startVerb|stageVerb|endVerb)` 取 `roles\.verbs\.([A-Za-z]+)`/g)].map(m => `${m[1]}=${m[2]}`);
  console.log(`卷二十三事件类型行 ${et.n}：${sv.join('，')}；三者皆 kindOnly：${sv.every(s => kindOnlySet.has(s.split('=')[1])) ? '是' : '否'}`);
}
const vr = v23.find(x => /^\| `verb`（卷二十四 表 B）/.test(x.t));
if (vr) {
  const par = vr.t.match(/`parent` 依次为卷二十四 `roles\.verbs\.(\w+)`、`(\w+)`、`(\w+)`/);
  console.log(`卷二十三动词行 ${vr.n}：parent 依次 ${par ? par.slice(1).join('、') : '未抽到'}；载荷 kind 不是 showBegun 的说明 ${/不是 `showBegun`|不会自催化|kind` 不是/.test(vr.t) ? '有' : '无'}`);
  const seg = vr.t.slice(vr.t.indexOf('三行的表 B 字段'), vr.t.indexOf('三行的表 B 字段') + 600);
  console.log(`  三行表 B 字段原文片段：${seg}`);
}
// 通用动词 instanceStart/Stage/End 的发出系统：只卷二十四实例系统
for (const g of ['instanceStart', 'instanceStage', 'instanceEnd']) {
  const r = results.find(x => x.form === 'handle' && x.name === g);
  console.log(`通用动词 ${g}：登记卷 {${r?.reg.join('、')}}，声明 ${r?.emitters.join(' ； ') || '—'}`);
}

// ---------- ② 位次代号 ----------
console.log('\n== ② 事件 id 位次代号');
const posOcc = new Map();
for (const x of L) for (const m of x.t.matchAll(/\bpos\.([a-z]+)(?:\.[A-Za-z0-9<>_ −-]+)?/g)) add(posOcc, 'pos.' + m[1], x);
for (const [p, occ] of [...posOcc].sort()) console.log(`${p}：${occ.map(x => `${x.v}:${x.n}${x.log ? '*' : ''}`).join(' ')}`);

const v9 = L.filter(x => x.v === '卷九');
const hi = v9.findIndex(x => /^\| 事件 \| 规则或指令代号 \| 主体 id \| 位次代号 \|/.test(x.t));
const rows = [];
for (let i = hi + 2; i < v9.length && v9[i].t.startsWith('|'); i++) {
  const c = v9[i].t.split('|').slice(1, -1).map(s => s.trim());
  rows.push({ n: v9[i].n, ev: c[0].slice(0, 40), rule: c[1], subj: c[2], pos: c[3], posCodes: [...new Set([...c[3].matchAll(/(不借 )?`(pos\.[a-z]+)`/g)].filter(m => !m[1]).map(m => m[2]))], ruleCodes: [...new Set([...c[1].matchAll(/`([a-z]+\.[a-z.]+)`/g)].map(m => m[1]))], chain: /成链|前一条的事件 id/.test(c[2] + c[3]) });
}
console.log(`卷九 §2.9 事件 id 表：表头 卷九:${v9[hi]?.n}，数据行 ${rows.length}`);
for (const r of rows) console.log(`  卷九:${r.n} 「${r.ev}」 位次=${r.posCodes.join(',') || '（非固定：' + r.pos.slice(0, 30) + '）'} 固定规则代号=${r.ruleCodes.join(',') || '（取变量：' + r.rule.slice(0, 30) + '）'} 链式=${r.chain}`);
const byPos = new Map();
for (const r of rows) for (const p of r.posCodes) add(byPos, p, r);
let collide = 0;
for (const [p, rs] of byPos) {
  if (rs.length === 1) { console.log(`  ${p}：独占 1 行（卷九:${rs[0].n}）→ 与其他行不撞`); continue; }
  const varRows = rs.filter(r => r.ruleCodes.length === 0);
  const codes = rs.flatMap(r => r.ruleCodes);
  const dup = codes.filter((c, i) => codes.indexOf(c) !== i);
  const ok = varRows.length === 0 && dup.length === 0;
  if (!ok) collide++;
  console.log(`  ${p}：${rs.length} 行共用，规则代号 ${codes.join(',')}；取变量规则的行 ${varRows.length}；重复代号 ${dup.join(',') || '无'} → ${ok ? '规则代号两两不同，不撞' : '可能撞号'}`);
}
const fixedPos = new Set(rows.flatMap(r => r.posCodes));
const hookRow = rows.find(r => r.posCodes.length === 0);
console.log(`  非固定位次行：${hookRow ? '卷九:' + hookRow.n + ' ' + hookRow.pos : '无'}（由登记卷给固定代号）`);
const hookAbuse = L.filter(x => !x.log && !['卷九'].includes(x.v) && /(钩子|反应规则)[^。]{0,60}(位次|pos\.)/.test(x.t) && /pos\.(commit|only|kernel)/.test(x.t));
console.log(`  别卷给钩子/反应规则事件指定 pos.commit/only/kernel 的行：${hookAbuse.map(x => x.v + ':' + x.n).join(' ') || '无'}`);
const kernelElsewhere = (posOcc.get('pos.kernel') || []).filter(x => !x.log && !(x.v === '卷九' && x.n === rows.find(r => r.posCodes.includes('pos.kernel'))?.n) && !/R24-1\.1|R9-2\.3|`pos\.kernel`，不借 `pos\.only`|专用/.test(x.t));
console.log(`  pos.kernel 在 §2.9 该行与 R24-1.1 之外的正文用法：${kernelElsewhere.map(x => x.v + ':' + x.n).join(' ') || '无'}`);
const r241 = v24.find(x => x.t.startsWith('- **R24-1.1 '));
console.log(`  卷二十四 R24-1.1（卷二十四:${r241?.n}）：引 pos.kernel ${/`pos\.kernel`/.test(r241?.t || '') ? '是' : '否'}；写“不借 pos.only” ${/不借 `pos\.only`/.test(r241?.t || '') ? '是' : '否'}；所涉实体按种类（edge/person） ${/持有变化取 `edge`，常住变化取 `person`/.test(r241?.t || '') ? '是' : '否'}`);
const r9row = rows.find(r => r.posCodes.includes('pos.kernel'));
const r9t = v9.find(x => x.n === r9row?.n)?.t || '';
console.log(`  卷九 §2.9 写者协议行与 R24-1.1 所涉实体口径一致：${/持有变化取载荷 `edge`，常住变化取载荷 `person`/.test(r9t) && /持有变化取 `edge`，常住变化取 `person`/.test(r241?.t || '') ? '是' : '否'}`);
const v27 = L.filter(x => x.v === '卷二十七' && !x.log);
const r2789 = v27.find(x => x.t.startsWith('- **R27-8.9 '));
console.log(`  卷二十七 R27-8.9（卷二十七:${r2789?.n}）：五成分含“固定的位次代号” ${/固定的位次代号/.test(r2789?.t || '') ? '是' : '否'}；不得用计数 ${/不得用计数|不得含随机标识、墙钟、计数/.test(r2789?.t || '') ? '是' : '否'}`);
for (const p of [...posOcc.keys()].filter(p => !fixedPos.has(p))) {
  const occ = posOcc.get(p).filter(x => !x.log);
  const roll = occ.every(x => /打击序号|抽取点|骰值/.test(x.t) || /site\./.test(x.t));
  console.log(`  ${p}：不在事件 id 表；正文出现 ${occ.map(x => x.v + ':' + x.n).join(' ') || '仅记录行'}；${occ.length === 0 ? '已退役（只见于修订记录）' : roll ? '属骰值键对象段/抽取点位次，不是事件 id 位次，与事件 id 位次代号不同命名空间' : '需人工'}`);
}
console.log(`② 小计：共用位次的行组可能撞号 ${collide} 组`);

// ---------- ③ 行上必写栏 ----------
// 栏名一律从定义处读：表 B / 表 C 定义表的 onUnknown 与“行上必写”、C24-12 行列出的栏、词表族 due_kind 定义表的“行上必写”。
// 登记处（site）：§2 至 §5 与“附 术语与代号表”里、非配合/问题编号行上，按登记句式认出的动词行、事件类型行、due_kind 行。
// 某栏算“写了”：该栏名（ASCII 词边界）出现在登记行本身，或出现在同卷同一 ### 节里谈同一张表的行上；
// 一卷有多处登记时按全卷合看（代号表 + 正文登记节常分两处）。散文判定是启发式，结果供人工逐条核。
console.log('\n== ③ 行上必写栏（表 B、表 C、due_kind）');
const cellsOf = t => t.split('|').slice(1, -1).map(s => s.trim());
const namesIn = s => [...s.matchAll(/`([A-Za-z][A-Za-z0-9]*)`/g)].map(m => m[1]);
function defTableAfter(anchorRx) {
  const i0 = L.findIndex(x => !x.log && anchorRx.test(x.t));
  if (i0 < 0) return null;
  let i = i0 + 1;
  while (i < L.length && L[i].f === L[i0].f && !L[i].t.startsWith('|')) i++;
  const head = cellsOf(L[i].t); i += 2;
  const rows = [];
  for (; i < L.length && L[i].f === L[i0].f && L[i].t.startsWith('|'); i++) rows.push({ x: L[i], c: cellsOf(L[i].t) });
  return { at: L[i0], head, rows };
}
const fieldWord = f => new RegExp('(?<![A-Za-z0-9_.])' + f + '(?![A-Za-z0-9_.])');
const defB = defTableAfter(/^\*\*表 B 动词行/);
const defC = defTableAfter(/^\*\*表 C `event_type` 行/);
const defDue = defTableAfter(/^词表族 `due_kind`/);
const c12 = L.find(x => !x.log && /^\| C24-12 \|/.test(x.t));
let missTotal = 0, listedTotal = 0;
if (!defB || !defC || !defDue || !c12) {
  console.log(`定义处缺：表 B ${!!defB}、表 C ${!!defC}、due_kind ${!!defDue}、C24-12 ${!!c12} → ③ 不判`); missTotal = -1;
} else {
  const col = (d, name) => d.head.indexOf(name);
  const reqByDef = (d) => {
    const iu = col(d, 'onUnknown'), id = col(d, '取值域'), out = [];
    // 条件必写：取值域写“`X` 为 `v` 时……”的栏，只在该行写了取值 v 时才必写（如 `onVerbs`、`subjectFrom` 只在 `mode` 为 `onEvent` 时）
    for (const r of d.rows) { const cm = (r.c[id] || '').match(/`([A-Za-z]\w*)` 为 `([A-Za-z]\w*)` 时/);
      for (const nm of namesIn(r.c[0])) out.push({ nm, err: r.c[iu] === 'error', must: /行上必写/.test(r.c.join('|')), cond: cm ? { on: cm[1], val: cm[2] } : null }); }
    return out;
  };
  const bDef = reqByDef(defB), cDef = reqByDef(defC), dueDef = reqByDef(defDue);
  const c12t = c12.t;
  const seg = (a, b) => { const i = c12t.indexOf(a); const j = i < 0 ? -1 : c12t.indexOf(b, i + a.length); return i < 0 || j < 0 ? '' : c12t.slice(i + a.length, j); };
  const c12B = namesIn(seg('表 B 的', '与表 C 的'));
  const c12C = namesIn(seg('与表 C 的', '都是行上必写'));
  const c12Bx = namesIn(seg('动词行逐行补', '与上列表 B 各栏'));
  const c12Due = namesIn(seg('`due_kind` 的卷另须逐行补', '（'));
  const bErr = bDef.filter(r => r.err).map(r => r.nm);
  const REQ_B = [...new Set([...bErr, ...c12B, ...c12Bx])].filter(n => bDef.some(r => r.nm === n));
  // 表 C 必写栏（2026-11-15 扩，只核 chk-1115-j35）：表 C 定义表 onUnknown 为 error 的全部栏，并上 C24-12 所列；
  // 原只取 C24-12 所列六栏，漏了 startVerb/stageVerb/endVerb、mode、polarity、scopeKind、stageFlow 等缺即加载失败的栏
  const cErr = cDef.filter(r => r.err).map(r => r.nm);
  const REQ_C = [...new Set([...cErr, ...c12C])].filter(n => cDef.some(r => r.nm === n));
  const COND_C = Object.fromEntries(cDef.filter(r => r.cond).map(r => [r.nm, r.cond]));
  const REQ_DUE = dueDef.filter(r => r.must).map(r => r.nm);
  console.log(`表 B 定义（${defB.at.v}:${defB.at.n}）onUnknown=error 的栏：${bErr.join('、')}`);
  console.log(`C24-12（${c12.v}:${c12.n}）列为行上必写的表 B 栏：${c12B.join('、')}；“动词行逐行补”另列：${c12Bx.join('、')}`);
  console.log(`  两处对照：定义为 error 而 C24-12 未列 {${bErr.filter(n => !c12B.includes(n) && !c12Bx.includes(n)).join('、') || '无'}}；C24-12 列而定义非 error {${[...c12B, ...c12Bx].filter(n => !bErr.includes(n)).map(n => n + '(' + (bDef.find(r => r.nm === n)?.err === false ? '定义为 gap/nullable' : '定义表无此栏') + ')').join('、') || '无'}}`);
  console.log(`→ 表 B 必写栏 ${REQ_B.length}：${REQ_B.join('、')}`);
  console.log(`表 C 定义（${defC.at.v}:${defC.at.n}）；C24-12 列的表 C 栏：${c12C.join('、')}；其中定义表有“行上必写”或 error 的 ${c12C.filter(n => cDef.some(r => r.nm === n && (r.must || r.err))).length}/${c12C.length}`);
  console.log(`表 C 定义 onUnknown=error 的栏 ${cErr.length}；C24-12 列而定义非 error 的 {${c12C.filter(n => !cErr.includes(n)).join('、') || '无'}}`);
  console.log(`→ 表 C 必写栏 ${REQ_C.length}：${REQ_C.join('、')}；其中条件必写 ${Object.entries(COND_C).map(([k, c]) => `${k}（${c.on} 为 ${c.val} 时）`).join('、') || '无'}`);
  console.log(`due_kind 定义（${defDue.at.v}:${defDue.at.n}）“行上必写”的栏：${REQ_DUE.join('、')}；C24-12 另列 ${c12Due.join('、') || '—'}`);

  // 登记可能出现的二级节：排除卷首、读法、总述、扩展性测试、开放问题、迁移、验收断言与各附录（代号表、术语对照除外）。
  // 用排除法是为了同样认得卷二那种“## 一 …”“## 二 …”编号的卷。
  const OKSEC = x => { const h = x.h2 || ''; return !/§0 |§1 |卷首|读法|本卷的十个结论|领域总述|设计目标|扩展性测试|开放问题|迁移|验收/.test(h) && (!/^## 附/.test(h) || /术语/.test(h)); };
  // 配合项、问题、迁移、断言、勘误请求等编号行（首格是字母或一两个汉字前缀加编号，如 C24-12、勘11）：是请求或记账，不是登记
  const REQROW = /^\|\s*((C|Q|T|X|A|M|S|B|G|D|E|R|N|K|P|F)\d+[A-Za-z]?-?\d*|[一-龥]{1,2}\d+[a-z]?\s*\|)/;
  // 三级节是“本卷读取/使用别卷”“需别卷配合”“回填请求”“各卷指给本卷”的：读者侧与请求侧，不是本卷的登记处
  // （2026-11-15 脚本误报修正：卷九 §5.2、§5.3 订阅与勘误请求行曾被当作本卷散文登记）
  const NONREG_H3 = /本卷(读取|使用)|别卷配合|回填请求|指给本卷/;
  const defLines = new Set([defB, defC, defDue].flatMap(d => [d.at, ...d.rows.map(r => r.x)]));
  const usable = x => !x.log && OKSEC(x) && !NONREG_H3.test(x.h3 || '') && !REQROW.test(x.t) && !defLines.has(x);
  // ---- 登记句与“引用/订阅说明”的区分（2026-11-15 脚本误报修正；以卷二十四表 B 的登记位为准：动词行由登记卷自登记，
  //      登记处是该卷自己的 §2 或代号表；别卷的登记、本卷订阅别卷的动词、指向本卷另一节的指针都不是登记行本身）。
  //      一处登记句式命中算“引用”，当且仅当满足下列之一：
  //      (甲) 他卷归属：命中所在分句（按 ；。| 切）在命中之前点名了别卷（非本卷、非该表的定义卷）、命中之前没有“本卷”，
  //           且该分句没有本卷登记或本卷发出的说法；
  //      (乙) 他卷注释：命中落在“卷X[ §n]（…）”紧随的括注里（X 非本卷），即对所指别卷内容的注释；
  //      (丙) 订阅：命中所在句（按 。切）写“订阅”，且无本卷登记或本卷发出的说法。
  //      一行的全部命中都是引用时，该行不作登记处。
  const VOLNAME = /卷([零一二三四五六七八九十]+)(b|甲|乙)?/g;
  const OWNREG = /本卷(自行|自)?登记|由本卷[^。；|]{0,6}登记|本卷发出|本卷发一?条/;
  const sameVol = (name, v) => name === v || (/^卷三$/.test(name) && /^卷三[甲乙]$/.test(v));
  function refAt(t, i, v, owner) {
    const cs = t.lastIndexOf('|', i) + 1; let ce = t.indexOf('|', i); if (ce < 0) ce = t.length;
    const cell = t.slice(cs, ce), j = i - cs;
    const sb = Math.max(cell.lastIndexOf('。', j - 1), -1) + 1; let se = cell.indexOf('。', j); if (se < 0) se = cell.length;
    const sent = cell.slice(sb, se);
    if (/订阅/.test(sent) && !OWNREG.test(sent)) return '丙';
    const cb = Math.max(cell.lastIndexOf('；', j - 1), cell.lastIndexOf('。', j - 1)) + 1; let cE = cell.slice(j).search(/[；。]/); cE = cE < 0 ? cell.length : j + cE;
    const clause = cell.slice(cb, cE), k = j - cb;
    if (!OWNREG.test(clause) && !/本卷/.test(clause.slice(0, k)) && [...clause.slice(0, k).matchAll(VOLNAME)].some(m => !sameVol(m[0], v) && m[0] !== owner)) return '甲';
    // (乙) 向前找未闭合的“（”，看它是否紧跟别卷名（可带 §节号）
    let depth = 0;
    for (let p = j - 1; p >= 0; p--) {
      const ch = cell[p];
      if (ch === '）') depth++;
      else if (ch === '（') { if (depth) { depth--; continue; } const m = cell.slice(Math.max(0, p - 20), p).match(/(卷[零一二三四五六七八九十]+(?:b|甲|乙)?)(\s*§[\d.]+[^（）]{0,6})?\s*$/); if (m && !sameVol(m[1], v)) return '乙'; }
    }
    return '';
  }
  const allRef = (x, rx, owner) => { const ms = [...x.t.matchAll(new RegExp(rx.source, 'g'))]; return ms.length > 0 && ms.every(m => refAt(x.t, m.index, x.v, owner)); };
  // 指针：登记句后紧跟本卷节号（“本卷登记的 verb 族条目（§2.10）”“动词由本卷登记，§2.5”），登记单元改取被指的那一节
  // 只认指针所说的对象是动词（verb 族条目、事件动词、动词行）；“本卷登记到表 B 的字段，§2.1”之类说的是字段，不是动词登记处
  const PTR = /(?:动词|verb 族条目)[^。；|（）§卷]{0,6}?由本卷(?:自行|自)?登记[，、]\s*§(\d+(?:\.\d+)*)|本卷(?:自行|自)?登记的\s*(?:verb 族条目|事件动词|动词行?)\s*（\s*§(\d+(?:\.\d+)*)）/;
  const secRx = num => new RegExp('^#{2,5}\\s+§?' + num.replace(/\./g, '\\.') + '(\\s|（|$)');
  function pointed(x) {
    const m = x.t.match(PTR); if (!m) return null;
    const num = m[1] || m[2]; const rx = secRx(num); const i0 = L.findIndex(y => y.f === x.f && rx.test(y.t)); if (i0 < 0) return null;
    const lvl = L[i0].t.match(/^#+/)[0].length, out = [];
    for (let i = i0 + 1; i < L.length && L[i].f === x.f; i++) { const h = L[i].t.match(/^(#+)\s/); if (h && h[1].length <= lvl) break; if (!L[i].log && L[i].t.trim()) out.push(L[i]); }
    return out.length ? { sec: '§' + num, lines: out } : null;
  }
  // 指针行本身仍在单元里，另加被指的节
  // “下表……”：登记句所说的就是紧随其后（同一 ### 节内）的那张表，表头与各数据行并入单元（2026-11-15 判取值后补）
  const nextTable = x => { const out = []; let i = x.i + 1; while (i < L.length && L[i].f === x.f && L[i].h3 === x.h3 && !L[i].t.startsWith('|')) i++; while (i < L.length && L[i].f === x.f && L[i].t.startsWith('|')) out.push(L[i++]); return out; };
  const expandPtr = ss => { const out = new Set(), how = []; for (const s of ss) { out.add(s); const p = pointed(s); if (p) { p.lines.forEach(y => out.add(y)); how.push(`${s.n}→${p.sec}`); } if (/下表/.test(s.t)) nextTable(s).forEach(y => out.add(y)); } return { lines: [...out], how }; };
  // 同卷同 ### 节的行索引；表格行回溯到表头（栏名常写在表头）
  const bySec = new Map();
  L.forEach((x, i) => { x.i = i; const k = x.f + '\u0000' + x.h3; if (!bySec.has(k)) bySec.set(k, []); bySec.get(k).push(x); });
  const tableHead = x => {
    if (!x.t.startsWith('|')) return null;
    let i = x.i; while (i > 0 && L[i - 1].f === x.f && L[i - 1].t.startsWith('|')) i--;
    return L[i];
  };
  // 一个登记单元“写了哪些栏”：单元各行与其表头；单元行在 K.expand 所列的二级节内的，再加同卷同 ### 节里
  // 谈同一张表（K.ctx）的行与其表头。“附”节（代号表）只看单元行本身。
  function poolOf(K, lines) {
    const pool = new Set();
    const put = y => { pool.add(y); const h = tableHead(y); if (h) pool.add(h); };
    for (const s of lines) {
      put(s);
      if (!K.expand.test(s.h2 || '')) continue;
      // 单元行是表格行时，同一张表的别的数据行是别的登记行，不借它们的栏（表头另由 put 带上）
      const sh = tableHead(s);
      for (const y of bySec.get(s.f + '\u0000' + s.h3) || []) if (!y.log && (K.ctx.test(y.t) || (K.rowJson && K.rowJson(y.t))) && !(sh && y !== s && y !== sh && tableHead(y) === sh)) put(y);
    }
    return pool;
  }
  const has = (pool, f) => [...pool].some(y => fieldWord(f).test(y.t)); // 只测栏名出现：用于分档（是不是表 C 行），不用于判"写了"
  // ---- 判"该栏有取值"（2026-11-15 单核 chk-1115-j356-2：原以栏名出现即判齐，“`triggerRX` 未写”也算齐）----
  // 一栏算写了，当且仅当单元某处给出了它的取值，三种写法：
  //  (1) 表格列：单元所在表的表头有一格就是该栏名，单元数据行该列的格非空且不是占位；
  //  (2) 表格键值行：一格只写该栏名，紧接的下一格非空且不是占位；
  //  (3) 行内：栏名之后（可隔一个括注；“`a`、`b` 与 `c` 取……”这种并列先跳过同列的其他栏名）紧跟取值：
  //      JSON `"栏": 值`、`栏: 值`、`栏 = 值`，连接词 取/为/填/写/是/按/读/引/沿用/照/依次/各取 之后的取值，或直接跟取值
  //      （反引号片段、真/假、null、空、数字、[ 或 {）。取值以占位开头的不算：未定、待定、待补、待裁、未写、未填、不填、没有、推不出、
  //      无法、空缺、暂缺、—、？。取值为空须显式写 null、`[]`、`{}` 或“空”。
  //      连接词前可隔至多二十四字（不跨 ，。；| 与括号）的范围说明（“`scandal` 八行都取假”“`headSlot` 均为 null”“除掠夺、焚毁两行外一律写空表”）；括注可嵌套；
  //      “行上必写/必填/须写”是对栏的要求不是取值，其后带冒号给出的（“行上必写：谎言揭穿取真”）才算；“即 X”“含 X”“列 X”算取值。
  const PH = /^\s*[`"]?\s*(未定|待|待补|待裁|未写|未填|不填|没有|推不出|无法|空缺|暂缺|尚未|行上必写|必写|必填|须写|须填|—|–|？|\?|TBD)/;
  const cellOk = c => { const s = (c || '').trim(); return s !== '' && !/^[-—–]+$/.test(s) && !PH.test(s); };
  const DIRECT = /^\s*(`[^`]+`|真|假|null|空(?!缺)|-?\d|\[|\{|"[^"]*")/;
  const CONN = /^\s*(?:[:=：]|取值?为?|为|填(?:写|作)?|写(?:作|成|为)?|是|即|含|列(?:出|为)?|按|读|引|沿用|照|依次(?:取|为)?|各(?:取|为|引|是)|对应)/;
  const SCOPED = new RegExp('^\\s*[^，。；|（）]{1,24}?' + CONN.source.replace(/^\^\\s\*/, ''));
  function inlineVal(t, f) {
    const re = new RegExp('(?<![A-Za-z0-9_.])' + f + '(?![A-Za-z0-9_.])', 'g');
    for (const m of t.matchAll(re)) {
      let r = t.slice(m.index + f.length);
      if (/^"\s*:/.test(r)) { if (cellOk(r.replace(/^"\s*:\s*/, ''))) return true; continue; } // JSON
      r = r.replace(/^`/, '');
      if (/^\s*[:=]/.test(r)) { const v = r.replace(/^\s*[:=]\s*/, ''); if (cellOk(v) && !/^[|，。；]/.test(v)) return true; continue; } // `栏: 值` / `栏 = 值`
      for (let k = 0; k < 6; k++) { const n = r.match(/^\s*(?:、|与|和|及|\/)\s*`[A-Za-z][A-Za-z0-9]*`/); if (!n) break; r = r.slice(n[0].length); } // 并列栏名
      if (/^\s*（/.test(r)) { let d = 0, i = r.indexOf('（'); for (; i < r.length; i++) { if (r[i] === '（') d++; else if (r[i] === '）' && --d === 0) break; } if (i < r.length) r = r.slice(i + 1); } // 一个括注（可嵌套）
      r = r.replace(/^\s*(行上必写|必写|必填)\s*[：:]/, '');
      if (PH.test(r)) continue; // “`triggerRX` 未写”
      let v = null;
      // 次序：紧跟的连接词 → 紧跟的取值 → 隔范围说明的连接词
      let c = r.match(CONN); if (c) v = r.slice(c[0].length); else if (DIRECT.test(r)) v = r; else if ((c = r.match(SCOPED))) v = r.slice(c[0].length);
      if (v === null) continue;
      // “`stageFlow` 与 `stages` 逐段对应，……”：以对应关系给出取法，关系本身就是取值，后接标点也算
      if (c && /对应$/.test(c[0]) ? !PH.test(v.replace(/^\s*[，：:]/, '')) : cellOk(v) && !/^\s*[|，。；]/.test(v)) return true;
    }
    return false;
  }
  function hasVal(pool, f) {
    const fw = fieldWord(f);
    for (const y of pool) {
      if (!fw.test(y.t)) continue;
      if (y.t.startsWith('|')) {
        const cs = cellsOf(y.t);
        const hi = cs.findIndex(c => c.replace(/`/g, '').trim() === f);
        if (hi >= 0 && tableHead(y) === y) { // (1) 表头列
          // 单元自己的数据行在池里时只看它们；单元是散文登记段（池里只有表头）时，看该表的数据行，有一行该列有值即算（各行另按带代号动词逐行核）
          const isData = z => z !== y && tableHead(z) === y && !/^\|[\s|:-]+\|?$/.test(z.t);
          const own = [...pool].filter(isData);
          const rows = [];
          if (!own.length) for (let i = y.i + 1; i < L.length && L[i].f === y.f && L[i].t.startsWith('|'); i++) if (isData(L[i])) rows.push(L[i]);
          if (own.length ? own.some(z => cellOk(cellsOf(z.t)[hi])) : rows.some(z => cellOk(cellsOf(z.t)[hi]))) return true;
          continue;
        }
        if (hi >= 0 && cellOk(cs[hi + 1])) return true; // (2) 键值行
      }
      if (inlineVal(y.t, f)) return true; // (3)
    }
    return false;
  }
  const NOTREG = /不(登记|另登|另立)[^。；|]{0,8}`?(due_kind|verb)`?/;
  // 表 C 独有的栏（表 C 定义里有、表 B 定义里没有）：散文自称“事件类型行”而一栏表 C 字段都没写的，判不了是表 C 行还是动词行旧称
  const C_ONLY = [...new Set(cDef.map(r => r.nm))].filter(n => !bDef.some(r => r.nm === n));
  const DECL_C = /(?<!不)(是|为)(卷二十四的)?(一条)?事件类型行(?!上)/;
  // 表 C 的散文登记句式（句式命中再经引用判别；表格行首格的结构判据不经判别）
  const CPHRASE = new RegExp(DECL_C.source + '|本卷[^。；|]{0,12}登记[^。；|]{0,12}事件(类型)?行|事件类型表（卷二|灾异行补');
  const KINDS = [
    { key: 'B', name: '动词行（表 B）', req: REQ_B, ctx: /表 B|动词行/, expand: /^## §2 /,
      // 散文登记句（未带固定代号的动词，如“事件动词（登记到卷二十四…）：甲、乙、丙”）
      // 句式命中后再经引用判别（他卷归属、他卷注释、订阅），全部命中都是引用的行不作登记处
      site: x => { const rx = /verb 族(的)?条目|`verb`（卷二十四|事件动词\**（(verb 族条目，)?登记到卷二十四|动词行(的)?表 ?B|按卷二十四表 B 登记|动词是 verb 族条目|本卷(自)?登记(的)?[^，。；|]{0,12}(事件)?动词(行)?[：:（]|[一二三四五六七八九十两]个事件动词/;
        return rx.test(x.t) && !allRef(x, rx, defB.at.v); } },
    { key: 'C', name: '事件类型行（表 C）', req: REQ_C, cond: COND_C,
      // 同节的数据实例（JSON 行写出至少三个表 C 栏键）就是该行的取值，并入单元
      rowJson: t => REQ_C.filter(f => t.includes('"' + f + '":')).length >= 3, ctx: /表 C|事件类型行|`event_type`|局势种类|灾异行/, expand: /^## §[24] /,
      // 定义卷只认表格行；“卷X 登记一条事件类型行”而 X 不是本卷的，是在转述别卷，不算本卷登记处
      site: x => (x.v !== defC.at.v || x.t.startsWith('|')) && ![...x.t.matchAll(/(卷[一二三四五六七八九十零]+b?)[^，。；|卷]{0,6}登记[^。；|]{0,8}事件类型行/g)].some(m => m[1] !== x.v) && (
        /^事件类型行$/.test(cellsOf(x.t)[1] || '') || (CPHRASE.test(x.t) && !allRef(x, CPHRASE, defC.at.v))
        || (/^\| 卷二十四/.test(x.t) && (/事件类型(行|表)|局势种类/.test(cellsOf(x.t)[0]) || /^(登记)?事件类型行[：；]/.test(cellsOf(x.t)[1] || '')))) },
    { key: 'D', name: 'due_kind 行', req: REQ_DUE, ctx: /`due_kind`|roles\.dues/, expand: /^## §2 /,
      // 写法：§2.5 式“| 卷二十 `due_kind` | 条目 |”；“本卷登记的到期项代号”；卷二十接收清单“- 卷X（…）：…N 行 `due_kind`”；
      // 以及同行写出 `due_kind` 与具体 due_ 代号的登记句
      site: x => !NOTREG.test(x.t) && (/^卷\S+ `due_kind`$/.test(cellsOf(x.t)[0] || '')
        || /本卷登记的到期项代号/.test(x.t) || /^- 卷.*[一二三四五六七八九十两\d]+行 `due_kind`/.test(x.t)
        || (/`due_kind`/.test(x.t) && /`due_(?!kind`)[a-z][a-z_]*`/.test(x.t))) },
  ];
  // 已入清单（只核 chk-1115-r31 修订）：按（卷、单元、栏）三元组对照待裁清单与甲-0 缺栏清单的条目（每行一条）。
  //  单元的标识 = 其代号/句柄（带代号动词）与其行号；条目对本卷的引用 = 条目里写到的该卷行号（“卷X:N”“卷X:N–M”“卷X …行 a,b”，
  //  容许 ±3 行漂移）与写到的动词代号/句柄。
  //  · 条目引用到本单元：条目点名了该栏，或条目一栏都没点名（“动词行无代号与载荷，需设计”“缺表 B 全部 12 栏”这类整行条目）→ 对上；
  //  · 条目对本卷有引用但都不是本单元 → 不对上（如死因动词条目只点卷八b `lethal`，不标卷八b 其余动词）；
  //  · 条目对本卷没有任何行号或代号引用 → 按（卷、栏）对：条目点名了该栏才对上（如“卷十五天劫……的 family、allowedTargets”）。
  const readList = n => { for (const p of [path.join(ROOT, '审查', n), 'F:/dnd/docs/统一底层设计/审查/' + n]) { try { return fs.readFileSync(p, 'utf8').split(/\r?\n/); } catch {} } return []; };
  const PENDING = [...readList('全书加载修复批-待裁清单.md'), ...readList('全书加载修复批-甲0-缺栏清单.md')];
  const volRx = v => new RegExp(v + '(?![一二三四五六七八九十零b甲乙])', 'g');
  const ALLF = [...new Set([...REQ_B, ...REQ_C, ...REQ_DUE])];
  function entryRefs(l, v) { // 条目对卷 v 的行号区间与代号
    const spans = [], codes = new Set();
    for (const m of l.matchAll(volRx(v))) {
      const rest = l.slice(m.index + v.length).split(/[|]|(?=卷[零一二三四五六七八九十])/)[0];
      for (const k of rest.matchAll(/^[:：](\d+)(?:\s*[–\-—]\s*(\d+))?((?:\s*[、,，]\s*\d+)*)/g)) { spans.push([+k[1], +(k[2] || k[1])]); for (const d of (k[3] || '').matchAll(/\d+/g)) spans.push([+d[0], +d[0]]); }
      for (const k of rest.matchAll(/行\s*((?:\d+\s*[,，、]\s*)*\d+)/g)) for (const d of k[1].matchAll(/\d+/g)) spans.push([+d[0], +d[0]]);
      for (const k of rest.matchAll(/`(?:roles\.verbs\.)?([A-Za-z][A-Za-z0-9_]*)`/g)) if (H.has(k[1]) || C.has(k[1])) codes.add(k[1]);
    }
    return { spans, codes };
  }
  const listed = (v, unit, f) => PENDING.some(l => {
    if (!volRx(v).test(l)) return false;
    const { spans, codes } = entryRefs(l, v);
    const named = ALLF.filter(x => fieldWord(x).test(l));
    if (!spans.length && !codes.size) return named.includes(f);
    // 行号先比精确；只有清单所写的行在现行卷文里已不是登记行（行号漂移了）时才容许 ±3（卷三乙 1917→1919），
    // 免得写着 1360 的条目借给相邻的 1361
    const drifted = n => { const x = L.find(y => y.v === v && y.n === n); return !x || !KINDS.some(K => K.site(x)); };
    const hit = (unit.codes || []).some(c => codes.has(c)) || (unit.lines || []).some(n => spans.some(([a, b]) => (n >= a && n <= b) || (drifted(a) && n >= a - 3 && n <= b + 3)));
    return hit && (named.includes(f) || named.length === 0);
  });
  const byGroup = new Map();
  const note = (v, s) => { if (!byGroup.has(v)) byGroup.set(v, []); byGroup.get(v).push(s); };
  const report = (K, v, label, lines, extraPool = [], codes = []) => {
    const unit = { codes, lines: lines.map(x => x.n) };
    const pool = poolOf(K, lines); for (const y of extraPool) pool.add(y);
    // 条件必写栏：本单元把条件栏赋为触发取值（`mode` 取/为/=/： `onEvent`、JSON "mode": "onEvent"）才算必写；只在说明里提到该取值不算
    const condRx = c => new RegExp('[`"]' + c.on + '[`"]?\\s*(?:取|为|=|：|:)\\s*[`"]?' + c.val + '(?![A-Za-z0-9_])');
    const need = f => !K.cond?.[f] || [...pool].some(y => condRx(K.cond[f]).test(y.t));
    const miss = K.req.filter(f => need(f) && !hasVal(pool, f));
    missTotal += miss.length;
    // 缺栏照计；清单已记着的（按上面三元组对上）标“已入清单”（李白 11-15 第 31 条）
    const tagged = miss.map(f => f + (listed(v, unit, f) ? '（已入清单）' : ''));
    const nListed = miss.filter(f => listed(v, unit, f)).length;
    listedTotal += nListed;
    miss.unit = unit;
    if (miss.length) note(v, `${K.key}:${label}缺${miss.length}${nListed ? `（其中已入清单 ${nListed}）` : ''}`);
    console.log(`  [${miss.length ? '缺栏' : '齐'}] ${v} ${label} 行 ${lines.map(x => x.n).join(',')}${miss.length ? `：缺 ${tagged.join('、')}` : ''}`);
    miss.pool = pool;
    return miss;
  };
  const codeOnly = (x, k) => { // 该行里 k 只出现在含比较、分支写法的代码片段里（示例代码，不是登记）
    const spans = [...x.t.matchAll(/`[^`]+`/g)].map(m => m[0]).filter(s => s.includes(k));
    return spans.length > 0 && spans.every(s => /===|switch \(|case /.test(s)) && !x.t.replace(/`[^`]+`/g, '').includes(k);
  };
  // 表 C 登记处先分两档：写了表 C 独有栏的、或明说“X 是（一条）事件类型行”的计入 ③C；其余为“旧称”档
  const KC = KINDS.find(k => k.key === 'C');
  const cSites = L.filter(x => usable(x) && KC.site(x));
  const strongC = cSites.filter(s => C_ONLY.some(f => has(poolOf(KC, [s]), f)) || DECL_C.test(s.t));
  const weakC = cSites.filter(s => !strongC.includes(s));
  const retiredSet = new Set(); // ③B 判出的已撤销代号，供 ③C 核三栏所指动词
  for (const K of KINDS) {
    console.log(`\n-- ③${K.key} ${K.name}：必写栏 ${K.req.length}`);
    const sites = L.filter(x => usable(x) && K.site(x));
    if (K.key === 'B') {
      // 散文登记处（按卷）：既单独报，也作该卷带代号动词的共同取值来源（一卷多处登记合看）
      const proseByVol = new Map();
      for (const s of sites) { if (!proseByVol.has(s.v)) proseByVol.set(s.v, []); proseByVol.get(s.v).push(s); }
      // 共同取值只认 §2 的散文登记处（“各行共同取值”段落都在 §2；§4 规则里的单个动词说明不外推到全卷）
      const prosePool = v => [...poolOf(K, (proseByVol.get(v) || []).filter(s => K.expand.test(s.h2 || '')))];
      const covered = new Set();
      // 登记卷：① 判出唯一的取之；判出多卷或未抽到时，在候选卷（① 的登记卷，未抽到则取全部出现卷）里取
      // 在 §2 或“附 术语与代号表”写到它的卷，恰一卷即定，否则需人工
      const DEFSEC = x => /^## (§2 |附 术语与代号表)/.test(x.h2 || '');
      // (a) 带固定代号或句柄的动词：按 ① 判出的登记卷，取该卷正文里写到它的行
      const unres = [], examples = [], templates = [], retired = [];
      const RETIRE = /撤销|撤下|删去|退役|作废|废止/;
      const retiredIn = (x, k) => x.t.split(/(?<=[。；])/).filter(s => s.includes(k)).every(s => RETIRE.test(s));
      for (const r of results) {
        let regs = r.reg.map(s => s.replace('(唯一出现卷)', ''));
        const occ = (r.form === 'handle' ? H.get(r.name) : C.get(r.name)) || [];
        const label = `${r.form === 'handle' ? 'roles.verbs.' : ''}${r.name}`;
        // 模板前缀：代号以 _ 结尾（“`verb_x_` 后接用度类”“`verb_x_<类>`”），是一族代号的命名前缀，不是单独一个动词，
        // 其登记随同族具体代号核（与盲区扫描 norm 的“前缀”口径相同；2026-11-15 脚本误报修正）
        if (r.form === 'code' && r.name.endsWith('_')) { templates.push(`${label}（${occ.filter(x => !x.log).map(x => x.v + ':' + x.n).join(' ')}）`); continue; }
        let how = '';
        if (regs.length !== 1) {
          const cand = regs.length ? regs : [...new Set(occ.filter(x => !x.log).map(x => x.v))];
          const inDef = cand.filter(v => occ.some(x => x.v === v && !x.log && DEFSEC(x)));
          if (inDef.length === 1) { how = `（登记卷按 §2/代号表定；候选 ${cand.join('、')}）`; regs = inDef; }
          else {
            // 判不出登记卷：逐个候选卷算一遍缺栏，只列不计数，供人工定登记卷后照用
            const per = cand.map(v => { const ls = occ.filter(x => x.v === v && usable(x)); if (!ls.length) return `${v}(无可登记节的行)`; const pool = poolOf(K, ls); prosePool(v).forEach(y => pool.add(y)); const m = K.req.filter(f => !hasVal(pool, f)); return `${v}:${ls.map(x => x.n).join(',')} 缺${m.length}${m.length && m.length < K.req.length ? '[' + m.join('、') + ']' : ''}`; });
            unres.push(`${label}{① 登记卷 ${r.reg.join('、') || '未抽到'}；§2/代号表写到的卷 ${inDef.join('、') || '无'}；各候选卷 ${per.join(' ')}}`); continue;
          }
        }
        const v = regs[0];
        let lines = occ.filter(x => x.v === v && usable(x));
        if (!lines.length) lines = occ.filter(x => x.v === v && !x.log);
        if (!lines.length) { unres.push(`${label}{${v} 无正文行}`); continue; }
        // 已撤销：该卷写到它的每一句都是撤销/删去说明（“两个代号随之撤销”），不是登记（2026-11-15 脚本误报修正）
        if (lines.every(x => retiredIn(x, r.name))) { retiredSet.add(r.name); retired.push(`${label}（${lines.map(x => x.v + ':' + x.n).join(' ')}）`); continue; }
        lines.forEach(x => covered.add(x));
        if (lines.every(x => codeOnly(x, r.name))) { examples.push(`${label}（${lines.map(x => x.v + ':' + x.n).join(' ')}）`); continue; }
        report(K, v, `动词 ${label}${how}`, [...new Set(lines)], prosePool(v), [r.name]);
      }
      console.log(`  登记卷未定（① 判不出唯一登记卷，需人工，不计数）：${unres.length ? '' : '无'}`);
      for (const u of unres) console.log(`    [需人工] ${u}`);
      console.log(`  只见于示例代码（不计数）：${examples.join('；') || '无'}`);
      console.log(`  模板前缀写法（不单列，随同族具体代号核）：${templates.join('；') || '无'}`);
      console.log(`  已撤销的代号（登记卷写到它的句子都是撤销说明，不计数）：${retired.join('；') || '无'}`);
      // (b) 散文登记处：已归入 (a) 某个带代号动词的行不再单报；指向本卷另一节的登记句改取被指的节
      const done = new Set();
      for (const [v, ss] of proseByVol) {
        const rest = ss.filter(s => !covered.has(s)); if (!rest.length) continue;
        const { lines, how } = expandPtr(rest); const ls = lines.filter(y => !covered.has(y));
        if (!ls.length) continue;
        ls.forEach(y => done.add(y));
        report(K, v, `散文登记（未带代号的动词）${how.length ? '（指针 ' + how.join(' ') + '）' : ''}`, ls);
      }
      // (c) 旧称“事件类型行”、一栏表 C 字段都没写的登记（多为“本卷发出的各事件”清单）：不论日后判为表 C 行与否，
      //     所列事件各须有动词行，先按动词行核表 B；是否另有表 C 行见 ③C 的需人工清单
      const weakByVol = new Map();
      for (const s of weakC) { if (covered.has(s)) continue; if (!weakByVol.has(s.v)) weakByVol.set(s.v, []); weakByVol.get(s.v).push(s); }
      for (const [v, ss] of weakByVol) {
        // 指针所指的节里已有上面报过的登记单元（散文登记或带代号动词）时，指针就是指向那个单元，并入不另计
        const { lines, how } = expandPtr(ss); const hit = how.length && lines.some(y => (covered.has(y) || done.has(y)) && !ss.includes(y));
        const ls = hit ? [] : lines.filter(y => !covered.has(y) && !done.has(y));
        if (!ls.length) { console.log(`  [并入] ${v} 旧称事件类型行 行 ${ss.map(x => x.n).join(',')} 指针 ${how.join(' ')} 所指节已在上面按登记单元核`); continue; }
        report(K, v, `旧称事件类型行（按动词行核）${how.length ? '（指针 ' + how.join(' ') + '）' : ''}`, ls, prosePool(v));
      }
    } else if (K.key === 'C') {
      // 三栏所指动词（2026-11-15 扩，只核 chk-1115-j35）：哪几栏要指 kindOnly 动词行，从表 C 定义的取值域读（写“`kindOnly` 为真”的栏）；
      // 本单元写了该栏时，抽出所指动词（`栏` 取/为/=/： `roles.verbs.X` 或 `verb_x`），核三件：抽得到、该动词在全书有登记（不是已撤销）、
      // 其登记写着 kindOnly 为真（登记行“三行 `kindOnly`”句式，或同一格写 `kindOnly` 为真/取真/true）。每一处不成立计 1 处缺栏。
      const KO_COLS = defC.rows.filter(r => /`kindOnly` 为真/.test(r.c[col(defC, '取值域')] || '')).flatMap(r => namesIn(r.c[0]));
      const verbOcc = name => H.get(name) || C.get(name) || [];
      const KOTRUE = /`kindOnly`[^。；|`]{0,8}(为真|取真|真|[=:：]\s*`?true`?)/;
      const KOFALSE = /kindOnly`[^。；|`]{0,8}(为假|取假|假|false)/;
      // 表格行首格（行的主语格）标明 `kindOnly`（如“| 子类型动词（`kindOnly`） | `verb_a`、`verb_b` |”）时，同行所列代号都算
      const isKO = name => kindOnlySet.has(name) || verbOcc(name).some(x => !x.log && (x.t.split('|').some(c => c.includes(name) && KOTRUE.test(c) && !KOFALSE.test(c))
        || (x.t.startsWith('|') && /`kindOnly`/.test(cellsOf(x.t)[0] || '') && !KOFALSE.test(cellsOf(x.t)[0]) && cellsOf(x.t).slice(1).some(c => c.includes(name)))));
      console.log(`  三栏所指动词须为 kindOnly 行的栏（表 C 定义取值域读出）：${KO_COLS.join('、') || '无'}`);
      // 只对数据行断言（李白 11-15 裁定第 27、31 条；只核 chk-1115-r31 修订：按结构判，不以"已写出某栏取值"为门槛，全写占位的行照样是数据行）。
      // 数据行 = ① 表 C 表格的数据行：表头有一格就是表 C 栏名的表格里的非表头行；
      //          ② 登记一行的写法且写到表 C 栏（取值或占位都算）：带事件类型行的登记代号/句柄（`roles.types.*`、`etype_*`），
      //             或自述"（本卷的）X 是（卷二十四的）一条事件类型行""本卷登记进事件类型表的一行"，或首格指向表 C 定义卷的事件类型表/局势种类的表格行；
      //          ③ 数据实例（JSON 行写出至少三个表 C 栏键）。
      // 规则段 = 以上都不是的说明性段落（如"灾异行补填表 C 的字段"这种对一类行的填法规则、读取清单里的指针），只列出不断言。
      // 数据行的单元只取该行与其表头，不借同节的说明段。散文单行（②的非表格行）里三栏所指动词的代号属行数据：写了代号照核，没写不计。
      const KD = { ...K, expand: /(?!)/ };
      const sfDef = defC.rows.find(r => namesIn(r.c[0]).includes('stageFlow'));
      const sfm = (sfDef?.c.join('|') || '').match(/`catalysts` 为空的阶段 `advanceAt` 写 (\d+)、`advanceTo` 同 `onExpire`/);
      const SF_RULE = sfm ? { at: Number(sfm[1]) } : null;
      console.log(`  无催化阶段规则（表 C stageFlow 定义处）：${SF_RULE ? 'catalysts 为空 → advanceAt=' + SF_RULE.at + '、advanceTo=onExpire' : '定义处未写，不核'}`);
      const REGCODE = /`roles\.types\.[A-Za-z]+`|\betype_[a-z][a-z_]*/;
      const SELFDECL = new RegExp(DECL_C.source + '|本卷[^。；|]{0,12}登记[^。；|]{0,12}事件类型(行|表)');
      const DEFROW = s => s.t.startsWith('|') && new RegExp('^' + defC.at.v).test(cellsOf(s.t)[0] || '') && /事件类型|局势种类/.test(cellsOf(s.t)[0] || '');
      const headC = s => { const h = tableHead(s); return s.t.startsWith('|') && h && h !== s && !/^\|[\s|:-]+\|?$/.test(s.t) && cellsOf(h.t).some(c => REQ_C.includes(c.replace(/`/g, '').trim())); };
      const mentionsC = s => REQ_C.some(f => fieldWord(f).test(s.t));
      const isDataRow = s => headC(s) || ((REGCODE.test(s.t) || SELFDECL.test(s.t) || DEFROW(s)) && mentionsC(s));
      // 表 C 表格的数据行也可能不在登记句式里（表头即栏名），一并收进
      const headRows = L.filter(x => usable(x) && headC(x) && !strongC.includes(x));
      const dataRows = [...strongC.filter(isDataRow), ...headRows];
      const jsonRows = L.filter(x => usable(x) && K.rowJson(x.t) && !dataRows.includes(x));
      const ruleSegs = strongC.filter(s => !isDataRow(s));
      console.log(`  规则段与散文示意（不是数据行，不断言）：${ruleSegs.map(s => s.v + ':' + s.n).join(' ') || '无'}`);
      // 散文单行登记与同一 ### 节里的数据实例说的是同一行：并成一个单元（实例给出的取值算该行的），实例不再单列
      const sameSecJson = s => s.t.startsWith('|') || jsonRows.includes(s) ? [] : jsonRows.filter(y => y.f === s.f && y.h3 === s.h3);
      const merged = new Set(dataRows.flatMap(sameSecJson));
      for (const s of [...dataRows, ...jsonRows.filter(y => !merged.has(y))]) {
        const ext = sameSecJson(s); const miss = report(KD, s.v, jsonRows.includes(s) ? '事件类型行（数据实例）' : ext.length ? `事件类型行（并同节数据实例 ${ext.map(y => y.n).join(',')}）` : '事件类型行', [s, ...ext]);
        console.log(`      ${s.v}:${s.n} ${s.t.replace(/\s+/g, ' ').slice(0, 100)}`);
        const text = [...miss.pool].map(y => y.t).join('\n');
        for (const f of KO_COLS) {
          if (!fieldWord(f).test(text)) continue; // 栏都没写的已在上面按缺栏计
          const refs = [...text.matchAll(new RegExp('`' + f + '`\\s*(?:取|为|=|：|:)\\s*`(?:roles\\.verbs\\.)?([A-Za-z][A-Za-z0-9_]*)`|"' + f + '":\\s*"(?:roles\\.verbs\\.)?([A-Za-z][A-Za-z0-9_]*)"', 'g'))].map(m => m[1] || m[2]);
          const bad = [];
          const prose = !s.t.startsWith('|') && !jsonRows.includes(s);
          if (!refs.length && prose) { console.log(`        [三栏代号随行数据] ${f}：散文单行未写代号，不计`); continue; }
          if (!refs.length) bad.push('未写所指动词');
          for (const v of new Set(refs)) {
            // 存在性：除本单元（引用它的事件类型行）之外，正文另有写到它的行；只在引用处出现的不算有登记
            if (!verbOcc(v).some(x => !x.log && !miss.pool.has(x)) || retiredSet.has(v)) bad.push(`${v} 无动词登记`);
            else if (!isKO(v)) bad.push(`${v} 登记未写 kindOnly 为真`);
          }
          if (bad.length) { const li = listed(s.v, miss.unit, f); missTotal += bad.length; if (li) listedTotal += bad.length; note(s.v, `C:事件类型行 ${f} ${bad.join('/')}${li ? '（已入清单）' : ''}`); }
          console.log(`        [${bad.length ? '三栏不符' : '三栏符'}] ${f} → ${refs.join(',') || '—'}${bad.length ? '：' + bad.join('；') : ''}`);
        }
        // 无催化的阶段（李白 ce6e990b ②，卷二十四表 C `stageFlow` 行的整类规则，从定义处读）：`catalysts` 为空的阶段
        // `advanceAt` 须为定义写的值、`advanceTo` 须同 `onExpire`；不符的每一阶段计 1 处。只核数据实例（JSON）里的 stageFlow。
        if (SF_RULE) for (const y of miss.pool) for (const m of y.t.matchAll(/"stageFlow":\s*\[/g)) {
          let d = 0, j = m.index + m[0].length - 1; for (; j < y.t.length; j++) { if (y.t[j] === '[') d++; else if (y.t[j] === ']' && --d === 0) break; }
          let arr = null; try { arr = JSON.parse(y.t.slice(m.index + m[0].length - 1, j + 1)); } catch { console.log(`        [stageFlow 解析不了] ${y.v}:${y.n}`); continue; }
          for (const st of arr) {
            if (!Array.isArray(st.catalysts) || st.catalysts.length) continue;
            const bad = []; if (st.advanceAt !== SF_RULE.at) bad.push(`advanceAt=${st.advanceAt}≠${SF_RULE.at}`); if (st.advanceTo !== st.onExpire) bad.push(`advanceTo=${st.advanceTo}≠onExpire=${st.onExpire}`);
            if (bad.length) { missTotal++; note(s.v, `C:事件类型行 stageFlow ${st.stage} 无催化 ${bad.join('、')}`); }
            console.log(`        [${bad.length ? '无催化阶段不符' : '无催化阶段符'}] ${y.v}:${y.n} ${st.stage}${bad.length ? '：' + bad.join('；') : ''}`);
          }
        }
      }
      console.log(`  自称事件类型行、未写任何表 C 独有栏（${C_ONLY.length} 个：${C_ONLY.join('、')}）——是表 C 行还是动词行旧称需人工判，表 C 不计数（已在 ③B 按动词行计）：`);
      for (const x of weakC) console.log(`      ${x.v}:${x.n} ${x.t.replace(/\s+/g, ' ').slice(0, 100)}`);
    } else {
      // 接收清单（“- 卷X（C..）：…一行 `due_kind`…”写在别卷）：登记卷自己没有登记行时，算该卷的一处缺栏
      const own = new Set(sites.filter(s => !/^- 卷/.test(s.t)).map(s => s.v));
      for (const s of sites) {
        const m = s.t.match(/^- (卷[^（：\s]+)[（：]/);
        if (m && m[1] !== s.v) {
          if (own.has(m[1])) { console.log(`  [接收清单] ${s.v}:${s.n} 记 ${m[1]} 的 due_kind 行，${m[1]} 有本卷登记行，按登记卷判`); continue; }
          missTotal += K.req.length; note(m[1], `D:无本卷登记行缺${K.req.length}`);
          console.log(`  [缺栏] ${m[1]} due_kind 行 只见于 ${s.v}:${s.n} 接收清单，本卷无登记行：缺 ${K.req.join('、')}`);
          continue;
        }
        report(K, s.v, 'due_kind 行', [s]);
        console.log(`      ${s.v}:${s.n} ${s.t.replace(/\s+/g, ' ').slice(0, 100)}`);
      }
    }
  }
  console.log(`\n③ 按卷汇总（缺栏的单元）：`);
  for (const [v, a] of byGroup) console.log(`  ${v}：${a.length} 单元 ${a.join('，')}`);
}
console.log(`③ 小计：缺栏 ${missTotal} 处（卷×栏）；其中已入清单 ${listedTotal} 处`);
console.log(`\n结论行：① PASS ${pass} FAIL ${fail} 需人工 ${manual}；② 可能撞号 ${collide} 组；③ 缺栏 ${missTotal} 处`);
