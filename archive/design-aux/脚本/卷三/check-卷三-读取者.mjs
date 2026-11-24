// 卷三甲 §2.6 物性格读取登记表的派生必填检查（李白 11-14 21:53 原文："检查脚本从读取登记表派生必填集合，并加反向检查：任何读取者运行时可能取到 null 即判失败。"）
// 用法：node F:/dnd/docs/统一底层设计/脚本/卷三/check-卷三-读取者.mjs [卷三甲路径] [其余各卷目录，以 / 结尾]   （check-卷三.mjs 跑卷三甲时串联本检查）
// ① 解析 §2.6 登记表，逐读取者对 §4.5 全集的每行材料求"材料行判定"，派生必须非 null 的物性格集合；集合内格为 null 或缺 → FAIL
// ② 反向：§2.1 里 byReader 字段的某格非 null 而没有任何读取者读它 → WARN（不判失败）
// ③ 判定里引用的组件、字段、条目、规则键在全书找不到定义 → FAIL；判定无法求值 → FAIL
// 数据来源：全书各卷正文（各卷"## 附录"之前）里的物品模板示例行、物种 JSON 行、规则 JSON 行；材料格取卷三甲 §4.5.5 例 11 的逐格表
import { readFileSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const DIR = 'F:/dnd/docs/统一底层设计/';
const JIA = '卷三甲-物质本源.md';

export function runReaderCheck(jiaPath = DIR + JIA, dir = DIR) {
  const out = []; let fail = 0;
  const say = (ok, msg) => { if (!ok) fail++; out.push((ok ? 'PASS ' : 'FAIL ') + msg); };
  const warn = (msg) => out.push('WARN ' + msg);
  const read = (p) => { const ls = readFileSync(p, 'utf8').replace(/\r\n/g, '\n').split('\n'); const c = ls.findIndex((l) => l.startsWith('## 附录')); return c >= 0 ? ls.slice(0, c) : ls; };
  const jia = read(jiaPath);
  const books = readdirSync(dir).filter((f) => /^卷.*\.md$/.test(f)).map((f) => ({ f, lines: f === JIA ? jia : read(dir + f) }));
  const allLines = books.flatMap((b) => b.lines);
  const cells = (l) => l.split('|').slice(1, -1).map((c) => c.trim());
  const ticks = (s) => [...s.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  const zone = (ls, startRe) => { const s = ls.findIndex((l) => startRe.test(l)); if (s < 0) return []; const lvl = ls[s].match(/^#+/)[0].length; let e = ls.findIndex((l, i) => i > s && /^#+ /.test(l) && l.match(/^#+/)[0].length <= lvl); if (e < 0) e = ls.length; return ls.slice(s, e); };

  // 登记表
  const regRows = zone(jia, /^### 2\.6 /).filter((l) => /^\| \d+ \|/.test(l)).map(cells).map((c) => ({ no: c[0], reader: c[1], dims: ticks(c[2]), judge: c[3], refs: ticks(c[3]) }));
  say(regRows.length > 0, '§2.6 物性格读取登记表解析到 ' + regRows.length + ' 个读取者');

  // byReader 字段（§2.1）与材料全集（§4.5 大表）
  const byReaderDims = new Set(zone(jia, /^### 2\.1 /).filter((l) => /^\| `[^`]+` \|/.test(l) && cells(l).some((c) => /^byReader/.test(c))).map((l) => ticks(cells(l)[0])[0]));
  const z45 = zone(jia, /^### 4\.5 /);
  const mats = new Set(z45.filter((l) => /^\| mat_[a-z0-9_]+ \|/.test(l)).map((l) => cells(l)[0]));
  // 逐格表：表头含"字段"与"值"的表
  const cellVal = new Map(); const refFrom = []; let inCellTable = false;
  for (const l of z45) {
    if (!l.startsWith('|')) { inCellTable = false; continue; }
    const c = cells(l);
    if (c[0] === '代号' && c[2] === '字段' && c[3] === '值') { inCellTable = true; continue; }
    if (inCellTable && /^mat_/.test(c[0])) {
      const field = ticks(c[2])[0]; if (!field) continue;
      cellVal.set(c[0] + '|' + field, c[3] === 'null' ? null : c[3]);
      const rm = c[4] === 'B' ? (c[c.length - 1].match(/`refMaterial: (mat_[a-z0-9_]+)`/) ?? [])[1] : null; // B 级"照抄参照行"：本格值取自参照行同字段
      if (rm) refFrom.push([c[0] + '|' + field, rm + '|' + field]);
    }
  }
  out.push('     byReader 字段：' + [...byReaderDims].join('、') + '；材料全集 ' + mats.size + ' 行；逐格表 ' + cellVal.size + ' 格');

  // ③ 判定里每个代号须在全书有定义（表行键、JSON 键、类型化字段、组件 requires 定义、规则键路径末段）
  const isDefined = (tok) => {
    if (/^rules\./.test(tok)) { const k = tok.split('.').pop(); return allLines.some((l) => l.includes('"' + k + '":')); }
    const e = tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp('^\\| `' + e + '` \\||"' + e + '"\\s*:|`' + e + ': |`' + e + '`（requires|struct\\{[^}]*\\b' + e + ': ');
    return allLines.some((l) => re.test(l));
  };
  for (const r of regRows) {
    const undef = r.refs.filter((t) => !isDefined(t));
    say(undef.length === 0, '§2.6 第 ' + r.no + ' 行判定引用的代号都有定义' + (undef.length ? '（缺：' + undef.join('、') + '）' : ''));
    const badDim = r.dims.filter((d) => !byReaderDims.has(d.split('.')[0]));
    say(badDim.length === 0, '§2.6 第 ' + r.no + ' 行读的物性格都是 §2.1 的 byReader 字段' + (badDim.length ? '（不是：' + badDim.join('、') + '）' : ''));
  }

  // 数据：物品模板示例、组件 requires、物种组织、组织层序、规则键
  const items = [];
  for (const l of allLines) {
    const m = l.match(/`(item_[a-z0-9_]+)`[^`{]*：`\{(.*)\}`/); if (!m) continue;
    const body = m[2];
    const cm = body.match(/classes:\[([^\]]*)\]/);
    items.push({ id: m[1], classes: cm ? cm[1].split(',').map((s) => s.trim()) : null, body,
      mats: [...body.matchAll(/materialRef:(mat_[a-z0-9_]+)/g)].map((x) => x[1]), accepts: /acceptsMaterial:/.test(body) });
  }
  const requiresOf = (comp) => { const l = allLines.find((x) => x.includes('`' + comp + '`（requires')); if (!l) return null; const seg = l.split('`' + comp + '`（requires')[1].split(/[；）]/)[0]; return ticks(seg); };
  const hasClass = (it, comp) => {
    if (it.classes) return it.classes.includes(comp);
    const req = requiresOf(comp); // classes 省略写作 {...} 的示例：按该组件 requires 的字段是否全部在行上判
    return !!req && req.length > 0 && req.every((k) => new RegExp('[{,\\s]' + k + ':').test(it.body));
  };
  const species = [];
  for (const l of allLines) { const m = l.match(/"tissues"\s*:\s*\{([^}]*)\}/); if (m) species.push([...m[1].matchAll(/"(tissue_[a-z0-9_]+)"\s*:\s*"(mat_[a-z0-9_]+)"/g)].map((x) => [x[1], x[2]])); }
  const depthOf = (t) => { const l = allLines.find((x) => new RegExp('"' + t + '"\\s*:\\s*\\{[^}]*"depthOrder"\\s*:\\s*\\d+').test(x)); return l ? Number(l.match(new RegExp('"' + t + '"\\s*:\\s*\\{[^}]*"depthOrder"\\s*:\\s*(\\d+)'))[1]) : null; };
  const ruleVal = (path) => { const ks = path.split('.'); const k = ks.pop(), parent = ks.pop(); const l = allLines.find((x) => x.includes('"' + parent + '"') && new RegExp('"' + k + '"\\s*:\\s*-?\\d').test(x)); return l ? Number(l.match(new RegExp('"' + k + '"\\s*:\\s*(-?[\\d.]+)'))[1]) : null; };

  // 判定求值：按判定引用的代号选求值法；返回该读取者读到的材料行集合（真或未知），求不出值返回 null
  const evalReader = (r) => {
    const comp = r.refs.find((t) => /^comp_/.test(t));
    const req = r.refs.find((t) => /^req_/.test(t));
    const rulePath = r.refs.find((t) => /^rules\./.test(t));
    if (comp && r.refs.includes('materialRef')) {
      const hit = new Set(); const its = items.filter((it) => hasClass(it, comp));
      for (const it of its) { if (it.accepts && r.refs.includes('acceptsMaterial')) { mats.forEach((m) => hit.add(m)); out.push('     ' + it.id + ' 带 acceptsMaterial，条件按未知计，全集各行都进第 ' + r.no + ' 行'); } it.mats.forEach((m) => hit.add(m)); }
      out.push('     第 ' + r.no + ' 行：挂 ' + comp + ' 的物品模板 ' + its.map((i) => i.id).join('、'));
      return hit;
    }
    if (r.refs.includes('tissues') && r.refs.includes('depthOrder') && rulePath) {
      const cd = ruleVal(rulePath); const hit = new Set();
      // 部位组织材料按卷四 B-9（C15-7）优先级：个体 tissueDelta → 身体图部位 tissueOverride → 物种 tissues。
      // tissueDelta 是运行期写入（§2.6 第 2 行"运行期写入"栏，由其写者在写入时核 M-23 ③），加载期没有数据，不在这里求；
      // 身体图 tissueOverride 与物种 tissues 都是加载期数据，两支都求。物种 tissues 取并集（某组织在其身体图所有部位都被覆盖时它实际读不到，取并集只会多要求、不会漏）。
      const overrides = [];
      for (const l of allLines) for (const m of l.matchAll(/"tissueOverride"\s*:\s*\{([^}]*)\}/g)) overrides.push(...[...m[1].matchAll(/"(tissue_[a-z0-9_]+)"\s*:\s*"(mat_[a-z0-9_]+)"/g)].map((x) => [x[1], x[2]]));
      for (const [t, m] of [...species.flat(), ...overrides]) { const d = depthOf(t); if (d === null || cd === null || d <= cd) hit.add(m); }
      out.push('     第 ' + r.no + ' 行：' + rulePath + ' = ' + cd + '；物种组织映射 ' + species.flat().map(([t, m]) => t + '→' + m).join('、') + '；身体图 tissueOverride ' + (overrides.length ? overrides.map(([t, m]) => t + '→' + m).join('、') : '无数据'));
      return hit;
    }
    if (req) { // 需求块：卷二 §1.13 格式、卷三乙 §4.7 选择器语义；判定写明第 n 组只取该组，否则取全部组
      const gm = r.judge.match(/第 (\d+) 组/);
      return evalReq(req, gm ? Number(gm[1]) : null, r.no, new Set());
    }
    return null;
  };
  // 材料行的派生大类与类别：卷三乙 §4.1.5 逐材料派生表（"预期派生大类""预期类别"两栏；该表由卷三乙自检按规则复算）
  const yi = books.find((b) => b.f.startsWith('卷三乙'))?.lines ?? [];
  const matCat = new Map(), matCls = new Map(); let ci = -1, ki = -1;
  for (const l of zone(yi, /^### 4\.1 /)) {
    if (!l.startsWith('|')) { ci = -1; continue; }
    const c = cells(l);
    if (c[0] === '材料') { ci = c.indexOf('预期派生大类'); ki = c.indexOf('预期类别'); continue; }
    if (ci >= 0 && /^mat_/.test(c[0])) { matCat.set(c[0], new Set(c[ci].match(/matcat_[a-z0-9_]+/g) ?? [])); matCls.set(c[0], new Set(c[ki].match(/class_[a-z0-9_]+/g) ?? [])); }
  }
  const vocabDefined = (tok) => allLines.some((l) => l.startsWith('|') && cells(l).includes('`' + tok + '`')) || isDefined(tok);
  function evalReq(req, groupNo, no, seen) {
    if (seen.has(req)) { say(false, '§2.6 第 ' + no + ' 行需求块嵌套成环：' + req); return new Set(); }
    seen.add(req);
    const l = allLines.find((x) => new RegExp('^\\{"' + req + '"\\s*:').test(x.trim()));
    if (!l) { out.push('     ' + req + ' 没有 JSON 条目，判定不可求值'); return null; }
    let entry; try { entry = JSON.parse(l.trim())[req]; } catch { out.push('     ' + req + ' 条目 JSON 解析失败'); return null; }
    const groups = groupNo === null ? entry.groups : [entry.groups?.[groupNo]];
    if (!groups || groups.some((g) => !Array.isArray(g))) { say(false, '§2.6 第 ' + no + ' 行引用的 ' + req + ' 第 ' + groupNo + ' 组不存在'); return new Set(); }
    const hit = new Set(); let unknownAll = false;
    for (const cand of groups.flat()) {
      for (const t of cand.matcats ?? []) { say(vocabDefined(t), '§2.6 第 ' + no + ' 行 ' + req + ' 的派生大类 ' + t + ' 有定义'); for (const [m, s] of matCat) if (s.has(t)) hit.add(m); }
      for (const t of cand.classes ?? []) { say(vocabDefined(t), '§2.6 第 ' + no + ' 行 ' + req + ' 的类别 ' + t + ' 有定义'); for (const [m, s] of matCls) if (s.has(t)) hit.add(m); }
      for (const t of cand.items ?? []) { const it = items.find((i) => i.id === t); say(!!it, '§2.6 第 ' + no + ' 行 ' + req + ' 的物品 ' + t + ' 有模板'); it?.mats.forEach((m) => hit.add(m)); }
      if (cand.where) unknownAll = true; // RX 条件本检查不求值，按未知计：全集各行都进
      if (cand.req) { const sub = evalReq(cand.req, null, no, seen); if (sub === null) return null; sub.forEach((m) => hit.add(m)); }
    }
    if (unknownAll) { mats.forEach((m) => hit.add(m)); out.push('     ' + req + ' 带 where 条件，按未知计，全集各行都进第 ' + no + ' 行'); }
    out.push('     第 ' + no + ' 行：' + req + (groupNo === null ? '' : ' 第 ' + groupNo + ' 组') + ' 接受 ' + [...hit].join('、'));
    return hit;
  }

  const required = new Map(); // mat|dim -> 读取者编号列表
  for (const r of regRows) {
    const hit = evalReader(r);
    say(hit !== null, '§2.6 第 ' + r.no + ' 行材料行判定可求值');
    if (!hit) continue;
    const outside = [...hit].filter((m) => !mats.has(m));
    if (outside.length) out.push('     第 ' + r.no + ' 行读到不在 §4.5 全集的材料：' + outside.join('、'));
    for (const m of hit) if (mats.has(m)) for (const d of r.dims) { const k = m + '|' + d; required.set(k, [...(required.get(k) ?? []), r.no]); }
  }
  // ①
  const nulls = [...required.keys()].filter((k) => !cellVal.has(k) || cellVal.get(k) === null);
  say(required.size > 0 && nulls.length === 0, '① 派生必填 ' + required.size + ' 格都非 null' + (nulls.length ? '（null 或缺：' + nulls.map((k) => k.replace('|', '.') + '←第' + required.get(k).join('、') + '行').join('；') + '）' : ''));
  out.push('     派生必填：' + [...required.keys()].map((k) => k.replace('|', '.')).join('、'));
  // ② 为什么只判 WARN（卷三甲 M-23 ① 对"无读取者却写了值"定为 E-MAT-UNREAD-WRITTEN，是 error）：
  //    M-23 的对象是加载器读的 material.json 数据行；本检查读的是卷三甲 §4.5.5 例 11 的逐格示例表，它是成稿里的参照取值与出处，不是数据文件。
  //    示例表里某格有值而暂无读取者，只说明数据落盘时这一格须按 M-23 ① 写 null 或先登记读取者，不说明卷文写错，所以这里提示不判失败；error 由加载器对真数据判。
  //    被 B 级 refMaterial 引用的格算有读取者：只在引用它的那一格本身有读取者（在派生必填集合里，或已按本条算作有读取者）时成立，沿引用链传递；
  //    引用方自己没有读取者的，被引用格照旧提示，力度不降。
  const readSet = new Set(required.keys());
  for (let grew = true; grew;) { grew = false; for (const [from, to] of refFrom) if (readSet.has(from) && !readSet.has(to)) { readSet.add(to); grew = true; } }
  const viaRef = [...readSet].filter((k) => !required.has(k));
  if (viaRef.length) out.push('     经 B 级参照算有读取者：' + viaRef.map((k) => k.replace('|', '.') + '←' + refFrom.filter(([f, t]) => t === k && readSet.has(f)).map(([f]) => f.replace('|', '.')).join('、')).join('；'));
  const unread = [...cellVal.entries()].filter(([k, v]) => v !== null && byReaderDims.has(k.split('|')[1]) && !readSet.has(k)).map(([k]) => k.replace('|', '.'));
  if (unread.length) warn('② 非 null 而没有读取者读的格 ' + unread.length + ' 个：' + unread.join('、'));
  else out.push('PASS ② 没有非 null 而无读取者读的格');
  return { out, fail };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = runReaderCheck(process.argv[2] || undefined, process.argv[3] || undefined); // 第二参数：其余各卷所在目录（注入反测用副本目录）
  console.log(r.out.join('\n'));
  console.log(r.fail === 0 ? '读取者派生检查：失败 0' : '读取者派生检查：失败 ' + r.fail);
  process.exitCode = r.fail === 0 ? 0 : 1;
}
