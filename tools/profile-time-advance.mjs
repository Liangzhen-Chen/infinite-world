// One seed only; optionally collect a V8 profile with:
// node --cpu-prof --cpu-prof-dir=logs tools/profile-time-advance.mjs 1
import fs from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {loadWorld} from './load-world.mjs';
import {withAgricultureRules} from '../world/design/agriculture-foundation.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches,digest} from '../server-plugin/storage.mjs';

const months=Number(process.argv[2]??1);
if(!Number.isInteger(months)||months<1||months>12)throw Error('月份必须为1至12；只运行一个种子');
const world=withAgricultureRules(await loadWorld()),engine=new WorldEngine(world);
const legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
let document=engine.createCharacter(legacy,{},'agriculture-year-0');
const start=performance.now(),elapsed=[];
for(let month=0;month<months;month++){
 const begin=performance.now(),out=await engine.reduce(document,{tool:'world_time',args:{minutes:30*1440},eventId:`profile_month_${month}`});
 elapsed.push(performance.now()-begin);document=applyPatches(document,out.patches);
}
console.log(JSON.stringify({seed:document.randomSeed,months,npcs:world.npcs.length,elapsedMs:performance.now()-start,
 monthlyReduceMs:elapsed,documentDigest:digest(document),population:document.state.settlements.loc_hw.population,
 unmetMeals:document.state.settlements.loc_hw.unmetMeals??0},null,2));
