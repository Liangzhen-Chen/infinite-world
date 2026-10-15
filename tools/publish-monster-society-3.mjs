// T162 publication: append approved content to source files. loadWorld adds
// D1 biomes and K8 derived habitats for consumers; those are not source rows.
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {loadWorld} from './load-world.mjs';
import {validateWorld} from './validate-world.mjs';
import {hashContent} from './content-pipeline.mjs';
import {buildBatch,applySpiritRules} from '../world/design/monster-society-3.mjs';

const same=(a,b)=>hashContent(a)===hashContent(b);
export const FILES=[['people/baseline.json','npcs'],['people/residents.json','residents'],['people/households.json','households'],['geo/settlements.json','settlementProfiles'],
 ['geo/locations.json','locations'],['geo/routes.json','routes'],['meta/bosses.json','bosses'],['lore/cultures.json','cultures'],['lore/factions.json','factions']];

function upsert(rows,adds,label){
 const out=structuredClone(rows),map=new Map(out.map((r,i)=>[r.id,i]));
 for(const row of adds){if(map.has(row.id)){if(!same(out[map.get(row.id)],row))throw Error(`正式条目冲突：${label} ${row.id}`);}else{out.push(structuredClone(row));map.set(row.id,out.length-1);}}
 return out;
}
export function batchIds(batch=buildBatch()){return new Set(FILES.flatMap(([,key])=>batch[key].map(r=>r.id)));}
export function mergeMonsterSociety3(world,batch){
 const next=structuredClone(world);
 for(const [,key] of FILES)next[key]=upsert(world[key]??[],batch[key],key);
 next.rules=applySpiritRules(next.rules);
 return next;
}
// The world as it was before this batch: used by tests to prove world_upgrade.
export function withoutMonsterSociety3(world,batch=buildBatch()){
 const ids=batchIds(batch),next=structuredClone(world);
 for(const [,key] of FILES)next[key]=(next[key]??[]).filter(r=>!ids.has(r.id));
 // Later rows that name this batch's rows (T105 social bosses on its sites, faction clocks' hooks)
 // did not exist before it either. T142's far lore is a separate later batch: see withoutT142.
 const gone=new Set(ids),names=row=>[...JSON.stringify(row).matchAll(/"([a-z]+_[a-z0-9_]+)"/g)].some(m=>m[1]!==row.id&&gone.has(m[1]));
 next.bosses=(next.bosses??[]).filter(r=>!names(r));
 // K6 effect-table hooks on a dropped faction's clock, or naming dropped rows, go with them.
 const table=next.rules?.effectTable,lostClocks=new Set((world.factions??[]).filter(f=>f.clock&&gone.has(f.id)).map(f=>f.clock.id));
 if(table?.hooks)table.hooks=table.hooks.filter(h=>!lostClocks.has(h.owner)&&!names({id:null,effects:h.effects}));
 const awakening=next.rules?.wildlifeAwakening;
 if(awakening){awakening.spiritLands=awakening.spiritLands.filter(r=>!ids.has(r.location));awakening.society.homes=awakening.society.homes.filter(id=>!ids.has(id));}
 return next;
}
async function writeLike(target,value){
 const old=await fs.readFile(target,'utf8'),crlf=old.includes('\r\n'),plain=crlf?old.replace(/\r\n/g,'\n'):old,pretty=/^[\[{]\n/.test(plain),trailing=plain.endsWith('\n');
 let text=JSON.stringify(value,null,pretty?2:undefined)+(trailing?'\n':'');if(crlf)text=text.replace(/\n/g,'\r\n');
 const temp=`${target}.${randomUUID()}.tmp`,handle=await fs.open(temp,'wx');try{await handle.writeFile(text);await handle.sync();}finally{await handle.close();}await fs.rename(temp,target);
}
export async function publishMonsterSociety3({root=path.resolve('world'),publish=false,batch}={}){
 if(!batch){const {readMonsterSociety3Publication}=await import('./monster-society-3-content.mjs');batch=await readMonsterSociety3Publication();}
 const world=await loadWorld(root),next=mergeMonsterSociety3(world,batch),validation=validateWorld(next,{stage:'release'});
 if(!validation.ok)throw Error(validation.errors.join('\n'));
 const writes=[];
 for(const [file,key]of FILES){const target=path.join(root,file),raw=JSON.parse(await fs.readFile(target,'utf8')),value=upsert(raw,batch[key],key);if(!same(raw,value))writes.push({file,target,value});}
 const target=path.join(root,'meta/rules.json'),raw=JSON.parse(await fs.readFile(target,'utf8')),value=applySpiritRules(raw);
 if(!same(raw,value))writes.push({file:'meta/rules.json',target,value});
 const changed=writes.map(w=>w.file);
 if(publish)for(const w of writes)await writeLike(w.target,w.value);
 return{published:publish,changed,batch:Object.fromEntries(FILES.map(([,key])=>[key,batch[key].map(r=>r.id)])),validation:{ok:validation.ok,errors:validation.errors}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename)){
 const result=await publishMonsterSociety3({publish:process.argv.includes('--publish')});console.log(JSON.stringify({published:result.published,changed:result.changed,ok:result.validation.ok}));
}
