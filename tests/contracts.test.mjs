import {relationView} from '../server-plugin/npc-state.mjs';
// A3 causal2: assert the canonical relation view, retaining all numeric expectations.
import test from'node:test';
import assert from'node:assert/strict';
import fs from'node:fs/promises';
import {WorldEngine}from'../server-plugin/engine.mjs';
import {loadWorld}from'../tools/load-world.mjs';
import {applyPatches}from'../server-plugin/storage.mjs';
import {createPlaytestServer}from'../tools/playtest-runner.mjs';
const world=await loadWorld(),engine=new WorldEngine(world),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const fresh=()=>engine.initialFromLegacy(seed,'credit-contracts');
const execute=async(document,tool,args,eventId)=>{const out=await engine.reduce(document,{tool,args,eventId});return{document:applyPatches(document,out.patches),result:out.result};};
const money=document=>document.state.player.coins+Object.values(document.state.npcs).reduce((sum,row)=>sum+row.coins,0);

test('同一欠款不能再建自动付款义务，还清后跨过期限不重复扣款',async()=>{
    let c=(await execute(fresh(),'world_trade',{seller:'林穗',service:'住宿',payment:'credit',creditMinutes:60},'rent')).document;
    const before=structuredClone(c);
    await assert.rejects(execute(c,'world_promise',{type:'付款',promisor:'player',promisee:'林穗',coins:6,content:'还这笔房钱',deadline:c.state.minute+60},'duplicate-debt'),/已有欠款记录 debt_rent/);
    assert.deepEqual(c,before);
    assert.deepEqual(Object.keys(c.state.obligations),['debt_rent']);
    assert.equal(c.state.obligations.debt_rent.legacyRecord,'debt_rent');
    assert.equal(c.state.obligations.debt_rent.amount,6);
    c=(await execute(c,'world_trade',{seller:'林穗',payment:'repay',debt:'debt_rent'},'paid')).document;
    const settledCoins=c.state.player.coins;
    c=(await execute(c,'world_time',{minutes:1440},'next-day')).document;
    assert.equal(c.state.player.coins,settledCoins);assert.equal(settledCoins,174);
});

test('赊住宿生成实际欠款；余额不变、限额累计，过期只提醒一次并保留违约后果',async()=>{
    const initial=fresh(),sum=money(initial),trust=relationView(null,initial.state,'npc_hw_linsui','player').trust;
    const opened=await execute(initial,'world_trade',{seller:'林穗',service:'住宿',days:1,payment:'credit',creditMinutes:60},'credit');
    const c=opened.document;
    assert.equal(c.state.player.coins,initial.state.player.coins);assert.equal(money(c),sum);
    assert.equal(c.state.records.debt_credit.amount,6);assert.equal(c.state.records.contract_room_credit.paid,0);
    assert.ok(opened.result.notices.some(row=>row.type==='debt'&&row.text.includes('待偿还')));
    const before=structuredClone(c);
    await assert.rejects(execute(c,'world_trade',{seller:'林穗',item:'面包',quantity:1,payment:'credit'},'exceed'),/不得超过6铜/);
    assert.deepEqual(c,before);
    const late=await execute(c,'world_time',{minutes:50},'deadline');
    assert.equal(late.document.state.records.debt_credit.status,'逾期');assert.equal(relationView(null,late.document.state,'npc_hw_linsui','player').trust,trust-5);
    assert.equal(money(late.document),sum);assert.ok(late.result.notices.some(row=>row.type==='debt'&&row.text.includes('逾期')));
    const again=await execute(late.document,'world_time',{minutes:10},'later');
    assert.equal(relationView(null,again.document.state,'npc_hw_linsui','player').trust,trust-5);assert.equal(again.result.notices.some(row=>row.type==='debt'),false);
    const paid=await execute(again.document,'world_trade',{seller:'林穗',payment:'repay',debt:'debt_credit'},'repay');
    assert.equal(paid.document.state.player.coins,initial.state.player.coins-6);assert.equal(money(paid.document),sum);
    assert.equal(paid.document.state.records.debt_credit.status,'已还清');assert.equal(paid.document.state.records.contract_room_credit.paid,6);
    assert.equal(relationView(null,paid.document.state,'npc_hw_linsui','player').trust,trust-5);
    await assert.rejects(execute(paid.document,'world_trade',{seller:'林穗',payment:'repay',debt:'debt_credit'},'twice'),/已经还清/);
});

test('住宿续期接在原期限后，跨期状态可见；旧记录不需补字段，普通读取不会迁移',async()=>{
    let c=(await execute(fresh(),'world_trade',{seller:'林穗',service:'住宿',days:1},'first')).document;
    const first=c.state.records.contract_room_first;
    c=(await execute(c,'world_trade',{seller:'林穗',service:'住宿',days:1},'renew')).document;
    assert.equal(c.state.records.contract_room_renew.starts,first.expires);
    assert.equal(c.state.records.contract_room_renew.expires,first.expires+1440);
    const expired=await execute(c,'world_time',{minutes:first.expires-c.state.minute},'next_day');
    assert.equal(expired.document.state.records.contract_room_first.status,'已到期');assert.equal(expired.document.state.records.contract_room_renew.status,'有效');
    assert.ok(expired.result.notices.some(row=>row.type==='contract'&&row.text.includes('已到期')));
    const untouched=structuredClone(expired.document);engine.scene(expired.document,'看看住宿');assert.deepEqual(expired.document,untouched);
});

test('赊货实际转移库存；不接受赊账的商家拒绝，欠款与过期效果可整体撤销',async t=>{
    const before=fresh(),out=await execute(before,'world_trade',{seller:'林穗',item:'面包',quantity:1,payment:'credit',creditMinutes:60},'bread');
    assert.equal(out.document.state.inventory.item_bread.quantity,1);assert.equal(out.document.state.player.coins,before.state.player.coins);assert.equal(money(out.document),money(before));
    const forge=(await execute(before,'world_move',{destination:'铁匠铺'},'forge')).document;
    await assert.rejects(execute(forge,'world_trade',{seller:'段岩',item:'铁铰链',quantity:1,payment:'credit'},'forge_credit'),/尚未接受赊账/);
    const server=await createPlaytestServer({aiProfile:'T0'/*no model client: local rules only*/,seed:'contracts-http'});t.after(()=>server.close());
    const view=await server.api('create',{}),campaignId=view.reference.campaignId;
    const request={campaignId,tool:'world_trade',args:{seller:'林穗',service:'住宿',payment:'credit',creditMinutes:60},eventId:'credit',anchor:'credit'};
    await server.api('execute',request);assert.equal((await server.api('execute',request)).duplicate,true);
    const withDebt=await server.api('read',{campaignId});
    await server.api('execute',{campaignId,tool:'world_time',args:{minutes:60},eventId:'wait',anchor:'wait'});
    const undone=await server.api('reconcile',{campaignId,validAnchors:['credit']});assert.deepEqual(undone.document.state,withDebt.document.state);
    const cleared=await server.api('reconcile',{campaignId,validAnchors:[]});assert.deepEqual(cleared.document.state,view.document.state);
});
