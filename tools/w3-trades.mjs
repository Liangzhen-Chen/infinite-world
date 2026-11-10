import fs from 'node:fs/promises';
import {loadWorld} from './load-world.mjs';
import {DeepSeekClient} from './deepseek-client.mjs';
import {runContentPipeline,readApprovedContent,defaultReviewRequest,PROCESS_DRAFT_RULES} from './content-pipeline.mjs';
import {economyW3Trades} from '../world/design/economy-w3-trades.mjs';
import {readApprovedSupersedes} from './approved-revisions.mjs';
import {w3Context,validateW3Draft,closestW3Similarity,assembleW3} from './w3-content.mjs';
import {processIssues} from './w3-process-check.mjs';

export const tradesRoot='world/drafts/w3/trades',tradesRevision='w3-trades-1';
export function validateTradesDraft(draft,entry,blocklist,context){
 const result=validateW3Draft(draft,entry,blocklist,context);
 if(entry.id.startsWith('item_')){
  const prose=['description','inspection','storage'].map(key=>draft[key]??'').join(''),facts=entry.name+entry.use;
  if(/铜(?:制|质|头|坯|身|刃|面)|青铜/.test(prose)&&!facts.includes('铜'))result.errors.push('品质铜不等于铜材，说明新增铜材质');
  if(/石(?:制|质|头|刃|身)/.test(prose)&&!facts.includes('石'))result.errors.push('品质石不等于石材，说明新增石材质');
 }
 if(entry.id.startsWith('recipe_')&&typeof draft?.process==='string')for(const message of processIssues(draft.process,entry,context))if(!result.errors.includes(message))result.errors.push(message);
 return result;
}
export function tradesReviewRequest(entry,draft,context){
 const {quality,...facts}=entry;
 const body=defaultReviewRequest({...facts,...(quality?{qualityGrade:{name:quality,meaning:'装备品质等级；材质由name/use及配方决定'}}:{})},draft,context);
 body.messages[0].content+=' 注意：quality是品质等级，不是材料名称，铜品质也可为铁制。materials.amount是目录份数；“四枚鸡蛋为一份”时amount=1允许四枚蛋。骨架processFacts与引用facts.use均为权威事实。只报告真正相反的句子：理由若是数值一致、不构成矛盾、未声明但相容，就不应列hard。普通工序分步骤耗时可小于总耗时，只有全程或合计与minutes不符才是硬矛盾。木炭与刨屑供炉火，不混入食物或染液，不能要求把燃料吃下。废料弃置与byproducts空数组一致。';
 body.messages[0].content+=' 上文(a)至(e)五项检查清单优先于“未声明但相容不列hard”：工序断层、骨架外工具材料水量、自添用途期限禁忌维修、单位数量不符、病句错字，一律列hard。';
 body.messages[0].content+=' 返回的是矛盾列表，不是核对清单。数值一致或材料等价的核对结果不得放进contradictions，即使标为soft也不应列入。例如骨架weight=0.1公斤，说明100克，两者一致，正确输出为{\"contradictions\":[]}；若说明200克，则须保留hard并指出200克与100克不符。';
 if(context?.materials){const payload=JSON.parse(body.messages[1].content);payload.materialUnits=context.materials.map(row=>({id:row.item,portions:row.amount,gramsPerPortion:row.facts.weight*1000,totalGrams:row.amount*row.facts.weight*1000}));body.messages[1].content=JSON.stringify(payload);}
 return body;
}
export function assembleTradesCandidate(world,bones,lore,supersedes=[]){
 const candidate=assembleW3(world,bones,lore,supersedes);
 for(const plan of bones.supply){const npc=candidate.npcs.find(row=>row.id===plan.npc);if(!npc)throw new Error(`供货者不存在 ${plan.npc}`);
  for(const[item,quantity]of Object.entries(plan.stock)){
   if(!candidate.items.some(row=>row.id===item))throw new Error(`供货物品尚未审核 ${item}`);
   if(!Object.hasOwn(npc.inventory,item))npc.inventory[item]=quantity;
  }
 }
 return candidate;
}
export async function inspectTrades(world,bones,{requireL4=true}={}){
 const rows=[],blocklist=JSON.parse(await fs.readFile('world/meta/blocklist.json','utf8'));
 for(const kind of ['items','recipes']){
  const root=`${tradesRoot}/${kind}`;
  const lore=requireL4?await readApprovedContent(root,bones[kind],{contextFor:entry=>w3Context(world,bones,entry),revision:tradesRevision}):await Promise.all(bones[kind].map(async row=>JSON.parse(await fs.readFile(`${root}/${row.id}.json`,'utf8')).draft));
  for(const row of lore){const entry=bones[kind].find(entry=>entry.id===row.id),validation=validateTradesDraft(row,entry,blocklist,w3Context(world,bones,entry));if(validation.errors.length)throw new Error(`${row.id}: ${validation.errors.join('；')}`);
   const nearest=closestW3Similarity(row,[...lore,...world[kind]]);if(nearest.score>=.35)throw new Error(`${row.id}与${nearest.id}说明相似度${nearest.score}`);
  }rows.push(...lore);
 }
 const candidate=assembleTradesCandidate(world,bones,rows,await readApprovedSupersedes());
 return{candidate,rows};
}
// 人工改写工具（tools/manual-rewrite.mjs）取用的 L1 配置：与流水线同一个 validateTradesDraft，不另写规则；形状与 tools/w3-journey.mjs 的相同。
export async function manualRewriteProfile(kind){
 const world=await loadWorld(),bones=economyW3Trades(world),blocklist=JSON.parse(await fs.readFile('world/meta/blocklist.json','utf8'));
 if(!bones[kind])throw new Error('--kind 须为 items 或 recipes');
 return{entries:bones[kind],contextFor:entry=>w3Context(world,bones,entry),validateDraft:(draft,entry,context)=>validateTradesDraft(draft,entry,blocklist,context)};
}
async function main(){
 const world=await loadWorld(),bones=economyW3Trades(world),blocklist=JSON.parse(await fs.readFile('world/meta/blocklist.json','utf8'));
 if(process.argv.includes('--check')){const {candidate}=await inspectTrades(world,bones);console.log(JSON.stringify({candidateItems:candidate.items.length,candidateRecipes:candidate.recipes.length,sourceWritten:false,supply:bones.supply}));return;}
 await fs.mkdir(tradesRoot,{recursive:true});await fs.writeFile(`${tradesRoot}/bones.json`,JSON.stringify(bones,null,2)+'\n');
 const client=new DeepSeekClient({budgetYuan:20});
 for(const kind of ['items','recipes']){
  const fields=kind==='items'?['description','inspection','storage']:['process'];
  await runContentPipeline({entries:bones[kind],root:`${tradesRoot}/${kind}`,budgetRoot:'world/drafts/w3',client,batchSize:kind==='items'?34:25,concurrency:12,revision:tradesRevision,
   contextFor:entry=>w3Context(world,bones,entry),validateDraft:(draft,entry,context)=>validateTradesDraft(draft,entry,blocklist,context),buildReviewRequest:tradesReviewRequest,
   buildDraftRequest:(entry,feedback,context)=>({temperature:.55,max_tokens:1000,tools:[{type:'function',function:{name:'submit_content',description:'只返回当前这一条说明。',parameters:{type:'object',additionalProperties:false,required:['id',...fields],properties:{id:{type:'string',enum:[entry.id]},...Object.fromEntries(fields.map(field=>[field,{type:'string',minLength:1}]))}}}}],tool_choice:{type:'function',function:{name:'submit_content'}},messages:[
    {role:'system',content:`起草原创中世纪中文器物说明，只填当前条目的${fields.join('、')}，不得同时输出其他实体。description建议90–150字，inspection 45–90字，storage 35–65字，process 90–160字；长度只作软范围。每件选择具体结构、痕迹和有限检验动作，不按同一句式轮换名词。严格核对本条材料、工具、数量、用途与取得方式；不得添加釉料、调味料、缝线、刀剪和容器。容器另备时明确不随货提供。不得拿克数当份数，不把鲜乳写成乳粉。分步耗时只写阿拉伯数字加分钟，禁止换成息、时辰或小时；不写总耗时或全程多少分钟（总时长由程序按骨架补写）。绝不出现骨架、系统、主持人、玩家不能等开发语。工具清单中的工具必须实际使用，过程不添加清单外工具。食物损坏只作外观气味检查，不要求尝变质食物。${kind==='items'?'有保存期时storage必须准确写数字加天；null则不加期限。书本写识字100与指定阅读分钟。产地用给定中文名，出处未给的树种、人物和机构不得自行命名。':'工序按processFacts展开，原料配额需要分用时说明总量未变。无副产品就把废料弃置；燃料只入炉，不进食物。'+PROCESS_DRAFT_RULES}反馈只用于修正当前条目。`},
    {role:'user',content:JSON.stringify({skeleton:entry,referencedFacts:context,feedback})}]}),
   onBatch:async batch=>console.log(JSON.stringify({kind,index:batch.index,count:batch.count,passed:batch.passed,manual:batch.manual,pending:batch.pending,costUpperYuan:client.spent})),
  });
 }
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/w3-trades.mjs'))await main();
