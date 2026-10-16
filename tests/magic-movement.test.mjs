import test from'node:test';
import assert from'node:assert/strict';
import fs from'node:fs/promises';
import{tmpRoot}from'../tools/tmp-root.mjs';
import path from'node:path';
import {loadWorld}from'../tools/load-world.mjs';
import {WorldEngine}from'../server-plugin/engine.mjs';
import {CampaignStorage,applyPatches,digest}from'../server-plugin/storage.mjs';
import {validateMagicCatalog}from'../server-plugin/magic.mjs';
const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const owner='npc_hw_linsui',from='bld_hw_qingdeng',to='loc_hw';
const source='feature_move_source',destination='feature_move_destination',landing='feature_move_landing';
async function fixture({companions=true}={}){
 const world=await loadWorld(),base=world.spells[0];
 for(const kind of ['anchor_sense','blink','teleport']){
  const id=`spell_move_${kind}`,skill=`skill_move_${kind}`;
  world.skills.push({id:skill,name:skill,attribute:'精神',profession:null});
  world.spells.push({...base,id,name:id,skill,mp:2,minutes:1,duration:0,materials:[{item:'item_charcoal',amount:1}],rangeMeters:5,targeting:{lineOfSight:true},effectSpec:{kind,power:1,...(kind==='anchor_sense'?{}:{maxDistanceMeters:kind==='blink'?10:100000,maxLoadKg:5000,maxCompanions:2})}});
 }
 const feature=(id,point,anchor=false)=>({id,name:id,kind:'silt_heap',owner,access:'public',position:point,spaceAnchor:anchor,state:anchor?{anchorIntact:true}:{blinkLanding:true}});
 world.locations.find(l=>l.id===from).features.push(feature(source,[0,0],true),feature(landing,[4,0]));
 const place=world.locations.find(l=>l.id===to);place.features??=[];place.features.push(feature(destination,[4,0],true));
 const engine=new WorldEngine(world),doc=engine.initialFromLegacy(seed,'movement');
 Object.assign(doc.state.player,{mp:1000,maxMp:1000,hp:10000,maxHp:10000,companions:companions?[owner]:[]});
 doc.state.inventory.item_charcoal={quantity:100,quality:'木',durability:100};
 for(const kind of ['anchor_sense','blink','teleport']){doc.state.spells[`spell_move_${kind}`]={source:{type:'fixture'}};doc.state.skills[`skill_move_${kind}`]={proficiency:200,daily:{},breakthroughs:[]};}
 Object.assign(doc.state.npcs[owner],{hp:10000,maxHp:10000});
 const run=async(d,tool,args,id)=>{const out=await engine.reduce(d,{tool,args,eventId:id});return{doc:applyPatches(d,out.patches),result:out.result,id};};
 let serial=0;
 const cast=async(d,kind,target,extra={})=>{for(let i=0;i<100;i++){const r=await run(d,'world_cast',{spell:`spell_move_${kind}`,target,...extra},`cast-${serial++}`);if(r.result.success)return r;}throw Error('未取得成功施法');};
 const grant=(d,target,minutes=1440)=>run(d,'world_promise',{operation:'grant_access',promisor:owner,location:target,content:'本人与登记同行者使用锚点',minutes,guests:companions?[owner]:[]},`grant-${serial++}`);
 const contact=async d=>{for(let i=0;i<50;i++){const r=await run(d,'world_combat',{target:owner,intent:'defend'},`contact-${serial++}`);if(r.doc.state.records[`local_actor_position:${owner}`])return r.doc;}throw Error('未形成实际接触');};
 const prepared=async()=>{
  let d=(await cast(doc,'anchor_sense',source)).doc;
  const a=await grant(d,source);d=a.doc;
  d=(await run(d,'world_move',{destination:to},'walk-to')).doc;
  d=(await run(d,'world_environment',{operation:'approach',target:destination},'approach-destination')).doc;
  d=(await cast(d,'anchor_sense',destination)).doc;
  const b=await grant(d,destination);d=b.doc;
  d=(await run(d,'world_move',{destination:from},'walk-back')).doc;
  d=(await run(d,'world_environment',{operation:'approach',target:source},'approach-source')).doc;
  if(companions)d=await contact(d);
  return{doc:d,args:{spell:'spell_move_teleport',target:destination,authorizations:[a.result.authorization,b.result.authorization]},permits:[a.result.authorization,b.result.authorization]};
 };
 return{world,engine,doc,run,cast,grant,contact,prepared};
}
async function denied(s,doc,args,pattern){const before=structuredClone(doc);await assert.rejects(s.engine.reduce(doc,{tool:'world_cast',args,eventId:'denied'}),pattern);assert.deepEqual(doc,before);}
test('锚纹辨识仅记录实地可见真实锚点；未知与自报坐标拒绝',async()=>{
 const s=await fixture(),r=await s.cast(s.doc,'anchor_sense',source),record=r.doc.state.records[`known_anchor:${source}`];
 assert.equal(record.owner,owner);assert.equal(record.location,from);assert.equal(record.sourceEvent,r.id);assert.equal(record.permission,undefined);
 assert.equal(r.doc.state.location,from);assert.equal(r.doc.state.player.mp,s.doc.state.player.mp-2);
 assert.equal(r.doc.state.inventory.item_charcoal.quantity,99);
 await denied(s,s.doc,{spell:'spell_move_anchor_sense',target:destination},/射程|视线/);
 await denied(s,s.doc,{spell:'spell_move_blink',target:'[4,0]'},/真实环境/);
 const p=await s.prepared();delete p.doc.state.records[`known_anchor:${destination}`];await denied(s,p.doc,p.args,/未知锚点/);
});
test('双锚传送消费有效许可和真实材料，同行坐标一致且保留物品',async()=>{
 const s=await fixture(),p=await s.prepared(),r=await s.cast(p.doc,'teleport',destination,{authorizations:p.permits});
 assert.equal(r.doc.state.location,to);assert.equal(r.doc.state.npcs[owner].location,to);
 assert.deepEqual(r.doc.state.records.local_player_position.point,[4,0]);assert.deepEqual(r.doc.state.records[`local_actor_position:${owner}`].point,[4,0]);
 const facts=s.engine.magicAreaTargetFacts({document:r.doc,get:(...keys)=>keys.reduce((o,k)=>o?.[k],r.doc)},owner,to,[4,0]);assert.equal(facts.lineOfSight,true);
 assert.equal(r.doc.state.player.mp,p.doc.state.player.mp-2);assert.equal(r.doc.state.inventory.item_charcoal.quantity,p.doc.state.inventory.item_charcoal.quantity-1);
 assert.equal(r.doc.state.player.coins,p.doc.state.player.coins);assert.equal(r.doc.state.minute,p.doc.state.minute+1);
 assert.deepEqual(r.doc.state.player.companions,[owner]);assert.deepEqual(r.doc.state.npcs[owner].inventory,p.doc.state.npcs[owner].inventory);
 assert.deepEqual(r.doc.state.records[r.result.movement].permissions,p.permits);assert.equal(r.doc.state.records[`known_anchor:${destination}`].permission,p.permits[1]);
});
test('许可撤销、过期、他人签发与无同行授权均原子拒绝',async()=>{
 const s=await fixture(),p=await s.prepared();
 const revoked=await s.run(p.doc,'world_promise',{operation:'revoke_access',promisor:owner,authorization:p.permits[0]},'revoke');
 await denied(s,revoked.doc,p.args,/有效许可/);
 for(const edit of [d=>d.state.records[p.permits[1]].expires=d.state.minute+1,d=>d.state.records[p.permits[1]].grantor='npc_hw_hezhou',d=>d.state.records[p.permits[1]].guests=[]]){const d=structuredClone(p.doc);edit(d);await denied(s,d,p.args,/有效许可/);}
 await assert.rejects(s.grant(p.doc,destination),/实际在场/);
});
test('私宅另需进入许可，司法羁押和空间封锁拒绝且不扣钱物',async()=>{
 const s=await fixture(),p=await s.prepared();
 s.world.locations.find(l=>l.id===to).access={mode:'private',requiresConsent:true,residents:[owner]};
 await denied(s,p.doc,p.args,/有效许可/);
 const home=structuredClone(p.doc);home.state.records.home={category:'authorization',action:'enter_home',subject:to,grantor:owner,grantee:'player',guests:[owner],revoked:false,expires:home.state.minute+100};
 const r=await s.cast(home,'teleport',destination,{authorizations:p.permits,authorization:'home'});assert.equal(r.doc.state.location,to);
 const legal=structuredClone(home);legal.state.records.custody={category:'legal_custody',status:'生效',location:from,expires:legal.state.minute+60};await denied(s,legal,{...p.args,authorization:'home'},/羁押/);
 s.world.locations.find(l=>l.id===to).access.spaceBlocked=true;await denied(s,home,{...p.args,authorization:'home'},/空间封锁/);
});
test('载荷、真实距离、未知同行位置、损坏与改属锚点拒绝',async()=>{
 const s=await fixture(),p=await s.prepared();
 const spell=s.world.spells.find(r=>r.id==='spell_move_teleport'),limit=spell.effectSpec.maxLoadKg;
 spell.effectSpec.maxLoadKg=1;await denied(s,p.doc,p.args,/载荷超额/);spell.effectSpec.maxLoadKg=limit;
 spell.effectSpec.maxDistanceMeters=.1;await denied(s,p.doc,p.args,/实际距离/);spell.effectSpec.maxDistanceMeters=100000;
 const cargo=structuredClone(p.doc);cargo.state.npcs[owner].inventory.item_iron={quantity:3000};await denied(s,cargo,p.args,/载荷超额/);
 spell.effectSpec.maxCompanions=0;await denied(s,p.doc,p.args,/同行人数超额/);spell.effectSpec.maxCompanions=2;
 const unknown=structuredClone(p.doc);delete unknown.state.records[`local_actor_position:${owner}`];await denied(s,unknown,p.args,/实际近端位置/);
 const dest=s.world.locations.find(l=>l.id===to).features.find(r=>r.id===destination);dest.state.anchorIntact=false;await denied(s,p.doc,p.args,/损坏/);dest.state.anchorIntact=true;dest.owner='npc_hw_hezhou';await denied(s,p.doc,p.args,/所属/);
});
test('短距折步在可见合法地形落地，墙体、未知落脚点和私有地形拒绝',async()=>{
 const s=await fixture({companions:false}),r=await s.cast(s.doc,'blink',landing);assert.equal(r.doc.state.location,from);assert.deepEqual(r.doc.state.records.local_player_position.point,[4,0]);assert.equal(r.result.metres,4);
 const place=s.world.locations.find(l=>l.id===from),row=place.features.find(r=>r.id===landing);
 row.state.blinkLanding=false;await denied(s,s.doc,{spell:'spell_move_blink',target:landing},/可用地形/);row.state.blinkLanding=true;
 row.access='private';await denied(s,s.doc,{spell:'spell_move_blink',target:landing},/所有者有效许可/);row.access='public';
 place.features.push({id:'feature_wall',position:[2,0],state:{blocksMovement:true,blockRadiusMeters:.5}});await denied(s,s.doc,{spell:'spell_move_blink',target:landing},/墙体/);
});
test('季节天气路线不可用与同行约定冲突保留路线边界',async()=>{
 const s=await fixture(),p=await s.prepared();
 const season=s.engine.calendar(p.doc.state.minute).season;
 for(const edge of s.world.routes)edge.closedSeasons=[season];await denied(s,p.doc,p.args,/可通行/);
 for(const edge of s.world.routes)edge.closedSeasons=[];
 const d=structuredClone(p.doc);d.state.obligations.lock={id:'lock',reservationVersion:1,type:'会面',status:'待履行',promisor:owner,promisee:'player',location:from,start:d.state.minute,deadline:d.state.minute+30,departures:{[owner]:d.state.minute,player:d.state.minute}};
 await denied(s,d,p.args,/时段冲突/);
});
test('完成时同行接触过期导致整个施法回滚，未制造远距坐标',async()=>{
 const s=await fixture(),p=await s.prepared(),success=await s.cast(p.doc,'teleport',destination,{authorizations:p.permits}),spell=s.world.spells.find(r=>r.id==='spell_move_teleport');spell.minutes=10;
 const before=structuredClone(p.doc);await assert.rejects(s.engine.reduce(p.doc,{tool:'world_cast',args:p.args,eventId:success.id}),/实际近端位置/);assert.deepEqual(p.doc,before);
});
test('同一施法事件去重，重启导入重放与删除回合恢复位移、许可和消耗',async t=>{
 const s=await fixture(),p=await s.prepared();let chosen;
 for(let i=0;i<100;i++){const input={tool:'world_cast',args:p.args,eventId:`stored-${i}`},out=await s.engine.reduce(p.doc,input);if(out.result.success){chosen={id:input.eventId,anchor:'jump',input};break;}}assert.ok(chosen);
 const directory=await fs.mkdtemp(path.join(tmpRoot(),'dnd-movement-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const reducer=s.engine.reduce.bind(s.engine),store=new CampaignStorage(directory,{reducer});await store.create({id:'movement',worldVersion:p.doc.worldVersion,document:p.doc});
 const spell=s.world.spells.find(r=>r.id==='spell_move_teleport');spell.minutes=10;
 await assert.rejects(store.transact('movement',chosen,reducer),/实际近端位置/);assert.deepEqual((await store.read('movement')).document,p.doc);assert.equal((await store.export('movement')).events.length,0);spell.minutes=1;
 await store.transact('movement',chosen,reducer);const moved=(await store.read('movement')).document;
 await store.transact('movement',chosen,reducer);assert.deepEqual((await store.read('movement')).document,moved);
 const reopened=new CampaignStorage(directory,{reducer});assert.deepEqual((await reopened.read('movement')).document,moved);
 const bundle=JSON.parse(JSON.stringify(await reopened.export('movement')));assert.deepEqual((await reopened.import(bundle,'copy')).document,moved);
 await reopened.transact('copy',chosen,reducer);assert.deepEqual((await reopened.read('copy')).document,moved);
 const bad=structuredClone(bundle);bad.events[0].result.destination=from;await assert.rejects(reopened.import(bad,'bad'),/校验|重放/);assert.deepEqual((await reopened.read('movement')).document,moved);
 await reopened.reconcile('movement',[],null);assert.deepEqual((await reopened.read('movement')).document,p.doc);
 assert.equal(digest(p.doc),digest((await reopened.read('movement')).document));
});
test('effectSpec拒绝无距离载荷代价、未知参数与持久位移标志',async()=>{
 const s=await fixture(),base=s.world.spells.find(r=>r.id==='spell_move_teleport');assert.deepEqual(validateMagicCatalog(base),[]);
 for(const mutate of [r=>delete r.effectSpec.maxDistanceMeters,r=>r.effectSpec.maxLoadKg=0,r=>r.effectSpec.maxCompanions=9,r=>r.effectSpec.freeDestination=true,r=>r.duration=10,r=>r.minutes=0,r=>delete r.targeting]){const r=structuredClone(base);mutate(r);assert.ok(validateMagicCatalog(r).length);}
});
