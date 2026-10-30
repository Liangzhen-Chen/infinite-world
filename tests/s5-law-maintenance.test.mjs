import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,host,inn,post,DAY,world} from './helpers/finance.mjs';
import {maintenanceOptions} from '../server-plugin/building-maintenance.mjs';
import {facilityView} from '../server-plugin/facility-state.mjs';
import {advanceFacilities} from '../server-plugin/facilities.mjs';
import {autonomyCandidates,autonomyKind,registerAutonomyProvider} from '../server-plugin/autonomy-candidates.mjs';
import {subjectiveView} from '../server-plugin/subjective-view.mjs';
import {advanceNpcAutonomy,npcAutonomyBusy} from '../server-plugin/npc-autonomy.mjs';
import {withLedger} from '../server-plugin/ledger.mjs';
import {conservation,reconcile} from './helpers/ledger-audit.mjs';
import {weatherAt} from '../server-plugin/weather.mjs';

function scenario({condition=59,expensive=false}={}){
 const f=fixture({at:inn});delete f.w.rules.weather;f.doc.state.location='loc_hw';
 Object.assign(f.w.rules.facilities.maintenance,{horizonDays:14,delayMaxPermille:0,stubbornPermille:0,noisePermille:0});
 f.e.byId.get(inn).lodging.rooms=2;f.e.byId.get(inn).workstations=[];
 f.w.rules.economy.rentalCopperPerNight=1;f.w.rules.economy.dailyIncomeBySkillStage[0]=[1,1];
 f.e.byId.get('item_wood').basePrice=expensive?4:2;f.e.byId.get('item_stone').basePrice=expensive?2:1;
 f.doc.state.buildings[inn].condition=condition;
 Object.assign(f.doc.state.npcs[host].inventory,{item_wood:{quantity:4},item_stone:{quantity:2}});
 f.doc=withLedger(f.e,f.doc).document;return f;
}
const options=f=>maintenanceOptions(f.e,f.doc,host,inn);
const candidates=f=>autonomyCandidates(f.e,subjectiveView(f.e,f.doc,host),{document:f.doc});
function work(f,day){
 const d=f.draft(),at=day*DAY+600;d.set(['state','minute'],at);
 advanceNpcAutonomy(d,f.e,at,at,`choose:${day}`,{beforeState:d.get('state')});
 const task=npcAutonomyBusy(d.get('state'),host,at);
 d.set(['state','minute'],at+240);advanceNpcAutonomy(d,f.e,at,at+240,`finish:${day}`);d.done();return task;
}

test('精确预筛与强制完整候选逐字节相同，保留降级边界、余数和在建修缮',()=>{
 // At90 even worst weather cannot reach60 in14 days: loss0, no action.
 // At60/59 and remainder5300/5400 the full comparison remains necessary;
 // condition59 repairs still take four240-minute shifts (960 total).
 let force=false;
 registerAutonomyProvider('maintenance-full-evaluation-reference',{
  relevant:()=>force,candidateRelevant:()=>force,candidates:()=>[]
 });
 try{
  for(const condition of [100,90,61,60,59,25,24]){
   const optimized=scenario({condition}),reference=scenario({condition});
   for(const f of [optimized,reference])Object.assign(f.doc.state.buildings[inn],{wearUnits:5300,wearDenominator:5400});
   for(let day=0;day<4;day++){
    force=false;work(optimized,day);
    force=true;work(reference,day);
    assert.equal(JSON.stringify(optimized.doc),JSON.stringify(reference.doc));
   }
  }
 }finally{force=false;}
});

test('历史在场不同于结算状态时保留原粗筛，仍收集其他provider候选',()=>{
 // Full-service condition90 cannot justify repair. A healthy on-site owner
 // with attachment-10000 can nevertheless suspend the native business;
 // the later sick state must not hide that earlier competitor's proposal.
 // validateAction still rejects real work by the currently sick owner.
 let force=false,calls=0;
 registerAutonomyProvider('historical-full-evaluation-reference',{
  relevant:()=>force,candidateRelevant:()=>force,candidates:(e,view)=>{if(view.observer===host)calls++;return [];}
 });
 try{
  const run=full=>{
   force=full;calls=0;const f=scenario({condition:90}),before=30*DAY,after=31*DAY;
   f.doc.state.minute=before;f.doc.state.npcs[host].businessAttachmentPermille=-10000;
   const beforeState=structuredClone(f.doc.state),d=f.draft();
   d.set(['state','minute'],after);d.set(['state','npcs',host,'status'],'患病');
   advanceNpcAutonomy(d,f.e,before,after,'historical',{beforeState});d.done();return {document:f.doc,calls};
  };
  const optimized=run(false),reference=run(true);
  assert.equal(JSON.stringify(optimized),JSON.stringify(reference));
  assert.equal(optimized.calls,1);
 }finally{force=false;}
});

test('未声明精确必要条件的provider保留跨provider竞争机会',()=>{
 // Damage opens the old shared gate even when that provider cannot act.
 // An extension without candidateRelevant must still get its candidates call.
 let calls=0;
 registerAutonomyProvider('unfiltered-extension',{relevant:()=>false,candidates:(e,view)=>{if(view.observer===host)calls++;return [];}});
 try{
  const f=scenario({condition:90});work(f,0);assert.equal(calls,1);
  assert.equal(f.doc.state.buildings[inn].condition,90);
 }finally{
  registerAutonomyProvider('unfiltered-extension',{relevant:()=>false,candidateRelevant:()=>false,candidates:()=>[]});
 }
});

test('零噪声成本7、避免损失10，真实候选选择修；成本12选择暂缓',()=>{
 // 2 rooms × 1/night × half-capacity loss × (14−4 daily shifts)=10.
 // Local goods value: wood4=4,stone2=1; self labor2 days×1=2 =>7.
 // Raising existing material prices gives wood4=8,stone2=2 => cost12.
 for(const expensive of [false,true]){
  const f=scenario({expensive}),o=options(f);
  assert.equal(o.avoidedLoss,10);assert.equal(o.cost,expensive?12:7);
  assert.equal(o.net,expensive?-2:3);
  assert.deepEqual(o.options.map(c=>c.kind),['repair_building','defer_maintenance']);
  // Deferral is an option comparison, never an executable action. A cost12
  // proposal must disappear; cost7 must still pass the real NPC decision.
  assert.equal(candidates(f).some(c=>c.kind==='defer_maintenance'),false);
  if(expensive){assert.ok(o.options[0].utility<o.options[1].utility);assert.deepEqual(candidates(f).filter(c=>c.kind==='repair_building'),[]);}
  else assert.equal(candidates(f)[0].kind,'repair_building');
  if(expensive){const before=structuredClone(f.doc);work(f,0);assert.equal(facilityView(f.e,f.doc.state,inn).condition,59);assert.equal(Object.keys(f.doc.state.projects).length,Object.keys(before.state.projects).length);}
 }
});

test('预防性维护和合理暂缓都由离降级时间推导，不等到condition<60',()=>{
 // Dry occupied wood wears400/5400 per day. At60, day14 falls
 // below60; in30 days there are16 half-service days =>16 coins lost.
 // At90 no threshold is crossed in the same window =>0 lost.
 const f=scenario({condition:60});f.w.rules.facilities.maintenance.horizonDays=30;
 assert.equal(options(f).avoidedLoss,16);assert.equal(candidates(f)[0].kind,'repair_building');
 f.doc.state.buildings[inn].condition=90;
 assert.equal(options(f).avoidedLoss,0);assert.ok(options(f).options[0].utility<options(f).options[1].utility);
 assert.deepEqual(candidates(f).filter(c=>c.kind==='repair_building'),[]);
});

test('天气和余数影响预计降级；不改变实际损耗公式',()=>{
 // At60, no remainder takes14 dry days to lose1; 5300/5400
 // remainder makes the next day lose1. Earlier loss raises repair value.
 const f=scenario({condition:60});f.w.rules.facilities.maintenance.horizonDays=30;
 const dry=options(f);Object.assign(f.doc.state.buildings[inn],{wearUnits:5300,wearDenominator:5400});
 assert.ok(options(f).avoidedLoss>dry.avoidedLoss);
 const d=f.draft();advanceFacilities(d,f.e,{before:0,after:DAY});d.done();
 assert.equal(f.doc.state.buildings[inn].condition,59);
 // The observed rain/storm adds its real wear weight to wood3+usage1,
 // rather than reducing weather or remainders to make a candidate appear.
 f.w.rules.weather=structuredClone(world.rules.weather);f.doc.state.minute=720;
 let wet;
 for(let i=0;i<100&&!wet;i++){
  f.doc.randomSeed=`maintenance-rain:${i}`;
  const w=weatherAt(f.e,f.doc.randomSeed,'loc_hw',720);
  if(['rain','storm'].includes(w?.kind))wet=w;
 }
 assert.ok(wet);assert.equal(options(f).dailyWear,(4+f.w.rules.facilities.wear.weather[wet.kind])*100);
 assert.ok(options(f).dailyWear>dry.dailyWear);
});

test('完工扣一份材料，无虚构工钱；同一输入重放不重复修',()=>{
 // condition59 =>wood4,stone2,960 minutes =4×240. Opportunity
 // cost2 affects the choice, never a cash transfer for one's own labor.
 const f=scenario(),before=structuredClone(f.doc),replay=scenario();replay.doc=structuredClone(f.doc);
 for(let day=0;day<4;day++){
  assert.equal(work(f,day)?.action.kind,'repair_building');work(replay,day);
  assert.equal(facilityView(f.e,f.doc.state,inn).condition,day===3?100:59);
 }
 assert.deepEqual(f.doc,replay.doc);
 assert.equal(f.doc.state.npcs[host].coins,before.state.npcs[host].coins);
 const completed=Object.values(f.doc.state.projects).filter(p=>p.type==='业主修缮');
 assert.equal(completed.length,1);assert.equal(completed[0].minutesDone,960);
 const after=structuredClone(f.doc),d=f.draft();advanceNpcAutonomy(d,f.e,3*DAY+600,3*DAY+840,'finish:3');d.done();
 assert.deepEqual(f.doc,after);assert.deepEqual(conservation(f.e,before,f.doc),[]);
 assert.deepEqual(reconcile(f.e,f.doc).mismatches,[]);assert.deepEqual(reconcile(f.e,f.doc).lots,[]);
});

test('原生种子抽签：人格固定，日决定带噪声，预览不写入或重抽',()=>{
 // Cost7/loss10 is close enough that persistent delay0..1000‰
 // and decision noise±500‰ produce both choices, with no quota by ID.
 const f=scenario();Object.assign(f.w.rules.facilities.maintenance,{delayMaxPermille:1000,noisePermille:500});
 const choices=new Set(),preferences=new Set(),noise=new Set();let repairSeed;
 for(let i=0;i<40;i++){
  f.doc.randomSeed=`maintenance:${i}`;const before=structuredClone(f.doc),a=options(f);
  assert.deepEqual(options(f),a);assert.deepEqual(f.doc,before);
  choices.add(a.options[0].utility>0?'repair':'defer');preferences.add(a.delayPermille);noise.add(a.noisePermille);
  const repairs=candidates(f).filter(c=>c.kind==='repair_building');
  assert.equal(repairs.length,a.options[0].utility>0?1:0);
  assert.equal(candidates(f).some(c=>c.kind==='defer_maintenance'),false);
  if(repairs.length)repairSeed=f.doc.randomSeed;
  f.doc.state.minute+=DAY;assert.equal(options(f).delayPermille,a.delayPermille);f.doc.state.minute-=DAY;
 }
 assert.deepEqual([...choices].sort(),['defer','repair']);assert.ok(preferences.size>1);assert.ok(noise.size>1);
 // A derived preference survives previews/deferrals without being written;
 // only the first real construction shift persists the same integer.
 assert.equal(f.doc.state.npcs[host].maintenanceDelayPermille,undefined);
 f.doc.randomSeed=repairSeed;const derived=options(f).delayPermille;
 assert.equal(work(f,0)?.action.kind,'repair_building');
 assert.equal(f.doc.state.npcs[host].maintenanceDelayPermille,derived);
 const persisted=options(f)?.delayPermille;f.doc.state.minute+=DAY;assert.equal(options(f)?.delayPermille,persisted);
});

test('少数固执业主可拖到停用，产权人仍能比较修与暂缓',()=>{
 // A fixed10000‰ extra cost weighs cost7 as77 > loss10. The
 // same preference persists across wear down to24 (service factor0).
 const f=scenario();f.doc.state.npcs[host].maintenanceDelayPermille=10000;
 assert.ok(options(f).options[0].utility<options(f).options[1].utility);
 assert.deepEqual(candidates(f).filter(c=>c.kind==='repair_building'),[]);
 const d=f.draft();advanceFacilities(d,f.e,{before:0,after:480*DAY});d.done();
 assert.equal(facilityView(f.e,f.doc.state,inn).factor,0);
 assert.equal(options(f).options.length,2);assert.ok(options(f).options[0].utility<options(f).options[1].utility);
 assert.deepEqual(candidates(f).filter(c=>c.kind==='repair_building'),[]);
});

test('无私人产权的学堂驿站、仅经营者、火灾与冲突工程不误修',()=>{
 // Management or public service is not private title:0 authorized
 // owner-maintenance options, regardless of the actor's materials.
 const f=scenario();
 // K10b published the native village school as communal property. This
 // test excludes private title, not all title; keep testing the real school.
 const school=f.w.locations.find(p=>facilityView(f.e,f.doc.state,p.id)?.kind==='school'&&p.owner==='loc_hw');
 assert.ok(school);
 for(const building of [post,school.id]){f.doc.state.buildings[building]={condition:59};assert.equal(maintenanceOptions(f.e,f.doc,host,building),null);}
 f.doc.state.buildings[inn].owner='loc_hw';assert.equal(options(f),null);
 f.doc.state.buildings[inn].owner=host;f.doc.state.buildings[inn].burning=true;assert.equal(options(f),null);
 f.doc.state.buildings[inn].burning=false;
 f.doc.state.projects.other={id:'other',building:inn,status:'施工中'};assert.equal(options(f),null);
});

test('全部设施类型均可比较，不因缺服务定价而漏出候选',()=>{
 // At99 every native private facility has two options, including an
 // unprofitable deferral. No service-type or condition60 filter applies.
 const f=scenario({condition:99}),place=f.e.byId.get(inn);
 delete place.lodging;place.workstations=[];
 for(const kind of ['house','workshop','bridge','road','clinic','school','granary','public']){
  place.facilityType=kind;
  assert.equal(options(f).options.length,2,kind);assert.ok(options(f).options[0].utility<options(f).options[1].utility,kind);
  assert.deepEqual(candidates(f).filter(c=>c.kind==='repair_building'),[],kind);
 }
});

test('暂缓连续九日不写行动任务或记忆，也不挤掉低分日常候选',()=>{
 // Cost12 > loss10 for nine independent daily decisions:0 repair actions,
 // 0 deferral actions and0 new NPC facts. A routine at utility−1 remains.
 const f=scenario({expensive:true}),before=structuredClone(f.doc.state.npcs[host]);
 assert.equal(autonomyKind('defer_maintenance'),null);
 const routine={id:'core:routine:1',kind:'craft',legacy:{kind:'craft',recipe:f.w.recipes[0].id},utility:-1,cost:{},needSatisfaction:0};
 const ranked=autonomyCandidates(f.e,subjectiveView(f.e,f.doc,host),{document:f.doc,fallback:[routine]});
 assert.equal(ranked[0].id,routine.id);assert.ok(ranked[0].score<0);
 for(let day=0;day<9;day++)assert.equal(work(f,day),null);
 assert.deepEqual(f.doc.state.npcs[host],before);
 assert.deepEqual(Object.values(f.doc.state.npcAutonomy?.tasks??{}).filter(t=>t.npc===host),[]);
 assert.deepEqual(Object.values(f.doc.state.npcAutonomy?.actions??{}).filter(t=>t.npc===host),[]);
});

test('采购受本人预算、实际卖家与身体负重限制，买料不会修好建筑',()=>{
 // Stone2 is a real local order. Weight above all spare carry or price
 // above the purse admits0 buy proposals, while deferral remains possible.
 const f=scenario(),seller='npc_hw_ayan';
 // Price2 has a positive native quote (price1 rounds to a free quote),
 // so a zero purse really is a budget failure rather than a free trade.
 f.e.byId.get('item_stone').basePrice=2;
 f.doc.state.npcs[host].inventory.item_stone.quantity=0;
 f.doc.state.npcs[seller].inventory.item_stone={quantity:2};
 const buys=()=>candidates(f).filter(c=>c.id.startsWith('repair_material:'));
 assert.equal(buys().length,1);
 f.doc.state.npcs[host].coins=0;assert.equal(buys().length,0);
 f.doc.state.npcs[host].coins=500;f.e.byId.get('item_stone').weight=10000;assert.equal(buys().length,0);
 f.e.byId.get('item_stone').weight=0;f.doc.state.npcs[seller].location='loc_hw';assert.equal(buys().length,0);
 assert.equal(facilityView(f.e,f.doc.state,inn).condition,59);
});
