import fs from 'node:fs/promises';
import {loadWorld} from './load-world.mjs';
import {withFarmPests} from '../world/design/farm-pests-foundation.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches,digest} from '../server-plugin/storage.mjs';
const world=withFarmPests(await loadWorld()),engine=new WorldEngine(world),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8')),runs=[];
for(let seed=0;seed<20;seed++){
    let c=engine.createCharacter(legacy,{},`farm-pests-food-${seed}`),minimumFood=c.state.settlements.loc_hw.food;const monthly=[];
    for(let month=0;month<36;month++){
        const out=await engine.reduce(c,{tool:'world_time',args:{minutes:30*1440},eventId:`month${month}`});c=applyPatches(c,out.patches);
        const r=c.state.records['agriculture:loc_hw'],s=c.state.settlements.loc_hw,l=r.ledger;
        const balanced=l.openingFood+l.openingSeed+l.freshProduced+l.harvested+l.donated===s.food+r.field.seedBank+l.eaten+l.spoiled+l.overflow+l.seedSpent+l.sold&&l.potentialHarvested===l.harvested+l.pestLost;
        minimumFood=Math.min(minimumFood,s.food);monthly.push({month:month+1,population:s.population,food:s.food,unmetMeals:s.unmetMeals??0,pestLost:l.pestLost,harvested:l.harvested,balanced});
    }
    const s=c.state.settlements.loc_hw;runs.push({seed,ok:s.population===58&&(s.unmetMeals??0)===0&&monthly.every(m=>m.balanced),minimumFood,final:s,monthly});
}
const report={ok:runs.every(r=>r.ok),sourceHash:digest(world),scope:'候选害兽规则20独立新战役各三年36次真实30天等待；不包括灭绝捕食者后的生存保证、全部贸易或玩家旧开局',runs};
await fs.writeFile('docs/测试报告/阶段2害兽-三年正常开局粮食审查.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({ok:report.ok,sourceHash:report.sourceHash,minimumFood:Math.min(...runs.map(r=>r.minimumFood)),failures:runs.filter(r=>!r.ok).map(r=>({seed:r.seed,final:r.final}))}));if(!report.ok)process.exitCode=1;
