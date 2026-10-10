import fs from 'node:fs/promises';
import {loadWorld} from './load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches,digest} from '../server-plugin/storage.mjs';

const world=await loadWorld();if(!world.rules.agriculture)throw new Error('源农事规则尚未发布，不能把候选规则冒称源年度验收');
const option=(flag,fallback,max)=>{const i=process.argv.indexOf(flag),n=i<0?fallback:Number(process.argv[i+1]);if(!Number.isSafeInteger(n)||n<1||n>max)throw new Error(`${flag}参数越界`);return n;};
const count=option('--seeds',20,100),years=option('--years',3,10),engine=new WorldEngine(world),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const campaigns=[],failures=[];
function check(doc,initial,seed,month){
    for(const p of world.rules.agriculture.settlements){
        const s=doc.state.settlements[p.settlement],r=doc.state.records[`agriculture:${p.settlement}`],l=r.ledger;
        const input=l.openingFood+l.openingSeed+l.freshProduced+l.harvested+l.donated;
        const output=s.food+r.field.seedBank+l.eaten+l.spoiled+l.overflow+l.seedSpent+l.sold;
        for(const [condition,name]of [[input===output,'总粮账不守恒'],[r.batches.reduce((n,b)=>n+b.amount,0)===s.food,'食粮批次不一致'],
            [r.field.seedBatches.reduce((n,b)=>n+b.amount,0)===r.field.seedBank,'种粮批次不一致'],[s.food+r.field.seedBank<=r.granary.capacity,'仓容溢出'],
            [s.population===initial[p.settlement].population,'人口下降'],[(s.unmetMeals??0)===(initial[p.settlement].unmetMeals??0),'缺餐'],
            [l.openingFood===p.initialFood&&l.openingSeed===p.initialSeed,'开局资产被重复修改']])if(!condition)failures.push({seed,month,settlement:p.settlement,reason:name});
    }
}
for(let i=0;i<count;i++){
    const seed=`agriculture-year-${i}`;let document=engine.createCharacter(legacy,{},seed);const initial=structuredClone(document.state.settlements),months=[];
    for(let month=1;month<=years*12;month++){
        const out=await engine.reduce(document,{tool:'world_time',args:{minutes:30*1440},eventId:`audit_month_${month}`});document=applyPatches(document,out.patches);
        check(document,initial,seed,month);
        months.push({month,minute:document.state.minute,settlements:Object.fromEntries(world.rules.agriculture.settlements.map(p=>{
            const s=document.state.settlements[p.settlement],r=document.state.records[`agriculture:${p.settlement}`];
            return[p.settlement,{population:s.population,food:s.food,seed:r.field.seedBank,unmetMeals:s.unmetMeals??0,ledger:structuredClone(r.ledger)}];
        }))});
    }
    campaigns.push({seed,initial,final:document.state.settlements,finalAgriculture:Object.fromEntries(world.rules.agriculture.settlements.map(p=>[p.settlement,document.state.records[`agriculture:${p.settlement}`]])),months});
}
const report={ok:failures.length===0,sourceHash:digest(world),years,seeds:count,
    scope:'正式开发源正常createCharacter新战役，独立天气种子，逐月实际world_time；没有补粮或注入作物。旧存档缺粮未由此修复；不代表全部聚落、产业、周贸易或完整阶段2验收。',failures,campaigns};
await fs.writeFile('docs/测试报告/阶段2农业-三年粮食审查.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({ok:report.ok,sourceHash:report.sourceHash,seeds:count,years,failures:failures.length,
    first:campaigns[0].final.loc_hw,minimumMonthlyFood:Math.min(...campaigns.flatMap(c=>c.months.map(m=>m.settlements.loc_hw.food)))}));
if(!report.ok)process.exitCode=1;
