// Fixed, reviewable S5-06 candidate. Preparing is free; publication requires
// the existing content pipeline's actual L2 evidence and L4 reading records.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {readApprovedContent,runContentPipeline,defaultReviewRequest} from '../../tools/content-pipeline.mjs';
import {loadWorld} from '../../tools/load-world.mjs';
import {validateWorld} from '../../tools/validate-world.mjs';
import {installEcologyDefinitions} from '../../server-plugin/ecology-dynamics.mjs';
import {schemaValidator} from '../../server-plugin/primitive-schema.mjs';
import {DeepSeekClient} from '../../tools/deepseek-client.mjs';

const root='world/drafts/s506-ecology';
export const revision='s506-ecology-parameters-1';
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
async function appendRows(file,rows){
 if(!rows.length)return;
 const text=await fs.readFile(file,'utf8'),data=JSON.parse(text);
 // These authored files end in the item array / actions array. Keep every
 // existing byte, appending only approved rows instead of reformatting it all.
 assert.ok(Array.isArray(data)||Object.keys(data).at(-1)==='actions');
 const end=text.lastIndexOf(']'),before=text.slice(0,end),body=before.trimEnd(),newline=text.includes('\r\n')?'\r\n':'\n',indent=/^([ \t]*)\{"id":/m.exec(text)?.[1]??'';
 await fs.writeFile(file,body+','+newline+rows.map(row=>indent+JSON.stringify(row)).join(','+newline)+before.slice(body.length)+text.slice(end));
}
const item=(id,name,tags,weight,price,days,description)=>({id,name,aliases:[],scope:null,origin:'loc_hw',quality:'木',durability:100,weight,basePrice:price,shelfLifeDays:days,tags,unit:'份',seasonality:'按真实在养头数与喂养结算',use:description,description,inspection:'核对实际产出批次、产物状态与来源种群。',storage:days===null?'保持干燥，未加工纤维不等于洗净或纺成的毛线。':'按实际产出日期存放，过期不能作为新鲜产物重新入账。'});
const milk=item('item_goat_milk','鲜山羊乳',['milk','drinkable','food'],.3,3,1,'从实际在养山羊采集的一份鲜乳；须先有活体产出并花时间采集，不是牛乳，也不凭空产生容器。');
const hair=item('item_raw_goat_hair','未洗山羊毛',['fiber','hair'],.1,2,null,'从实际在养山羊采集的未洗毛；不等于洗净羊毛或毛线，后续加工须另耗工料。');
const egg=item('item_pheasant_egg','雉蛋',['food','egg'],.05,1,7,'实际在养麦斑野雉所产的蛋；按枚折作一份，不等于鸡蛋小篮份，不凭空附送篮子。');
export const ecology={
 species:[
  {id:'monster_bent_horn_goat',ecology:{disease:'disease:cold',niche:{grass:1}},interactions:[{with:'monster_oat_pheasant',kind:'mutualism',k:.1}],
   husbandry:{feed:{item:'item_oats',perHead:.25},birthPerHeadDay:.25/360,yields:{alive:[{item:milk.id,perHeadDay:.25,collectMinutes:5},{item:hair.id,perHeadDay:1/360,collectMinutes:10}]}}},
  {id:'monster_oat_pheasant',ecology:{disease:'disease:cold',niche:{grass:.5,insects:.5}},interactions:[{with:'monster_bent_horn_goat',kind:'mutualism',k:.1}],
   husbandry:{feed:{item:'item_oats',perHead:.05},birthPerHeadDay:1/360,yields:{alive:[{item:egg.id,perHeadDay:.25,collectMinutes:2}]}}},
  {id:'monster_leaf_hare',ecology:{niche:{grass:1}},interactions:[{with:'monster_brown_deer',kind:'competition',k:.1}]},
  {id:'monster_brown_deer',ecology:{niche:{grass:1}},interactions:[{with:'monster_leaf_hare',kind:'competition',k:.1}]},
  {id:'monster_grey_ridge_wolf',interactions:[{with:'monster_leaf_hare',kind:'predation',k:.25,handling:2}]}
 ],
 // New husbandry facts, not inferred from a shop's milk inventory. These
 // openings remain candidates until the owner/location facts are reviewed.
 herds:[
  {id:'population_hw_home21_goats',name:'谢堇家的山羊群',owner:'npc_hw_xiejin',location:'bld_hw_home_21',species:'monster_bent_horn_goat',count:4,capacity:12},
  {id:'population_hw_home21_pheasants',name:'谢堇家的雉群',owner:'npc_hw_xiejin',location:'bld_hw_home_21',species:'monster_oat_pheasant',count:4,capacity:12}
 ],
};
const base=(await read('world/actions/core.json')).actions.find(a=>a.id==='core:wildlife.release');
const actions=[
 { ...base,id:'core:husbandry.inspect',call:{tool:'world_field',operation:'farm_husbandry_inspect'},label:'查看自家畜群',verb:'husbandry.inspect',group:'农事',pack:'ecology',readOnly:true,preconditions:["canAct(actor, 'environment').allowed"],consent:{from:'self'},slots:[{name:'target',kind:'text'}],cost:{time:'engine'},synonyms:[],narration:'husbandry.inspect',source:'catalog'},
 { ...base,id:'core:husbandry.collect',call:{tool:'world_field',operation:'farm_husbandry_collect'},label:'采集活体产物',verb:'husbandry.collect',group:'农事',pack:'ecology',preconditions:["canAct(actor, 'environment').allowed"],consent:{from:'self'},slots:[{name:'target',kind:'text',required:true},{name:'item',kind:'entity',entity:'item',required:true},{name:'quantity',kind:'number'}],cost:{time:'engine'},synonyms:[],narration:'husbandry.collect',source:'catalog'}
];
export const entries=[{id:'s506-species',row:ecology},...[milk,hair,egg].map(row=>({id:row.id,row})),...actions.map(row=>({id:row.id.replaceAll(':','-').replaceAll('.','-'),row}))];
export const draftFor=e=>({id:e.id,row:e.row});
async function preflight(){
 const world=await loadWorld();
 for(const row of [milk,hair,egg])if(!world.items.some(i=>i.id===row.id))world.items.push(structuredClone(row));
 installEcologyDefinitions(world,ecology);
 const result=validateWorld(world);assert.equal(result.ok,true,result.errors.join('; '));
 const valid=schemaValidator('definition');for(const action of actions)assert.ok(valid(action),JSON.stringify(valid.errors));
}
export const contextFor=()=>({basis:'用户 s506/s506b；05 §5.5；10章第五轮：统一物种数据与派生槽。',
 sourceFacts:{health:'原有 balance/health disease:cold，R0=1.4、courseDays=7、lethality=.002；按病种基率推导日率，不在此复制数值。',
  birth:'山羊按既有 balance/ecology r:large=.25/年，雉禽按 r:small=1/年作待标定候选；360日年。不是已测生育率。',
  production:'奶、原毛、雉蛋均为新增校准占位：乳和蛋按平均每头.25份/日，原毛1份/年；原毛不冒充洗净羊毛，雉蛋不冒充篮装鸡蛋。只从真实活体、饲料和劳动产出。',
  interaction:'竞争与互利 k=.1 为待标定候选；地栖禽取虫的双向增益须核对。狼的a按既有每周1/4再除猎物K，h=2是待标定处理时间，不冒充既有事实。',
  ownership:'既有人物谢堇为河岸农户，居bld_hw_home_21。各四只山羊和雉禽、各容量12是拟新增的家庭兼业事实，不由商品库存推出；须核对宅旁饲养条件。实际消耗谷物，未供料不产奶蛋毛，没有审批不得开户。'}});
export async function review(client,allocation){
 assert.ok(client,'须提供本卡已授权的内容审阅客户端');
 await preflight();
 return runContentPipeline({entries,root:`${root}/review`,budgetRoot:root,revision,contextFor,client,cardId:'S506',allocation,
  validateDraft:(draft,entry)=>{try{assert.deepEqual(draft,draftFor(entry));return [];}catch(e){return [e.message];}},
  reviewDraftFor:async entry=>draftFor(entry),reuseFrozenDrafts:true,buildDraftRequest:()=>{throw Error('固定人工候选');},
  buildReviewRequest:async(...args)=>{
   const budget=await read(`${root}/budget.json`);
   if(Object.values(budget.requests??{}).some(r=>r.status==='unknown'))throw Object.assign(Error('存在未核定费用的请求，停止后续L2，不重试或重领额度'),{code:'CONTENT_BUDGET_STOP'});
   return defaultReviewRequest(...args);
  },concurrency:1,batchSize:6});
}
export async function run(args=process.argv.slice(2)){
 if(args.includes('--review')){
  assert.ok(process.env.DEEPSEEK_API_KEY,'DEEPSEEK_API_KEY 环境变量未配置，停止L2');
  await fs.mkdir(root,{recursive:true});
  try{await fs.writeFile(`${root}/budget.json`,JSON.stringify({spentYuan:0,reservedYuan:0,waveLimitYuan:.3,cards:{S506:{limitYuan:.3,spentYuan:0,reservedYuan:0,maxRequests:18}},requests:{}},null,2)+'\n',{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;}
  const {summary}=await review(new DeepSeekClient({budgetYuan:.3,logFile:`${root}/usage.jsonl`}),{cardId:'S506',incrementLimitYuan:.3,maxRequests:18,waveLimitYuan:20,startingSpentYuan:0,startingReservedYuan:0});
  console.log(JSON.stringify({passed:summary.passed,manual:summary.manual,pending:summary.pending,budget:summary.budget.cards.S506}));
 }
 if(args.includes('--prepare')||args.includes('--publish'))await preflight();
 if(args.includes('--prepare')){await fs.mkdir(root,{recursive:true});await fs.writeFile(`${root}/candidate.json`,JSON.stringify({revision,entries,context:contextFor(),status:'pending-L2-L4'},null,2)+'\n');console.log(JSON.stringify({prepared:entries.length,published:false}));}
 if(args.includes('--publish')){
  const approved=await readApprovedContent(`${root}/review`,entries,{revision,contextFor});assert.equal(approved.length,entries.length,'生态候选尚未完成真实L2/L4审批');
  for(const entry of entries)assert.deepEqual(approved.find(d=>d.id===entry.id),draftFor(entry));
  const nextItems=await read('world/meta/items.json'),nextActions=await read('world/actions/core.json'),addedItems=[],addedActions=[];
  for(const row of [milk,hair,egg]){const existing=nextItems.find(i=>i.id===row.id);if(existing)assert.deepEqual(existing,row);else addedItems.push(row);}
  for(const row of actions){const existing=nextActions.actions.find(i=>i.id===row.id);if(existing)assert.deepEqual(existing,row);else addedActions.push(row);}
  await fs.mkdir('world/ecology',{recursive:true});await fs.writeFile('world/ecology/species.json',JSON.stringify(ecology,null,2)+'\n');
  await appendRows('world/meta/items.json',addedItems);await appendRows('world/actions/core.json',addedActions);
  await fs.writeFile(`${root}/candidate.json`,JSON.stringify({revision,entries,context:contextFor(),status:'published'},null,2)+'\n');
  console.log(JSON.stringify({published:entries.length}));
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await run();
