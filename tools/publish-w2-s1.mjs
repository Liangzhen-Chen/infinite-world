import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {loadWorld} from './load-world.mjs';
import {validateWorld} from './validate-world.mjs';
import {hashContent,readApprovedContent} from './content-pipeline.mjs';
import {entries,contextFor,revision,validateDraft} from './w2-s1-content.mjs';
import {spells,books,sources,placements,channelFacts} from '../world/design/w2-s1.mjs';
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const same=(a,b)=>hashContent(a)===hashContent(b);
function mergeRows(old,added,skillRoutes=false){const map=new Map(old.map(r=>[r.id,r]));for(const r of added){
 const prior=map.get(r.id);
 if(prior&&skillRoutes&&Array.isArray(prior.learningProfessions)){
  const {learningProfessions,...reviewed}=prior;
  if(!same(reviewed,r))throw Error(`正式条目冲突：${r.id}`);
  continue; // Keep the separately reviewed later teaching routes.
 }
 if(prior&&!same(prior,r))throw Error(`正式条目冲突：${r.id}`);map.set(r.id,structuredClone(r));
 }return [...map.values()];}
export async function readS1Publication(root=path.resolve('world/drafts/w2-s1')){
 const approved=await readApprovedContent(root,entries,{contextFor,revision});
 if(approved.length!==36)throw Error('30法术、6本书与全部学习来源未完成审核');
 for(const e of entries){const v=validateDraft(approved.find(d=>d.id===e.id),e);if(v.errors.length)throw Error(`${e.id}: ${v.errors.join(';')}`);}
 const publication={spells:spells.map(s=>({...s,...approved.find(d=>d.id===s.id).prose})),items:books.map(b=>({...b,...approved.find(d=>d.id===b.id).prose})),sources:structuredClone(sources)};
 if(!same(await read(path.join(root,'candidate.json')),publication))throw Error('候选与已审核内容不符');
 const batch=await read(path.join(root,'batch-0.json'));
 const wave=batch.l4.wave;
 if(!Array.isArray(wave)||wave.length!==10||new Set(wave.map(r=>r.id)).size!==10||wave.some(r=>!spells.some(s=>s.id===r.id)||!Array.isArray(r.scores)||r.scores.length!==6||r.scores.some(n=>!Number.isInteger(n)||n<3||n>5)||typeof r.note!=='string'||!r.note.trim())||wave.flatMap(r=>r.scores).reduce((a,b)=>a+b,0)/60<4)throw Error('波次随机10条六项评分未达标');
 return publication;
}
export function mergeS1Publication(world,publication){
 const next=structuredClone(world);
 if(next.rules.npcStockUpdateVersion!==1)throw Error('已有逐键库存升级机制未启用');
 next.spells=mergeRows(next.spells,publication.spells);next.skills=mergeRows(next.skills,publication.sources.mappings.map(m=>m.skill),true);next.items=mergeRows(next.items,publication.items);
 for(const {item,stock} of publication.sources.books){const seller=next.npcs.find(n=>n.id===stock.owner);if(!seller)throw Error('书商不存在');seller.inventory??={};if(!Object.hasOwn(seller.inventory,item.id))seller.inventory[item.id]=stock.quantity;}
 for(const [location,rows] of Object.entries(placements)){const place=next.locations.find(l=>l.id===location);if(!place)throw Error(`地点不存在：${location}`);place.features=mergeRows(place.features??[],rows);}
 const channel=next.locations.flatMap(l=>l.features??[]).find(f=>f.id==='feature_hw_channel');if(!channel)throw Error('现有沟渠不存在');
 for(const [key,value]of Object.entries(channelFacts)){if(Object.hasOwn(channel.state,key)&&channel.state[key]!==value)throw Error(`现有沟渠读值冲突：${key}`);channel.state[key]=value;}
 return next;
}
export async function publishS1({root=path.resolve('world'),draftRoot=path.join(root,'drafts/w2-s1'),publish=false}={}){
 const world=await loadWorld(root),publication=await readS1Publication(draftRoot),next=mergeS1Publication(world,publication),validation=validateWorld(next);
 if(!validation.ok)throw Error(validation.errors.join('\n'));
 const files={'meta/spells.json':next.spells,'meta/skills.json':next.skills,'meta/items.json':next.items,'people/baseline.json':next.npcs,'geo/locations.json':next.locations},changed=[];
 for(const [file,value]of Object.entries(files))if(!same(await read(path.join(root,file)),value))changed.push(file);
 // All approvals/conflicts/reference checks precede any file replacement.
 if(publish)for(const file of changed){const target=path.join(root,file),old=await fs.readFile(target,'utf8'),newline=old.includes('\r\n')?'\r\n':'\n',indent=old.includes('\n')?2:undefined,temp=`${target}.${randomUUID()}.tmp`,handle=await fs.open(temp,'wx');try{await handle.writeFile((JSON.stringify(files[file],null,indent)+'\n').replaceAll('\n',newline));await handle.sync();}finally{await handle.close();}await fs.rename(temp,target);}
 return {published:publish,changed,formalSpellCount:next.spells.length,contentCounts:{spells:30,skills:30,books:6,learningSources:30},validation:{ok:validation.ok,errors:validation.errors}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename)){const i=process.argv.indexOf('--root');console.log(JSON.stringify(await publishS1({root:i<0?undefined:path.resolve(process.argv[i+1]),publish:process.argv.includes('--publish')})));}
