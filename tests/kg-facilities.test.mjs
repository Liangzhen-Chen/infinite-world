// K5 设施派生：工位来自地点的设备属性（fixtures），不来自手写名单；使用许可只来自产权、居住、租约、主人同意或公开收费。
import test from'node:test';
import assert from'node:assert/strict';
import fs from'node:fs/promises';
import {loadWorld}from'../tools/load-world.mjs';
import {WorldEngine}from'../server-plugin/engine.mjs';
import {applyPatches}from'../server-plugin/storage.mjs';
import {facilityView}from'../server-plugin/facility-state.mjs';
import {knowsKnowledge}from'../server-plugin/education-state.mjs';
import {placeWorkstations,stationLicence}from'../server-plugin/workstation-services.mjs';
const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const NOVEL='bld_kg_novel_shed';
// A building that never existed before; it carries only what each case gives it.
function worldWith(world,extra){
 const w=structuredClone(world);
 w.locations.push({id:NOVEL,name:'新起的棚屋',aliases:[],coordinates:[0.37,-0.41],parent:'loc_hw',scope:'loc_hw',terrain:'平地',openHours:[0,1440],owner:null,rooms:[],inventory:{},...extra});
 w.routes.push({id:`route_${NOVEL}`,from:'loc_hw',to:NOVEL,lengthKm:0,terrainMultiplier:1,modes:['walk','horse'],closedSeasons:[],toll:0,risk:0});
 return w;
}
function kit(engine){
 const document=engine.createCharacter(seed,{},'kg-facilities');
 document.state.location=NOVEL;document.state.inventory.item_wood={quantity:6,quality:'木',durability:100,weight:1};
 document.state.inventory.item_whittling_knife={quantity:1,quality:'木',durability:80,weight:0.2};
 document.state.skills.skill_life_6_core={proficiency:120,daily:{},breakthroughs:[]};
 document.state.recipes.recipe_wooden_pegs={source:{type:'teacher',id:'npc_hw_xiejin'}};
 return document;
}
const craft=(engine,document,args={},eventId='kg-craft')=>engine.reduce(document,{tool:'world_craft',args:{recipe:'recipe_wooden_pegs',...args},eventId});
const world=await loadWorld();

test('新建筑只要有木作台就能开工，去掉这项属性就不能；手写名单不是来源',async()=>{
 const open=new WorldEngine(worldWith(world,{access:{mode:'public'},fixtures:[{fixture:'workbench'}]}));
 const start=kit(open),ok=await craft(open,start),done=applyPatches(start,ok.patches);
 assert.equal(done.state.crafted[ok.result.receipt].station,`station_${NOVEL}_woodworking`,'真实做了一批，用的是这件设备派生的工位');
 const bare=new WorldEngine(worldWith(world,{access:{mode:'public'}}));
 await assert.rejects(craft(bare,kit(bare)),/当前位置没有所需工作台/);
 const listed=new WorldEngine(worldWith(world,{access:{mode:'public'},workstations:[{id:'kg_listed',kind:'woodworking',access:'public',fee:0}]}));
 await assert.rejects(craft(listed,kit(listed)),/当前位置没有所需工作台/,'只有名单、没有设备的地方没有工位');
 const unknown=new WorldEngine(worldWith(world,{access:{mode:'public'},fixtures:[{fixture:'kg_unknown_thing'}]}));
 await assert.rejects(craft(unknown,kit(unknown)),/当前位置没有所需工作台/,'词汇外的设备不提供工位');
});

test('已建设施的类型自带设备：工坊有木作台，住宅有灶',()=>{
 const w=worldWith(world,{access:{mode:'public'},facilityType:'workshop'}),engine=new WorldEngine(w),document=kit(engine);
 assert.deepEqual(facilityView(engine,document.state,NOVEL).workstations.map(s=>s.kind),['woodworking']);
 const house=new WorldEngine(worldWith(world,{facilityType:'house'}));
 assert.deepEqual(facilityView(house,kit(house).state,NOVEL).workstations.map(s=>[s.kind,s.access]),[["cooking","consent"]]);
});

const PRIVATE={purpose:'私宅',access:{mode:'private',residents:['npc_hw_xiejin'],requiresConsent:true},fixtures:[{fixture:'workbench'}]};
const permit=(document,content,extra={})=>{document.state.records.permission_kg={category:'authorization',action:'enter_home',subject:NOVEL,grantor:'npc_hw_xiejin',grantee:'player',guests:[],createdAt:document.state.minute,expires:document.state.minute+120,revoked:false,content,...extra};return 'permission_kg';};
const unlicensed=out=>out.result.offenses?.find(o=>o.offense==='unauthorized_use');

test('私宅的工作台：不经主人同意照样做成，记擅用，受害人是住户；向主人学过配方不算许可',async()=>{
 const engine=new WorldEngine(worldWith(world,PRIVATE)),document=kit(engine),coins=document.state.player.coins;
 const out=await craft(engine,document);
 const o=unlicensed(out);assert.ok(o,'记擅用');assert.equal(o.victim,'npc_hw_xiejin');
 assert.equal(applyPatches(document,out.patches).state.player.coins,coins,'私宅工位没有收费口径，不收钱');
 const visit=kit(engine),auth=permit(visit,'登门拜访');
 assert.ok(unlicensed(await craft(engine,visit,{authorization:auth})),'进屋拜访的许可不覆盖借用工作台');
 const worded=kit(engine),text=permit(worded,'借工作台做点木活');
 assert.ok(unlicensed(await craft(engine,worded,{authorization:text})),'用途文字说了借，许可里没写明设备，仍不算借用');
});

test('主人同意借用（许可写明借这件设备）、住户自用：都是合法使用，不记擅用',async()=>{
 const engine=new WorldEngine(worldWith(world,PRIVATE));
 const lent=kit(engine),auth=permit(lent,'借工作台做点木活',{fixtures:['workbench']});
 assert.equal(unlicensed(await craft(engine,lent,{authorization:auth})),undefined);
 const expired=kit(engine),old=permit(expired,'借工作台做点木活',{fixtures:['workbench'],expires:expired.state.minute});
 assert.ok(unlicensed(await craft(engine,expired,{authorization:old})),'过期的许可不算');
 const stranger=kit(engine),forged=permit(stranger,'借工作台做点木活',{fixtures:['workbench'],grantor:'npc_hw_linsui'});
 assert.ok(unlicensed(await craft(engine,stranger,{authorization:forged})),'不是住户给的许可不算');
 const own=new WorldEngine(worldWith(world,{...PRIVATE,access:{...PRIVATE.access,residents:['player']}}));
 assert.equal(unlicensed(await craft(own,kit(own))),undefined,'自家的工作台');
});

test('公开收费工位：付费即许可，钱到主人手里',async()=>{
 const engine=new WorldEngine(worldWith(world,{owner:'npc_hw_xiejin',fixtures:[{fixture:'workbench',fee:3}]})),document=kit(engine);
 const before=document.state.npcs.npc_hw_xiejin.coins,out=await craft(engine,document),after=applyPatches(document,out.patches);
 assert.equal(unlicensed(out),undefined);assert.equal(out.result.spent.feePaid,3);
 assert.equal(after.state.npcs.npc_hw_xiejin.coins,before+3);
});

test('师傅跟着工位走：在有灶处住或做工、熟练度够的人会教烹饪配方；去掉灶就不会',()=>{
 const strip=w=>{for(const id of ['bld_yp_home_06','bld_yp_kitchen'])delete w.locations.find(l=>l.id===id).fixtures;return w;};
 const none=strip(structuredClone(world));
 const withHearth=strip(structuredClone(world));withHearth.locations.find(l=>l.id==='bld_yp_kitchen').fixtures=[{fixture:'hearth'}];
 const e1=new WorldEngine(withHearth),e0=new WorldEngine(none),s1=kit(e1).state,s0=kit(e0).state;
 assert.equal(knowsKnowledge(e1,s1,'npc_yp_zhusheng','recipe_cook_porridge'),true);
 assert.equal(knowsKnowledge(e0,s0,'npc_yp_zhusheng','recipe_cook_porridge'),false);
 assert.equal(knowsKnowledge(e1,s1,'player','recipe_cook_porridge'),false,'玩家仍须真实学会');
});

test('住户在场授予私宅许可时写明借用的设备：只能写这处实有的设备，记进许可',async()=>{
 const engine=new WorldEngine(worldWith(world,{}));let document=kit(engine);const home='bld_hw_home_21',host='npc_hw_xiejin';
 document.state.location='loc_hw';Object.assign(document.state.npcs[host],{location:'loc_hw',activity:'闲谈',status:'正常'});delete document.state.npcs[host].scheduleTravel;
 const grant=fixtures=>engine.reduce(document,{tool:'world_promise',args:{operation:'grant_access',promisor:host,location:home,minutes:120,consent:true,content:'借灶做饭',fixtures},eventId:`grant-${fixtures.join('-')}`});
 await assert.rejects(grant(['forge']),/实有的设备/);
 const out=await grant(['hearth']);document=applyPatches(document,out.patches);
 assert.deepEqual(document.state.records[out.result.authorization].fixtures,['hearth']);
 const station=placeWorkstations(engine,document.state,home).find(s=>s.kind==='cooking');
 assert.equal(stationLicence(engine,document,station,'player',{authorization:out.result.authorization})?.basis,'consent');
 const plain=await engine.reduce(document,{tool:'world_promise',args:{operation:'grant_access',promisor:host,location:home,minutes:120,consent:true,content:'借灶做饭'},eventId:'grant-plain'});
 assert.equal(stationLicence(engine,applyPatches(document,plain.patches),station,'player',{authorization:plain.result.authorization}),null,'没写明设备的进屋许可不借出灶');
});
