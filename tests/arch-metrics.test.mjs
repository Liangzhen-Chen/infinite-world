// S0 架构度量门槛：import 图（I19）与派生黑名单（I10）。现有违例/命中登记在 tests/metrics/*.baseline.json，只拦新增；
// 两项都能对单个内容包目录运行（第三方作者自测）。
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildGraph,compareBaseline as compareGraph,readBaseline as graphBaseline} from '../tools/import-graph.mjs';
import {scan,compareBaseline as compareScan} from '../tools/derived-scan.mjs';
import {assignedFiles} from '../tools/arch-layers.mjs';
import fs from 'node:fs';

test('import 图：每个模块都已标层，没有新增的向上依赖或包间 import',()=>{
 const g=buildGraph();
 assert.deepEqual(g.unassigned,[],'新模块须在 tools/arch-layers.mjs 归层');
 for(const f of assignedFiles())assert.ok(fs.existsSync(f),`归层表列了不存在的模块 ${f}`);
 const {added}=compareGraph(g);
 assert.deepEqual(added.map(v=>v.key),[]);
 assert.equal(graphBaseline().violations.length,graphBaseline().count);
 assert.ok(g.edges.length>g.violations.length&&g.violations.length>0);
});

test('import 图：包目录模式报告包间 import',()=>{
 const g=buildGraph({dir:'tests/fixtures/packs/demo'});
 assert.deepEqual(g.violations.map(v=>[v.to,v.kind]),[['server-plugin/law.mjs','cross-pack']]);
 assert.ok(g.edges.some(e=>e.to==='server-plugin/traits.mjs'),'向 L1 的依赖合法');
});

test('派生黑名单：存档写入点与作者数据没有新增命中',()=>{
 const r=scan(),{added}=compareScan(r);
 assert.deepEqual(added,[]);
 assert.ok(r.fields.some(f=>f.field==='monthlyQuotaD')&&r.fields.some(f=>f.field==='residents'));
});

test('派生黑名单：包目录模式并入包自己的黑名单字段',()=>{
 const r=scan({dir:'tests/fixtures/packs/demo'});
 assert.deepEqual(r.hits.map(h=>h.field).sort(),['brewQuota','salary']);
 assert.ok(r.hits.every(h=>h.file==='tests/fixtures/packs/demo/brewing.mjs'&&h.line>0));
});
