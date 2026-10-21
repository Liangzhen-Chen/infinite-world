import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import{tmpRoot}from'../tools/tmp-root.mjs';
import path from 'node:path';
import {loadWorld} from '../tools/load-world.mjs';
import {readReusePublication,mergeReusePublication,publishReuse} from '../tools/publish-w2-reuse.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {compatibleWorld,planWorldUpgrade} from '../server-plugin/world-upgrade.mjs';

const formal=await loadWorld(),publication=await readReusePublication(),before=structuredClone(formal);
for(const [category,rows]of Object.entries({spells:publication.spells,skills:publication.sources.mappings.map(row=>row.skill),items:publication.items})){
 const ids=new Set(rows.map(row=>row.id));before[category]=before[category].filter(row=>!ids.has(row.id)||category==='skills'&&row.learningProfessions);
}
for(const book of publication.sources.books)delete before.npcs.find(row=>row.id===book.stock.owner).inventory[book.item.id];
before.items.find(row=>row.id==='item_clothes').tags=before.items.find(row=>row.id==='item_clothes').tags.filter(tag=>tag!=='clothing');
const next=mergeReusePublication(before,publication),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));

test('隔离预演不写入，只追加T19的14条法术且重复零写入；正文/来源/L4篡改在写入前拒绝',async t=>{
 const root=await fs.mkdtemp(path.join(tmpRoot(),'fields-w2-reuse-'));
 t.after(async()=>{assert.ok(path.resolve(root).startsWith(path.resolve(tmpRoot())+path.sep));await fs.rm(root,{recursive:true,force:true});});
 // A3 archives actions and ontology in loadWorld; preserve them in this publication roundtrip, including its full-world equality assertion.
 for(const folder of ['meta','people','geo','lore','rules','templates','actions','ontology'])await fs.cp(path.resolve('world',folder),path.join(root,folder),{recursive:true});
 for(const [file,value]of Object.entries({'meta/spells.json':before.spells,'meta/skills.json':before.skills,'meta/items.json':before.items,'people/baseline.json':before.npcs}))await fs.writeFile(path.join(root,file),JSON.stringify(value));
 await fs.mkdir(path.join(root,'drafts'),{recursive:true});
 await fs.cp(path.resolve('world/drafts/w2-reuse'),path.join(root,'drafts/w2-reuse'),{recursive:true});
 const bytes=await fs.readFile(path.join(root,'meta/spells.json'),'utf8');
 const preview=await publishReuse({root});assert.equal(preview.published,false);assert.equal(publication.spells.length,14);assert.equal(preview.formalSpellCount,before.spells.length+14);assert.equal(preview.changed.length,4);assert.equal(await fs.readFile(path.join(root,'meta/spells.json'),'utf8'),bytes);
 const first=await publishReuse({root,publish:true});assert.equal(first.changed.length,4);assert.deepEqual(await loadWorld(root),next);
 const times=await Promise.all(first.changed.map(file=>fs.stat(path.join(root,file)).then(row=>row.mtimeMs)));
 assert.deepEqual((await publishReuse({root,publish:true})).changed,[]);
 for(const [file,mutate,reason]of [
  ['candidate.json',row=>{row.spells[0].failure+='免费学习';},/与已审核内容不符/],
  ['learning-sources.json',row=>{row.books[0].stock.quantity=99;},/与已审核骨架不符/],
  ['learning/batch-0.json',row=>{row.l4.approved=false;},/L4/],
  ['learning/item_book_w2_reuse_basic.json',row=>{row.draft.prose.description+='附赠魔力';},/审查后内容已改变/],
 ]){
  const target=path.join(root,'drafts/w2-reuse',file),original=await fs.readFile(target,'utf8'),row=JSON.parse(original);mutate(row);await fs.writeFile(target,JSON.stringify(row));
  await assert.rejects(publishReuse({root,publish:true}),reason);await fs.writeFile(target,original);
 }
 assert.deepEqual(await Promise.all(first.changed.map(file=>fs.stat(path.join(root,file)).then(row=>row.mtimeMs))),times);
});

test('正式ID冲突拒绝，已有零库存和残本不补，合并幂等',()=>{
 assert.deepEqual(mergeReusePublication(next,publication),next);
 for(const [category,rows]of Object.entries({spells:publication.spells,skills:publication.sources.mappings.map(row=>row.skill),items:publication.items})){
  const conflict=structuredClone(next);conflict[category].find(row=>row.id===rows[0].id).name+='异文';assert.throws(()=>mergeReusePublication(conflict,publication),/正式条目冲突/);
 }
 const stocked=structuredClone(next),seller=stocked.npcs.find(row=>row.id==='npc_hw_luqing');seller.inventory[publication.items[0].id]=0;seller.inventory[publication.items[1].id]={quantity:1,durability:17};seller.coins=19;
 assert.deepEqual(mergeReusePublication(stocked,publication).npcs,stocked.npcs);
});

test('旧战役world_upgrade保留钱物和历史，三册书逐键进入一次，升级后能付费购买研读',async()=>{
 const oldEngine=new WorldEngine(before),document=oldEngine.createCharacter(seed,{},'w2-reuse-upgrade');
 document.state.minute=540;document.state.player.coins=10000;document.state.player.attributes.智力=30;document.state.player.attributes.精神=30;document.state.player.level=60;document.state.professions.combat='profession_mage';document.state.skills.skill_literacy={proficiency:100,daily:{},breakthroughs:[]};
 const seller=document.state.npcs.npc_hw_luqing;seller.coins=19;seller.inventory.item_literacy_primer=0;seller.inventory[publication.items[0].id]=0;
 const saved=structuredClone(document),incoming=compatibleWorld(before,next).world;
 const plan=planWorldUpgrade(document,before,incoming,{worldHash:'w2-reuse-edition',eventId:'w2-reuse-upgrade'}),after=applyPatches(document,plan.patches);
 assert.deepEqual(after.state.player,saved.state.player);assert.deepEqual(after.state.inventory,saved.state.inventory);assert.deepEqual(after.memories,saved.memories);
 for(const [id,npc]of Object.entries(saved.state.npcs)){
  const inventory={...after.state.npcs[id].inventory};for(const book of publication.sources.books)if(book.stock.owner===id&&!Object.hasOwn(npc.inventory,book.item.id))delete inventory[book.item.id];assert.deepEqual({...after.state.npcs[id],inventory},npc);
 }
 assert.equal(plan.result.stockAdded.length,2);assert.equal(after.state.npcs.npc_hw_luqing.inventory[publication.items[0].id],0);
 const engine=new WorldEngine(incoming);
 const run=async(d,tool,args,eventId)=>{const out=await engine.reduce(d,{tool,args,eventId});return {document:applyPatches(d,out.patches),result:out.result};};
 const book=publication.items[1],arrived=await run(after,'world_move',{destination:book.origin},'upgrade_arrive');
 const bought=await run(arrived.document,'world_trade',{seller:'npc_hw_luqing',item:book.id,quantity:1},'upgrade_buy');
 assert.ok(bought.result.cost>0);assert.equal(bought.document.state.player.coins,arrived.document.state.player.coins-bought.result.cost);
 const spell=book.book.teaches[0];let learned;
 for(let i=0;i<100;i++){const trial=await run(bought.document,'world_learn',{kind:'spell',entity:spell,source:book.id},`upgrade_learn_${i}`);if(trial.result.success){learned=trial;break;}}
 assert.ok(learned);assert.equal(learned.document.state.spells[spell].source.id,book.id);assert.equal(learned.document.state.player.coins,bought.document.state.player.coins);assert.equal(learned.document.state.minute,bought.document.state.minute+book.book.readingMinutes);
 const spent=structuredClone(learned.document);for(const row of publication.items)spent.state.npcs.npc_hw_luqing.inventory[row.id]=0;
 const repeat=planWorldUpgrade(spent,incoming,incoming,{worldHash:'w2-reuse-edition',eventId:'w2-reuse-repeat'});
 assert.deepEqual(repeat.result.stockAdded,[]);assert.deepEqual(applyPatches(spent,repeat.patches).state.npcs,spent.state.npcs);
 // Re-appending T19 can move its rows past later batches. Check each published
 // row by ID and retain every unrelated row in its original order.
 for(const [category,rows]of Object.entries({spells:publication.spells,skills:publication.sources.mappings.map(row=>row.skill),items:publication.items})){
  const ids=new Set(rows.map(row=>row.id));
  for(const row of rows){const actual=formal[category].find(actual=>actual.id===row.id),{learningProfessions,...reviewed}=actual;assert.deepEqual(category==='skills'?reviewed:actual,row);assert.deepEqual(next[category].find(actual=>actual.id===row.id),actual);}
  assert.deepEqual(next[category].filter(row=>!ids.has(row.id)),formal[category].filter(row=>!ids.has(row.id)));
 }
});
