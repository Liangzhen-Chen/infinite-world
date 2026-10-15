import fs from 'node:fs/promises';
import {DeepSeekClient} from './deepseek-client.mjs';
import {parseModelJSON} from './content-pipeline.mjs';
const root='world/drafts/m4r';
const read=async p=>JSON.parse(await fs.readFile(`${root}/${p}`,'utf8'));
const write=async(p,v)=>fs.writeFile(`${root}/${p}`,JSON.stringify(v,null,2)+'\n');
const rows=await read('hidden-passives.json');
const old=await read('budget.json').catch(()=>({limitYuan:1,spentYuan:0}));
const client=new DeepSeekClient({budgetYuan:old.limitYuan,logFile:`${root}/usage.jsonl`});client.spent=old.spentYuan;
client.reserved=old.unknownReservedYuan??0;
const reviews=await read('l2.json').catch(()=>({rows:[]}));
const allowed=new Set(['domain','checkBonus','defenseBonus','trustMultiplier','condition']);
for(const row of rows){
 if(!row.id||!row.ability||!row.cost||!row.passive.domain||Object.keys(row.passive).some(k=>!allowed.has(k)))throw Error(`L1:${row.id}`);
 const p=row.passive;if(p.checkBonus!==undefined&&p.checkBonus!==1||p.defenseBonus!==undefined&&p.defenseBonus!==2||p.trustMultiplier!==undefined&&p.trustMultiplier!==0.1)throw Error(`L1:数值:${row.id}`);
}
await write('l1.json',{passed:true,entries:rows.length});
const extra=[{id:'research_spell_registration',revision:2,ability:'完成三日研究后登记法术，阶段不超相关技能最高阶段减一；通过学习才施放。',cost:'使用已有原语、同意和法典。',passive:{prototype:'正式法术原型，关联技能须在研究项目内',parameters:'可提交同族效果的JSON规则；阶段、耗魔、持续、材料、目标和专用消费者均须校验。数值型效果按同阶段已发布的同类原语上限；其他族用其机制固定边界。不能撤除原型同意、许可或材料。',failure:'大失败造成至少1点反噬；仍支付实际魔力、材料、时间。低阶反噬时罕骨承纹可做体质检定加1，成功只减1点伤害，剩余伤害至少1。',observation:'裂谷听石以现有追踪观察时长为基准；已听到音量至少60的密集噪声时观察耗时加倍。',wind:'实际听风后记录风向，仅在同地一分钟内用于风帆解算；离开或过时失效。'}}];
for(const row of [...rows,...extra]){
 let r=reviews.rows.find(x=>x.id===row.id);
 if(row.revision&&r?.revision!==row.revision&&r?.attempts.length<2)r.passed=false;
 if(r?.passed||r?.attempts?.length>=2)continue;
 if(!r){r={id:row.id,attempts:[]};reviews.rows.push(r);}
 while(r.attempts.length<2&&!r.passed){
  try{
   const response=await client.generate({max_tokens:650,response_format:{type:'json_object'},messages:[{role:'system',content:'你是原创游戏事实审查员。只核对本条既有能力、代价与可执行规则是否矛盾，不扩充游戏设定。domain 为能力的英文标识。所有原有材料、同意、法典、许可检查仍由实际调用者执行。静林保护期为触发条件所需天数，杀生后重新累计；守望补偿引用对违约相对方实际完成的付款承诺，不重复用付款。缺少资料时不发加成。核对一致的句子不输出。返回 JSON {"contradictions":[{"quote":"...","field":"...","severity":"硬事实|软问题|文风","reason":"..."}]}。'},{role:'user',content:JSON.stringify(row)}]},`M4R:L2:${row.id}:${r.attempts.length+1}`);
   await write(`response-${row.id}-${r.attempts.length+1}.json`,response);
   const result=parseModelJSON(response);
   if(!Array.isArray(result.contradictions))throw Error('审核缺少矛盾列表');
   r.attempts.push({result,usage:response.measurement});r.passed=!result.contradictions.some(c=>c.severity==='硬事实');r.revision=row.revision;
  }catch(error){r.attempts.push({error:error.message});}
  await write('budget.json',{limitYuan:1,spentYuan:client.spent,reservedYuan:client.reserved,unknownReservedYuan:old.unknownReservedYuan??0});await write('l2.json',reviews);
  if(r.attempts.length>=2&&r.attempts.every(a=>a.error))throw Error(`审核执行失败两次，停止整批：${row.id}`);
 }
 console.log(JSON.stringify({id:r.id,passed:r.passed??false,attempts:r.attempts.length}));
}
console.log(JSON.stringify({passed:reviews.rows.filter(r=>r.passed).length,total:rows.length+extra.length,spentYuan:client.spent}));
