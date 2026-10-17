import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import{tmpRoot}from'../tools/tmp-root.mjs';
import path from 'node:path';
import {loadWorld}from'../tools/load-world.mjs';
import {withM5LawRules}from'../world/design/m5-law-rules.mjs';
import {WorldEngine}from'../server-plugin/engine.mjs';
import {applyPatches,CampaignStorage}from'../server-plugin/storage.mjs';
import {shareNpcMemory}from'../server-plugin/npc-cognition.mjs';
import {localOpinion,npcOpinions,opinionAmong}from'../server-plugin/public-opinion.mjs';
import {npcContext}from'../server-plugin/npc-memory.mjs';
import {adjustStanding}from'../server-plugin/standing.mjs';

const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const baseWorld=await loadWorld();
const victim='npc_hw_linsui',carrier='npc_hw_hezhou',guard='npc_hw_gucen',judge='npc_hw_chenbai',friend='faction_saltboat',enemy='faction_riverhomes';
const draft=document=>({document,get(...k){return k.reduce((o,x)=>o?.[x],this.document);},set(path,value){this.document=applyPatches(this.document,[{op:'set',path,value}]);}});
const topicAt=(c,engine,place,topic)=>localOpinion(engine,c,place).topics.find(t=>t.topic===topic);
const stanceOf=(c,engine,id,topic)=>npcOpinions(engine,c,id).find(row=>row.topic===topic)?.stance;

function lawSetup(){
    const world=withM5LawRules(structuredClone(baseWorld));
    for(const npc of world.npcs)if([victim,carrier,guard,judge].includes(npc.id)){delete npc.schedule;if(npc.id!==carrier)delete npc.tier;}
    world.rules.reputation.factions.find(row=>row.id===friend).members=[judge];
    world.rules.reputation.factions.find(row=>row.id===enemy).members=[carrier];
    world.rules.law.codes[0].faction=friend;
    const engine=new WorldEngine(world),document=engine.initialFromLegacy(seed,'public-opinion');
    document.state.location='bld_hw_qingdeng';document.state.npcs[victim].inventory.item_bread=4;document.state.npcs[guard].location=document.state.location;
    const run=async(c,tool,args,eventId)=>{const out=await engine.reduce(c,{tool,args,eventId});return{document:applyPatches(c,out.patches),result:out.result};};
    return{engine,run,law:(c,args,id)=>run(c,'world_law',args,id),document};
}
// A judged theft whose public notice is carried by a real walker to 白石镇.
async function judged(f){
    let out=await f.run(f.document,'world_crime',{operation:'steal',target:victim,coins:1},'theft'),c=out.document;const id=out.result.case;
    c.state.npcs[guard].location=c.state.location;
    c=(await f.law(c,{operation:'confess',case:id,authority:guard},'confess')).document;
    c=(await f.run(c,'world_move',{destination:'bld_hw_council'},'court')).document;
    c.state.npcs[judge].location='bld_hw_council';c.state.npcs[carrier].location='loc_bs';
    c=(await f.law(c,{operation:'hear',case:id,authority:judge},'hear')).document;
    c.state.npcs[victim].location=c.state.location;
    c=(await f.law(c,{operation:'publish',case:id,authority:judge},'notice')).document;
    return{c,id,topic:`case:${id}`};
}

test('同一裁判经真实携信传到两地，形成不同支持/反对比例，没获知的人不计入',async()=>{
    const f=lawSetup();let{c,id,topic}=await judged(f);
    assert.equal(stanceOf(c,f.engine,victim,topic),'oppose');assert.equal(stanceOf(c,f.engine,judge,topic),'oppose');
    // Before any carrier arrives 白石镇 has no opinion at all, only unaware people.
    assert.equal(topicAt(c,f.engine,'loc_bs',topic),undefined);assert.equal(stanceOf(c,f.engine,carrier,topic),undefined);
    const notice=c.state.npcs[victim].memoryStream.find(m=>m.legalCase===id);
    const sent=await f.law(c,{operation:'notify',case:id,from:victim,to:carrier,memory:notice.id,channel:'carry'},'carry');
    c=(await f.run(sent.document,'world_time',{minutes:sent.result.arrive-sent.document.state.minute-1},'almost')).document;
    assert.equal(topicAt(c,f.engine,'loc_bs',topic),undefined);
    c=(await f.run(c,'world_time',{minutes:1},'arrive')).document;
    const hw=topicAt(c,f.engine,'loc_hw',topic),bs=topicAt(c,f.engine,'loc_bs',topic),bsAll=localOpinion(f.engine,c,'loc_bs');
    // 白石镇: only the carrier heard it; his faction holds the offender in good standing.
    // 白石镇: the carrier heard it (his faction favours the offender); the victim
    // who walked the letter there opposes. Nobody else there counts.
    assert.equal(bs.known,2);assert.deepEqual(bs.ratio,{support:50,oppose:50});
    assert.equal(bs.unaware,bsAll.population-2);assert.ok(bsAll.population>2);
    const heard=bs.views.find(v=>v.npc===carrier);assert.equal(heard.stance,'support');assert.equal(heard.sourceType,'听说');assert.match(heard.basis,/声望/);
    // 河湾: the judge, her friend, witnessed the case and opposes; nobody there supports.
    assert.ok(hw.known>=1);assert.equal(hw.support,0);assert.equal(hw.ratio.support,0);
    assert.ok(hw.views.some(v=>v.npc===judge&&v.stance==='oppose'&&v.basis==='与受影响者交好'));assert.notDeepEqual(hw.ratio,bs.ratio);
    for(const t of[hw,bs])for(const v of t.views)assert.ok(c.state.npcs[v.npc].memoryStream.some(m=>m.legalCase===id),`${v.npc}须实际获知`);
    // Removing a person's memory removes them from the count rather than defaulting a view.
    const forgot=structuredClone(c);forgot.state.npcs[carrier].cognition={blurred:Object.fromEntries(forgot.state.npcs[carrier].memoryStream.map(m=>[m.id,{content:'细节已经模糊'}]))};
    assert.deepEqual(topicAt(forgot,f.engine,'loc_bs',topic).views.map(v=>v.npc),[victim]);
    assert.equal(npcContext(f.engine,c,carrier).opinions[0].stance,'support');
});

test('撤判消息实际抵达后看法才改变；重放与存档恢复得到同一舆论',async t=>{
    const f=lawSetup();let{c,id,topic}=await judged(f);
    const notice=c.state.npcs[victim].memoryStream.find(m=>m.legalCase===id);
    const directory=await fs.mkdtemp(path.join(tmpRoot(),'public-opinion-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
    const reducer=(doc,input)=>f.engine.reduce(doc,input),store=new CampaignStorage(directory,{reducer});
    await store.create({id:'opinion',worldVersion:f.engine.world.version,document:c});
    let receipt=await store.transact('opinion',{id:'carry',input:{tool:'world_law',args:{operation:'notify',case:id,from:victim,to:carrier,memory:notice.id,channel:'carry'},eventId:'carry'}},reducer);
    await store.transact('opinion',{id:'arrive',input:{tool:'world_time',args:{minutes:receipt.result.arrive-c.state.minute},eventId:'arrive'}},reducer);
    c=(await store.read('opinion')).document;
    assert.equal(stanceOf(c,f.engine,carrier,topic),'support');
    // Overturn in 河湾; locally the view changes at once, 白石镇 keeps the old view.
    c.state.records[id].evidence.forEach(e=>{e.disproven=true;});c.state.npcs[judge].location=c.state.location;
    c=(await f.law(c,{operation:'appeal',case:id,authority:judge},'overturn')).document;
    assert.equal(stanceOf(c,f.engine,judge,topic),'neutral');assert.equal(stanceOf(c,f.engine,carrier,topic),'support');
    c.state.npcs[victim].location=c.state.location;c=(await f.law(c,{operation:'publish',case:id,authority:judge},'correction')).document;
    const correction=c.state.npcs[victim].memoryStream.find(m=>m.legalStage==='overturned');
    assert.equal(stanceOf(c,f.engine,victim,topic),'neutral');
    const prepared=structuredClone(c),store2=new CampaignStorage(directory,{reducer});
    await store2.create({id:'correction',worldVersion:f.engine.world.version,document:prepared});
    receipt=await store2.transact('correction',{id:'correction_carry',input:{tool:'world_law',args:{operation:'notify',case:id,from:victim,to:carrier,memory:correction.id},eventId:'correction_carry'}},reducer);
    const left=receipt.result.arrive-prepared.state.minute;
    await store2.transact('correction',{id:'before_arrival',input:{tool:'world_time',args:{minutes:left-1},eventId:'before_arrival'}},reducer);
    let live=(await store2.read('correction')).document;
    assert.equal(stanceOf(live,f.engine,carrier,topic),'support');
    await store2.transact('correction',{id:'corrected',input:{tool:'world_time',args:{minutes:1},eventId:'corrected'}},reducer);
    live=(await store2.read('correction')).document;
    assert.equal(stanceOf(live,f.engine,carrier,topic),'neutral');assert.deepEqual(topicAt(live,f.engine,'loc_bs',topic).ratio,{support:0,oppose:0});
    // Restart: the campaign is rebuilt from its event chain and gives the same opinion.
    const restored=(await new CampaignStorage(directory,{reducer}).read('correction')).document;
    assert.deepEqual(restored,live);
    for(const place of['loc_hw','loc_bs'])assert.deepEqual(localOpinion(f.engine,restored,place),localOpinion(f.engine,live,place));
    // Replaying the same input on the prepared save reproduces the same opinion.
    const copy=await store2.import(await store2.export('correction'),'copy');
    assert.deepEqual(localOpinion(f.engine,copy.document,'loc_bs'),localOpinion(f.engine,live,'loc_bs'));
    const first=await f.engine.reduce(prepared,{tool:'world_law',args:{operation:'notify',case:id,from:victim,to:carrier,memory:correction.id},eventId:'correction_carry'});
    const replay=await f.engine.reduce(prepared,{tool:'world_law',args:{operation:'notify',case:id,from:victim,to:carrier,memory:correction.id},eventId:'correction_carry'},{replay:true,result:first.result});
    assert.deepEqual(applyPatches(prepared,replay.patches),applyPatches(prepared,first.patches));
});

test('议事读取在场者实际获知的看法：未获知、不在场者不计入，闭合时留下当时在场的看法',async()=>{
    const village=baseWorld.settlementProfiles.filter(p=>p.details?.governance?.appointment)[0];
    const w=structuredClone(baseWorld);for(const n of w.npcs)delete n.schedule;
    const engine=new WorldEngine(w),doc=engine.createCharacter(seed,{},'opinion-governance');
    const {head,meetingPlace}=village.details.governance,steward=village.details.governance.coordinators.find(id=>id!==head);
    const speaker=village.details.problems[0].stakeholders.map(p=>p.person).find(id=>id!==head&&id!==steward);
    const friends=engine.byId.get(head).relationships.filter(r=>r.trust>=20).map(r=>r.with);
    const victimFriend=friends[0],elsewhere=Object.keys(doc.state.npcs).find(id=>id.startsWith('npc_yp_')&&![head,steward,speaker,victimFriend].includes(id));
    doc.state.location=meetingPlace;doc.state.minute=540;
    for(const id of[head,steward,speaker]){doc.state.npcs[id].location=meetingPlace;doc.state.npcs[id].activity='议事';}
    doc.state.npcs[elsewhere].location=village.id;
    const fight={id:'brawl:conflict',sourceEvent:'brawl',kind:'conflict',minute:500,location:village.id,participants:['player',victimFriend],
        content:'旅人与人交锋，对方受伤3，自己受伤0',sourceType:'目击',salience:4,emotion:'警惕'};
    doc.state.npcs[head].memoryStream=[fight];doc.state.npcs[elsewhere].memoryStream=[fight];
    const run=async(c,args,eventId)=>{const out=await engine.reduce(c,{tool:'world_settlement',args:{settlement:village.id,...args},eventId});return{document:applyPatches(c,out.patches),result:out.result};};
    let view=(await run(doc,{operation:'governance_inspect'},'inspect')).result.publicOpinion;
    assert.deepEqual(view.topics.map(t=>[t.topic,t.known,t.oppose,t.unaware]),[['event:brawl',1,1,2]]);
    assert.deepEqual(view.topics[0].views.map(v=>v.npc),[head]);
    // Retelling along an existing relation makes the listener a knower with their own view.
    const draft={document:doc,get(...p){return p.reduce((x,k)=>x?.[k],this.document);},set(p,v){this.document=applyPatches(this.document,[{op:'set',path:p,value:v}]);},remove(p){this.document=applyPatches(this.document,[{op:'delete',path:p}]);}};
    assert.equal(shareNpcMemory(draft,engine,{from:head,to:speaker,memoryId:fight.id,eventId:'tell'}).delivered,true);
    let c=draft.document;
    view=(await run(c,{operation:'governance_inspect'},'inspect2')).result.publicOpinion;
    const t=view.topics[0];assert.equal(t.known,2);assert.equal(t.unaware,1);assert.equal(t.views.find(v=>v.npc===speaker).sourceType,'听说');
    assert.equal(t.views.find(v=>v.npc===head).stance,'oppose');
    assert.ok(!t.views.some(v=>v.npc===steward||v.npc===elsewhere));
    // The village-wide count includes the absent knower; the hall count does not.
    assert.equal(localOpinion(engine,c,village.id).topics[0].known,3);
    assert.deepEqual(opinionAmong(engine,c,[steward]),[]);
    assert.match(engine.scene(c,''),/【本地舆论，只计实际获知者】/);
    const made=await run(c,{operation:'governance_propose',plot:village.details.problems[0].location,issue:village.details.problems[0].id,name:'核对冲突后的赔偿',days:1},'proposal');c=made.document;
    for(const id of new Set([...made.document.state.records[made.result.proposal].affected]))if(c.state.npcs[id].location===meetingPlace)
        c=(await run(c,{operation:'governance_opinion',proposal:made.result.proposal,speaker:id,opinion:'reject',content:'先赔礼再议'},`op_${id}`)).document;
    const closed=await run(c,{operation:'governance_close',authority:head,proposal:made.result.proposal},'close');
    assert.deepEqual(closed.result.meeting.publicOpinion.topics,view.topics);
    assert.deepEqual(closed.document.state.records[made.result.proposal].publicOpinion.present,view.present);
});

test('聚居地成员只在消息送达后获知，看法沿用聚居地对受害方的既有态度',()=>{
    const world=structuredClone(baseWorld),boss=structuredClone(world.bosses.find(b=>b.intelligence>0)),seat='loc_po_seat',hall='site_po_hall';
    const leader='npc_hw_linsui',member='npc_hw_fanrong';
    Object.assign(boss,{id:'boss_po_leader',name:'测试窟主',aliases:[],actor:leader,lair:hall,minions:[],residence:{id:'lair_po',name:'测试驻地',location:hall}});
    world.bosses.push(boss);
    world.locations.push({id:seat,name:'测试窟',aliases:[],parent:'loc_hw',scope:'loc_hw',coordinates:[3,0],terrain:'丘陵',monsterSociety:{leader:boss.id,neighbors:{loc_hw:'敌对'},meetingPlace:hall}},
        {id:hall,name:'测试窟厅',aliases:[],parent:seat,scope:'loc_hw',coordinates:[3,0],terrain:'丘陵'});
    for(const id of[leader,member])Object.assign(world.npcs.find(n=>n.id===id),{species:boss.monster,society:seat,settlement:seat});
    const engine=new WorldEngine(world),doc=engine.createCharacter(seed,{},'opinion-society');
    for(const id of[leader,member])doc.state.npcs[id].location=hall;
    doc.state.minute=1000;
    const news={category:'society_news',from:'loc_hw',to:seat,actor:'player',victim:'loc_hw',act:'harm',sourceEvent:'raid_hw',sentAt:900,arrivesAt:1100,status:'在途'};
    doc.state.records['society_news:raid_hw:'+seat]=news;
    assert.deepEqual(localOpinion(engine,doc,seat).topics,[]);
    const arrived=structuredClone(doc);arrived.state.minute=1100;arrived.state.records['society_news:raid_hw:'+seat]={...news,status:'已送达'};
    const t=localOpinion(engine,arrived,seat).topics[0];
    assert.equal(t.topic,'event:raid_hw');assert.equal(t.known,2);assert.equal(t.support,2);assert.equal(t.views[0].basis,'与受影响者敌对');
    // A friendly settlement holds the opposite view of the same deed.
    const friendly=structuredClone(arrived);friendly.state.records[`stance:${seat}:loc_hw`]={category:'settlement_stance',holder:seat,target:'loc_hw',stance:'中立',history:[]};
    assert.equal(localOpinion(engine,friendly,seat).topics[0].neutral,2);
});

test('聚居地对行事者的显式立场（立场账本）照常计入成员舆论；缺省戒备不计',()=>{
    const world=structuredClone(baseWorld),boss=structuredClone(world.bosses.find(b=>b.intelligence>0)),seat='loc_po_seat',hall='site_po_hall';
    const leader='npc_hw_linsui',member='npc_hw_fanrong';
    Object.assign(boss,{id:'boss_po_leader',name:'测试窟主',aliases:[],actor:leader,lair:hall,minions:[],residence:{id:'lair_po',name:'测试驻地',location:hall}});
    world.bosses.push(boss);
    world.locations.push({id:seat,name:'测试窟',aliases:[],parent:'loc_hw',scope:'loc_hw',coordinates:[3,0],terrain:'丘陵',monsterSociety:{leader:boss.id,neighbors:{loc_hw:'敌对'},meetingPlace:hall}},
        {id:hall,name:'测试窟厅',aliases:[],parent:seat,scope:'loc_hw',coordinates:[3,0],terrain:'丘陵'});
    for(const id of[leader,member])Object.assign(world.npcs.find(n=>n.id===id),{species:boss.monster,society:seat,settlement:seat});
    const engine=new WorldEngine(world),doc=engine.createCharacter(seed,{},'opinion-standing');
    for(const id of[leader,member])doc.state.npcs[id].location=hall;
    doc.state.minute=1100;
    doc.state.records['society_news:raid_hw:'+seat]={category:'society_news',from:'loc_hw',to:seat,actor:'player',victim:'loc_hw',act:'harm',sourceEvent:'raid_hw',sentAt:900,arrivesAt:1100,status:'已送达'};
    // 对受害方持中立：不触发“与受影响者敌对”，落到所属组织立场这一支。
    doc.state.records[`stance:${seat}:loc_hw`]={category:'settlement_stance',holder:seat,target:'loc_hw',stance:'中立',history:[]};
    const topic=document=>localOpinion(engine,document,seat).topics[0];
    const neutral=topic(doc);assert.equal(neutral.neutral,2,'只有缺省戒备：与双方无利害');
    const withStanding=delta=>{const d=draft(structuredClone(doc));adjustStanding(d,engine,seat,'player',delta,{sourceEvent:'relief',reason:'救灾'});return d.document;};
    const liked=topic(withStanding(60));assert.equal(liked.support,2);assert.equal(liked.views[0].basis,'所属测试窟对行事者的立场');
    const disliked=topic(withStanding(-10));assert.equal(disliked.oppose,2);assert.equal(disliked.views[0].basis,'所属测试窟对行事者的立场');
});
