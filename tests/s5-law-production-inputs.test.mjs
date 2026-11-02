import test from 'node:test';
import assert from 'node:assert/strict';
import {world,seed,worker,host,DAY} from './helpers/finance.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {advanceAgriculture} from '../server-plugin/agriculture.mjs';
import {fieldRentBasis} from '../server-plugin/finance-assets.mjs';
import {reconcile} from './helpers/ledger-audit.mjs';
import {withLedger,finishLedger} from '../server-plugin/ledger.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';
import {agriculturalWorkforce} from '../server-plugin/npc-state.mjs';
import {laborOffers} from '../server-plugin/labor-market.mjs';

const settlement='loc_hw',field='loc_hw_fields',key='agriculture:loc_hw',farmKey=`private-farm:${field}`;
function setup({population=2,seedStock=100,workers=1,tools=2}={}){
 const w=structuredClone(world);delete w.rules.weather;
 // These hand anchors enumerate care, market travel, commuting and paid
 // attendance against the full 480-minute day. Isolate those debits from
 // daily source errands; K16 tests assert the latter consume shared work.
 delete w.rules.householdSubsistence;
 const p=w.rules.agriculture.settlements.find(r=>r.settlement===settlement);
 Object.assign(p,{areaUnits:100,initialSeed:seedStock,workerFraction:1,farmWorkers:workers,processingWorkers:0,freshWorkers:0,areaPerWorkerDay:20,toolCapacity:tools,toolCondition:100});
 Object.assign(w.rules.agriculture.crop,{seedPerHa:4,areaUnitsPerHa:100,growthDays:10,yieldPerHa:400});
 // Keep just an existing adult's household, with no invented population/person.
 w.households=w.households.filter(h=>h.members.includes(worker));w.households[0].members=[worker];
 // TI1b: the one-household river edition has no Baishi beneficiaries; its
 // opening register must cover this edition, not the removed town estate.
 w.townIncome.settlements=w.townIncome.settlements.filter(r=>r.settlement===settlement);
 const e=new WorldEngine(w),doc=e.createCharacter(seed,{},'production-inputs');
 doc.state.minute=6*DAY+480;doc.state.settlements[settlement].population=population;
 doc.state.records[key].lastDay=5;
 e.byId.get(worker).schedule={default:[{start:0,end:1440,location:'bld_hw_post',activity:'休息',services:[]}]};
 return {w,e,p,doc};
}
function day(f,at=6){
 const books=withLedger(f.e,f.doc),d=f.e.primitiveDraft(books.document),result=advanceAgriculture(d,f.e,settlement,f.doc.state.settlements[settlement],at);
 d.set(['state','settlements',settlement],result.settlement);
 f.doc=applyPatches(f.doc,finishLedger(d.patches,books.opening));return f.doc.state.records[key];
}
function job(f,{minutes=480,local=true,farm=true}={}){
 const starts=6*DAY+480;
 f.doc.state.records.work={id:'work',kind:'workshop',category:'contract',laborMarket:1,worker,owner:host,location:field,settlement:local?settlement:'loc_bs',...(farm?{farm:settlement}:{}),starts,createdAt:0,deadline:8*DAY,status:'有效',attendance:{6:minutes},shifts:[{start:starts,minute:6*DAY+1020,minutes}]};
}
test('缺工预测与日结复用田间分钟，照料、通勤、赶集和实际出勤只扣一次',()=>{
 const f=setup({population:1});
 // 旧口径：1人×480=480分钟，预测1工日、无缺口。
 // 新口径：480−照料60−赶集60−通勤(30×2)−已出勤120=180分钟=3/8工日。
 // 尚需1−3/8=5/8工日，整班招工1人；日结floor(20×3/8)=7单位。
 job(f,{farm:false,minutes:120});f.doc.state.records.work.commuteMinutes=30;
 f.doc.state.obligations.care={id:'care',reservationVersion:1,type:'会面',promisor:worker,promisee:host,status:'待履行',start:6*DAY+480,deadline:6*DAY+540,departures:{[worker]:6*DAY+480},location:'bld_hw_post',content:'照料家人'};
 f.doc.state.records.trip={category:'market_trip',actor:worker,keeper:host,to:'bld_hw_post',departAt:6*DAY+540,returnAt:6*DAY+600};
 f.doc.state.npcs[worker].occupation='农夫';
 const before=structuredClone(f.doc),farm=f.doc.state.records[key];
 assert.equal(agriculturalWorkforce(f.e,f.doc.state,f.p,farm,6).fieldMinutes,180);
 const offers=laborOffers(f.e,f.doc.state).filter(o=>o.farm===settlement);
 assert.deepEqual(offers.map(o=>[o.owner,o.task]),[[worker,'农忙播种']]);
 assert.deepEqual(f.doc,before,'预测只读，不提前出勤或消耗资源');
 const report=day(f).lastReport;
 assert.deepEqual(report.workers.field,{numerator:375000,denominator:1000000});assert.equal(report.planted,7);
 // 已出勤的农雇工回到本田：扣出后补回同一480分钟，不能再招第二份同一劳力。
 const hired=setup({population:1});job(hired,{minutes:480});
 hired.doc.state.npcs[worker].occupation='农夫';
 assert.equal(agriculturalWorkforce(hired.e,hired.doc.state,hired.p,hired.doc.state.records[key],6).fieldMinutes,480);
 assert.deepEqual(laborOffers(hired.e,hired.doc.state).filter(o=>o.farm===settlement),[]);
 assert.equal(day(hired).lastReport.planted,20);
});

async function act(f,args,id){
 const out=await f.e.reduce(f.doc,{tool:'world_farm',args,eventId:id});f.doc=applyPatches(f.doc,out.patches);return out.result;
}
async function privateSetup(quantity=4){
 const f=setup({workers:0});
 // Private actions cross midnight: reach spring through the real clock so
 // ecology and all settlement ledgers have the same continuous history.
 f.doc=f.e.createCharacter(seed,{},'production-inputs');
 const elapsed=await f.e.reduce(f.doc,{tool:'world_time',args:{minutes:6*DAY+480-f.doc.state.minute},eventId:'reach-spring'});
 f.doc=applyPatches(f.doc,elapsed.patches);
 const out=applyIntentSetup(f.e,f.doc,{location:field,inventory:{item_wheat_seed:quantity,item_hoe:1,item_sickle:1},facts:[{path:['state','buildings'],value:{...f.doc.state.buildings,[field]:{...f.doc.state.buildings[field],owner:'player',condition:100}}}]});
 assert.deepEqual(out.setupUnmet,[]);f.doc=out.document;return f;
}

test('公共田缺种按合法面积播种，同份种粮只用一次',()=>{
 // 100面积单位需4份；只有3份 => floor(3*100/4)=75，不是整块100。
 const f=setup({seedStock:3,workers:5,tools:5});f.p.areaPerWorkerDay=100;
 let r=day(f);assert.equal(r.field.sownUnits,75);assert.equal(r.ledger.seedSpent,3);assert.equal(r.field.seedBank,0);
 r=day(f,7);assert.equal(r.field.sownUnits,75);assert.equal(r.ledger.seedSpent,3);assert.equal(r.ledger.harvested,0);
 assert.equal(r.field.cohorts.reduce((n,c)=>n+c.seedSpent,0),3);
 // 无天气/缺水修正，75单位×400/100=300份实际收成；不能得到整块的400。
 for(let at=8;at<=15;at++)r=day(f,at);
 assert.equal(r.ledger.harvested,300);assert.equal(r.ledger.seedSpent,3);
 assert.equal(r.field.seedBank,4);assert.equal(r.lastReport.stored,296);
 assert.deepEqual(reconcile(f.e,f.doc).mismatches,[]);
});

test('本村雇工从默认劳力扣出再投入，外来短班按实际分钟且受工具约束',()=>{
 // 本村2人、默认农工1、雇出其中1：1*(2-1)/2+1=1.5，30单位，不能算成2人40单位。
 const local=setup();job(local);assert.equal(day(local).lastReport.planted,30);
 // 外来240分钟=半工日：默认1+0.5=1.5，20*1.5=30单位；不能向下丢半班。
 const short=setup();job(short,{local:false,minutes:240});const r=day(short);
 assert.equal(r.lastReport.planted,30);assert.equal(r.lastReport.workers.field.numerator/r.lastReport.workers.field.denominator,1.5);
 // 同样雇工只有一套工具：min(1.5,1)=1，仍只20；损坏工具则0。
 const capped=setup({tools:1});job(capped,{local:false,minutes:240});assert.equal(day(capped).lastReport.planted,20);
 const broken=setup();job(broken,{local:false});broken.doc.state.records[key].tools.condition=0;assert.equal(day(broken).lastReport.planted,0);
});

test('家户照料与已出勤时间共同扣减，重复日结不能重复使用工时',()=>{
 // 唯一村民480分钟：照料240 + 已出勤240 =0田间分钟；无照料时还剩半工日=10单位。
 const busy=setup({population:1});job(busy,{farm:false,minutes:240});
 busy.doc.state.obligations.care={id:'care',reservationVersion:1,type:'会面',promisor:worker,promisee:host,status:'待履行',start:6*DAY+480,deadline:6*DAY+720,departures:{[worker]:6*DAY+480},location:'bld_hw_post'};
 assert.equal(day(busy).lastReport.planted,0);
 const before=structuredClone(busy.doc);assert.throws(()=>day(busy),/日结顺序/);assert.deepEqual(busy.doc,before);
 const half=setup({population:1});job(half,{farm:false,minutes:240});assert.equal(day(half).lastReport.planted,10);
 // 统计层周结把shifts压成aggregate，日attendance仍是同一240分钟，不能恢复成整日田工。
 const statistical=setup({population:1});job(statistical,{farm:false,minutes:240});statistical.doc.state.records.work.shifts[0].aggregate=true;
 assert.equal(day(statistical).lastReport.planted,10);
 // 明确雇回田间的半班同样只产10单位，不按整日补齐。
 const returned=setup({population:1,workers:0});job(returned,{minutes:240});assert.equal(day(returned).lastReport.planted,10);
});

test('家户预算包含真实通勤和运行期家庭成员，不能把这段时间再次耕田',()=>{
 // 单人480分钟 - 240出勤 - 往返各60 =120，田间20*120/480=5单位。
 const f=setup({population:1});job(f,{farm:false,minutes:240});f.doc.state.records.work.commuteMinutes=60;
 // 婚入/分户的运行期家户替代静态名册；沿K04选择器读取，不再从world成员反推。
 const authored=f.w.households[0];f.w.households=[];
 f.doc.state.family={...f.doc.state.family,households:{runtime:{...authored,id:'runtime',members:[worker]}}};
 assert.equal(day(f).lastReport.planted,5);
});

test('私田需4份种粮但只有3份时拒绝；实际播种只扣一次且不能再次播同块在田作物',async()=>{
 // 麦种2份/亩；2亩需4，现3不能播；改播1亩扣2，只剩1。
 const f=await privateSetup(3),before=structuredClone(f.doc);
 await assert.rejects(act(f,{operation:'private_sow',areaMu:2,item:'item_wheat_seed'},'short-seed'),/实际种粮/);assert.deepEqual(f.doc,before);
 const planted=await act(f,{operation:'private_sow',areaMu:1,item:'item_wheat_seed'},'one-mu');
 assert.equal(planted.farm.seed,2);assert.equal(f.doc.state.inventory.item_wheat_seed.quantity,1);assert.equal(planted.laborMinutes,240);
 const after=structuredClone(f.doc);await assert.rejects(act(f,{operation:'private_sow',areaMu:1,item:'item_wheat_seed'},'again'),/未收作物/);assert.deepEqual(f.doc,after);
 assert.deepEqual(reconcile(f.e,f.doc).mismatches,[]);
});

test('玩家已签工时不能同时用于私田播种，失败不扣种粮',async()=>{
 // 2亩播种480分钟，与同日8..12、13..17的已签工时重叠，不能既领薪又播种。
 const f=await privateSetup();job(f);f.doc.state.records.work.worker='player';
 const before=structuredClone(f.doc);
 await assert.rejects(act(f,{operation:'private_sow',areaMu:2,item:'item_wheat_seed'},'booked'),/雇佣.*工时冲突/);
 assert.deepEqual(f.doc,before);assert.equal(f.doc.state.inventory.item_wheat_seed.quantity,4);
});

test('跨日劳动完成时已错过播期，不凭耗时生成作物或消耗种子',async()=>{
 // 4亩需8份种粮、960劳动分钟，跨2个工作日；窗口只有第6日，完成已第7日。
 const f=await privateSetup(8);f.w.rules.agriculture.crop.sowDays=[6,6];
 const out=await act(f,{operation:'private_sow',areaMu:4,item:'item_wheat_seed'},'missed-window');
 assert.equal(out.success,false);assert.match(out.note,/错过播种窗口/);
 assert.equal(f.doc.state.records[farmKey],undefined);assert.equal(f.doc.state.inventory.item_wheat_seed.quantity,8);
 assert.ok(f.doc.state.minute>=7*DAY);assert.deepEqual(reconcile(f.e,f.doc).mismatches,[]);
});

test('公共田志愿工作按实际分钟折算，破损农具不能保底生出一单位工作量',async()=>{
 // 日能力20单位；90分钟/480分钟=3.75；农具1%时仅0.0375单位，不够整数作业。
 const f=setup();f.doc.state.location=field;f.doc.state.records[key].tools.condition=1;
 const before=structuredClone(f.doc);await assert.rejects(act(f,{operation:'sow'},'worn-tool'),/农具状况/);
 assert.deepEqual(f.doc,before);
});

test('短生长期不把公共田一年一次的面积虚算成多茬，签约快照不随灾害改变',()=>{
 // 生长10日、播期5..25，旧公式虚算3茬；年度sownUnits只允许一次，故年茬1。
 const f=setup();const d=f.e.primitiveDraft(f.doc),basis=fieldRentBasis(d,f.e,field,{areaMu:1});
 assert.equal(basis.annualSeasons,1);
 const snapshot=structuredClone(basis);f.w.rules.agriculture.crop.yieldPerHa/=2;
 assert.equal(basis.annualYield.numerator,snapshot.annualYield.numerator);
 assert.ok(fieldRentBasis(d,f.e,field,{areaMu:1}).annualYield.numerator<snapshot.annualYield.numerator);
});
