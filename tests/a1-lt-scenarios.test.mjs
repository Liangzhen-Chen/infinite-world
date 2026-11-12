// A1 验收：开发指南 11.3 的 L 类（交易与账本）与 T 类（时间与移动）中不含对话的部分，用界面动作脚本驱动，确定性、不调用模型。
// 每一步都从 /actions 菜单取动作（界面够得着），经 /execute 的 world_act 结算；断言账本、时间、地点与守恒。
// T1（普通对话推进时间）属于对话，归 A2。
import test from 'node:test';
import assert from 'node:assert/strict';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {standing} from '../server-plugin/standing.mjs';
import {legacyTotal,flowDelta,reconcile} from './helpers/ledger-audit.mjs';
import {uiSession as createUISession,qty} from './helpers/ui-script.mjs';
import {facilityRuntime} from '../server-plugin/facility-state.mjs';
import {marketSupply} from '../server-plugin/market.mjs';

// Reuse the server's campaign seed interface: these scenarios test trade/time,
// including L4 restocking with a healthy smith, rather than random illness.
const uiSession=(t,options)=>createUISession(t,{...options,seed:'a1-lt-scenarios'});

const engine=new WorldEngine(await loadWorld());
const DAY=1440,INN='bld_hw_qingdeng',LINSUI='npc_hw_linsui',FORGE='bld_hw_forge',SMITH='npc_hw_duanyan';
// Money only moves between holders or through declared sources/sinks; the two books agree.
function conserved(before,after,label){
 // The first event of a campaign opens the books; flows count from then on.
 const flows=before.ledger?flowDelta(before,after,'coin_river'):{sources:0,sinks:0};
 assert.equal(legacyTotal(engine,after.state)-legacyTotal(engine,before.state),flows.sources-flows.sinks,`${label}：铜钱守恒`);
 assert.deepEqual(reconcile(engine,after).mismatches,[],`${label}：账本与旧字段一致`);
}
// 前提由引擎现价推出，不手调钱数凑数：当前（买方、卖方、物品、数量）的报价，读自引擎同一报价路径（engine.mjs currentTradeQuote）。
const quoteNow=(doc,args)=>facilityRuntime().currentTradeQuote(engine,doc,args);
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
 assert.ok(quoteNow(before,{seller:LINSUI,item:'item_bread',quantity:3}).totalCoins>1,'前提：三个面包的总价超过玩家的 1 文'); // 前提由现价推出
 const r=await ui.choose('trade.buy',{item:'item_bread',quantity:3},{target:LINSUI});
 assert.equal(r.ok,false);assert.match(r.error,/不足/);
 const after=await ui.server.api('read',{campaignId:ui.campaignId});
 assert.equal(after.reference.sequence,view.reference.sequence);assert.deepEqual(after.document.state.inventory,before.state.inventory);assert.equal(after.document.state.player.coins,1);
});

test('L3 同一天再买同一件东西，成交深度真实上升且总额一次取整',async t=>{
 // S5-02: preserve the original three purchases beyond four household
 // retained portions; only the non-examined opening shelf is declared.
 const ui=await uiSession(t,{mutate:at(INN,10*60,s=>{s.npcs[LINSUI].inventory.item_bread={quantity:8};})});
 const a=await ui.choose('trade.buy',{item:'item_bread',quantity:1},{target:LINSUI});
 // Keep both same-day purchases outside the real noon market bookings now
 // induced by household work. Ninety elapsed minutes still tests current depth.
 await ui.choose('time',{minutes:90});
 const b=await ui.choose('trade.buy',{item:'item_bread',quantity:2},{target:LINSUI});
 // S5-02 / 15 §15.2 replaces the daily lock with current market depth.
 assert.ok(a.ok&&b.ok,[a.ok,a.error,b.ok,b.error].join(' | '));assert.ok(b.result.pricing.depth>a.result.pricing.depth);
 // Opening saleable food exceeds28, demand14 → floor .5. All remaining factors
 // are 1 on the first purchase: published bread 2 × .5 = 1 copper.
 assert.equal(a.result.cost,1);
 assert.equal(b.result.cost,Math.trunc(2*b.result.pricing.unitPrice));
 const d=await ui.read(),deals=Object.values(d.state.records).filter(r=>r.category==='market_trade'&&r.seller===LINSUI&&r.item==='item_bread');assert.equal(deals.length,2);assert.equal(deals.at(-1).totalCoins,b.result.cost);
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
 const again=await ui.choose('trade.buy',{item,quantity:1},{target:SMITH});
 assert.ok(again.ok,`${again.error} | customer_flow: ${JSON.stringify(Object.values((await ui.read()).state.records).filter(r=>r.category==='customer_flow').map(r=>[r.shop,r.day,r.minute,(r.visits??[]).map(v=>[v.npc,v.outcome,v.item])]))}`);
});

test('L5 卖给钱不够的 NPC：不凭空付款，整笔拒绝且钱物不动',async t=>{
 const ui=await uiSession(t,{mutate:at(INN,10*60,(s)=>{s.npcs[LINSUI].coins=1;s.inventory.item_bread={quantity:5};})});
 const before=await ui.read();
 assert.ok(quoteNow(before,{buyer:LINSUI,seller:'player',item:'item_bread',quantity:5}).totalCoins>1,'前提：五个面包的收购总价超过林穗的 1 文'); // 前提由现价推出
 const r=await ui.choose('trade.sell_to',{item:'item_bread',quantity:5},{target:LINSUI});
 assert.equal(r.ok,false);assert.match(r.error,/余额不足/);
 const after=await ui.read();assert.equal(after.state.npcs[LINSUI].coins,1);assert.equal(qty(after.state.inventory.item_bread),5);assert.deepEqual(after.state,before.state);
});
// 指南11.3 L5：卖方明确允许部分成交；原整笔拒绝断言保留。
test('L5 对方钱不够时部分收购：只转付得起的原货，不足一件则回滚',async t=>{
 // 15 §15.2 truncates the bill once: 5 coins buys 8 at .6, charges 4
 // and legitimately leaves purchasing capacity. Six buys 10 for exactly 6,
 // retaining this scenario's original exhausted-purse refusal premise.
 const ui=await uiSession(t,{mutate:at(INN,10*60,s=>{s.npcs[LINSUI].coins=6;s.inventory.item_bread={quantity:20};})});
 const before=await ui.read(),menu=await ui.menu(LINSUI);
 const supplyBefore=marketSupply({document:before,get:(...p)=>p.reduce((v,k)=>v?.[k],before)},engine,'item_bread',INN);
 assert.ok(menu.actions.find(a=>a.id==='core:trade.sell_to').slots.some(s=>s.name==='allowPartial'));
 const r=await ui.choose('trade.sell_to',{item:'item_bread',quantity:20,allowPartial:true},{target:LINSUI});
 assert.ok(r.ok,r.error);assert.equal(r.result.partial,true);assert.equal(r.result.requestedQuantity,20);
 // 新值：成交 8 个、总价 5。面包 2 × 供需比 29/47(=0.617021，已离开供需下限 .5) × 店收购价差 .6 = 单价 0.740426；
 // 成交数量 = min(20, floor(店主现金 6 ÷ 单价)) = floor(8.10) = 8（engine.mjs:707）；按 8 件重报价（非零售，沿供需曲线积分）
 // 总额 0.740426×29×ln(55/47)÷0.617021 = 5.4701，整笔截断一次 = 5。旧值 6 = 面包 2×.5×.6×10（地板 .5、10 件）。
 // 对应设计变化：面包饱腹改推导 + 卖家份额分摊使供需比离开地板（PLAN.md:584、591③、316③、563②）；李白 11-11 (a)（PLAN.md:540）。
 // 证据：F:/dnd/docs/审查记录/市场价格-探针输出-mkt-5.txt，复算 市场价格-独立复算-A.md、-B.md（a1-lt-scenarios-7，requote 与 result.pricing 差 0）。断言仍为精确相等。
 // EC-1a 之后（采购口径扣聚落公粮，household-budget.mjs:378-379）：登记户口粮由公粮覆盖，各户 retained 归 0，供给升、需求降。静态推不出比值（market.mjs:219，
 // 需求里玩家与未登记 NPC 的留存仍在），所以先用引擎读出的供给与需求核对：比值 ≤ 0.5 才夹到 0.5 地板，价才是旧值算式：面包 2 × .5 × 收购价差 .6 = 单价 0.6，
 // 成交数量 = min(20, floor(6 ÷ 0.6)) = 10，总额 10 × 0.6 = 6（正好用尽林穗的 6 文）。比值若 > 0.5，则此处期望要按真实比值重推，不抄实际值。
 assert.ok(supplyBefore.demand/Math.max(1,supplyBefore.supply)<=0.5,`precondition: demand ${supplyBefore.demand} / supply ${supplyBefore.supply} must be at most 0.5 to land on the floor`);
 assert.equal(r.result.cost,6);
 assert.ok(r.lines[0].includes(`${r.result.quantity}份`),'界面只报实际成交数量');
 assert.equal(r.result.quantity,10); // floor(6÷0.6)，见上；
 assert.ok(r.result.quantity>0&&r.result.quantity<20);const after=await ui.read();
 assert.equal(qty(after.state.inventory.item_bread),20-r.result.quantity);
 assert.equal(qty(after.state.npcs[LINSUI].inventory.item_bread)-qty(before.state.npcs[LINSUI].inventory.item_bread),r.result.quantity);
 assert.equal(after.state.player.coins-before.state.player.coins,r.result.cost);
 assert.equal(before.state.npcs[LINSUI].coins-after.state.npcs[LINSUI].coins,r.result.cost);
 assert.equal(after.state.minute-before.state.minute,5);conserved(before,after,'部分收购');
 assert.equal((await ui.retry('trade.sell_to',{item:'item_bread',quantity:20,allowPartial:true},r.eventId,LINSUI)).duplicate,true);
 assert.deepEqual((await ui.read()).state,after.state);
 // 原第二次拒绝依赖"第一次成交后林穗恰好用尽钱袋"（旧口径 6 文买 10 件恰好用尽）；现在成交 8 件付 5 后林穗还剩 1 文，仍买得起一件，前提不再成立。
 // 保留原意图（买方余钱不足一件：整笔回滚、状态不变、提示余额不足）：另开一个会话，林穗的余钱设为"严格小于引擎现价的单件收购价的最大整数"，
 // 价与余钱都由引擎现价运行时推出（不写死钱数），并断言该前提成立。
 const unit=quoteNow(before,{buyer:LINSUI,seller:'player',item:'item_bread',quantity:1}).listPrice,poor=Math.ceil(unit)-1;
 assert.ok(poor>=0&&poor<unit,'前提：余钱严格小于单件收购价');
 const ui2=await uiSession(t,{mutate:at(INN,10*60,s=>{s.npcs[LINSUI].coins=poor;s.inventory.item_bread={quantity:20};})});
 const before2=await ui2.read();
 assert.ok(quoteNow(before2,{buyer:LINSUI,seller:'player',item:'item_bread',quantity:1}).listPrice>before2.state.npcs[LINSUI].coins,'前提：林穗余钱买不起一件（会话内实测现价）');
 const denied=await ui2.choose('trade.sell_to',{item:'item_bread',quantity:20,allowPartial:true},{target:LINSUI});
 assert.equal(denied.ok,false);assert.match(denied.error,/余额不足/);assert.deepEqual((await ui2.read()).state,before2.state);
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
