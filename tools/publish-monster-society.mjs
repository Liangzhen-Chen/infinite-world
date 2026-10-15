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
 // Later content attached inside this batch's places (e.g. T113–T115 site attachments) cannot predate it.
 next.locations=next.locations.filter(l=>![l.site?.owner,l.site?.manager,...(l.site?.occupants??[]),...(l.site?.resources??[]).map(r=>r.owner)].some(id=>ids.has(id)));
 for(let size=-1;size!==next.locations.length;){size=next.locations.length;const have=new Set(next.locations.map(l=>l.id));next.locations=next.locations.filter(l=>!l.parent||have.has(l.parent));}
 const have=new Set(next.locations.map(l=>l.id));next.routes=next.routes.filter(r=>have.has(r.from)&&have.has(r.to));
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
