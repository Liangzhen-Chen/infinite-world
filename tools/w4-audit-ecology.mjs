import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {loadWorld} from './load-world.mjs';
import {highWildlifeFoundation,withHighWildlife} from '../world/design/high-wildlife-foundation.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches,digest} from '../server-plugin/storage.mjs';

export function auditPopulations(document,bones){
    const failures=[];
    for(const species of bones.monsters){
        const p=document.state.records[`ecology:${species.wildlife.habitat}`]?.populations[species.id];
        if(!p){failures.push({id:species.id,reason:'missing'});continue;}
        if(p.initial+p.born-p.predated-p.starved-p.withdrawn!==p.count)failures.push({id:species.id,reason:'conservation',population:p});
        if(!Number.isInteger(p.count)||p.count<=0||p.count>species.wildlife.capacity)failures.push({id:species.id,reason:'extinction or capacity',population:p});
    }
    return failures;
}
export async function auditEcology({seeds=20,months=36}={}){
    const bones=highWildlifeFoundation(),world=withHighWildlife(await loadWorld()),engine=new WorldEngine(world);
    const legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8')),runs=[];
    for(let seed=0;seed<seeds;seed++){
        let document=engine.createCharacter(legacy,{},`w4-ecology-${seed}`);const monthly=[],failures=[];
        for(let month=0;month<months;month++){
            const out=await engine.reduce(document,{tool:'world_time',args:{minutes:30*1440},eventId:`month-${month}`});
            document=applyPatches(document,out.patches);
            failures.push(...auditPopulations(document,bones).map(issue=>({...issue,month:month+1})));
            monthly.push(Object.fromEntries(bones.monsters.map(s=>[s.id,document.state.records[`ecology:${s.wildlife.habitat}`].populations[s.id].count])));
        }
        runs.push({seed,ok:failures.length===0,failures,minimum:Math.min(...monthly.flatMap(m=>Object.values(m))),final:monthly.at(-1)});
    }
    return{ok:runs.every(r=>r.ok),boneHash:digest(bones),species:bones.monsters.length,habitats:bones.locations.length,seeds,months,days:months*30,
        scope:'真实 world_time 日结；20 个确定性新战役种子各三年，逐月核对全部新物种存续、容量和数量守恒；不保证玩家过猎后复生。',runs};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
    await fs.mkdir('world/drafts/w4',{recursive:true});
    try{const report=await auditEcology();await fs.writeFile('world/drafts/w4/ecology.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({ok:report.ok,species:report.species,days:report.days,seeds:report.seeds,failures:report.runs.filter(r=>!r.ok)}));if(!report.ok)process.exitCode=1;}
    catch(error){await fs.writeFile('world/drafts/w4/ecology.json',JSON.stringify({ok:false,error:error.message},null,2));process.exitCode=1;}
}
