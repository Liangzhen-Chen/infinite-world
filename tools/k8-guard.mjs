// K8 守门：只报不拦（退出码恒为 0）。三条检查：
//   G1 文案承诺可产出：unread-field（实体表的字段没有规律读取）、origin-not-produced（写了产地，产地那里没有产出路径）
//   G2 参数必须有消费者：balance 参数/行无引用（unwired-param）；代码 `rules.x ?? 缺省` 而数据里没有（rules-default）
//   G3 动作不能只有壳：登记动作的旧外壳（legacy-shell）；server-plugin 里写死的物品 id 字面量（item-id-literal）
// 判据全是通用规则：不内置任何字段名单或 id 名单。只读静态文件，不加载运行时代码，同一棵树两次输出逐字节相同。
// 用法：node tools/k8-guard.mjs --root <仓库目录> --json <输出文件> [--md <输出文件>]
// 豁免：只认被豁免位置所在行或上一行的注释 `// k8-exempt: Gx <id> reason=<为什么> review=<YYYY-MM-DD>`。
// 下线：docs/审查/K8-标注.md 中含“检查名”“误报率”两列的表；取最后一张表；某检查误报率 > 20% 则 online=false；写成“G1.规则”的行只让该规则移出 count（offlineRules）。
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const slash = p => p.split(path.sep).join('/');
const readJSON = file => {try {return JSON.parse(fs.readFileSync(file, 'utf8'));} catch {return null;}};
const byStr = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
function walkFiles(dir, test) {
    const out = [];
    let entries = [];
    try {entries = fs.readdirSync(dir, {withFileTypes: true});} catch {return out;}
    for (const e of entries.sort((a, b) => byStr(a.name, b.name))) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {if (e.name !== 'node_modules') out.push(...walkFiles(full, test));}
        else if (test(e.name)) out.push(full);
    }
    return out;
}

// ---------- JS 扫描：去掉注释与字符串内容，收集字面量、注释、模板插值范围 ----------
const REGEX_PREV = new Set('(,=:[!&|?{};+-*%<>~^'.split(''));
const REGEX_KEYWORDS = new Set(['return', 'typeof', 'case', 'in', 'of', 'void', 'delete', 'throw', 'new', 'else', 'do', 'yield', 'await', 'instanceof']);
export function scanJS(src) {
    const n = src.length, code = src.split(''), interp = new Uint8Array(n), literals = [], comments = [];
    const lineStarts = [0];
    for (let i = 0; i < n; i++) if (src[i] === '\n') lineStarts.push(i + 1);
    const lineOf = pos => {let lo = 0, hi = lineStarts.length - 1; while (lo < hi) {const mid = (lo + hi + 1) >> 1; if (lineStarts[mid] <= pos) lo = mid; else hi = mid - 1;} return lo + 1;};
    const blank = (a, b) => {for (let k = a; k < b; k++) if (code[k] !== '\n') code[k] = ' ';};
    // stack: {t:'code', depth} | {t:'tpl'}
    const stack = [{t: 'code', depth: 0}];
    let i = 0, prevSig = '', prevWord = '', tplDepth = 0;
    let tpl = null; // current template record stack
    const tplStack = [];
    while (i < n) {
        const top = stack[stack.length - 1];
        if (top.t === 'tpl') {
            // inside template static text
            const segStart = i;
            let text = '';
            while (i < n && src[i] !== '`' && !(src[i] === '$' && src[i + 1] === '{')) {
                if (src[i] === '\\') {text += src[i + 1] ?? ''; i += 2;} else {text += src[i]; i++;}
            }
            blank(segStart, i);
            tpl.segments.push(text);
            if (src[i] === '`') {
                i++; stack.pop(); tplDepth--;
                const rec = tplStack.pop();
                literals.push({kind: 'tpl', value: rec.segments.length === 1 ? rec.segments[0] : null, head: rec.segments[0], segments: rec.segments, start: rec.start, end: i, line: lineOf(rec.start)});
                tpl = tplStack[tplStack.length - 1] ?? null;
                prevSig = '`'; prevWord = '';
            } else if (i < n) {
                i += 2; stack.push({t: 'code', depth: 0, inTpl: true}); prevSig = '{'; prevWord = '';
            }
            continue;
        }
        const c = src[i], d = src[i + 1];
        if (top.inTpl) interp[i] = 1;
        if (c === '/' && d === '/') {
            const s = i; while (i < n && src[i] !== '\n') i++;
            comments.push({text: src.slice(s + 2, i), line: lineOf(s)}); blank(s, i); continue;
        }
        if (c === '/' && d === '*') {
            const s = i, e = src.indexOf('*/', i + 2), stop = e < 0 ? n : e + 2;
            const body = src.slice(s + 2, e < 0 ? n : e);
            body.split('\n').forEach((t, k) => comments.push({text: t, line: lineOf(s) + k}));
            blank(s, stop); i = stop; continue;
        }
        if (c === '\'' || c === '"') {
            const s = i; let value = ''; i++;
            while (i < n && src[i] !== c && src[i] !== '\n') {if (src[i] === '\\') {value += src[i + 1] ?? ''; i += 2;} else {value += src[i]; i++;}}
            i++;
            literals.push({kind: 'str', value, start: s, end: i, line: lineOf(s)});
            blank(s + 1, i - 1);
            if (top.inTpl) for (let k = s; k < i && k < n; k++) interp[k] = 1;
            prevSig = c; prevWord = ''; continue;
        }
        if (c === '`') {
            i++; stack.push({t: 'tpl'}); tplDepth++;
            tpl = {start: i - 1, segments: []}; tplStack.push(tpl); continue;
        }
        if (c === '/' && (prevSig === '' || REGEX_PREV.has(prevSig) || REGEX_KEYWORDS.has(prevWord))) {
            const s = i; i++; let inClass = false;
            while (i < n && src[i] !== '\n') {
                if (src[i] === '\\') {i += 2; continue;}
                if (src[i] === '[') inClass = true; else if (src[i] === ']') inClass = false;
                else if (src[i] === '/' && !inClass) break;
                i++;
            }
            i++; while (i < n && /[a-z]/i.test(src[i])) i++;
            blank(s + 1, i); prevSig = '/'; prevWord = ''; continue;
        }
        if (c === '{') top.depth++;
        else if (c === '}') {
            if (top.inTpl && top.depth === 0) {stack.pop(); interp[i] = 1; i++; continue;}
            top.depth--;
        }
        if (/[A-Za-z_$]/.test(c)) {
            const s = i; while (i < n && /[\w$]/.test(src[i])) i++;
            prevWord = src.slice(s, i); prevSig = 'w';
            if (top.inTpl) for (let k = s; k < i; k++) interp[k] = 1;
            continue;
        }
        if (!/\s/.test(c)) {prevSig = c; prevWord = '';}
        i++;
    }
    return {code: code.join(''), interp, literals, comments, lineOf};
}

// ---------- 树上的文件 ----------
function codeFiles(root, dir) {return walkFiles(path.join(root, dir), name => /\.(m?js|cjs)$/.test(name) && !/\.test\.m?js$/.test(name));}
function relOf(root, file) {return slash(path.relative(root, file));}

// 实体表 = 运行时真正加载的 world/ JSON（其路径出现在加载器或 server-plugin 的字面量里）里、由带 id 的对象组成的数组
function liveDataFiles(root, scans) {
    const lits = new Set(), dirs = [];
    for (const s of scans) for (const l of s.scan.literals) {
        if (l.kind === 'str' && /\.json$/.test(l.value)) lits.add(l.value.replace(/^\.?\//, ''));
        if (l.kind === 'tpl' && l.segments.length > 1 && /\.json$/.test(l.segments[l.segments.length - 1])) dirs.push({head: l.head, tail: l.segments[l.segments.length - 1], line: l.line, file: s.file});
    }
    const sameLineNames = new Map();
    for (const s of scans) for (const l of s.scan.literals) if (l.kind === 'str') {const k = s.file + ':' + l.line; (sameLineNames.get(k) ?? sameLineNames.set(k, new Set()).get(k)).add(l.value);}
    const worldRoot = path.join(root, 'world');
    const files = walkFiles(worldRoot, name => name.endsWith('.json'));
    const live = [];
    for (const f of files) {
        const rel = slash(path.relative(worldRoot, f));
        let ok = [...lits].some(v => v === rel || v.endsWith('/' + rel) || v === 'world/' + rel);
        if (!ok) for (const d of dirs) {
            const dirPart = d.head.replace(/^\.?\//, '').replace(/^world\//, '');
            if (!rel.startsWith(dirPart) || !rel.endsWith(d.tail)) continue;
            const stem = rel.slice(dirPart.length, rel.length - d.tail.length);
            if (stem && !stem.includes('/') && sameLineNames.get(d.file + ':' + d.line)?.has(stem)) {ok = true; break;}
        }
        if (ok) live.push(rel);
    }
    return live.sort(byStr);
}
function entityTables(json) {
    const isRecords = a => Array.isArray(a) && a.length > 0 && a.every(x => isObj(x) && typeof x.id === 'string');
    if (isRecords(json)) return [['', json]];
    if (!isObj(json)) return [];
    return Object.entries(json).filter(([, v]) => isRecords(v));
}

// ---------- G1 ----------
function fieldReads(scans) {
    const reads = new Map(); // name -> {law, prompt, sites:[]}
    const add = (name, file, line, prompt) => {
        const r = reads.get(name) ?? reads.set(name, {law: 0, prompt: 0, sites: []}).get(name);
        if (prompt) r.prompt++; else r.law++;
        r.sites.push(`${file}:${line}${prompt ? '(prompt)' : ''}`);
    };
    for (const {file, scan} of scans) {
        const {code, interp, literals, lineOf, src} = scan;
        // 只拼文本的读取：在模板插值里，或与字符串字面量直接用 + 连接
        const isText = (start, end) => {
            if (interp[start]) return true;
            let b = end; const mm = code.slice(b, b + 20).match(/^\s*\?\?\s*(['"])\s*\1/); if (mm) b += mm[0].length;
            if (/^\s*\+\s*['"`]/.test(code.slice(b, b + 60))) return true;
            let a = start - 1; while (a >= 0 && /[\w$.?]/.test(code[a])) a--;
            return /['"`]\s*\+\s*$/.test(code.slice(Math.max(0, a - 60), a + 1));
        };
        // 成员读取 .name / ?.name
        const re = /(\?\.|(?<!\.)\.)\s*([A-Za-z_$][\w$]*)/g;
        let m;
        while ((m = re.exec(code))) {
            const start = m.index, end = re.lastIndex, name = m[2];
            if (start > 0 && /\d/.test(code[start - 1]) && m[1] === '.') continue;
            const rest = code.slice(end, end + 3);
            if (/^\s*\(/.test(rest)) continue;              // 方法调用
            if (/^\s*=(?![=>])/.test(rest)) continue;       // 写入
            add(name, file, lineOf(start), isText(start, end));
        }
        // 方括号读取 x['name']
        for (const l of literals) if (l.kind === 'str') {
            const before = code.slice(Math.max(0, l.start - 3), l.start), after = code.slice(l.end, l.end + 3);
            if (/[\w$)\]]\s*\[\s*$|\?\.\[\s*$/.test(before) && /^\s*\]/.test(after) && /^[A-Za-z_$][\w$]*$/.test(l.value))
                add(l.value, file, l.line, Boolean(interp[l.start]));
        }
        // 解构读取 const {a,b:c}=x / ({a,b})=>
        const dre = /(?:\b(?:const|let|var)\s*\{([^{}]*)\}\s*=(?!=))|(?:\(\s*\{([^{}]*)\}\s*(?:=[^,)]*)?[,)])/g;
        while ((m = dre.exec(code))) {
            const body = m[1] ?? m[2];
            for (const part of body.split(',')) {const k = part.trim().match(/^([A-Za-z_$][\w$]*)/); if (k && !part.trim().startsWith('...')) add(k[1], file, lineOf(m.index), false);}
        }
    }
    return reads;
}

function locationIndex(root) {
    const locs = readJSON(path.join(root, 'world/geo/locations.json')) ?? [];
    const settlements = readJSON(path.join(root, 'world/geo/settlements.json')) ?? [];
    const parent = new Map();
    for (const l of [...settlements, ...locs]) if (l?.id) {const p = typeof l.parent === 'string' ? l.parent : l.parent?.id ?? null; if (!parent.has(l.id) || p) parent.set(l.id, p);}
    const lineage = id => {const out = []; const seen = new Set(); let at = id; while (at && !seen.has(at)) {seen.add(at); out.push(at); at = parent.get(at);} return out;};
    return {locs, parent, lineage, has: id => parent.has(id)};
}

// 产出路径：配方产出（含副产物）、据点再生、生态掉落（野生/怪物）、采集（采矿/渔获）、农业、私田、畜牧、家户觅食。
// 每条路径带地点集合（null 表示不限地点）与投入（用于可再生闭包：投入本身拿不到，这条路径就走不通）。
function productionPaths(root, items, scans) {
    const W = f => readJSON(path.join(root, 'world', f));
    const R = W('meta/rules.json') ?? {}, D = W('rules/tables/domain-rules.json') ?? {};
    const locs = W('geo/locations.json') ?? [];
    const itemIds = new Set(items.map(i => i.id));
    const asItem = v => typeof v === 'string' ? v : v?.item;
    const paths = [];
    const push = (kind, outputs, where, inputs = []) => {
        const outs = outputs.map(asItem).filter(x => itemIds.has(x));
        if (outs.length) paths.push({kind, outputs: outs, where, inputs: inputs.map(asItem).filter(Boolean)});
    };
    const wsAt = new Map();
    for (const l of locs) for (const s of l.workstations ?? []) (wsAt.get(s.kind) ?? wsAt.set(s.kind, []).get(s.kind)).push(l.id);
    for (const r of W('meta/recipes.json') ?? []) {
        const where = r.location ? [r.location] : r.workstation ? (wsAt.get(r.workstation) ?? []) : null;
        push('recipe:' + r.id, [r.output, ...(r.byproducts ?? [])], where, [...(r.materials ?? []), ...(r.tools ?? [])]);
    }
    for (const l of locs) {
        const regrow = new Set((l.site?.changes ?? []).filter(c => c.kind === 'regrow').map(c => c.resource));
        for (const res of l.site?.resources ?? []) if (regrow.has(res.id)) push('site-regrow:' + l.id, [res.item], [l.id], [res.gather?.tool].filter(Boolean));
    }
    const habitatAt = new Map((R.wildlife?.habitats ?? []).map(h => [h.id, h.location]));
    for (const m of [...(W('meta/monsters.json') ?? []), ...(W('meta/bosses.json') ?? [])]) {
        const loc = habitatAt.get(m.wildlife?.habitat);
        push('drop:' + m.id, m.drops ?? [], loc ? [loc] : null);
    }
    const mining = R.extraction?.mining;
    if (mining) {
        for (const t of mining.terrain ?? []) push('mining:' + t.tag, t.minerals ?? [], locs.filter(l => [l.terrain].flat().includes(t.tag)).map(l => l.id), [mining.tool]);
        for (const [loc, rows] of Object.entries(mining.locations ?? {})) push('mining:' + loc, rows, [loc], [mining.tool]);
    }
    const fishing = R.extraction?.fishing;
    if (fishing?.product) push('fishing', [fishing.product], null, [fishing.tool, fishing.bait]);
    if (R.agriculture?.grainItem) push('agriculture', [R.agriculture.grainItem], (R.agriculture.settlements ?? []).flatMap(s => [s.fieldLocation, s.settlement]).filter(Boolean));
    for (const c of D.privateField?.crops ?? []) push('private-field', [c.product], null, [c.seed]);
    if (R.householdSubsistence?.foodItem) push('forage', [R.householdSubsistence.foodItem], null);
    const species = W('ecology/species.json');
    for (const s of (Array.isArray(species) ? species : species?.species) ?? []) {
        const ys = Object.values(s.husbandry?.yields ?? {}).flat();
        push('husbandry:' + s.id, ys, null, [s.husbandry?.feed].flat().filter(Boolean));
        // 畜产物由物种属性派生时（物品以 animalProduct.from 指向某个生理属性），按数据契约推出产出：物种具备该属性且满足 when 即产
        const h = s.husbandry;
        if (!isObj(h)) continue;
        const attr = from => from === 'laying' ? h.layingIntervalDays : from === 'carcass' ? h.bodyMassKg ?? s.bodyMassKg : h[from];
        const fits = when => Object.entries(when ?? {}).every(([k, want]) => {const have = k === 'tags' ? s.tags ?? [] : [h[k]].flat(); return [want].flat().some(w => have.includes(w));});
        const derived = items.filter(i => isObj(i.animalProduct) && ![undefined, null, 0, false].includes(attr(i.animalProduct.from)) && fits(i.animalProduct.when)).map(i => i.id);
        push('husbandry-derived:' + s.id, derived, null, [h.feed?.item ?? h.feed].flat().filter(v => typeof v === 'string'));
    }
    // 引擎账本声明的再生/收获/制造来源（declareLedgerWriter 的 sources 里具体点名的物品），不限地点、无数据投入
    for (const {file, scan} of scans) {
        const re = /declareLedgerWriter\(\s*'([^']+)'\s*,\s*\{\s*sources\s*:\s*\{/g; let m;
        while ((m = re.exec(scan.src))) {
            const body = scan.src.slice(re.lastIndex, braceEnd(scan.src, re.lastIndex - 1));
            const sre = /'src:(regrowth|harvest|craft)'\s*:\s*\{([^{}]*)\}/g; let s;
            while ((s = sre.exec(body))) {
                const keys = [...s[2].matchAll(/(?:^|,)\s*(?:'([^']+)'|([A-Za-z_$][\w$]*))\s*:/g)].map(k => k[1] ?? k[2]);
                push(`ledger:${m[1]}:src:${s[1]}`, keys, null);
            }
        }
    }
    // 抄写类：带 book 结构的物品可由持有原本者抄写；投入取实现抄写的函数（读 .book 且所在模块调用 produceItems）里引用的物品
    const bookItems = items.filter(i => isObj(i.book)).map(i => i.id);
    if (bookItems.length) for (const {scan} of scans) {
        if (!/\bproduceItems\s*\(/.test(scan.code) || !/\.book\b/.test(scan.code)) continue;
        const constItems = new Map();
        const cre = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:Object\.freeze\(\s*)?\{/g; let m;
        while ((m = cre.exec(scan.code))) {
            const body = scan.src.slice(cre.lastIndex, braceEnd(scan.code, cre.lastIndex - 1));
            for (const k of body.matchAll(/([A-Za-z_$][\w$]*)\s*:\s*'([^']+)'/g)) if (itemIds.has(k[2])) constItems.set(`${m[1]}.${k[1]}`, k[2]);
        }
        const fre = /\bfunction\s+[A-Za-z_$][\w$]*\s*\([^)]*\)\s*\{/g;
        while ((m = fre.exec(scan.code))) {
            const end = braceEnd(scan.code, fre.lastIndex - 1), code = scan.code.slice(fre.lastIndex, end), src = scan.src.slice(fre.lastIndex, end);
            const constNames = new Set([...constItems.keys()].map(k => k.split('.')[0]));
            if (![...code.matchAll(/([A-Za-z_$][\w$]*)\s*\??\.book\b/g)].some(r => !constNames.has(r[1]))) continue;
            const inputs = new Set([...code.matchAll(/([A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]*)/g)].map(r => constItems.get(r[1])).filter(Boolean));
            for (const l of src.matchAll(/'([^']+)'/g)) if (itemIds.has(l[1])) inputs.add(l[1]);
            if (inputs.size) push('book-copy', bookItems, null, [...inputs].sort(byStr));
        }
    }
    // 可再生闭包：没有投入的路径直接成立；有投入的，投入都可再生才成立
    const renewable = new Set();
    let changed = true;
    while (changed) {
        changed = false;
        for (const p of paths) {
            if (p.ok) continue;
            if (p.inputs.every(x => renewable.has(x))) {p.ok = true; changed = true; for (const o of p.outputs) renewable.add(o);}
        }
    }
    for (const p of paths) if (!p.ok) p.broken = [...new Set(p.inputs.filter(x => !renewable.has(x)))].sort(byStr);
    return paths;
}
function braceEnd(text, open) {
    let depth = 0;
    for (let i = open; i < text.length; i++) {if (text[i] === '{') depth++; else if (text[i] === '}' && --depth === 0) return i;}
    return text.length;
}

function checkG1(root, scans, otherScans, liveFiles) {
    const findings = [];
    const reads = fieldReads(scans.filter(s => s.file.startsWith('server-plugin/')));
    const ui = fieldReads(otherScans.filter(s => s.file.startsWith('extension/')));
    // tools/ 里的读取（校验、审计、构建报告、本工具）不算消费者，不扫
    const n = (m, f) => {const r = m.get(f); return r ? r.law + r.prompt : 0;};
    for (const rel of liveFiles) {
        const json = readJSON(path.join(root, 'world', rel));
        for (const [key, records] of entityTables(json)) {
            const table = rel.replace(/\.json$/, '') + (key ? '#' + key : '');
            const count = new Map();
            for (const r of records) for (const f of Object.keys(r)) (count.get(f) ?? count.set(f, []).get(f)).push(r.id);
            for (const [field, ids] of [...count].sort((a, b) => byStr(a[0], b[0]))) {
                const r = reads.get(field) ?? {law: 0, prompt: 0};
                if (r.law > 0) continue;
                const sample = [...ids].sort(byStr).slice(0, 3).join('、'), uiN = n(ui, field);
                // 消费者只认 server-plugin（规律）与 extension（界面/提示词）：都不读 → dead-field；
                // 只拼提示词/界面文本 → prompt-only-field（只供人工复核，不计数）
                const dead = r.prompt + uiN === 0;
                findings.push({check: 'G1', rule: dead ? 'dead-field' : 'prompt-only-field', group: `${table}.${field}`, path: `world/${rel}`, id: `${table}.${field}`,
                    detail: `${ids.length} 条记录带字段 ${field}（例：${sample}），规律读取 0，promptOnly ${r.prompt}，界面 ${uiN}`, exempt: false});
            }
        }
    }
    // origin-not-produced
    const items = readJSON(path.join(root, 'world/meta/items.json')) ?? [];
    const L = locationIndex(root);
    const all = productionPaths(root, items, scans.filter(s => s.file.startsWith('server-plugin/')));
    const pathsFor = new Map(), brokenFor = new Map();
    for (const p of all) for (const o of p.outputs) {const m = p.ok ? pathsFor : brokenFor; (m.get(o) ?? m.set(o, []).get(o)).push(p);}
    for (const it of items) {
        if (typeof it.origin !== 'string' || !it.origin) continue;
        const o = it.origin;
        let detail;
        if (!L.has(o)) detail = `产地 ${o} 在地点表里不存在`;
        else {
            const own = pathsFor.get(it.id) ?? [];
            const here = own.some(p => p.where === null || p.where.some(w => L.lineage(w).includes(o) || L.lineage(o).includes(w)));
            if (here) continue;
            const broken = (brokenFor.get(it.id) ?? []).sort((a, b) => byStr(a.kind, b.kind));
            if (own.length) detail = `【产地不产、别处产】产地 ${o} 那里没有可走通的产出路径，别处有 ${own.length} 条：${own.map(p => p.kind).sort(byStr).slice(0, 3).join('、')}`;
            else if (broken.length) detail = `【有产出路径但投入断了】全世界没有可走通的产出路径；${broken.slice(0, 2).map(p => `${p.kind} 断在 ${p.broken.slice(0, 4).join('、')}`).join('；')}${broken.length > 2 ? `；另 ${broken.length - 2} 条同样断` : ''}`;
            else detail = `【全世界都不产】配方、据点再生、生态掉落、采集、农业、私田、畜牧、觅食、账本再生来源、抄写均无产出 ${it.id} 的路径（产地 ${o}）`;
        }
        findings.push({check: 'G1', rule: 'origin-not-produced', group: 'items.origin', path: 'world/meta/items.json', id: it.id, detail, exempt: false});
    }
    return findings;
}

// ---------- G2 ----------
function getPath(obj, parts) {let v = obj; for (const k of parts) {if (!isObj(v) && !Array.isArray(v)) return undefined; v = v[k];} return v;}
function checkG2(root, scans, liveFiles) {
    const findings = [];
    const plugin = scans.filter(s => s.file.startsWith('server-plugin/'));
    const exact = new Set(), prefixes = new Set();
    for (const {scan} of plugin) for (const l of scan.literals) {
        if (l.value !== null && l.value !== undefined) exact.add(l.value);
        const p = l.kind === 'tpl' && l.segments.length > 1 ? l.head : l.value;
        if (p && p.length >= 3 && /[.:/@]$/.test(p)) prefixes.add(p);
    }
    const dataStrings = new Set();
    const collect = v => {if (typeof v === 'string') dataStrings.add(v); else if (Array.isArray(v)) v.forEach(collect); else if (isObj(v)) Object.values(v).forEach(collect);};
    for (const rel of liveFiles) if (!rel.startsWith('rules/tables/balance/')) collect(readJSON(path.join(root, 'world', rel)));
    const referenced = ref => exact.has(ref) || [...prefixes].some(p => ref.startsWith(p)) || (ref.includes('*') && [...prefixes].some(p => ref.split('*')[0].startsWith(p)));
    const dir = path.join(root, 'world/rules/tables/balance');
    for (const file of walkFiles(dir, n => n.endsWith('.json'))) {
        const rel = relOf(root, file), table = path.basename(file, '.json'), j = readJSON(file) ?? {};
        const rows = [...(j.params ?? []).map(p => ({id: p.id, refs: [p.id]})), ...(j.rows ?? []).filter(r => r.key).map(r => ({id: r.key, refs: [r.key, r.selector].filter(Boolean)}))];
        for (const r of rows) {
            if (typeof r.id !== 'string') continue;
            if (r.refs.some(referenced)) continue;
            if (r.refs.some(x => dataStrings.has(x))) continue;
            findings.push({check: 'G2', rule: 'unwired-param', group: table, path: rel, id: r.id, detail: `参数/行 ${r.id} 在 server-plugin 里没有按 id、selector 或前缀的引用，其他数据表也不引用`, exempt: false});
        }
    }
    // rules.x ?? 缺省：代码在读，数据里没有
    const rules = readJSON(path.join(root, 'world/meta/rules.json')) ?? {};
    // 加载器挂到 rules 上的子树（rules.a.b=X，X 读自某个 world 文件）：按那个文件的内容判断，而不是把整棵子树当作都有
    const attached = [];
    for (const s of scans.filter(s => s.file === 'tools/load-world.mjs')) {
        const fileOf = new Map();
        for (const v of s.scan.src.matchAll(/([A-Za-z_$][\w$]*)\s*=\s*await\s+(?:optional|read)\(\s*'([^']+\.json)'\s*\)/g)) fileOf.set(v[1], v[2]);
        const re = /(?<![\w$.])rules\s*\.\s*((?:[A-Za-z_$][\w$]*\s*\.\s*)*[A-Za-z_$][\w$]*)\s*=(?![=>])\s*([A-Za-z_$][\w$]*)?/g; let m;
        while ((m = re.exec(s.scan.code))) {
            const file = fileOf.get(m[2]);
            attached.push({at: m[1].replace(/\s/g, '').split('.'), data: file ? readJSON(path.join(root, 'world', file)) : undefined});
        }
    }
    const present = parts => getPath(rules, parts) !== undefined || attached.some(a => a.at.every((k, i) => parts[i] === k)
        && (a.data === undefined || getPath(a.data, parts.slice(a.at.length)) !== undefined));
    const chain = '((?:\\s*(?:\\?\\.|\\.)\\s*[A-Za-z_$][\\w$]*)*)';
    const split = s => s.replace(/\s/g, '').replace(/\?\./g, '.').split('.').filter(Boolean);
    for (const {file, scan} of plugin) {
        // 顶层语句块编号：别名只在同一顶层块里、取使用点之前最近一次赋值
        const region = new Uint32Array(scan.code.length);
        for (let i = 0, depth = 0, id = 0; i < scan.code.length; i++) {const c = scan.code[i]; if (c === '{') depth++; else if (c === '}' && --depth === 0) id++; region[i] = id;}
        // 读取对象：成员链里出现 .rules（世界规则），或本地名：同块内最近一次赋值是 x.rules.a.b 这种纯成员链时当作别名；解不开的不判
        const assigns = [];
        const are = /(?<![\w$.])([A-Za-z_$][\w$]*)\s*=(?![=>])\s*([^,;\n]*)/g; let m;
        while ((m = are.exec(scan.code))) {
            const rhs = m[2].match(new RegExp(`^(?:[A-Za-z_$][\\w$]*\\s*(?:\\?\\.|\\.)\\s*)+rules${chain}\\s*\\)?\\s*(?:\\{|$)`));
            assigns.push({name: m[1], pos: m.index, base: rhs ? split(rhs[1]) : null});
        }
        const re = /(?:(?<=\.\.\.)|(?<![\w$.]))([A-Za-z_$][\w$]*)((?:\s*(?:\?\.|\.)\s*[A-Za-z_$][\w$]*)+)\s*\?\?(?!=)/g;
        while ((m = re.exec(scan.code))) {
            const segs = [m[1], ...split(m[2])];
            let base, tail;
            const at = segs.indexOf('rules', 1);
            if (at > 0) {base = []; tail = segs.slice(at + 1);}
            else {
                const last = assigns.filter(a => a.name === m[1] && a.pos < m.index && region[a.pos] === region[m.index]).pop();
                if (!last?.base) continue;
                base = last.base; tail = segs.slice(1);
                if (!isObj(getPath(rules, base))) continue;
            }
            if (!tail.length || present([...base, ...tail])) continue;
            const parts = [...base, ...tail];
            const line = scan.lineOf(m.index), src = scan.src.slice(re.lastIndex, re.lastIndex + 40).split(/[,;)\]}\n]/)[0].trim();
            findings.push({check: 'G2', rule: 'rules-default', group: 'rules ??', path: `${file}:${line}`, id: 'rules.' + parts.join('.'),
                detail: `代码读 rules.${parts.join('.')} ?? ${src}，meta/rules.json 里没有这条：缺省值写死在代码里`, exempt: false});
        }
        // 解构缺省 const {k=缺省}=x.rules.a：同样是代码在读、数据里没有时用写死的值
        const dre = new RegExp(`\\{([^{}]*)\\}\\s*=(?![=>])\\s*(?:[A-Za-z_$][\\w$]*\\s*(?:\\?\\.|\\.)\\s*)+rules${chain}\\s*(?=[,;)\\n]|$)`, 'g');
        while ((m = dre.exec(scan.code))) {
            const base = split(m[2]);
            for (const part of m[1].split(',')) {
                const k = part.trim().match(/^([A-Za-z_$][\w$]*)\s*(?::\s*[A-Za-z_$][\w$]*\s*)?=\s*(.+)$/);
                if (!k || present([...base, k[1]])) continue;
                const parts = [...base, k[1]];
                findings.push({check: 'G2', rule: 'rules-default', group: 'rules ??', path: `${file}:${scan.lineOf(m.index)}`, id: 'rules.' + parts.join('.'),
                    detail: `代码解构 rules.${parts.join('.')} 缺省 ${k[2].trim().slice(0, 30)}，meta/rules.json 里没有这条：缺省值写死在代码里`, exempt: false});
            }
        }
    }
    return findings;
}

// ---------- G3 ----------
function checkG3(root, scans) {
    const findings = [];
    let templates = 0, shells = 0, queries = 0;
    for (const file of walkFiles(path.join(root, 'world/actions'), n => n.endsWith('.json'))) {
        const rel = relOf(root, file), j = readJSON(file);
        for (const a of j?.actions ?? []) {
            if (Array.isArray(a.outcomes) ? a.outcomes.length : a.outcomes) {templates++; continue;}
            // 没有原语模板就是壳：有 call 的是旧处理器外壳，没有 call 的是引擎内建投影；只读（readOnly）查询单列
            const query = a.readOnly === true;
            if (query) queries++; else shells++;
            const how = a.call ? `旧外壳 call:${a.call.tool ?? ''}${a.call.operation ? '/' + a.call.operation : ''}` : `外壳（无 call，由引擎内建${a.projection ? '投影 ' + a.projection : '处理'}）`;
            findings.push({check: 'G3', rule: query ? 'shell-query' : 'shell', group: query ? 'actions:readOnly' : 'actions', path: rel, id: a.id,
                detail: `登记动作只有${how}，没有原语模板 outcomes${query ? '；只读查询，不改状态' : '；会改状态'}`, exempt: false});
        }
    }
    const items = new Set((readJSON(path.join(root, 'world/meta/items.json')) ?? []).map(i => i.id));
    for (const {file, scan} of scans.filter(s => s.file.startsWith('server-plugin/'))) {
        for (const l of scan.literals) if (l.value !== null && items.has(l.value)) {
            findings.push({check: 'G3', rule: 'item-id-literal', group: 'item-id-literal', path: `${file}:${l.line}`, id: l.value,
                detail: `规律代码写死物品 id 字面量 ${l.value}`, exempt: false});
        }
        // 不带引号的写法：对象键 {item_x:…}、属性名 x.item_x 等标识符形式
        for (const m of scan.code.matchAll(/(?<![\w$])[A-Za-z_$][\w$]*/g)) if (items.has(m[0])) {
            findings.push({check: 'G3', rule: 'item-id-literal', group: 'item-id-literal', path: `${file}:${scan.lineOf(m.index)}`, id: m[0],
                detail: `规律代码写死物品 id 字面量 ${m[0]}（标识符/对象键）`, exempt: false});
        }
    }
    return {findings, templates, shells, queries};
}

// ---------- 豁免与下线 ----------
function collectExemptions(scans) {
    const out = [];
    for (const {file, scan} of scans) for (const c of scan.comments) {
        const m = c.text.match(/k8-exempt:\s*(G[123])\s+(\S+)\s+reason=(.+?)\s+review=(\d{4}-\d{2}-\d{2})\s*$/);
        if (m) out.push({check: m[1], id: m[2], reason: m[3].trim(), review: m[4], where: `${file}:${c.line}`});
    }
    return out;
}
function offlineChecks(root) {
    const out = {};
    let text;
    try {text = fs.readFileSync(path.join(root, 'docs/审查/K8-标注.md'), 'utf8');} catch {return out;}
    // 只取最后一张含“检查名”“误报率”表头的表；检查名写成 G1 或 G1.<规则>（子规则粒度）
    const lines = text.split(/\r?\n/);
    let last = null;
    for (let i = 0; i < lines.length; i++) {
        if (!/^\s*\|/.test(lines[i])) continue;
        const head = lines[i].split('|').map(s => s.trim());
        const ci = head.findIndex(h => h.includes('检查名')), ri = head.findIndex(h => h.includes('误报率'));
        if (ci < 0 || ri < 0) continue;
        const table = {};
        for (let k = i + 1; k < lines.length && /^\s*\|/.test(lines[k]); k++) {
            const cells = lines[k].split('|').map(s => s.trim());
            const name = cells[ci]?.match(/^(G[123])(?:\.([A-Za-z][\w-]*))?/), rate = cells[ri]?.match(/(\d+(?:\.\d+)?)\s*(%?)/);
            if (!name || !rate) continue;
            const v = rate[2] ? Number(rate[1]) / 100 : Number(rate[1]) > 1 ? Number(rate[1]) / 100 : Number(rate[1]);
            const key = name[2] ? `${name[1]}.${name[2]}` : name[1];
            table[key] = Math.max(table[key] ?? 0, v);
        }
        last = table;
    }
    return last ?? out;
}

// ---------- 主流程 ----------
export function runK8Guard(rootArg) {
    const root = path.resolve(rootArg);
    const scans = [...codeFiles(root, 'server-plugin'), path.join(root, 'tools/load-world.mjs')].filter(f => fs.existsSync(f)).map(f => {
        const src = fs.readFileSync(f, 'utf8');
        const scan = scanJS(src); scan.src = src;
        return {file: relOf(root, f), scan};
    });
    // 界面（extension/）里的读取只用于区分 dead-field / prompt-only-field
    const otherScans = codeFiles(root, 'extension')
        .map(f => {const src = fs.readFileSync(f, 'utf8'); const scan = scanJS(src); scan.src = src; return {file: relOf(root, f), scan};});
    const liveFiles = liveDataFiles(root, scans);
    const g3 = checkG3(root, scans);
    let findings = [...checkG1(root, scans, otherScans, liveFiles), ...checkG2(root, scans, liveFiles), ...g3.findings];
    const exemptions = collectExemptions(scans.filter(s => s.file.startsWith('server-plugin/')));
    for (const f of findings) {
        const [file, line] = [f.path.replace(/:\d+$/, ''), Number(f.path.match(/:(\d+)$/)?.[1] ?? NaN)];
        if (Number.isNaN(line)) continue; // 数据里的发现没有可写注释的位置，不可豁免
        f.exempt = exemptions.some(e => e.check === f.check && e.id === f.id && e.where.startsWith(file + ':') && [line, line - 1].includes(Number(e.where.split(':').pop())));
    }
    findings = findings.map(f => ({check: f.check, rule: f.rule, group: f.group, path: f.path, id: f.id, detail: f.detail, exempt: f.exempt}));
    const lineKey = p => {const m = p.match(/^(.*?)(?::(\d+))?$/); return [m[1], Number(m[2] ?? 0)];};
    findings.sort((a, b) => byStr(a.check, b.check) || byStr(a.rule, b.rule) || (() => {const [pa, la] = lineKey(a.path), [pb, lb] = lineKey(b.path); return byStr(pa, pb) || la - lb;})() || byStr(a.id, b.id) || byStr(a.detail, b.detail));
    const rates = offlineChecks(root);
    const checks = {};
    // 子规则下线：误报率 > 20% 的“检查.规则”移出 count，留在 offlineRules 与 review 里
    const offRule = f => rates[`${f.check}.${f.rule}`] > 0.2;
    const review = f => f.rule === 'prompt-only-field' || offRule(f); // 只供人工复核，不计数
    for (const c of ['G1', 'G2', 'G3']) {
        checks[c] = {online: !(rates[c] > 0.2), count: findings.filter(f => f.check === c && !f.exempt && !review(f)).length};
        const off = Object.keys(rates).filter(k => k.startsWith(c + '.') && rates[k] > 0.2).map(k => k.slice(c.length + 1)).sort(byStr);
        if (off.length) checks[c].offlineRules = off;
    }
    checks.G1.review = findings.filter(f => f.check === 'G1' && review(f)).length;
    checks.G3.templates = g3.templates; checks.G3.shells = g3.shells; checks.G3.queries = g3.queries;
    return {root: slash(root), checks, findings, exemptions: exemptions.sort((a, b) => byStr(a.where, b.where))};
}

function toMarkdown(rep) {
    const out = ['# K8 守门报告', '', `root: ${rep.root}`, '', '| 检查 | 在线 | 计数 |', '|---|---|---|'];
    for (const [c, v] of Object.entries(rep.checks)) out.push(`| ${c} | ${v.online ? '在线' : '下线'} | ${v.count} |`);
    const groups = new Map();
    for (const f of rep.findings) {const k = `${f.check} ${f.rule}`; groups.set(k, (groups.get(k) ?? 0) + 1);}
    out.push('', '| 检查 子规则 | 条数 |', '|---|---|', ...[...groups].map(([k, n]) => `| ${k} | ${n} |`));
    out.push('', `豁免 ${rep.exemptions.length} 条`, ...rep.exemptions.map(e => `- ${e.check} ${e.id} @ ${e.where}（${e.reason}，复核 ${e.review}）`));
    out.push('', '## 发现', ...rep.findings.map(f => `- [${f.check}/${f.rule}]${f.exempt ? '[豁免]' : ''} ${f.group} | ${f.path} | ${f.id} | ${f.detail}`));
    return out.join('\n') + '\n';
}
function summaryLine(rep) {
    return ['G1', 'G2', 'G3'].map(c => `${c} ${rep.checks[c].count}${rep.checks[c].online ? '' : '（下线）'}`).join('，');
}

// 构建结束处的挂接：只打印三条计数并追加历史；任何失败都不影响构建
export function buildHook(rootArg) {
    try {
        const rep = runK8Guard(rootArg);
        for (const c of ['G1', 'G2', 'G3']) if (!rep.checks[c].online) console.log(`k8-guard: ${c} 下线`);
        for (const c of ['G1', 'G2', 'G3']) for (const r of rep.checks[c].offlineRules ?? []) console.log(`k8-guard: ${c}.${r} 下线`);
        console.log(`k8-guard: ${summaryLine(rep)}`);
        let commit = null;
        try {commit = execFileSync('git', ['-C', rep.root, 'rev-parse', 'HEAD'], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();} catch {}
        const dir = path.join(rep.root, 'logs/guard');
        fs.mkdirSync(dir, {recursive: true});
        fs.appendFileSync(path.join(dir, 'history.jsonl'), JSON.stringify({commit, G1: rep.checks.G1.count, G2: rep.checks.G2.count, G3: rep.checks.G3.count}) + '\n');
    } catch (error) {console.log(`k8-guard: 跳过（${error.message}）`);}
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
    try {
        const args = process.argv.slice(2), opt = k => {const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined;};
        const root = opt('--root') ?? path.resolve(import.meta.dirname, '..');
        const rep = runK8Guard(root);
        for (const c of ['G1', 'G2', 'G3']) if (!rep.checks[c].online) console.log(`${c} 下线（误报率 > 20%）`);
        for (const c of ['G1', 'G2', 'G3']) for (const r of rep.checks[c].offlineRules ?? []) console.log(`${c}.${r} 下线（误报率 > 20%）`);
        if (opt('--json')) fs.writeFileSync(opt('--json'), JSON.stringify(rep, null, 2) + '\n');
        if (opt('--md')) fs.writeFileSync(opt('--md'), toMarkdown(rep));
        console.log(`k8-guard: ${summaryLine(rep)}；豁免 ${rep.exemptions.length}`);
    } catch (error) {console.log(`k8-guard 出错：${error.stack ?? error}`);}
    process.exitCode = 0;
}
