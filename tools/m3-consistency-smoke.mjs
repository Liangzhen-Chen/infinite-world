import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadWorld} from './load-world.mjs';
import {DeepSeekClient} from './deepseek-client.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches,atomicJSON} from '../server-plugin/storage.mjs';
import {reviewConsistency} from '../server-plugin/consistency-review.mjs';

export async function consistencySmokeSamples(){
 const world=await loadWorld(),engine=new WorldEngine(world),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
 const before=engine.initialFromLegacy(seed,'m3-consistency-receipts');before.state.location='bld_hw_mill';
 before.state.inventory.item_wood={quantity:6,quality:'木',durability:100,weight:1};before.state.inventory.item_whittling_knife={quantity:1,quality:'木',durability:80,weight:0.2};
 before.state.skills.skill_life_6_core={proficiency:120,daily:{},breakthroughs:[]};before.state.recipes.recipe_wooden_pegs={source:{type:'teacher',id:'npc_hw_ayan'}};
 let failed;for(let i=0;i<40;i++){const args={recipe:'recipe_wooden_pegs'},result=await engine.reduce(before,{tool:'world_craft',args,eventId:`review_craft_${i}`});if(!result.result.success){failed={after:applyPatches(before,result.patches),receipts:[{tool:'world_craft',args,result:result.result}]};break;}}
 if(!failed)throw Error('没有找到可核验的制作失败样本');
 const allowedEntities=engine.entities.map(e=>({id:e.id,name:e.name,aliases:e.aliases??[]})),clock={location:failed.after.state.location,startMinute:before.state.minute,minute:failed.after.state.minute,present:Object.entries(failed.after.state.npcs).filter(([,n])=>n.location===failed.after.state.location).map(([id])=>id)};
 const common={playerText:'我试着做一次木楔。',before,...failed,allowedEntities,scene:engine.scene(failed.after,'这次制作结果'),clock,blocklist:world.blocklist?.names??[]};
 const tail=`<回合 额外="0分" 地点="${clock.location}" 在场="${clock.present.join(',')}"/>`;
 const timed=await engine.reduce(before,{tool:'world_time',args:{minutes:14400},eventId:'review_wait'}),afterWait=applyPatches(before,timed.patches);
 return [
  {id:'paid-failure',expected:'fact',input:{...common,draft:`工坊费2铜退还了。你已经做好了木楔，整齐地放在掌心。${tail}`}},
  {id:'acceptable-figurative',expected:null,input:{...common,draft:`工坊收了两铜。没能做出可用木楔，碎木片落在脚边。刀口擦过木纹，发出一声短响；窗缝里的冷意像针一样贴着指尖。${tail}`}},
  {id:'unregistered-speaker',expected:'naming',input:{...common,draft:`<q who="npc_new_zhou">我叫周衍，来看看你的手艺。</q>${tail}`}},
  {id:'duplicate-wait',expected:'time',input:{playerText:'我在这里等十天。',draft:`十天过去了，窗外又亮起来。<回合 额外="10分" 地点="${afterWait.state.location}" 在场=""/>`,before,after:afterWait,receipts:[{tool:'world_time',args:{minutes:14400},result:timed.result}],allowedEntities,scene:engine.scene(afterWait,'等待结束'),clock:{location:afterWait.state.location,startMinute:before.state.minute,minute:afterWait.state.minute,present:[]}}},
 ];
}
export async function runConsistencySmoke({client,outputDir='logs/m3-consistency',retryFailed=false}={}){
 await fs.mkdir(outputDir,{recursive:true});const reportFile=path.join(outputDir,'latest.json');
 let prior;try{prior=JSON.parse(await fs.readFile(reportFile,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
 client??=new DeepSeekClient({budgetYuan:20,logFile:path.join(outputDir,'usage.jsonl')});client.spent=Math.max(client.spent??0,prior?.cumulativeUpperYuan??0);
 const report={method:'隔离引擎真实回执与四个审查草稿；不是完整试玩验收',date:new Date().toISOString(),budgetYuan:20,samples:[],cumulativeUpperYuan:client.spent};
 for(const sample of await consistencySmokeSamples()){
  const previous=prior?.samples?.find(s=>s.id===sample.id);
  if(previous&&(!retryFailed||previous.pass||(previous.previousAttempts?.length??0)>=1)){report.samples.push(previous);continue;}
  const review=await reviewConsistency(sample.input,{client}),errors=review.issues.filter(i=>i.severity==='error');
  const pass=review.model.status==='reviewed'&&(sample.expected?errors.some(i=>i.category===sample.expected):errors.length===0);
  report.samples.push({id:sample.id,expected:sample.expected,pass,playerText:sample.input.playerText,draft:sample.input.draft,receipts:sample.input.receipts,scene:sample.input.scene,review,...(previous?{previousAttempts:[{pass:previous.pass,review:previous.review}]}:{})});
  report.cumulativeUpperYuan=client.spent;await atomicJSON(reportFile,report);
 }
 report.pass=report.samples.every(s=>s.pass);await atomicJSON(reportFile,report);return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const report=await runConsistencySmoke({retryFailed:process.argv.includes('--retry-failed')});console.log(JSON.stringify({pass:report.pass,samples:report.samples.map(s=>({id:s.id,pass:s.pass,status:s.review.status,issues:s.review.issues.map(i=>({category:i.category,severity:i.severity,source:i.source,reason:i.reason}))})),cumulativeUpperYuan:report.cumulativeUpperYuan}));if(!report.pass)process.exitCode=1;
}
