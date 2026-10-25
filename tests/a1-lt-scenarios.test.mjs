// A1 验收：开发指南 11.3 的 L 类（交易与账本）与 T 类（时间与移动）中不含对话的部分，用界面动作脚本驱动，确定性、不调用模型。
// 每一步都从 /actions 菜单取动作（界面够得着），经 /execute 的 world_act 结算；断言账本、时间、地点与守恒。
// T1（普通对话推进时间）属于对话，归 A2。
import test from 'node:test';
import assert from 'node:assert/strict';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {standing} from '../server-plugin/standing.mjs';
import {legacyTotal,flowDelta,reconcile} from './helpers/ledger-audit.mjs';
import {uiSession,qty} from './helpers/ui-script.mjs';

const engine=new WorldEngine(await loadWorld());
const DAY=1440,INN='bld_hw_qingdeng',LINSUI='npc_hw_linsui',FORGE='bld_hw_forge',SMITH='npc_hw_duanyan';
// Money only moves between holders or through declared sources/sinks; the two books agree.
function conserved(before,after,label){
 // The first event of a campaign opens the books; flows count from then on.
 const flows=before.ledger?flowDelta(before,after,'coin_river'):{sources:0,sinks:0};
 assert.equal(legacyTotal(engine,after.state)-legacyTotal(engine,before.state),flows.sources-flows.sinks,`${label}：铜钱守恒`);
 assert.deepEqual(reconcile(engine,after).mismatches,[],`${label}：账本与旧字段一致`);
}
const at=(location,minute,extra=()=>{})=>(s,doc)=>{s.location=location;s.minute=minute;extra(s,doc);};

test('L1 租房：扣钱、记住宿期限；次日早上仍可续住，续住接在原期限之后',async t=>{
 const ui=await uiSession(t,{mutate:at(INN,DAY*0+20*60)});
 const d0=await ui.read(),menu=await ui.menu();
 assert.equal(menu.actions.find(a=>a.id==='core:trade.lodge').fill.seller,LINSUI,'住店预填店主');
 const rent=await ui.choose('trade.lodge',{days:1});assert.ok(rent.ok,rent.error);
 const d1=await ui.read(),contract=d1.state.records[rent.result.contract];
 assert.equal(d0.state.player.coins-d1.state.player.coins,rent.result.cost);assert.equal(contract.room,INN);assert.equal(contract.expires-contract.starts,DAY);assert.equal(contract.paid,rent.result.cost);
 assert.match(rent.lines[0],/林穗.*1天.*住处.*文/);conserved(d0,d1,'租房');
 const slept=await ui.choose('time.sleep',{until:{dayOffset:1,hour:6}});assert.ok(slept.ok,slept.error);
 const d2=await ui.read();assert.equal(d2.state.minute,DAY+6*60);assert.ok(d2.state.minute<contract.expires,'次日早上仍在住期内');
 assert.ok((await ui.menu()).actions.some(a=>a.id==='core:trade.lodge'),'早上菜单里有续住');
 const early=await ui.choose('trade.lodge',{days:1});assert.equal(early.ok,false);assert.match(early.error,/09:00/,'店主还没开柜，说明几点接待');
 assert.ok((await ui.choose('time',{until:{dayOffset:0,hour:9,minute:30}})).ok);
 const renew=await ui.choose('trade.lodge',{days:1});assert.ok(renew.ok,renew.error);
 const d3=await ui.read(),next=d3.state.records[renew.result.contract];
 assert.equal(next.starts,contract.expires,'续住从原期限接上，不重叠不断档');conserved(d2,d3,'续住');
});

test('L2 余额不足：引擎拒绝，钱物与账本序号都不变，界面给世界内原因',async t=>{
 const ui=await uiSession(t,{mutate:at(INN,10*60,s=>{s.player.coins=1;})});
 const before=await ui.read(),view=await ui.server.api('read',{campaignId:ui.campaignId});
 const r=await ui.choose('trade.buy',{item:'item_bread',quantity:3},{target:LINSUI});
 assert.equal(r.ok,false);assert.match(r.error,/不足/);
 const after=await ui.server.api('read',{campaignId:ui.campaignId});
 assert.equal(after.reference.sequence,view.reference.sequence);assert.deepEqual(after.document.state.inventory,before.state.inventory);assert.equal(after.document.state.player.coins,1);
});

test('L3 同一天再买同一件东西，报价一致（当日报价入账）',async t=>{
 const ui=await uiSession(t,{mutate:at(INN,10*60)});
 const a=await ui.choose('trade.buy',{item:'item_bread',quantity:1},{target:LINSUI});
 await ui.choose('time',{minutes:120});
 const b=await ui.choose('trade.buy',{item:'item_bread',quantity:2},{target:LINSUI});
 assert.ok(a.ok&&b.ok);assert.equal(b.result.cost,2*a.result.cost,'单价不变');
 const d=await ui.read(),quote=d.state.records[`trade-quote:0:${LINSUI}:player:item_bread`];assert.equal(quote.listPrice,a.result.cost);
});

// 指南11.3 L4 指定镐；保留原刀场景全部断言，并对正式矿镐逐项执行同一验收。
for(const [item,label] of [['item_kitchen_knife','刀'],['item_mining_pick','镐']])test(`L4 库存有限：铁匠铺的${label}卖完后买不到，菜单说明下次进货的日子，到货后能再买`,async t=>{
 const ui=await uiSession(t,{mutate:at(FORGE,10*60,s=>{s.player.coins=2000;})});
 const stock=qty((await ui.read()).state.npcs[SMITH].inventory[item]);assert.ok(stock>0);
 const all=await ui.choose('trade.buy',{item,quantity:stock},{target:SMITH});assert.ok(all.ok,all.error);
 const none=await ui.choose('trade.buy',{item,quantity:1},{search:true,target:SMITH});
 assert.equal(none.ok,false);assert.match(none.error,/只剩0/);
 const menu=await ui.menu(SMITH),note=menu.target.soldOut.find(r=>r.item===item);
 assert.ok(note&&note.nextMinute>(await ui.read()).state.minute,'告诉玩家何时到货');assert.match(note.next,/年/);
 assert.ok(!menu.actions.find(a=>a.id==='core:trade.buy').slots.find(s=>s.name==='item').options.some(o=>o.value===item),'卖完的货不再出现在可选项');
 const now=(await ui.read()).state.minute;await ui.choose('time',{minutes:note.nextMinute+10*60-now});
 const again=await ui.choose('trade.buy',{item,quantity:1},{target:SMITH});assert.ok(again.ok,again.error);
});

test('L5 卖给钱不够的 NPC：不凭空付款，整笔拒绝且钱物不动',async t=>{
 const ui=await uiSession(t,{mutate:at(INN,10*60,(s)=>{s.npcs[LINSUI].coins=1;s.inventory.item_bread={quantity:5};})});
 const before=await ui.read(),r=await ui.choose('trade.sell_to',{item:'item_bread',quantity:5},{target:LINSUI});
 assert.equal(r.ok,false);assert.match(r.error,/余额不足/);
 const after=await ui.read();assert.equal(after.state.npcs[LINSUI].coins,1);assert.equal(qty(after.state.inventory.item_bread),5);assert.deepEqual(after.state,before.state);
});
// 指南11.3 L5：卖方明确允许部分成交；原整笔拒绝断言保留。
test('L5 对方钱不够时部分收购：只转付得起的原货，不足一件则回滚',async t=>{
 const ui=await uiSession(t,{mutate:at(INN,10*60,s=>{s.npcs[LINSUI].coins=5;s.inventory.item_bread={quantity:20};})});
 const before=await ui.read(),menu=await ui.menu(LINSUI);
 assert.ok(menu.actions.find(a=>a.id==='core:trade.sell_to').slots.some(s=>s.name==='allowPartial'));
 const r=await ui.choose('trade.sell_to',{item:'item_bread',quantity:20,allowPartial:true},{target:LINSUI});
 assert.ok(r.ok,r.error);assert.equal(r.result.partial,true);assert.equal(r.result.requestedQuantity,20);
 assert.ok(r.lines[0].includes(`${r.result.quantity}份`),'界面只报实际成交数量');
 assert.ok(r.result.quantity>0&&r.result.quantity<20);const after=await ui.read();
 assert.equal(qty(after.state.inventory.item_bread),20-r.result.quantity);
 assert.equal(qty(after.state.npcs[LINSUI].inventory.item_bread)-qty(before.state.npcs[LINSUI].inventory.item_bread),r.result.quantity);
 assert.equal(after.state.player.coins-before.state.player.coins,r.result.cost);
 assert.equal(before.state.npcs[LINSUI].coins-after.state.npcs[LINSUI].coins,r.result.cost);
 assert.equal(after.state.minute-before.state.minute,5);conserved(before,after,'部分收购');
 assert.equal((await ui.retry('trade.sell_to',{item:'item_bread',quantity:20,allowPartial:true},r.eventId,LINSUI)).duplicate,true);
 assert.deepEqual((await ui.read()).state,after.state);
 const denied=await ui.choose('trade.sell_to',{item:'item_bread',quantity:20,allowPartial:true},{target:LINSUI});
 assert.equal(denied.ok,false);assert.match(denied.error,/余额不足/);assert.deepEqual((await ui.read()).state,after.state);
});

test('L6 重试：同一次界面请求重复提交（同一事件编号）不重复扣款',async t=>{
 const ui=await uiSession(t,{mutate:at(INN,10*60)});
 const first=await ui.choose('trade.buy',{item:'item_bread',quantity:1},{target:LINSUI,eventId:'click-1'}),after=await ui.read();
 const again=await ui.retry('trade.buy',{item:'item_bread',quantity:1},'click-1',LINSUI);
 assert.ok(first.ok);assert.equal(again.duplicate,true);assert.deepEqual((await ui.read()).state,after.state);
});

test('L7 赊账：生成债务、到期提醒、逾期后果（立场下降），还清后保留逾期经历',async t=>{
 const ui=await uiSession(t,{mutate:at(INN,10*60)});
 const d0=await ui.read(),regard=standing(engine,d0.state,LINSUI,'player');
 const owed=await ui.choose('trade.buy',{item:'item_bread',quantity:1,payment:'credit',creditMinutes:DAY},{target:LINSUI});assert.ok(owed.ok,owed.error);
 const d1=await ui.read(),debt=d1.state.records[owed.result.debt];
 assert.equal(d1.state.player.coins,d0.state.player.coins,'赊账不扣现钱');assert.equal(debt.debtor,'player');assert.equal(debt.creditor,LINSUI);assert.equal(debt.amount,owed.result.cost);assert.equal(debt.deadline,10*60+DAY);
 assert.match(owed.lines.join(''),/新立了一份欠账/);
 const waited=await ui.choose('time',{minutes:2*DAY});
 const d2=await ui.read();assert.equal(d2.state.records[owed.result.debt].status,'逾期');
 assert.ok(waited.result.notices.some(n=>n.type==='debt'&&/逾期/.test(n.text)),'到期提醒');
 assert.ok(standing(engine,d2.state,LINSUI,'player')<regard,'违约后果：债主对你的立场下降');
 const repay=await ui.choose('trade.repay',{debt:owed.result.debt,seller:LINSUI});assert.ok(repay.ok,repay.error);
 const d3=await ui.read();assert.equal(d3.state.records[owed.result.debt].status,'已还清');assert.equal(d3.state.records[owed.result.debt].overdueAt,debt.deadline);conserved(d2,d3,'还债');
});

test('T2 步行去白石镇：出路显示天气路况，耗时按路线与天气结算（数小时），到达后地点更新',async t=>{
 const ui=await uiSession(t,{mutate:at('loc_hw',6*60)});
 const exit=(await ui.menu()).objects.exits.find(e=>e.id==='loc_bs');assert.ok(exit.condition,'出路带天气路况');assert.match(exit.direction,/面/);
 const before=await ui.read(),r=await ui.choose('move',{destination:'loc_bs'},{target:'loc_bs'});assert.ok(r.ok,r.error);
 const after=await ui.read();assert.equal(after.state.location,'loc_bs');assert.equal(after.state.minute-before.state.minute,r.result.minutes);
 assert.ok(r.result.minutes>=4*60&&r.result.minutes<=10*60,`约半日路程：${r.result.minutes}分`);
 assert.match(r.lines.join(''),/白石镇.*东面.*里/);
});

test('T3 要去王都：不瞬移，沿路线走若干天；尾注直接改地点被拒',async t=>{
 const ui=await uiSession(t,{mutate:at('loc_hw',6*60)});
 const view=await ui.server.api('read',{campaignId:ui.campaignId});
 await assert.rejects(ui.server.api('execute',{campaignId:ui.campaignId,tool:'world_turn',args:{startMinute:view.document.state.minute,location:'loc_capital'},eventId:'teleport',expectedSequence:view.reference.sequence}));
 const r=await ui.choose('move',{destination:'王都'},{target:'loc_capital'});assert.ok(r.ok,r.error);
 assert.ok(r.result.minutes>=DAY,'走了一天以上');assert.ok(r.result.edges.length>=2,'沿多段路线');
 assert.equal((await ui.read()).state.location,'loc_capital');
});

test('T4 夜里去铁匠铺：能走到门口，但店主睡下不营业，说明何时开门，钱不动',async t=>{
 const ui=await uiSession(t,{mutate:at('loc_hw',23*60)});
 assert.ok((await ui.choose('move',{destination:FORGE},{target:FORGE})).ok);
 // A known closed shop can be addressed without seeing its sleeping keeper;
 // this is a request, not an assertion of visible stock or an available sale.
 const before=await ui.read(),r=await ui.choose('trade.buy',{seller:SMITH,item:'item_kitchen_knife',quantity:1},{target:SMITH,search:true});
 assert.equal(r.ok,false);assert.match(r.error,/此刻不提供交易服务/);assert.match(r.error,/08:00/);
 assert.equal((await ui.read()).state.player.coins,before.state.player.coins);
});

test('T5 睡到天亮：跨日，生命与魔力恢复',async t=>{
 const ui=await uiSession(t,{mutate:at(INN,22*60,s=>{s.player.hp=2;s.player.mp=1;})});
 const r=await ui.choose('time.sleep',{until:{dayOffset:1,hour:6}});assert.ok(r.ok,r.error);
 const d=await ui.read();assert.equal(d.state.minute,DAY+6*60);assert.ok(d.state.player.hp>2&&d.state.player.mp>1);
 assert.match(r.lines.join(''),/醒来已是06:00/);assert.ok(r.applied.some(e=>e.op==='vital'&&e.need==='hp'&&e.delta>0));
});

test('T6 冬季北境山口封闭：出路标“本季封路”，移动被拒并给原因',async t=>{
 const winter=9*30*DAY+10*60;
 const ui=await uiSession(t,{mutate:at('site_white_canopy',winter)});
 const exit=(await ui.menu()).objects.exits.find(e=>e.id==='site_ice_echo');assert.equal(exit.condition,'本季封路');
 const r=await ui.choose('move',{destination:'site_ice_echo'},{target:'site_ice_echo'});
 assert.equal(r.ok,false);assert.match(r.error,/季节/);assert.equal((await ui.read()).state.location,'site_white_canopy');
});
