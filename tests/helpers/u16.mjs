import fs from 'node:fs/promises';
import {loadWorld} from '../../tools/load-world.mjs';
import {WorldEngine} from '../../server-plugin/engine.mjs';
import {applyPatches} from '../../server-plugin/storage.mjs';
import {ensureArmies,createArmy} from '../../server-plugin/military.mjs';
import {adjustStanding} from '../../server-plugin/standing.mjs';
export const source=await loadWorld(),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8')),DAY=1440,county='county_xichui_longqu',village='loc_bs_yupo';
export function setup(){
 const world=structuredClone(source);for(const n of world.npcs){delete n.schedule;delete n.tier;}
 const e=new WorldEngine(world),document=e.createCharacter(legacy,{},'u16-test');document.state.minute=100*DAY+540;document.state.player.coins=50000;
 const d={document,patches:[],get(...p){return p.reduce((v,k)=>v?.[k],this.document);},set(path,value){const patch={op:'set',path,value};this.document=applyPatches(this.document,[patch]);this.patches.push(patch);},remove(path){const patch={op:'delete',path};this.document=applyPatches(this.document,[patch]);this.patches.push(patch);},say(){}};
 e.airDraft=d;ensureArmies(d,e,0);return {e,d,world};
}
export function office(d,holder='player',settlement=village,extra={}){
 const id=`governance_office:${settlement}:office_village_head:${holder}`;
 const r={category:'governance_office',id,holder,settlement,office:'office_village_head',status:'在任',since:0,until:800*DAY,nextReview:130*DAY,reviews:[90*DAY],...extra};d.set(['state','records',id],r);return r;
}
export function noble(d,holder='player',domains=[county],title='伯爵'){
 const def=source.rules.governance.authority.titles.find(t=>t.name===title),r={category:'title',id:`title:${holder}`,holder,title,rank:'三等',fief:domains[0],domains,status:'受封',grantedAt:0,nextIncome:130*DAY,incomeMark:0,levy:{...def.levy,due:360*DAY,served:0,attended:false},breaches:0};d.set(['state','records',r.id],r);return r;
}
export function prepareNation(e,d,holder='player'){
 noble(d,holder);d.set(['state','settlements','loc_bs','population'],0);d.set(['state','settlements','loc_bs_yupo','population'],600);d.set(['state','settlements','loc_bs_weiting','population'],600);
 if(holder!=='player')d.set(['state','npcs',holder,'coins'],50000);
 createArmy(d,e,{id:'army_u16_private',name:'领地卫队',party:holder,base:village,location:village,supply:'purchase',regular:120,training:50,morale:70,payCopperMonth:0},d.get('state','minute'),'fixture');
 const factions=e.world.factions.filter(f=>f.leader!==holder&&!f.members?.includes(holder)).slice(0,2).map(f=>f.id);
 for(const f of factions)adjustStanding(d,e,f,holder,60,{sourceEvent:'fixture',minute:d.get('state','minute')});
 return factions;
}
