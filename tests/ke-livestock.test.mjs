import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';
import {livestockValue} from '../server-plugin/market.mjs';
import {reconcile} from './helpers/ledger-audit.mjs';
import {resyncBooks} from './helpers/ledger-sync.mjs';

// Card E item 5: one's own livestock has a price derived from the species' body and produce, and can be sold;
// a head from a herd is led out first, so the herd account stays balanced.
const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const buyer='npc_hw_linsui';
function herd(species,count){
 const w=structuredClone(world);
 w.ecology.herds.push({id:'population_ke_player',name:'试验畜群',owner:'player',location:'bld_hw_qingdeng',species,count,capacity:count*4});
 const engine=new WorldEngine(w),out=applyIntentSetup(engine,engine.createCharacter(seed,{},'ke-livestock'),{minute:600,location:'bld_hw_qingdeng',present:[buyer]});
 assert.deepEqual(out.setupUnmet,[]);return {engine,doc:out.document};
}
const reader=doc=>({document:doc,get:(...p)=>p.reduce((v,k)=>v?.[k],doc)});
const flow=(doc,re)=>Object.entries(doc.ledger.flows).filter(([k])=>re.test(k)).reduce((n,[,v])=>n+v,0);

test('the price of a head follows its body and produce: a heavier species of the same kind is worth more',()=>{
 const {engine,doc}=herd('monster_bent_horn_goat',6);
 const goat=livestockValue(reader(doc),engine,{species:'monster_bent_horn_goat',location:'bld_hw_qingdeng'});
 const pheasant=livestockValue(reader(doc),engine,{species:'monster_oat_pheasant',location:'bld_hw_qingdeng'});
 assert.ok(goat.value>0&&pheasant.value>0);
 assert.ok(goat.carcass.length&&goat.products.some(p=>p.item==='item_goat_milk'),'goat value reads its carcass and its milk');
 assert.ok(pheasant.products.some(p=>p.item==='item_pheasant_egg'));
 assert.ok(goat.value>pheasant.value,'a goat outweighs a pheasant');
});

test('selling heads out of one\'s herd: buyer pays the derived price, the heads become the buyer\'s, the herd shrinks through individuation',async()=>{
 let {engine,doc}=herd('monster_bent_horn_goat',6);
 doc=applyPatches(doc,(await engine.reduce(doc,{tool:'world_time',args:{minutes:1},eventId:'open'})).patches);
 doc.state.npcs[buyer].coins=5000;resyncBooks(engine,doc);
 const before=doc.state.player.coins,value=livestockValue(reader(doc),engine,{species:'monster_bent_horn_goat',location:'bld_hw_qingdeng'}).value;
 const out=await engine.reduce(doc,{tool:'world_trade',args:{seller:'player',buyer,item:'population_ke_player',quantity:2},eventId:'sell-goats'});
 doc=applyPatches(doc,out.patches);
 assert.equal(out.result.quantity,2);assert.equal(out.result.cost,Math.trunc(value*2));
 assert.equal(doc.state.player.coins,before+out.result.cost);
 assert.equal(doc.state.records['husbandry:population_ke_player'].count,4);
 for(const id of out.result.heads)assert.equal(doc.state.creatures[id].owner,buyer);
 assert.equal(flow(doc,/^sink:individuated\|/),2);
 assert.deepEqual(reconcile(engine,doc).mismatches,[]);
 // Someone else's heads are still refused as theirs.
 await assert.rejects(engine.reduce(doc,{tool:'world_trade',args:{seller:'player',buyer,item:out.result.heads[0],quantity:1},eventId:'resell'}),/不属于你/);
});
