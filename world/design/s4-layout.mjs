// S4-01：布局草案与既有内容审批管线入口。新距离是设计值，不从精细坐标计算。
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {runContentPipeline,defaultReviewRequest,readApprovedContent} from '../../tools/content-pipeline.mjs';
import {DeepSeekClient} from '../../tools/deepseek-client.mjs';

export const rules={edgeMetres:6,entryName:'入口',featureSuffix:'附近',directions:['东侧','南侧','西侧','北侧']};
export const layouts={bld_bs_reed_dao:{entry:'zone_reed_entry',defaultZone:'zone_reed_court',zones:[
 {id:'zone_reed_entry',name:'观门土路',features:['feature_s2_gate_road'],point:[0,2]},
 {id:'zone_reed_court',name:'观内院地',features:['feature_s2_water_jar','feature_s4_gate'],point:[0,0]},
 {id:'zone_reed_side',name:'观门侧廊',features:['feature_s2_side_passage'],point:[1,1]},
 {id:'zone_reed_scripture',name:'经阁门外',features:['feature_s4_scripture_door'],point:[-1,0]},
 {id:'zone_reed_library',name:'经阁',point:[-2,0]},
 {id:'zone_reed_rift_south',name:'旧阵残隙南侧',features:['feature_s4_old_rift'],point:[-1,-3]},
],edges:[
 {from:'zone_reed_entry',to:'zone_reed_court',direction:'南侧',metres:6,barrier:'feature_s4_gate'},
 {from:'zone_reed_entry',to:'zone_reed_side',direction:'东侧',metres:6},
 {from:'zone_reed_side',to:'zone_reed_court',direction:'西侧',metres:6},
 {from:'zone_reed_court',to:'zone_reed_scripture',direction:'西侧',metres:6},
 {from:'zone_reed_scripture',to:'zone_reed_library',direction:'西侧',metres:6,barrier:'feature_s4_scripture_door'},
 {from:'zone_reed_court',to:'zone_reed_rift_south',direction:'南侧',metres:6,barrier:'feature_s4_old_rift'},
 {from:'zone_reed_scripture',to:'zone_reed_rift_south',direction:'南侧',metres:12},
]}};
const root='world/drafts/s4-layout',revision='s401-layout-2';
const entries=[{id:'s401_layout_rules',row:rules,source:'01 §1.5、08 §8.8：缺数据时确定性生成布局。缺省每段6米，按现有75米/分钟速度向上取整；入口连接公开物件附近，方向按种子和ID确定。不读取精细坐标决定距离，不授予所有权或接触。'},
 {id:'s401_reed_layout',row:layouts,source:'world/geo/locations.json#bld_bs_reed_dao 已发布观门土路、观门、观门侧廊、水缸、经阁门、旧阵残隙。补入分区和邻接，普通边6米、经阁外绕残隙12米；侧廊可绕观门。经阁门外至经阁须穿实际锁门，锁闭时不可进入；不赋予开锁或用物权限。旧阵残隙原有 blocksSpace 阻断直路，经阁外绕行不穿残隙。未单独划区的物件在院地。坐标仅适配既有法术，不决定普通距离，不改变原有物件事实、归属或地点权限。'}];
const contextFor=e=>({source:e.source,boundary:'仅空间布局设计；不增加物品、服务、法域或权限。坐标仅现有法术适配；到分区仍须另行走近对象才能接触。'});
const draftFor=e=>({id:e.id,row:e.row});
async function validateDraft(d,e){try{assert.deepEqual(d,draftFor(e));for(const l of Object.values(layouts)){const ids=new Set(l.zones.map(z=>z.id));assert.ok(ids.has(l.entry));for(const edge of l.edges){assert.ok(ids.has(edge.from)&&ids.has(edge.to));assert.ok(edge.metres>0);}}return [];}catch(error){return [error.message];}}
export async function run(args=process.argv.slice(2)){
 if(args.includes('--review')){
  await fs.mkdir(root,{recursive:true});
  try{await fs.access(path.join(root,'budget.json'));}catch(e){if(e.code!=='ENOENT')throw e;await fs.writeFile(path.join(root,'budget.json'),JSON.stringify({spentYuan:0,reservedYuan:0,waveLimitYuan:1,cards:{S401:{limitYuan:1,spentYuan:0,reservedYuan:0,maxRequests:30}},requests:{}}));}
  const client=new DeepSeekClient({budgetYuan:1,logFile:path.join(root,'usage.jsonl')});
  const {summary}=await runContentPipeline({entries,root:path.join(root,'review'),budgetRoot:root,revision,contextFor,validateDraft,reviewDraftFor:async e=>draftFor(e),reuseFrozenDrafts:true,buildDraftRequest:()=>{throw Error('冻结设计，无模型起草');},buildReviewRequest:defaultReviewRequest,client,cardId:'S401',allocation:{cardId:'S401',incrementLimitYuan:1,maxRequests:30,waveLimitYuan:20,startingSpentYuan:0,startingReservedYuan:0},concurrency:1,batchSize:2});
  console.log(JSON.stringify({passed:summary.passed,manual:summary.manual,pending:summary.pending,budget:summary.budget.cards.S401}));
 }
 if(args.includes('--publish')){
  const approved=await readApprovedContent(path.join(root,'review'),entries,{revision,contextFor});assert.equal(approved.length,entries.length);
  const rulesPath='world/meta/rules.json',placesPath='world/geo/locations.json';
  const rulesText=await fs.readFile(rulesPath,'utf8'),rules=JSON.parse(rulesText),places=JSON.parse(await fs.readFile(placesPath,'utf8'));
  const oldEnvironment=JSON.stringify(rules.environment,null,2).replace(/\n/g,'\n  ');assert.ok(rulesText.includes(oldEnvironment));
  rules.environment.placeLayout=approved[0].row;
  for(const [id,layout] of Object.entries(approved[1].row)){const place=places.find(p=>p.id===id);assert.ok(place,id);place.layout=layout;}
  await fs.writeFile(rulesPath,rulesText.replace(oldEnvironment,JSON.stringify(rules.environment,null,2).replace(/\n/g,'\n  ')));
  await fs.writeFile(placesPath,JSON.stringify(places,null,2)+'\n');
  console.log('published=2');
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await run();
