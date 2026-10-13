import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {loadWorld} from './load-world.mjs';
import {validateWorld} from './validate-world.mjs';
import {hashContent,readApprovedContent} from './content-pipeline.mjs';
import {entries as spellEntries,contextFor as spellContext,revision as spellRevision} from './w2-reuse-content.mjs';
import {entries as learningEntries,contextFor as learningContext,revision as learningRevision} from './w2-reuse-learning-content.mjs';
import {sources,entries as books,materialize} from '../world/design/w2-reuse-learning.mjs';
import {validateMagicCatalog} from '../server-plugin/magic.mjs';
import {atomicJSON} from '../server-plugin/storage.mjs';

const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const same=(a,b)=>hashContent(a)===hashContent(b);
function mergeRows(old,added,skillRoutes=false){
 const rows=new Map(old.map(row=>[row.id,row]));
 for(const row of added){
  const prior=rows.get(row.id);
  if(prior&&skillRoutes&&Array.isArray(prior.learningProfessions)){
   const {learningProfessions,...reviewed}=prior;
   if(!same(reviewed,row))throw Error(`正式条目冲突：${row.id}`);
   continue;
  }
  if(rows.has(row.id)&&!same(rows.get(row.id),row))throw Error(`正式条目冲突：${row.id}`);
  rows.set(row.id,structuredClone(row));
 }
 return [...rows.values()];
}
export async function readReusePublication(draftRoot=path.resolve('world/drafts/w2-reuse'),world){
 world??=await loadWorld();
 const [candidate,savedSources,approved,learning]=await Promise.all([
  read(path.join(draftRoot,'candidate.json')),read(path.join(draftRoot,'learning-sources.json')),
  readApprovedContent(draftRoot,spellEntries,{contextFor:spellContext,revision:spellRevision}),
  readApprovedContent(path.join(draftRoot,'learning'),learningEntries,{contextFor:entry=>learningContext(entry,world),revision:learningRevision}),
 ]);
 if(!same(savedSources,sources))throw Error('学习来源与已审核骨架不符');
 if(approved.length!==14||learning.length!==17)throw Error('14法术、三册书或14学习来源未全部审核');
 const spells=spellEntries.map(({category,...entry})=>({...entry,...approved.find(row=>row.id===entry.id).prose}));
 if(!same(candidate.spells,spells))throw Error('法术候选与已审核内容不符');
 for(const mapping of sources.mappings){
  const draft=learning.find(row=>row.id===`source_${mapping.spell}`);
  if(!same(draft.source,mapping))throw Error(`学习来源与已审核内容不符：${mapping.spell}`);
 }
 return {spells,items:books.map(entry=>materialize(entry,learning.find(row=>row.id===entry.id))),sources:structuredClone(sources)};
}
export function mergeReusePublication(world,publication){
 const next=structuredClone(world),{sources}=publication;
 if(sources.mappings.length!==14||new Set(sources.mappings.map(row=>row.spell)).size!==14)throw Error('法术学习映射数量错误');
 for(const spell of publication.spells){
  const mapping=sources.mappings.find(row=>row.spell===spell.id),book=publication.items.find(row=>row.id===mapping?.book);
  if(!mapping||mapping.skill.id!==spell.skill||mapping.skill.stage!==spell.stage||mapping.skill.profession!=='profession_mage'||!book?.book.teaches.includes(spell.id))throw Error(`法术学习路径不完整：${spell.id}`);
 }
 next.spells=mergeRows(next.spells,publication.spells);
 next.skills=mergeRows(next.skills,sources.mappings.map(row=>row.skill),true);
 next.items=mergeRows(next.items,publication.items);
 // Drying already consumes the clothing tag; the candidate helper supplied it.
 const clothes=next.items.find(row=>row.id==='item_clothes');
 if(clothes?.name!=='普通衣服')throw Error('基础衣物目录已变化，需重新核对');
 clothes.tags=[...new Set([...(clothes.tags??[]),'clothing'])];
 if(next.rules.npcStockUpdateVersion!==undefined&&next.rules.npcStockUpdateVersion!==1)throw Error('商人库存升级版本冲突');
 next.rules.npcStockUpdateVersion=1;
 for(const row of sources.books){
  const seller=next.npcs.find(npc=>npc.id===row.stock.owner);
  if(!seller)throw Error(`书商不存在：${row.stock.owner}`);
  seller.inventory??={};
  if(!Object.hasOwn(seller.inventory,row.item.id))seller.inventory[row.item.id]=row.stock.quantity;
 }
 return next;
}
export async function publishReuse({root=path.resolve('world'),draftRoot=path.join(root,'drafts/w2-reuse'),publish=false}={}){
 const world=await loadWorld(root),publication=await readReusePublication(draftRoot,world),next=mergeReusePublication(world,publication);
 // Full-world release/depth gates belong to the milestone build. This increment
 // validates the world schema/references and the actual spell handlers here.
 const validation=validateWorld(next);
 for(const spell of next.spells)validation.errors.push(...validateMagicCatalog(spell,{requireHandler:true}).map(error=>`${spell.id}: ${error}`));
 validation.ok=!validation.errors.length;
 if(!validation.ok)throw Error(validation.errors.join('\n'));
 const files={'meta/spells.json':next.spells,'meta/skills.json':next.skills,'meta/items.json':next.items,'meta/rules.json':next.rules,'people/baseline.json':next.npcs};
 const changed=[];
 for(const [file,value]of Object.entries(files)){
  if(same(await read(path.join(root,file)),value))continue;
  changed.push(file);
 }
 // Approval, conflicts, and validation all finish before the first replacement.
 if(publish)for(const file of changed){
  const target=path.join(root,file),old=await fs.readFile(target,'utf8');
  if(!old.includes('\n')){await atomicJSON(target,files[file]);continue;}
  // Keep the hand-readable people file's existing indentation and newline.
  const newline=old.includes('\r\n')?'\r\n':'\n',temporary=`${target}.${randomUUID()}.tmp`,handle=await fs.open(temporary,'wx');
  try{await handle.writeFile((JSON.stringify(files[file],null,2)+'\n').replaceAll('\n',newline));await handle.sync();}finally{await handle.close();}
  await fs.rename(temporary,target);
 }
 return {published:publish,changed,formalSpellCount:next.spells.length,contentCounts:{spells:14,skills:14,books:3,learningSources:14},validation};
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename)){
 const i=process.argv.indexOf('--root'),root=i<0?undefined:path.resolve(process.argv[i+1]);
 const result=await publishReuse({root,publish:process.argv.includes('--publish')});
 console.log(JSON.stringify({...result,validation:{ok:result.validation.ok,errors:result.validation.errors}}));
}
