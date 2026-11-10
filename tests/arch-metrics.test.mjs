// S0 架构度量门槛：import 图（I19）与派生黑名单（I10）。现有违例/命中登记在 tests/metrics/*.baseline.json，只拦新增；
// 两项都能对单个内容包目录运行（第三方作者自测）。
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildGraph,compareBaseline as compareGraph,readBaseline as graphBaseline} from '../tools/import-graph.mjs';
import {scan,scanAuthored,scanWritePoints,compareBaseline as compareScan} from '../tools/derived-scan.mjs';
import {assignedFiles} from '../tools/arch-layers.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {tmpRoot} from '../tools/tmp-root.mjs';

test('维护章程是职权来源；其他作者对象及人物存档仍不能保存派生powers',()=>{
 const fields=[{field:'powers',scope:'all'}];
 assert.deepEqual(scanAuthored([path.resolve('world/geo/settlements.json')],fields),[]);
 const dir=fs.mkdtempSync(path.join(tmpRoot(),'charter-scan-')),data=path.join(dir,'private.json'),code=path.join(dir,'private.mjs');
 try{
  fs.writeFileSync(data,JSON.stringify({powers:['public_project'],publicMaintenance:{budgetFrom:'ranked_office',source:'test',powers:['public_project']}}));
  assert.equal(scanAuthored([data],fields).length,2,'unrelated authored objects retain the ban');
  fs.writeFileSync(code,"d.set(['state','npcs',id,'powers'],['public_project']);");
  assert.equal(scanWritePoints([code],fields).length,1,'runtime powers remain derived');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

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

test('审批脚本：顶层读命令行参数的，命令分支必须带 main 守卫（被别的审批脚本 import 时不得执行）',()=>{
 const files=[...fs.readdirSync('world/design').filter(f=>f.endsWith('.mjs')).map(f=>`world/design/${f}`),
  ...fs.readdirSync('tools').filter(f=>/-approval/.test(f)&&f.endsWith('.mjs')).map(f=>`tools/${f}`)];
 const guard=/import\.meta\.(url\s*===\s*pathToFileURL\(path\.resolve\(process\.argv\[1\]\)\)\.href|filename)/;
 const bad=[];
 for(const f of files){
  const text=fs.readFileSync(f,'utf8');
  if(!/process\.argv/.test(text))continue;
  if(!guard.test(text)){bad.push(`${f}：读 process.argv 但没有 main 守卫`);continue;}
  const lines=text.split(/\r?\n/),topArgs=/^(const|let|var)\s+args\s*=\s*process\.argv/m.test(text);
  lines.forEach((line,i)=>{
   // 顶层（行首无缩进）的命令分支：文件顶层定义了 args=process.argv，或直接读 process.argv 时须带守卫；函数参数里的 args 不算
   if(/^if\s*\(.*(\bargs\b|process\.argv)/.test(line)&&(topArgs||/process\.argv/.test(line))&&!guard.test(line)&&!/\bmain\b/.test(line))bad.push(`${f}:${i+1}：顶层命令分支没有 main 守卫`);
   // 顶层直接执行的 run() 调用也须带守卫
   if(/^(await\s+)?run\(/.test(line))bad.push(`${f}:${i+1}：顶层无守卫调用 run()`);
  });
 }
 assert.deepEqual(bad,[]);
});
