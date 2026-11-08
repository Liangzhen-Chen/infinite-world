// 批次 1 变异检查：证明新增的回归测试在"旧写法"下会红（KILLED），否则它没有区分力（SURVIVED）。
// 只读：变异都在内存里做——写到系统临时目录的只有一个 ESM 加载钩子（hooks.mjs / register.mjs），它在模块被加载时把目标文件的源码按 (from → to) 替换一次；
// 仓库里任何文件都不改。每个变异先校验 from 在目标文件里恰好出现一次（否则 PATCH-MISS），再对相应测试跑 `node --test`（带 --import register.mjs）。
// 基线（未变异）必须先通过，否则整体中止。用法（云上跑）：
//   node tools/b1-mutate.mjs [list] [only=1,3] [baseline=skip]
// 输出：每个变异一行：编号、KILLED / SURVIVED / PATCH-MISS / TIMEOUT、说明、首个失败的子测试名（KILLED 时），以及失败输出里是否含 Invalid party balance。
// 退出码：基线失败、或任一变异 SURVIVED/PATCH-MISS/TIMEOUT 为 1。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const root=path.resolve(import.meta.dirname,'..');
const SHOP='server-plugin/shop.mjs',REGISTRY='server-plugin/advance-registry.mjs';
const SHOP_TESTS=['tests/b1-shop-local-restock.test.mjs','tests/b1-shop-pay.test.mjs'],RELATION_TESTS=['tests/b1-relation-day-sliced.test.mjs'];
const NEW_PAY="payCounterThenPurse(d,engine,{owner:shop.keeper,to,amount,writer:'shop',eventId:id});";
const OLD_PAY="const counter=dedicatedCoinAccount(d.get('state'),shop.keeper,'counter')?.account;if(counter&&counterCash(d,shop.keeper)>=amount)moveCoins(d,{from:counter,to,amount,writer:'shop',eventId:id});else{moveCoins(d,{from:purse(engine,shop.keeper),to,amount,writer:'shop',eventId:id});mirrorPartyCoins(d,engine,shop.keeper,-amount,id,'shop');}";
const CAP=",purseNow()));};",NOCAP="));};";
// [说明, 目标文件, [[from,to],...], 相关测试]   每个 from 必须在目标文件里恰好出现一次
const MUTANTS=[
 ['shop pay 改回旧写法：柜台够整笔才走柜台，否则整笔走钱袋（保留预算封顶）',SHOP,[[NEW_PAY,OLD_PAY]],SHOP_TESTS],
 ['shop pay 与预算都改回旧写法（整笔钱袋，预算不按钱袋现有现金封顶）',SHOP,[[NEW_PAY,OLD_PAY],[CAP,NOCAP]],SHOP_TESTS],
 ['shop 预算不再按钱袋现有现金封顶（付款仍用新原语）',SHOP,[[CAP,NOCAP]],SHOP_TESTS],
 ['relation_evidence 的 order 改回 500（与 daily 同位）',REGISTRY,[["{id:'relation_evidence',order:3000,","{id:'relation_evidence',order:500,"]],RELATION_TESTS],
 ['去掉每个午夜的关系证据登记（只剩 reduce 末尾那次）',REGISTRY,[["advance:(e,d,ctx)=>{if(!(ctx.days>0))return;advanceHook('settleRecordRelationEvidence')?.(d,e,d.relationBase);d.relationBase=d.get('state');}}","advance:(e,d,ctx)=>{}}"]],RELATION_TESTS],
];
const args=process.argv.slice(2),has=name=>args.some(x=>x===name||x.startsWith(`${name}=`)),value=name=>args.find(x=>x.startsWith(`${name}=`))?.slice(name.length+1)??null;
const ONLY=value('only')?new Set(value('only').split(',').map(Number)):null,TIMEOUT_MS=25*60*1000;
if(has('list')){MUTANTS.forEach(([note,file,,tests],i)=>console.log(`${i+1}. ${note}  [${file}]  测试：${tests.join(' ')}`));process.exit(0);}

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'b1-mutate-'));
const hooks=path.join(tmp,'hooks.mjs'),register=path.join(tmp,'register.mjs');
fs.writeFileSync(hooks,`import {pathToFileURL} from 'node:url';
const spec=JSON.parse(process.env.B1_MUTATION??'null');
export async function load(url,context,nextLoad){
 const result=await nextLoad(url,context);
 if(spec&&url===pathToFileURL(spec.file).href&&result.source!==undefined){
  let text=result.source.toString();
  for(const [from,to] of spec.patches){const at=text.indexOf(from);if(at<0||text.indexOf(from,at+1)>=0)throw new Error('b1-mutate: patch target is not unique in '+spec.file);text=text.slice(0,at)+to+text.slice(at+from.length);}
  return {...result,source:text};
 }
 return result;
}
`);
fs.writeFileSync(register,`import {register} from 'node:module';import {pathToFileURL} from 'node:url';register(${JSON.stringify(pathToFileURL(hooks).href)});\n`);

function run(tests,mutation){
 return new Promise(resolve=>{
  const env={...process.env,...(mutation?{B1_MUTATION:JSON.stringify(mutation)}:{})};
  const child=spawn(process.execPath,['--import',pathToFileURL(register).href,'--test','--test-isolation=none','--test-reporter=tap',...tests],{cwd:root,env,stdio:['ignore','pipe','pipe']});
  let output='';const timer=setTimeout(()=>{child.kill('SIGKILL');resolve({code:null,output,timeout:true});},TIMEOUT_MS);
  child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>output+=c);
  child.on('close',code=>{clearTimeout(timer);resolve({code,output,timeout:false});});
 });
}
const firstFailure=out=>(out.match(/^not ok \d+ - (.+)$/m)??[])[1]??null;
let exit=0;
try{
 const checked=[...new Set(MUTANTS.map(m=>m[3].join(' ')))].map(s=>s.split(' '));
 if(value('baseline')!=='skip'){
  for(const tests of checked){
   const base=await run(tests,null);
   console.log(`BASELINE ${base.code===0?'PASS':'FAIL'}  ${tests.join(' ')}`);
   if(base.code!==0){console.log(base.output.split('\n').slice(-40).join('\n'));exit=1;}
  }
  if(exit){console.log('基线未通过，中止变异。');process.exitCode=1;throw new Error('baseline failed');}
 }
 for(const [i,[note,file,patches,tests]] of MUTANTS.entries()){
  if(ONLY&&!ONLY.has(i+1))continue;
  const text=fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n'),miss=patches.find(([from])=>text.split(from).length!==2);
  if(miss){console.log(`${i+1} PATCH-MISS  ${note}  （目标文本在 ${file} 里出现 ${text.split(miss[0]).length-1} 次）`);exit=1;continue;}
  const result=await run(tests,{file:path.join(root,file),patches:patches.map(([from,to])=>[from,to])});
  if(result.timeout){console.log(`${i+1} TIMEOUT  ${note}`);exit=1;continue;}
  if(result.code===0){console.log(`${i+1} SURVIVED  ${note}`);exit=1;}
  else console.log(`${i+1} KILLED  ${note}  | 首个失败：${firstFailure(result.output)??'(无子测试名)'} | 含 Invalid party balance：${/Invalid party balance/.test(result.output)}`);
 }
}catch(error){if(!/baseline failed/.test(String(error)))console.log(error.stack);exit=1;}
finally{fs.rmSync(tmp,{recursive:true,force:true});}
process.exitCode=exit;
