import fs from 'node:fs/promises';
import {loadWorld} from './load-world.mjs';
import {economyW3Journey} from '../world/design/economy-w3-journey.mjs';
import {runContentPipeline,readApprovedContent,PROCESS_DRAFT_RULES} from './content-pipeline.mjs';
import {w3Context,closestW3Similarity} from './w3-content.mjs';
import {assembleTradesCandidate,validateTradesDraft,tradesReviewRequest} from './w3-trades.mjs';
import {DeepSeekClient} from './deepseek-client.mjs';
export const journeyRoot='world/drafts/w3/journey',journeyRevision='w3-journey-1';
export function journeyContext(world,bones,entry){
 const context=w3Context(world,bones,entry);
 if(entry.id.startsWith('item_'))context.qualityGate={grade:entry.quality,minimumLevel:world.rules.equipment.requiredLevels[world.rules.equipment.qualities.indexOf(entry.quality)],meaning:'品质等级与材料名称无关。combat只在本件被指定持用交锋时参与计算，放在背包不提供被动防御。checkBonus只供列出的skill检定，不代表装备后自动完成工作。'};
 return context;
}
export async function inspectJourney(world,bones,{requireL4=true}={}){
 const rows=[],block=JSON.parse(await fs.readFile('world/meta/blocklist.json','utf8'));
 for(const kind of ['items','recipes']){
  const lore=requireL4?await readApprovedContent(`${journeyRoot}/${kind}`,bones[kind],{contextFor:entry=>journeyContext(world,bones,entry),revision:journeyRevision}):await Promise.all(bones[kind].map(async row=>JSON.parse(await fs.readFile(`${journeyRoot}/${kind}/${row.id}.json`,'utf8')).draft));
  for(const draft of lore){const entry=bones[kind].find(x=>x.id===draft.id),validation=validateTradesDraft(draft,entry,block,journeyContext(world,bones,entry));if(validation.errors.length)throw new Error(`${draft.id}: ${validation.errors.join('；')}`);const near=closestW3Similarity(draft,[...lore,...world[kind]]);if(near.score>=.35)throw new Error(`${draft.id}与${near.id}说明相似${near.score}`);}
  rows.push(...lore);
 }
 return{candidate:assembleTradesCandidate(world,bones,rows),rows};
}
async function main(){
 const world=await loadWorld(),bones=economyW3Journey(world),block=JSON.parse(await fs.readFile('world/meta/blocklist.json','utf8'));
 if(process.argv.includes('--check')){const{candidate}=await inspectJourney(world,bones);console.log(JSON.stringify({items:candidate.items.length,recipes:candidate.recipes.length,published:false}));return;}
 await fs.mkdir(journeyRoot,{recursive:true});await fs.writeFile(`${journeyRoot}/bones.json`,JSON.stringify(bones,null,2)+'\n');
 const client=new DeepSeekClient({budgetYuan:20});
 for(const kind of ['items','recipes']){
  const fields=kind==='items'?['description','inspection','storage']:['process'];
  await runContentPipeline({entries:bones[kind],root:`${journeyRoot}/${kind}`,budgetRoot:'world/drafts/w3',client,batchSize:kind==='items'?37:43,concurrency:12,revision:journeyRevision,
   contextFor:entry=>journeyContext(world,bones,entry),validateDraft:(draft,entry,context)=>validateTradesDraft(draft,entry,block,context),buildReviewRequest:tradesReviewRequest,
   buildDraftRequest:(entry,feedback,context)=>({temperature:.55,max_tokens:850,thinking:{type:'disabled'},tools:[{type:'function',function:{name:'submit_content',description:'仅提交本条说明，不复述参数对象',parameters:{type:'object',additionalProperties:false,required:['id',...fields],properties:{id:{type:'string',enum:[entry.id]},...Object.fromEntries(fields.map(f=>[f,{type:'string',minLength:1}]))}}}}],tool_choice:{type:'function',function:{name:'submit_content'}},messages:[
    {role:'system',content:`写原创中世纪中文器物说明，本次仅一条${fields.join('、')}。description 80至135字、inspection 30至65字、storage 25至55字，process 90至160字。选取器物自身结构、加工痕和有限检查动作，避免相同句式套名。所有数值来自本条骨架，quality只是品质等级，绝不可把银品质写成银材或石品质写成石器。木柄钢刃等材质依name/use；不得添加未列工具、油、线、盐、胶、釉、耗材或额外容器。物重单位千克，文字如写克要乘1000；尽量不在外貌中重复数字。保存期为数字加天，null不编时限；不从购买日重新算新鲜度。仅按给定来源人物地点称呼，不杜撰工匠专名。书籍必须写识字100、阅读450分钟和本书工序内容；空白册不教授技能。战斗加值只在明确持用交锋时生效，不增加新能力；工具仅对列出的技能检定有加值。不可写游戏、系统、主持人、骨架等开发词。${kind==='recipes'?'严格按processFacts，用齐列出的工具。不写总耗时、全程多少分钟之类的总时长（由程序按骨架补写），也不拆分步骤时长。amount为物品份数；不可在全部配额用完后追加水、原料或保留可用余料。全部产物是一份，裁成多个小件仍作为一份交付；副产品为空时余料弃置，工具保留。炉用炭屑不混入产品。'+PROCESS_DRAFT_RULES:'食品只作外观气味检查，不尝变质食物；说明不得保证治病、保鲜、自动采集、必中、无敌、无限承重。'}只按反馈改本条，不主动输出其他条目。`},
    {role:'user',content:JSON.stringify({skeleton:entry,referencedFacts:context,feedback})}]}),
   onBatch:async batch=>console.log(JSON.stringify({kind,index:batch.index,count:batch.count,passed:batch.passed,manual:batch.manual,pending:batch.pending,costUpperYuan:client.spent})),
  });
 }
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/w3-journey.mjs'))await main();
