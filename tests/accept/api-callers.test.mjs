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

function ctxOf(map, decl) {
  const files = new Map(Object.entries(map));
  return loadContext(ROOT, { files: [...files.keys()].sort(), read: (p) => files.get(p), decl: decl || DECL });
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
  const c = { ...ctxOf({ 'server-plugin/econ.mjs': "import { priceFor } from './market/price.mjs';" }), repoFiles: ['server-plugin/kernel/ledger.mjs', 'server-plugin/econ.mjs'] };
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
