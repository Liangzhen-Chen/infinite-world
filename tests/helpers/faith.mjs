import fs from 'node:fs/promises';
import {loadWorld} from '../../tools/load-world.mjs';
import {WorldEngine} from '../../server-plugin/engine.mjs';
import {applyPatches} from '../../server-plugin/storage.mjs';
import {faithRules} from '../../world/design/rw07-faith.mjs';
export const original=await loadWorld(),seed=JSON.parse(await fs.readFile(new URL('../fixtures/legacy/seed.json',import.meta.url),'utf8'));
export const A='npc_hw_linsui',B='npc_hw_ayan',HOST='npc_bs_077_1',SEAT='bld_bs_reed_dao',T=`temple:${SEAT}:deity_bank`;
export function fixture(){
 const world=structuredClone(original);
 for(const n of world.npcs){delete n.schedule;n.tier='fixture';}
 for(const k of ['weather','settlementTrade','worldClock','hazardClock','factionClock','festival'])delete world.rules[k];
 for(const f of world.factions)delete f.clock;
 delete world.festivals;world.rules.faith={...structuredClone(original.rules.faith??faithRules),competition:false};
 const engine=new WorldEngine(world),doc=engine.createCharacter(seed,{},'faith-test');
 Object.assign(doc.state,{location:SEAT,minute:540});doc.state.creatures={};doc.state.player.coins=1000;
 for(const id of [A,B,HOST])Object.assign(doc.state.npcs[id],{location:SEAT,activity:'闲谈',status:'正常',coins:50});
 for(const id of ['item_ration','item_herb','item_resin'])doc.state.inventory[id]={quantity:50};
 const s={world,engine,doc,seq:0};
 s.run=async(args,{tool='world_settlement',id=`faith-${++s.seq}`}={})=>{
  const out=await engine.reduce(s.doc,{tool,args,eventId:id});s.doc=applyPatches(s.doc,out.patches);return out.result;
 };
 s.faith=(op,args={})=>s.run({operation:`faith_${op}`,org:T,...args});
 return s;
}
export function draft(s){return {get:(...p)=>p.reduce((o,k)=>o?.[k],s.doc),document:s.doc,set(p,v){s.doc=applyPatches(s.doc,[{op:'set',path:p,value:v}]);this.document=s.doc;},remove(p){s.doc=applyPatches(s.doc,[{op:'delete',path:p}]);this.document=s.doc;},say(){}};}
