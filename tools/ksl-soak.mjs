// Card SL soak: a player household keeps goats and pheasants beside 谢堇家 for
// N days (default 3). Each day it shears what has grown, slaughters one head of
// each species (a goat carcass is ~22 kg: what the pack cannot take stays in
// the herd's store, counted as leftBehind), and once tries to slaughter the neighbour's goat
// (refused as theirs). Prints counts, parts by item, refusals, ledger audit.
// Usage: node tools/ksl-soak.mjs [--days 3]
import fs from 'node:fs/promises';
import {loadRuntimeWorld} from './load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {applyIntentSetup} from './a3-score.mjs';
import {reconcile} from '../tests/helpers/ledger-audit.mjs';

const days=Number(process.argv[process.argv.indexOf('--days')+1]||3)||3;
const world=await loadRuntimeWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const home='bld_hw_home_21',takes=world.husbandryTakes.takes;
for(const [id,species] of [['population_ksl_goats','monster_bent_horn_goat'],['population_ksl_birds','monster_oat_pheasant']])
 world.ecology.herds.push({id,name:'玩家试养群',owner:'player',location:home,species,count:40,capacity:120});
const engine=new WorldEngine(world);
let document=applyIntentSetup(engine,engine.createCharacter(seed,{},'ksl-soak'),{minute:1200,location:home,inventory:{item_kitchen_knife:1,item_leather_shears:1},abilities:{skills:{[takes.carcass.skill]:300}}}).document;
const tally={slaughter:0,slaughterFailed:0,shear:0,shearFailed:0,refusedTheft:0,leftBehind:{},parts:{},lost:{},hair:0,hairLost:0};
const add=(bag,rows)=>{for(const r of rows??[])bag[r.item]=(bag[r.item]??0)+r.quantity;};
async function act(args,eventId){
 try{const out=await engine.reduce(document,{tool:'world_farm',args,eventId});document=applyPatches(document,out.patches);return out.result;}
 catch(error){return {refused:error.message};}
}
for(let day=0;day<days;day++){
 for(const herd of ['population_ksl_goats','population_ksl_birds']){
  const row=document.state.records[`husbandry:${herd}`],coat=engine.byId.get(row.species).husbandry.yields.alive.find(r=>r.from==='coat');
  const grown=coat?Math.min(200,row.produce[coat.item]??0):0;
  if(grown){const r=await act({operation:'husbandry_collect',target:herd,item:coat.item,quantity:grown},`shear:${herd}:${day}`);
   if(r.refused)console.log('shear refused',herd,r.refused);
   else{tally.shear++;if(!r.success)tally.shearFailed++;tally.hair+=r.obtained.reduce((n,o)=>n+o.quantity,0);tally.hairLost+=(r.lost??[]).reduce((n,o)=>n+o.quantity,0);}}
  const r=await act({operation:'husbandry_slaughter',target:herd},`slaughter:${herd}:${day}`);
  if(!r.refused){tally.slaughter++;if(!r.success)tally.slaughterFailed++;add(tally.parts,r.obtained);add(tally.lost,r.lost);add(tally.leftBehind,r.leftBehind);}
  else console.log('refused own',herd,r.refused);
 }
 const theft=await act({operation:'husbandry_slaughter',target:'population_hw_home21_goats'},`theft:${day}`);
 if(theft.refused)tally.refusedTheft++;
 // The household brings in the day's feed just before the herds are settled; the
 // pack is otherwise kept free for what is taken (carcasses are heavy).
 const feed=Object.values(document.state.records).filter(r=>r.category==='husbandry'&&r.owner==='player').reduce((n,r)=>n+Math.ceil(r.count*engine.byId.get(r.species).husbandry.feed.perHead),0);
 document=applyIntentSetup(engine,document,{inventory:{item_oats:feed}}).document;
 const out=await engine.reduce(document,{tool:'world_time',args:{minutes:1440},eventId:`day:${day}`});document=applyPatches(document,out.patches);
}
const audit=reconcile(engine,document);
console.log(JSON.stringify({days,...tally,herds:Object.fromEntries(['population_ksl_goats','population_ksl_birds','population_hw_home21_goats'].map(h=>[h,document.state.records[`husbandry:${h}`]?.count])),ledgerMismatches:audit.mismatches.length},null,1));
if(audit.mismatches.length)process.exitCode=1;
