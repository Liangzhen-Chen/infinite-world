import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import fc from 'fast-check';
import { loadWorld } from '../tools/load-world.mjs';
import { WorldEngine, xpRequired } from '../server-plugin/engine.mjs';
import { applyPatches } from '../server-plugin/storage.mjs';
import {planAgricultureMigration} from '../server-plugin/agriculture-migration.mjs';
import {planWildlifeMigration} from '../server-plugin/wildlife-migration.mjs';
import {planFarmPestsMigration} from '../server-plugin/farm-pests-migration.mjs';
import { createCampaign } from './fixtures/legacy/core.js';
import { parseTurn } from '../extension/turn.mjs';
const seed=JSON.parse(await fs.readFile(new URL('fixtures/legacy/seed.json',import.meta.url),'utf8'));
const engine=new WorldEngine(await loadWorld());
const fresh=()=>{const c=engine.initialFromLegacy(createCampaign(seed),'deterministic-test'),migrated=applyPatches(c,planAgricultureMigration(c,engine.rules)),wild=applyPatches(migrated,planWildlifeMigration(migrated,engine.rules,engine.world.monsters));return applyPatches(wild,planFarmPestsMigration(wild,engine.rules));};
const run=async(document,tool,args,eventId='test')=>{
    const output=await engine.reduce(document,{tool,args,eventId});
    return {document:applyPatches(document,output.patches),result:output.result};
};
test('编号迁移：原始人物财物与熟练度保留，名字用于显示',()=>{
    const c=fresh();assert.equal(c.state.player.coins,180);assert.equal(c.state.inventory.item_ration.quantity,3);
    assert.equal(c.state.npcs.npc_hw_linsui.name,'林穗');assert.equal(c.state.skills.skill_light.proficiency,10);
    assert.equal(c.state.location,'bld_hw_qingdeng');assert.equal(Object.keys(c.state.npcs).length,18);
});

test('指定明日钟点由引擎计算，休息恢复；冲突和过去时间不结算',async()=>{
    const c=fresh();c.state.minute=641;c.state.player.hp=2;c.state.player.mp=1;
    const before=structuredClone(c);
    const rested=await run(c,'world_time',{until:{dayOffset:1,hour:10},activity:'休息'});
    assert.equal(rested.document.state.minute,2040);assert.equal(rested.result.elapsed,1399);
    assert.equal(rested.document.state.player.hp,rested.document.state.player.maxHp);
    assert.equal(rested.document.state.player.mp,rested.document.state.player.maxMp);
    for(const args of[{minutes:60,until:{dayOffset:1,hour:10}},{until:{dayOffset:0,hour:9}},{until:{dayOffset:1,hour:24}}])await assert.rejects(run(c,'world_time',args));
    assert.deepEqual(c,before);
    assert.equal((await run(c,'world_time',{minutes:60,activity:'等待'})).document.state.minute,701);
});

test('玩家编号和中文称呼引用同一角色，自定义姓名同名居民时拒绝歧义',async()=>{
    const c=fresh();
    for(const buyer of['player','玩家','旅人']){
        const out=await run(c,'world_trade',{buyer,seller:'林穗',service:'住宿'},`rent_${buyer}`);
        assert.equal(out.document.state.player.coins,174);assert.equal(Object.keys(out.document.state.npcs).length,18);
    }
    c.state.player.name='林穗';const before=structuredClone(c);
    await assert.rejects(run(c,'world_trade',{buyer:'林穗',seller:'贺舟',item:'干粮',quantity:1}),/歧义/);assert.deepEqual(c,before);
    assert.equal(engine.scoped(c).resolve('林穗','npc'),'npc_hw_linsui');
});
test('E5 生命钳制、濒死救治、溢出治疗和具体魔力错误',async()=>{
    let c=fresh();c=(await run(c,'world_health',{delta:-20})).document;assert.equal(c.state.player.hp,0);assert.equal(c.state.player.status,'濒死');
    c=(await run(c,'world_health',{delta:100},'heal')).document;assert.equal(c.state.player.hp,12);assert.equal(c.state.player.status,'正常');
    c.state.player.mp=0;await assert.rejects(run(c,'world_cast',{spell:'照明术',target:'木杖'}),/魔力不足/);
});

test('未登记住宿名和缺交易项目返回可纠正参数，拒绝后没有扣款或计时',async()=>{
    const c=fresh(),before=structuredClone(c);
    for(const args of[{seller:'林穗',service:'普通客房',days:1},{seller:'林穗',days:1}]){
        await assert.rejects(run(c,'world_trade',args),/service="住宿".*item.*quantity/);
        assert.deepEqual(c,before);
    }
    const paid=await run(c,'world_trade',{seller:'林穗',service:'住宿',days:1});
    assert.equal(paid.document.state.player.coins,174);
});
test('死亡惩罚、濒死超时与登记点复活',async()=>{
    let c=fresh();c.state.player.level=10;c.state.player.xp=1200;
    c=(await run(c,'world_health',{delta:-20})).document;c=(await run(c,'world_time',{minutes:10})).document;
    assert.equal(c.state.player.status,'死亡');assert.equal(c.state.player.xp,200);
    c=(await run(c,'world_revive',{})).document;assert.equal(c.state.location,'bld_hw_altar');assert.equal(c.state.player.hp,6);assert.equal(c.state.player.mp,5);
    assert.equal(xpRequired(10),1000);
});
test('E6 未知法术和直接提交法术拒绝，不能伪造学习来源',async()=>{
    const c=fresh();await assert.rejects(run(c,'world_commit',{spells:[{name:'陨石术',mp:1,effect:'毁城'}]}),/未知工具/);
    await assert.rejects(run(c,'world_learn',{entity:'陨石术',source:'许苓'}),/未登记/);
    await assert.rejects(run(c,'world_learn',{entity:'照明术',source:'林穗'}),/资格/);
});
test('E7 未突破停299，同目标递减，每日上限',async()=>{
    let c=fresh();c.state.skills.skill_light.proficiency=290;
    c=(await run(c,'world_practice',{skill:'照明术',gain:100,target:'木杖'})).document;assert.equal(c.state.skills.skill_light.proficiency,299);
    let d=fresh();const first=await run(d,'world_practice',{skill:'照明术',gain:10,target:'木杖'});const second=await run(first.document,'world_practice',{skill:'照明术',gain:10,target:'木杖'},'second');
    assert.equal(first.result.gain,10);assert.equal(second.result.gain,5);
});
test('E8 别名同一编号、E9 基础人设只读，未成年关系受限',async()=>{
    const c=fresh();await assert.rejects(run(c,'world_relation',{npc:'林穗姐',eventType:'帮助',sourceEvent:'roof'}),/已核验证据/);
    const traded=await run(c,'world_trade',{seller:'林穗姐',item:'面包',quantity:1},'bread-proof');
    const updated=await run(traded.document,'world_relation',{npc:'林穗姐',eventType:'交易',sourceEvent:'bread-proof'});
    assert.equal(updated.document.state.npcs.npc_hw_linsui.trust,1);assert.equal(Object.keys(updated.document.state.npcs).length,18);
    await assert.rejects(run(c,'world_relation',{npc:'林穗',notes:'她是一名刺客',eventType:'帮助',sourceEvent:'roof'}),/只读/);
    await assert.rejects(run(c,'world_relation',{npc:'段禾',romance:true,eventType:'帮助',sourceEvent:'x'}),/未成年/);
});
test('E10 路线计时与随行，E11 回合尾注只补未结算时间',async()=>{
    let c=fresh();const toVillage=await run(c,'world_move',{destination:'河湾村'});c=toVillage.document;
    // The expanded climate catalog changes this fixed seed's weather; the route now takes 432 minutes.
    const start=c.state.minute;const moved=await run(c,'world_move',{destination:'白石镇'});assert.equal(moved.result.minutes,432);
    const turn=await run(moved.document,'world_turn',{startMinute:start,minutes:432,location:'白石镇'},'turn');assert.equal(turn.result.elapsed,0);
    const normal=await run(turn.document,'world_turn',{startMinute:turn.document.state.minute},'talk');assert.equal(normal.result.elapsed,10);
    await assert.rejects(run(c,'world_turn',{startMinute:start,location:'王都'}),/实际账本/);
    assert.equal((await run(c,'world_turn',{outOfCharacter:true})).document.state.minute,c.state.minute);
});
test('带路承诺创建同行者，玩家移动后 NPC 一同抵达并完成义务',async()=>{
    let c=fresh();c.state.location='loc_hw_northwood';
    const before=structuredClone(c),promised=await run(c,'world_promise',{promisor:'吴朔',type:'带路',destination:'北林废观测塔',content:'带去塔下'},'guide');c=promised.document;
    const planned=engine.route(before.state.location,'site_beilin_tower','walk',before.state.minute,before.randomSeed);
    assert.equal(promised.result.routePreview.minutes,planned.minutes);assert.equal(promised.result.routePreview.estimate,true);
    assert.equal(promised.result.routePreview.calculatedAt,before.state.minute);assert.equal(c.state.minute,before.state.minute);
    assert.deepEqual(c.state.inventory,before.state.inventory);assert.equal(c.state.player.coins,before.state.player.coins);
    assert.ok(c.state.player.companions.includes('npc_hw_wushuo'));
    c=(await run(c,'world_move',{destination:'北林废观测塔'},'travel')).document;
    assert.equal(c.state.npcs.npc_hw_wushuo.location,'site_beilin_tower');assert.equal(c.state.obligations.obl_guide.status,'已完成');
});
test('E12 多聚落日结，饥荒有实际后果',async()=>{
    let c=fresh();c.state.settlements.loc_second={...structuredClone(c.state.settlements.loc_hw),name:'第二村',food:0,foodPerDay:0};
    c=(await run(c,'world_time',{minutes:1440*7})).document;assert.equal(c.state.settlements.loc_second.population,57);
    assert.ok(c.state.buildings.bld_hw_qingdeng);
});
test('E14 检定按属性技能计算，给出成功程度，固定事件重复结果一致',async()=>{
    const c=fresh();c.state.professions.combat='profession_mage';c.state.player.attributes.精神=18;c.state.skills.skill_light.proficiency=450;
    const a=await run(c,'world_check',{attribute:'精神',skill:'照明术',difficulty:15}),b=await run(c,'world_check',{attribute:'精神',skill:'照明术',difficulty:15});
    assert.equal(a.result.modifier,7);assert.deepEqual(a.result,b.result);assert.ok(a.result.degree);
    await assert.rejects(run(c,'world_check',{modifier:15,difficulty:15}),/不能直接指定/);
});
test('E15 施法增长熟练度，持续效果到期移除，不生成永久世界记录',async()=>{
    const c=fresh(),cast=await run(c,'world_cast',{spell:'照明术',target:'木杖'});
    assert.equal(cast.document.state.player.mp,9);assert.ok(cast.document.state.skills.skill_light.proficiency>10);
    // Living plants and leaking vessels advance with world time. Compare the
    // same elapsed minute so lighting still cannot add a permanent record.
    const elapsed=await run(c,'world_time',{minutes:engine.world.spells.find(s=>s.id==='spell_light').minutes},'elapsed');
    assert.deepEqual(cast.document.state.records,elapsed.document.state.records);
    const later=await run(cast.document,'world_time',{minutes:120},'later');assert.deepEqual(later.document.state.effects,{});
});
test('E17 交易物品别名同一编号，双方钱与库存守恒，余额不足原子拒绝',async()=>{
    const c=fresh();c.state.npcs.npc_hw_linsui.inventory.item_bread={quantity:3};
    const result=await run(c,'world_trade',{seller:'老板娘',item:'热面包',quantity:2});
    assert.equal(result.document.state.inventory.item_bread.quantity,2);assert.equal(result.document.state.npcs.npc_hw_linsui.inventory.item_bread.quantity,1);
    assert.equal(result.document.state.player.coins,176);assert.equal(result.document.state.npcs.npc_hw_linsui.coins,454);
    assert.ok(result.document.state.inventory.item_bread.quality);assert.equal(result.document.state.inventory.item_bread.weight,0.15);
    c.state.player.coins=0;const before=JSON.stringify(c);await assert.rejects(run(c,'world_trade',{seller:'林穗',item:'面包',quantity:2}),/余额不足/);assert.equal(JSON.stringify(c),before);
});
test('租房服务：报价来自引擎、实际扣款转入店主、期限保存，余额不足拒绝',async()=>{
    const c=fresh(),rent=await run(c,'world_trade',{seller:'林穗',service:'住宿',days:1});
    assert.equal(rent.document.state.player.coins,174);assert.equal(rent.document.state.npcs.npc_hw_linsui.coins,456);
    assert.equal(rent.document.state.records.contract_room_test.expires,1980);
    const week=await run(c,'world_trade',{seller:'老板娘',service:'住宿',days:7},'week');assert.equal(week.result.cost,35);
    c.state.player.coins=0;await assert.rejects(run(c,'world_trade',{seller:'林穗',service:'住宿',days:1}),/房钱不足/);
});
test('交易性质：任意可负担数量与铜币守恒',async()=>{
    await fc.assert(fc.asyncProperty(fc.integer({min:1,max:12}),async quantity=>{
        const c=fresh();c.state.npcs.npc_hw_linsui.inventory.item_bread={quantity:12};
        const publicMoney=state=>Object.values(state.settlements).reduce((n,s)=>n+(s.treasury??0),0);
        const initial=c.state.player.coins+c.state.npcs.npc_hw_linsui.coins+publicMoney(c.state);
        const next=(await run(c,'world_trade',{seller:'林穗',item:'面包',quantity})).document;
        assert.equal(next.state.player.coins+next.state.npcs.npc_hw_linsui.coins+publicMoney(next.state),initial);
        const taxes=Object.values(next.state.records).filter(r=>r.category==='trade_tax').reduce((n,r)=>n+r.amount,0);
        assert.equal(publicMoney(next.state)-publicMoney(c.state),taxes);
        assert.equal(next.state.inventory.item_bread.quantity+(next.state.npcs.npc_hw_linsui.inventory.item_bread?.quantity??0),12);
    }),{numRuns:30,seed:20261010});
});
test('E18 任意职业与无认证条件拒绝，技能突破要求在场且有资格的导师',async()=>{
    const c=fresh();await assert.rejects(run(c,'world_profession',{profession:'宇宙毁灭者',teacher:'许苓'}),/未登记/);
    c.state.location='bld_hw_riverhome';await assert.rejects(run(c,'world_profession',{profession:'法师',teacher:'许苓'}),/至少10级/);
    c.state.skills.skill_light.proficiency=299;
    await assert.rejects(run(c,'world_practice',{skill:'照明术',breakthroughSource:'林穗'}),/资格|不在场/);
    await assert.rejects(run(c,'world_practice',{skill:'照明术',breakthroughSource:'许苓'}),/未认证/);
});
test('E4 场景预算不会因40个远处的熟人而膨胀',()=>{
    const c=fresh(),before=engine.scene(c,'看看酒馆');
    for(let i=0;i<40;i++)c.state.npcs[`npc_far_${i}`]={location:'loc_capital',trust:10,affection:10,notes:'远方旧事'.repeat(500)};
    assert.equal(engine.scene(c,'看看酒馆'),before);assert.ok(before.length<=16000);
});
test('尾注解析：合法、缺失、非法、重复与场外，不能信任错误地点',()=>{
    const options={location:'loc_hw',startMinute:540};
    const valid=parseTurn('雨落下来。<回合 额外="15分" 地点="loc_hw" 在场="npc_hw_linsui"/>',options);
    assert.equal(valid.valid,true);assert.equal(valid.args.extraMinutes,15);assert.equal(valid.visible,'雨落下来。');
    for(const value of ['没有尾注','<回合 额外="x分" 地点="loc_hw"/>','<回合 额外="1分" 地点="loc_hw"/><回合 额外="1分" 地点="loc_hw"/>']){
        assert.equal(parseTurn(value,options).valid,false);assert.equal(parseTurn(value,options).args.extraMinutes,10);
    }
    assert.equal(parseTurn('场外回答',{...options,outOfCharacter:true}).args.outOfCharacter,true);
});
test('即时观察与场外不偷做存档迁移，零时长尾注只登记回合',async()=>{
    const world=await loadWorld(),engine=new WorldEngine(world);
    const seed=JSON.parse(await fs.readFile(new URL('./fixtures/legacy/seed.json',import.meta.url),'utf8'));
    const document=engine.initialFromLegacy(seed,'observe-no-write');
    for(const input of [{tool:'world_weather',args:{operation:'inspect'}},{tool:'world_turn',args:{outOfCharacter:true}}]){
        const output=await engine.reduce(document,{...input,eventId:'observe'});assert.deepEqual(output.patches,[]);
    }
    const output=await engine.reduce(document,{tool:'world_turn',args:{extraMinutes:0,startMinute:document.state.minute,location:document.state.location},eventId:'finish'});
    assert.deepEqual(output.patches.map(p=>p.path),[['state','turns','finish']]);assert.equal(output.result.elapsed,0);
});
