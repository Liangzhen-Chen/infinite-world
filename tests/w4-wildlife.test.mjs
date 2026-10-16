import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import{tmpRoot}from'../tools/tmp-root.mjs';
import path from 'node:path';
import {loadWorld} from '../tools/load-world.mjs';
import {highWildlifeFoundation,withHighWildlife} from '../world/design/high-wildlife-foundation.mjs';
import {wildlifeContext,validateWildlifeDraft,numberValue} from '../tools/w4-content.mjs';
import {auditPopulations} from '../tools/w4-audit-ecology.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {WorldRegistry} from '../server-plugin/world-registry.mjs';
import {archivedReducer} from '../server-plugin/archived-reducer.mjs';
import {CampaignStorage} from '../server-plugin/storage.mjs';
import {validateWorld} from '../tools/validate-world.mjs';
const world=await loadWorld(),bones=highWildlifeFoundation();
const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));

test('高阶骨架有100物种及14可达栖地，三至九阶、领地性和生态引用有效',()=>{
    const candidate=withHighWildlife(world);
    assert.equal(bones.monsters.length,100);assert.equal(bones.locations.length,14);
    assert.deepEqual([...new Set(bones.monsters.map(s=>s.template))],[3,4,5,6,7,8,9]);
    assert.ok(bones.monsters.every(s=>s.territoriality&&s.wildlife.distinction));
    const result=validateWorld(candidate);assert.deepEqual(result.errors,[]);
});

test('图鉴L1拒绝反向作息、虚构数字和新商品，长度只标记抽读',()=>{
    const bone=bones.monsters.find(s=>s.id==='monster_needle_mane_stag'),context=wildlifeContext(bone,world);
    const row={id:bone.id,appearance:'肩鬃向前倒伏。',habits:`06:00至18:00活动，${bone.grouping}沿砾坡啃草。`,threat:'围堵幼体时会低头示警。',materials:'处理留下湿生皮。',folklore:'磨角石被说成路标，其实是角根反复摩擦留下的亮面。',voice:'磨角时蹄底擦过石子。'};
    assert.equal(validateWildlifeDraft(row,bone,context).errors.length,0);
    assert.ok(validateWildlifeDraft(row,bone,context).warnings.length);
    for(const bad of [{...row,habits:row.habits.replace('06:00至18:00','18:00至06:00')},{...row,habits:row.habits.replace('06:00至18:00','06:00与18:00两个时刻')},{...row,materials:'drops为空。'},{...row,materials:'处理需999分钟。'},{...row,materials:'湿生皮保存九百九十九天。'},{...row,materials:'湿生皮每份三百公斤。'},{...row,threat:'会追出十公里。'},{...row,materials:'把湿生皮晒干。'}])assert.ok(validateWildlifeDraft(bad,bone,context).errors.length);
    assert.equal(numberValue('一百二十'),120);assert.equal(numberValue('二十五'),25);
});

test('world_upgrade把新物种引入已有战役，日结补栖地不改旧账本，并可重放',async t=>{
    const ids=new Set(bones.monsters.map(s=>s.id)),locations=new Set(bones.locations.map(l=>l.id));
    const old=structuredClone(world);old.monsters=old.monsters.filter(s=>!ids.has(s.id));old.locations=old.locations.filter(l=>!locations.has(l.id));
    old.routes=old.routes.filter(r=>!locations.has(r.to)&&!locations.has(r.from));old.rules.wildlife.habitats=old.rules.wildlife.habitats.filter(h=>!locations.has(h.location));
    old.rules.weather.regions=old.rules.weather.regions.filter(r=>!r.locations.some(l=>locations.has(l)));
    const next=withHighWildlife(old),root=await fs.mkdtemp(path.join(tmpRoot(),'w4-upgrade-'));
    t.after(()=>fs.rm(root,{recursive:true,force:true}));
    const registry=new WorldRegistry(path.join(root,'worlds')),reducer=archivedReducer(registry),store=new CampaignStorage(path.join(root,'campaigns'),{reducer});
    const oldHash=await registry.put(old),newHash=await registry.put(next),doc=new WorldEngine(old).createCharacter(seed,{},'w4-upgrade');
    doc.worldHash=oldHash;const original=structuredClone(doc);await store.create({id:'test',worldVersion:old.version,document:doc});
    await store.transact('test',{id:'upgrade',input:{type:'world_upgrade',worldHash:newHash,eventId:'upgrade'}},reducer);
    assert.deepEqual(auditPopulations((await store.read('test')).document,bones),[]);
    await store.transact('test',{id:'inspect',input:{tool:'world_turn',args:{outOfCharacter:true},eventId:'inspect'}},reducer);
    const current=await store.read('test');
    assert.deepEqual(current.document.state.player,original.state.player);assert.deepEqual(current.document.state.inventory,original.state.inventory);
    assert.equal(current.document.state.minute,original.state.minute);assert.deepEqual(current.document.memories,original.memories);
    assert.deepEqual(auditPopulations(current.document,bones),[]);
    // Later derived habitats also gain this batch's species. Existing species
    // retain every ledger field; only the newly introduced IDs may be added.
    for(const [key,record]of Object.entries(original.state.records).filter(([,r])=>r.category==='ecology')){
        const updated=current.document.state.records[key],{populations,...metadata}=record;
        const {populations:nextPopulations,...nextMetadata}=updated;
        assert.deepEqual(nextMetadata,metadata,key);
        for(const [id,row]of Object.entries(populations))assert.deepEqual(nextPopulations[id],row,`${key}/${id}`);
        for(const id of Object.keys(nextPopulations).filter(id=>!Object.hasOwn(populations,id)))assert.ok(ids.has(id),`${key}/${id}`);
    }
    const replay=await new CampaignStorage(path.join(root,'campaigns'),{reducer}).read('test');assert.deepEqual(replay.document,current.document);
});
