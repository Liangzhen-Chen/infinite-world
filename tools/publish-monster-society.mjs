// T157 publication: 炭阶地宫与苔灯坞. Reads the L1/L2/L4-approved drafts,
// assembles catalog rows and writes them into world/ only with --publish.
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {loadWorld} from './load-world.mjs';
import {validateWorld} from './validate-world.mjs';
import {hashContent} from './content-pipeline.mjs';
import {buildBatch} from '../world/design/monster-society-1.mjs';

const same=(a,b)=>hashContent(a)===hashContent(b);
export const FILES=[['people/baseline.json','npcs'],['people/residents.json','residents'],['people/households.json','households'],['geo/settlements.json','settlementProfiles'],
 ['geo/locations.json','locations'],['geo/routes.json','routes'],['meta/bosses.json','bosses'],['lore/cultures.json','cultures']];

function upsert(rows,adds,label){
 const out=structuredClone(rows),map=new Map(out.map((r,i)=>[r.id,i]));
 for(const row of adds){if(map.has(row.id)){if(!same(out[map.get(row.id)],row))throw Error(`正式条目冲突：${label} ${row.id}`);}else{out.push(structuredClone(row));map.set(row.id,out.length-1);}}
 return out;
}
export function batchIds(batch=buildBatch()){return new Set(FILES.flatMap(([,key])=>batch[key].map(r=>r.id)));}
export function mergeMonsterSociety(world,batch){
 const next=structuredClone(world);
 for(const [,key] of FILES)next[key]=upsert(world[key]??[],batch[key],key);
 return next;
}
// The world as it was before this batch: used by tests to prove world_upgrade.
export function withoutMonsterSociety(world,batch=buildBatch()){
 const ids=batchIds(batch),next=structuredClone(world);
 for(const [,key] of FILES)next[key]=(next[key]??[]).filter(r=>!ids.has(r.id));
 // Later rows that name this batch's rows (T105 social bosses on its sites, faction clocks' hooks)
 // did not exist before it either. T142's far lore is a separate later batch: see withoutT142.
 const gone=new Set(ids),names=row=>[...JSON.stringify(row).matchAll(/"([a-z]+_[a-z0-9_]+)"/g)].some(m=>m[1]!==row.id&&gone.has(m[1]));
 next.bosses=(next.bosses??[]).filter(r=>!names(r));
 // K6 effect-table hooks on a dropped faction's clock, or naming dropped rows, go with them.
 const table=next.rules?.effectTable,lostClocks=new Set((world.factions??[]).filter(f=>f.clock&&gone.has(f.id)).map(f=>f.clock.id));
 if(table?.hooks)table.hooks=table.hooks.filter(h=>!lostClocks.has(h.owner)&&!names({id:null,effects:h.effects}));
 return next;
}
async function writeLike(target,value){
 const old=await fs.readFile(target,'utf8'),crlf=old.includes('\r\n'),plain=crlf?old.replace(/\r\n/g,'\n'):old,pretty=/^[\[{]\n/.test(plain),trailing=plain.endsWith('\n');
 let text=JSON.stringify(value,null,pretty?2:undefined)+(trailing?'\n':'');if(crlf)text=text.replace(/\n/g,'\r\n');
 const temp=`${target}.${randomUUID()}.tmp`,handle=await fs.open(temp,'wx');try{await handle.writeFile(text);await handle.sync();}finally{await handle.close();}await fs.rename(temp,target);
}
export async function publishMonsterSociety({root=path.resolve('world'),publish=false,batch}={}){
 if(!batch){const {readMonsterSocietyPublication}=await import('./monster-society-content.mjs');batch=await readMonsterSocietyPublication();}
 const world=await loadWorld(root),next=mergeMonsterSociety(world,batch),validation=validateWorld(next,{stage:'release'});
 if(!validation.ok)throw Error(validation.errors.join('\n'));
 const changed=FILES.filter(([,key])=>!same(world[key],next[key])).map(([file])=>file);
 if(publish)for(const [file,key] of FILES)if(changed.includes(file))await writeLike(path.join(root,file),next[key]);
 return{published:publish,changed,batch:Object.fromEntries(FILES.map(([,key])=>[key,batch[key].map(r=>r.id)])),validation:{ok:validation.ok,errors:validation.errors}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename)){
 const result=await publishMonsterSociety({publish:process.argv.includes('--publish')});console.log(JSON.stringify({published:result.published,changed:result.changed,ok:result.validation.ok}));
}
