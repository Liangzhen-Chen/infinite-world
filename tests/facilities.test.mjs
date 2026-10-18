import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {facilityView,granaryCapacity} from '../server-plugin/facility-state.mjs';
import {advanceFacilities,advanceFacilityFire,completeFacilityProject,damageFacility} from '../server-plugin/facilities.mjs';
import {startPublicProject,advancePublicProjects,abortPublicProject,startHouse,advanceHouses} from '../server-plugin/public-projects.mjs';
import {placeView} from '../server-plugin/entity-view.mjs';
import {traitsOf} from '../server-plugin/traits.mjs';
import {applyInteraction} from '../server-plugin/interactions.mjs';
import {applyEffect} from '../server-plugin/effects.mjs';
import {eventRumorId,worldEvents} from '../server-plugin/world-events.mjs';
import {returnChanges} from '../server-plugin/return-summary.mjs';
import {workstation} from '../server-plugin/manufacturing.mjs';
import {assertLocationAccess} from '../server-plugin/location-access.mjs';
import {interactEnvironment} from '../server-plugin/environment.mjs';
import {agricultureAction,agricultureView} from '../server-plugin/agriculture.mjs';
import {startWar,campaignRound} from '../server-plugin/war-diplomacy.mjs';
import {ensureArmies} from '../server-plugin/military.mjs';
import {advanceLayerPlan} from '../server-plugin/advance-layers.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8')),DAY=1440;
const sid='loc_bs_yupo',site='loc_yp_path';
function fixture(){
 const w=structuredClone(world);for(const n of w.npcs){delete n.schedule;delete n.tier;}delete w.rules.weather;
 const engine=new WorldEngine(w),doc=engine.createCharacter(seed,{},'facilities');
 const d={document:doc,get(...p){return p.reduce((v,k)=>v?.[k],this.document);},set(path,value){this.document=applyPatches(this.document,[{op:'set',path,value}]);},remove(path){this.document=applyPatches(this.document,[{op:'delete',path}]);},say(){}};
 engine.airDraft=d;d.set(['state','location'],site);d.set(['state','minute'],600);
 const workers=w.settlementProfiles.find(p=>p.id===sid).details.governance.coordinators.slice(0,2);
 for(const id of workers)d.set(['state','npcs',id],{...d.get('state','npcs',id),location:site,status:'正常',activity:'议事'});
 d.set(['state','records','governance_office:fixture'],{category:'governance_office',holder:'player',office:'office_village_head',settlement:sid,status:'在任',appointedAt:0,until:100*DAY,appointedBy:'fixture'});
 d.set(['state','settlements',sid,'treasury'],100000);d.set(['state','settlements',sid,'wood'],1000);d.set(['state','settlements',sid,'stone'],1000);
 const add=(id,extra={})=>{const base={id,name:id,type:'bld',parent:site,scope:sid,owner:sid,facilityType:'house',material:'wood',position:[0,0],access:{mode:'public'},...extra};d.set(['state','created',id],base);return id;};
 const start=(extra={},id='work')=>startPublicProject(d,engine.scoped(d.document),{name:'设施工程',days:3,wood:12,stone:8,workers,consent:true,plot:site,...extra},id,sid);
 const finish=(days=3)=>{const before=d.get('state','minute'),after=before+days*DAY;advancePublicProjects(d,engine,{before,after,id:'advance'});d.set(['state','minute'],after);};
 return {engine,d,w,workers,add,start,finish};
}

test('材质进入K1，日常使用和天气损耗按日结算；汛期与K6灾害损毁幂等',()=>{
 const {engine,d,add,w}=fixture(),wood=add('bld_test_wood'),stone=add('bld_test_stone',{material:'stone',position:[30,0]});
 assert.ok(traitsOf(engine,d.get('state'),wood).tags.includes('flammable'));
 assert.ok(!traitsOf(engine,d.get('state'),stone).tags.includes('flammable'));
 d.set(['state','location'],wood);advanceFacilities(d,engine,{before:0,after:10*DAY});
 assert.equal(facilityView(engine,d.get('state'),wood).condition,96);
 assert.equal(facilityView(engine,d.get('state'),stone).condition,99);
 const before=structuredClone(d.get('state','buildings'));advanceFacilities(d,engine,{before:0,after:10*DAY});assert.deepEqual(d.get('state','buildings'),before);
 applyEffect(d,engine,{kind:'flood',locations:[site],minutes:DAY},{minute:10*DAY,sourceEvent:'flood'},'world');
 assert.equal(facilityView(engine,d.get('state'),wood).condition,76);
 applyEffect(d,engine,{kind:'flood',locations:[site],minutes:DAY},{minute:10*DAY,sourceEvent:'flood'},'world');assert.equal(facilityView(engine,d.get('state'),wood).condition,76);
 applyEffect(d,engine,{kind:'facility',action:'damage',locations:[site],amount:20},{minute:11*DAY,sourceEvent:'disaster'},'world');assert.equal(facilityView(engine,d.get('state'),wood).status,'降级');
 w.rules.weather=structuredClone(world.rules.weather);w.rules.weather.regions=[{...w.rules.weather.regions[0],locations:[site],indoor:[]}];w.rules.weather.seasonalWeights=w.rules.weather.seasonalWeights.map(()=>[0,0,0,1,0,0]);
 const storm=add('bld_test_storm');advanceFacilities(d,engine,{before:10*DAY,after:20*DAY});assert.equal(facilityView(engine,d.get('state'),storm).condition,93);
});

test('用途阈值即时派生；受损住宅不能进入，燃烧工坊立即停止工作台服务',()=>{
 const {engine,d,add}=fixture(),id=add('bld_test_workshop',{facilityType:'workshop'});
 const snapshot=structuredClone(d.document);assert.equal(placeView(engine,d.get('state'),id).capacity.value,2);assert.deepEqual(d.document,snapshot);
 damageFacility(d,engine,id,45,{sourceEvent:'hit'});assert.equal(placeView(engine,d.get('state'),id).capacity.value,1);
 d.set(['state','location'],id);assert.equal(workstation(d,engine,{workstation:'woodworking',minutes:60},{}).workMinutes,120);
 applyInteraction(d,engine,{agent:'fire',target:id});assert.equal(placeView(engine,d.get('state'),id).capacity.value,0);
 assert.throws(()=>workstation(d,engine,{workstation:'woodworking'},{}),/工作台|停用/);
 assert.throws(()=>assertLocationAccess(d,engine,id),/停用/);
 applyInteraction(d,engine,{agent:'water',target:id});assert.equal(facilityView(engine,d.get('state'),id).status,'降级');
 damageFacility(d,engine,id,40,{sourceEvent:'collapse'});assert.equal(facilityView(engine,d.get('state'),id).services.length,0);
});

test('公款修缮消耗材料与实际人工，病工不领薪，完工恢复用途；扩建容量跟随损毁',()=>{
 const {engine,d,add,start,finish,workers}=fixture(),id=add('bld_test_clinic',{facilityType:'clinic'});
 damageFacility(d,engine,id,80,{sourceEvent:'ruin'});
 const treasury=d.get('state','settlements',sid,'treasury'),wood=d.get('state','settlements',sid,'wood'),coins=workers.map(w=>d.get('state','npcs',w,'coins'));
 const p=start({building:id,action:'repair',days:2});assert.equal(d.get('state','settlements',sid,'wood'),wood-12);
 d.set(['state','npcs',workers[1],'status'],'患病');finish(2);assert.equal(d.get('state','projects',p.project,'status'),'施工中');
 assert.equal(d.get('state','npcs',workers[1],'coins'),coins[1]);
 advancePublicProjects(d,engine,{before:2*DAY,after:4*DAY,id:'finish'});
 d.set(['state','minute'],4*DAY+600);
 assert.equal(d.get('state','projects',p.project,'status'),'已完成');assert.equal(facilityView(engine,d.get('state'),id).capacity,4);
 const wage=engine.rules.governance.authority.treasury.wagePerWorkerDayCopper;assert.equal(d.get('state','settlements',sid,'treasury'),treasury-4*wage);assert.equal(d.get('state','npcs',workers[0],'coins'),coins[0]+4*wage);
 d.set(['state','npcs',workers[1],'status'],'正常');start({building:id,action:'expand'},'expand');finish();assert.equal(placeView(engine,d.get('state'),id).capacity.value,8);
 damageFacility(d,engine,id,50,{sourceEvent:'later'});assert.equal(placeView(engine,d.get('state'),id).capacity.value,4);
});

test('私资修缮与中止不动公账，重复中止不重复退款，未获产权不能改造',()=>{
 const {engine,d,add,start,finish}=fixture(),id=add('bld_test_private',{owner:'player'});d.set(['state','buildings',id],{owner:'player',condition:10});
 d.set(['state','player','coins'],500);d.set(['state','inventory','item_wood'],{quantity:50});d.set(['state','inventory','item_stone'],{quantity:50});
 const treasury=d.get('state','settlements',sid,'treasury'),cash=d.get('state','player','coins');
 const p=start({funding:'private',building:id,action:'repair'});assert.ok(d.get('state','player','coins')<cash);
 const back=abortPublicProject(d,engine,{project:p.project});assert.equal(back.returned.wood,12);assert.equal(d.get('state','player','coins'),cash);
 assert.equal(abortPublicProject(d,engine,{project:p.project}).duplicate,true);assert.equal(d.get('state','settlements',sid,'treasury'),treasury);
 start({funding:'private',building:id,action:'repair'},'private_done');finish();assert.equal(facilityView(engine,d.get('state'),id).condition,100);
 assert.throws(()=>start({building:id,action:'expand'},'no_right'),/修缮扩建权/);
});

test('工程类型产生真实桥路、学堂、医馆、仓廪；桥断路绝，修桥恢复通行',()=>{
 const {engine,d,start,finish}=fixture(),edge=engine.world.routes.find(r=>r.from===site||r.to===site);
 for(const kind of ['school','clinic','granary','bridge']){start({facilityType:kind,...(kind==='bridge'?{route:edge.id}:{})},kind);finish();}
 for(const [kind,service,capacity]of [['school','teach',12],['clinic','medicine',4],['granary','storage',100]]){const id=d.get('state','projects',`project_${kind}`,'facility');assert.equal(placeView(engine,d.get('state'),id).serviceCapacity.value[service],capacity);}
 const bridge=d.get('state','projects','project_bridge','facility');
 const routes=engine.world.routes;engine.world.routes=[edge];
 assert.ok(engine.route(edge.from,edge.to,'walk',600).edges.includes(edge.id));
 damageFacility(d,engine,bridge,100,{sourceEvent:'bridge_down'});assert.throws(()=>engine.route(edge.from,edge.to,'walk',600),/路线/);
 start({building:bridge,action:'repair'},'bridge_repair');finish();assert.ok(engine.route(edge.from,edge.to,'walk',600).edges.includes(edge.id));
 const rebuilt=d.get('state','projects','project_bridge_repair','facility');assert.notEqual(rebuilt,bridge);assert.equal(d.get('holdings','protocol','entities',bridge,'gone'),true);assert.equal(d.get('state','buildings',bridge,'condition'),0);assert.equal(d.get('state','created',rebuilt,'rebuiltFrom'),bridge);
 assert.equal(completeFacilityProject(d,engine,d.get('state','projects','project_bridge_repair')),rebuilt);engine.world.routes=routes;
});

test('新增仓容实际接收入仓粮，扩建和灾损改变可用仓容，未复制进公仓账',()=>{
 const {engine,d}=fixture(),p=engine.rules.agriculture.settlements.find(p=>p.settlement===sid),r=d.get('state','records',`agriculture:${sid}`);
 const id=completeFacilityProject(d,engine,{id:'warehouse',name:'新粮仓',creator:'player',settlement:sid,location:site,facilityType:'granary',civicApproval:{settlement:sid}},0);
 const base=r.granary.capacity;assert.equal(granaryCapacity(engine,d.get('state'),sid,base),base+100);
 completeFacilityProject(d,engine,{id:'warehouse_expand',building:id,projectWork:'expand'},0);assert.equal(granaryCapacity(engine,d.get('state'),sid,base),base+200);
 assert.equal(d.get('state','records',`agriculture:${sid}`,'granary','capacity'),base);
 d.set(['state','location'],p.counter);d.set(['state','npcs',p.manager,'location'],p.counter);d.set(['state','npcs',p.manager,'status'],'正常');d.set(['state','npcs',p.manager,'activity'],'办理仓务');
 const stock=d.get('state','settlements',sid),current=d.get('state','records',`agriculture:${sid}`);
 const fill=base-current.field.seedBank-stock.food;d.set(['state','settlements',sid,'food'],stock.food+fill);
 d.set(['state','records',`agriculture:${sid}`,'batches'],[...current.batches,{id:'test_fill',amount:fill,harvestDay:0,expiresDay:90,kind:'grain'}]);
 const grain=engine.rules.agriculture.grainItem;d.set(['state','inventory',grain],{quantity:150});
 const before=d.get('state','settlements',sid,'food'),originalAdvance=engine.advance;engine.advance=()=>{};
 agricultureAction.call(engine,d,{operation:'donate',settlement:sid,quantity:150},'donate');engine.advance=originalAdvance;
 assert.equal(d.get('state','settlements',sid,'food'),before+150);assert.equal(engine.quantity(d,'player',grain),0);
 assert.equal(facilityView(engine,d.get('state'),id).capacity,200);damageFacility(d,engine,id,80,{sourceEvent:'warehouse_down'});assert.equal(granaryCapacity(engine,d.get('state'),sid,base),base);
 d.set(['state','location'],p.counter);assert.equal(agricultureView(engine,d.document).granary.capacity,base);
});

test('火只蔓延到有限邻居，石材不燃，远处不燃，水与雨阻断火势',()=>{
 const {engine,d,add,w}=fixture(),root=add('bld_fire_root'),near=add('bld_fire_near',{position:[5,0]}),far=add('bld_fire_far',{position:[30,0]}),stone=add('bld_fire_stone',{position:[6,0],material:'stone'});
 applyInteraction(d,engine,{agent:'fire',target:root});advanceFacilityFire(d,engine,{after:660});
 assert.equal(facilityView(engine,d.get('state'),root).condition,75);assert.equal(facilityView(engine,d.get('state'),near).burning,true);assert.equal(facilityView(engine,d.get('state'),far).burning,false);assert.equal(facilityView(engine,d.get('state'),stone).burning,false);
 d.set(['state','location'],site);d.set(['state','inventory','item_water'],{quantity:1});const originalAdvance=engine.advance;engine.advance=()=>{};
 interactEnvironment.call(engine,d,{target:near,operation:'douse_fire'},'douse');assert.equal(engine.quantity(d,'player','item_water'),0);assert.equal(facilityView(engine,d.get('state'),near).burning,false);engine.advance=originalAdvance;
 const chain=add('bld_chain_root',{position:[100,0]});
 for(let n=1;n<=10;n++)add(`bld_chain_${n}`,{position:[100+n*5,0]});
 applyInteraction(d,engine,{agent:'fire',target:chain});
 for(const after of [660,720,780,840])advanceFacilityFire(d,engine,{after});
 assert.equal(d.get('state','buildings','bld_chain_2','fireDepth'),2);assert.equal(facilityView(engine,d.get('state'),'bld_chain_3').burning,false);
 assert.ok(Object.entries(d.get('state','buildings')).filter(([id,r])=>id.startsWith('bld_chain')&&r.fireSince!==undefined).length<=7);
 w.rules.weather=structuredClone(world.rules.weather);w.rules.weather.regions=[{...w.rules.weather.regions[0],locations:[site],indoor:[]}];w.rules.weather.seasonalWeights=w.rules.weather.seasonalWeights.map(()=>[0,0,1,0,0,0]);
 applyInteraction(d,engine,{agent:'fire',target:far});advanceFacilityFire(d,engine,{after:660});assert.equal(facilityView(engine,d.get('state'),far).burning,false);assert.equal(facilityView(engine,d.get('state'),far).condition,100);
});

test('同距建筑受真实风速影响，重复工人不能虚增工时，同一人一天只做一处工程',()=>{
 const {engine,d,add,start,workers}=fixture(),calm=add('bld_calm',{position:[200,0]}),a=add('bld_calm_next',{position:[212,0]}),wind=add('bld_wind',{position:[300,0],windKmh:20}),b=add('bld_wind_next',{position:[312,0]});
 applyInteraction(d,engine,{agent:'fire',target:calm});applyInteraction(d,engine,{agent:'fire',target:wind});advanceFacilityFire(d,engine,{after:660});
 assert.equal(facilityView(engine,d.get('state'),a).burning,false);assert.equal(facilityView(engine,d.get('state'),b).burning,true);
 assert.throws(()=>start({facilityType:'clinic',days:1,workers:[workers[0],workers[0],workers[0]]},'duplicate_workers'),/实际工时/);
 start({facilityType:'clinic',days:2},'first');start({facilityType:'school',days:2},'second');
 advancePublicProjects(d,engine,{before:0,after:DAY,id:'shared_work'});
 assert.equal(d.get('state','projects','project_first','remainingWork'),2);assert.equal(d.get('state','projects','project_second','remainingWork'),4);
});

test('损毁与修缮进入世界事件、可传播传闻和返场汇总；重放不重复结算',()=>{
 const {engine,d,add}=fixture(),id=add('bld_event_house');
 damageFacility(d,engine,id,90,{sourceEvent:'event_damage',minute:1000});damageFacility(d,engine,id,90,{sourceEvent:'event_damage',minute:1000});
 completeFacilityProject(d,engine,{id:'event_repair',building:id,projectWork:'repair',creator:'player'},1100);
 const events=worldEvents(d.get('state'),e=>e.tags?.includes('facility'));assert.equal(events.length,2);assert.ok(events.every(e=>eventRumorId(engine,d.get('state'),e)));
 assert.ok(Object.values(d.get('state','npcs')).some(n=>n.memoryStream?.some(m=>m.content?.includes('修缮完成')&&m.eventRumor)));
 const changes=returnChanges(engine,d.get('state'),sid,{from:900,to:1200});assert.ok(changes.some(r=>r.includes('受损')));assert.ok(changes.some(r=>r.includes('修缮完成')));
});

test('U12战役掠村损坏当地建筑；与战役账共用来源事件，不重复毁损',()=>{
 const {engine,d,add}=fixture(),id=add('bld_war_house');ensureArmies(d,engine,0);
 const war=startWar(d,engine,engine.rules.warDiplomacy.sources[0],28*DAY,'facility-war');war.villages=[sid];
 campaignRound(d,engine,war,35*DAY);assert.equal(facilityView(engine,d.get('state'),id).condition,85);
 assert.ok(worldEvents(d.get('state'),e=>e.target===id).some(e=>e.cause==='战事'));
});

test('远方骨架设施按县统计磨损，到访后物化当前耐久，随后修缮不受旧统计重复扣减',()=>{
 const {engine,d,w,add}=fixture(),plan=advanceLayerPlan(engine,d.get('state')),county=[...plan.layers].find(([,layer])=>layer==='statistics')[0];
 const id=add('bld_remote_wear',{generated:'remote',region:county});w.locations.push(d.get('state','created',id));
 advanceFacilities(d,engine,{before:0,after:30*DAY});assert.equal(d.get('state','buildings',id),undefined);assert.equal(facilityView(engine,d.get('state'),id).condition,91);
 d.set(['state','location'],id);advanceFacilities(d,engine,{before:30*DAY,after:31*DAY});assert.equal(d.get('state','buildings',id,'condition'),91);
 completeFacilityProject(d,engine,{id:'remote_repair',building:id,projectWork:'repair'},31*DAY);assert.equal(facilityView(engine,d.get('state'),id).condition,100);
});

test('已有world_settlement工具可完成类型化工程和修缮，回执重放保持补丁一致',async()=>{
 const {engine,d,workers}=fixture();
 const act=async(args,eventId)=>{const input=d.document,out=await engine.reduce(input,{tool:'world_settlement',args:{settlement:sid,...args},eventId});
  const replay=await engine.reduce(input,{tool:'world_settlement',args:{settlement:sid,...args},eventId},{replay:true,result:out.result});assert.deepEqual(replay.patches,out.patches);d.document=applyPatches(input,out.patches);return out.result;};
 const built=await act({operation:'start_project',facilityType:'clinic',name:'乡医馆',plot:site,wood:10,stone:4,days:2,workers,consent:true},'typed');
 advancePublicProjects(d,engine,{before:0,after:2*DAY,id:'typed_complete'});const building=d.get('state','projects',built.project,'facility');
 damageFacility(d,engine,building,80,{sourceEvent:'typed_damage'});
 await act({operation:'start_project',action:'repair',plot:building,name:'修医馆',wood:8,stone:4,days:2,workers,consent:true},'typed_repair');
 advancePublicProjects(d,engine,{before:2*DAY,after:4*DAY,id:'typed_restored'});assert.equal(placeView(engine,d.get('state'),building).capacity.value,4);
});

test('NPC按本人宅基批文自备材料建房，复用设施用途和耐久入口',()=>{
 const {engine,d,workers}=fixture(),holder=workers[0],permit='housing_permit:npc';
 d.set(['state','records',permit],{id:permit,category:'housing_permit',holder,status:'已批准',settlement:sid,location:site,materials:{wood:8,stone:2},buildDays:2});
 d.set(['state','npcs',holder,'inventory'],{item_wood:8,item_stone:2});
 const out=startHouse(d,engine,{speaker:holder,consent:true,name:'自家屋'},'npc_house',permit);advanceHouses(d,engine,{before:0,after:2*DAY});
 const id=d.get('state','projects',out.project,'facility');assert.equal(d.get('state','buildings',id,'owner'),holder);assert.equal(facilityView(engine,d.get('state'),id).capacity,4);assert.equal(engine.quantity(d,holder,'item_wood'),0);
});
