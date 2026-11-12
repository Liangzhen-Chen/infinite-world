import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,worker,host,clerk,DAY,cash} from './helpers/finance.mjs';
import {householdLaborBudget} from '../server-plugin/household-budget.mjs';
import {householdWorkTime,npcSchedule,initialNpcState} from '../server-plugin/npc-state.mjs';
import {laborApplication,advanceLaborMarket,laborOffers} from '../server-plugin/labor-market.mjs';
import {advanceNpcSchedules,scheduleAt} from '../server-plugin/npc-schedule.mjs';
import {contractIllness} from '../server-plugin/npc-life.mjs';
import {agriculturalEmployment} from '../server-plugin/employment-state.mjs';
import {placeSettlement} from '../server-plugin/entity-view.mjs';
import {mineEmployment} from '../server-plugin/extraction.mjs';

const home='bld_hw_post',site='bld_hw_mill',jobId='workshop:household';
const slot=(start,end,activity,location=home)=>({start,end,activity,location,services:[]});
function setup({duties=true,commute=30,statistical=false,meals=[]}={}){
 const f=fixture({at:site});f.doc.state.minute=480;
 // These hand anchors enumerate farm/care/market/commute minutes only.
 // External source errands are isolated here and exercised with real shared
 // labour in s5-law-water-source / s5-law-subsistence instead.
 delete f.e.rules.householdSubsistence;
 f.doc.state.npcs[worker].location=home;f.doc.state.npcs[worker].coins=100;
 f.doc.state.npcs[host].coins=5000;
 f.w.households.find(h=>h.members.includes(worker)).homeLocation=home;
 const field=f.e.rules.agriculture.settlements.find(p=>p.settlement==='loc_hw').fieldLocation;
 // 农事必须有登记田权；60分钟照料以真实预约保留，不靠作息文字猜。
 if(duties){
  f.doc.state.buildings[field]={...f.doc.state.buildings[field],owner:worker};
  f.doc.state.obligations.care_time={id:'care_time',reservationVersion:1,type:'会面',promisor:worker,promisee:clerk,status:'待履行',start:660,deadline:720,departures:{[worker]:660},location:home,content:'照料家人'};
 }
 f.e.byId.get(worker).schedule={default:duties?[slot(0,480,'睡眠'),slot(480,660,'农事',field),slot(660,720,'照料家人'),slot(720,780,'午饭'),slot(780,1020,'日常起居'),slot(1020,1440,'休息')]:[slot(0,1440,'休息')]};
 f.e.route=()=>({minutes:commute,cost:0,edges:[]});
 f.doc.state.projects.project={id:'project',type:'工程',creator:host,location:site,settlement:'loc_hw',remainingWork:2,remainingDays:2,status:'施工中'};
 const terms={owner:host,worker,location:site,wage:960,workMinutes:480,task:'工程施工',deadline:7*DAY,meals};
 f.doc.state.records[jobId]={id:jobId,kind:'workshop',category:'contract',laborMarket:1,...terms,signedTerms:structuredClone(terms),project:'project',parties:[worker,host],starts:480,nextWork:1020,createdAt:0,status:'有效',commuteMinutes:commute,attendance:{},shifts:[],workedMinutes:0,paid:0,produced:0,settlement:'loc_hw',source:'household-saved-contract'};
 if(statistical)f.e.advanceLayerContext={layers:new Map([['county','statistics']]),countyOf:()=> 'county'};
 return f;
}
function advance(f,after,{schedules=true}={}){
 const before=f.doc.state.minute,d=f.draft();d.set(['state','minute'],after);
 if(schedules)advanceNpcSchedules(d,f.e,before,after);
 advanceLaborMarket(d,f.e,{before,after,id:`household:${after}`});d.done();
 return f.doc.state.records[jobId];
}
function offer(f,{wage=960,meals=[]}={}){
 delete f.doc.state.records[jobId];
 return {...laborOffers(f.e,f.doc.state).find(o=>o.project==='project'),wage,meals};
}
function childHousehold(f,location=home){
 const child=f.w.npcs.find(n=>n.age<18),house=f.w.households.find(h=>h.members.includes(worker));
 for(const h of f.w.households)h.members=h.members.filter(id=>id!==child.id);
 house.members=[worker,child.id];house.homeLocation=location;
 f.doc.state.npcs[child.id]={...initialNpcState(child),location,status:'正常',goals:{},memoryStream:[]};
 return child.id;
}

test('家庭义务只看结构事实：任意改写全部活动名，时间预算和出勤工资不变',()=>{
 // 480−登记自家田180−照料约定60−往返60=180分钟，180×2=360铜。
 const f=setup(),before=householdWorkTime(f.e,f.doc.state,worker,480,{commuteMinutes:30});
 assert.equal(before.reservedMinutes,240);assert.equal(before.workMinutes,180);
 for(const s of f.e.byId.get(worker).schedule.default)s.activity='任意字符串 XYZ 123';
 assert.deepEqual(householdWorkTime(f.e,f.doc.state,worker,480,{commuteMinutes:30}),before);
 const row=advance(f,1020);assert.equal(row.attendance[0],180);assert.equal(row.workedMinutes,180);assert.equal(row.paid,360);
});

test('登记自家田保留180分钟；别人田和未登记场所无田权不能按文字占农时',()=>{
 // 同一180分钟时段，有本户田权时可雇180；无权利时可雇360（只扣照料60、通勤60）。
 const f=setup(),s=f.e.byId.get(worker).schedule.default[1],field=s.location;
 const house=f.w.households.find(h=>h.members.includes(worker)),outsider=f.w.npcs.find(n=>!house.members.includes(n.id)&&n.id!==clerk).id;
 const budget=()=>householdWorkTime(f.e,f.doc.state,worker,480,{commuteMinutes:30});
 assert.equal(budget().workMinutes,180);
 f.doc.state.buildings[field].owner=outsider;assert.equal(budget().reservedMinutes,60);assert.equal(budget().workMinutes,360);
 const relative=house.members.find(member=>member!==worker);assert.ok(relative);
 f.doc.state.buildings[field]={owners:{[relative]:0.5,[outsider]:0.5}};assert.equal(budget().workMinutes,180);
 s.location=site;f.doc.state.buildings[site]={owner:worker};assert.equal(budget().workMinutes,360);
});

test('K01有效田租和本户农事账户都能派生农时，终止租约与别户账户不授予农时',()=>{
 // 仍以180农事+60照料+60通勤计180可雇分钟；失去有效权利后恢复360分钟。
 const f=setup(),field=f.e.byId.get(worker).schedule.default[1].location;
 const house=f.w.households.find(h=>h.members.includes(worker)),outsider=f.w.npcs.find(n=>!house.members.includes(n.id)).id;
 f.doc.state.buildings[field].owner=outsider;
 const lease={id:'field-rent',category:'contract',kind:'asset_lease',owner:outsider,tenant:worker,subject:field,use:'field',starts:0,deadline:DAY,status:'已到期',monthlyRent:100,
  clauses:{kind:'asset_lease',owner:outsider,tenant:worker,subject:field,use:'field',starts:0,expires:DAY,monthlyRent:100,initialStatus:'有效',rentBasis:{areaMu:1}}};
 f.doc.state.records[lease.id]=lease;
 const budget=()=>householdWorkTime(f.e,f.doc.state,worker,480,{commuteMinutes:30});
 assert.equal(budget().workMinutes,180,'签约区间有效，不读可过时的状态文字');
 lease.endedAt=480;assert.equal(budget().workMinutes,360);
 delete f.doc.state.records[lease.id];
 const farm={category:'private_farm',location:field,owner:worker,crop:f.e.rules.agriculture.grainItem,areaUnits:1,status:'growing'};
 f.doc.state.records.farm=farm;assert.equal(budget().workMinutes,180);
 farm.owner=outsider;assert.equal(budget().workMinutes,360);
});

test('赶集按集日选中的market变体和地点交易事实保留，不以活动文字或普通日作息推断',()=>{
 // 仅登记的180分钟集市时段占用：480−180=300；没有变体/非集日/场所停用均为480。
 const f=setup({duties:false,commute:0}),market='bld_hw_grain_annex',routine=f.e.byId.get(worker).schedule;
 const day=Array.from({length:30},(_,i)=>i).find(i=>f.e.calendar(i*DAY+480).market),at=day*DAY+480;
 const normal=Array.from({length:30},(_,i)=>i).find(i=>!f.e.calendar(i*DAY+480).market)*DAY+480;
 f.e.byId.get(market).services=['trade'];
 routine.default=[slot(0,480,'休息'),slot(480,660,'赶集',market),slot(660,1440,'休息')];
 assert.equal(householdWorkTime(f.e,f.doc.state,worker,at).workMinutes,480);
 routine.market=structuredClone(routine.default);
 const before=householdWorkTime(f.e,f.doc.state,worker,at);assert.equal(before.reservedMinutes,180);assert.equal(before.workMinutes,300);
 for(const s of routine.market)s.activity='不表示任何职业的新说法';
 assert.deepEqual(householdWorkTime(f.e,f.doc.state,worker,at),before);
 assert.equal(householdWorkTime(f.e,f.doc.state,worker,normal).workMinutes,480);
 f.doc.state.buildings[market]={burning:true};assert.equal(householdWorkTime(f.e,f.doc.state,worker,at).workMinutes,480);
 // 同一现有人物转入本局名册后，交易服务仍从其真实工位派生，不能只扫描静态职业目录。
 delete f.doc.state.buildings[market];f.e.byId.get(market).services=[];
 f.doc.state.created[host]={...structuredClone(f.e.byId.get(host)),workplace:{location:market}};
 f.w.npcs=f.w.npcs.filter(n=>n.id!==host);
 assert.equal(householdWorkTime(f.e,f.doc.state,worker,at).workMinutes,300);
});

test('K08真实market_trip占往返全程，店主只占实际服务窗口，重叠承诺不重复扣时',()=>{
 // 旅人450→630与可用窗口480→720交150分钟，剩330；店主服务510→600占90，剩390。
 const f=setup({duties:false,commute:0});
 f.doc.state.records.trip={id:'trip',category:'market_trip',actor:worker,keeper:host,from:home,to:site,departAt:450,arriveAt:510,finishAt:600,returnAt:630,serviceWindows:[{start:510,end:600}]};
 f.doc.state.obligations.overlap={id:'overlap',reservationVersion:1,type:'会面',promisor:worker,promisee:clerk,status:'待履行',start:480,deadline:540,location:site};
 assert.equal(householdWorkTime(f.e,f.doc.state,worker,480).reservedMinutes,150);
 assert.equal(householdWorkTime(f.e,f.doc.state,worker,480).workMinutes,330);
 assert.equal(householdWorkTime(f.e,f.doc.state,host,480).workMinutes,390);
 assert.equal(householdWorkTime(f.e,f.doc.state,worker,DAY+480).workMinutes,480);
});

test('480分钟扣农事180、照料60、往返60，真实出勤180、每分钟2铜实付360',()=>{
 const f=setup(),before=cash(f.doc),employer=f.doc.state.npcs[host].coins;
 const time=householdWorkTime(f.e,f.doc.state,worker,480,{commuteMinutes:30});
 assert.equal(time.reservedMinutes,240);assert.equal(time.commuteMinutes,60);assert.equal(time.workMinutes,180);
 assert.equal(scheduleAt(f.e,worker,600,f.doc.state).activity,'农事');
 assert.equal(scheduleAt(f.e,worker,690,f.doc.state).activity,'已约定事务');
 assert.equal(scheduleAt(f.e,worker,690,f.doc.state).location,home);
 assert.equal(scheduleAt(f.e,worker,800,f.doc.state).activity,'通勤');
 assert.equal(scheduleAt(f.e,worker,900,f.doc.state).activity,'工程施工');
 const row=advance(f,1020);
 assert.equal(row.attendance[0],180);assert.equal(row.workedMinutes,180);assert.equal(row.paid,360);
 assert.equal(f.doc.state.npcs[worker].coins,460);assert.equal(f.doc.state.npcs[host].coins,employer-360);
 assert.equal(f.doc.state.projects.project.remainingWork,1.625);assert.equal(f.doc.state.projects.project.laborMinutes,180);
 assert.equal(agriculturalEmployment(f.doc.state,'loc_hw',0).unavailable,0.375);
 assert.equal(cash(f.doc),before);
 const saved=structuredClone(f.doc);advance(f,1020);assert.deepEqual(f.doc,saved);
});

test('统计层沿同一时间派生只记180分钟，不按满班凭空补工',()=>{
 // 与上例同一480−180−60−60锚点；统计层结算在周边界，日到期不能先结。
 const f=setup({statistical:true});f.doc.state.records[jobId].deadline=8*DAY;f.doc.state.records[jobId].signedTerms.deadline=8*DAY;
 advance(f,1020,{schedules:false});assert.equal(f.doc.state.records[jobId].attendance[0],180);
});

test('已签半班工时只排240分钟，不能被默认下午作息补成满班',()=>{
 // 日薪960按240/480计480铜；工程只完成半工日。
 const f=setup({duties:false,commute:0});f.doc.state.npcs[worker].location=site;
 f.doc.state.records[jobId].workMinutes=240;f.doc.state.records[jobId].signedTerms.workMinutes=240;
 const row=advance(f,1020);assert.equal(row.workedMinutes,240);assert.equal(row.paid,480);assert.equal(f.doc.state.projects.project.remainingWork,1.5);
});

test('营养事实判断缺食，非食物不能当饭',()=>{
 // 每种食物备足一天 60 饱食所需的份数（份数 = 60 ÷ 引擎里该食物的饱腹，向上取整；饱腹由配方/出处推导，不写死）；100份木材仍缺食。
 const f=setup({duties:false,commute:0}),o=offer(f);f.w.households.find(h=>h.members.includes(worker)).members=[worker];
 const n=f.doc.state.npcs[worker];n.coins=10000;
 for(const item of ['item_bread','item_ration','item_fish_broth','item_mutton_turnip_stew']){n.inventory={[item]:{quantity:Math.ceil(60/f.e.byId.get(item).nutrition.satiety)}};assert.equal(laborApplication(f.e,f.doc.state,worker,o),null);}
 n.inventory={item_wood:{quantity:100}};assert.ok(laborApplication(f.e,f.doc.state,worker,o));
 const before=structuredClone(f.doc);laborApplication(f.e,f.doc.state,worker,o);assert.deepEqual(f.doc,before);
});

test('现金与包食分列，发薪并且只从雇主真实库存转移实食',()=>{
 // 满班480分钟=960铜；包2份真实口粮，雇主只有1份，最多转1份，不增加现金。
 const f=setup({duties:false,commute:0,meals:[{item:'item_ration',quantity:2}]});
 f.doc.state.npcs[worker].location=site;f.doc.state.npcs[worker].inventory={};f.doc.state.npcs[host].inventory={item_ration:{quantity:1}};
 const before=cash(f.doc),row=advance(f,1020);
 assert.equal(row.workedMinutes,480);assert.equal(row.paid,960);assert.deepEqual(row.shifts[0].meals,[{item:'item_ration',quantity:1}]);
 assert.equal(f.doc.state.npcs[worker].inventory.item_ration.quantity,1);assert.equal(f.doc.state.npcs[host].inventory.item_ration?.quantity??0,0);assert.equal(cash(f.doc),before);
});

test('病童无人照料不会假设替工；真实照料人优先于受雇日程',()=>{
 // 无在场照料人=0可用分钟；真正安排本人全天照料后仍为0，工资/工程不能增加。
 const f=setup(),child=childHousehold(f);
 f.doc.state.family={...f.doc.state.family,illnesses:{ill:{id:'ill',patient:child,status:'患病中',severity:'重',since:0,endsAt:2*DAY,caregivers:[]}}};
 const o=offer(f);assert.equal(laborApplication(f.e,f.doc.state,worker,o),null);
 assert.equal(f.doc.state.npcs[worker].caring,undefined);
 // 登记过照料但正在患病/在途的家属不能算作实际替工；现金再多也不能补出一个人。
 f.w.households.find(h=>h.members.includes(worker)).members.push(clerk);
 f.doc.state.npcs[clerk].caring={illness:'ill',patient:child,location:home,since:0};
 f.doc.state.npcs[clerk].location=home;f.doc.state.npcs[clerk].status='患病';
 assert.equal(laborApplication(f.e,f.doc.state,worker,o),null);
 f.doc.state.npcs[clerk].status='正常';f.doc.state.npcs[clerk].scheduleTravel={from:site,to:home,depart:480,arrive:540};
 assert.equal(laborApplication(f.e,f.doc.state,worker,o),null);
 delete f.doc.state.npcs[clerk].scheduleTravel;delete f.doc.state.npcs[clerk].caring;
 f.doc.state.npcs[worker].caring={illness:'ill',patient:child,location:home,since:0};
 delete f.e.byId.get(worker).schedule; // 没有已写人物作息也不能丢失真实照料。
 assert.equal(npcSchedule(f.e,f.doc.state,worker).default[0].activity,'照护病人');
 assert.equal(householdWorkTime(f.e,f.doc.state,worker).workMinutes,0);
});

test('真实重病照料事件使已受雇家属停工，不动已赚工资',()=>{
 // 上午已做240分钟实得480铜；其后被分配全天照料，下午0分钟。
 const f=setup({duties:false,commute:0}),child=childHousehold(f,site);
 f.doc.state.npcs[worker].location=site;advance(f,720);
 const d=f.draft();contractIllness(d,f.e,child,720,{severity:'重',days:2,disease:f.e.rules.hazardClock.diseases[0]});d.done();
 assert.equal(f.doc.state.npcs[worker].caring?.patient,child);
 const row=advance(f,1020);assert.equal(row.attendance[0],240);assert.equal(row.paid,480);
});

test('封路不录出勤，不发工资；排他承诺不能被高薪越过',()=>{
 // 路不通=0到场分钟、0工资；一项占用整个下午的真实预约也使应聘不可行。
 const f=setup();f.e.route=()=>{throw Error('道路中断');};const before=f.doc.state.npcs[host].coins,row=advance(f,1020);
 assert.equal(row.workedMinutes,0);assert.equal(row.paid,0);assert.equal(f.doc.state.npcs[host].coins,before);
 const g=setup(),o=offer(g);g.doc.state.obligations.reserved={id:'reserved',reservationVersion:1,type:'会面',promisor:worker,promisee:clerk,status:'待履行',start:DAY+780,deadline:DAY+1020,departures:{[worker]:DAY+780,[clerk]:DAY+780},location:home};
 assert.equal(laborApplication(g.e,g.doc.state,worker,{...o,wage:100000}),null);
 assert.equal(g.doc.state.obligations.reserved.status,'待履行');
});

test('保留工资的身份种子固定，决定噪声可重放；更高外部机会提高保留工资',()=>{
 // 480分钟外部日薪100，固定50%偏好保留50；外部日薪200则100，现金80不变。
 const f=setup({duties:false,commute:0}),d=f.draft(),config=f.w.primitiveTables.yields.params.find(r=>r.id==='labor.choice').value;
 config.reservationLowPercent=50;config.reservationHighPercent=50;config.noisePercent=0;
 const a=householdLaborBudget(d,f.e,worker,{wage:80,outsideWage:100}),b=householdLaborBudget(d,f.e,worker,{wage:80,outsideWage:200});
 assert.equal(a.reservation,50);assert.equal(b.reservation,100);assert.equal(a.cash,80);assert.ok(a.net>0&&b.net<0);
 config.reservationLowPercent=50;config.reservationHighPercent=100;config.noisePercent=10;
 const x=householdLaborBudget(d,f.e,worker,{wage:80,outsideWage:100}),copy=structuredClone(f.doc);
 assert.deepEqual(householdLaborBudget(f.draft(),f.e,worker,{wage:80,outsideWage:100}),x);assert.deepEqual(f.doc,copy);
 const later=householdLaborBudget(d,f.e,worker,{minute:DAY+480,wage:80,outsideWage:100});assert.equal(later.preferencePercent,x.preferencePercent);
 const choices=Array.from({length:40},(_,i)=>householdLaborBudget(d,f.e,worker,{wage:80,outsideWage:100,seed:`labor-${i}`}));
 assert.ok(new Set(choices.map(r=>r.preferencePercent)).size>1);assert.ok(new Set(choices.map(r=>r.noisePercent)).size>1);
 assert.ok(choices.some(r=>r.net>=0)&&choices.some(r=>r.net<0));
 assert.ok(choices.some(r=>r.cash-r.reservation<0&&r.net>=0)||choices.some(r=>r.cash-r.reservation>=0&&r.net<0));
});

test('求职预算不窥读家属钱袋、雇主私库；包食承诺与实际履行分开',()=>{
 // 本人无粮：别户的人（clerk 另有自己的户）与雇主（host）暗藏10000份仍缺食；包食2份按承诺计值，实库存留待结算检查。
 // EC-1a（已批准）起同一登记户共灶、共用钱袋与口粮池，同户成员的包裹与钱袋本来就并入这一户的预算（下一条专测），所以“不窥读”只对别户成立：worker 自成一户。
 const f=setup({duties:false,commute:0}),house=f.w.households.find(h=>h.members.includes(worker));house.members=[worker];
 f.doc.state.npcs[worker].inventory={};f.doc.state.npcs[clerk].inventory={};
 const args={wage:80,outsideWage:100,meals:[{item:'item_ration',quantity:2}],employer:host};
 const before=householdLaborBudget(f.draft(),f.e,worker,args);
 f.doc.state.npcs[clerk].inventory={item_ration:{quantity:10000}};f.doc.state.npcs[clerk].coins=100000;
 f.doc.state.npcs[host].inventory={item_ration:{quantity:10000}};
 const after=householdLaborBudget(f.draft(),f.e,worker,args);
 assert.equal(before.foodMissing,true);assert.deepEqual(after,before);assert.equal(after.food[0].quantity,2);
});

test('同户共灶成员的包裹并入求职预算：同户成员有粮则不缺食，包食承诺不再按缺口计值',()=>{
 // EC-1a：同一登记户（worker 与 clerk）共用口粮池。clerk 的 10000 份口粮属于这一户，worker 的采购缺口为 0，
 // 包食计值的份数 = min(承诺份数, ceil(缺口 ÷ 单份营养))，缺口为 0 即 0 份（householdLaborBudget 的 food 只按缺口分配）。
 const f=setup({duties:false,commute:0}),house=f.w.households.find(h=>h.members.includes(worker));house.members=[worker,clerk];
 f.doc.state.npcs[worker].inventory={};f.doc.state.npcs[clerk].inventory={};
 const args={wage:80,outsideWage:100,meals:[{item:'item_ration',quantity:2}],employer:host};
 const before=householdLaborBudget(f.draft(),f.e,worker,args);
 f.doc.state.npcs[clerk].inventory={item_ration:{quantity:10000}};
 const after=householdLaborBudget(f.draft(),f.e,worker,args);
 assert.equal(before.foodMissing,true);assert.equal(after.foodMissing,false);assert.deepEqual(after.food,[]);assert.equal(after.foodValue,0);
});

test('mine commute: 已实做的采矿不能因返家后才结算而丢失工资与产出',()=>{
 // 480−往返4=476到场分钟；每次采矿60分钟，可实作7次=420分钟，日薪960应付840。
 // 使用已有矿点、矿主、工具与 finance 固定种子：7次实际采掘应有1份矿石入矿主库存。
 const f=fixture(),mine=f.w.locations.flatMap(p=>(p.minerals??f.e.rules.extraction.mining.locations?.[p.id]??[]).map(spec=>({p,spec}))).find(({p,spec})=>f.e.byId.get(spec.owner??p.owner)?.id?.startsWith('npc_'));
 // Preserve the stated 480-4=476 commute-only mining anchor.
 delete f.e.rules.householdSubsistence;
 const {p,spec}=mine,owner=spec.owner??p.owner,settlement=placeSettlement(f.e,f.doc.state,p.id).value;
 const home=f.w.locations.find(l=>l.id!==p.id&&placeSettlement(f.e,f.doc.state,l.id).value===settlement).id;
 const house=f.w.households.find(h=>h.members.includes(worker));house.homeLocation=home;house.settlement=settlement;
 f.doc.state.npcs[owner]={...initialNpcState(f.e.byId.get(owner)),location:p.id,status:'正常',coins:5000};
 f.doc.state.npcs[worker].location=home;f.doc.state.npcs[worker].proficiencies={[f.e.rules.extraction.mining.check.skill]:3000};
 f.doc.state.npcs[worker].inventory={[f.e.rules.extraction.mining.tool]:{quantity:1,durability:100}};
 f.e.byId.get(worker).schedule={default:[slot(0,1440,'休息',home)]};
 f.e.route=()=>({minutes:2,cost:0,edges:[]});
 f.e.advanceLayerContext={layers:new Map([['county','intelligent']]),countyOf:()=> 'county'};
 f.doc.state.minute=480;
 const terms={owner,worker,location:p.id,wage:960,workMinutes:480,task:'矿脉开采',deadline:7*DAY};
 f.doc.state.records.job={id:'job',category:'contract',kind:'workshop',laborMarket:1,...terms,signedTerms:structuredClone(terms),item:spec.item,settlement,starts:480,nextWork:1020,createdAt:0,status:'有效',commuteMinutes:2,attendance:{},shifts:[],workedMinutes:0,paid:0,produced:0};
 // 没到岗、以及只站在矿上却没有作业出勤，均不能把480分钟口头申报当作工时。
 const unworked=structuredClone(f.doc),unworkedDraft=f.draft();
 assert.equal(mineEmployment(unworkedDraft,f.e,f.doc.state.records.job,1020,480),null);
 assert.deepEqual(unworkedDraft.document,unworked);
 f.doc.state.npcs[worker].location=p.id;
 const presentButIdle=structuredClone(f.doc),idleDraft=f.draft();
 assert.equal(mineEmployment(idleDraft,f.e,f.doc.state.records.job,1020,480),null);
 assert.deepEqual(idleDraft.document,presentButIdle);f.doc.state.npcs[worker].location=home;
 const before=f.doc.state.npcs[owner].inventory[spec.item]?.quantity??0;
 const d=f.draft();d.set(['state','minute'],1020);advanceNpcSchedules(d,f.e,480,1020);advanceLaborMarket(d,f.e,{before:480,after:1020,id:'mining-commute'});d.done();
 const row=f.doc.state.records.job;
 assert.equal(row.attendance[0],476);assert.equal(f.doc.state.npcs[worker].location,home);
 assert.equal(row.workedMinutes,420);assert.equal(row.paid,840);assert.equal(row.produced,1);
 assert.equal(f.doc.state.npcs[owner].inventory[spec.item].quantity,before+1);
 const paid=structuredClone(f.doc),replay=f.draft();
 assert.equal(mineEmployment(replay,f.e,row,1020,476).minutesSpent,420);
 assert.deepEqual(replay.document,paid);
 assert.equal(mineEmployment(replay,f.e,{...row,location:home},1021,476),null);
 assert.deepEqual(replay.document,paid);
});
