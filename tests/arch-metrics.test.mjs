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
import {topLevelStatements} from '../tools/top-level-statements.mjs';

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

test('审批脚本：顶层语句读命令行参数并执行命令分支的，每一条都必须带 main 守卫（被别的审批脚本 import 时不得执行）',()=>{
 const files=[...fs.readdirSync('world/design').filter(f=>f.endsWith('.mjs')).map(f=>`world/design/${f}`),
  ...fs.readdirSync('tools').filter(f=>/-approval/.test(f)&&f.endsWith('.mjs')).map(f=>`tools/${f}`)];
 const guard=/import\.meta\.(url\s*===\s*pathToFileURL\(path\.resolve\(process\.argv\[1\]\)\)\.href|filename)/;
 const decl=/^(export\s+)?(default\s+)?(async\s+)?(function\b|class\b|const\b|let\b|var\b)|^import\b|^export\s*[{*]/;
 const fnDecl=/^(export\s+)?(default\s+)?(async\s+)?(function\b|class\b)/;
 const bad=[];
 for(const f of files){
  const stmts=topLevelStatements(fs.readFileSync(f,'utf8'));
  // main 标识：顶层 const/let main = …守卫… 之后，凡引用 main 的语句视为带守卫
  const mainDefined=stmts.some(s=>/^(const|let|var)\s+main\b/.test(s.text)&&guard.test(s.text));
  // 顶层 args（const args=process.argv…）：之后的语句里出现 args 即读命令行参数
  const topArgs=stmts.some(s=>/^(const|let|var)\s+(args|argv)\b[^;]*process\.argv/.test(s.text));
  for(const s of stmts){
   const t=s.text.trim();
   if(fnDecl.test(t))continue; // 函数 / 类声明里读 process.argv（默认参数）只在被调用时才读
   const reads=/process\.argv/.test(t)||(topArgs&&/\b(args|argv)\b/.test(t));
   const isDecl=decl.test(t);
   // 声明：只读取参数（const args=process.argv.slice(2)、const main=守卫）不算命令分支；声明里有 await 或调用 run()/main() 才算执行
   const executes=isDecl?(/\bawait\b/.test(t)||/\b(run|main)\s*\(/.test(t))&&(reads||/\b(run|main)\s*\(/.test(t)):true;
   if(!executes)continue;
   // 执行语句：读命令行参数的，或顶层直接调用 run()/main() 的（run 默认读 process.argv）
   if(!(reads||/\b(run|main)\s*\(/.test(t)))continue;
   if(guard.test(t)||(mainDefined&&/\bmain\b/.test(t)))continue;
   bad.push(`${f}:${s.line}：顶层语句读命令行参数并执行命令分支，但没有 main 守卫（${t.slice(0,60).replace(/\s+/g,' ')}）`);
  }
 }
 assert.deepEqual(bad,[]);
});
