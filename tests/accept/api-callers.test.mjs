// 受限内核入口调用者核对与读者、引用范围的门禁设施自测（卷六 S6-13 现文、A6-1.1；封卷后勘误 1118k13，李白 11-18 06:18）。
// call_edge 的 entries 方式：许可全取自声明表 kernelApi 的 callers/callerFiles；path_access 的 readerFiles/files/ref 三项。期望数是手算的数字字面量。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContext, readDecl, readRegistry, groupModel } from '../../tools/accept/read.mjs';
import { detect as callEdge } from '../../tools/accept/detectors/call_edge.mjs';
import { detect as pathAccess } from '../../tools/accept/detectors/path_access.mjs';
import { itemChecks, keySets } from '../../tools/accept/lib/item-form.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DECL = readDecl(ROOT);
const SRV = ['rules', 'kernel', 'textcore', 'inputEdge', 'gate', 'outputGate', 'aiGate', 'assembly'];
const ENTRIES = ['kernel/ledger.mjs#post', 'kernel/ledger.mjs#transfer'];
const P = { entries: ENTRIES, groups: SRV, code: 'E-VIEW-INPUT-IMPORT' };

// 夹具的文件集是虚拟的；登记派生的文件（账本与 stockLots 腐坏字段声明写者 item-lots.mjs）对照真实仓库清单核存在（path_access ownerFiles），故 repoFiles 带上它。
function ctxOf(map, decl) {
  const files = new Map(Object.entries(map));
  return { ...loadContext(ROOT, { files: [...files.keys()].sort(), read: (p) => files.get(p), decl: decl || DECL }), repoFiles: [...files.keys(), 'server-plugin/item-lots.mjs'] };
}
const withApi = (exports) => ({ ...DECL, kernelApi: { exports } });

test('S6-13 post/transfer：规则层（登记 callers 里的组）具名导入并调用，不计', () => {
  const c = ctxOf({ 'server-plugin/econ.mjs': "import { post, transfer } from './kernel/ledger.mjs';\nexport const f = (s) => { post(s, []); transfer(s, []); };" });
  assert.equal(callEdge(c, P).length, 0);
});

test('S6-13 post/transfer：登记 callers 之外的组具名导入，每个入口名在导入处计一处', () => {
  const c = ctxOf({ 'server-plugin/textcore/t.mjs': "import { post, transfer } from '../kernel/ledger.mjs';\nexport const f = (s) => { post(s, []); transfer(s, []); };" });
  const hits = callEdge(c, P);
  assert.equal(hits.length, 2);
  assert.deepEqual(hits.map((h) => [h.nodeKind, h.code, h.line]), [['import', 'E-VIEW-INPUT-IMPORT', 1], ['import', 'E-VIEW-INPUT-IMPORT', 1]]);
});

test('S6-13 post/transfer：命名空间导入按每处 `空间.入口名` 计，非受限入口名与别的模块不计', () => {
  const c = ctxOf({
    'server-plugin/input/i.mjs': "import * as L from '../kernel/ledger.mjs';\nL.post(1);\nL.balance(1);\nconst g = L.transfer;\nL.post(2);",
    'server-plugin/input/j.mjs': "import * as M from '../kernel/other.mjs';\nM.post(1);",
  });
  const hits = callEdge(c, P);
  assert.equal(hits.length, 3);
  assert.deepEqual(hits.map((h) => h.line).sort(), [2, 4, 5]);
});

test('S6-13 post/transfer：重导出一律计；动态拼别名、别的模块同名函数不误报', () => {
  const c = ctxOf({
    'server-plugin/gate/r.mjs': "export { post } from '../kernel/ledger.mjs';",
    'server-plugin/gate/s.mjs': "import { post } from './mine.mjs';\npost(1);",
  });
  const hits = callEdge(c, P);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].file, 'server-plugin/gate/r.mjs');
  assert.equal(hits[0].nodeKind, 'reexport');
});

test('S6-13 post/transfer：入口定义文件自己不计', () => {
  const c = ctxOf({ 'server-plugin/kernel/ledger.mjs': "import * as me from './ledger.mjs';\nme.post(1);" });
  assert.equal(callEdge(c, P).length, 0);
});

test('S6-13 日终分配结算入口 settleCappedAllocation：许可同样只读 kernelApi 登记——规则层调用不计，组外调用计入', () => {
  const P2 = { ...P, entries: [...ENTRIES, 'kernel/ledger.mjs#settleCappedAllocation'] };
  const ok = ctxOf({ 'server-plugin/econ.mjs': "import { settleCappedAllocation } from './kernel/ledger.mjs';\nexport const f = (s) => settleCappedAllocation(s, {});" });
  assert.equal(callEdge(ok, P2).length, 0);
  const bad = ctxOf({ 'server-plugin/gate/g.mjs': "import { settleCappedAllocation } from '../kernel/ledger.mjs';\nexport const f = (s) => settleCappedAllocation(s, {});" });
  const hits = callEdge(bad, P2);
  assert.equal(hits.length, 1);
  assert.deepEqual([hits[0].nodeKind, hits[0].code], ['import', 'E-VIEW-INPUT-IMPORT']);
});

test('S6-13 post/transfer：许可只读登记——callers 写 `*` 放行服务端各模块组但不放装配文件，callerFiles 放行具体文件', () => {
  const star = withApi([{ export: 'kernel/ledger.mjs#post', callers: ['*'] }, { export: 'kernel/ledger.mjs#transfer', callers: [], callerFiles: ['gate/x.mjs'] }]);
  const files = {
    'server-plugin/textcore/a.mjs': "import { post } from '../kernel/ledger.mjs';",
    'server-plugin/index.mjs': "import { post } from './kernel/ledger.mjs';",
    'server-plugin/gate/x.mjs': "import { transfer } from '../kernel/ledger.mjs';",
    'server-plugin/gate/y.mjs': "import { transfer } from '../kernel/ledger.mjs';",
  };
  const hits = callEdge(ctxOf(files, star), P);
  assert.deepEqual(hits.map((h) => h.file).sort(), ['server-plugin/gate/y.mjs', 'server-plugin/index.mjs']);
});

test('S6-13 post/transfer：登记里没有的入口计一处在声明表上，不放行', () => {
  const none = withApi([{ export: 'kernel/ledger.mjs#post', callers: ['rules'] }]);
  const hits = callEdge(ctxOf({ 'server-plugin/econ.mjs': 'export const a = 1;' }, none), P);
  assert.equal(hits.length, 1);
  assert.deepEqual([hits[0].file, hits[0].nodeKind, hits[0].symbolPath], ['world/ontology/state-owners.json', 'entry', 'kernel/ledger.mjs#transfer']);
});

test('条目参数 entries 必须是 kernelApi 登记里的导出 id；files、readerFiles 必须是 .mjs 路径', () => {
  const regs = Object.fromEntries(['detectors', 'scanclasses', 'gatefacs'].map((k) => [k, readRegistry(ROOT, k)]));
  const keys = keySets(groupModel(DECL), regs, DECL);
  const item = (params) => ({ volume: 'vol6', localNo: 'S6-13', form: 'scan', method: 'static_code', target: 'runtime_code', expect: 'zero', stage: 0, gates: ['pre_commit'], runsOn: 'local_static', source: 's', state: 'registered', scanClass: 'module_edge', detector: 'call_edge', params });
  assert.deepEqual(itemChecks(item({ entries: ENTRIES, code: 'E-VIEW-INPUT-IMPORT' }), keys), []);
  assert.equal(itemChecks(item({ entries: ['kernel/ledger.mjs#nonesuch'] }), keys).length, 1);
  assert.deepEqual(itemChecks(item({ readerSystems: ['sys.economy'], scopeSystems: ['sys.economy'] }), keys), []);
  assert.equal(itemChecks(item({ readerSystems: ['sys.nonesuch'] }), keys).length, 1);
  assert.equal(itemChecks(item({ files: ['server-plugin/kernel/ledger.mjs'] }), keys).length, 1); // 参数里不许列文件（R12-11.5）
});

const CLS = {};
const ECON = ['sys.economy'];
const NOFILE = { ...DECL, systems: { ...DECL.systems, 'sys.economy': { ...DECL.systems['sys.economy'], writers: ['accounts.*'] } }, stateKeys: { ...DECL.stateKeys, accounts: { readers: [], writers: { '*': 'kernel/gone.mjs' } } } };

test('A6-1.1 读者与范围由登记派生：派生出的文件不在仓库、系统不在声明表、派生不出文件，均报 E-ACC-ITEM-PARAM，不静默跳过', () => {
  const files = { 'server-plugin/kernel/ledger.mjs': 'export const a = 1;', 'server-plugin/econ.mjs': 'export const b = 1;' };
  const read = { access: 'read', groups: SRV, paths: ['sources'], code: 'E-VIEW-INPUT-IMPORT' };
  const ref = { access: 'ref', paths: ['priceFor'], code: 'E-VIEW-INPUT-IMPORT' };
  const gone = ctxOf(files, NOFILE);
  assert.throws(() => pathAccess(gone, { ...read, readerSystems: ECON }, CLS), /E-ACC-ITEM-PARAM derived file missing server-plugin\/kernel\/gone\.mjs/);
  assert.throws(() => pathAccess(gone, { ...ref, scopeSystems: ECON }, CLS), /E-ACC-ITEM-PARAM derived file missing/);
  assert.throws(() => pathAccess(ctxOf(files), { ...ref, scopeSystems: ['sys.nonesuch'] }, CLS), /E-ACC-ITEM-PARAM system=sys\.nonesuch/);
  const none = { ...DECL, systems: { ...DECL.systems, 'sys.economy': { ...DECL.systems['sys.economy'], writers: [] } } };
  assert.throws(() => pathAccess(ctxOf(files, none), { ...ref, scopeSystems: ECON }, CLS), /E-ACC-ITEM-PARAM systems=sys\.economy no writer files/);
});

test('A6-1.1 用例夹具：派生文件对照真实仓库清单 repoFiles 核存在，夹具里没有的只是不进本次扫描', () => {
  const c = { ...ctxOf({ 'server-plugin/econ.mjs': "import { priceFor } from './market/price.mjs';" }), repoFiles: ['server-plugin/kernel/ledger.mjs', 'server-plugin/item-lots.mjs', 'server-plugin/econ.mjs'] };
  assert.equal(pathAccess(c, { access: 'ref', paths: ['priceFor'], scopeSystems: ECON, code: 'E-VIEW-INPUT-IMPORT' }, CLS).length, 0);
  assert.throws(() => pathAccess({ ...c, repoFiles: ['server-plugin/econ.mjs'] }, { access: 'ref', paths: ['priceFor'], scopeSystems: ECON, code: 'E-VIEW-INPUT-IMPORT' }, CLS), /E-ACC-ITEM-PARAM derived file missing/);
});

test('A6-1.1 四字段读者：登记派生的读者文件不计，别处读任一字段各计一处', () => {
  const p = { access: 'read', groups: SRV, paths: ['transferable', 'counterpartRX', 'sources', 'sinks'], readerSystems: ECON, code: 'E-VIEW-INPUT-IMPORT' };
  const c = ctxOf({
    'server-plugin/kernel/ledger.mjs': 'export const f = (row) => row.sources.length + row.sinks.length + (row.transferable ? 1 : 0);',
    'server-plugin/econ.mjs': "export const g = (row) => row.sources[0] + row.counterpartRX + row['sinks'];",
    'server-plugin/other.mjs': 'export const h = (row) => row.unit;',
  });
  const hits = pathAccess(c, p, CLS);
  assert.equal(hits.length, 3);
  assert.ok(hits.every((h) => h.file === 'server-plugin/econ.mjs'));
  assert.equal(pathAccess(c, { ...p, readerSystems: undefined }, CLS).length, 6);
});

test('A6-1.1 引用：scopeSystems 登记派生的文件；同名标识符与同名模块 import 各计一处，读者除外', () => {
  const p = { access: 'ref', scopeSystems: ECON, paths: ['priceFor', 'valuation'], code: 'E-VIEW-INPUT-IMPORT' };
  const c = ctxOf({
    'server-plugin/kernel/ledger.mjs': "import { priceFor } from './market/price.mjs';\nimport v from './valuation.mjs';\nexport const f = () => priceFor(1) + obj.priceFor + 'priceFor';",
    'server-plugin/econ.mjs': "import { priceFor } from './market/price.mjs';",
  });
  const hits = pathAccess(c, p, CLS);
  assert.equal(hits.length, 3);
  assert.deepEqual(hits.map((h) => [h.line, h.nodeKind]), [[1, 'ref'], [3, 'ref'], [2, 'import_module']]);
  assert.equal(pathAccess(c, { ...p, readerSystems: ECON }, CLS).length, 0);
});

test('A6-1.1 按表认：持有种类行（词表条目）的同名字段不计；资源种类表的行与追不到来源的行照计', () => {
  const p = { access: 'read', groups: SRV, paths: ['transferable'], readerSystems: ECON, code: 'E-VIEW-INPUT-IMPORT' };
  const kind = "function kindRow(e, c) { const rec = e.vocab.index.get(c); if (rec.family !== 'x') throw 1; return rec.entry; }\nexport const f = (e, c) => { const row = kindRow(e, c); return row.transferable; };";
  const both = kind.replace("rec.family !== 'x'", "rec.family !== 'x' || !e.rules.economyResources");
  const c = ctxOf({
    'server-plugin/kernel/ledger.mjs': 'export const a = 1;',
    'server-plugin/kind.mjs': kind,
    'server-plugin/res.mjs': 'export const g = (e, id) => { const row = e.rules.economyResources[id]; return row.transferable; };',
    'server-plugin/param.mjs': 'export const h = (row) => row.transferable;',
    'server-plugin/mixed.mjs': both,
  });
  assert.deepEqual(pathAccess(c, p, CLS).map((h) => h.file), ['server-plugin/mixed.mjs', 'server-plugin/param.mjs', 'server-plugin/res.mjs']);
});

test('K5-24 终止标记只许经 terminated 谓词读：state 根的读计（规则层各组），kernel 目录整体豁免，句柄、谓词、写入目标不计', () => {
  const p = readRegistry(ROOT, 'items').find((i) => i.itemKey === 'vol2.K5-24').params;
  const read = 'export const f = (state, id) => state.terminated[id];';
  const c = ctxOf({
    'server-plugin/econ.mjs': read,
    'server-plugin/gate/g.mjs': "export const f = (engine, id) => engine.state['terminated'][id];",
    'server-plugin/kernel/w.mjs': read,
    'server-plugin/kernel/load/x.mjs': read,
    'server-plugin/ok1.mjs': 'export const f = (engine, state, id) => terminated(engine, state, id).ok && readPath(state, P.terminated(id));',
    'server-plugin/ok2.mjs': 'export const f = (state, id, m) => { state.terminated[id] = m; return state.holdings; };',
  });
  assert.deepEqual(pathAccess(c, p, CLS).map((h) => [h.file, h.code]), [['server-plugin/econ.mjs', 'E-VIEW-PREDICATE-LOCAL'], ['server-plugin/gate/g.mjs', 'E-VIEW-PREDICATE-LOCAL']]);
});

test('K5-24 口子：计算属性第一段、state 绑定为值（别名、解构、engine.state）计，函数实参与 kernel 目录不计', () => {
  const p = readRegistry(ROOT, 'items').find((i) => i.itemKey === 'vol2.K5-24').params;
  const c = ctxOf({
    'server-plugin/a.mjs': 'export const f = (state, k) => state[k];',
    'server-plugin/b.mjs': 'export const f = (state) => { const s = state; return s.terminated; };',
    'server-plugin/c.mjs': 'export const f = (state) => { const { terminated } = state; return terminated; };',
    'server-plugin/d.mjs': 'export const f = (engine) => { const s = engine.state; return s; };',
    'server-plugin/e.mjs': 'export const f = (engine, state, id) => terminated(engine, state, id) && readPath(state, P.x);',
    'server-plugin/kernel/k.mjs': 'export const f = (state, k) => { const s = state; return state[k] && s; };',
  });
  assert.deepEqual(pathAccess(c, p, CLS).map((h) => [h.file, h.nodeKind]), [['server-plugin/a.mjs', 'computed'], ['server-plugin/b.mjs', 'alias'], ['server-plugin/c.mjs', 'alias'], ['server-plugin/d.mjs', 'alias']]);
});

test('K5-24 真实仓库：kernel 目录之外没有人直读 state.terminated', () => {
  const p = readRegistry(ROOT, 'items').find((i) => i.itemKey === 'vol2.K5-24').params;
  assert.equal(pathAccess(loadContext(ROOT, {}), p, CLS).length, 0);
});

// 块 6 第 6-0 张门禁条目（docs/迁移体检/块6-规矩检查对照.md 门禁条目 1、2、4）。
const itemParams = (key) => readRegistry(ROOT, 'items').find((i) => i.itemKey === key).params;

test('K6-24 terminal 读者闭集：读者取自声明表 sys.capacity 的谓词文件，别处（含 kernel、显示层）读 terminal 字段即计', () => {
  const p = itemParams('vol2.K6-24');
  const read = 'export const f = (fam) => fam.terminal;';
  const c = ctxOf({
    'server-plugin/action-capacity.mjs': read,
    'server-plugin/body/death.mjs': read,
    'server-plugin/kernel/k.mjs': "export const f = (fam) => fam['terminal'];",
    'extension/panel.mjs': read,
    'server-plugin/ok.mjs': "export const f = (engine, state, id, fam) => terminated(engine, state, id).ok && fam.terminated && fam.incapacitating;",
  });
  assert.deepEqual(pathAccess(c, p, CLS).map((h) => [h.file, h.code]), [
    ['extension/panel.mjs', 'E-VIEW-PREDICATE-LOCAL'], ['server-plugin/body/death.mjs', 'E-VIEW-PREDICATE-LOCAL'], ['server-plugin/kernel/k.mjs', 'E-VIEW-PREDICATE-LOCAL'],
  ]);
});

test('K6-24 读者按声明派生不点名：谓词登记改指别的文件，读者随之改变', () => {
  const p = itemParams('vol2.K6-24');
  const moved = { ...DECL, systems: { ...DECL.systems, 'sys.capacity': { ...DECL.systems['sys.capacity'], predicates: ['body/predicates.mjs#terminated'] } } };
  const read = 'export const f = (fam) => fam.terminal;';
  const c = ctxOf({ 'server-plugin/action-capacity.mjs': read, 'server-plugin/body/predicates.mjs': read }, moved);
  assert.deepEqual(pathAccess(c, p, CLS).map((h) => h.file), ['server-plugin/action-capacity.mjs']);
});

test('K6-24 口子：解构取字段（声明、参数、for…of、改名、嵌套）计，对象字面量构造不计', () => {
  const p = itemParams('vol2.K6-24');
  const c = ctxOf({
    'server-plugin/action-capacity.mjs': 'export const z = 1;',
    'server-plugin/a.mjs': 'export const f = (fam) => { const { terminal } = fam; return terminal; };',
    'server-plugin/b.mjs': 'export const f = ({ terminal }) => terminal;',
    'server-plugin/c.mjs': 'export function f(xs) { for (const { terminal: t } of xs) if (t) return 1; return 0; }',
    'server-plugin/d.mjs': 'export const f = (row) => { const { family: { terminal } } = row; return terminal; };',
    'server-plugin/e.mjs': "export const f = (x) => { let t; ({ 'terminal': t } = x); return t; };",
    'server-plugin/ok.mjs': 'export const f = (terminal) => { const o = { terminal: true }; return { terminal, o }; };',
  });
  assert.deepEqual(pathAccess(c, p, CLS).map((h) => [h.file, h.nodeKind]), [
    ['server-plugin/a.mjs', 'destructure'], ['server-plugin/b.mjs', 'destructure'], ['server-plugin/c.mjs', 'destructure'], ['server-plugin/d.mjs', 'destructure'], ['server-plugin/e.mjs', 'destructure'],
  ]);
});

test('A6-1.1 口径不变：带 readerSystems 的读条目不计解构（解构追不到行出自哪张表），成员链照计', () => {
  const p = itemParams('vol6.A6-1.1.a');
  const c = ctxOf({
    'server-plugin/kernel/ledger.mjs': 'export const z = 1;',
    'server-plugin/a.mjs': 'export const f = (row) => { const { sources, sinks } = row; return [sources, sinks]; };',
    'server-plugin/b.mjs': 'export const f = (row) => row.sources;',
  });
  assert.deepEqual(pathAccess(c, p, CLS).map((h) => [h.file, h.nodeKind]), [['server-plugin/b.mjs', 'member']]);
});

test('K6-24 真实仓库：terminal 字段的读点为 0', () => {
  assert.equal(pathAccess(loadContext(ROOT, {}), itemParams('vol2.K6-24'), CLS).length, 0);
});

test('A6-21.1 旧基础价格字段：任何组读 basePrice（成员、下标、解构）即计，读 valueBase 不计', () => {
  const p = itemParams('vol6.A6-21.1');
  const c = ctxOf({
    'server-plugin/market/price.mjs': 'export const f = (row) => row.basePrice;',
    'server-plugin/kernel/k.mjs': "export const f = (row) => row['basePrice'];",
    'server-plugin/econ.mjs': 'export const f = (row) => { const { basePrice: b } = row; return b; };',
    'server-plugin/ok.mjs': 'export const f = (row) => row.valueBase;',
  });
  assert.deepEqual(pathAccess(c, p, CLS).map((h) => [h.file, h.code]), [
    ['server-plugin/econ.mjs', 'E-VIEW-INPUT-IMPORT'], ['server-plugin/kernel/k.mjs', 'E-VIEW-INPUT-IMPORT'], ['server-plugin/market/price.mjs', 'E-VIEW-INPUT-IMPORT'],
  ]);
});

test('A6-21.1 真实仓库：basePrice 读点为 0', () => {
  assert.equal(pathAccess(loadContext(ROOT, {}), itemParams('vol6.A6-21.1'), CLS).length, 0);
});

test('S27-3 墙钟：规则层、内核、装配文件取墙钟即计（全局名、零实参 Date、perf_hooks 导入），带实参的 Date 与 gate 组不计', () => {
  const p = itemParams('vol27.S27-3');
  const c = ctxOf({
    'server-plugin/action/resolve.mjs': 'export const f = () => Date.now();',
    'server-plugin/gate/scan.mjs': 'export const f = () => Date.now();',
    'server-plugin/index.mjs': 'export function init() { return new Date(); }',
    'server-plugin/kernel/k.mjs': "import { performance } from 'node:perf_hooks';\nexport const f = () => performance.now();",
    'server-plugin/ok.mjs': 'export const f = (ms) => new Date(ms).getUTCFullYear();',
  });
  assert.deepEqual(callEdge(c, p).map((h) => [h.file, h.code]), [
    ['server-plugin/action/resolve.mjs', 'E-GLOBAL-UNLISTED'], ['server-plugin/index.mjs', 'E-GLOBAL-UNLISTED'], ['server-plugin/kernel/k.mjs', 'E-GLOBAL-UNLISTED'],
  ]);
});

test('S27-3 真实仓库：规则层、内核取墙钟为 0', () => {
  assert.equal(callEdge(loadContext(ROOT, {}), itemParams('vol27.S27-3')).length, 0);
});
