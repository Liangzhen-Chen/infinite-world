// Targeted L4 factual repairs. Existing draft attempts remain intact; every
// changed manuscript receives a fresh L1 and L2 before the batch is rebuilt.
import fs from 'node:fs/promises';
import {DeepSeekClient} from './deepseek-client.mjs';
import {defaultReviewRequest,parseModelJSON,hashContent,rowFingerprintShape} from './content-pipeline.mjs';
import {validateDraft,contextFor,revision} from './m2-people-content.mjs';
import {loadWorld} from './load-world.mjs';
import {npcM2Foundation} from '../world/design/npc-m2.mjs';
const root='world/drafts/m2-people',read=async name=>JSON.parse(await fs.readFile(`${root}/${name}.json`,'utf8')),write=(name,x)=>fs.writeFile(`${root}/${name}.json`,JSON.stringify(x,null,2)+'\n');
const fixes={
 linsui:d=>{d.description=d.description.replace('，都是自己补的','');d.voiceSamples[0]='住一晚六个铜，一周三十五，房钱怎么结，咱们先说清楚。';},
 ayan:d=>{d.voiceSamples[0]='这截轴得先量清，你过来看，顺着磨痕摸一摸，别急着动承重处。';d.voiceSamples[2]='水口那边我还得再去看一趟，看见多少就先记多少。';},
 xuling:d=>{d.description='许苓住在河边小屋，右手指节略僵，拿杯时先以左手托底，袖边留着洗淡的墨点。她谈术法时常从器具与实际结果说起，不爱故弄玄虚。有人把未经验证的办法夸成神技，她会刻薄地打断，要求对方说清做过什么。她离开学院后仍关心普通人的学习成本，愿与陆青讨论怎样让教学更容易负担。手伤需要休息，她不会把一次失败遮掩成高深的诀窍；涉及强迫他人意愿的术法，她不肯让步。';d.voiceSamples=['先告诉我你试过什么，哪里不对，我们一处一处看。','照明从基础练起。你肯花时间练，我们再商量教学的事。','这只杯子递左边就好，右手今天得歇一会儿。'];},
 wushuo:d=>{d.description=d.description.replace('独居在北林边上的青灯屋，','独居，');},
 taozhi:d=>{d.description=d.description.replaceAll('梅岭','梅绫').replace('也愿意教人认草，但认草与治病在她看来是两回事','谈到草叶的用途时，她会把辨认与治病分开讲');},
 zhengshuisheng:d=>{d.description=d.description.replace('三十岁船夫，在清河渡口讨生活','船夫，在河湾渡口讨生活');d.voiceSamples[1]='先把货物和人数核清，再看水位，什么时候能走、价钱怎么算，咱们照实际条件谈。';},
 gucen:d=>{d.description=d.description.replace('乡巡，三十岁，','乡巡，');},
 meiling:d=>{d.description=d.description.replace('在河谷的果园里长大','照料河谷的公用果园').replace('冲走她一半树苗','冲走公用果园一半树苗');d.voiceSamples[1]='先把沟里的枝叶清掉，动水之前问问邻田那边的打算。';},
 yanzhe:d=>{d.description=d.description.replace('若对方爽快履约，他下次会多留一个位置','若对方按约履行，他愿继续商量下一笔买卖');d.voiceSamples[2]='这次先看能不能按约交货，下回的货单，到时再照实际余量商量。';}
};
const client=new DeepSeekClient({budgetYuan:20,logFile:'logs/m2-people-usage.jsonl'}),budget=await read('budget');client.spent=budget.spentYuan+(budget.reservedYuan??0);
const bones=await read('foundation'),batch=await read('batch-0'),notes=[];
const refreshGoals=process.argv.includes('--refresh-goals');
if(refreshGoals){
 const world=await loadWorld();world.npcs=await read('baseline');const fresh=npcM2Foundation(world);
 for(const entry of bones.npcs)entry.goals=fresh.npcs.find(x=>x.id===entry.id).goals;
 await write('foundation',bones);
}
try{
 const jobs=refreshGoals?Object.fromEntries(bones.npcs.map(x=>[x.id.replace('npc_hw_',''),()=>{}])):fixes;
 for(const [key,fix] of Object.entries(jobs)){
  const id=`npc_hw_${key}`,row=await read(id),entry=bones.npcs.find(n=>n.id===id);
  const fingerprint=hashContent({entry,context:contextFor(entry),revision});
  if(row.l4Repair?.status==='passed'&&row.fingerprint===fingerprint){notes.push(row.l4Repair);continue;}
  const before=hashContent(row.draft);fix(row.draft);const check=validateDraft(row.draft,entry);
  const request=defaultReviewRequest(entry,row.draft,contextFor(entry));
  request.messages[0].content+=' 特别核对人名与地点名，不得混淆住处、工作地点和地理方位。教学描述不能新增器具条件或未登记能力；已有赊账规则不能被绝对预付要求覆盖。样例台词是虚构的说话示范，不写入已发生事件，不因一般观察口吻报错，但新增价格、地点、交易条件必须有依据。';
  row.review=parseModelJSON(await client.generate(request,`m2-l4-repair-${key}`));
  row.errors=[...check.errors,...row.review.contradictions.filter(x=>x.severity==='hard')];row.warnings=[...check.warnings,...row.review.contradictions.filter(x=>x.severity!=='hard')];row.status=row.errors.length?'manual':'passed';
  row.fingerprint=fingerprint;
  row.l4Repair={id,status:row.status,priorDraftHash:before,note:refreshGoals?'补齐手工目标资源前提后逐条复核原有正文，未重新起草。':'L4逐条纠正虚构地理、人名、能力前提或服务承诺，保留其余已审核正文。'};
  notes.push(row.l4Repair);await write(id,row);await write('budget',{spentYuan:client.spent,reservedYuan:client.reserved,limitYuan:20});
 }
 const rows=await Promise.all(batch.ids.map(read));batch.fingerprint=hashContent(rows.map(rowFingerprintShape));batch.passed=rows.filter(x=>x.status==='passed').length;batch.manual=rows.filter(x=>x.status==='manual').map(x=>x.id);batch.manualRatio=batch.manual.length/batch.count;batch.needsSystemicRepair=batch.manualRatio>0.1;batch.flagged=rows.filter(x=>x.warnings.length).map(x=>x.id);batch.costUpperYuan=client.spent;batch.l4={approved:false,notes:[]};
 await write('batch-0',batch);const summary=await read('summary');Object.assign(summary,{passed:batch.passed,manual:batch.manual.length,costUpperYuan:client.spent,batches:[batch]});await write('summary',summary);await write('terminal',{state:'finished',...summary});await write('l4-repair',{notes,costUpperYuan:client.spent});console.log(JSON.stringify({passed:batch.passed,manual:batch.manual,flagged:batch.flagged,costUpperYuan:client.spent}));
}catch(error){await write('budget',{spentYuan:client.spent,reservedYuan:client.reserved,limitYuan:20});await write('terminal',{state:'error',error:String(error.message)});throw error;}
