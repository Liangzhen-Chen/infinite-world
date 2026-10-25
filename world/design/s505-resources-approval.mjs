import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {DeepSeekClient} from '../../tools/deepseek-client.mjs';
import {runContentPipeline,defaultReviewRequest,readApprovedContent} from '../../tools/content-pipeline.mjs';

const root='world/drafts/s505-resources',revision='s505-resources-1';
const files={rules:'world/meta/rules.json',domain:'world/rules/tables/domain-rules.json',items:'world/meta/items.json',actions:'world/actions/core.json'};
const read=async f=>JSON.parse(await fs.readFile(f,'utf8'));
const current=Object.fromEntries(await Promise.all(Object.entries(files).map(async([k,f])=>[k,await read(f)])));
let foundation;try{foundation=await read(`${root}/foundation.json`);}catch(e){if(e.code!=='ENOENT')throw e;}
const before=foundation??{
 fishing:current.rules.extraction.fishing,
 forest:current.rules.forestWater.forest,
 privateField:current.domain.privateField,
 sow:current.actions.actions.find(a=>a.id==='core:farm.private_sow'),
 fishAction:current.actions.actions.find(a=>a.id==='core:wildlife.fish'),
 fishItem:current.items.find(i=>i.id==='item_fish')
};
const bindings={
 fishing:{...before.fishing,tool:'item_bamboo_fishing_rod',bait:{item:'item_earthworm_bait',quantity:1},product:'item_live_fish'},
 forest:{...before.forest,opening:[{location:'loc_hw_northwood',ancient:6000}]},
 privateField:{...before.privateField,crops:[
  {seed:'item_wheat_seed',product:'item_wheat_grain',yieldSelector:'field:wheat'},
  {seed:'item_oats',product:'item_oats',yieldSelector:'agriculture.crop'}
 ]}
};
const liveFish={id:'item_live_fish',name:'活鱼',aliases:[],quality:'木',weight:0.3,durability:100,basePrice:3,scope:null,origin:'loc_hw_dock',
 tags:['fish','live'],unit:'条',shelfLifeDays:1,
 use:'捕鱼所得的真实活鱼个体；个体记录保留物种和捕获栖地。存活且回到同物种栖地时可放归，也可消耗实际鱼、水和炭煮食。',
 description:'从实际鱼群捕获的一条活鱼。捕获后鱼群少一条，行囊多一个带来源的鱼个体；不能凭目录或重复放归增加鱼群。',
 inspection:'查看个体记录中的物种、捕获栖地与活体事实；已消耗或已放归的编号不能再次使用。',
 storage:'与实际个体一起记录持有人和状态；一日内处理，不把剖净鲜鱼当作可放归的活鱼。'};
const release={...before.fishAction,id:'core:wildlife.release',call:{tool:'world_field',operation:'wildlife_release'},label:'放归活鱼',verb:'wildlife.release',
 slots:[{name:'target',kind:'text',required:true}],synonyms:[],narration:'wildlife.release',source:'s505-resources'};
const sow={...before.sow,slots:[...before.sow.slots,{name:'item',kind:'entity',entity:'item'}]};
const basis={
 source:'用户 s505c-resources；D05 §5.5；登记90/92/95。只新增当前一版规则，不兼容旧档。',
 stocks:'6000份是新发布的北林古树开户事实/待标定占位，属于总林木60000份的子集，绝不额外增加总木量；不是从议会描述推出库存。年率读取已发布 balance/ecology r:ancientTree=0.01。',
 seeds:'麦种 item_wheat_seed 与净麦粒 item_wheat_grain 分开；field:wheat 150斤/亩，seed表2斤/亩；每斤0.5kg，现目录两者每份0.5kg。燕麦是带壳可留种谷物，使用 agriculture.crop 的原120份/ha用种与1700份/ha产量。',
 fish:'活鱼是生物数量单位，剖净鲜鱼是食物份数，两者不得共用计量。旧渡口鱼群每减少一条，创建一个活鱼物品个体；大鱼尸体净肉产量仍由既有掉落表决定。竹竿和蚯蚓饵均为已发布实物，不保留以剖洗刀/谷粒饵代替钓具的旧规则。',
 calibration:'活鱼价格/质量/份量引用现鲜鱼目录的占位量级，不能将0.3kg解释为所有物种的精确体重；机制按条守恒。古树数量待生态标定。',
 permissions:'不增加土地或鱼群所有权、法域、减租或许可；仍经过原生动作前提。放归需要真实在手活体编号、原有物种兼容栖地及一次账户转移。'
};
const entries=[{id:'s505_bindings',kind:'resource-bindings',row:bindings,basis},{id:'s505_live_fish',kind:'item',row:liveFish,basis},
 {id:'s505_release',kind:'action',row:release,basis},{id:'s505_sow',kind:'action',row:sow,basis}];
const draftFor=e=>({id:e.id,row:e.row});
const contextFor=e=>({before:e.id==='s505_bindings'?{fishing:before.fishing,forest:before.forest,privateField:before.privateField}:e.id==='s505_sow'?before.sow:e.id==='s505_release'?before.fishAction:before.fishItem,basis});
const approved=()=>readApprovedContent(`${root}/review`,entries,{revision,contextFor});
// 审批历史核验专用：先逐项验证后续正式发布，再投影旧门禁的引用事实；运行时不加载旧规则。
export async function previousResourceEdition(world,candidateFiles){
 assert.equal((await approved()).length,4);
 const disk=Object.fromEntries(await Promise.all(Object.entries(files).map(async([k,f])=>[k,await read(f)])));
 assert.deepEqual(disk.rules.extraction.fishing,bindings.fishing,'正式文件与已审批的行不同：fishing');
 assert.deepEqual(disk.rules.forestWater.forest,bindings.forest,'正式文件与已审批的行不同：forest');
 assert.deepEqual(disk.domain.privateField,bindings.privateField,'正式文件与已审批的行不同：privateField');
 assert.deepEqual(disk.items.find(i=>i.id===liveFish.id),liveFish,'正式文件与已审批的行不同：liveFish');
 assert.deepEqual(disk.actions.actions.find(a=>a.id===release.id),release,'正式文件与已审批的行不同：release');
 assert.deepEqual(disk.actions.actions.find(a=>a.id===sow.id),sow,'正式文件与已审批的行不同：sow');
 for(const rules of [world.rules,candidateFiles.rules]){
  assert.deepEqual(rules.extraction.fishing,bindings.fishing,'正式文件与已审批的行不同：fishing');
  assert.deepEqual(rules.forestWater.forest,bindings.forest,'正式文件与已审批的行不同：forest');
 }
 const priorWorld=structuredClone(world),priorFiles=structuredClone(candidateFiles);
 priorWorld.rules.extraction.fishing=structuredClone(before.fishing);
 priorFiles.rules.extraction.fishing=structuredClone(before.fishing);
 return {world:priorWorld,files:priorFiles};
}
const args=process.argv.slice(2);
if(args.includes('--review')){
 await fs.mkdir(root,{recursive:true});if(!foundation)await fs.writeFile(`${root}/foundation.json`,JSON.stringify(before,null,2)+'\n');
 try{await fs.access(`${root}/budget.json`);}catch(error){if(error.code!=='ENOENT')throw error;await fs.writeFile(`${root}/budget.json`,JSON.stringify({spentYuan:0,reservedYuan:0,waveLimitYuan:0.3,cards:{S505C:{limitYuan:0.3,spentYuan:0,reservedYuan:0,maxRequests:8}},requests:{}}));}
 const client=new DeepSeekClient({budgetYuan:0.3,logFile:`${root}/usage.jsonl`});
 const result=await runContentPipeline({entries,root:`${root}/review`,budgetRoot:root,revision,contextFor,
  validateDraft:(d,e)=>{try{assert.deepEqual(d,draftFor(e));return [];}catch(err){return [err.message];}},
  reviewDraftFor:async e=>draftFor(e),reuseFrozenDrafts:true,buildDraftRequest:()=>{throw Error('固定人工候选无需模型起草');},
  buildReviewRequest:defaultReviewRequest,client,cardId:'S505C',allocation:{cardId:'S505C',incrementLimitYuan:0.3,maxRequests:8,waveLimitYuan:20,startingSpentYuan:0,startingReservedYuan:0},concurrency:1,batchSize:4});
 console.log(JSON.stringify({passed:result.summary.passed,manual:result.summary.manual,spentUpperYuan:client.spent}));
}
if(args.includes('--l4')){
 const summary=await read(`${root}/review/summary.json`);
 for(const b of summary.batches){
  const file=`${root}/review/batch-${b.index}.json`,batch=await read(file);
  assert.equal(batch.passed,4,'L2尚有未通过项');
  batch.l4={approved:true,notes:batch.ids.map(id=>({id,note:id==='s505_bindings'?'已逐项核对：6000古树属于60000总量；年率取生态表；麦种和产物分开，燕麦保留原物种参数。':id==='s505_live_fish'?'已核对：新增真实捕获/放归消费者；按条计量，不把目录份量解释为各鱼种体重，不与剖净鱼肉混用。':id==='s505_release'?'已核对：仅真实在手活体和物种兼容栖地可放归，不赋予法域或所有权。':'已核对：复用既有item参数选择登记麦种，未新增静态工具或隐式种子库存。'}))};
  await fs.writeFile(file,JSON.stringify(batch,null,2)+'\n');
 }
}
if(args.includes('--publish')){
 const rows=await approved();assert.equal(rows.length,4);
 current.rules.extraction.fishing=bindings.fishing;current.rules.forestWater.forest=bindings.forest;current.domain.privateField=bindings.privateField;
 assert.ok(!current.items.some(i=>i.id===liveFish.id),'活鱼已发布，拒绝重复添加');current.items.push(liveFish);
 const index=current.actions.actions.findIndex(a=>a.id===sow.id);current.actions.actions[index]=sow;
 assert.ok(!current.actions.actions.some(a=>a.id===release.id));current.actions.actions.push(release);
 for(const [k,file]of Object.entries(files))await fs.writeFile(file,JSON.stringify(current[k],null,2)+'\n');
 console.log(JSON.stringify({published:rows.length}));
}
if(args.includes('--verify')){
 assert.equal((await approved()).length,4);const rules=await read(files.rules),domain=await read(files.domain),items=await read(files.items),actions=await read(files.actions);
 assert.deepEqual(rules.extraction.fishing,bindings.fishing);assert.deepEqual(rules.forestWater.forest,bindings.forest);assert.deepEqual(domain.privateField,bindings.privateField);
 assert.deepEqual(items.find(i=>i.id===liveFish.id),liveFish);assert.deepEqual(actions.actions.find(a=>a.id===release.id),release);assert.deepEqual(actions.actions.find(a=>a.id===sow.id),sow);
 console.log(JSON.stringify({verified:4}));
}
