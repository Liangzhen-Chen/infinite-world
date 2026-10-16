import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {loadWorld} from './load-world.mjs';
import {validateWorld} from './validate-world.mjs';
import {siteItemReferences} from '../server-plugin/sites.mjs';
import {formalOrder} from './catalogue-order.mjs';
import {hashContent,readApprovedContent} from './content-pipeline.mjs';
import {entries,contextFor,revision,validateDraft,reviewDraftFor,buildCandidate} from './w2-s2-content.mjs';
import {spells,books,items,recipes,mentors,placements,stations} from '../world/design/w2-s2.mjs';
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const same=(a,b)=>hashContent(a)===hashContent(b);
// Merged rows keep the formal catalogue order (tools/catalogue-order.mjs), so a
// batch merged back into an edition holding later publications returns to its slot.
function mergeRows(old,added,label,key){
 const map=new Map(old.map(r=>[r.id,r]));
 for(const r of added){const prior=map.get(r.id);if(prior&&!same(prior,r))throw Error(`正式条目冲突：${label}${r.id}`);map.set(r.id,structuredClone(r));}
 return formalOrder(key,[...map.values()]);
}
// Design prose before review; used by tests that exercise the mechanics only.
export function designPublication(){return buildCandidate(entries.map(e=>reviewDraftFor(e)));}
export async function readS2Publication(root=path.resolve('world/drafts/w2-s2')){
 const approved=await readApprovedContent(root,entries,{contextFor,revision});
 const missing=entries.filter(e=>!approved.some(d=>d.id===e.id));if(missing.length)throw Error(`未通过审核：${missing.map(e=>e.id).join(',')}`);
 for(const e of entries){const d=approved.find(d=>d.id===e.id);if(!same(d,reviewDraftFor(e)))throw Error(`已审核正文与设计稿不符：${e.id}`);const v=validateDraft(d,e);if(v.errors.length)throw Error(`${e.id}: ${v.errors.join(';')}`);}
 const publication=buildCandidate(approved);
 if(!same(await read(path.join(root,'candidate.json')),publication))throw Error('候选与已审核内容不符');
 const wave=(await read(path.join(root,'batch-0.json'))).l4?.wave,ids=new Set(spells.map(s=>s.id));
 if(!Array.isArray(wave)||wave.length!==10||new Set(wave.map(r=>r.id)).size!==10||wave.some(r=>!ids.has(r.id)||!Array.isArray(r.scores)||r.scores.length!==6||r.scores.some(n=>!Number.isInteger(n)||n<3||n>5)||typeof r.note!=='string'||!r.note.trim())||
  wave.flatMap(r=>r.scores).reduce((a,b)=>a+b,0)/60<4)throw Error('波次随机10条六项评分未达标');
 return publication;
}
const teachEntry=what=>({kind:'teach',what,price:{mode:'catalog',source:what},unlocksService:false});
export function mergeS2Publication(world,publication){
 const next=structuredClone(world);
 if(next.rules.npcStockUpdateVersion!==1)throw Error('已有逐键库存升级机制未启用');
 next.spells=mergeRows(next.spells,publication.spells,'法术','spells');
 next.skills=mergeRows(next.skills,publication.sources.mappings.map(m=>m.skill),'技能','skills');
 next.items=mergeRows(next.items,[...publication.books,...publication.items],'物品','items');
 next.recipes=mergeRows(next.recipes,publication.recipes,'配方','recipes');
 for(const {item,stock} of publication.sources.books){const seller=next.npcs.find(n=>n.id===stock.owner);if(!seller)throw Error('书商不存在');seller.inventory??={};if(!Object.hasOwn(seller.inventory,item.id))seller.inventory[item.id]=stock.quantity;}
 for(const [id,{teach,inventory}] of Object.entries(publication.mentors)){
  const p=next.npcs.find(n=>n.id===id);if(!p)throw Error(`导师不存在：${id}`);
  p.services??=[];p.serviceCatalog??=[];p.skills??=[];p.proficiencies??={};p.inventory??={};
  for(const what of teach){
   if(!p.services.includes(what))p.services.push(what);
   if(!p.serviceCatalog.some(c=>c.kind==='teach'&&c.what===what))p.serviceCatalog.push(teachEntry(what));
   const skill=what.startsWith('spell_')?next.spells.find(s=>s.id===what)?.skill:null;
   if(what.startsWith('spell_')&&!skill)throw Error(`导师所授法术不存在：${what}`);
   if(skill&&!p.skills.includes(skill)){p.skills.push(skill);p.proficiencies[skill]??=600;}
  }
  for(const [item,quantity] of Object.entries(inventory))if(!Object.hasOwn(p.inventory,item))p.inventory[item]=quantity;
 }
 for(const [location,rows] of Object.entries(publication.placements)){const place=next.locations.find(l=>l.id===location);if(!place)throw Error(`地点不存在：${location}`);place.features=mergeRows(place.features??[],rows,'环境对象',`features:${location}`);}
 for(const [location,rows] of Object.entries(publication.stations)){const place=next.locations.find(l=>l.id===location);if(!place)throw Error(`地点不存在：${location}`);place.workstations=mergeRows(place.workstations??[],rows,'工作台',`workstations:${location}`);}
 return next;
}
// The edition before this batch, rebuilt from any world that may contain it.
// Older batch tests compare their own reviewed rows against this view.
export function withoutS2(source){
 const ids={spells:new Set(spells.map(s=>s.id)),skills:new Set(spells.map(s=>s.skill)),items:new Set([...books,...items].map(i=>i.id)),recipes:new Set(recipes.map(r=>r.id))};
 const w=structuredClone(source);
 // Items that later sites still hold or use stay in the catalogue (server-plugin/sites.mjs).
 for(const id of siteItemReferences(w.locations))ids.items.delete(id);
 for(const k of Object.keys(ids))w[k]=w[k].filter(r=>!ids[k].has(r.id));
 const seller=w.npcs.find(n=>n.id==='npc_hw_luqing');for(const b of books)if(seller?.inventory)delete seller.inventory[b.id];
 for(const [id,{teach,inventory}] of Object.entries(mentors)){
  const p=w.npcs.find(n=>n.id===id);if(!p)continue;const skills=new Set(teach.map(t=>source.spells.find(s=>s.id===t)?.skill).filter(Boolean));
  p.services=(p.services??[]).filter(s=>!teach.includes(s));p.serviceCatalog=(p.serviceCatalog??[]).filter(c=>!(c.kind==='teach'&&teach.includes(c.what)));
  p.skills=(p.skills??[]).filter(s=>!skills.has(s));for(const s of skills)delete p.proficiencies?.[s];for(const k of Object.keys(inventory))delete p.inventory?.[k];
 }
 for(const [id,rows] of Object.entries(placements)){const l=w.locations.find(l=>l.id===id);if(!l?.features)continue;l.features=l.features.filter(f=>!rows.some(r=>r.id===f.id));if(!l.features.length)delete l.features;}
 for(const [id,rows] of Object.entries(stations)){const l=w.locations.find(l=>l.id===id);if(!l?.workstations)continue;l.workstations=l.workstations.filter(f=>!rows.some(r=>r.id===f.id));if(!l.workstations.length)delete l.workstations;}
 return w;
}
export const files=['meta/spells.json','meta/skills.json','meta/items.json','meta/recipes.json','people/baseline.json','geo/locations.json'];
const key={'meta/spells.json':'spells','meta/skills.json':'skills','meta/items.json':'items','meta/recipes.json':'recipes','people/baseline.json':'npcs','geo/locations.json':'locations'};
export async function publishS2({root=path.resolve('world'),draftRoot=path.join(root,'drafts/w2-s2'),publish=false}={}){
 const world=await loadWorld(root),publication=await readS2Publication(draftRoot),next=mergeS2Publication(world,publication),validation=validateWorld(next);
 if(!validation.ok)throw Error(validation.errors.join('\n'));
 const changed=[];
 for(const file of files)if(!same(await read(path.join(root,file)),next[key[file]]))changed.push(file);
 // All approvals/conflicts/reference checks precede any file replacement.
 if(publish)for(const file of changed){const target=path.join(root,file),old=await fs.readFile(target,'utf8'),newline=old.includes('\r\n')?'\r\n':'\n',indent=old.trimEnd().includes('\n')?2:undefined,temp=`${target}.${randomUUID()}.tmp`,handle=await fs.open(temp,'wx');try{await handle.writeFile((JSON.stringify(next[key[file]],null,indent)+'\n').replaceAll('\n',newline));await handle.sync();}finally{await handle.close();}await fs.rename(temp,target);}
 return {published:publish,changed,formalSpellCount:next.spells.length,contentCounts:{spells:spells.length,books:books.length,items:items.length,recipes:recipes.length},validation:{ok:validation.ok,errors:validation.errors}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename)){const i=process.argv.indexOf('--root');console.log(JSON.stringify(await publishS2({root:i<0?undefined:path.resolve(process.argv[i+1]),publish:process.argv.includes('--publish')})));}
