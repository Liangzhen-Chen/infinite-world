import fs from 'node:fs/promises';
import {loadWorld} from '../../tools/load-world.mjs';
import {WorldEngine} from '../../server-plugin/engine.mjs';
import {applyPatches} from '../../server-plugin/storage.mjs';
export const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
export function fixture(){
 const w=structuredClone(world),student='npc_hw_linsui',teacher='npc_hw_luqing';
 for(const id of [student,teacher]){const b=w.npcs.find(n=>n.id===id);b.home={location:'bld_hw_school'};b.schedule={default:[{start:0,end:1440,location:'bld_hw_school',activity:'清醒研习',services:['teach','trade']}]};}
 const e=new WorldEngine(w),doc=e.initialFromLegacy({state:seed.state,memories:seed.memories},'education');doc.state.minute=480;doc.state.location='bld_hw_school';doc.state.player.coins=2000;
 for(const id of [student,teacher])Object.assign(doc.state.npcs[id],{location:doc.state.location,status:'正常',activity:'清醒研习'});
 doc.state.npcs[student].skills={skill_literacy:0};
 return {w,e,doc,student,teacher};
}
export async function run(f,tool,args,id){const out=await f.e.reduce(f.doc,{tool,args,eventId:id});f.doc=applyPatches(f.doc,out.patches);return out.result;}
export const open=(f,extra={},id='open')=>run(f,'world_settlement',{operation:'school_open',plot:'skill_literacy',authority:f.teacher,beneficiaries:[f.student],due:600,minutes:120,days:10,consent:true,...(extra.coins?{budget:extra.coins}:{}),...(extra.wage?{proposedFee:extra.wage}:{})},id);
