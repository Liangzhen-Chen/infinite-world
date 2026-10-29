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

const home='bld_hw_post',site='bld_hw_mill',jobId='workshop:household';
const slot=(start,end,activity,location=home)=>({start,end,activity,location,services:[]});
function setup({duties=true,commute=30,statistical=false,meals=[]}={}){
 const f=fixture({at:site});f.doc.state.minute=480;
 f.doc.state.npcs[worker].location=home;f.doc.state.npcs[worker].coins=100;
 f.doc.state.npcs[host].coins=5000;
 f.w.households.find(h=>h.members.includes(worker)).homeLocation=home;
 f.e.byId.get(worker).schedule={default:duties?[slot(0,480,'睡眠'),slot(480,660,'农事'),slot(660,720,'照料家人'),slot(720,780,'午饭'),slot(780,1020,'日常起居'),slot(1020,1440,'休息')]:[slot(0,1440,'休息')]};
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

test('480分钟扣农事180、照料60、往返60，真实出勤180、每分钟2铜实付360',()=>{
 const f=setup(),before=cash(f.doc),employer=f.doc.state.npcs[host].coins;
 const time=householdWorkTime(f.e,f.doc.state,worker,480,{commuteMinutes:30});
 assert.equal(time.reservedMinutes,240);assert.equal(time.commuteMinutes,60);assert.equal(time.workMinutes,180);
 assert.equal(scheduleAt(f.e,worker,600,f.doc.state).activity,'农事');
 assert.equal(scheduleAt(f.e,worker,690,f.doc.state).activity,'照料家人');
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
 // 3份面包/口粮各90饱食，3份鱼汤/炖肉各105，都覆盖一天60；100份木材仍缺食。
 const f=setup({duties:false,commute:0}),o=offer(f);f.w.households.find(h=>h.members.includes(worker)).members=[worker];
 const n=f.doc.state.npcs[worker];n.coins=10000;
 for(const item of ['item_bread','item_ration','item_fish_broth','item_mutton_turnip_stew']){n.inventory={[item]:{quantity:3}};assert.equal(laborApplication(f.e,f.doc.state,worker,o),null);}
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
 // 本人无粮：家属暗藏10000份仍缺食；包食2份按承诺计值，实库存留待结算检查。
 const f=setup({duties:false,commute:0}),house=f.w.households.find(h=>h.members.includes(worker));house.members=[worker,clerk];
 f.doc.state.npcs[worker].inventory={};f.doc.state.npcs[clerk].inventory={};
 const args={wage:80,outsideWage:100,meals:[{item:'item_ration',quantity:2}],employer:host};
 const before=householdLaborBudget(f.draft(),f.e,worker,args);
 f.doc.state.npcs[clerk].inventory={item_ration:{quantity:10000}};f.doc.state.npcs[clerk].coins=100000;
 f.doc.state.npcs[host].inventory={item_ration:{quantity:10000}};
 const after=householdLaborBudget(f.draft(),f.e,worker,args);
 assert.equal(before.foodMissing,true);assert.deepEqual(after,before);assert.equal(after.food[0].quantity,2);
});

test('mine commute: 已实做的采矿不能因返家后才结算而丢失工资与产出',()=>{
 // 480−往返4=476到场分钟；每次采矿60分钟，可实作7次=420分钟，日薪960应付840。
 // 使用已有矿点、矿主、工具与 finance 固定种子：7次实际采掘应有1份矿石入矿主库存。
 const f=fixture(),mine=f.w.locations.flatMap(p=>(p.minerals??f.e.rules.extraction.mining.locations?.[p.id]??[]).map(spec=>({p,spec}))).find(({p,spec})=>f.e.byId.get(spec.owner??p.owner)?.id?.startsWith('npc_'));
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
 const before=f.doc.state.npcs[owner].inventory[spec.item]?.quantity??0;
 const d=f.draft();d.set(['state','minute'],1020);advanceNpcSchedules(d,f.e,480,1020);advanceLaborMarket(d,f.e,{before:480,after:1020,id:'mining-commute'});d.done();
 const row=f.doc.state.records.job;
 assert.equal(row.attendance[0],476);assert.equal(f.doc.state.npcs[worker].location,home);
 assert.equal(row.workedMinutes,420);assert.equal(row.paid,840);assert.equal(row.produced,1);
 assert.equal(f.doc.state.npcs[owner].inventory[spec.item].quantity,before+1);
});
