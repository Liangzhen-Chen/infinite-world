import test from'node:test';
import assert from'node:assert/strict';
import fs from'node:fs/promises';
import os from'node:os';
import path from'node:path';
import {loadWorld}from'../tools/load-world.mjs';
import {loadPromptBundle}from'../tools/build-card.mjs';
import {validateWorld}from'../tools/validate-world.mjs';
import {WorldEngine}from'../server-plugin/engine.mjs';
import {applyPatches,CampaignStorage}from'../server-plugin/storage.mjs';
import {planRuleStateMigration}from'../server-plugin/rule-state-migration.mjs';
import {readBossNegotiation,validateBossNegotiation}from'../server-plugin/boss-negotiation.mjs';
import {toolDefinitions,resolveToolCall}from'../extension/tools.mjs';
const source=await loadWorld(),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const target='boss_shadow_sentinel',lair='lair_shadow_sentinel';
function setup({goal='defend_territory',stock=true}={}){
    const world=structuredClone(source),boss=world.bosses.find(b=>b.id===target);
    boss.cognition={goal,territory:[boss.lair]};
    if(stock)boss.negotiation={stock:[{item:'item_oats',quantity:2}],accepts:['item_ration','item_mining_pick']};
    const engine=new WorldEngine(world),fresh=engine.createCharacter(legacy,{},'boss-negotiation');
    const document=applyPatches(fresh,planRuleStateMigration(fresh,world.rules));
    document.state.location=boss.lair;document.state.player.hp=10000;document.state.player.maxHp=10000;
    document.state.inventory.item_ration={quantity:10,quality:'木',durability:100,weight:.2};
    const run=async(doc,args,eventId='deal',tool='world_lair')=>{
        const out=await engine.reduce(doc,{tool,args,eventId});return{document:applyPatches(doc,out.patches),result:out.result};
    };
    const enter=async(doc=document)=> (await run(doc,{operation:'approach',lair},'enter')).document;
    return{world,boss,engine,document,run,enter};
}
const deal=extra=>({operation:'negotiate',lair,pact:'respect_territory',offer:[{item:'干粮',quantity:1}],request:[{item:'燕麦',quantity:1}],...extra});
const n=doc=>doc.state.creatures[target].negotiation;
const qty=(doc,item)=>doc.state.inventory[item]?.quantity??0;

test('公开分组工具能向已有首领提条件，按目录价值交换并保存盟约',async()=>{
    const{run,enter}=setup(),doc=await enter(),before=structuredClone(doc);
    const args=deal({operation:'lair_negotiate',alliance:true});
    assert.equal(resolveToolCall('world_field',args).tool,'world_lair');
    const out=await run(doc,args,'deal','world_field');assert.equal(out.result.accepted,true);
    assert.deepEqual(out.result.accepts,['item_ration','item_mining_pick']);
    assert.deepEqual(doc,before);assert.equal(qty(out.document,'item_ration'),9);assert.equal(qty(out.document,'item_oats'),1);
    assert.equal(n(out.document).inventory.item_oats.quantity,1);assert.equal(n(out.document).inventory.item_ration.quantity,1);
    assert.deepEqual(out.result.relation,{pact:'respect_territory',alliance:true,event:'deal'});
    assert.equal(out.document.state.player.coins,doc.state.player.coins);assert.equal(out.document.state.minute,doc.state.minute);
    assert.equal(out.document.state.creatures[target].owner,null);
    const view=await run(out.document,{operation:'observe',lair},'view');
    assert.equal(view.result.occupant.cognition.attitude,'盟约有效');assert.deepEqual(view.result.occupant.cognition.relation,out.result.relation);
    assert.deepEqual(view.document,out.document);
    const again=await run(out.document,deal({alliance:true}));assert.deepEqual(again.document,out.document);
    await assert.rejects(run(out.document,deal({alliance:false})),/编号冲突/);
});

test('守界目标拒绝不守界条件，回避目标接受互不攻击，拒绝也记住原条款',async()=>{
    const keeper=setup(),doc=await keeper.enter();
    const out=await keeper.run(doc,deal({pact:'nonaggression'}));
    assert.equal(out.result.accepted,false);assert.match(out.result.reason,/守住领地/);
    assert.deepEqual(out.document.state.inventory,doc.state.inventory);assert.deepEqual(n(out.document).inventory,n(doc).inventory);
    assert.equal(n(out.document).relation,null);assert.equal(n(out.document).history.length,1);
    const avoider=setup({goal:'avoid_conflict'}),other=await avoider.enter();
    const accepted=await avoider.run(other,deal({pact:'nonaggression',alliance:true}));
    assert.equal(accepted.result.accepted,true);assert.match(accepted.result.reason,/避免冲突/);
    const denied=await avoider.run(accepted.document,deal({offer:[],request:[{item:'item_oats',quantity:1}]}),'cheap');
    assert.equal(denied.result.accepted,false);assert.match(denied.result.reason,/价值不足/);
    assert.deepEqual(denied.result.relation,accepted.result.relation);
});

test('物资耗尽不刷新，空库存可达成和平关系，旧档不补造模板库存',async()=>{
    const{run,enter}=setup(),first=await run(await enter(),deal({request:[{item:'item_oats',quantity:2}],offer:[{item:'item_ration',quantity:2}]}));
    assert.equal(first.result.accepted,true);assert.equal(n(first.document).inventory.item_oats,undefined);
    const second=await run(first.document,deal(),'second');assert.equal(second.result.accepted,false);assert.match(second.result.reason,/库存不足/);
    assert.deepEqual(second.document.state.inventory,first.document.state.inventory);
    const revisit=await run(second.document,{operation:'approach',lair},'revisit');assert.equal(n(revisit.document).inventory.item_oats,undefined);
    const old=structuredClone(first.document);delete old.state.creatures[target].negotiation;
    const denied=await run(old,deal(),'old');assert.equal(denied.result.accepted,false);assert.deepEqual(n(denied.document).inventory,{});
    const peace=await run(old,deal({offer:[],request:[],alliance:true}),'peace');assert.equal(peace.result.accepted,true);
    assert.deepEqual(n(peace.document).inventory,{});assert.deepEqual(peace.document.state.inventory,old.state.inventory);
    const current=setup({stock:false}),natural=await current.enter();
    assert.deepEqual(n(natural).inventory,{});assert.equal((await current.run(natural,deal({offer:[],request:[]}))).result.accepted,true);
});

test('不在场、未接触、死亡、非智能或已归属个体均不能隔空谈判',async()=>{
    const{run,enter,document}=setup();await assert.rejects(run(document,deal()),/已接触/);
    const entered=await enter();
    for(const mutate of [d=>d.state.location='loc_hw_dock',d=>d.state.creatures[target].location='loc_hw_dock',
        d=>d.state.creatures[target].owner='player',d=>d.state.creatures[target].hp=0,d=>d.state.creatures[target].status='死亡',
        d=>d.state.player.status='濒死',d=>d.state.records[`lair:${lair}`].occupant=null]){
        const bad=structuredClone(entered);mutate(bad);const before=structuredClone(bad);
        await assert.rejects(run(bad,deal()),/巢穴|在场|谈判|濒死/);assert.deepEqual(bad,before);
    }
    const boar=await run(entered,{operation:'approach',lair:'lair_mud_tusk'},'boar');
    await assert.rejects(run(boar.document,deal({lair:'lair_mud_tusk'}),'boar-deal'),/非智能/);
});

test('资源不足和拒收不会扣物，非法物资和损坏谈判记录不覆盖存档',async()=>{
    const{run,enter}=setup(),doc=await enter();
    for(const [args,reason]of[[deal({offer:[{item:'item_ration',quantity:11}]}),/实际物资/],
        [deal({offer:[{item:'item_rawhide',quantity:1}]}),/愿意收取/]]){
        const out=await run(doc,args);assert.equal(out.result.accepted,false);assert.match(out.result.reason,reason);
        assert.deepEqual(out.document.state.inventory,doc.state.inventory);assert.deepEqual(n(out.document).inventory,n(doc).inventory);
    }
    for(const args of [deal({pact:'invented'}),deal({alliance:'yes'}),deal({offer:[{item:'item_ration',quantity:0}]}),
        deal({offer:[{item:'item_ration',quantity:-1}]}),deal({request:[{item:'unknown',quantity:1}]}),
        deal({offer:[{item:'干粮',quantity:1},{item:'item_ration',quantity:1}]}),deal({request:[{item:'item_ration',quantity:1}]})]){
        const before=structuredClone(doc);await assert.rejects(run(doc,args));assert.deepEqual(doc,before);
    }
    const good=(await run(doc,deal())).document;
    for(const mutate of [v=>v.negotiation=null,v=>v.negotiation.format=2,v=>v.negotiation.inventory.item_oats.quantity=-1,
        v=>v.negotiation.history.push(v.negotiation.history[0]),v=>v.negotiation.relation.event='fabricated']){
        const bad=structuredClone(good);mutate(bad.state.creatures[target]);const before=structuredClone(bad);
        await assert.rejects(run(bad,deal(),'bad'),/损坏/);assert.deepEqual(bad,before);
    }
});

test('交易保留真实单件的身份与归属，可交换回玩家行囊',async()=>{
    const{run,enter}=setup(),doc=await enter();
    doc.state.inventory.item_mining_pick={quantity:1,quality:'木',durability:27,weight:2,instances:['pick_unit']};
    doc.state.itemInstances.pick_unit={id:'pick_unit',item:'item_mining_pick',owner:'player',status:'持有',durability:27,quality:'木'};
    const give=await run(doc,deal({offer:[{item:'item_mining_pick',quantity:1}],request:[]}));
    assert.equal(give.result.accepted,true);assert.equal(give.document.state.itemInstances.pick_unit.owner,target);
    assert.deepEqual(n(give.document).inventory.item_mining_pick.instances,['pick_unit']);assert.equal(qty(give.document,'item_mining_pick'),0);
    const back=await run(give.document,deal({offer:[{item:'item_ration',quantity:10}],request:[{item:'item_mining_pick',quantity:1}]}),'back');
    assert.equal(back.result.accepted,true);assert.equal(back.document.state.itemInstances.pick_unit.owner,'player');
    assert.equal(back.document.state.itemInstances.pick_unit.durability,27);assert.deepEqual(back.document.state.inventory.item_mining_pick.instances,['pick_unit']);
});

test('主动攻击解除盟约且保留交易账；防守不违约，回避目标仍可议定停战',async()=>{
    const{run,enter,engine}=setup({goal:'avoid_conflict'}),doc=await enter();
    const first=await run(doc,deal({pact:'nonaggression',alliance:true}));
    first.document.state.creatures[target].hp=10000;first.document.state.creatures[target].maxHp=10000;
    const combat=async(doc,intent,id)=>{const out=await engine.reduce(doc,{tool:'world_combat',args:{target,intent},eventId:id});return applyPatches(doc,out.patches);};
    const defended=await combat(first.document,'defend','defend');assert.deepEqual(n(defended).relation,n(first.document).relation);
    const fought=await combat(defended,'attack','attack');assert.equal(n(fought).relation,null);assert.equal(n(fought).brokenBy,'attack');
    assert.deepEqual(n(fought).history,n(first.document).history);assert.deepEqual(n(fought).inventory,n(first.document).inventory);
    const denied=await run(fought,deal({offer:[],request:[],alliance:true}),'alliance');assert.equal(denied.result.accepted,false);assert.match(denied.result.reason,/只能议定互不攻击/);
    const peace=await run(denied.document,deal({offer:[],request:[],pact:'nonaggression'}),'peace');assert.equal(peace.result.accepted,true);
    const keeper=setup(),keepDoc=await keeper.enter();keepDoc.state.creatures[target].hp=10000;keepDoc.state.creatures[target].maxHp=10000;
    const hit=await keeper.engine.reduce(keepDoc,{tool:'world_combat',args:{target},eventId:'hit'});
    const refusal=await keeper.run(applyPatches(keepDoc,hit.patches),deal());assert.equal(refusal.result.accepted,false);assert.match(refusal.result.reason,/领地内发起交锋/);
});

test('模板校验真实物资，公开工具保持25入口和12000 token估算上限',async()=>{
    const{world,boss}=setup(),items=new Set(world.items.map(i=>i.id));assert.deepEqual(validateBossNegotiation(boss,items),[]);
    assert.deepEqual(validateWorld(world).errors,validateWorld(source).errors);
    for(const mutate of [b=>b.negotiation.stock[0].quantity=-1,b=>b.negotiation.stock[0].item='unknown',
        b=>b.negotiation.accepts.push(b.negotiation.accepts[0]),b=>b.negotiation.stock.push(b.negotiation.stock[0]),b=>b.intelligence=0]){
        const bad=structuredClone(world);mutate(bad.bosses.find(b=>b.id===target));assert.ok(validateWorld(bad).errors.some(e=>e.includes('谈判')));
    }
    const tools=toolDefinitions();assert.equal(tools.length,25);
    const field=tools.find(t=>t.function.name==='world_field').function.parameters;
    assert.ok(field.properties.operation.enum.includes('lair_negotiate'));assert.ok(field.properties.pact.enum.includes('respect_territory'));
    const budget=(await loadPromptBundle()).budget;assert.ok(budget.estimatedTokens<=budget.limit,JSON.stringify(budget));
    assert.equal(source.bosses.find(b=>b.id===target).negotiation,undefined);
});

test('持久交易可重启导入、幂等和回滚；回滚后再次成交不多发物资',async t=>{
    const{engine,document}=setup(),directory=await fs.mkdtemp(path.join(os.tmpdir(),'boss-negotiation-'));
    t.after(()=>fs.rm(directory,{recursive:true,force:true}));const reducer=(doc,input)=>engine.reduce(doc,input),store=new CampaignStorage(directory,{reducer});
    await store.create({id:'boss',worldVersion:engine.world.version,document});
    const enter={id:'enter',anchor:'a1',input:{tool:'world_field',args:{operation:'lair_approach',lair},eventId:'enter'}};
    const trade={id:'trade',anchor:'a2',input:{tool:'world_field',args:deal({operation:'lair_negotiate',alliance:true}),eventId:'trade'}};
    await store.transact('boss',enter,reducer);const first=(await store.read('boss')).document;
    await store.transact('boss',trade,reducer);const traded=(await store.read('boss')).document;
    await store.transact('boss',trade,reducer);assert.deepEqual((await store.read('boss')).document,traded);
    const reboot=new CampaignStorage(directory,{reducer});assert.deepEqual((await reboot.read('boss')).document,traded);
    assert.deepEqual((await reboot.import(await reboot.export('boss'),'copy')).document,traded);
    assert.deepEqual(readBossNegotiation(traded.state.creatures[target]).relation,{pact:'respect_territory',alliance:true,event:'trade'});
    assert.deepEqual((await reboot.reconcile('boss',['a1'],null)).document,first);
    await reboot.transact('boss',{...trade,id:'retry',input:{...trade.input,eventId:'retry'}},reducer);
    assert.equal(qty((await reboot.read('boss')).document,'item_oats'),1);
    assert.deepEqual((await reboot.reconcile('boss',[],null)).document,document);
});
