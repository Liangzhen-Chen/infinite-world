import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs/promises';import os from'node:os';import path from'node:path';
import{loadWorld}from'../tools/load-world.mjs';import{readM4Publication,mergeM4Batch2,publishM4Batch2}from'../tools/publish-m4-batch2.mjs';
import{WorldEngine}from'../server-plugin/engine.mjs';import{applyPatches}from'../server-plugin/storage.mjs';import{compatibleWorld,planWorldUpgrade}from'../server-plugin/world-upgrade.mjs';
const publication=await readM4Publication(),source=await loadWorld();
// Reconstruct the pre-batch catalog so this regression remains meaningful
// after the parent publishes these exact entries into the shared world.
for(const[category,rows]of Object.entries({spells:publication.spells,skills:publication.sources.mappings.map(m=>m.skill),items:publication.items,bosses:publication.bosses})){const ids=new Set(rows.map(r=>r.id));source[category]=source[category].filter(r=>!ids.has(r.id));}
delete source.rules.npcStockUpdateVersion;if(!source.bosses.length)delete source.rules.bossEcology;
source.professions.find(p=>p.id==='profession_mage').entry.location='loc_bs';
for(const book of publication.sources.books)delete source.npcs.find(n=>n.id===book.stock.owner).inventory[book.item.id];
for(const change of publication.sources.teacherChanges){const n=source.npcs.find(n=>n.id===change.id);n.services=n.services.filter(id=>!change.appendServices.includes(id));n.skills=n.skills.filter(id=>!change.appendSkills.includes(id));}
const world=mergeM4Batch2(source,publication),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const quantity=value=>typeof value==='number'?value:value?.quantity??0;
function setup(){const engine=new WorldEngine(world),document=engine.createCharacter(seed,{},'m4-publication');document.state.player.coins=10000;document.state.player.level=10;document.state.player.attributes.精神=30;document.state.player.attributes.智力=20;document.state.skills.skill_literacy={proficiency:100,daily:{},breakthroughs:[]};document.state.skills.skill_light={proficiency:100,daily:{},breakthroughs:[]};document.state.minute=540;
 const run=async(d,tool,args,id)=>{const r=await engine.reduce(d,{tool,args,eventId:id});return{document:applyPatches(d,r.patches),result:r.result};};return{engine,document,run};}
function position(d,npc){d.state.location=world.npcs.find(n=>n.id===npc).location;d.state.npcs[npc].location=d.state.location;}
async function succeed(run,d,tool,args,prefix){for(let i=0;i<60;i++){const result=await run(d,tool,args,`${prefix}_${i}`);if(result.result.success||result.result.certified)return result;}throw Error('未找到成功骰点');}

test('M4隔离发布校验30条审查与来源，重复发布零写入，篡改正文先拒绝',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'fields-m4-publish-'));t.after(async()=>{const target=path.resolve(root);assert.ok(target.startsWith(path.resolve(os.tmpdir())+path.sep));await fs.rm(target,{recursive:true,force:true});});
 for(const folder of['meta','people','geo','lore'])await fs.cp(path.resolve('world',folder),path.join(root,folder),{recursive:true});
 for(const[file,value]of Object.entries({'meta/spells.json':source.spells,'meta/skills.json':source.skills,'meta/items.json':source.items,'meta/bosses.json':source.bosses,'meta/rules.json':source.rules,'meta/professions.json':source.professions,'people/baseline.json':source.npcs}))await fs.writeFile(path.join(root,file),JSON.stringify(value));
 await fs.mkdir(path.join(root,'drafts'),{recursive:true});await fs.cp(path.resolve('world/drafts/m4-batch2'),path.join(root,'drafts/m4-batch2'),{recursive:true});
 const before=await fs.readFile(path.join(root,'meta/spells.json'),'utf8'),preview=await publishM4Batch2({root});assert.equal(preview.published,false);assert.equal(preview.changed.length,7);assert.equal(await fs.readFile(path.join(root,'meta/spells.json'),'utf8'),before);
 const first=await publishM4Batch2({root,publish:true});assert.equal(first.changed.length,7);const installed=await loadWorld(root);assert.equal(installed.spells.length,source.spells.length+16);assert.equal(installed.skills.length,source.skills.length+16);assert.deepEqual(installed.bosses,[...source.bosses,...publication.bosses]);assert.ok(installed.rules.bossEcology);assert.equal(installed.professions.find(p=>p.id==='profession_mage').entry.location,'bld_hw_riverhome');
 const times=await Promise.all(first.changed.map(file=>fs.stat(path.join(root,file)).then(s=>s.mtimeMs)));assert.deepEqual((await publishM4Batch2({root,publish:true})).changed,[]);assert.deepEqual(await Promise.all(first.changed.map(file=>fs.stat(path.join(root,file)).then(s=>s.mtimeMs))),times);
 const cp=path.join(root,'drafts/m4-batch2/books/candidate.json'),candidate=JSON.parse(await fs.readFile(cp,'utf8'));candidate.items[0].description+='免费赠送一只役灵';await fs.writeFile(cp,JSON.stringify(candidate));await assert.rejects(publishM4Batch2({root,publish:true}),/与已审核内容不符/);assert.deepEqual(await Promise.all(first.changed.map(file=>fs.stat(path.join(root,file)).then(s=>s.mtimeMs))),times);
});

test('10本书真实购买有限库存，16法术通过实际研读取得，读书不消耗书籍',async()=>{
 const{document,run}=setup();position(document,'npc_hw_xuling');const certified=await succeed(run,document,'world_profession',{profession:'profession_mage',teacher:'npc_hw_xuling'},'certify');assert.equal(certified.document.state.professions.combat,'profession_mage');assert.equal(certified.document.state.player.coins,document.state.player.coins-30);
 for(const book of publication.sources.books){const d=structuredClone(certified.document);d.state.minute=540;position(d,book.stock.owner);const beforePlayer=d.state.player.coins,beforeSeller=d.state.npcs[book.stock.owner].coins;
  const purchased=await run(d,'world_trade',{seller:book.stock.owner,item:book.item.id,quantity:1},`buy_${book.item.id}`),after=purchased.document;
  assert.equal(quantity(after.state.inventory[book.item.id]),1);assert.equal(quantity(after.state.npcs[book.stock.owner].inventory[book.item.id]),book.stock.quantity-1);assert.equal(after.state.player.coins+after.state.npcs[book.stock.owner].coins,beforePlayer+beforeSeller);assert.ok(after.state.player.coins<beforePlayer);
  for(const spell of book.item.book.teaches){const learned=await succeed(run,after,'world_learn',{entity:spell,kind:'spell',source:book.item.id},`read_${spell}`);assert.equal(learned.document.state.spells[spell].source.id,book.item.id);assert.equal(learned.document.state.minute,after.state.minute+book.item.book.readingMinutes);assert.equal(quantity(learned.document.state.inventory[book.item.id]),1);assert.equal(learned.document.state.skills[publication.spells.find(s=>s.id===spell).skill].proficiency,0);}
 }
});

test('读书不能绕过识字与认证；卖完不补货，拒绝保持钱物时间',async()=>{
 const{document,run}=setup(),book=publication.sources.books.find(b=>b.item.id==='item_book_m4_light');position(document,book.stock.owner);
 const bought=(await run(document,'world_trade',{seller:book.stock.owner,item:book.item.id,quantity:1},'buy-limited')).document;const saved=structuredClone(bought);
 await assert.rejects(run(bought,'world_trade',{seller:book.stock.owner,item:book.item.id,quantity:1},'sold-out'),/库存|不足/);await assert.rejects(run(bought,'world_learn',{entity:'spell_fire_07',source:book.item.id},'uncertified'),/认证/);assert.deepEqual(bought,saved);
 const low=structuredClone(bought);low.state.professions.combat='profession_mage';low.state.skills.skill_literacy.proficiency=99;const lowSaved=structuredClone(low);await assert.rejects(run(low,'world_learn',{entity:'spell_fire_07',source:book.item.id},'illiterate'),/识字/);assert.deepEqual(low,lowSaved);
 const damaged=structuredClone(lowSaved);damaged.state.skills.skill_literacy.proficiency=100;damaged.state.inventory[book.item.id].durability=0;await assert.rejects(run(damaged,'world_learn',{entity:'spell_fire_07',source:book.item.id},'damaged'),/损坏/);
});

test('许苓只教两项新生活法术，完整课程须处于营业时段',async()=>{
 const{document,run}=setup();position(document,'npc_hw_xuling');const taught=await succeed(run,document,'world_learn',{entity:'spell_earth_03',source:'npc_hw_xuling'},'earth-lesson');assert.equal(taught.document.state.spells.spell_earth_03.source.id,'npc_hw_xuling');assert.equal(taught.document.state.player.coins,document.state.player.coins-12);assert.equal(taught.document.state.npcs.npc_hw_xuling.coins,document.state.npcs.npc_hw_xuling.coins+12);assert.equal(taught.document.state.minute,660);
 const advanced=structuredClone(document);advanced.state.professions.combat='profession_mage';advanced.state.minute=780;const fire=await succeed(run,advanced,'world_learn',{entity:'spell_fire_07',source:'npc_hw_xuling'},'fire-lesson');assert.equal(fire.document.state.minute,1020);assert.equal(fire.document.state.player.coins,advanced.state.player.coins-40);
 const late=structuredClone(advanced);late.state.minute=1000;const saved=structuredClone(late);await assert.rejects(run(late,'world_learn',{entity:'spell_fire_07',source:'npc_hw_xuling'},'late-lesson'),/剩余服务时间/);assert.deepEqual(late,saved);
 await assert.rejects(run(advanced,'world_learn',{entity:'spell_summon_13',source:'npc_hw_xuling'},'unqualified'),/资格/);
});

test('旧档升级逐键保留钱物，只加从未登记的新书，耗尽零库存和重复升级不补货',()=>{
 const oldEngine=new WorldEngine(source),old=oldEngine.createCharacter(seed,{},'m4-upgrade');old.state.player.coins=173;old.state.npcs.npc_hw_luqing.coins=19;old.state.npcs.npc_hw_yanzhe.coins=23;old.state.npcs.npc_hw_yanzhe.inventory.item_wool=0;old.state.npcs.npc_hw_luqing.inventory.item_literacy_primer={quantity:1};old.state.npcs.npc_hw_luqing.inventory.item_book_m4_surface=0;old.state.npcs.npc_hw_yanzhe.inventory.item_book_m4_guard={quantity:2,durability:37,quality:'木'};
 const saved=structuredClone(old),incoming=compatibleWorld(source,world).world,plan=planWorldUpgrade(old,source,incoming,{worldHash:'m4-edition',eventId:'m4-content'}),after=applyPatches(old,plan.patches);
 assert.deepEqual(after.state.player,saved.state.player);assert.deepEqual(after.state.inventory,saved.state.inventory);assert.deepEqual(after.memories,saved.memories);
 for(const[id,npc]of Object.entries(saved.state.npcs)){const inventory={...after.state.npcs[id].inventory};for(const book of publication.sources.books)if(book.stock.owner===id&&!Object.hasOwn(npc.inventory,book.item.id))delete inventory[book.item.id];assert.deepEqual({...after.state.npcs[id],inventory},npc,id);}
 for(const book of publication.sources.books){const existing=saved.state.npcs[book.stock.owner].inventory[book.item.id];assert.deepEqual(after.state.npcs[book.stock.owner].inventory[book.item.id],existing===undefined?book.stock.quantity:existing);}
 const spent=structuredClone(after);spent.state.npcs.npc_hw_yanzhe.inventory.item_book_m4_guard=0;const repeat=planWorldUpgrade(spent,incoming,incoming,{worldHash:'m4-edition',eventId:'m4-repeat'});assert.equal(repeat.patches.some(p=>p.path[0]==='state'&&p.path[1]==='npcs'),false);assert.deepEqual(applyPatches(spent,repeat.patches).state.npcs,spent.state.npcs);
 assert.equal(plan.result.stockAdded.length,8);assert.deepEqual(repeat.result.stockAdded,[]);
 // Later boss batches remain installed while this batch adds its own four lairs.
 assert.deepEqual(Object.values(after.state.records).filter(r=>r.category==='lair'&&r.occupant?.kind==='boss').map(r=>r.occupant.definition).sort(),world.bosses.map(b=>b.id).sort());
 assert.deepEqual(after.state.creatures,saved.state.creatures);
});
