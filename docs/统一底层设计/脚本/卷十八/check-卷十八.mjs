// 卷十八 自检脚本（只读成稿与现役持有种类文件，逐项输出 PASS/FAIL）
import { readFileSync } from 'node:fs';
const path = process.argv[2] ?? 'F:/dnd/docs/统一底层设计/卷十八-社会关系与家族.md';
const lines = readFileSync(path, 'utf8').split('\n').map(l => l.replace(/\r$/, ''));
let fails = 0;
const report = (name, ok, detail = '') => { if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : '')); };
const N = 12;

// 分区：给每一行标注所在章、小节、是否在代码块内
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

// 1 章节
const need2 = ['## §0 ', '## §1 ', '## §2 ', '## §3 ', '## §4 ', '## §5 ', '## §6 ', '## §7 ', '## §8 ', '## 附 术语与代号表'];
const miss2 = need2.filter(p => !lines.some(l => l.startsWith(p)));
report('1 章节 §0–§8 与术语表齐全', miss2.length === 0, miss2.join(','));

// 2 十二个子系统各六小节
const six = ['维度', '统一入口', '规则', '交互', '数据实例', '验收断言'];
const miss4 = [];
for (let n = 1; n <= N; n++) {
  if (!lines.some(l => l.startsWith(`### 4.${n} `))) miss4.push(`4.${n}`);
  six.forEach((t, i) => { if (!lines.includes(`#### 4.${n}.${i + 1} ${t}`)) miss4.push(`4.${n}.${i + 1}`); });
}
report('2 十二个子系统各六小节齐全', miss4.length === 0, miss4.join(','));

// 3 数据实例
const inst = [];
for (let n = 1; n <= N; n++) {
  const tagged = meta.filter(m => m.h4 === `#### 4.${n}.5 数据实例` && m.fence === null).map(m => m.line).filter(l => /^- 【/.test(l));
  const ok = tagged.length >= 3 && tagged.some(l => l.startsWith('- 【非西陲】')) && tagged.some(l => /^- 【(非人类|超自然)】/.test(l));
  if (!ok) inst.push(`4.${n}(${tagged.length})`);
}
report('3 数据实例数量与两类覆盖', inst.length === 0, inst.join(','));

// 4 验收断言三式
const asr = [];
for (let n = 1; n <= N; n++) {
  const sec = meta.filter(m => m.h4 === `#### 4.${n}.6 验收断言`).map(m => m.line).join('\n');
  for (const k of ['扫描式', '不变量式', '扩展性式']) if (!sec.includes(k)) asr.push(`4.${n}:${k}`);
}
report('4 验收断言三式齐全', asr.length === 0, asr.join(','));

// 5 正文无具体 id 字面量（允许区：代码块、数据实例小节、附与附录）
const idRe = /\b(?:npc|creature|item|mat|species|loc|bld|fac|recipe|org|orgkind|office|polity|law|deity|faith|culture|profession|skill|offense|status|etype|eff|mod|pers|value|need|gauge|thought|sfam|class|comp|verb|rel|sg|param|req|hk|ho|send|pside|saxis|stier|ftier|etier|treat|mreg|ireg|descent|honor|legacy|sact|ssrc|esrc|crowd|mobrow|sal|res|sex|lstage|sink|track)_[a-z0-9][a-z0-9_]*/g;
// 封卷前（李白 11-14，事件 a52836df T1）：封闭枚举 consent_mode 按卷二第十七版 A4 改名 rel_consent_mode，是枚举名不是关系条目 id（卷二 §1.9 前缀约束不管枚举名），同 status_target 先例
const allowWords = new Set(['status_family', 'status_target', 'body_plan', 'body_part', 'law_code', 'pers_', 'value_', 'rel_consent_mode']);
const idHits = [];
meta.forEach((m, i) => {
  if (m.fence !== null) return;
  if (/数据实例$/.test(m.h4)) return;
  if (/^## 附/.test(m.h2)) return;
  for (const hit of m.line.match(idRe) ?? []) if (!allowWords.has(hit)) idHits.push(`L${i + 1}:${hit}`);
});
report('5 规则与正文无具体 id 字面量', idHits.length === 0, idHits.slice(0, 8).join(' '));

// 6 无用于判断的描述性文本
const textRe = /\.test\(|\.match\(|\.includes\(|startsWith\(|indexOf\(|\/[^\/\s`]*[\u4e00-\u9fff][^\/\s`]*\//;
const textHits = [];
meta.forEach((m, i) => {
  const inRule = /(规则|统一入口)$/.test(m.h4) || /^## §[235] /.test(m.h2);
  if (inRule && textRe.test(m.line)) textHits.push(`L${i + 1}`);
  if (m.fence === 'json' && /[\u4e00-\u9fff]/.test(m.line) && !/"basis"|"labels"/.test(m.line)) textHits.push(`L${i + 1}(json)`);
  if (inRule && m.fence === null && /`[^`]*[\u4e00-\u9fff][^`]*`\s*(===|==|!==)/.test(m.line)) textHits.push(`L${i + 1}(cmp)`);
});
report('6 无用于判断的描述性文本', textHits.length === 0, textHits.slice(0, 8).join(' '));

// 7 台账判给本卷的概念写全
const heads = lines.filter(l => l.startsWith('### 4.')).join('|');
const kw = ['持有种类', '家户', '亲属', '婚配', '继承', '分家', '监护', '家族', '传承', '立场数轴', '关系', '记忆', '谎言', '舆论', '群体行为', '威望', '名望', '荣誉', '阶层流动', '外来者待遇', '立场基线', '恐惧值'];
const missKw = kw.filter(k => !heads.includes(k));
const body4 = meta.filter(m => /^## §4 /.test(m.h2)).map(m => m.line).join('\n');
const codes = ['holderEnd', 'subjectEnd', 'hyper', 'kinDegree', 'heirsOf', 'lineVia', 'stanceBase', 'decayDays', 'conduct', 'recall', 'state.lies', 'opinionOf', 'esteemTier', 'lineageShare', 'mobilityOf', 'treatment', 'dread', 'boldness', 'compat', 'intimateAllowed'];
const missCode = codes.filter(c => !body4.includes(c));
const ruleIds = new Set(body4.match(/R18-\d+\.\d+/g) ?? []);
const perSub = []; for (let n = 1; n <= N; n++) if (![...ruleIds].some(r => r.startsWith(`R18-${n}.`))) perSub.push(n);
report('7 台账十项概念写全', missKw.length === 0 && missCode.length === 0 && perSub.length === 0, [...missKw, ...missCode, ...perSub.map(n => 'no-rule-4.' + n)].join(','));

// 8 跨卷引用带标题
const refRe = /卷[零一二三四五六七八九十]+b? §[^\s（）、，。；：|]*/g;
const badRef = [];
meta.forEach((m, i) => {
  if (m.fence !== null) return;
  let r; refRe.lastIndex = 0;
  while ((r = refRe.exec(m.line)) !== null) { if (m.line[r.index + r[0].length] !== '（') badRef.push(`L${i + 1}:${r[0]}`); }
});
report('8 跨卷引用带标题', badRef.length === 0, badRef.slice(0, 8).join(' '));

// 9 json 代码块可解析
let badJson = 0; const blocks = []; let buf = null;
for (const m of meta) {
  if (/^```json/.test(m.line)) { buf = []; continue; }
  if (buf && /^```/.test(m.line)) { try { blocks.push(JSON.parse(buf.join('\n'))); } catch (e) { badJson++; console.log('   json error: ' + String(e.message).slice(0, 90)); } buf = null; continue; }
  if (buf) buf.push(m.line);
}
report(`9 json 代码块可解析（${blocks.length + badJson} 块）`, badJson === 0, `bad=${badJson}`);

// 10 持有种类表：列数一致、上位词存在、现役旧行全部迁入、协议格取值合法
const hkBlock = blocks.find(b => Array.isArray(b.columns) && Array.isArray(b.rows));
const hkErr = [];
const CATALOG = new Set(['office', 'profession', 'skill']);
if (!hkBlock) hkErr.push('no-table'); else {
  const ids = new Set(hkBlock.rows.map(r => r[0]));
  const HO = new Set(['ho_vacate', 'ho_stay', 'ho_succeed', 'ho_estate', 'ho_close', 'ho_revert', 'ho_retain_disputed', 'ho_suspend', null]);
  // subjectEnd 的许可取值从卷二 §2.6 终止协议第 4 步读（2026-11-15，李白裁定第 1 条：现只许 send_close，其余三值未启用）：
  // 卷二中写到 `subjectEnd` 且有"只许取 …"的那一句，取"只许取"之后到句读前的反引号代号为许可集；不再写死四值、不再与旧表逐格比
  const v2path = process.argv[3] ?? 'F:/dnd/docs/统一底层设计/卷二-维度表规范与统一入口.md';
  const v2 = readFileSync(v2path, 'utf8').split('\n');
  const seRule = v2.map(l => l.match(/`subjectEnd`[^。]*?只许取([^。，；]*)/)).find(Boolean);
  const SE = new Set(seRule ? [...seRule[1].matchAll(/`([a-z][a-z_]*)`/g)].map(m => m[1]) : []);
  if (!SE.size) hkErr.push('subjectEnd-rule:卷二未写许可取值');
  console.log(`   subjectEnd 许可取值（卷二终止第 4 步）：${[...SE].join('、') || '未读到'}`);
  for (const r of hkBlock.rows) {
    if (r.length !== hkBlock.columns.length) hkErr.push('len:' + r[0]);
    if (r[1] !== null && !ids.has(r[1])) hkErr.push('hyper:' + r[0]);
    if (![r[5], r[6], r[7]].every(x => HO.has(x))) hkErr.push('proto:' + r[0]);
    if (!SE.has(r[8])) hkErr.push('subjectEnd:' + r[0] + '=' + r[8]);
    if (r[5] === 'ho_stay' || r[5] === null) hkErr.push('gone:' + r[0]);
  }
  if (ids.size !== hkBlock.rows.length) hkErr.push('dup');
  // §4.1.1“端类型”：标的全是目录行（职位、职业、技能）的种类，三个传导系数必须为 0（封卷后勘误，卷八牵连）
  for (const r of hkBlock.rows) if (r[3].every(t => CATALOG.has(t)) && r.slice(14, 17).some(x => x !== 0)) hkErr.push('catalog-conduct:' + r[0]);
  const old = JSON.parse(readFileSync('F:/dnd/world/ontology/holdings.json', 'utf8')).entries;
  for (const e of old) {
    const row = hkBlock.rows.find(r => r[0] === 'hk_' + e.id);
    if (!row) { hkErr.push('missing:' + e.id); continue; }
    const h = e.handover ?? {}; const f = x => (x ? 'ho_' + x : null);
    // subjectEnd（row[8]）不与旧表 onSubjectGone 比：按现行规则只核在许可集内（上面逐行已核）
    if (row[5] !== f(h.gone) || row[6] !== f(h.vacated) || row[7] !== f(h.defected) || row[4] !== e.exclusive || row[9] !== e.concluded || row[10] !== e.functional) hkErr.push('diff:' + e.id);
  }
  console.log(`   持有种类 ${hkBlock.rows.length} 行（旧 ${old.length} + 新 ${hkBlock.rows.length - old.length}）`);
  // 一审后：补充列（稀疏块）对照旧表逐字段核对，旧字段不得无声丢失
  const ex = blocks.find(b => b.defaults && b.overrides);
  if (!ex) hkErr.push('no-extras'); else {
    const need = ['intimate', 'bodyControl', 'holderMax', 'succeedBy', 'excludes', 'grantsEntry', 'visibility', 'contest', 'capacityKey', 'transferable', 'incompatible', 'grants', 'hooks', 'termsKeys', 'shareSum', 'grantedBy'];
    for (const k of need) if (!(k in ex.defaults)) hkErr.push('default:' + k);
    for (const [id, o] of Object.entries(ex.overrides)) { if (!ids.has(id)) hkErr.push('ex-unknown:' + id); for (const k of Object.keys(o)) if (!(k in ex.defaults)) hkErr.push('ex-key:' + id + '.' + k); }
    const eff = id => ({ ...ex.defaults, ...(ex.overrides[id] ?? {}) });
    const HO2 = new Set(['ho_vacate', 'ho_stay', 'ho_succeed', 'ho_estate', 'ho_close', 'ho_revert', 'ho_retain_disputed', 'ho_suspend']);
    const hooksMoved = new Set(['guardian_of', 'guest_of']); // §7.2 写明不迁或交卷八b 的两种
    const POL = new Set(['forbid', 'auto_vacate']);
    const incKey = x => x.kind + ':' + x.policy;
    let incAdded = 0;
    for (const r of hkBlock.rows) {
      const v = eff(r[0]);
      for (const x of v.incompatible) if (!ids.has(x.kind) || !POL.has(x.policy)) hkErr.push('incompat-bad:' + r[0]);
      const oldInc = (old.find(e => 'hk_' + e.id === r[0])?.incompatibleWith ?? []).map(x => 'hk_' + x.kind + ':' + x.policy);
      incAdded += v.incompatible.filter(x => !oldInc.includes(incKey(x))).length;
    }
    // 封卷前（李白 11-14，事件 a52836df ②）：住宿行旧表 contest、capacity 两格裁定置空（旧值 capacity 不是登记维度，住宿非互斥）。
    // 这两格不再比旧值，改为：新值必须为空；R18-1.5 必须写有容量满员拒写规则与 E-HK-CAPACITY；§2.5 登记该码；§7.2 去向行写明置空并引 Q17；Q17 在场。
    const RULED_NULL = { lodges: ['contest', 'capacity'] };
    {
      const r15 = lines.find(l => l.startsWith('- **R18-1.5 '));
      if (!r15 || !/`capacityKey` 非空的种类管标的一端/.test(r15) || !/现役边数须小于标的上该容量维度的值，否则拒写（E-HK-CAPACITY）/.test(r15) || !/已有的边不关，只拒新边/.test(r15)) hkErr.push('ruled-null:R18-1.5');
      if (!lines.some(l => l.startsWith('| E-HK-CAPACITY |'))) hkErr.push('ruled-null:E-HK-CAPACITY');
      const r72 = lines.find(l => l.startsWith('| `visibility`、`contest`、`capacity`'));
      if (!r72 || !/住宿行旧表的 `contest`、`capacity` 两格封卷前改置空/.test(r72) || !/Q17/.test(r72)) hkErr.push('ruled-null:§7.2');
      if (!lines.some(l => l.startsWith('| Q17 |'))) hkErr.push('ruled-null:Q17');
    }
    for (const e of old) {
      const v = eff('hk_' + e.id);
      if ((e.visibility ?? 'public') !== v.visibility) hkErr.push('vis:' + e.id);
      const ruled = RULED_NULL[e.id] ?? [];
      if (ruled.includes('contest') ? v.contest !== null : (e.contest ?? null) !== v.contest) hkErr.push('contest:' + e.id);
      if ((e.transferable ?? false) !== v.transferable) hkErr.push('transferable:' + e.id);
      if (ruled.includes('capacity') ? v.capacityKey !== null : (e.capacity ?? null) !== v.capacityKey) hkErr.push('capacity:' + e.id);
      // 第四版（余项单核第五节第 1 条）：原断言是“新旧条数相等”，连有据的新增也禁止了。
      // 改为：旧条目逐条（种类与处置都相同）迁入，一条不丢；新增条数必须等于 §7.2 写明的条数（见循环后）。
      for (const x of e.incompatibleWith ?? []) if (!v.incompatible.some(y => incKey(y) === 'hk_' + x.kind + ':' + x.policy)) hkErr.push('incompat-lost:' + e.id + '>' + x.kind);
      if ((e.hooks ?? []).length > 0 && !hooksMoved.has(e.id) && v.hooks.length !== e.hooks.length) hkErr.push('hooks:' + e.id);
      const oldGrants = Object.keys(e.derives ?? {}).filter(k => k !== 'conduction').sort().join(',');
      if (!v.excludes && oldGrants !== [...v.grants].sort().join(',')) hkErr.push('grants:' + e.id); // 排除类的“进入”派生由 excludes 表达（§7.2）
      if ((e.terms ?? []).filter(k => k !== 'until').length > 0 && v.termsKeys.length === 0) hkErr.push('terms:' + e.id); // until 是公共键
      // 旧表标了传导的不得丢；例外：标的全是目录行的种类按 §4.1.1“端类型”三个系数取 0（封卷后勘误，卷八牵连：任职）
      const catalogOnly = r => r[3].every(t => CATALOG.has(t));
      if (e.derives?.conduction && !catalogOnly(hkBlock.rows.find(r => r[0] === 'hk_' + e.id)) && !hkBlock.rows.find(r => r[0] === 'hk_' + e.id).slice(14, 17).some(x => x !== 0)) hkErr.push('conduction:' + e.id);
      if ((e.sum ?? null) !== v.shareSum) hkErr.push('sum:' + e.id);
      if (JSON.stringify(e.grantedBy ?? []) !== JSON.stringify(v.grantedBy)) hkErr.push('grantedBy:' + e.id);
    }
    for (const r of hkBlock.rows) {
      const v = eff(r[0]);
      if ([r[5], r[6], r[7]].includes('ho_succeed') && !v.succeedBy) hkErr.push('succeedBy:' + r[0]);
      for (const h of v.hooks) if (!HO2.has(h.do) || !['holder', 'subject'].includes(h.role)) hkErr.push('hook:' + r[0]);
      if (typeof v.intimate !== 'boolean') hkErr.push('intimate:' + r[0]);
    }
    const oldTop = JSON.parse(readFileSync('F:/dnd/world/ontology/holdings.json', 'utf8'));
    const missReason = oldTop.reasons.map(x => x.id).filter(x => !lines.join('\n').includes(x));
    if (missReason.length) hkErr.push('reasons:' + missReason.join('/'));
    const oldKeys = new Set(old.flatMap(e => Object.keys(e)));
    const sec7 = meta.filter(m => /^## §7 /.test(m.h2)).map(m => m.line).join('\n');
    for (const k of oldKeys) if (k !== 'id' && !sec7.includes('`' + k + '`')) hkErr.push('undisposed:' + k);
    const incDeclared = Number((/新增 `incompatible` 条目 (\d+) 条/.exec(sec7) ?? [0, 0])[1]);
    if (incAdded !== incDeclared) hkErr.push(`incompat-added:${incAdded}≠§7.2 写明的 ${incDeclared}`);
  }
}
report('10 持有种类表自洽、旧行逐格一致（subjectEnd 按卷二许可集）、旧表各字段都有去向', hkErr.length === 0, hkErr.slice(0, 12).join(' '));

// 11 结构性代号在场：家户 orgKind、intimate 字段、硬下限
const all = lines.join('\n');
const must = ['"orgkind_household": {"domestic": true', '"intimate": true', '"intimateMinRelMaturity": 1', 'E-REL-INTIMATE-MINOR', 'E-KIN-REGIME-AGE', 'R18-9.1'];
const missMust = must.filter(s => !all.includes(s));
const relBlock = blocks.find(b => b.relation)?.relation ?? {};
const relBad = Object.entries(relBlock).filter(([, v]) => typeof v.intimate !== 'boolean' || typeof v.marital !== 'boolean' || !('kinStep' in v)).map(([k]) => k);
const kindRow = id => hkBlock?.rows.find(r => r[0] === id);
for (const [k, v] of Object.entries(relBlock)) {
  if (!['active', 'historical'].includes(v.persistence)) relBad.push(k + ':persistence');
  if (!kindRow(v.kind) || kindRow(v.kind)[13] !== true) relBad.push(k + ':kind');
  if (!['none', 'mutual', 'regime'].includes(v.consent)) relBad.push(k + ':consent');
  if ((v.intimate || v.marital) && v.consent === 'none') relBad.push(k + ':consent-required');
  if (v.record !== null && (relBlock[v.record]?.persistence !== 'historical' || v.persistence !== 'active')) relBad.push(k + ':record');
}
if (!Object.values(relBlock).some(v => v.kinStep !== null && v.persistence === 'historical')) relBad.push('亲子须为史实');
const mreg = blocks.find(b => b.marriage_regime); const floor = mreg?.minor?.intimateMinRelMaturity;
const lowReg = Object.entries(mreg?.marriage_regime ?? {}).filter(([, v]) => !(v.minRelMaturity >= floor)).map(([k]) => k);
for (const [k, v] of Object.entries(mreg?.marriage_regime ?? {})) { const r = relBlock[v.spouseRel]; if (!r || !r.marital || r.persistence !== 'active' || r.record === null) lowReg.push(k + ':spouseRel'); }
const roles = blocks.find(b => b.roles)?.roles;
if (!roles) relBad.push('no-roles'); else {
  for (const v of Object.values(roles.kinds)) if (!kindRow(v)) relBad.push('role-kind:' + v);
  for (const v of Object.values(roles.rels)) if (!relBlock[v]) relBad.push('role-rel:' + v);
}
report('11 家户 orgKind、intimate 字段、未成年硬下限在场且制度行不低于下限', missMust.length === 0 && relBad.length === 0 && floor >= 1 && lowReg.length === 0, [...missMust, ...relBad, ...lowReg].join(','));

// 12 数据实例里的算术复算
const near = (a, b) => Math.abs(a - b) < 1e-9;
// 传导系数从种类表取，档位从档位表取，不再手抄
const conduct = kindRow('hk_member_of')[hkBlock.columns.indexOf('conduct')];
const tiers = blocks.find(b => b.tiers && !Array.isArray(b.tiers)).tiers.saxis_regard;
const tierOf = x => tiers.find(t => x < t.lt).tier;
const lerp = (pts, x) => { for (let i = 0; i + 1 < pts.length; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[i + 1]; if (x >= x0 && x <= x1) return y0 + (y1 - y0) * (x - x0) / (x1 - x0); } return NaN; };
const brawl = blocks.find(b => b.brawl).brawl;
const acc = mreg.kin.accept;
const west = 0.4 * (20 - 50) + 15 * (1 - 120 / 360) + conduct * -30, port = 0.4 * (80 - 50) + conduct * 20;
const tierErr = [];
if (tierOf(west) !== 'stier_neutral' || !all.includes('合计 −14，落在 −15 与 15 之间，档位为中立')) tierErr.push('西陲档位');
if (tierOf(port) !== 'stier_warm' || !all.includes('合计 +20，档位为友善')) tierErr.push('本港档位');
if (/档位为戒备|立场档为戒备/.test(all)) tierErr.push('残留旧档位');
const calc = [
  ['立场 静态', 0.4 * (20 - 50), -12], ['立场 条目', 15 * (1 - 120 / 360), 10], ['立场 传导', conduct * -30, -12], ['立场 合计', west, -14],
  ['立场 本港传导', conduct * 20, 8], ['立场 本港', port, 20],
  ['继承 均分 配偶', 1200 * 0.25, 300], ['继承 均分 子女', (1200 - 300) / 3, 300], ['继承 加权 长子', 900 * 2 / 4, 450], ['继承 加权 余子', 900 * 1 / 4, 225],
  ['显著度 赖账', 0.6 * (1 + 0.5 * 0.4) * 0.4, 0.288], ['显著度 一餐', 0.05 * 0.4, 0.02],
  ['舆论 请愿', (30 / 40) * -40, -30], ['舆论 庆贺', 0.6 * 70, 42],
  ['威望 分成', 50 * 0.2, 10], ['威望 余额', 80 + 50, 130], ['威望 抄本', Math.min(2 * 60, 80), 80],
  ['恐惧 条目', 30 * (1 - 180 / 720), 22.5], ['恐惧 合计', 22.5 + 20, 42.5], ['胆量', 20 + 30 * 0.5, 35], ['dread', 42.5 - 35, 7.5], ['dread 水手', 42.5 - (20 + 30 * 0.9), -4.5],
  ['相容', ((1 - 0.4 / 2) + (1 - 1.0 / 2)) / 2, 0.65], ['求偶 相容项', acc.wCompat * acc.compatScale * (0.65 - acc.compatMid), 7.5], ['求偶 合计', acc.wRegard * 30 + 7.5 + acc.wRank * -10, 27.5], ['求偶 门槛', acc.acceptMin, 25], ['斗殴 概率', lerp(brawl.chanceCurve, -0.5), 0.15],
  ['婚龄', 16 * 1.1, 17.6], ['礁龟', 24 / 25, 0.96]
];
const badCalc = calc.filter(([, got, want]) => !near(got, want)).map(([n]) => n);
const missNum = calc.filter(([, , want]) => !all.includes(String(Math.abs(want)))).map(([n, , w]) => n + '=' + w);
report(`12 数据实例算术复算（${calc.length} 项，系数取自表）`, badCalc.length === 0 && missNum.length === 0 && tierErr.length === 0, [...badCalc, ...missNum, ...tierErr].join(','));

// 13 一审裁定落实
const r13 = [];
const sec = h => meta.filter(m => m.h4.startsWith(h) || m.h3.startsWith(h)).map(m => m.line).join('\n');
const rule9 = sec('#### 4.9.3');
for (let i = 1; i <= 10; i++) if (!new RegExp(`\\| C${i} \\|`).test(rule9)) r13.push('缺检查点 C' + i);
for (const p of ['| 建立 |', '| 变形或补丁 |', '| 加载与实体化 |', '| 附身或操控 |', 'intimateEligible', 'bodyControl', '转中止', 'marital']) if (!rule9.includes(p)) r13.push('R18-9.1 缺 ' + p);
for (const c of ['E-REL-INTIMATE-MINOR', 'E-REL-MINOR-LOAD', 'E-REL-REWRITE', 'E-REL-INTIMATE-FIELD', 'E-REL-CONSENT', 'E-REL-KIND', 'E-HK-SUCCEED-SOURCE', 'E-HK-HOLDER-MAX']) if (!sec('### 2.5').includes(c)) r13.push('错误码 ' + c);
const s36 = sec('### 3.6');
if (!s36.includes('phaseOffset') || !s36.includes('卷二十 §2.1')) r13.push('§3.6 未引卷二十调度表');
// 规则里凡说“转真/转假/不再满足/超过上限”的条件类规则，都必须写明固定刻
const condRules = meta.filter(m => /规则$/.test(m.h4) && /^- \*\*R18-/.test(m.line) && /转真|转假|不再满足|人数超过/.test(m.line));
for (const m of condRules) if (!/固定刻/.test(m.line)) r13.push('条件规则未定时刻:' + m.line.slice(4, 13));
for (const m of meta) if (/推进拍结束|同一推进拍|一次推进结束时/.test(m.line) && !/不得/.test(m.line) && !/^## 附/.test(m.h2)) r13.push('残留推进拍:' + m.line.slice(0, 16));
const sec7 = meta.filter(m => /^## §7 /.test(m.h2)).map(m => m.line).join('\n');
for (const f of ['population.mjs:356', 'action-consent.mjs:10', 'npc-relations.mjs:114', 'npc-life.mjs:174', 'activities.mjs:311', 'population-service.mjs:46', 'remote-generation.mjs:398', 'family-state.mjs:7', 'flags.romanceable', 'family-diplomacy.mjs', 'family-inheritance.mjs', 'household-subsistence.mjs:303', 'reputation.mjs:65']) if (!sec7.includes(f)) r13.push('§7 缺 ' + f);
if (!/`ROMANCE` 正则定义[^\n]*正则删除/.test(sec7)) r13.push('ROMANCE 去向');
// rx 文本不得超出卷二 rxTree 运算集：无 min/max、无方法调用、无方括号下标（gaugeTarget 是修正键，不是 rx）
const rxBad = [];
const walk = (o, key) => { if (typeof o === 'string') { if (/RX$|^when$|^requires$|^applies$|^groupFilter$|^from$/.test(key ?? '') && (/\b(min|max)\(|\.\w+\(|\[/.test(o))) rxBad.push(o.slice(0, 30)); } else if (Array.isArray(o)) o.forEach(x => walk(x, key)); else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) walk(v, k); };
blocks.forEach(b => walk(b, null));
if (rxBad.length) r13.push('rx 超集:' + rxBad.join(';'));
// 断言可机判：立场单入口按类型与写者
const s35 = sec('### 3.5');
if (!/按类型和写者判定，不按字段名/.test(s35) || !/签名扫描/.test(s35)) r13.push('S18-1 判据');
for (const h of ['## 附录 一审修改影响面表', '## 附录 记账栏']) if (!lines.some(l => l.startsWith(h))) r13.push('缺 ' + h);
for (const k of ['state.opinion.lastFired.byEntity[groupId][EntityId][triggerRow]', 'state.opinion.lastFired.byEvent[groupId][EventId][triggerRow]']) if (!all.includes(k)) r13.push('舆论冷却键 ' + k);
if (/group\.orgKind|fertilityFactor|heldBy\(|holds\(/.test(all.split('## 附录 记账栏')[0].split('## 附录 一审修改影响面表')[0])) r13.push('残留未定义引用');
report('13 一审裁定落实（检查点、错误码、固定刻、迁移清单、rx 运算集、断言判据）', r13.length === 0, r13.slice(0, 10).join(' | '));

// 14 二审余项与转来项（第三版）
const r14 = [];
const exB = blocks.find(b => b.defaults && b.overrides);
const effB = id => ({ ...exB.defaults, ...(exB.overrides[id] ?? {}) });
const body = all.split('## 附录 一审修改影响面表')[0];
const s411 = sec('#### 4.1.1'), s413 = sec('#### 4.1.3'), s25 = sec('### 2.5'), s24 = sec('### 2.4'), s33 = sec('### 3.3'), s52 = sec('### 5.2'), s8 = meta.filter(m => /^## §8 /.test(m.h2)).map(m => m.line).join('\n');
// P3 授予者出处
if (!/`grantor: EntityId nullable`/.test(s411)) r14.push('P3 公共键 grantor');
if (!/terms\.grantor/.test(s25) || !/terms\.grantor/.test(s413)) r14.push('P3 校验或规则未引 grantor');
// P4 户主键
if (!roles?.kinds?.householdHead || !kindRow(roles.kinds.householdHead) || kindRow(roles.kinds.householdHead)[12] !== true) r14.push('P4 householdHead');
if (!/householdHead/.test(s24)) r14.push('P4 规则表键');
// P14 键表：数据块里出现的每个 terms 键都有类型
const keyRows = new Set((s411.match(/^\| `[A-Za-z]+` \|/gm) ?? []).map(x => x.slice(3, -3)));
const usedKeys = new Set(Object.values(exB.overrides).flatMap(o => o.termsKeys ?? []));
for (const k of usedKeys) if (!keyRows.has(k)) r14.push('P14 键表缺 ' + k);
// B-2 卷一、卷零请求；不得再称三卷一致
if (!/卷一（档案校验一条/.test(s52) || !/卷零覆盖表/.test(s52)) r14.push('B-2 请求');
if (/与卷零、卷一、卷二对该正则的处置一致/.test(body)) r14.push('B-2 残留“一致”');
// B-6 不能跨户
// 第四版删去按 holderMaxGroup 写的三条断言（同组且上限为 1、同组各行上限相等、R18-1.5 提到该列）。
// 理由：李白裁定该列属未授权的新增设计，已删；“同组各行上限相等”是该列自带的加载期校验，随列消失。
// 覆盖不降：原断言保证“成员、户主两种边合计至多一条”。现改为核对两行的 incompatible 覆盖全部四个方向
// （成员→成员、成员→户主、户主→户主、户主→成员）且都取自动让出，两行 holderMax 仍为 1；
// 另在第 15 项按 R18-1.5 逐种写入模拟，核对写后合计恰为一条（原断言没有核写入路径）。
const kM = roles.kinds.householdMember, kH = roles.kinds.householdHead;
const hm = effB(kM), hh = effB(kH);
if (hm.holderMax !== 1 || hh.holderMax !== 1) r14.push('B-6 上限');
for (const [name, v] of [[kM, hm], [kH, hh]]) for (const other of [kM, kH]) if (!v.incompatible.some(x => x.kind === other && x.policy === 'auto_vacate')) r14.push(`B-6 互斥缺 ${name}→${other}`);
if ('holderMaxGroup' in exB.defaults || /holderMaxGroup/.test(body) || blocks.some(b => JSON.stringify(b).includes('holderMaxGroup'))) r14.push('B-6 残留 holderMaxGroup');
if (!/`incompatible`/.test(s413) || !/自动让出/.test(s413) || !/不论旧边指向哪个标的/.test(s413)) r14.push('B-6 R18-1.5');
// B-8 rx 变量表
for (const v of ['`notable.listRX`', '`kin.householdCapRX`', '`lies.propensityRX`、`lies.discloseRX`', 'subject.convictionCount', 'spouse.rank.order']) if (!s24.split('本卷各 rx 字段可读的变量')[1]?.includes(v)) r14.push('B-8 变量表缺 ' + v);
// N1 存续方式与 via 一致
for (const [k, v] of Object.entries(relBlock)) {
  const hist = v.persistence === 'historical';
  if (hist !== /^relationFacts\./.test(v.via) || hist !== v.inputs.every(x => /^relationFacts\./.test(x))) r14.push('N1 via:' + k);
}
// N2 C6 口径
const c6 = (rule9.match(/\| C6 \|[^\n]*/) ?? [''])[0];
if (!/现役且未中止/.test(c6) || !/suspended/.test(c6) || !/史实记录/.test(c6)) r14.push('N2 C6');
if (!/现役且未中止/.test((s25.match(/\| E-REL-MINOR-LOAD \|[^\n]*/) ?? [''])[0])) r14.push('N2 错误码');
// N3 intimate 不双存
if (blocks.some(b => JSON.stringify(b).includes('actionCatalogIntimate')) || /actionCatalogIntimate/.test(body)) r14.push('N3 残留副本');
// 复生牵连
if (/第 2 步定出的后继/.test(body)) r14.push('复生 步号');
if (/不涵盖它/.test(body) || /提请卷二写进终止第 4 步，取代/.test(body) || /不 import 领域文件/.test(s413)) r14.push('复生 残留自定义');
if (!/待卷二确认，不作为已生效规则/.test(s413) || !/一律解除/.test(s413)) r14.push('复生 R18-1.3');
if (!/复生唯一定义在卷二 §2\.6/.test(s411) || !/不自动恢复已关闭或已移交的边/.test(s411)) r14.push('复生 引用句');
if (/改指授予方的后继；清算/.test(body)) r14.push('复生 R18-7.6');
// 卷十四转来：端类型、认证行
if (!/目录行/.test(s411) || !/E-HK-END-TYPE/.test(s25)) r14.push('Q-22 端类型');
const certRow = kindRow('hk_certified');
for (const t of ['office', 'collective', 'profession', 'skill']) if (!certRow[3].includes(t)) r14.push('Q-2 认证标的缺 ' + t);
for (const k of ['cert', 'origin']) if (!effB('hk_certified').termsKeys.includes(k) || !keyRows.has(k)) r14.push('Q-2 键 ' + k);
if (!/显式/.test(s411) || !/`gone`、`vacated`、`defected`/.test(s411)) r14.push('执业行接口');
// 18-1 年度消退
const est = blocks.find(b => b.lineageShare !== undefined);
if (!est || 'upkeepPerYear' in est || !Number.isInteger(est.upkeepNumerator) || !(Number.isInteger(est.upkeepDenominator) && est.upkeepDenominator > 0)) r14.push('18-1 数据');
if (/upkeepPerYear/.test(body)) r14.push('18-1 残留旧键');
const r73 = (body.match(/- \*\*R18-7\.3[^\n]*/) ?? [''])[0];
if (!/存量与余数结转/.test(r73) || !/floor\(acc ÷ upkeepDenominator\)/.test(r73) || !/esteemRem/.test(r73)) r14.push('18-1 R18-7.3');
{ // 余数结转算术：小余额不被永远截成 0，恒等式成立
  let bal = 10n, rem = 0n, out = 0n, sum = 0n; const n = BigInt(est?.upkeepNumerator ?? 0), d = BigInt(est?.upkeepDenominator ?? 1);
  for (let y = 0; y < 40; y++) { sum += bal * n; const acc = rem + bal * n; const o = acc / d; rem = acc - o * d; bal -= o; out += o; if (rem < 0n || rem >= d) r14.push('18-1 余数越界'); }
  if (out === 0n || sum !== d * out + rem) r14.push('18-1 恒等式');
}
// 卷十九 Q22：记入 §8，不新增操作
if (!/换标的/.test(s8) || !/本版不新增设计/.test(s8)) r14.push('Q22 未记入 §8');
// 单通道 一-9：三条路径登记去留
for (const p of ['state.stance[observerId][targetId][]', 'state.opinion.lastFired.byEntity[groupId][EntityId][triggerRow]', 'state.opinion.lastFired.byEvent[groupId][EventId][triggerRow]', 'state.esteemRem[holderId][resource]']) if (!new RegExp('\\| `' + p.replace(/[.[\]]/g, '\\$&') + '` \\|[^\\n]*`clear`').test(s33)) r14.push('一-9 去留 ' + p);
// 判据绕过 二-4、二-5
if (/任何函数体内既读/.test(s35) || !/数据流分析/.test(s35) || !/P26-8/.test(s35)) r14.push('二-4 S18-8');
if (!/两个实体引用/.test(s35) || !/豁免表首版登记一条/.test(s35) || /豁免表首版为空/.test(body)) r14.push('二-5 S18-1');
if (!lines.some(l => l.startsWith('## 附录 二审余项修改影响面表'))) r14.push('缺二审影响面表');
report('14 二审余项与转来项落实（列出项逐条）', r14.length === 0, r14.slice(0, 12).join(' | '));

// 15 余项单核 N4、N5（第四版）
const r15 = [];
{ // N4：按 R18-1.5 的写入顺序模拟——先按新边种类行的 incompatible 处置旧边，再核 holderMax
  const write = (edges, kind, target) => {
    const v = effB(kind); let rest = edges.slice();
    for (const x of v.incompatible) {
      const hit = rest.filter(e => e.kind === x.kind);
      if (!hit.length) continue;
      if (x.policy === 'forbid') return null;
      rest = rest.filter(e => e.kind !== x.kind); // 自动让出，不论标的
    }
    if (v.holderMax !== null && rest.filter(e => e.kind === kind).length + 1 > v.holderMax) return null;
    return [...rest, { kind, target }];
  };
  const cases = [
    ['分家（甲户成员→乙户户主）', [{ kind: kM, target: 'A' }], kH, 'B'],
    ['迁户（甲户成员→乙户成员）', [{ kind: kM, target: 'A' }], kM, 'B'],
    ['户主迁出（甲户户主→乙户成员）', [{ kind: kH, target: 'A' }], kM, 'B'],
    ['户主分家（甲户户主→乙户户主）', [{ kind: kH, target: 'A' }], kH, 'B'],
    ['接任（本户成员→本户户主）', [{ kind: kM, target: 'A' }], kH, 'A'],
    ['初次入户', [], kM, 'A'],
  ];
  for (const [name, before, kind, target] of cases) {
    const after = write(before, kind, target);
    if (!after) { r15.push('N4 拒写:' + name); continue; }
    const dom = after.filter(e => e.kind === kM || e.kind === kH);
    if (dom.length !== 1 || dom[0].target !== target || dom[0].kind !== kind) r15.push('N4 写后不是恰一条:' + name);
  }
  const rule = id => (body.match(new RegExp('- \\*\\*' + id + '[^\\n]*')) ?? [''])[0];
  for (const id of ['R18-2.3', 'R18-2.6', 'R18-2.8']) if (!/自动让出/.test(rule(id)) || !/R18-1\.5/.test(rule(id))) r15.push('N4 ' + id + ' 未写先让出旧边');
  if (!/户主边因离任而关闭/.test(rule('R18-2.8')) || !/同一候补顺序/.test(rule('R18-2.8'))) r15.push('N4 户主离任未按候补顺序补位');
}
{ // N5：授予者只在确有授予者时必填
  const need = id => { const v = effB(id); return v.grantedBy.length > 0 || v.succeedBy === 'grantor'; };
  const revert = hkBlock.rows.filter(r => [r[5], r[6], r[7]].includes('ho_revert') || effB(r[0]).hooks.some(h => h.do === 'ho_revert'));
  if (!revert.some(r => !need(r[0]))) r15.push('N5 没有可空的行可核');
  const srcRow = (s25.match(/\| E-HK-SUCCEED-SOURCE \|[^\n]*/) ?? [''])[0];
  if (/任一格取“回到授予者”、或/.test(srcRow) || !/`grantedBy` 非空、或 `succeedBy` 取授予者/.test(srcRow) || !/可以为空/.test(srcRow) || !/不报错/.test(srcRow)) r15.push('N5 错误码口径');
  if (/任一格取“回到授予者”、或 `succeedBy` 取授予者的，写入时必填/.test(s411) || !/只在确有授予者时必填/.test(s411)) r15.push('N5 公共键口径');
  if (!/它为空或所指实体已终止时，按“关闭”处置/.test(s413)) r15.push('N5 R18-1.2 空即关闭');
}
report('15 余项单核 N4、N5（按 R18-1.5 模拟分家、迁户、接任；授予者可空）', r15.length === 0, r15.slice(0, 10).join(' | '));

console.log(`行数 ${lines.length}；子系统 ${N}；规则条数 ${ruleIds.size}；json 块 ${blocks.length}；失败项 ${fails}`);
process.exit(fails ? 1 : 0);
