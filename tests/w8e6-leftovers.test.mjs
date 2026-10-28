import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {WorldEngine as Phase1Engine} from '../server-plugin/compat/v2-phase1-engine.mjs';
import {valuation,goodsWorth} from '../server-plugin/valuation.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';
import {officeScene} from './helpers/office-actions.mjs';
import {fixture,asset,DRIVER,SENDER,RECIPIENT} from './helpers/transport.mjs';
import {sendPost} from '../server-plugin/post.mjs';
import {carrierDeparture,quoteTransport} from '../server-plugin/transport.mjs';
import {eventWeight} from '../server-plugin/standing.mjs';
import {adjudicateLegalCase,caseLoss} from '../server-plugin/law.mjs';
import {legalCodeAt} from '../server-plugin/law-codes.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const transportTable=JSON.parse(await fs.readFile('world/rules/tables/balance/transport.json','utf8'));
const reader=document=>({document,get:(...p)=>p.reduce((x,k)=>x?.[k],document)});
function prepared({unknown=false}={}){
 const w=structuredClone(world);
 for(const n of w.npcs){delete n.schedule;delete n.tier;}
 w.items.find(i=>i.id==='item_linen_cloth').basePrice=unknown?0:50;
 const e=new WorldEngine(w),item='item_linen_cloth',npc='npc_hw_linsui';
 const initial=e.initialFromLegacy(seed,'w8e6');
 const setup=applyIntentSetup(e,initial,{minute:600,location:'bld_hw_qingdeng',present:[npc,'npc_hw_gucen'],coins:10000,inventory:{[item]:1},facts:[{path:['state','npcs',npc,'inventory'],value:{...initial.state.npcs[npc].inventory,[item]:2}}]});
 assert.deepEqual(setup.setupUnmet,[]);
 return {e,document:setup.document,item,npc};
}
async function run(e,document,tool,args,eventId){const out=await e.reduce(document,{tool,args,eventId});return {...out,document:applyPatches(document,out.patches)};}

test('基准估值不含当地稀缺，派生修正只计一次；未知基准保留 null',()=>{
 const {e,document,item}=prepared();
 // 手算：目录 50 × 数量 2 = 基准 100；河湾布供过于求，稀缺下限 .5 → 当地价值 50。
 assert.equal(valuation(reader(document),e,{role:'baseline',item,quantity:2}).value,100);
 assert.equal(goodsWorth(reader(document),e,{item,quantity:2,holder:'player'}),50);
 const w=structuredClone(e.world);w.derived.modifiers.push({id:'w8e6-baseline-double',pack:'core',target:'economy:value',stage:'mul',value:2,when:"subject == 'item_linen_cloth'"});
 const changed=new WorldEngine(w);
 // 手算：50 × 修正 2 × 数量 2 = 200；不是重复修正后的 400。
 assert.equal(valuation(reader(document),changed,{role:'baseline',item,quantity:2}).value,200);
 const unknown=prepared({unknown:true});
 assert.equal(valuation(reader(unknown.document),unknown.e,{role:'baseline',item}).value,null);
});

test('真实扒窃、递交自认、立案和审理：未知案值只按基础罚则，赔偿不记零',async()=>{
 const {e,document,item,npc}=prepared({unknown:true});let stolen;
 for(let i=0;i<100&&!stolen;i++){
  const out=await run(e,document,'world_crime',{operation:'steal',target:npc,item},`w8e6-steal-${i}`);
  if(out.result.success&&[npc,'npc_hw_gucen'].every(id=>out.result.witnesses.includes(id)))stolen=out;
 }
 assert.ok(stolen);
 const key=stolen.result.case,suspicion=stolen.document.state.records[key];
 assert.equal(suspicion.value,null);assert.equal(suspicion.unvaluable,'无法核定案值');
 assert.match(stolen.result.valuationNote,/无从估价/);
 assert.equal(caseLoss(reader(stolen.document),e,suspicion),null,'未核定的损失不登记成零元损失');
 const confession=await run(e,stolen.document,'world_law',{operation:'confess',case:key,authority:'npc_hw_gucen'},'w8e6-confess');
 const desk=officeScene(e,confession.document,{location:'bld_bs_watch',minute:confession.document.state.minute,present:['npc_bs_035_1']});
 const accepted=await run(e,desk,'world_act',{action:'law:request_decision',slots:{request:confession.result.request,authority:'npc_bs_035_1'}},'w8e6-file');
 assert.equal(accepted.result.accepted,true);assert.equal(accepted.result.unvaluable,'无法核定案值');
 const filed=accepted.document.state.records[key],code=legalCodeAt(e,filed.location,accepted.document.state);
 const court=applyIntentSetup(e,accepted.document,{location:code.court,present:[npc,'npc_hw_gucen']}).document;
 const testimony=await run(e,court,'world_law',{operation:'submit_evidence',case:key,witness:npc,source:filed.sourceEvent},'w8e6-testify');
 const guardTestimony=await run(e,testimony.document,'world_law',{operation:'submit_evidence',case:key,witness:'npc_hw_gucen',source:filed.sourceEvent},'w8e6-guard-testify');
 // 程序手算：自认 2 + 两名真实目击者各至少 (1-.5)=.5，合计至少 3，达到盗窃阈值 3。
 const row=guardTestimony.document.state.records[key],d=e.primitiveDraft(guardTestimony.document);
 const judged=adjudicateLegalCase(d,e,row,code,'npc_hw_chenbai','w8e6-judge',[]);
 // 手算：案值未知，valueMultiplier 不参与；实罚 = 行为时法条 baseFine，赔偿仍未知。
 assert.equal(judged.convicted,true);assert.equal(judged.judgment.fine,row.normSnapshot.penalty.baseFine);
 assert.equal(judged.judgment.compensation,null);assert.equal(judged.fineCalculation.multiplier,null);
 assert.match(judged.factSummary,/无从估价.*基础罚则/);
});

test('真实问话赠礼：对方无法估值，事件和回执标明未知，只加心意基额',async()=>{
 const {e,document,item,npc}=prepared({unknown:true});
 const out=await run(e,document,'world_remember',{subject:npc,key:'dialogue:ask',content:'近来如何',source:item},'w8e6-gift');
 assert.equal(out.result.socialEvent.value,null);assert.equal(out.result.unvaluable,'对方无法估值');
 assert.match(out.result.valuationNote,/无从估价/);
 const event=out.document.state.records['world_event:w8e6-gift'];
 assert.equal(event.value,null);assert.equal(event.unvaluable,'对方无法估值');
 // 手算：既有赠礼规则 3 + floor(value/10)；未知不算 value，只取心意 3。
 assert.equal(eventWeight(event,e,out.document.state),3);
 assert.equal(e.quantity(reader(out.document),'player',item),0);
});

test('驿传按表中真实班次估算，不被整点预取整推迟一天',()=>{
 const {e,d}=fixture(),vehicle=asset(d,e);e.world.balance={...e.world.balance,transport:structuredClone(transportTable)};
 e.world.balance.transport.rows.find(r=>r.key==='departure:post').at=421;
 d.set(['state','minute'],421);d.set(['state','npcs',RECIPIENT,'location'],'loc_bs');
 const expected=quoteTransport(d,e,{asset:vehicle,from:'loc_hw',to:'loc_bs',departAt:421});
 const sent=sendPost(d,e,{from:'player',to:RECIPIENT,memoryId:'家书',legs:[{asset:vehicle,to:'loc_bs'}],receipt:false},'w8e6-post');
 // 手算：421 <= 班次 421，同日发；旧 ceil(421/60)*60=480，错过班次而推迟到次日。
 assert.equal(expected.departAt,421);assert.equal(sent.estimatedArrivalAt,expected.estimatedArrivalAt);
 assert.equal(d.get('state','records',sent.shipment,'departAt'),421);
 assert.equal(carrierDeparture(e,'post',420),421);
 assert.equal(carrierDeparture(e,'post',422),1440+421);
});

test('无发车班次的承运方式随到随走，报价与实际寄件一致',()=>{
 const {e,d}=fixture(),vehicle=asset(d,e);d.set(['state','minute'],617);d.set(['state','npcs',RECIPIENT,'location'],'loc_bs');
 e.world.balance={...e.world.balance,transport:structuredClone(transportTable)};
 e.world.balance.transport.rows=e.world.balance.transport.rows.filter(r=>r.key!=='departure:post');
 // 手算：无班次，617 寄出即 617 发；不是 ceil(617/60)*60 = 660。
 assert.equal(carrierDeparture(e,'post',617),617);
 const quote=quoteTransport(d,e,{asset:vehicle,from:'loc_hw',to:'loc_bs',departAt:617});
 const sent=sendPost(d,e,{from:'player',to:RECIPIENT,memoryId:'家书',legs:[{asset:vehicle,to:'loc_bs'}],receipt:false},'w8e6-unscheduled');
 assert.equal(d.get('state','records',sent.shipment,'departAt'),617);assert.equal(sent.estimatedArrivalAt,quote.estimatedArrivalAt);
});

test('兼容交易读取唯一市场派生：布基准 50、稀缺 .5 → 单件 25，旧 40~75 区间退出',async()=>{
 const {e,document,item,npc}=prepared();const d=e.primitiveDraft(document),legacy=new Phase1Engine(e.world);
 // 手算：50 × .5 × 品质 1 = 25，允许同一市场议价区间里的 25 铜成交。
 const out=await legacy.trade(d,{seller:npc,item,quantity:1,unitPrice:25},'w8e6-compat');
 assert.equal(out.cost,25);assert.equal(out.quantity,1);
});
