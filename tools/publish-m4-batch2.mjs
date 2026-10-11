import fs from'node:fs/promises';import path from'node:path';
import{loadWorld}from'./load-world.mjs';import{validateWorld}from'./validate-world.mjs';
import{hashContent,readApprovedContent}from'./content-pipeline.mjs';
import{entries as contentEntries,contextFor as contentContext,revision as contentRevision}from'./m4-batch2-content.mjs';
import{entries as bookEntries,contextFor as bookContext,revision as bookRevision,materialize as bookMaterialize,sources as sourceDesign}from'./m4-books-content.mjs';
import{bossFoundation}from'../world/design/boss-foundation.mjs';import{atomicJSON}from'../server-plugin/storage.mjs';
const same=(a,b)=>hashContent(a)===hashContent(b),read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
function mergeRows(old,added){const rows=new Map((old??[]).map(r=>[r.id,r]));for(const row of added){if(rows.has(row.id)&&!same(rows.get(row.id),row))throw Error(`正式条目冲突：${row.id}`);rows.set(row.id,structuredClone(row));}return[...rows.values()];}
export async function readM4Publication(draftRoot=path.resolve('world/drafts/m4-batch2')){
 const[candidate,sources,books]=await Promise.all([read(path.join(draftRoot,'candidate.json')),read(path.join(draftRoot,'learning-sources.json')),read(path.join(draftRoot,'books/candidate.json'))]);
 if(!same(sources,sourceDesign))throw Error('学习来源与已审书籍骨架不符');
 const[approved,bookProse]=await Promise.all([readApprovedContent(draftRoot,contentEntries,{contextFor:contentContext,revision:contentRevision}),readApprovedContent(path.join(draftRoot,'books'),bookEntries,{contextFor:bookContext,revision:bookRevision})]);
 if(approved.length!==20||bookProse.length!==10)throw Error('法术、首领或书籍未全部审核');
 const expected=contentEntries.map(({category,...e})=>({...e,...approved.find(r=>r.id===e.id).prose}));
 if(!same(candidate.spells,expected.filter(e=>e.id.startsWith('spell_')))||!same(candidate.bosses,expected.filter(e=>e.id.startsWith('boss_'))))throw Error('法术或首领候选与已审核内容不符');
 const items=bookEntries.map(e=>bookMaterialize(e,bookProse.find(r=>r.id===e.id)));
 if(!same(books.items,items))throw Error('书籍候选与已审核内容不符');
 return{spells:candidate.spells,bosses:candidate.bosses,items,sources};
}
export function mergeM4Batch2(world,publication){
 const next=structuredClone(world),{sources}=publication;
 if(sources.mappings.length!==16||new Set(sources.mappings.map(m=>m.spell)).size!==16)throw Error('法术学习映射数量错误');
 for(const spell of publication.spells){const m=sources.mappings.find(m=>m.spell===spell.id),book=publication.items.find(b=>b.id===m?.book);if(!m||m.skill.id!==spell.skill||m.skill.stage!==spell.stage||m.skill.profession!=='profession_mage'||!book?.book.teaches.includes(spell.id))throw Error(`法术学习路径不完整：${spell.id}`);}
 next.spells=mergeRows(next.spells,publication.spells.map(s=>({...s,teachers:sources.mappings.find(m=>m.spell===s.id).teachers})));
 next.skills=mergeRows(next.skills,sources.mappings.map(m=>m.skill));next.items=mergeRows(next.items,publication.items);next.bosses=mergeRows(next.bosses,publication.bosses);
 const rules=bossFoundation().rules;if(next.rules.bossEcology&&!same(next.rules.bossEcology,rules))throw Error('既有首领生态规则冲突');next.rules.bossEcology=rules;
 if(next.rules.npcStockUpdateVersion!==undefined&&next.rules.npcStockUpdateVersion!==1)throw Error('商人库存升级版本冲突');next.rules.npcStockUpdateVersion=1;
 const mage=next.professions.find(p=>p.id==='profession_mage');if(!mage?.entry||!['loc_bs','bld_hw_riverhome'].includes(mage.entry.location))throw Error('法师认证地点已变化，须人工确认');mage.entry.location='bld_hw_riverhome';
 for(const row of sources.teacherChanges){const npc=next.npcs.find(n=>n.id===row.id);if(!npc)throw Error(`导师不存在：${row.id}`);npc.services=[...new Set([...npc.services??[],...row.appendServices])];if(!Array.isArray(npc.skills))throw Error('导师技能表示不兼容，须明确合并');npc.skills=[...new Set([...npc.skills,...row.appendSkills])];}
 for(const row of sources.books){const npc=next.npcs.find(n=>n.id===row.stock.owner);if(!npc)throw Error(`书商不存在：${row.stock.owner}`);npc.inventory??={};if(!Object.hasOwn(npc.inventory,row.item.id))npc.inventory[row.item.id]=row.stock.quantity;}
 return next;
}
export async function publishM4Batch2({root=path.resolve('world'),draftRoot=path.join(root,'drafts/m4-batch2'),publish=false}={}){
 const world=await loadWorld(root),publication=await readM4Publication(draftRoot),next=mergeM4Batch2(world,publication),validation=validateWorld(next,{stage:'release'});
 if(!validation.ok)throw Error(validation.errors.join('\n'));
 const files={'meta/spells.json':next.spells,'meta/skills.json':next.skills,'meta/items.json':next.items,'meta/bosses.json':next.bosses,'meta/rules.json':next.rules,'meta/professions.json':next.professions,'people/baseline.json':next.npcs},changed=[];
 // All gates precede the first write; each file replacement is atomic.
 for(const[file,value]of Object.entries(files)){let old=null;try{old=await read(path.join(root,file));}catch(e){if(e.code!=='ENOENT')throw e;}if(same(old,value))continue;changed.push(file);if(publish)await atomicJSON(path.join(root,file),value);}
 return{published:publish,changed,contentCounts:{spells:16,skills:16,books:10,bosses:4},validation,notes:['npcStockUpdateVersion=1启用逐键保留库存：仅旧目录和当前库存都没有的新增书入库一次。','法师认证地点目录对齐现有导师许苓的河岸小屋；不更改认证处理器。']};
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename)){const i=process.argv.indexOf('--root'),root=i<0?undefined:path.resolve(process.argv[i+1]);console.log(JSON.stringify(await publishM4Batch2({root,publish:process.argv.includes('--publish')})));}
