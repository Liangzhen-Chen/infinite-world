import test from'node:test';
import assert from'node:assert/strict';
import fs from'node:fs/promises';
import{tmpRoot}from'../tools/tmp-root.mjs';
import path from'node:path';
import {loadWorld}from'../tools/load-world.mjs';
import {WorldEngine}from'../server-plugin/engine.mjs';
import {applyPatches,CampaignStorage,digest}from'../server-plugin/storage.mjs';
import {ritualSpellCandidates,mechanismMap}from'../tools/w2-mechanism-map.mjs';
import {prepareMagic,applyMagic,validateMagicCatalog}from'../server-plugin/magic.mjs';
import {consumeMagicProtection}from'../server-plugin/magic-primitives.mjs';
import {prepareSummonWork}from'../server-plugin/magic-ritual.mjs';
import {recordLocalContact}from'../server-plugin/environment.mjs';
import {modelToolCall,toolDefinitions}from'../extension/tools.mjs';

const original=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const npc='npc_hw_linsui',altar='bld_hw_altar';
const mental=()=>({fatigue:0,stress:20,alertness:100,interference:[]});
const wound=()=>({id:'cut',depthMm:3,areaCm2:10,bleedingMlPerMinute:0,contamination:0,infectionRisk:0,simple:true,closed:false,toxinUg:0});
function fixture(){
 const world=structuredClone(original),candidates=ritualSpellCandidates();
 for(const n of world.npcs){n.tier='fixture';delete n.schedule;}
 delete world.rules.weather;delete world.rules.settlementTrade;delete world.rules.worldClock;
 // Controlled healing/work trials exclude disasters and faction trade.
 delete world.rules.hazardClock;delete world.rules.factionClock;
 for(const faction of world.factions)delete faction.clock;
 world.spells=world.spells.filter(s=>!candidates.some(c=>c.id===s.id));world.spells.push(...candidates);
 for(const c of candidates)if(!world.skills.some(s=>s.id===c.skill))world.skills.push({id:c.skill,name:c.skill,attribute:'精神',profession:null});
 world.npcs.find(n=>n.id===npc).combatProfession='profession_priest';
 const deity=world.deities.find(d=>d.id==='deity_lintel');
 const feature=(id,kind,state,extra={})=>({id,name:id,owner:'player',position:[0,0],kind,state,...extra});
 const rows=[
  feature('feature_dust','surface',{dustGrams:450,collectedDustGrams:0,heavyWasteGrams:1000}),
  feature('feature_dust_b','surface',{dustGrams:500,collectedDustGrams:0,heavyWasteGrams:0}),
  feature('feature_stones','silt_heap',{rubbleGrams:8000,capacityGrams:10000}),
  feature('feature_stones_b','silt_heap',{rubbleGrams:9000,capacityGrams:10000}),
  feature('feature_dest','silt_heap',{rubbleGrams:0,capacityGrams:20000}),
  feature('feature_paper','container',{contents:['paper_unit'],capacityKg:1}),
  feature('feature_paper_dest','container',{contents:[],capacityKg:1}),
  feature('feature_altar','altar',{deity:deity.id,church:deity.church.name,integrity:100,contamination:60,pollutionKind:'ordinary'},{owner:npc,revivalLocation:altar}),
 ];
 world.locations.find(l=>l.id===altar).features=rows;
 const engine=new WorldEngine(world),doc=engine.initialFromLegacy(seed,'ritual');
 doc.state.creatures={};
 for(const c of candidates){doc.state.spells[c.id]={source:{type:'fixture'}};doc.state.skills[c.skill]={proficiency:1000,daily:{},breakthroughs:[]};}
 doc.state.location=altar;doc.state.minute=20000;
 for(const row of Object.values(doc.state.records))if(Number.isSafeInteger(row.lastDay))row.lastDay=Math.floor(doc.state.minute/1440)-1;
 const faith={deity:deity.id,church:deity.church.name,taboo:deity.taboo,observedSince:0,lastBreach:-1};
 Object.assign(doc.state.player,{hp:40,maxHp:100,mp:100000,maxMp:100000,mental:mental(),faith:structuredClone(faith),companions:[],medical:{wounds:[wound()],bloodMl:5000,pain:3}});
 Object.assign(doc.state.npcs[npc],{location:altar,activity:'休息',hp:30,maxHp:100,mental:mental(),faith:structuredClone(faith),medical:{wounds:[wound()],bloodMl:5000,pain:3}});
 doc.state.professions.combat='profession_priest';
 for(const item of ['item_herb','item_resin'])doc.state.inventory[item]={quantity:100};
 doc.state.itemInstances.paper_unit={id:'paper_unit',item:'item_parchment',owner:'player',status:'袋内',container:'feature_paper',durability:100,maxDurability:100,source:'existing-note'};
 doc.state.records.ritual_permit={category:'authorization',action:'ritual_officiate',subject:'player',grantee:'player',grantor:npc,deity:deity.id,church:deity.church.name,profession:deity.church.profession,expires:1000000};
 for(const [id,action,subject,grantor]of [['altar_use','environment_use','feature_altar',npc],['healing','healing',npc,npc],['support','support_magic',npc,npc],['oath','ritual_oath',npc,npc],['mental','mental_magic',npc,npc]])doc.state.records[id]={category:'authorization',action,subject,grantor,grantee:'player',expires:1000000};
 doc.state.revivalPoints[altar]={location:altar,registeredAt:1,fee:10,source:'existing-registration'};
 const s={world,engine,doc,rows,candidates,deity,serial:0};contact(s,npc);return s;
}
function draft(s){return{document:s.doc,get:(...p)=>p.reduce((v,k)=>v?.[k],s.doc),set:(p,v)=>{let n=s.doc;for(const k of p.slice(0,-1))n=n[k]??={};n[p.at(-1)]=structuredClone(v);},remove:p=>{let n=s.doc;for(const k of p.slice(0,-1))n=n[k];delete n[p.at(-1)];},say:()=>{}};}
function contact(s,id){recordLocalContact(draft(s),s.engine,id,`contact-${++s.serial}`);}
function cat(s,op){return s.candidates.find(c=>(c.effectSpec.operation??c.mechanism)===op);}
function state(s,id){return s.doc.state.records[`physical_feature:${id}`]?.state??s.rows.find(r=>r.id===id).state;}
function change(s,id,extra){const r=s.rows.find(r=>r.id===id);draft(s).set(['state','records',`physical_feature:${id}`],{category:'physical_feature',id,location:altar,state:{...state(s,id),...extra}});}
function publicCall(tool,args){
 const call=modelToolCall(tool,args),schema=toolDefinitions().find(d=>d.function.name===call.tool).function.parameters;
 for(const key of schema.required??[])assert.notEqual(call.args[key],undefined,key);
 for(const [key,value]of Object.entries(call.args)){assert.ok(schema.properties[key],key);if(schema.properties[key].enum)assert.ok(schema.properties[key].enum.includes(value),key);}
 return call;
}
async function run(s,tool,args,eventId=`ritual-action-${++s.serial}`){const out=await s.engine.reduce(s.doc,{...publicCall(tool,args),eventId});s.doc=applyPatches(s.doc,out.patches);return out.result;}
async function cast(s,op,target,extra={}){
 const before=s.doc,c=cat(s,op),n=++s.serial;
 for(let i=0;i<100;i++){
  const eventId=`ritual-${n}-${op}-${i}`,out=await s.engine.reduce(before,{...publicCall('world_cast',{spell:c.id,target,permit:'ritual_permit',...extra}),eventId});
  if(out.result.checkSuccess&&out.result.effectFailed)assert.fail(out.result.effectFailed);
  if(out.result.success){s.doc=applyPatches(before,out.patches);return{...out.result,eventId};}
 }assert.fail(`未找到成功施法:${op}`);
}
async function denied(s,op,target,pattern,extra={}){
 const before=structuredClone(s.doc);await assert.rejects(s.engine.reduce(s.doc,{...publicCall('world_cast',{spell:cat(s,op).id,target,permit:'ritual_permit',...extra}),eventId:`denied-${++s.serial}`}),pattern);assert.deepEqual(s.doc,before);
}
function spirit(s,id,{nature='malevolent',rank=0,divine=false,realm='local',interference=false}={}){
 s.doc.state.creatures[id]={name:id,species:'monster_copper_moth',level:1,hp:20,maxHp:20,status:'正常',location:realm==='local'?altar:null,activity:'游荡',mental:mental(),spirit:{nature,rank,divine,realm,...(interference?{interference:{target:'player',remaining:20,stressPerMinute:1,settled:s.doc.state.minute}}:{})}};
 if(realm==='local')contact(s,id);return s.doc.state.creatures[id];
}

test('全部候选有真实处理器，正式目录未增加且机制图保留未发布状态',()=>{
 const s=fixture();assert.equal(s.candidates.length,19);
 for(const c of s.candidates){assert.deepEqual(validateMagicCatalog(c,{requireHandler:true}),[],c.id);const invalid=structuredClone(c);invalid.effectSpec.power=5001;assert.ok(validateMagicCatalog(invalid).length);}
 const map=mechanismMap(original);for(const c of s.candidates){const r=map.rows.find(r=>r.id===c.id);assert.equal(r.status,'consumer-ready');assert.deepEqual(r.validation,[]);}
 assert.equal(map.formalSpellCount,original.spells.length);
});
test('真实温顺趋光动物移动到施术者身旁，归属与种群不变',async()=>{
 const s=fixture(),id='monster_moth_real';s.doc.state.creatures[id]={name:'灯蛾',species:'monster_copper_moth',hp:5,maxHp:5,status:'正常',location:altar,position:[2,0],behavior:{phototaxis:true,hostile:false}};
 contact(s,id);const proof=s.doc.state.records[s.doc.state.records[`local_actor_position:${id}`].source];proof.point=[2,0];proof.visibleFrom=[0,0];s.doc.state.records[`local_actor_position:${id}`].point=[2,0];
 const result=await cast(s,'lure',id);assert.equal(result.guided,true);assert.deepEqual(s.doc.state.creatures[id].position,[0,0]);assert.equal(s.doc.state.creatures[id].owner,undefined);assert.equal(s.doc.state.pets[id],undefined);
 s.doc.state.creatures[id].owner=npc;await denied(s,'lure',id,/无主/);
});
test('清扫只转移浮尘，厚重垃圾保留，耗魔和契约维持真实发生',async()=>{
 const s=fixture(),before=s.doc.state.player.mp,r=await cast(s,'clean_servant','feature_dust');
 assert.equal(r.cleanedGrams,100);assert.equal(state(s,'feature_dust').dustGrams,350);assert.equal(state(s,'feature_dust').collectedDustGrams,100);assert.equal(state(s,'feature_dust').heavyWasteGrams,1000);
 assert.equal(s.doc.state.player.mp,before-cat(s,'clean_servant').mp);
 await run(s,'world_time',{minutes:5,activity:'等待'});assert.equal(s.doc.state.records[r.contract].paidUpkeep,1);
 s.doc.state.player.mp=0;await run(s,'world_time',{minutes:5,activity:'等待'});assert.equal(s.doc.state.effects[r.summon],undefined);assert.equal(s.doc.state.records[r.contract].status,'维持魔力不足');
});
test('碎石搬运有有限载重与源目的地守恒，超容量和无许可拒绝',async()=>{
 const s=fixture();await cast(s,'summon_earth','feature_stones',{destination:'feature_dest'});
 assert.equal(state(s,'feature_stones').rubbleGrams,6000);assert.equal(state(s,'feature_dest').rubbleGrams,2000);
 change(s,'feature_dest',{capacityGrams:2001});await denied(s,'summon_earth','feature_stones',/容量/,{destination:'feature_dest'});
 s.rows.find(r=>r.id==='feature_stones').owner=npc;await denied(s,'summon_earth','feature_stones',/授权/,{destination:'feature_dest'});
});
test('纸签由现有实例沿登记短路线运送，容器清单和单件归属同步',async()=>{
 const s=fixture(),before=Object.keys(s.doc.state.itemInstances).length;
 const r=await cast(s,'summon_air','feature_paper',{source:'paper_unit',destination:'feature_paper_dest',path:['feature_paper','feature_paper_dest']});
 assert.equal(r.paper,'paper_unit');assert.deepEqual(state(s,'feature_paper').contents,[]);assert.deepEqual(state(s,'feature_paper_dest').contents,['paper_unit']);assert.equal(s.doc.state.itemInstances.paper_unit.container,'feature_paper_dest');assert.equal(Object.keys(s.doc.state.itemInstances).length,before);
 await denied(s,'summon_air','feature_paper',/真实自有/,{source:'paper_unit',destination:'feature_paper_dest',path:['feature_paper','feature_paper_dest']});
});
test('纸签路线和负载都按实际对象检查',async()=>{
 const s=fixture(),c=cat(s,'summon_air'),args={target:'feature_paper',source:'paper_unit',destination:'feature_paper_dest',path:['feature_paper','feature_paper_dest']};
 s.rows.find(r=>r.id==='feature_paper_dest').position=[11,0];await denied(s,'summon_air',args.target,/射程|距离/,{...args});
 s.rows.find(r=>r.id==='feature_paper_dest').position=[0,0];s.world.items.find(i=>i.id==='item_parchment').weight=.2;
 assert.throws(()=>prepareSummonWork.call(s.engine,draft(s),c,args),/载重/);
});
test('役灵改派交换工序，协作使用原能力完成两项真实清扫',async()=>{
 const s=fixture(),a=await cast(s,'clean_servant','feature_dust'),b=await cast(s,'clean_servant','feature_dust_b'),terms=structuredClone(s.doc.state.effects[a.summon].terms);
 await cast(s,'reassign',a.summon,{source:b.summon});assert.equal(s.doc.state.effects[a.summon].assignment.target,'feature_dust_b');assert.deepEqual(s.doc.state.effects[a.summon].terms,terms);
 const r=await cast(s,'coordinate',a.summon,{source:b.summon});assert.equal(r.work.reduce((n,w)=>n+w.cleanedGrams,0),200);assert.equal(state(s,'feature_dust').dustGrams,250);assert.equal(state(s,'feature_dust_b').dustGrams,300);
 const c=await cast(s,'summon_earth','feature_stones',{destination:'feature_dest'});await denied(s,'reassign',a.summon,/根本契约/,{source:c.summon});
});
test('协作结束前过期或非本人契约均不搬物',async()=>{
 const s=fixture(),a=await cast(s,'summon_earth','feature_stones',{destination:'feature_dest'}),b=await cast(s,'summon_earth','feature_stones_b',{destination:'feature_dest'});
 const before=state(s,'feature_dest').rubbleGrams;
 s.doc.state.effects[a.summon].expires=s.doc.state.minute+1;await denied(s,'coordinate',a.summon,/时限/,{source:b.summon});assert.equal(state(s,'feature_dest').rubbleGrams,before);
 s.doc.state.effects[a.summon].expires=s.doc.state.minute+30;s.doc.state.effects[b.summon].owner=npc;await denied(s,'coordinate',a.summon,/自有/,{source:b.summon});
});
test('界门邀约对方拒绝或条款不同不迁移，接受须本人跨界许可',async()=>{
 const s=fixture(),id='monster_guest';spirit(s,id,{nature:'benign',realm:'other'}).spirit.invitation={willing:false,terms:'只来访五分钟',visitMinutes:5};
 let r=await cast(s,'invite',id,{text:'只来访五分钟'});assert.equal(r.accepted,false);assert.equal(s.doc.state.creatures[id].location,null);
 s.doc.state.creatures[id].spirit.invitation.willing=true;r=await cast(s,'invite',id,{text:'来做永久仆人'});assert.equal(r.accepted,false);
 await denied(s,'invite',id,/自愿授权/,{text:'只来访五分钟'});
 s.doc.state.records.visit={category:'authorization',action:'realm_visit',subject:id,grantor:id,grantee:'player',expires:1000000};
 r=await cast(s,'invite',id,{text:'只来访五分钟',authorization:'visit'});assert.equal(r.accepted,true);assert.equal(s.doc.state.creatures[id].location,altar);assert.equal(s.doc.state.creatures[id].owner,undefined);
 await run(s,'world_time',{minutes:5,activity:'等待'});assert.equal(s.doc.state.creatures[id].location,null);assert.equal(s.doc.state.creatures[id].spirit.realm,'other');
});
test('仪式资格核对正式神祇教派及职业，冒名、过期与撤销拒绝',async()=>{
 const s=fixture();s.doc.state.records.ritual_permit.church='不存在的教派';await denied(s,'clean_altar','feature_altar',/资格/,{authorization:'altar_use'});
 s.doc.state.records.ritual_permit.church=s.deity.church.name;s.doc.state.professions.combat='profession_monk';await denied(s,'clean_altar','feature_altar',/实际职业/,{authorization:'altar_use'});
 s.doc.state.professions.combat='profession_priest';s.doc.state.records.ritual_permit.revoked=true;await denied(s,'clean_altar','feature_altar',/资格/,{authorization:'altar_use'});
 s.doc.state.records.ritual_permit.revoked=false;s.doc.state.records.ritual_permit.expires=s.doc.state.minute+1;await denied(s,'clean_altar','feature_altar',/资格/,{authorization:'altar_use'});
});
test('受托净坛只减普通污染，所有者许可与教派不符时不写入',async()=>{
 const s=fixture();await denied(s,'clean_altar','feature_altar',/授权/);
 const r=await cast(s,'clean_altar','feature_altar',{authorization:'altar_use'});assert.equal(r.removed,60);assert.equal(state(s,'feature_altar').contamination,0);
 change(s,'feature_altar',{contamination:20,pollutionKind:'disputed'});await denied(s,'clean_altar','feature_altar',/普通污染/,{authorization:'altar_use'});
 change(s,'feature_altar',{pollutionKind:'ordinary',deity:'deity_bank'});await denied(s,'clean_altar','feature_altar',/本教派/,{authorization:'altar_use'});
});
test('自愿誓言成为具体原签契约，查验只给条款变化且需本教派授权',async()=>{
 const s=fixture();await denied(s,'witness_oath',npc,/授权/,{text:'明日归还工具'});
 const r=await cast(s,'witness_oath',npc,{text:'明日归还工具',authorization:'oath'}),row=s.doc.state.records[r.contract];
 assert.equal(row.subject,'明日归还工具');assert.equal(row.voluntary,true);assert.equal(row.enforcement,undefined);assert.deepEqual(row.parties,[npc]);
 await denied(s,'faith_contract',r.contract,/授权/);
 s.doc.state.records.contract_use={category:'authorization',action:'ritual_contract',subject:r.contract,grantor:'player',grantee:'player',expires:1000000};
 s.doc.state.records[r.contract].subject='后日归还工具';const trace=await cast(s,'faith_contract',r.contract,{authorization:'contract_use'});assert.equal(trace.changes[0].field,'subject');assert.equal(s.doc.state.records[r.contract].subject,'后日归还工具');
});
test('祷标绑定本人已登记完整祭坛，正常复活回执能辨认且不授予新复活权',async()=>{
 const s=fixture(),r=await cast(s,'revival_mark','feature_altar',{authorization:'altar_use'});assert.equal(r.revivalLocation,altar);
 s.doc.state.player.status='死亡';s.doc.state.player.hp=0;s.doc.state.player.revivalAnchor=altar;
 const out=await s.engine.reduce(s.doc,{tool:'revive',args:{},eventId:'revive-mark'});s.doc=applyPatches(s.doc,out.patches);const revived=out.result;assert.equal(revived.location,altar);assert.equal(revived.prayerMark.altar,'feature_altar');
 delete s.doc.state.revivalPoints[altar];await denied(s,'revival_mark','feature_altar',/已登记/,{authorization:'altar_use'});
});
test('祷标不会绕过损毁祭坛',async()=>{
 const s=fixture();await cast(s,'revival_mark','feature_altar',{authorization:'altar_use'});s.doc.state.buildings[altar]={condition:0};
 s.doc.state.player.status='死亡';s.doc.state.player.revivalAnchor=altar;
 await assert.rejects(s.engine.reduce(s.doc,{tool:'world_revive',args:{},eventId:'broken-revive'}),/已登记复活点/);
});
test('持续守戒防护实际吸收，破戒与撤销本人同意立刻失效',async()=>{
 const s=fixture(),r=await cast(s,'discipline',npc,{authorization:'support'});let hit=consumeMagicProtection(draft(s),npc,4,'physical');assert.equal(hit.absorbed,4);
 s.doc.state.npcs[npc].faith.lastBreach=s.doc.state.minute;hit=consumeMagicProtection(draft(s),npc,4,'physical');assert.equal(hit.absorbed,0);
 assert.equal(s.doc.state.effects[r.effect].remaining,6);contact(s,npc);await denied(s,'discipline',npc,/持续守戒/,{authorization:'support'});
 const t=fixture();await cast(t,'discipline',npc,{authorization:'support'});t.doc.state.records.support.revoked=true;assert.equal(consumeMagicProtection(draft(t),npc,4).absorbed,0);
});
test('共同护罩共享有限吸收池、付出疲劳并由正常时间推进终止',async()=>{
 const s=fixture(),r=await cast(s,'faith_shield',npc,{authorization:'support'});
 assert.equal(s.doc.state.player.mental.fatigue,10);assert.equal(s.doc.state.npcs[npc].mental.fatigue,10);
 assert.equal(consumeMagicProtection(draft(s),'player',12).absorbed,12);assert.equal(consumeMagicProtection(draft(s),npc,12).absorbed,8);assert.equal(s.doc.state.effects[r.effect].remaining,0);
 await run(s,'world_time',{minutes:80,activity:'等待'});assert.equal(s.doc.state.player.mental.fatigue,90);assert.equal(s.doc.state.effects[r.effect],undefined);
});
test('共同护罩参与者离场、失去信仰或拒绝均停止保护',async()=>{
 for(const change of ['leave','faith','revoke']){
  const s=fixture();await cast(s,'faith_shield',npc,{authorization:'support'});
  if(change==='leave')s.doc.state.npcs[npc].location='loc_hw';if(change==='faith')s.doc.state.npcs[npc].faith.church='other';if(change==='revoke')s.doc.state.records.support.revoked=true;
  assert.equal(consumeMagicProtection(draft(s),'player',5).absorbed,0,change);
 }
});
test('慰语降低有限压力并辨别实在灵体，不泄露私有记忆',async()=>{
 const s=fixture();spirit(s,'monster_benign',{nature:'benign'});spirit(s,'monster_divine',{divine:true});
 s.doc.state.npcs[npc].memoryStream=[{content:'secret_memory'}];const r=await cast(s,'spirit_sense',npc,{authorization:'mental'});
 assert.equal(s.doc.state.npcs[npc].mental.stress,19);assert.equal(r.spirits.length,2);assert.equal(r.spirits.find(x=>x.id==='monster_divine').divine,true);assert.ok(!JSON.stringify(r).includes('secret_memory'));
});
test('邪秽干扰通过正常时钟增加压力，护灯纹仅削弱有限额度',async()=>{
 const s=fixture();await cast(s,'ward','player');spirit(s,'monster_evil',{interference:true});
 const before=s.doc.state.player.mental.stress;await run(s,'world_time',{minutes:5,activity:'等待'});assert.equal(s.doc.state.player.mental.stress,before+2);
 await run(s,'world_time',{minutes:5,activity:'等待'});assert.equal(s.doc.state.player.mental.stress,before+7);assert.equal(s.doc.state.creatures.monster_evil.spirit.interference.remaining,10);
});
test('驱离与净化作用于有限低阶邪灵，神性拒绝，误认善灵留下真实损伤',async()=>{
 const s=fixture();spirit(s,'monster_evil');spirit(s,'monster_benign',{nature:'benign'});spirit(s,'monster_divine',{divine:true});
 await denied(s,'exorcise','monster_divine',/神性/);
 const harmed=await cast(s,'exorcise','monster_benign');assert.equal(harmed.misidentified,true);assert.equal(s.doc.state.creatures.monster_benign.hp,19);
 const expelled=await cast(s,'exorcise','monster_evil');assert.deepEqual(expelled.expelled,['monster_evil']);assert.equal(s.doc.state.creatures.monster_evil.location,null);
 spirit(s,'monster_evil2');const purified=await cast(s,'purify_area','player');assert.deepEqual(purified.expelled,['monster_evil2']);assert.equal(s.doc.state.creatures.monster_divine.location,altar);
});
test('教会仪式治疗实际浅伤、药材及生命，拒绝非信众、未止血或未同意',async()=>{
 const s=fixture(),before=s.doc.state.inventory.item_herb.quantity;
 await denied(s,'ritual_heal',npc,/授权/,{source:'cut'});
 const r=await cast(s,'ritual_heal',npc,{source:'cut',authorization:'healing'});assert.equal(r.healed,10);assert.equal(s.doc.state.npcs[npc].hp,40);assert.equal(s.doc.state.npcs[npc].medical.wounds[0].depthMm,2);assert.equal(s.doc.state.inventory.item_herb.quantity,before-1);
 s.doc.state.npcs[npc].faith.deity='deity_bank';contact(s,npc);await denied(s,'ritual_heal',npc,/信众/,{source:'cut',authorization:'healing'});
 s.doc.state.npcs[npc].faith.deity=s.deity.id;s.doc.state.npcs[npc].medical.wounds[0].bleedingMlPerMinute=1;await denied(s,'ritual_heal',npc,/已止血/,{source:'cut',authorization:'healing'});
});
test('长期恢复需要实际跨七天照护，改善伤势但保留司法记录',async()=>{
 const s=fixture();s.doc.state.records.crime={category:'crime',subject:'player',status:'未结案'};
 await denied(s,'restore','player',/真实长期照护/,{source:'cut'});
 s.doc.state.player.medical.care=[0,1440,10080].map(minute=>({wound:'cut',by:'player',completed:true,minute}));
 const r=await cast(s,'restore','player',{source:'cut'});assert.equal(r.healed,20);assert.equal(s.doc.state.player.medical.wounds[0].depthMm,1);assert.equal(s.doc.state.records.crime.status,'未结案');
});
test('正常治疗动作逐次产生照护来源，跨七天后能完成长期恢复',async()=>{
 const s=fixture();s.doc.state.player.medical.wounds[0].depthMm=5;
 const visits=[];visits.push(await cast(s,'ritual_heal','player',{source:'cut'}));
 await run(s,'world_time',{minutes:1440,activity:'等待'});visits.push(await cast(s,'ritual_heal','player',{source:'cut'}));
 await run(s,'world_time',{minutes:8640,activity:'等待'});visits.push(await cast(s,'ritual_heal','player',{source:'cut'}));
 assert.deepEqual(s.doc.state.player.medical.care.map(v=>v.source),visits.map(v=>v.eventId));
 const r=await cast(s,'restore','player',{source:'cut'});assert.equal(r.depthMm,0);assert.equal(s.doc.state.player.medical.wounds[0].closed,true);
});
test('共同护罩长短等待都在疲劳上限终止，过期同意只结算有效期间',async()=>{
 const a=fixture(),b=fixture();await cast(a,'faith_shield',npc,{authorization:'support'});await cast(b,'faith_shield',npc,{authorization:'support'});
 await run(a,'world_time',{minutes:120,activity:'等待'});await run(b,'world_time',{minutes:40,activity:'等待'});await run(b,'world_time',{minutes:80,activity:'等待'});
 assert.equal(a.doc.state.player.mental.fatigue,90);assert.equal(a.doc.state.player.mental.fatigue,b.doc.state.player.mental.fatigue);
 const s=fixture();s.doc.state.records.support.expires=s.doc.state.minute+12;const r=await cast(s,'faith_shield',npc,{authorization:'support'});
 await run(s,'world_time',{minutes:30,activity:'等待'});assert.equal(s.doc.state.player.mental.fatigue,20);assert.equal(s.doc.state.effects[r.effect],undefined);
});
test('工作授权覆盖完成瞬间即可，撤销后协作不会重复搬运',async()=>{
 const s=fixture();s.rows.find(r=>r.id==='feature_stones').owner=npc;
 s.doc.state.records.work={category:'authorization',action:'environment_use',subject:'feature_stones',grantor:npc,grantee:'player',expires:s.doc.state.minute+2};
 const r=await cast(s,'summon_earth','feature_stones',{destination:'feature_dest',authorization:'work'});assert.equal(r.carriedGrams,2000);
 const other=await cast(s,'summon_earth','feature_stones_b',{destination:'feature_dest'});s.doc.state.records.work.revoked=true;
 await denied(s,'coordinate',r.summon,/授权/,{source:other.summon});assert.equal(state(s,'feature_dest').rubbleGrams,4000);
});
test('祷标到期后仍可按原登记复活，回执不再带旧祷标',async()=>{
 const s=fixture();await cast(s,'revival_mark','feature_altar',{authorization:'altar_use'});
 await run(s,'world_time',{minutes:90,activity:'等待'});s.doc.state.player.status='死亡';s.doc.state.player.revivalAnchor=altar;
 const out=await s.engine.reduce(s.doc,{tool:'revive',args:{},eventId:'expired-mark'});assert.equal(out.result.location,altar);assert.equal(out.result.prayerMark,null);
});
test('正常伤害施法消耗共同防护池，而不是仅由独立原语验证',async()=>{
 const s=fixture(),model=s.world.spells.find(c=>c.stage===0),c={...model,id:'spell_ritual_hit',name:'仪式测试伤害',mechanism:'damage',skill:'skill_ritual_hit',mp:1,minutes:1,materials:[],duration:0,effectSpec:{kind:'damage',power:15,damageType:'physical',armorFactor:0}};
 s.world.spells.push(c);s.world.skills.push({id:c.skill,name:c.skill,attribute:'精神',profession:null});
 s.engine=new WorldEngine(s.world);s.doc.state.spells[c.id]={source:{type:'fixture'}};s.doc.state.skills[c.skill]={proficiency:1000,daily:{},breakthroughs:[]};s.candidates.push({...c,mechanism:'test_damage'});
 await cast(s,'faith_shield',npc,{authorization:'support'});const hp=s.doc.state.player.hp,r=await cast(s,'test_damage','player');assert.equal(r.absorbed,15);assert.equal(s.doc.state.player.hp,hp);
});
test('完成前授权撤销拒绝全部状态修改',()=>{
 const s=fixture(),d=draft(s),c=cat(s,'clean_altar'),p=prepareMagic.call(s.engine,d,c,{target:'feature_altar',authorization:'altar_use',permit:'ritual_permit'});
 s.doc.state.records.altar_use.revoked=true;const before=structuredClone(s.doc);assert.throws(()=>applyMagic.call(s.engine,d,p,'late-cast'),/授权/);assert.deepEqual(s.doc,before);
});
test('存档恢复与同一事件重放不重复清扫或扣魔力',async()=>{
 const s=fixture(),before=structuredClone(s.doc),dir=await fs.mkdtemp(path.join(tmpRoot(),'t89-')),reducer=(doc,input)=>s.engine.reduce(doc,input),storage=new CampaignStorage(dir,{reducer});
 try{
  await storage.create({id:'ritual',worldVersion:s.world.version,document:before});
  let chosen;for(let i=0;i<100;i++){const input={...publicCall('world_cast',{spell:cat(s,'clean_servant').id,target:'feature_dust'}),eventId:`persist-${i}`},out=await reducer(before,input);if(out.result.success){chosen=input;break;}}
  assert.ok(chosen);const request={id:chosen.eventId,anchor:'ritual',input:chosen};await storage.transact('ritual',request,reducer);
  const fresh=new CampaignStorage(dir,{reducer}),saved=(await fresh.read('ritual')).document;
  assert.equal(saved.state.records['physical_feature:feature_dust'].state.dustGrams,350);
  const repeated=await fresh.transact('ritual',request,reducer);assert.equal(repeated.duplicate,true);assert.equal(digest((await fresh.read('ritual')).document),digest(saved));assert.notEqual(digest(before),digest(saved));
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
