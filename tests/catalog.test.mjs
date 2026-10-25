import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld}from'../tools/load-world.mjs';
import {WorldEngine}from'../server-plugin/engine.mjs';
import {catalogDefinition}from'../server-plugin/catalog.mjs';
import {lookupToolResult}from'../extension/turn.mjs';
const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));

test('目录区分法术定义与真实学会状态，技能栏存在不能代替法术登记',async()=>{
    const engine=new WorldEngine(await loadWorld()),document=engine.initialFromLegacy(seed,'spell-learning-status'),before=structuredClone(document);
    const found=catalogDefinition(engine,document,{entity:'spell_light'});assert.equal(found.learned,true);assert.match(found.learningStatus,/已经学会/);
    assert.ok(engine.scene(document,'照明术').includes('【已学法术】共1'));assert.ok(engine.scene(document,'照明术').includes('spell_light'));
    assert.deepEqual(document,before);
    delete document.state.spells.spell_light;
    assert.ok(document.state.skills.skill_light);assert.equal(catalogDefinition(engine,document,{entity:'spell_light'}).learned,false);
    assert.ok(engine.scene(document,'照明术').includes('【已学法术】共0'));assert.equal(document.state.spells.spell_light,undefined);
});

test('同名技能法术查询返回可纠正的歧义反馈，按类型重查成功，存档故障仍抛出',async()=>{
    const engine=new WorldEngine(await loadWorld()),document=engine.initialFromLegacy(seed,'lookup-recovery'),before=structuredClone(document);
    const rejected=await lookupToolResult(()=>catalogDefinition(engine,document,{entity:'照明术'}));
    assert.equal(rejected.ok,false);assert.equal(rejected.lookupRejected,true);assert.match(rejected.error,/有歧义/);
    const found=await lookupToolResult(()=>catalogDefinition(engine,document,{entity:'照明术',kind:'spell'}));assert.equal(found.id,'spell_light');
    assert.deepEqual(document,before);await assert.rejects(lookupToolResult(()=>{throw new Error('存档校验和错误');}),/校验和/);
});
test('规则目录只读，公开列表限制大小，不暴露人物私有档案',async()=>{
    const engine=new WorldEngine(await loadWorld()),document=engine.initialFromLegacy(seed,'catalog-test'),before=structuredClone(document);
    const listing=catalogDefinition(engine,document,{kind:'skill'});
    assert.ok(listing.count>40);assert.equal(listing.entries.length,40);assert.equal(listing.truncated,true);
    const definition=catalogDefinition(engine,document,{entity:'skill_light',kind:'skill'});
    definition.description='改变返回值';assert.notEqual(engine.byId.get('skill_light').description,definition.description);
    assert.throws(()=>catalogDefinition(engine,document,{entity:'npc_hw_linsui'}),/公开规则目录/);
    assert.throws(()=>catalogDefinition(engine,document,{kind:'npc'}),/指定/);
    assert.deepEqual(document,before);
});

test('公开地点可查询，目录分页可找到后续物品，错误候选不创建或替换实体',async()=>{
    const engine=new WorldEngine(await loadWorld()),document=engine.initialFromLegacy(seed,'location-catalog');
    const places=catalogDefinition(engine,document,{kind:'location'});
    assert.ok(places.entries.some(row=>row.id==='bld_hw_riverhome'));
    assert.equal(catalogDefinition(engine,document,{entity:'河边小屋',kind:'location'}).id,'bld_hw_riverhome');
    const first=catalogDefinition(engine,document,{kind:'item'}),next=catalogDefinition(engine,document,{kind:'item',offset:first.nextOffset});
    assert.ok(next.entries.length);assert.ok(next.entries.every(row=>!first.entries.some(old=>old.id===row.id)));
    assert.equal(engine.resolve('铁铰链','item'),'item_iron_hinge');
    assert.throws(()=>engine.resolve('木楔','recipe'),/recipe_wooden_pegs/);
    assert.throws(()=>engine.resolve('loc_hw_nonexistent'),/已登记中文名称/);
    const scene=engine.scene(document,'去河边小屋');assert.match(scene,/河边小屋（bld_hw_riverhome）/);assert.ok(scene.length<=6000);
});
test('未取得的隐藏身份不泄露触发条件，取得后仅返回已知能力和代价',async()=>{
    const engine=new WorldEngine(await loadWorld()),document=engine.initialFromLegacy(seed,'hidden-catalog');
    const hidden=engine.world.professions.find(row=>row.kind==='hidden');
    const denied=catalogDefinition(engine,document,{entity:hidden.id});
    assert.equal(denied.available,false);assert.equal(denied.trigger,undefined);assert.equal(denied.name,undefined);
    assert.ok(catalogDefinition(engine,document,{kind:'profession'}).entries.every(row=>!engine.byId.get(row.id).trigger));
    document.state.professions.hidden.push(hidden.id);
    assert.deepEqual(Object.keys(catalogDefinition(engine,document,{entity:hidden.id})).sort(),['ability','cost','id','name']);
});

test('四村公共目录区分登记产量、期初库存和当前结算，治理权限仅按任命展示',async()=>{
    const world=await loadWorld(),engine=new WorldEngine(world),document=engine.createCharacter(seed,{},'public-village-account'),before=structuredClone(document);
    // T90后白石镇也有details，但经济为pending-ledger；本项只核四村账，白石镇须如实显示待接账而不虚设数字。
    // fix3-world：镇长任命已经审批接入（05 §5.3 镇长是镇公署首领；world/drafts/a3-world-approval），治理首长不再为空。
    const villages=['loc_bs_yupo','loc_bs_weiting','loc_bs_liquan','loc_bs_sangban'],town=catalogDefinition(engine,document,{entity:'loc_bs',kind:'location'}).settlement;
    assert.equal(town.economy.status,'pending-ledger');assert.deepEqual(town.economy.production,[]);assert.equal(town.governance.head.id,'npc_bs_townhead');
    assert.deepEqual(world.settlementProfiles.filter(row=>row.details&&row.id!=='loc_bs').map(row=>row.id).sort(),villages.toSorted());
    for(const profile of world.settlementProfiles.filter(row=>villages.includes(row.id))){
        const view=catalogDefinition(engine,document,{entity:profile.id,kind:'location'}).settlement,e=view.economy,g=view.governance;
        assert.equal(e.units.foodUnitKg,.5);assert.equal(e.units.treasury,'铜币');assert.equal(e.period.startDay,0);assert.equal(e.period.endDay,360);
        assert.equal(e.production[0].quantity,profile.details.economy.production[0].quantity);assert.equal(e.production[0].cycleDays,360);
        assert.equal(e.publicStock.closing,null);assert.equal(e.publicStock.openingDay,0);assert.match(e.publicStock.closingReason,/尚未结算/);
        assert.equal(e.currentStock.asOfMinute,document.state.minute);assert.equal(e.currentStock.food,document.state.settlements[profile.id].food);
        assert.equal(e.tradeContracts[0].status,'unfulfilled');assert.equal(e.tradeLedger.openingReceivedCopper,0);assert.equal(e.tax.openingReceiptsCopper,0);
        assert.equal(g.head.id,profile.details.governance.head);assert.deepEqual(g.enforcers.map(row=>row.id),profile.details.governance.enforcers);
        assert.deepEqual(g.jurisdiction,profile.details.governance.jurisdiction);assert.match(g.permissions.coordinators.join('；'),/自愿协调/);assert.match(g.limits.join('；'),/无权/);
        assert.equal(g.appointment.effectiveDay,0);assert.equal(g.referral.status,'referral-only');
        e.production[0].quantity=0;g.permissions.head.push('随意搜查');assert.notEqual(profile.details.economy.production[0].quantity,0);assert.ok(!profile.details.governance.permissions.head.includes('随意搜查'));
    }
    assert.deepEqual(document,before);
    const id='loc_bs_yupo';document.state.minute+=1440;document.state.settlements[id].food=7;
    document.state.records[`agriculture:${id}`].lastDay=1;
    document.state.records[`village-fiscal:${id}`]={taxReceiptsCopper:3,advanceCopper:0,salesGrossCopper:60,salesNetCopper:57};
    const contract=world.settlementProfiles.find(p=>p.id===id).details.economy.tradeContracts[0];
    document.state.records[`village-trade:${contract.id}`]={status:'delivered',paidCopper:60,receivedCopper:60,taxCopper:3,prepaidCopper:0,privateCargo:'不可公开'};
    const view=catalogDefinition(engine,document,{entity:id,kind:'location'}).settlement.economy;
    assert.equal(view.currentStock.food,7);assert.equal(view.currentStock.lastSettlementDay,1);assert.equal(view.publicStock.food,18000);
    assert.equal(view.currentFiscal.taxReceiptsCopper,3);assert.equal(view.tradeContracts[0].settlement.status,'delivered');assert.equal(view.tradeContracts[0].settlement.asOfMinute,document.state.minute);
    assert.equal(JSON.stringify(view).includes('不可公开'),false);
});
