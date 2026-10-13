import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {loadWorld} from './load-world.mjs';
import {validateWorld} from './validate-world.mjs';
import {hashContent,readApprovedContent} from './content-pipeline.mjs';
import {entries,contextFor,revision,validateDraft} from './w4-b1-content.mjs';
import {bosses} from '../world/design/w4-b1.mjs';
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const same=(a,b)=>hashContent(a)===hashContent(b);
export async function readB1Publication(root=path.resolve('world/drafts/w4-b1')){
 const approved=await readApprovedContent(root,entries,{contextFor,revision});
 if(approved.length!==bosses.length)throw Error('12首领未完成审核');
 for(const e of entries){const v=validateDraft(approved.find(d=>d.id===e.id),e);if(v.errors.length)throw Error(`${e.id}: ${v.errors.join(';')}`);}
 const publication={bosses:bosses.map(b=>({...b,...approved.find(d=>d.id===b.id).prose}))};
 if(!same(await read(path.join(root,'candidate.json')),publication))throw Error('候选与已审核内容不符');
 const batch=await read(path.join(root,'batch-0.json')),wave=batch.l4.wave;
 if(!Array.isArray(wave)||wave.length!==10||new Set(wave.map(r=>r.id)).size!==10||wave.some(r=>!bosses.some(b=>b.id===r.id)||!Array.isArray(r.scores)||r.scores.length!==6||r.scores.some(n=>!Number.isInteger(n)||n<3||n>5)||typeof r.note!=='string'||!r.note.trim())||wave.flatMap(r=>r.scores).reduce((a,b)=>a+b,0)/60<4)throw Error('波次随机10条六项评分未达标');
 return publication;
}
export function mergeB1Publication(world,publication){
 const next=structuredClone(world),map=new Map(next.bosses.map(b=>[b.id,b]));
 for(const b of publication.bosses){if(map.has(b.id)&&!same(map.get(b.id),b))throw Error(`正式条目冲突：${b.id}`);map.set(b.id,structuredClone(b));}
 next.bosses=[...map.values()];return next;
}
export async function publishB1({root=path.resolve('world'),draftRoot=path.join(root,'drafts/w4-b1'),publish=false}={}){
 const world=await loadWorld(root),publication=await readB1Publication(draftRoot),next=mergeB1Publication(world,publication),validation=validateWorld(next);
 if(!validation.ok)throw Error(validation.errors.join('\n'));
 const file='meta/bosses.json',target=path.join(root,file),changed=same(world.bosses,next.bosses)?[]:[file];
 if(publish&&changed.length){const old=await fs.readFile(target,'utf8'),newline=old.includes('\r\n')?'\r\n':'\n',indent=old.includes('\n')?2:undefined,temp=`${target}.${randomUUID()}.tmp`,handle=await fs.open(temp,'wx');try{await handle.writeFile((JSON.stringify(next.bosses,null,indent)+'\n').replaceAll('\n',newline));await handle.sync();}finally{await handle.close();}await fs.rename(temp,target);}
 return {published:publish,changed,formalBossCount:next.bosses.length,batchBossIds:publication.bosses.map(b=>b.id),validation:{ok:validation.ok,errors:validation.errors}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename)){const i=process.argv.indexOf('--root');console.log(JSON.stringify(await publishB1({root:i<0?undefined:path.resolve(process.argv[i+1]),publish:process.argv.includes('--publish')})));}
