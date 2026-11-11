import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches,PatchCursor} from '../server-plugin/storage.mjs';
import {cashFlowWindow,operatingOptions,businessLifecycle,advanceCustomerFlow,flowTimesOfDay,shopWindows,customerWindows} from '../server-plugin/business.mjs';
import {scheduleAt} from '../server-plugin/npc-schedule.mjs';
import {autonomyCandidates,autonomyKind,registerAutonomyProvider} from '../server-plugin/autonomy-candidates.mjs';
import {advanceNpcAutonomy} from '../server-plugin/npc-autonomy.mjs';
import {subjectiveView} from '../server-plugin/subjective-view.mjs';
import {resyncBooks} from './helpers/ledger-sync.mjs';
import {currentShops} from '../server-plugin/shop.mjs';
import {laborValue} from '../server-plugin/market.mjs';
import {withLedger} from '../server-plugin/ledger.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile(new URL('fixtures/legacy/seed.json',import.meta.url),'utf8'));
const landlord='npc_hw_linsui',place='bld_hw_qingdeng';
test('经营精确预筛对照完整候选：观察期、无销量、固执尾部及到期付款保持一致',()=>{
 // No sales gives R=V=0: ordinary/attachment=-1000 keeps operating;
 // attachment=-10000 can still suspend after a full observation period.
 // A signed unpaid rent also prevents the no-cash-deficit shortcut.
 let force=false,calls=0;
 registerAutonomyProvider('business-full-evaluation-reference',{
  relevant:()=>force,candidateRelevant:()=>force,candidates:(e,view)=>{if(view.observer===landlord)calls++;return [];}
 });
 try{
  for(const [days,attachment,debt]of [[0,0,false],[30,0,false],[30,-1000,false],[30,-10000,false],[30,0,true]]){
   const f=fixture(),doc=f.doc,shop=currentShops(f.e,doc.state).find(s=>s.keeper===landlord);assert.ok(shop);
   doc.state.location='loc_hw';doc.state.minute=days*1440+600;
   doc.state.npcs[landlord].businessAttachmentPermille=attachment;
   if(debt){
    const creditor='npc_hw_luowei';
    doc.state.npcs[creditor]={...f.e.initialFromLegacy(seed,'business-lifecycle').state.npcs[creditor],location:place,activity:'休息',status:'正常',goals:{},memoryStream:[]};
    doc.state.obligations.rent={id:'rent',kind:'rent',debtor:landlord,creditor,resource:'coin_river',amount:1000,paid:0,deadline:doc.state.minute-1,status:'待履行'};
    // Both parties are on site, so this signed1000 payment is known;
    // owner's100 cash leaves an actual900 deficit in the subjective window.
    const report=businessLifecycle(f.e,doc,{...shop,owner:landlord,native:true,status:'营业'});
    assert.equal(report.cashFlow.shortfall,900);assert.equal(report.preferred,'suspend');
    assert.equal(report.options.find(o=>o.kind==='continue').requiresFunding,true);
   }
   const run=full=>{
    force=full;calls=0;const cursor=new PatchCursor(structuredClone(doc));
    const d={get document(){return cursor.root;},get:(...p)=>cursor.expose(p.reduce((v,k)=>v?.[k],cursor.root)),set:(path,value)=>cursor.apply({op:'set',path,value}),remove:path=>cursor.apply({op:'delete',path})};
    advanceNpcAutonomy(d,f.e,doc.state.minute,doc.state.minute,'compare',{beforeState:doc.state});return {document:cursor.root,calls};
   };
   const optimized=run(false),reference=run(true);
   assert.equal(JSON.stringify(optimized.document),JSON.stringify(reference.document));
   if(attachment===-10000)assert.ok(Object.values(optimized.document.state.npcAutonomy?.tasks??{}).some(t=>t.action.kind==='business_lifecycle'&&t.action.choice==='suspend'));
   // The candidate's existing best.utility>current.utility gate may still
   // reject cash-driven suspension. This optimization must preserve that
   // behavior while evaluating overdue payments (credit relevance is false).
   if(debt){assert.equal(optimized.calls,1);assert.equal(reference.calls,1);}
  }
 }finally{force=false;}
});
function fixture({coins=200,credit=false}={}){
 const w=structuredClone(world),e=new WorldEngine(w);let doc=e.initialFromLegacy(seed,'business-lifecycle');
 doc.state.minute=600;doc.state.location=place;doc.state.player.coins=coins;doc.state.inventory={item_bread:{quantity:2}};
 doc.state.npcs=Object.fromEntries([landlord].map(id=>[id,{...doc.state.npcs[id],coins:100,trust:20,location:place,activity:'营业',status:'正常',goals:{},memoryStream:[],inventory:{}}]));
 const npc=w.npcs.find(n=>n.id===landlord);npc.schedule={default:[{start:0,end:1440,location:place,activity:'营业',services:['trade']}]};npc.creditPolicy={limitCopper:100,maximumMinutes:10*1440,minimumTrust:0};
 const inputs=[],results=[];
 // Formal actions report precondition failures as rejected receipts, while
 // legacy tools throw. Present both failure contracts to assert.rejects.
 const act=async(tool,args,eventId)=>{const input={tool,args,eventId},r=await e.reduce(doc,input);doc=applyPatches(doc,r.patches);inputs.push(input);results.push(r.result);if(r.result.ok===false)throw Error(r.result.receipt.reason);return r.result;};
 return {e,w,inputs,results,act,get doc(){return doc;},set doc(v){doc=v;},
  lease:async()=>{const r=await act('world_trade',{operation:'lease',seller:landlord,consent:true,days:1,coins:7,...(credit?{payment:'credit',creditMinutes:120}:{})},'lease');await act('world_act',{action:'business:open_counter',slots:{business:r.business,coins:Math.max(0,doc.state.player.coins-10)}},'counter');return r;},
  manage:(business,operation,slots={},id=operation)=>act('world_act',{action:`core:settlement.business_${operation}`,slots:{business,...slots}},id)};
}

test('未来20减18为2；现钱1、第二天付5、第五天收20有缺口4，不判永久失败',()=>{
 // 手算：100已付沉没款不再输入未来成本；1-5=-4，收20后16。
 const flow=cashFlowWindow({cash:1,from:0,until:5*1440,receipts:[{at:5*1440,amount:20}],payments:[{at:2*1440,amount:5}]});
 assert.equal(flow.shortfall,4);assert.equal(flow.closing,16);
 const r=operatingOptions({revenue:20,variableCost:18,switchCost:1,cashFlow:flow});
 assert.equal(r.incremental,2);assert.equal(r.options[0].requiresFunding,true);assert.equal(r.preferred,'suspend');assert.ok(r.options.some(o=>o.kind==='exit'));
 const funded=operatingOptions({revenue:20,variableCost:18,switchCost:1,cashFlow:{shortfall:0}});
 assert.equal(funded.preferred,'continue');
 // 手算：重开要付转换成本3，未来增量2，暂闭0优于恢复-1。
 assert.equal(operatingOptions({revenue:20,variableCost:18,switchCost:3,suspended:true,cashFlow:{shortfall:0}}).preferred,'suspend');
 assert.equal(operatingOptions({revenue:20,variableCost:18,switchCost:3,suspended:true,cashFlow:{shortfall:0}}).options.find(o=>o.kind==='suspend').incremental,0);
});

test('真实动作暂闭保留租约、经营权和欠租7；恢复有库存、柜台、合法场地限制，退出仍欠7',async()=>{
 // 手算：租金赊欠7；暂闭与退出均无真实还款，owed仍7。
 const f=fixture({coins:0,credit:true}),lease=await f.lease(),id=lease.business;
 // 此用例用一日计划期验证最早次日恢复，仍在原一日租约的实际截止时刻之前。
 f.w.rules.businessLifecycle.horizonDays=1;
 await f.manage(id,'open');const initial=structuredClone(f.doc);
 const paused=await f.manage(id,'close',{choice:'suspend'},'pause');assert.equal(paused.suspended,true);
 assert.equal(f.doc.state.records[lease.contract].status,'有效');assert.equal(f.doc.state.records[lease.debt].amount-f.doc.state.records[lease.debt].paid,7);
 assert.ok(Object.values(f.doc.holdings.rows).some(h=>h.kind==='operates'&&h.subject===id&&h.holder==='player'&&h.until===undefined));
 const report=await f.manage(id,'report',{},'report-paused');assert.equal(report.suspended,true);assert.equal(report.lifecycle.transfer.cashAvailable,0);
 assert.equal(report.lifecycle.cashFlow.shortfall,7);assert.ok(report.lifecycle.funding.some(o=>o.kind==='loan'&&o.required===7));
 assert.equal(report.lifecycle.options.find(o=>o.kind==='suspend').outstandingCashShortfall,7);
 await assert.rejects(f.act('world_trade',{operation:'sell',business:id,buyer:landlord,consent:true,item:'item_bread',quantity:1},'paused-sale'),/暂闭/);
 f.doc.state.buildings[place].condition=0;const broken=structuredClone(f.doc);
 await assert.rejects(f.manage(id,'open',{},'broken-reopen'),/不可用/);assert.deepEqual(f.doc,broken);
 f.doc.state.buildings[place].condition=initial.state.buildings[place].condition;
 await assert.rejects(f.manage(id,'open',{},'too-early-resume'),/最短暂停期/);
 // 欠租须在到期前真实清偿才能留住租约，故欠租7的本例选择退出；
 // 合法到期恢复由下方无欠款的真实开关及原生店用例覆盖。
 await f.manage(id,'close',{choice:'exit'},'exit');assert.equal(f.doc.state.records[lease.debt].amount-f.doc.state.records[lease.debt].paid,7);
 await assert.rejects(f.manage(id,'open',{},'after-exit'),/停业/);
});

test('经营查询只读：改过去不可收回成本100不改未来增量或变出现钱',async()=>{
 // 手算：未来没有已知销量，收入/变动成本均0；历史成本额外100不会变为-100。
 const f=fixture(),lease=await f.lease(),shop=f.doc.state.records[lease.business],before=structuredClone(f.doc);
 const a=businessLifecycle(f.e,f.doc,shop);assert.deepEqual(f.doc,before);
 f.doc.state.records[lease.contract].cost+=100;
 const b=businessLifecycle(f.e,f.doc,shop);assert.equal(a.incremental,b.incremental);assert.equal(b.incremental,0);assert.equal(a.cashFlow.cash,b.cashFlow.cash);
 assert.equal(b.transfer.cashAvailable,0);assert.ok(b.propertyValue);assert.equal(b.funding.length,0);
 const r=await f.act('world_act',{action:'business:options',slots:{business:lease.business}},'options');assert.equal(r.lifecycle[0].incremental,0);
});

test('无买方/无同意/买方无钱转让原子失败；产权人实付并只接手一次经营权与库存',async()=>{
 // 手算：买方付1、卖方收1；库存2份完整转移，旧经营权关闭，新权只归买方。
 const f=fixture(),lease=await f.lease(),id=lease.business;await f.manage(id,'open');
 const before=structuredClone(f.doc);
 await assert.rejects(f.manage(id,'close',{choice:'transfer',coins:1},'no-buyer'));
 await assert.rejects(f.manage(id,'close',{choice:'transfer',member:landlord,coins:100},'refused-offer'),/未接受/);assert.deepEqual(f.doc,before);
 f.doc.state.npcs[landlord].coins=0;resyncBooks(f.e,f.doc);const poor=structuredClone(f.doc);
 await assert.rejects(f.manage(id,'close',{choice:'transfer',member:landlord,coins:1},'poor-buyer'),/现钱不足/);assert.deepEqual(f.doc,poor);
 f.doc=before;const paid=f.doc.state.player.coins,buyerCash=f.doc.state.npcs[landlord].coins;
 const sale=await f.manage(id,'close',{choice:'transfer',member:landlord,coins:1},'transfer');
 assert.equal(sale.inventoryRetained,false);assert.equal(f.doc.state.player.coins,paid+1);assert.equal(f.doc.state.npcs[landlord].coins,buyerCash-1);
 assert.equal(f.doc.state.inventory.item_bread?.quantity??0,0);assert.equal(f.doc.state.npcs[landlord].inventory.item_bread.quantity,2);
 assert.equal(f.doc.state.records[id].status,'已转让');assert.equal(f.doc.state.records[sale.successor].owner,landlord);
 const holdings=Object.values(f.doc.holdings.rows).filter(h=>h.kind==='operates'&&h.until===undefined);
 assert.ok(!holdings.some(h=>h.subject===id));assert.ok(holdings.some(h=>h.subject===sale.successor&&h.holder===landlord));
 const after=structuredClone(f.doc);await assert.rejects(f.manage(id,'close',{choice:'transfer',member:landlord,coins:1},'duplicate'),/已转让/);assert.deepEqual(f.doc,after);
});

test('同一主体与计划期键预览不重抽；零噪声正常经营，依恋可硬撑、负依恋可暂闭，走自治正式适配',async()=>{
 // 手算：亏损-2加依恋(2+1)*10=28，可硬撑；盈利2减30=-28，可暂闭。
 assert.equal(operatingOptions({revenue:18,variableCost:20,switchCost:1,cashFlow:{shortfall:0},attachmentPermille:10000}).preferred,'continue');
 assert.equal(operatingOptions({revenue:20,variableCost:18,switchCost:1,cashFlow:{shortfall:0},attachmentPermille:-10000}).preferred,'suspend');
 const f=fixture(),lease=await f.lease();await f.manage(lease.business,'close',{choice:'transfer',member:landlord,coins:1},'transfer');
 const shop=f.doc.state.records.business_transfer;assert.ok(shop,JSON.stringify(f.results.at(-1)));
 const first=businessLifecycle(f.e,f.doc,shop),before=structuredClone(f.doc);assert.deepEqual(businessLifecycle(f.e,f.doc,shop),first);assert.deepEqual(f.doc,before);
 // 完整月度观察后才允许因收益或偏好改变经营状态；不改“本人选择暂闭”的原断言意图。
 f.doc.state.minute=shop.createdAt+f.w.rules.businessLifecycle.horizonDays*1440;
 f.doc.state.npcs[landlord].businessAttachmentPermille=-10000;
 const view=subjectiveView(f.e,f.doc,landlord),rows=autonomyCandidates(f.e,view,{document:f.doc}).filter(c=>c.kind==='business_lifecycle');
 assert.ok(rows.some(c=>c.legacy.choice==='suspend'));assert.ok(autonomyKind('business_lifecycle'));
 const cursor=new PatchCursor(f.doc),d={get document(){return cursor.root;},get:(...p)=>cursor.expose(p.reduce((v,k)=>v?.[k],cursor.root)),set:(path,value)=>cursor.apply({op:'set',path,value})};
 const action=rows.find(c=>c.legacy.choice==='suspend').legacy,spec=autonomyKind('business_lifecycle');
 spec.validate(d,f.e,landlord,action);spec.execute(d,f.e,landlord,action,{actionId:'npc-suspend'});f.doc=cursor.root;
 assert.equal(f.doc.state.records[shop.id].suspended,true);assert.equal(f.doc.state.npcs[landlord].businessAttachmentPermille,-10000);
 const saved=businessLifecycle(f.e,f.doc,f.doc.state.records[shop.id]);f.doc.randomSeed='another-seed';
 assert.equal(businessLifecycle(f.e,f.doc,f.doc.state.records[shop.id]).attachmentPermille,saved.attachmentPermille);
});

test('正常主体不会因同一公式同时关店；少数赌气偏好由独立种子产生，窗口内同主体不变',async()=>{
 // 手算：无已知销量时增量0，开关合计2；常态继续0优于暂闭-2，只有负尾部偏好才反转。
 const f=fixture(),lease=await f.lease();await f.manage(lease.business,'close',{choice:'transfer',member:landlord,coins:1},'transfer');
 const shop=f.doc.state.records.business_transfer,choices=new Set(),preferences=new Set();
 f.doc.state.minute=shop.createdAt+f.w.rules.businessLifecycle.horizonDays*1440;
 for(let i=0;i<80;i++){
  f.doc.randomSeed=`business-choice:${i}`;const a=businessLifecycle(f.e,f.doc,shop);choices.add(a.preferred);preferences.add(a.attachmentPermille);
  f.doc.state.minute+=1440;assert.equal(businessLifecycle(f.e,f.doc,shop).attachmentPermille,a.attachmentPermille);f.doc.state.minute-=1440;
 }
 assert.ok(choices.has('continue'));assert.ok(choices.has('suspend'));assert.ok(preferences.size>1);
 Object.assign(f.w.rules.businessLifecycle,{attachmentMaxPermille:0,stubbornPermille:0,noisePermille:0});
 for(let i=0;i<3;i++){f.doc.randomSeed=`zero:${i}`;assert.equal(businessLifecycle(f.e,f.doc,shop).preferred,'continue');}
});

test('原生店铺也由真实店主暂闭并恢复；物化沿用同一店号，不复制库存或现金',()=>{
 // 手算：原生店无已知销量时净收益0，负依恋使暂闭优于继续；开关只改经营状态。
 const f=fixture(),native=currentShops(f.e,f.doc.state).find(s=>s.keeper===landlord);assert.ok(native);
 f.doc.state.minute=f.w.rules.businessLifecycle.horizonDays*1440;
 f.doc.state.npcs[landlord].businessAttachmentPermille=-10000;
 const before=structuredClone(f.doc),view=subjectiveView(f.e,f.doc,landlord);
 // Reusing this exact observer/document projection must preserve every report
 // field, including knowledge, cash-flow obligations and seeded preferences.
 const managed={...native,owner:landlord,native:true,status:'营业'};
 assert.deepEqual(businessLifecycle(f.e,f.doc,managed,{view}),businessLifecycle(f.e,f.doc,managed));
 assert.deepEqual(laborValue(f.e,f.doc,{worker:landlord,observer:landlord,view}),laborValue(f.e,f.doc,{worker:landlord,observer:landlord}));
 const candidate=autonomyCandidates(f.e,view,{document:f.doc}).find(c=>c.kind==='business_lifecycle'&&c.legacy.business===native.id);assert.ok(candidate);
 const cursor=new PatchCursor(f.doc),d={get document(){return cursor.root;},get:(...p)=>cursor.expose(p.reduce((v,k)=>v?.[k],cursor.root)),set:(path,value)=>cursor.apply({op:'set',path,value})},spec=autonomyKind('business_lifecycle');
 spec.validate(d,f.e,landlord,candidate.legacy);spec.execute(d,f.e,landlord,candidate.legacy,{actionId:'native-pause'});
 assert.equal(d.get('state','records',native.id).suspended,true);assert.equal(d.get('state','records',native.id).native,true);
 const stored=d.get('state','records',native.id).markup;
 assert.ok(Number.isInteger(stored)||(Number.isInteger(stored.numerator)&&Number.isInteger(stored.denominator)));
 assert.deepEqual(d.get('state','npcs',landlord,'inventory'),before.state.npcs[landlord].inventory);assert.equal(d.get('state','npcs',landlord,'coins'),before.state.npcs[landlord].coins);
 // The same service window and real existing stock are required on resume.
 const resume={kind:'business_lifecycle',business:native.id,choice:'resume'};
 assert.throws(()=>spec.validate(d,f.e,landlord,resume),/库存/);
 d.set(['state','npcs',landlord,'inventory'],{item_bread:{quantity:2}});
 assert.throws(()=>spec.validate(d,f.e,landlord,resume),/最短暂停期/);
 const resumeAt=d.get('state','records',native.id).resumeNotBefore;d.set(['state','minute'],resumeAt);
 // The autonomy caller supplies the actor at the actual action minute, which
 // can differ from a long advance's current activity at validation time.
 d.set(['state','npcs',landlord,'activity'],'睡眠');
 assert.throws(()=>spec.validate(d,f.e,landlord,resume),/管理/);
 spec.validate(d,f.e,landlord,resume,{at:resumeAt,actor:{...d.get('state','npcs',landlord),activity:'营业'}});
 d.set(['state','npcs',landlord,'activity'],'营业');
 spec.validate(d,f.e,landlord,resume);spec.execute(d,f.e,landlord,resume,{actionId:'native-resume'});
 assert.equal(d.get('state','records',native.id).suspended,false);
 assert.equal(Object.values(d.get('state','records')).filter(r=>r.category==='business'&&r.owner===landlord).length,1);
});

test('恢复后的原生店按正午作息结客流，不用结算时的睡眠活动否定白天营业',()=>{
 // 手算：同一日正午已营业且库存10份；午夜仅改变店主活动，不应改变白天的成交钱物。
 const f=fixture(),native=currentShops(f.e,f.doc.state).find(s=>s.keeper===landlord),buyer='npc_hw_luowei';
 f.doc.state.npcs[landlord].inventory={item_bread:{quantity:10}};
 f.doc.state.npcs[buyer]={...f.e.initialFromLegacy(seed,'business-lifecycle').state.npcs[buyer],coins:40,location:place,activity:'休息',status:'正常',inventory:{},goals:{},memoryStream:[]};
 // EC-1b：客流时刻 = 店营业窗口与顾客清醒窗口的最早交集。店主全天营业（恢复须在日界 0 点有营业服务），顾客若全天醒着，最早交集就是 0 点，
 // 而结算区间是半开的 (day*1440,(day+1)*1440]，0 点属于前一刻；所以让顾客有真实起居：睡到 360 点，之后醒着。最早交集 = 360，落在区间内、晚于 0 点恢复。
 // 云上 360 不成交，静态读码未能定根因（候选：买家 360 的生计槽位 subsistenceScheduleAt、家务工时 unattended、结算时刻的预算）；断言保持原样，失败时在 message 里输出诊断，下一轮据此定。
 f.w.npcs.find(n=>n.id===buyer).schedule={default:[{start:0,end:360,location:place,activity:'睡眠',services:[]},{start:360,end:1440,location:place,activity:'休息',services:[]}]};
 // EC-1a：预算采购口径已扣聚落公粮（household-budget.mjs:378-379 publicSatiety；household-subsistence.mjs:697 granary!==false 的聚落给登记户配给）。
 // 夹具聚落 loc_hw 有粮库，买家一户的采购需求为 0，到店不评估、连 looked 记录也不写（business.mjs serve：wants 为 0 即 continue）。
 // 本用例检验的是“有需求的顾客在恢复后的店里成交”，所以聚落设为无公共粮库（引擎既有的 granary:false，只影响配给），其余条件不变。
 f.doc.state.settlements.loc_hw.granary=false;
 const cursor=new PatchCursor(f.doc),d={get document(){return cursor.root;},get:(...p)=>cursor.expose(p.reduce((v,k)=>v?.[k],cursor.root)),set:(path,value)=>cursor.apply({op:'set',path,value})};
 const spec=autonomyKind('business_lifecycle');spec.execute(d,f.e,landlord,{business:native.id,choice:'suspend'},{actionId:'pause'});
 d.set(['state','minute'],d.get('state','records',native.id).resumeNotBefore);
 spec.validate(d,f.e,landlord,{business:native.id,choice:'resume'});spec.execute(d,f.e,landlord,{business:native.id,choice:'resume'},{actionId:'resume'});
 const base=withLedger(f.e,cursor.root).document;
 const day=Math.floor(base.state.minute/1440);
 const flow=activity=>{
  const doc=structuredClone(base);doc.state.minute=(day+1)*1440;doc.state.npcs[landlord].activity=activity;
  const c=new PatchCursor(doc),draft={get document(){return c.root;},get:(...p)=>c.expose(p.reduce((v,k)=>v?.[k],c.root)),set:(path,value)=>c.apply({op:'set',path,value}),remove:path=>c.apply({op:'delete',path}),say:()=>{}};
  advanceCustomerFlow(draft,f.e,day*1440,(day+1)*1440);return c.root;
 };
 const open=flow("营业"),asleep=flow("睡眠"),prefix=`customer_flow:${native.id}:${day}:`;
 // 记录键统一带结算时刻（每个营业窗口一条）：取该店当天全部窗口的记录一并比较。
 const recordsOf=doc=>Object.fromEntries(Object.entries(doc.state.records).filter(([k])=>k.startsWith(prefix)));
 const diagnose=()=>{try{
  const st=open.state,at=t=>{const x=scheduleAt(f.e,buyer,day*1440+t,st);return x&&`${x.location}/${x.activity}/[${(x.services??[]).join()}]/until${x.until}`;};
  return JSON.stringify({day,flowTimes:flowTimesOfDay(f.e,st,day),shopWindows:[...shopWindows(f.e,st,day).entries()].map(([k,v])=>[k,v.windows]),buyerWindows:customerWindows(f.e,st,day).get(buyer)??null,
   buyerSlot360:at(360),buyerSlot720:at(720),buyer:{coins:st.npcs[buyer]?.coins,status:st.npcs[buyer]?.status,location:st.npcs[buyer]?.location},keeperSlot360:(x=>x&&`${x.location}/${x.activity}/[${(x.services??[]).join()}]`)(scheduleAt(f.e,landlord,day*1440+360,st)),
   records:Object.entries(recordsOf(open)).map(([k,r])=>[k,r.visits]),shop:{suspended:st.records[native.id]?.suspended,status:st.records[native.id]?.status,openedAt:st.records[native.id]?.openedAt}});
 }catch(error){return `diagnostic failed: ${error.message}`;}};
 assert.ok(Object.values(recordsOf(open)).some(r=>r.visits.some(v=>v.outcome==="bought")),diagnose());
 assert.deepEqual(recordsOf(asleep),recordsOf(open));assert.deepEqual(asleep.ledger,open.ledger);
});

test('退出后可凭新租约再开店，旧柜台须实际提清，新旧现金账不混记',async()=>{
 // 手算：旧柜台全部转回钱袋后为0；新店实拨10，期初0+资本10=柜台10，不能把旧店资金重复算入。
 const f=fixture(),first=await f.lease();await f.manage(first.business,'open');await f.manage(first.business,'close',{choice:'exit'},'first-exit');
 const oldReport=await f.manage(first.business,'report',{},'old-report');
 const second=await f.act('world_trade',{operation:'lease',seller:landlord,consent:true,days:1,coins:7},'second-lease');
 const open={action:'business:open_counter',slots:{business:second.business,coins:10}},before=structuredClone(f.doc);
 await assert.rejects(f.act('world_act',open,'counter-before-withdraw'),/提清/);assert.deepEqual(f.doc,before);
 const account=Object.values(f.doc.state.records).find(r=>r.category==='money_account'&&r.business===first.business);
 await f.act('world_act',{action:'business:spend_counter',slots:{coins:account.coins}},'old-withdraw');
 await f.act('world_act',open,'second-counter');await f.manage(second.business,'open',{},'second-open');
 const report=await f.manage(second.business,'report',{},'new-report');assert.equal(report.cash.reconciled,true);assert.equal(report.cash.closing,10);assert.equal(report.cash.capital,10);
 assert.equal(f.doc.state.records[second.business].status,'营业');
 const oldAfter=await f.manage(first.business,'report',{},'old-report-after');assert.deepEqual(oldAfter.cash,oldReport.cash);assert.deepEqual(oldAfter.goods,oldReport.goods);
});

test('经营按整月同长历史估计，半月样本折算且标依据不足，不因一天没成交关店',async()=>{
 // 手算：15天内真实售1份，30天窗口估2份；观察满30天仍售1份则估1份。
 const f=fixture();f.doc.state.inventory.item_bread.quantity=3;
 const leased=await f.lease();await f.manage(leased.business,'open');
 await f.act('world_trade',{operation:'sell',business:leased.business,buyer:landlord,consent:true,item:'item_bread',quantity:1},'history-sale');
 const shop=f.doc.state.records[leased.business],created=shop.createdAt;
 f.doc.state.minute=created+15*1440;
 const half=businessLifecycle(f.e,f.doc,shop);
 assert.equal(half.horizon.days,f.e.rules.calendar.daysPerMonth);assert.equal(half.horizon.days,30);
 assert.equal(half.history.observedMinutes,15*1440);assert.equal(half.history.sufficient,false);assert.match(half.history.note,/依据不足/);
 assert.equal(half.projected[0].observedQuantity,1);assert.equal(half.projected[0].expectedQuantity,2);assert.equal(half.projected[0].quantity,2);
 assert.equal(half.preferred,'continue');assert.ok(half.revenue>0);assert.ok(half.variableCost>0);
 f.doc.state.minute=created+30*1440;
 const full=businessLifecycle(f.e,f.doc,shop);assert.equal(full.history.sufficient,true);assert.equal(full.projected[0].expectedQuantity,1);
 // 第31天才失去窗口起点的旧成交；不是“昨天没客人”就抹去整月样本。
 f.doc.state.minute=created+29*1440;assert.equal(businessLifecycle(f.e,f.doc,shop).projected[0].observedQuantity,1);
 delete f.w.rules.businessLifecycle.horizonDays;assert.equal(businessLifecycle(f.e,f.doc,shop).horizon.days,f.e.rules.calendar.daysPerMonth);
});

test('薄利店固定种子30天内只暂停一次，整期噪声不变且正式恢复须等计划期和补货周期',()=>{
 // 手算：每日20收入、18可变成本，月收入600、成本540、增量60。
 // thin-plan-0 在本店第2计划期噪声-152‰：60+trunc(600*-152/1000)=-31。
 // 开关各1铜机会成本，暂闭-2优于续营-31；恢复最早第60天，随后29天不再切换。
 const f=fixture(),native=currentShops(f.e,f.doc.state).find(s=>s.keeper===landlord),DAY=1440;
 f.doc.randomSeed='thin-plan-0';f.doc.state.npcs[landlord].businessAttachmentPermille=0;
 f.doc.state.npcs[landlord].inventory={item_bread:{quantity:2}};
 const spec=autonomyKind('business_lifecycle');let switches=0;
 for(let day=30;day<60;day++){
  f.doc.state.minute=day*DAY+600;
  const shop=f.doc.state.records[native.id]??{id:native.id,category:'business',native:true,owner:landlord,location:place,status:'营业',openedAt:0,markup:1.2};
  const w=businessLifecycle(f.e,f.doc,shop),suspended=Boolean(shop.suspended);
  assert.equal(w.noisePermille,-152);assert.equal(w.horizon.periodFrom,30*DAY);assert.equal(w.history.sufficient,true);
  assert.equal(w.conversion.closeMinutes,f.e.world.openActionRules.generic.transferMinutes);assert.equal(w.conversion.openMinutes,w.conversion.closeMinutes);
  assert.equal(w.switchCost,w.conversion.closeCost+w.conversion.reopenCost);
  const model=operatingOptions({revenue:600,variableCost:540,switchCost:w.switchCost,reopenCost:w.conversion.reopenCost,cashFlow:{shortfall:0},suspended,noisePermille:w.noisePermille,resumeAllowed:w.resumeNotBefore===null||f.doc.state.minute>=w.resumeNotBefore});
  assert.equal(model.incremental,60);
  if(day===30){assert.equal(w.switchCost,2);assert.equal(model.options[0].utility,-31);}
  if(model.preferred===(suspended?'suspend':'continue'))continue;
  const action={kind:'business_lifecycle',business:native.id,choice:model.preferred},cursor=new PatchCursor(f.doc),d={get document(){return cursor.root;},get:(...p)=>cursor.expose(p.reduce((v,k)=>v?.[k],cursor.root)),set:(path,value)=>cursor.apply({op:'set',path,value})};
  spec.validate(d,f.e,landlord,action);spec.execute(d,f.e,landlord,action,{actionId:`plan-choice:${day}`});f.doc=cursor.root;switches++;
 }
 assert.equal(switches,1);assert.ok(switches<=1);
 const paused=f.doc.state.records[native.id];assert.equal(paused.suspended,true);assert.ok(paused.resumeNotBefore>=60*DAY);
 const cursor=new PatchCursor(f.doc),d={get document(){return cursor.root;},get:(...p)=>cursor.expose(p.reduce((v,k)=>v?.[k],cursor.root)),set:(path,value)=>cursor.apply({op:'set',path,value})},resume={kind:'business_lifecycle',business:native.id,choice:'resume'};
 assert.throws(()=>spec.validate(d,f.e,landlord,resume),/最短暂停期/);
 d.set(['state','minute'],paused.resumeNotBefore);spec.validate(d,f.e,landlord,resume);spec.execute(d,f.e,landlord,resume,{actionId:'next-plan-resume'});
 assert.equal(d.get('state','records',native.id).suspended,false);
});

test('玩家正式恢复同样受最短暂停期约束，实际到期后仍用原合法租约开张',async()=>{
 // 手算：一日计划期在第1天零点结束，现有租约在第1天10点结束，有真实恢复窗口。
 const f=fixture();f.doc.state.inventory.item_bread.quantity=30;
 const lease=await f.lease();f.w.rules.businessLifecycle.horizonDays=1;
 await f.manage(lease.business,'open');await f.manage(lease.business,'close',{choice:'suspend'},'pause');
 const until=f.doc.state.records[lease.business].resumeNotBefore,before=structuredClone(f.doc);
 assert.equal(until,1440);await assert.rejects(f.manage(lease.business,'open',{},'early'),/最短暂停期/);assert.deepEqual(f.doc,before);
 await f.act('world_time',{minutes:until-f.doc.state.minute},'wait-until-reopen');
 await f.manage(lease.business,'open',{},'resume-after-minimum');assert.equal(f.doc.state.records[lease.business].suspended,false);
});
