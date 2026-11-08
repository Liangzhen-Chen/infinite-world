import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {loadWorld} from './load-world.mjs';
import {validateWorld} from './validate-world.mjs';
import {hashContent,readApprovedContent} from './content-pipeline.mjs';
import {entries,contextFor,revision,validateDraft,assemble,assertOnlySpeciesHeld} from './creatures-mixed-content.mjs';
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const same=(a,b)=>hashContent(a)===hashContent(b);
export async function readMixedPublication(root=path.resolve('world/drafts/creatures-mixed')){
 const approved=await readApprovedContent(root,entries,{contextFor,revision});
 assertOnlySpeciesHeld(approved);
 for(const e of entries.filter(e=>approved.some(d=>d.id===e.id))){const v=validateDraft(approved.find(d=>d.id===e.id),e);if(v.errors.length)throw Error(`${e.id}: ${v.errors.join(';')}`);}
 const publication=assemble(approved);
 if(!same(await read(path.join(root,'candidate.json')),publication))throw Error('候选与已审核内容不符');
 const wave=(await read(path.join(root,'batch-0.json'))).l4.wave,ids=new Set(entries.map(e=>e.id));
 if(!Array.isArray(wave)||wave.length!==10||new Set(wave.map(r=>r.id)).size!==10||wave.some(r=>!ids.has(r.id)||!Array.isArray(r.scores)||r.scores.length!==6||r.scores.some(n=>!Number.isInteger(n)||n<3||n>5)||typeof r.note!=='string'||!r.note.trim())||wave.flatMap(r=>r.scores).reduce((a,b)=>a+b,0)/60<4)throw Error('波次随机10条六项评分未达标');
 return publication;
}
// 物种代谢系数 nature.metabolism 同样是后补的结构化字段，登记在正式目录里；本批骨架不含它时不算冲突。
// K1在本批之后给正式物种补了性状标签tags：正式条目只多出本批没有的这类后补字段时仍视为同一条，其余字段不同照旧冲突。
const without=(row,keys)=>Object.fromEntries(Object.entries(row).filter(([k])=>!keys.includes(k)));
function upsert(rows,adds,label,later=[],laterNature=[]){
 const out=structuredClone(rows),map=new Map(out.map((r,i)=>[r.id,i]));
 for(const row of adds){if(map.has(row.id)){const old=without(out[map.get(row.id)],later.filter(k=>!Object.hasOwn(row,k)));if(old.nature&&laterNature.length)old.nature=without(old.nature,laterNature.filter(k=>!Object.hasOwn(row.nature??{},k)));if(!same(old,row))throw Error(`正式条目冲突：${label} ${row.id}`);}else{out.push(structuredClone(row));map.set(row.id,out.length-1);}}
 return out;
}
export function mergeMixedPublication(world,p){
 const next=structuredClone(world);
 next.monsters=upsert(world.monsters,p.monsters,'monsters',['tags'],['metabolism']);if(p.held.some(id=>next.monsters.some(m=>m.id===id)))throw Error('未过审核的物种已出现在正式目录');next.items=upsert(world.items,p.items,'items');
 next.locations=upsert(world.locations,p.locations,'locations');next.routes=upsert(world.routes,p.routes,'routes');
 next.rules.wildlife.habitats=upsert(world.rules.wildlife.habitats,p.habitats,'habitats');
 return next;
}
async function writeLike(target,value){
 const old=await fs.readFile(target,'utf8'),crlf=old.includes('\r\n'),plain=crlf?old.replace(/\r\n/g,'\n'):old,pretty=/^[\[{]\n/.test(plain),trailing=plain.endsWith('\n');
 let text=JSON.stringify(value,null,pretty?2:undefined)+(trailing?'\n':'');if(crlf)text=text.replace(/\n/g,'\r\n');
 const temp=`${target}.${randomUUID()}.tmp`,handle=await fs.open(temp,'wx');try{await handle.writeFile(text);await handle.sync();}finally{await handle.close();}await fs.rename(temp,target);
}
export async function publishMixed({root=path.resolve('world'),draftRoot=path.join(root,'drafts/creatures-mixed'),publish=false}={}){
 const world=await loadWorld(root),publication=await readMixedPublication(draftRoot),next=mergeMixedPublication(world,publication),validation=validateWorld(next);
 if(!validation.ok)throw Error(validation.errors.join('\n'));
 // loadWorld merges geo/biomes.json into locations. Keep that source split
 // when writing, so the published world can be loaded again without duplicates.
 const authored=new Map((await read(path.join(root,'geo/locations.json'))).map(row=>[row.id,row]));
 const locations=w=>w.locations.map(row=>{
  const out={...row},original=authored.get(row.id);
  for(const key of ['biome','areaKm2'])if(original&&!Object.hasOwn(original,key))delete out[key];
  return out;
 });
 const files=[['meta/monsters.json',w=>w.monsters],['meta/items.json',w=>w.items],['geo/locations.json',locations],['geo/routes.json',w=>w.routes],['meta/rules.json',w=>w.rules]];
 const changed=files.filter(([,pick])=>!same(pick(world),pick(next))).map(([file])=>file);
 if(publish)for(const [file,pick] of files)if(changed.includes(file))await writeLike(path.join(root,file),pick(next));
 return {published:publish,changed,batch:{monsters:publication.monsters.map(m=>m.id),held:publication.held,items:publication.items.map(i=>i.id),locations:publication.locations.map(l=>l.id),habitats:publication.habitats.map(h=>h.id)},formalMonsterCount:next.monsters.length,validation:{ok:validation.ok,errors:validation.errors}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename)){const i=process.argv.indexOf('--root');console.log(JSON.stringify(await publishMixed({root:i<0?undefined:path.resolve(process.argv[i+1]),publish:process.argv.includes('--publish')})));}
