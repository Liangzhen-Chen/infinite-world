import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../../tools/load-world.mjs';
import {WorldEngine} from '../../server-plugin/engine.mjs';
import {applyPatches} from '../../server-plugin/storage.mjs';
import {createTransportAsset,nextTransportMinute,advanceTransport} from '../../server-plugin/transport.mjs';
import {applyIntentSetup} from '../../tools/a3-score.mjs';

const source=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
export const DRIVER='npc_hw_zhengshuisheng',SECOND='npc_hw_shendu',SENDER='npc_hw_linsui',RECIPIENT='npc_hw_hezhou';
export function fixture(){
 const w=structuredClone(source);for(const n of w.npcs){delete n.schedule;delete n.tier;}delete w.rules.weather;delete w.rules.hazardClock;w.rules.settlementTrade.lanes=[];
 w.routes=[{id:'transport-road',from:'loc_hw',to:'loc_bs',modes:['walk','cart','boat'],lengthKm:12,terrainMultiplier:1,toll:0,closedSeasons:[]},{id:'transport-road-2',from:'loc_bs',to:'loc_yp_path',modes:['walk','cart','boat'],lengthKm:12,terrainMultiplier:1,toll:0,closedSeasons:[]}];
 const e=new WorldEngine(w),doc=e.createCharacter(seed,{},'transport-test');doc.state.minute=600;doc.state.location='loc_hw';doc.state.player.coins=100000;
 for(const id of [DRIVER,SECOND,SENDER,RECIPIENT])Object.assign(doc.state.npcs[id],{location:'loc_hw',activity:'营业',status:'正常',coins:100000,inventory:{item_wood:{quantity:120},item_iron:{quantity:10},item_oats:{quantity:50}}});
 const d={document:doc,get(...p){return p.reduce((v,k)=>v?.[k],this.document);},set(p,value){this.document=applyPatches(this.document,[{op:'set',path:p,value}]);},remove(p){this.document=applyPatches(this.document,[{op:'delete',path:p}]);},say(){}};
 e.airDraft=d;return {w,e,d};
}
export function asset(d,e,owner=DRIVER,kind='cart',id='cart'){
 // D05 §5.1: the old capacity assertions require real draft animals. Declare
 // this unrelated premise through the native setup loader; keep all assertions.
 if(kind==='cart'){
  const location=owner==='player'?d.get('state','location'):d.get('state','npcs',owner,'location');
  const instances=Array.from({length:20},(_,i)=>({id:`draft:${id}:${i}`,template:'agent',kind:'creature',species:'monster_slate_horn_bull',location}));
  const out=applyIntentSetup(e,d.document,{instances,holdings:instances.map(r=>({id:`title:${r.id}`,kind:'tamed_by',holder:owner,subject:r.id}))});
  assert.deepEqual(out.setupUnmet,[]);d.document=out.document;
 }
 return createTransportAsset(d,e,{owner,kind,id},`build:${id}`).id;
}
export function finish(d,e,id){for(let i=0;i<100;i++){const row=d.get('state','records',id);if(row.status==='delivered')return row;const at=nextTransportMinute(d.get('state'),d.get('state','minute'));assert.ok(Number.isFinite(at));d.set(['state','minute'],at);advanceTransport(d,e,at);}throw Error('未抵达');}
