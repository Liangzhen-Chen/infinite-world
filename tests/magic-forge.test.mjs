import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {heatSpellCandidates,mechanismMap} from '../tools/w2-mechanism-map.mjs';
import {validateMagicCatalog} from '../server-plugin/magic.mjs';
import {validateThermalState,advanceThermalState,initialThermalState} from '../server-plugin/magic-object.mjs';
import {recordLocalContact} from '../server-plugin/environment.mjs';
const source=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const model={heatCapacityJPerC:1000,maximumC:1000,ambientC:20,passiveExchangeJPerMinute:50,burnMgPerMinute:1000,fuelJPerMg:20,efficiencyPermille:900,ashPermille:50,ignitionMaximumMg:5000,ignitable:true,dryable:true,fuels:[{item:'item_charcoal',milligramsPerUnit:250000}]};
const thermal=(s,id='feature_hearth')=>s.doc.state.records[`physical_feature:${id}`]?.state.thermal;
function fixture(){
 const world=structuredClone(source),location=new WorldEngine(world).initialFromLegacy(seed,'forge-test').state.location;
 const object=(id,extra={})=>({id,name:id,kind:'object',owner:'player',access:'consent',position:[0,0],state:{},thermalModel:structuredClone(model),thermalInitial:{temperatureC:20,fuelMg:4000},...extra});
 const hearth=object('feature_hearth'),kiln=object('feature_kiln',{thermalModel:{...structuredClone(model),wallOffsetsC:[-8,8],kiln:{safeGradientC:8,safeRiseCPerMinute:30,crackPermillePerStress:100}}}),dough=object('feature_dough',{thermalInitial:{temperatureC:20,fuelMg:0}});
 const outside=object('feature_outside',{position:[3,0]}),line=object('feature_line',{fireLine:{end:[2,0],exitTo:[]}});
 const water={id:'feature_water',name:'试验水罐',kind:'container',owner:'player',access:'consent',position:[1,-1],state:{waterMl:1000,capacityMl:1000}};
 const room={id:'feature_room',name:'试验房间',kind:'room',owner:'player',access:'consent',position:[0,0],state:{},airModel:{capacityMg:4000,ventilationMgPerMinute:2000},fireLinks:[['feature_hearth','feature_outside']]};
 const destination={id:'feature_destination',name:'试验目的地',kind:'ground',owner:'player',access:'public',position:[1,1],state:{}};
 // Rooms are opt-in scene data; ordinary forge fixtures have no fire links.
 const place=world.locations.find(x=>x.id===location);place.features=[hearth,kiln,dough,outside,line,water,destination];
 world.items.push({...world.items.find(x=>x.id==='item_ration'),id:'item_test_pot',name:'试验陶杯',tags:['ceramic'],weight:.1});
 const candidates=heatSpellCandidates(),ignite={...world.spells[0],id:'spell_test_ignite',name:'试验点火',skill:'skill_test_ignite',stage:0,mp:2,minutes:1,difficulty:10,duration:0,rangeMeters:3,materials:[],effectSpec:{kind:'object',operation:'ignite',power:5000}};
 const spells=[...candidates,ignite];
 for(const s of spells){world.spells.push(s);if(!world.skills.some(x=>x.id===s.skill))world.skills.push({id:s.skill,name:s.name,attribute:'精神',profession:null});}
 // K5：工位由设备属性派生——这里搭一座窑（kiln→pottery），保留原编号、收费与热源绑定；主人由所绑热源的主人推出。
 place.fixtures=[{fixture:'kiln',id:'station_test_kiln',fee:2,thermalRequirement:{feature:kiln.id,minimumC:20,maximumC:1000,burning:true}}];
 world.recipes.push({id:'recipe_test_pots',name:'试验陶器',skill:'skill_test_ignite',attribute:'精神',minimumProficiency:0,difficulty:10,minutes:3,workstation:'pottery',materials:[{item:'item_clay',amount:1}],output:{item:'item_test_pot',quantity:4},tools:[],toolWear:0,failure:{recoverFraction:0,injury:0}});
 const engine=new WorldEngine(world),doc=engine.initialFromLegacy(seed,'forge-test');doc.state.player.mp=200;doc.state.player.maxMp=200;doc.state.player.hp=200;doc.state.player.maxHp=200;doc.state.weather[location]={temperatureC:20};
 doc.state.inventory.item_charcoal={quantity:5};doc.state.inventory.item_clay={quantity:5};doc.state.inventory.item_resin={quantity:5};
 for(const s of spells){doc.state.spells[s.id]={source:{type:'fixture'}};doc.state.skills[s.skill]={proficiency:1000,daily:{},breakthroughs:[]};}
 return{world,engine,doc,location,place,hearth,kiln,dough,line,water,outside,room,spells,candidates};
}
async function run(s,tool,args,eventId){const out=await s.engine.reduce(s.doc,{tool,args,eventId});s.doc=applyPatches(s.doc,out.patches);return out.result;}
async function cast(s,mechanism,target='player',extra={}){
 const spell=mechanism==='ignite'?s.spells.at(-1):s.candidates.find(x=>x.mechanism===mechanism),original=s.doc;
 for(let i=0;i<100;i++){
  const out=await s.engine.reduce(original,{tool:'world_cast',args:{spell:spell.id,target,...extra},eventId:`${mechanism}-${original.state.minute}-${i}`});
  if(out.result.success){s.doc=applyPatches(original,out.patches);return out.result;}
  if(out.result.effectFailed)throw new Error(out.result.effectFailed);
 }
 throw new Error('未找到成功的固定种子施法检定');
}
const wait=(s,minutes,id='wait')=>run(s,'world_time',{minutes},`${id}-${s.doc.state.minute}`);
const rejectedCast=(s,mechanism,target,pattern,extra={})=>assert.rejects(s.engine.reduce(s.doc,{tool:'world_cast',args:{spell:s.candidates.find(x=>x.mechanism===mechanism).id,target,...extra},eventId:`refuse-${mechanism}`}),pattern);
const reload=s=>({...s,engine:new WorldEngine(structuredClone(s.world)),doc:JSON.parse(JSON.stringify(s.doc))});
const draft=document=>({document,get:(...p)=>p.reduce((v,k)=>v?.[k],document),set:(p,value)=>{let parent=document;for(const key of p.slice(0,-1))parent=parent[key]??={};parent[p.at(-1)]=structuredClone(value);}});

test('七项机制有可施放数据，盘点标消费者就绪且不增加正式目录',()=>{
 const candidates=heatSpellCandidates();assert.equal(candidates.length,7);
 for(const c of candidates)assert.deepEqual(validateMagicCatalog(c,{requireHandler:true}),[]);
 const map=mechanismMap(source);assert.equal(map.formalSpellCount,source.spells.length);
 for(const c of candidates){const row=map.rows.find(x=>x.id===c.id);assert.equal(row.status,'consumer-ready');assert.deepEqual(row.validation,[]);}
});

test('鼓焰真实施法只助现有火，正常添料扣库存，燃尽后不再供热；重载及分段一致',async()=>{
 const s=fixture(),before=structuredClone(s.doc);await rejectedCast(s,'forge_heat','feature_hearth',/实际燃烧/);assert.deepEqual(s.doc,before);
 await cast(s,'ignite','feature_hearth');const beforeMp=s.doc.state.player.mp;
 const out=await cast(s,'forge_heat','feature_hearth');assert.equal(out.heatJPerMinute,5000);assert.ok(s.doc.state.player.mp<beforeMp);
 const saved=reload(s),initial=thermal(s).spellInputJ;await wait(s,3);await wait(saved,1,'split');await wait(saved,2,'split');
 assert.deepEqual(thermal(s),thermal(saved));assert.equal(thermal(s).spellInputJ-initial,10000);assert.equal(thermal(s).fuelMg,0);assert.equal(thermal(s).burning,false);
 const ended=thermal(s).spellInputJ;await wait(s,10);assert.equal(thermal(s).spellInputJ,ended);validateThermalState(thermal(s),model);
 await rejectedCast(s,'forge_heat','feature_hearth',/实际燃烧/);
 const t=fixture();await cast(t,'ignite','feature_hearth');const inv=t.doc.state.inventory.item_charcoal.quantity;
 await run(t,'world_environment',{operation:'load_fuel',target:'feature_hearth',item:'item_charcoal',quantity:1},'feed');assert.equal(t.doc.state.inventory.item_charcoal.quantity,inv-1);assert.equal(thermal(t).fuelAddedMg,250000);
 await cast(t,'forge_heat','feature_hearth');await wait(t,31);validateThermalState(thermal(t),model);assert.equal(thermal(t).spellInputJ,150000);
});

test('炭纹接触读取真实器壁温差，耗炭写下可检查痕迹；无接触、无炭、无温区拒绝',async()=>{
 const s=fixture(),q=s.doc.state.inventory.item_charcoal.quantity;
 const out=await cast(s,'sense_heat','feature_kiln');assert.equal(out.gradientC,16);assert.deepEqual(out.temperaturesC,[12,28]);assert.equal(s.doc.state.inventory.item_charcoal.quantity,q-1);
 const inspect=await run(reload(s),'world_environment',{operation:'inspect',target:'feature_kiln'},'trace');assert.deepEqual(inspect.charcoalTrace.temperaturesC,out.temperaturesC);
 s.doc.state.records.local_player_position={location:s.location,point:[.1,0]};await rejectedCast(s,'sense_heat','feature_kiln',/接触/);
 delete s.doc.state.records.local_player_position;s.doc.state.inventory.item_charcoal.quantity=0;await rejectedCast(s,'sense_heat','feature_kiln',/材料/);
 await rejectedCast(fixture(),'sense_heat','feature_hearth',/器壁/);
});

async function firedKiln(tuned){
 const s=fixture();await cast(s,'ignite','feature_kiln');await run(s,'world_environment',{operation:'load_fuel',target:'feature_kiln',item:'item_charcoal',quantity:1},'kiln-feed');
 if(tuned)await cast(s,'craft_heat','feature_kiln');
 return s;
}
async function successfulCraft(s){
 const original=s.doc;
 for(let i=0;i<100;i++){
  const out=await s.engine.reduce(original,{tool:'world_craft',args:{recipe:'recipe_test_pots'},eventId:`pots-${i}`});
  if(out.result.success||out.result.degree==='烧制裂损'){s.doc=applyPatches(original,out.patches);return out.result;}
 }
 throw new Error('未找到成功制造检定');
}
test('釉火均匀真实窑温，并在正常制造中减少陶器裂损，支付材料、工费与燃料',async()=>{
 const s=fixture();await rejectedCast(s,'craft_heat','feature_kiln',/实际燃烧/);
 await cast(s,'ignite','feature_hearth');await rejectedCast(s,'craft_heat','feature_hearth',/窑炉/);
 const raw=await firedKiln(false),tuned=await firedKiln(true),restart=reload(tuned);
 const rawOut=await successfulCraft(raw),out=await successfulCraft(tuned),reloaded=await successfulCraft(restart);
 assert.equal(rawOut.thermal.crackedQuantity,4);assert.equal(rawOut.produced.length,0);assert.equal(rawOut.success,false);
 assert.equal(out.thermal.crackedQuantity,0);assert.equal(out.produced[0].amount,4);assert.equal(out.spent.feePaid,2);assert.equal(out.spent.materials[0].quantity,1);
 assert.deepEqual(out,reloaded);assert.deepEqual(tuned.doc,restart.doc);assert.equal(thermal(tuned,'feature_kiln').zoneOffsetsC[0],0);assert.ok(thermal(tuned,'feature_kiln').burnedFuelMg>thermal(raw,'feature_kiln').burnedFuelMg);
 const noFuel=fixture();noFuel.kiln.thermalInitial.fuelMg=3000;await cast(noFuel,'ignite','feature_kiln');await assert.rejects(noFuel.engine.reduce(noFuel.doc,{tool:'world_craft',args:{recipe:'recipe_test_pots'},eventId:'starved-kiln'}),/整个工序/);
});

test('暖掌改变活体手温并向真实接触物传热，上限38度，到期回落与重载一致',async()=>{
 const s=fixture();const out=await cast(s,'warm');assert.equal(out.handTemperatureC,33);
 await wait(s,10);const before=s.doc.state.player.handThermal.energyJ;
 const touch=await run(s,'world_environment',{operation:'warm_touch',target:'feature_dough'},'touch');assert.equal(touch.transferredJ,1000);assert.equal(thermal(s,'feature_dough').energyJ,21000);assert.equal(s.doc.state.player.handThermal.energyJ,before-1000);
 const saved=reload(s);await wait(s,30);await wait(saved,10,'short');await wait(saved,20,'short');assert.deepEqual(s.doc.state.player.handThermal,saved.doc.state.player.handThermal);
 assert.ok(s.doc.state.player.handThermal.energyJ<=38000);await wait(s,60);assert.equal(s.doc.state.player.handThermal.energyJ,32000);
 await assert.rejects(s.engine.reduce(s.doc,{tool:'world_environment',args:{operation:'warm_touch',target:'feature_dough'},eventId:'expired-touch'}),/真实暖掌/);
 const remote=fixture();await cast(remote,'warm');remote.doc.state.records.local_player_position={location:remote.location,point:[.2,0]};await assert.rejects(remote.engine.reduce(remote.doc,{tool:'world_environment',args:{operation:'warm_touch',target:'feature_dough'},eventId:'remote-touch'}),/接触/);
 await rejectedCast(fixture(),'warm','feature_hearth',/活体/);
});

test('向在场活体暖掌须真实接触与可撤销的本人同意，死亡目标拒绝',async()=>{
 const s=fixture(),target=Object.keys(s.doc.state.npcs)[0],actor=s.doc.state.npcs[target];actor.location=s.location;actor.status='正常';actor.activity=null;delete actor.scheduleTravel;delete actor.cognitionTravel;
 await rejectedCast(s,'warm',target,/接触/);
 assert.equal(recordLocalContact(draft(s.doc),s.engine,target,'contact'),true);
 await rejectedCast(s,'warm',target,/同意/);
 s.doc.state.records.warm_permission={category:'authorization',subject:target,grantor:target,grantee:'player',action:'support_magic',expires:s.doc.state.minute+10};
 const out=await cast(s,'warm',target,{authorization:'warm_permission'});assert.equal(out.handTemperatureC,33);assert.equal(s.doc.state.npcs[target].handThermal.energyJ,33000);
 s.doc.state.records.warm_permission.revoked=true;await rejectedCast(s,'warm',target,/同意/,{authorization:'warm_permission'});
 s.doc.state.npcs[target].status='死亡';await rejectedCast(s,'warm',target,/死亡/,{authorization:'warm_permission'});
});

test('封焰阻止室内火势跨连接传播，真实耗魔且封闭通风，燃烧耗氧产烟；到期恢复',async()=>{
 const s=fixture();s.place.features.push(s.room);s.engine=new WorldEngine(s.world);
 await cast(s,'contain_fire','feature_room');await cast(s,'ignite','feature_hearth');
 const before=s.doc.state.player.mp,save=reload(s);await wait(s,2);await wait(save,1,'split');await wait(save,1,'split');
 assert.deepEqual(thermal(s),thermal(save));assert.deepEqual(s.doc.state.records['physical_feature:feature_room'].state,save.doc.state.records['physical_feature:feature_room'].state);assert.equal(s.doc.state.player.mp,save.doc.state.player.mp);
 const air=s.doc.state.records['physical_feature:feature_room'].state.air;assert.equal(air.smokeMg,1900);assert.equal(air.smokeMg,thermal(s).exhaustFuelMg);assert.equal(air.oxygenMg,2000);assert.equal(s.doc.state.player.mp,before-2);assert.equal(thermal(s,'feature_outside').burning,false);
 await wait(s,2);assert.equal(thermal(s).fuelMg,0);await wait(s,35);assert.equal(s.doc.state.records['physical_feature:feature_room'].state.air.smokeMg,0);assert.equal(s.doc.state.records['physical_feature:feature_room'].state.air.oxygenMg,4000);
 const open=fixture();open.place.features.push(open.room);open.engine=new WorldEngine(open.world);await cast(open,'ignite','feature_hearth');await wait(open,1);assert.equal(thermal(open,'feature_outside').burning,true);assert.ok(open.doc.state.records['physical_feature:feature_room'].state.air.spreadCount>0);
 await rejectedCast(fixture(),'contain_fire','feature_hearth',/实际房间/);
 const privateRoom=fixture();privateRoom.room.owner='npc_owner';privateRoom.place.features.push(privateRoom.room);privateRoom.engine=new WorldEngine(privateRoom.world);await rejectedCast(privateRoom,'contain_fire','feature_room',/授权/);
});

test('封焰维持魔力不足会立即开放通风和传播，重载无额外免费维持',async()=>{
 const s=fixture();s.place.features.push(s.room);s.engine=new WorldEngine(s.world);await cast(s,'contain_fire','feature_room');await cast(s,'ignite','feature_hearth');s.doc.state.player.mp=0;
 const saved=reload(s);await wait(s,1);await wait(saved,1);assert.deepEqual(s.doc,saved.doc);assert.equal(thermal(s,'feature_outside').burning,true);assert.equal(s.doc.state.player.mp,0);
});

test('封闭窑房耗氧会在开工前拒绝无法持续的烧制，预检不扣材料或工费',async()=>{
 const s=await firedKiln(true);s.room.fireLinks=[['feature_kiln','feature_outside']];s.room.airModel.capacityMg=1500;s.room.airModel.ventilationMgPerMinute=1000;s.place.features.push(s.room);s.engine=new WorldEngine(s.world);
 await cast(s,'contain_fire','feature_room');const before=structuredClone(s.doc);
 await assert.rejects(s.engine.reduce(s.doc,{tool:'world_craft',args:{recipe:'recipe_test_pots'},eventId:'sealed-kiln'}),/整个工序/);assert.deepEqual(s.doc,before);
});

test('两米火线阻断正常接近及关联出口；真实水浇灭扣水，燃尽和到期解除，重载保留',async()=>{
 const s=fixture();s.doc.state.records.local_player_position={location:s.location,point:[1,-1]};await cast(s,'barrier','feature_line');
 const saved=reload(s);await assert.rejects(saved.engine.reduce(saved.doc,{tool:'world_environment',args:{operation:'approach',target:'feature_destination'},eventId:'cross'}),/火线/);
 const edge=s.world.routes.find(x=>x.from===s.location||x.to===s.location);assert.ok(edge);const exit=edge.from===s.location?edge.to:edge.from;s.line.fireLine.exitTo=[exit];s.engine=new WorldEngine(s.world);
 await assert.rejects(s.engine.reduce(s.doc,{tool:'world_move',args:{destination:exit},eventId:'exit'}),/火线/);
 const before=s.doc.state.records['physical_feature:feature_water']?.state.waterMl??s.water.state.waterMl;
 await run(s,'world_environment',{operation:'douse_fire',target:'feature_line',source:'feature_water',millilitres:10},'douse');assert.equal(s.doc.state.records['physical_feature:feature_water'].state.waterMl,before-10);assert.equal(thermal(s,'feature_line').burning,false);validateThermalState(thermal(s,'feature_line'),model);
 assert.ok((await run(s,'world_environment',{operation:'approach',target:'feature_destination'},'cross-safe')).position);
 await wait(saved,4);assert.equal(thermal(saved,'feature_line').burning,false);await run(saved,'world_environment',{operation:'approach',target:'feature_destination'},'burned-safe');
 const short=fixture();short.candidates.find(c=>c.mechanism==='barrier').duration=1;short.line.thermalModel.burnMgPerMinute=1;short.engine=new WorldEngine(short.world);await cast(short,'barrier','feature_line');await wait(short,1);assert.equal(thermal(short,'feature_line').burning,false);assert.ok(thermal(short,'feature_line').fuelMg>0);await wait(short,2);assert.equal(thermal(short,'feature_line').burnedFuelMg,1);
 const wet=fixture();wet.line.thermalInitial.moistureMg=1;wet.engine=new WorldEngine(wet.world);await rejectedCast(wet,'barrier','feature_line',/干燥/);
 const dry=fixture();await cast(dry,'barrier','feature_line');await assert.rejects(dry.engine.reduce(dry.doc,{tool:'world_environment',args:{operation:'douse_fire',target:'feature_line',source:'feature_water',millilitres:1001},eventId:'too-much-water'}),/水量不足/);
});

test('冰针按真实环境温度衰减到零，正常施法扣费和扣生命；未知温度、远距拒绝',async()=>{
 const cold=fixture(),hot=fixture(),melted=fixture();hot.doc.state.weather[hot.location].temperatureC=70;melted.doc.state.weather[melted.location].temperatureC=120;
 const c=await cast(cold,'damage_cold'),h=await cast(hot,'damage_cold'),m=await cast(melted,'damage_cold');assert.equal(c.damage,40);assert.equal(h.damage,20);assert.equal(m.damage,0);assert.equal(h.heatMultiplier,.5);
 const saved=reload(hot);await cast(saved,'damage_cold');assert.equal(saved.doc.state.player.hp,hot.doc.state.player.hp-20);
 const unknown=fixture();delete unknown.doc.state.weather[unknown.location];delete unknown.place.microclimate;unknown.engine.rules.weather=undefined;await rejectedCast(unknown,'damage_cold','player',/实际环境温度/);
 const distant=fixture(),npc=Object.keys(distant.doc.state.npcs)[0];distant.doc.state.npcs[npc].location=distant.location;distant.engine.magicTargetFacts=()=>({distanceMeters:999,lineOfSight:true});await rejectedCast(distant,'damage_cold',npc,/射程/);
});

test('热账损坏与不适用材料仍拒绝，炉火长期等待和逐分钟结算相同',()=>{
 const m={...model,wallOffsetsC:[-8,8],kiln:{safeGradientC:8,safeRiseCPerMinute:30,crackPermillePerStress:100}},initial=initialThermalState({temperatureC:20,fuelMg:6000},m,0);initial.burning=true;
 const effects=[{kind:'object_process',operation:'craft_heat',target:'kiln',power:5000,limitC:1000,started:0,expires:3}];
 const long=advanceThermalState(initial,m,8,{effects,target:'kiln'});let split=initial;for(let i=1;i<=8;i++)split=advanceThermalState(split,m,i,{effects,target:'kiln'});assert.deepEqual(long,split);validateThermalState(long,m);
 const bad=structuredClone(long);bad.energyJ++;assert.throws(()=>validateThermalState(bad,m),/热量不守恒/);
});
