import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import{tmpRoot}from'../tools/tmp-root.mjs';
import path from 'node:path';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {CampaignStorage,applyPatches,digest} from '../server-plugin/storage.mjs';
import {validateWildlifeAwakening} from '../server-plugin/wildlife-awakening.mjs';
import {clockTransaction} from '../server-plugin/world-clock.mjs';
import {sceneCard} from '../server-plugin/scene-card.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';

const source=await loadWorld(),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8')),DAY=1440;
const wood='loc_hw_northwood',fox='monster_red_ear_fox',temple='bld_bs_still_temple',carve='skill_life_6_core',handle='recipe_tool_handle';
function setup(seed='spirit-test',edit=()=>{}){
    const world=structuredClone(source);for(const n of world.npcs){delete n.tier;delete n.schedule;}edit(world);
    const engine=new WorldEngine(world),doc=engine.createCharacter(legacy,{},seed);doc.state.minute=1200;doc.state.location=wood;
    const run=async(c,tool,args,id='e')=>{const out=await engine.reduce(c,{tool,args,eventId:id});return{doc:applyPatches(c,out.patches),result:out.result};};
    const wait=async(c,minutes,id='wait')=>(await run(c,'world_time',{minutes},id)).doc;
    return{world,engine,doc,run,wait};
}
async function track(s,doc,prefix){
    for(let i=0;i<80;i++){const out=await s.run(doc,'world_wildlife',{operation:'track',species:fox},`${prefix}${i}`);if(out.result.success)return{doc:out.doc,id:out.result.found.id};}
    throw Error('夹具没有找到成功追踪种子');
}
// T160 已覆盖开灵本身；这里把已追踪到的个体置为“玩家喂过灵物后立意”的同一身体。
function awaken(doc,id){
    const m=doc.state.minute;
    doc.state.creatures[id].mind={version:1,firstDay:0,points:{experience:0,place:0,item:100,mentor:0,clock:0},placeDays:{},
        sources:[{kind:'item',points:100,minute:m,event:'feed-fixture',item:'item_herb',by:'player'}],lastItemDay:0,
        awakened:{stage:'立意',kind:'item',minute:m,sourceEvent:'feed-fixture',formerOwner:null}};
}
function grantPermit(engine,doc){
    const entry=engine.rules.training.institutions.find(e=>e.institution===temple&&e.ritual!==undefined),r=doc.state.records;
    const init={category:'training_initiation',profession:entry.profession,teacher:entry.teacher,institution:temple,rule:entry.rule,observedSince:0,lastBreach:-1,status:'守戒中',sourceEvent:'init',cost:entry.initiationFee};
    r['training_initiation:init']=init;r['training_source:init']={initiation:structuredClone(init)};
    doc.state.careers??={};doc.state.careers[entry.profession]={initiation:{...init,record:'training_initiation:init'},certification:{teacher:entry.teacher}};
    doc.state.professions.combat=entry.profession;
    const permission={category:'authorization',action:'ritual_officiate',subject:'player',grantee:'player',grantor:entry.teacher,institution:temple,profession:engine.byId.get(entry.profession).name,professionId:entry.profession,deity:entry.deity??null,church:entry.church,createdAt:0,expires:doc.state.minute+30*DAY,revoked:false,sourceType:'training',sourceEvent:'grant',initiation:'training_initiation:init'};
    r['ritual_permission:grant']=permission;r['ritual_source:grant']={permission:structuredClone(permission)};
    assert.equal(digest(r['ritual_permission:grant']),digest(r['ritual_source:grant'].permission));
    return'ritual_permission:grant';
}
// 结缘的精怪：真实走 pact，玩家会木作与配方。
async function partner(seed='spirit-test',edit,premise){
    const s=setup(seed,edit),initial=premise?applyIntentSetup(s.engine,s.doc,premise):{document:s.doc,setupUnmet:[]};
    assert.deepEqual(initial.setupUnmet,[]);
    const {doc,id}=await track(s,initial.document,'t');awaken(doc,id);
    const pact=await s.run(doc,'world_wildlife',{operation:'pact',target:id},'pact');
    const c=pact.doc;c.state.skills[carve]={proficiency:400,grade:'初级2等',breakthroughs:[],daily:{}};c.state.recipes[handle]={source:{type:'teacher'},learnedAt:0};
    return{s,doc:c,id};
}
const body=a=>({hp:a.hp,maxHp:a.maxHp,level:a.level,species:a.species,ecology:a.ecology,owner:a.owner,name:a.name});
const nextDay=(s,c,id)=>s.wait(c,DAY-c.state.minute%DAY+600,id);

test('正式参数含借形代价与按季结社；缺代价或周期错误被拒',()=>{
    assert.deepEqual(validateWildlifeAwakening(source),[]);
    for(const change of [w=>w.rules.wildlifeAwakening.borrowForm.useItems=[],w=>w.rules.wildlifeAwakening.society.periodDays=30,w=>w.rules.wildlifeAwakening.society.homes=['loc_missing']]){
        const bad=structuredClone(source);change(bad);assert.ok(validateWildlifeAwakening(bad).length);
    }
});

test('真实教学和制作：按日修习，学会配方后由精怪代工，材料与工坊费出自玩家',async()=>{
    // Supply the same materials, purse and worn tool before any real action,
    // through native setup, so later crafting cannot diverge from its ledger.
    const {s,doc,id}=await partner('spirit-test',undefined,{coins:100,inventory:{item_wood:10,item_whittling_knife:1},itemInstances:[{id:'spirit-maker-knife',template:'thing',kind:'item',item:'item_whittling_knife',owner:'player',carriedBy:'player',location:wood,condition:50,inventoryBinding:{item:'item_whittling_knife',quantity:1,mode:'same_stock'}}]}),before=body(doc.state.creatures[id]);
    await assert.rejects(s.run(doc,'world_learn',{entity:handle,source:'player',student:id}),/还没修习过/);
    const lesson=await s.run(doc,'world_learn',{entity:carve,source:'player',student:id},'teach1');
    assert.equal(lesson.result.success,true);assert.equal(lesson.result.gained,40);assert.equal(lesson.doc.state.minute,doc.state.minute+120);
    assert.equal(lesson.doc.state.creatures[id].cultivation.skills[carve],40);
    await assert.rejects(s.run(lesson.doc,'world_learn',{entity:carve,source:'player',student:id}),/今天已经教过/);
    const stranger=structuredClone(doc);stranger.state.creatures[id].mind.sources=[];delete stranger.state.creatures[id].companion;
    await assert.rejects(s.run(stranger,'world_learn',{entity:carve,source:'player',student:id}),/没有往来/);
    let c=await nextDay(s,lesson.doc,'d1');
    const recipe=await s.run(c,'world_learn',{entity:handle,source:'player',student:id},'teach2');
    assert.ok(recipe.doc.state.creatures[id].cultivation.recipes[handle]);assert.equal(recipe.doc.state.creatures[id].cultivation.sessions.length,2);
    c=recipe.doc;
    // 跟随玩家进镇里的公共木作台；留守的不会跟来。
    const stay=await s.run(c,'world_wildlife',{operation:'stay',target:id},'stay');
    const alone=(await s.run(stay.doc,'world_move',{destination:'loc_hw'},'m0')).doc;assert.equal(alone.state.creatures[id].location,wood);
    c=(await s.run(c,'world_wildlife',{operation:'follow',target:id},'follow')).doc;
    c=(await s.run(c,'world_move',{destination:'loc_hw'},'m1')).doc;c=(await s.run(c,'world_move',{destination:'bld_hw_mill'},'m2')).doc;
    assert.equal(c.state.creatures[id].location,'bld_hw_mill');
    const unlearned=structuredClone(c);delete unlearned.state.creatures[id].cultivation.recipes[handle];
    await assert.rejects(s.run(unlearned,'world_craft',{operation:'manufacture',recipe:handle,maker:id}),/尚未学会/);
    const unbound=structuredClone(c);delete unbound.state.creatures[id].companion;
    await assert.rejects(s.run(unbound,'world_craft',{operation:'manufacture',recipe:handle,maker:id}),/结缘/);
    let made=null;
    for(let i=0;i<8&&!made;i++){
        const out=await s.run(c,'world_craft',{operation:'manufacture',recipe:handle,maker:id},`craft${i}`);
        assert.equal(out.doc.state.inventory.item_wood?.quantity??out.doc.state.inventory.item_wood,(c.state.inventory.item_wood?.quantity??c.state.inventory.item_wood)-1+out.result.salvage.reduce((n,r)=>n+r.amount,0));
        assert.equal(out.doc.state.player.coins,c.state.player.coins-2);
        const receipt=out.doc.state.crafted[`crafted_craft${i}`];assert.equal(receipt.maker,id);
        if(out.result.success){made=out;break;}
        assert.deepEqual(out.result.instances,[]);c=out.doc;
    }
    assert.ok(made,'八次代工应至少成功一次');
    const units=made.result.instances.map(unit=>made.doc.state.itemInstances[unit]);
    assert.ok(units.some(row=>row.item==='item_tool_handle'));for(const row of units){assert.equal(row.maker,id);assert.equal(row.owner,'player');}
    assert.deepEqual(body(made.doc.state.creatures[id]),before);
});

test('借形前后同一身体：须修习经历与仪式资格，每次借形付灵物，不默认化人、不改战力',async()=>{
    let {s,doc:c,id}=await partner('spirit-form');const before=body(c.state.creatures[id]),created=structuredClone(c.state.created?.[id]);
    for(let i=0;i<3;i++){
        await assert.rejects(s.run(c,'world_wildlife',{operation:'borrow_form',target:id}),/修习经历不足/);
        c=(await s.run(c,'world_learn',{entity:carve,source:'player',student:id},`lesson${i}`)).doc;c=await nextDay(s,c,`day${i}`);
    }
    await assert.rejects(s.run(c,'world_wildlife',{operation:'borrow_form',target:id}),/仪式主持资格/);
    const permit=grantPermit(s.engine,c);
    await assert.rejects(s.run(c,'world_wildlife',{operation:'borrow_form',target:id,permit}),/缺少/);
    c.state.inventory.item_herb=5;
    const rite=await s.run(c,'world_wildlife',{operation:'borrow_form',target:id,permit},'rite');
    assert.equal(rite.result.acquired,true);assert.equal(s.engine.quantity({get:(...p)=>p.reduce((v,k)=>v?.[k],rite.doc)},'player','item_herb'),2);
    assert.equal(rite.doc.state.creatures[id].form,undefined);assert.equal(rite.doc.state.creatures[id].cultivation.borrowForm.institution,temple);
    await assert.rejects(s.run(rite.doc,'world_wildlife',{operation:'borrow_form',target:id}),/没有默认形貌/);
    await assert.rejects(s.run(rite.doc,'world_wildlife',{operation:'borrow_form',target:id,species:fox}),/本相/);
    const human=await s.run(rite.doc,'world_wildlife',{operation:'borrow_form',target:id,species:'人形'},'shift');
    const shifted=human.doc.state.creatures[id];
    assert.equal(shifted.form.name,'人形');assert.equal(human.doc.state.minute,rite.doc.state.minute+30);
    assert.deepEqual(body(shifted),before);assert.deepEqual(human.doc.state.created?.[id],created);
    assert.equal(Object.keys(human.doc.state.creatures).length,Object.keys(c.state.creatures).length);
    const look=await s.run(human.doc,'world_wildlife',{operation:'observe'},'look');
    assert.equal(look.result.animals.find(a=>a.id===id).mind.form,'人形');
    const later=await s.wait(human.doc,360,'expire');
    assert.equal((await s.run(later,'world_wildlife',{operation:'observe'},'look2')).result.animals.find(a=>a.id===id).mind.form,undefined);
    assert.deepEqual(body(later.state.creatures[id]),before);
});

test('结缘后跟随与交谈：恩、点化与寻仇都绑定具体当事人；伤害结缘者即断缘',async()=>{
    const {s,doc,id}=await partner('spirit-talk');
    const talk=await s.run(doc,'world_wildlife',{operation:'talk',target:id},'talk1');
    const p=talk.result.spirit;
    assert.equal(talk.result.success,true);assert.equal(talk.doc.state.minute,doc.state.minute+10);
    assert.equal(p.companion.with,'player');assert.deepEqual(p.gratitude,[{party:'player',acts:['喂灵物'],firstEvent:'feed-fixture'}]);
    assert.deepEqual(talk.doc.state.creatures[id].mind.events.map(e=>[e.kind,e.party,e.event]),[['交谈','player','talk1']]);
    assert.match(sceneCard(s.engine,talk.doc),new RegExp(`【在场精怪】.*${id}.*与你结缘`));
    // 未立意的动物不能交谈。
    const wild=structuredClone(doc);delete wild.state.creatures[id].mind.awakened;
    await assert.rejects(s.run(wild,'world_wildlife',{operation:'talk',target:id}),/尚未立意/);
    const follow=await s.run(talk.doc,'world_wildlife',{operation:'follow',target:id},'f');
    assert.equal(follow.doc.state.creatures[id].companion.following,true);
    const hurt=structuredClone(follow.doc);
    const {recordSpiritGrudge}=await import('../server-plugin/wildlife-society.mjs');
    const d={document:hurt,get:(...p)=>p.reduce((v,k)=>v?.[k],hurt),set:(p,v)=>{let o=hurt;for(const k of p.slice(0,-1))o=o[k];o[p.at(-1)]=v;},remove:p=>{let o=hurt;for(const k of p.slice(0,-1))o=o[k];delete o[p.at(-1)];}};
    recordSpiritGrudge(d,id,'player','hit1',3);
    assert.equal(hurt.state.creatures[id].companion,undefined);
    const again=await s.run(hurt,'world_wildlife',{operation:'talk',target:id},'talk2');
    assert.deepEqual(again.result.spirit.grudges.map(g=>[g.party,g.event]),[['player','hit1']]);
    await assert.rejects(s.run(hurt,'world_wildlife',{operation:'follow',target:id}),/未与你结缘/);
});

test('结社：季度检查成社，重复推进无重复人口与库存；离群与再入；口粮或地点不足则游居；时钟效果入现存之乡',async t=>{
    const {s,doc,id}=await partner('spirit-society');
    const second=await track(s,doc,'u'),other=second.id;let c=second.doc;awaken(c,other);
    c=(await s.run(c,'world_wildlife',{operation:'settle',target:id},'settle')).doc;
    assert.deepEqual(c.state.creatures[id].mind.settle.location,wood);
    const start=structuredClone(c),until=(Math.floor(c.state.minute/DAY/90)+1)*90*DAY+5-c.state.minute;
    const directory=await fs.mkdtemp(path.join(tmpRoot(),'spirit-store-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
    const reducer=(x,input,options)=>s.engine.reduce(x,input,options),store=new CampaignStorage(directory,{reducer});
    await store.create({id:'spirit',worldVersion:s.engine.world.version,document:start});
    for(let left=until,i=0;left>0;left-=30*DAY,i++)await store.transact('spirit',{id:`q1-${i}`,anchor:'a1',input:{tool:'world_time',args:{minutes:Math.min(30*DAY,left)},eventId:`q1-${i}`}},reducer);
    const q1=(await store.read('spirit')).document,key=`spirit_society:${wood}`,row=q1.state.records[key];
    assert.equal(row.kind,'formed');assert.deepEqual(Object.keys(row.members).sort(),[id,other].sort());
    assert.equal(q1.state.creatures[id].society.id,key);assert.equal(q1.state.creatures[id].mind.settle,undefined);
    assert.equal(row.food.kind,'habitat');
    assert.deepEqual((await new CampaignStorage(directory,{reducer}).read('spirit')).document,q1);
    assert.deepEqual((await store.import(await store.export('spirit'),'copy')).document,q1);
    // 第二个季度：成员、人口、库存与物品单件都不重复。
    let q2=q1;for(let i=0;i<3;i++)q2=await s.wait(q2,30*DAY,`q2-${i}`);
    assert.deepEqual(q2.state.records[key].members,row.members);assert.equal(q2.state.records[key].history.length,1);
    assert.equal(Object.keys(q2.state.creatures).length,Object.keys(q1.state.creatures).length);
    assert.deepEqual(q2.state.inventory,q1.state.inventory);assert.deepEqual(Object.keys(q2.state.itemInstances??{}),Object.keys(q1.state.itemInstances??{}));
    assert.deepEqual(Object.keys(q2.state.created??{}),Object.keys(q1.state.created??{}));
    // 离群：结缘者离开后不会被下一季自动拉回；再表定居意愿才并入。
    await assert.rejects(s.run(q2,'world_wildlife',{operation:'leave',target:other}),/未与你结缘/);
    const left=await s.run(q2,'world_wildlife',{operation:'leave',target:id},'leave');
    assert.equal(left.doc.state.creatures[id].society,undefined);assert.deepEqual(Object.keys(left.doc.state.records[key].members),[other]);
    const consumer=s.engine.factionEffectConsumers.spirit_society,context={minute:left.doc.state.minute,sourceEvent:'faction-clock:test'};
    const apply=(x,effect)=>{const d={document:x,set(){},remove(){},say(){}};return clockTransaction(d,tx=>consumer.apply(tx,s.engine,effect,context));};
    assert.equal(apply(left.doc,{kind:'spirit_society',location:wood}).applied,false);
    const back=await s.run(left.doc,'world_wildlife',{operation:'settle',target:id},'resettle');
    const joined=apply(back.doc,{kind:'spirit_society',location:wood});
    assert.equal(joined.applied,true);assert.deepEqual(joined.joined,[{society:key,location:wood,members:[id]}]);
    // 口粮不足：同一地点的未见种群清零后保持游居。
    const hungry=structuredClone(back.doc);for(const p of Object.values(hungry.state.records['ecology:habitat_hw_wood'].populations))p.count=0;
    const starving=apply(hungry,{kind:'spirit_society',location:wood});
    assert.equal(starving.applied,false);
    // 不可居住的镇上：单个游居者不成社；登记为精怪之乡的地点一名即可并入。
    const town=structuredClone(left.doc);town.state.creatures[id].location='loc_hw';town.state.creatures[id].mind.settle={location:'loc_hw'};
    assert.equal(apply(town,{kind:'spirit_society',location:'loc_hw'}).applied,false);
    const h=setup('spirit-home',w=>{w.rules.wildlifeAwakening.society.homes=['loc_hw'];});
    const home=h.engine.factionEffectConsumers.spirit_society;
    const hd={document:town,set(){},remove(){},say(){}};
    const merged=clockTransaction(hd,tx=>home.apply(tx,h.engine,{kind:'spirit_society',location:'loc_hw'},context));
    assert.equal(merged.applied,true);assert.equal(merged.joined[0].society,'spirit_society:loc_hw');
    assert.throws(()=>home.validate(h.engine,{kind:'spirit_society',location:'loc_missing'}),/未登记/);
});
