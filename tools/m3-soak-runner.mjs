import fs from 'node:fs/promises';
import path from 'node:path';
import {atomicJSON,digest} from '../server-plugin/storage.mjs';
import {openSoakRun,nextSoakTask,performSoakTask,summarizeSoak} from './m3-soak-state.mjs';
import {createSoakAdapter} from './m3-soak-adapter.mjs';
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
async function playerInput(adapter,directory,task,row){
 const file=path.join(directory,'tasks',`${digest(task.id)}-player.json`);try{return (await read(file)).input;}catch(e){if(e.code!=='ENOENT')throw e;}
 const session=row.checkpoint??await adapter.initialSession(task.persona),scene=await adapter.server.api('scene',{campaignId:session.campaignId,query:task.persona==='merchant'?'交易 赊账 行商':'建造 材料 技艺'});
 const persona=task.persona==='merchant'?'商人：先在附近买卖小额货品，与商贩建立关系，比较价格，逐渐旅行、接运货委托与记录欠款。避免重复机械买同一物品。':'建造者：先问清附近材料、工作和技艺，再采购实际所需，学习、采集、制造、申请住处或施工许可。先做可负担的小步骤。';
 const response=await adapter.client.generate({messages:[{role:'system',content:`你是长程角色扮演的玩家代理。人格为${persona}每次只输出一句自然的第一人称具体行动或对话，不用场外、工具名、ID、尾注，不替主持决定成功或物品。根据上轮结果继续目标，错误后调整。不得宣称拥有未取得的钱、技能或物品；禁止攻击、犯罪、亲密行为。`},{role:'user',content:JSON.stringify({turn:task.turn,opening:task.turn===1?adapter.bundle.card.data.first_mes:undefined,scene:scene?.scene,recent:row.turns.slice(-6).map(t=>({input:t.input,reply:t.result.text}))})}],max_tokens:300,thinking:{type:'disabled'}},`player:${task.id}`);
 const input=response.choices?.[0]?.message?.content?.trim();if(response.choices?.[0]?.finish_reason!=='stop'||!input||input.length>1500)throw Error('玩家代理未返回完整短行动');await atomicJSON(file,{input,measurement:response.measurement});return input;
}
export async function runSoak(options={}){
 const directory=path.resolve(options.directory);await fs.mkdir(directory,{recursive:true});const file=path.join(directory,'driver.lock');let lock;
 try{lock=await fs.open(file,'wx');}catch(error){if(error.code!=='EEXIST')throw error;
  const owner=await read(file);let alive=true;try{process.kill(owner.pid,0);}catch(e){if(e.code==='ESRCH')alive=false;else throw e;}
  if(alive)throw Error('此浸泡目录已有执行器');await fs.unlink(file);lock=await fs.open(file,'wx');
 }
 await lock.writeFile(JSON.stringify({pid:process.pid}));try{return await runUnlocked(options);}finally{await lock.close();await fs.unlink(file);}
}
async function runUnlocked({directory,turns=150,budgetYuan=50,maxTasks=Infinity,adapterOptions={},inputFor}={}){
 directory=path.resolve(directory);let run=await openSoakRun(directory,{turns,budgetYuan});
 const adapter=await createSoakAdapter({directory,budgetYuan,...adapterOptions});let status='complete',tasks=0;
 try{
  while(tasks<maxTasks){
   const task=nextSoakTask(run);if(!task)break;const before=adapter.client.ledger.spentYuan,callStart=adapter.client.ledger.calls.length;
   let input=task.input;
   try{
    if(task.kind==='turn'&&!input)input=inputFor?await inputFor(task,run):await playerInput(adapter,directory,task,run.personas[task.persona]);
    const result=await performSoakTask(directory,{input,reserveYuan:Math.min(.25,budgetYuan),execute:async frozen=>{
     const value=await adapter.execute(frozen);return {...value,costUpperYuan:adapter.client.ledger.spentYuan-before,measurements:structuredClone(adapter.client.ledger.calls.slice(callStart))};
    }});run=result.run;status=result.status;tasks++;
    if(!['complete','notEligible','insufficient'].includes(status))break;
   }catch(error){status='failed';await atomicJSON(path.join(directory,`failure-${Date.now()}.json`),{task,error:String(error.message).replaceAll(process.env.DEEPSEEK_API_KEY??'__no_key__','[屏蔽]')});break;}
   await atomicJSON(path.join(directory,'latest.json'),report());
  }
  if(tasks>=maxTasks&&nextSoakTask(run))status='task-limit';
 }finally{await adapter.close();}
 function report(){const ledger=adapter.client.ledger,roles=Object.fromEntries(['narrator','player','review','rewrite','scoring','planning'].map(role=>[role,{calls:ledger.calls.filter(c=>c.role===role).length,costUpperYuan:ledger.calls.filter(c=>c.role===role).reduce((n,c)=>n+c.costUpperYuan,0)}]));return {status,tasks,next:nextSoakTask(run),...summarizeSoak({...run,spentYuan:ledger.spentYuan,measurements:ledger.calls}),costUpperYuan:ledger.spentYuan,roles,calls:ledger.calls.length,allCallsAccounted:ledger.calls.every(c=>Number.isFinite(c.costUpperYuan)),sample:turns!==150};}
 const result=report();await atomicJSON(path.join(directory,'latest.json'),result);return result;
}
