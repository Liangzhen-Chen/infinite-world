// 卡 W1：仪式治疗的药材按 medicine 类判断，不认 item_herb 这一个 id。
// 夹具照 magic-ritual.test.mjs 的教会仪式夹具（同一祭坛、同一授权），只把目录里的药材换成别的物品。
import test from'node:test';
import assert from'node:assert/strict';
import fs from'node:fs/promises';
import {loadWorld}from'../tools/load-world.mjs';
import {WorldEngine}from'../server-plugin/engine.mjs';
import {applyPatches}from'../server-plugin/storage.mjs';
import {ritualSpellCandidates}from'../tools/w2-mechanism-map.mjs';
import {recordLocalContact}from'../server-plugin/environment.mjs';
import {isItemClass}from'../server-plugin/item-class.mjs';

const original=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const npc='npc_hw_linsui',altar='bld_hw_altar';
const mental=()=>({fatigue:0,stress:20,alertness:100,interference:[]});
const wound=()=>({id:'cut',depthMm:3,areaCm2:10,bleedingMlPerMinute:0,contamination:0,infectionRisk:0,simple:true,closed:false,toxinUg:0});
function fixture(material){
 const world=structuredClone(original),candidates=ritualSpellCandidates();
 for(const n of world.npcs){n.tier='fixture';delete n.schedule;}
 delete world.rules.weather;delete world.rules.settlementTrade;delete world.rules.worldClock;delete world.rules.hazardClock;delete world.rules.factionClock;
 for(const faction of world.factions)delete faction.clock;
 const heal=candidates.find(c=>c.effectSpec.operation==='ritual_heal');
 heal.materials=heal.materials.map(m=>m.item==='item_herb'?{...m,item:material}:m);
 world.spells=world.spells.filter(s=>!candidates.some(c=>c.id===s.id));world.spells.push(...candidates);
 for(const c of candidates)if(!world.skills.some(s=>s.id===c.skill))world.skills.push({id:c.skill,name:c.skill,attribute:'精神',profession:null});
 world.npcs.find(n=>n.id===npc).combatProfession='profession_priest';
 const deity=world.deities.find(d=>d.id==='deity_lintel');
 world.locations.find(l=>l.id===altar).features=[{id:'feature_altar',name:'feature_altar',owner:npc,position:[0,0],kind:'altar',revivalLocation:altar,
  state:{deity:deity.id,church:deity.church.name,integrity:100,contamination:60,pollutionKind:'ordinary'}}];
 const engine=new WorldEngine(world),doc=engine.initialFromLegacy(seed,'kw1-ritual');
 doc.state.creatures={};
 for(const c of candidates){doc.state.spells[c.id]={source:{type:'fixture'}};doc.state.skills[c.skill]={proficiency:1000,daily:{},breakthroughs:[]};}
 doc.state.location=altar;doc.state.minute=20000;
 for(const row of Object.values(doc.state.records))if(Number.isSafeInteger(row.lastDay))row.lastDay=Math.floor(doc.state.minute/1440)-1;
 const faith={deity:deity.id,church:deity.church.name,taboo:deity.taboo,observedSince:0,lastBreach:-1};
 Object.assign(doc.state.player,{hp:40,maxHp:100,mp:100000,maxMp:100000,mental:mental(),faith:structuredClone(faith),companions:[],medical:{wounds:[wound()],bloodMl:5000,pain:3}});
 Object.assign(doc.state.npcs[npc],{location:altar,activity:'休息',hp:30,maxHp:100,mental:mental(),faith:structuredClone(faith),medical:{wounds:[wound()],bloodMl:5000,pain:3}});
 doc.state.professions.combat='profession_priest';
 for(const item of [material,'item_resin'])doc.state.inventory[item]={quantity:100};
 doc.state.records.ritual_permit={category:'authorization',action:'ritual_officiate',subject:'player',grantee:'player',grantor:npc,deity:deity.id,church:deity.church.name,profession:deity.church.profession,expires:1000000};
 for(const [id,action,subject]of [['altar_use','environment_use','feature_altar'],['healing','healing',npc]])doc.state.records[id]={category:'authorization',action,subject,grantor:npc,grantee:'player',expires:1000000};
 const d={document:doc,get:(...p)=>p.reduce((v,k)=>v?.[k],doc),set:(p,v)=>{let n=doc;for(const k of p.slice(0,-1))n=n[k]??={};n[p.at(-1)]=structuredClone(v);},remove:p=>{let n=doc;for(const k of p.slice(0,-1))n=n[k];delete n[p.at(-1)];},say:()=>{}};
 recordLocalContact(d,engine,npc,'contact-1');
 return {engine,doc,spell:heal.id};
}
const args=s=>({spell:s.spell,target:npc,permit:'ritual_permit',source:'cut',authorization:'healing'});

test('仪式治疗：目录药材换成别的药性物品（medicine 类）照样施行并耗掉它',async()=>{
 const material=original.items.find(i=>i.id!=='item_herb'&&isItemClass({world:original},i.id,'medicine')).id;
 const s=fixture(material);let done=null;
 for(let i=0;i<100&&!done;i++){const out=await s.engine.reduce(s.doc,{tool:'world_cast',args:args(s),eventId:`kw1-heal-${i}`});if(out.result.success)done=applyPatches(s.doc,out.patches);}
 assert.ok(done,'施行成功');
 assert.equal(done.state.inventory[material].quantity,99);
});

test('仪式治疗：目录材料不是药（盐）时，施行被拒，世界内原因是缺真实药材',async()=>{
 const s=fixture('item_salt');
 await assert.rejects(s.engine.reduce(s.doc,{tool:'world_cast',args:args(s),eventId:'kw1-heal-salt'}),/真实药材/);
});
