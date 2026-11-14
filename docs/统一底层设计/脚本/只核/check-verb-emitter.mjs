// 只核用（2026-11-14，claude-opus-5-5 中档）：李白 11-14 ③ kind-only 与 ab8e3bcf ②④ 只核
// ① 全书动词：登记行、声明的发出系统、kindOnly、kindFrom 引用；核"非 kindOnly 恰一个发出系统、kindOnly 零发出且被至少一条 kindFrom 取值引用"
// ② 事件 id 位次代号（pos.*）无撞号：卷九 §2.9 事件 id 表、卷二十四 R24-1.1、卷二十七 R27-8.9
// 只读正文，不改任何文件。正文是散文，"发出系统"抽取是启发式：判不了的列"需人工"，由报告给人工结果。
import fs from 'fs';
import path from 'path';

const ROOT = 'F:/dnd/docs/统一底层设计';
const files = fs.readdirSync(ROOT).filter(f => /^卷.*\.md$/.test(f)).sort();
const vol = f => f.replace(/-.*$/, '').replace(/\.md$/, '');
const LOGHEAD = /修订|处置|自检|记账|影响面|审查意见|版本说明|改动|勘误/;

// 读全书，标出每行所在的二级标题；卷首（第一个 ## 之前）与修订/处置类附录视为"记录行"，不参与判定
const L = []; // {f, v, n, t, log}
for (const f of files) {
  const lines = fs.readFileSync(path.join(ROOT, f), 'utf8').split(/\r?\n/);
  let head = null;
  lines.forEach((t, i) => {
    if (/^## /.test(t)) head = t;
    L.push({ f, v: vol(f), n: i + 1, t, log: head === null || LOGHEAD.test(head) });
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
function analyze(name, occ, keys) {
  const body = occ.filter(x => !x.log);
  const reg = new Set(), regLines = [], emitters = [], emitStmts = [], kindOnlyLines = [], kfRefs = [];
  for (const x of body) {
    const t = x.t;
    const vrow = /^\| `verb`（卷二十四/.test(t);
    const isReg = vrow ? keys.some(k => (t.split('|')[2] || '').includes(k))
      : keys.some(k => windowAround(t, k, 60).some(w => /本卷(自)?登记|由本卷登记|verb 族条目|本卷登记的/.test(w)));
    if (isReg) { reg.add(x.v); regLines.push(`${x.v}:${x.n}`); }
    for (const k of keys) for (const w of windowAround(t, k, 160)) {
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
for (const [h, occ] of [...H].sort()) results.push({ form: 'handle', ...analyze(h, occ, [h]) });
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
console.log(`\n结论行：① PASS ${pass} FAIL ${fail} 需人工 ${manual}；② 可能撞号 ${collide} 组`);
