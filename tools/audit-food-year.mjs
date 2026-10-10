import fs from 'node:fs/promises';
import {loadWorld}from'./load-world.mjs';
import {WorldEngine}from'../server-plugin/engine.mjs';
import {applyPatches,digest}from'../server-plugin/storage.mjs';
import {cropProduction}from'../server-plugin/weather.mjs';

const world=await loadWorld(),engine=new WorldEngine(world),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
let document=engine.initialFromLegacy(legacy,'annual-food-audit');
const initial=structuredClone(document.state.settlements),months=[];
for(let month=0;month<12;month++){
    const before=structuredClone(document.state.settlements),day=Math.floor(document.state.minute/1440),produced={};
    for(const[id,row]of Object.entries(before))produced[id]=Array.from({length:30},(_,i)=>cropProduction(engine,document.randomSeed,id,(day+i)*1440,row.foodPerDay)).reduce((a,b)=>a+b,0);
    const output=await engine.reduce(document,{tool:'world_time',args:{minutes:30*1440},eventId:`annual_food_month_${month}`});
    document=applyPatches(document,output.patches);
    months.push({month:month+1,produced,before,after:structuredClone(document.state.settlements),messages:output.result.messages});
}
const final=document.state.settlements,failures=Object.keys(initial).filter(id=>final[id].population<initial[id].population||(final[id].unmetMeals??0)>(initial[id].unmetMeals??0));
const report={ok:failures.length===0,sourceHash:digest(world),seed:document.randomSeed,
    scope:'源规则加保存的旧开局聚落夹具，在隔离文档执行12次30天实际world_time；不修改玩家存档，不代表完整农事/贸易或新LOD0内容验收',
    initial,final,failures,months};
await fs.writeFile('docs/测试报告/阶段2天气-年度粮食审查.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({ok:report.ok,failures,initial,final}));if(!report.ok)process.exitCode=1;
