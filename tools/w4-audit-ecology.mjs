import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {loadWorld} from './load-world.mjs';
import {batchIds} from '../world/design/creatures-mixed.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches,digest} from '../server-plugin/storage.mjs';

export function auditPopulations(document,bones){
    const failures=[];
    for(const species of bones.monsters){
        const p=document.state.records[`ecology:${species.wildlife.habitat}`]?.populations[species.id];
        if(!p){failures.push({id:species.id,reason:'missing'});continue;}
        // T154: non-breeding species add by manifestation; migrants move between ranges.
        if(p.initial+p.born+(p.arisen??0)+(p.immigrated??0)-(p.emigrated??0)-p.predated-p.starved-p.withdrawn!==p.count)failures.push({id:species.id,reason:'conservation',population:p});
        if(!Number.isInteger(p.count)||p.count<=0||p.count>species.wildlife.capacity)failures.push({id:species.id,reason:'extinction or capacity',population:p});
    }
    return failures;
}
// RW-04 extends the same sample to every derived range and every resource ledger.
// Home-range survival and capacity assertions above remain unchanged.
function auditResourceConservation(document){
 const failures=[];
 for(const [key,r] of Object.entries(document.state.records)){
  if(r.category==='ecology')for(const [id,p] of Object.entries(r.populations)){
   if(!Number.isSafeInteger(p.count)||p.count<0||p.initial+p.born+(p.arisen??0)+(p.immigrated??0)-(p.emigrated??0)-p.predated-p.starved-p.withdrawn!==p.count)failures.push({id,habitat:r.habitat,reason:'all-range conservation',population:p});
  }
  if(r.category==='forest'&&(!Number.isSafeInteger(r.reserve)||r.reserve<0||r.initial+r.grown-r.harvested!==r.reserve))failures.push({id:key,reason:'forest conservation'});
  if(r.category==='water_cycle'&&(r.water.waterMl<0||r.water.waterMl>r.water.capacityMl||Math.abs(r.initial+r.rain+r.inflow+r.externalDelta-r.outflow-r.consumed-r.evaporated-r.overflow-r.water.waterMl)>0.001))failures.push({id:key,reason:'water conservation'});
 }
 return failures;
}
// Audits the formal catalog (every species with a primary habitat) and names
// the T154 batch explicitly, so newly published species cannot be skipped.
export async function auditEcology({seeds=20,months=36}={}){
    const world=await loadWorld(),engine=new WorldEngine(world),bones={monsters:world.monsters.filter(s=>s.wildlife)};
    const batch=batchIds.species.filter(id=>bones.monsters.some(s=>s.id===id)),held=batchIds.species.filter(id=>!batch.includes(id));
    const legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8')),runs=[];
    for(let seed=0;seed<seeds;seed++){
        let document=engine.createCharacter(legacy,{},`w4-ecology-${seed}`);const monthly=[],failures=[];
        for(let month=0;month<months;month++){
            const out=await engine.reduce(document,{tool:'world_time',args:{minutes:30*1440},eventId:`month-${month}`});
            document=applyPatches(document,out.patches);
            failures.push(...auditPopulations(document,bones).map(issue=>({...issue,month:month+1})));
            failures.push(...auditResourceConservation(document).map(issue=>({...issue,month:month+1})));
            monthly.push(Object.fromEntries(bones.monsters.map(s=>[s.id,document.state.records[`ecology:${s.wildlife.habitat}`].populations[s.id].count])));
        }
        runs.push({seed,ok:failures.length===0,failures,minimum:Math.min(...monthly.flatMap(m=>Object.values(m))),final:monthly.at(-1),batchMinimum:Object.fromEntries(batch.map(id=>[id,Math.min(...monthly.map(m=>m[id]))])),batchMaximum:Object.fromEntries(batch.map(id=>[id,Math.max(...monthly.map(m=>m[id]))]))});
    }
    const batchMinimum=Object.fromEntries(batch.map(id=>[id,Math.min(...runs.map(r=>r.batchMinimum[id]))]));
    return{ok:runs.every(r=>r.ok)&&batch.every(id=>batchMinimum[id]>0),catalogHash:digest(bones),species:bones.monsters.length,habitats:world.rules.wildlife.habitats.length,seeds,months,days:months*30,batch,held,batchMinimum,
        scope:`真实 world_time 日结；${seeds} 个确定性新战役种子各 ${months} 月，逐月核对正式全目录原生种群存续与容量、所有派生栖地种群及林木和流域水量守恒；不保证玩家过猎后复生。`,runs};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
    await fs.mkdir('world/drafts/w4',{recursive:true});
    const arg=name=>{const i=process.argv.indexOf(name);return i<0?undefined:Number(process.argv[i+1]);},seeds=arg('--seeds')??20,months=arg('--months')??36,out=seeds===20&&months===36?'world/drafts/w4/ecology.json':`world/drafts/w4/ecology-sample-s${seeds}.json`;
    try{const report=await auditEcology({seeds,months});await fs.writeFile(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({ok:report.ok,species:report.species,batch:report.batch.length,held:report.held,batchMinimum:report.batchMinimum,batchMaximum:Object.fromEntries(report.batch.map(id=>[id,Math.max(...report.runs.map(r=>r.batchMaximum[id]))])),days:report.days,seeds:report.seeds,failures:report.runs.filter(r=>!r.ok).map(r=>({seed:r.seed,failures:r.failures.slice(0,5)}))}));if(!report.ok)process.exitCode=1;}
    catch(error){await fs.writeFile(out,JSON.stringify({ok:false,error:error.message},null,2));process.exitCode=1;}
}
