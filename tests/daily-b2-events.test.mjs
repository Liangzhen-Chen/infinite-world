// todo 的阶段与真实前提逐条登记：docs/A3-后续阶段登记.md S5CT CT04/CT07（保留原阶段边界）。
// 日常题集第二批（DAILY 卡）：送信、托运、普通打斗、求医、入会、过关卡、离开几天再回来。
// 夹具与口径同 daily-b2-trade.test.mjs；寄信/托运/求医界面动作暂不可达的（A1 对 consent 槽一律拒绝），走同一条 /execute 通道的旧工具。
import test from 'node:test';
import assert from 'node:assert/strict';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {standing} from '../server-plugin/standing.mjs';
import {monsterStats} from '../server-plugin/combat.mjs';
import {MEDICAL_SKILL} from '../server-plugin/medicine-state.mjs';
import {uiSession} from './helpers/ui-script.mjs';
import {variant,item,setPrice,scene,stack,monthDayMinute,conserved,primed,held,legacy,baseEngine,baseWorld,DAY} from './helpers/daily-b2.mjs';

const ZHENG='npc_hw_zhengshuisheng',YANZHE='npc_hw_yanzhe',LINSUI='npc_hw_linsui';

// ---- D25 送信 ----
test('D25 送信 ③④⑤：信在途不瞬间到，送达前收信人不知道内容，送达后收信人记下内容；邮资付给承运人',async t=>{
 // 孙二→严辙（白石镇，npc_hw_yanzhe）；驿站→郑水生的马车；夏季五月初三辰时；玩家 50 文。
 const CART='transport_asset:d25_cart',LETTER='老友，初六我去白石镇，请留一壶酒。';
 const ui=await uiSession(t,{mutate:scene('loc_hw',monthDayMinute(5,3,8,0),s=>{
  s.player.coins=50;Object.assign(s.npcs[ZHENG],{location:'loc_hw',activity:'营业',status:'正常'});
  s.records[CART]={category:'transport_asset',id:CART,kind:'cart',owner:ZHENG,location:'loc_hw',durability:100,maxDurability:100,animal:null};
 })});
 const before=await ui.read(),sent=await legacy(ui,'world_trade',{operation:'post',contract:CART,buyer:YANZHE,item:LETTER,location:'loc_bs'},'post-d25');
 const mid=await ui.read(),post=mid.state.records[sent.result.id];
 assert.equal(post.status,'in-transit','③信处于在途状态');assert.equal(post.from,'player');assert.equal(post.to,YANZHE);
 const postage=before.state.player.coins-mid.state.player.coins;assert.ok(postage>=1);// W8D：驿传费读 transport.json post.feePerLi（0.4 文/里）：河湾村→白石镇 24 km = 48 里 × 0.4 = 19.2 → 20 文；承运人收入照常抽商税 floor(20 × bps / 10000)，所以承运人净得 = 邮资 − 商税（旧口径邮资 1 文时税为 0，两式一致）。
 const tax=Object.entries(mid.state.records).find(([k,r])=>k.startsWith('trade_tax:')&&r.payer===ZHENG)?.[1];assert.equal(tax?.amount,Math.floor(postage*tax.bps/10000),'商税 = floor(邮资 × bps / 10000)');
 assert.equal(postage,Math.ceil(48*0.4),'邮资 = ceil(48 里 × 0.4)');assert.equal(mid.state.npcs[ZHENG].coins-before.state.npcs[ZHENG].coins,postage-(tax?.amount??0),'邮资付给承运人（扣商税）');
 const heard=s=>(s.state.npcs[YANZHE].memoryStream??[]).filter(m=>m.channel==='post');
 assert.equal(heard(mid).length,0,'④送达前收信人不知道信的内容');
 await ui.choose('time',{minutes:60});
 assert.equal(heard(await ui.read()).length,0,'④在途中仍不知道');
 await ui.choose('time',{minutes:sent.result.estimatedArrivalAt-(await ui.read()).state.minute});
 const after=await ui.read(),delivered=after.state.records[post.id];
 assert.ok(delivered.deliveredAt>=mid.state.minute+60,'③信不是瞬间送到');assert.ok(delivered.deliveredAt<=sent.result.estimatedArrivalAt);
 assert.equal(heard(after).length,1);assert.equal(heard(after)[0].content,LETTER,'⑤送达后收信人记下信中内容');assert.equal(heard(after)[0].heardFrom,'player');
});
test.todo('D25 ②背包里的信 −1——引擎信是一条记忆文本（post.payload），不是背包物品：缺“信件物品 + 代表它的义务”（S3 票据 = 义务 + 代表物品；S6 文书）');
test('D25 ①③ 送信：邮资读 transport.json post.feePerLi 按里程计，驿站班次读 departure:post（辰初发，次日送到）',async t=>{
 // W8D：原 todo 兑现。夹具同上；河湾村→白石镇 route_hw_bs 24 km = 48 里。
 const CART='transport_asset:d25_cart',LETTER='老友，初六我去白石镇，请留一壶酒。';
 const ui=await uiSession(t,{mutate:scene('loc_hw',monthDayMinute(5,3,8,0),s=>{
  s.player.coins=50;Object.assign(s.npcs[ZHENG],{location:'loc_hw',activity:'营业',status:'正常'});
  s.records[CART]={category:'transport_asset',id:CART,kind:'cart',owner:ZHENG,location:'loc_hw',durability:100,maxDurability:100,animal:null};
 })});
 const before=await ui.read(),sent=await legacy(ui,'world_trade',{operation:'post',contract:CART,buyer:YANZHE,item:LETTER,location:'loc_bs'},'post-d25b');
 const mid=await ui.read(),post=mid.state.records[sent.result.id],trip=mid.state.records[post.shipment];
 // ①邮资 = ceil(48 里 × 0.4 文/里) = ceil(19.2) = 20（题面 20 里 8 文是同一费率：0.4 × 20 = 8）；寄信人少 20，承运人收到 20 扣商税。
 assert.equal(before.state.player.coins-mid.state.player.coins,20,'①寄信人付 20 文');assert.equal(trip.freight,20,'①运单运价 20');
 // ③辰时（08:00）寄出，已过今日辰初（07:00）班次 → 次日五月初四辰初（07:00）发车，不是当天出发。
 assert.equal(trip.departAt,monthDayMinute(5,4,7,0),'③次日辰初发车');
 await ui.choose('time',{minutes:sent.result.estimatedArrivalAt-mid.state.minute});
 const after=await ui.read(),delivered=after.state.records[post.id];
 assert.ok(delivered.deliveredAt>=trip.departAt,'③送达不早于发车');assert.equal(baseEngine.calendar(delivered.deliveredAt).text.match(/\d+日/)[0],'4日','③五月初四送达（题面“明日送到”）');
});

// ---- D26 托运货物 ----
test('D26 托运货物 ②③④⑤：托运 2 石（5→3），在途不在仓库也不在粮行，到站标为玩家所有待取，提取到手 2 石、数量不变；运费付给车行',async t=>{
 // 车行→郑水生的马车；2 石麦子→带壳燕麦 2 份；粮行→白石镇严辙；秋季九月十五辰时；玩家 100 文，仓库（行囊）有 5。
 const CART='transport_asset:d26_cart';
 const ui=await uiSession(t,{mutate:scene('loc_hw',monthDayMinute(9,15,8,0),s=>{
  s.player.coins=100;s.inventory.item_oats=stack(5,{weight:0.5});Object.assign(s.npcs[ZHENG],{location:'loc_hw',activity:'营业',status:'正常'});
  s.records[CART]={category:'transport_asset',id:CART,kind:'cart',owner:ZHENG,location:'loc_hw',durability:100,maxDurability:100,animal:null};
 })});
 const before=await primed(ui),slots={operation:'transport',contract:CART,location:'loc_bs',item:'item_oats',quantity:2};
 const quote=(await legacy(ui,'world_trade',{...slots,task:'quote'},'quote-d26')).result;
 const booked=(await legacy(ui,'world_trade',{...slots,task:'book'},'book-d26')).result,mid=await ui.read();
 assert.equal(held(before.state.inventory,'item_oats')-held(mid.state.inventory,'item_oats'),2,'②仓库 5→3');assert.equal(held(mid.state.inventory,'item_oats'),3);
 assert.equal(before.state.player.coins-mid.state.player.coins,quote.total,'①运费 = 报价，付款一次');assert.equal(mid.state.npcs[ZHENG].coins-before.state.npcs[ZHENG].coins,quote.total,'①车行收到运费');
 const inTransit=await ui.read();
 assert.equal(held(inTransit.state.inventory,'item_oats'),3);assert.equal(held(inTransit.state.npcs[YANZHE].inventory,'item_oats'),held(before.state.npcs[YANZHE].inventory,'item_oats'),'③在途不在粮行');
 assert.deepEqual(inTransit.state.records[booked.id].cargo.map(c=>[c.item,c.quantity]),[['item_oats',2]],'③在途的 2 份只记在运单上，没有复制');
 await ui.choose('time',{minutes:booked.estimatedArrivalAt-inTransit.state.minute+1});
 const arrived=await ui.read(),row=arrived.state.records[booked.id];
 assert.equal(row.status,'arrived','④到货标为待取（收货人是玩家，人不在到货地）');assert.equal(row.recipient,'player');assert.equal(row.owner,'player');
 // CT07：08:01订车，09:00起算等客一日；16日09:00发，日行07–15，17日09:00到。
 assert.equal(row.arrivedAt,monthDayMinute(9,17,9),'④真实等客与夜宿后九月十七巳初到达');
 assert.equal(held(arrived.state.inventory,'item_oats'),3,'待取期间仍不在仓库里');assert.equal(held(arrived.state.npcs[YANZHE].inventory,'item_oats'),held(before.state.npcs[YANZHE].inventory,'item_oats'),'待取期间不在粮行的货架上');
 const walk=await ui.choose('move',{destination:'loc_bs'},{target:'loc_bs'});assert.ok(walk.ok,walk.error);
 const collected=await legacy(ui,'world_trade',{operation:'transport',task:'collect',business:booked.id},'collect-d26');
 const end=await ui.read();assert.equal(held(end.state.inventory,'item_oats'),5,'⑤提取后 3+2=5：数量与托运时一致');
 assert.deepEqual(end.state.records[booked.id].deliveredCargo.map(c=>c.quantity),[2]);assert.equal(end.state.records[booked.id].status,'delivered');
 assert.ok(collected.ok);
});
test('D26 ① 托运运费读 transport.json carrier:cart 费率：运费 = ceil(里程 km × 计费重量 kg × 费率 × (1 + 路风险))',async t=>{
 // W8D：运价表接入。题面“2 石 × 20 里 = 30 文”按石计价与引擎按重量计价口径不同，保持重量计价（数值与原硬编码一致），只验证费率来自表。
 const CART='transport_asset:d26b_cart';
 const mk=world=>uiSession(t,{world,mutate:scene('loc_hw',monthDayMinute(9,15,8,0),s=>{
  s.player.coins=1000;s.inventory.item_oats=stack(40,{weight:0.5});Object.assign(s.npcs[ZHENG],{location:'loc_hw',activity:'营业',status:'正常'});
  s.records[CART]={category:'transport_asset',id:CART,kind:'cart',owner:ZHENG,location:'loc_hw',durability:100,maxDurability:100,animal:null};
 })});
 const slots={operation:'transport',contract:CART,location:'loc_bs',item:'item_oats',quantity:40,task:'quote'};
 const base=(await legacy(await mk(),'world_trade',slots,'quote-d26b')).result;
 // 40 份 × 0.5 kg = 20 kg；route_hw_bs 24 km、路风险 1、容量系数 20：24 × 20 × 0.012 × 20 × (1 + 1) = 230.4 → 231。
 assert.equal(base.capacityFactor,20,'无驮畜的手拉车只能载 30 kg（10 + 力量 10 × 2），容量系数 = 600 / 30 = 20');assert.equal(base.passages[0].risk,1);
 assert.equal(base.freight,231);
 const doubled=variant(w=>{const tb=structuredClone(baseWorld.balance.transport);tb.rows.find(r=>r.key==='carrier:cart').rate=0.024;w.balance={...baseWorld.balance,transport:tb};});
 const dbl=(await legacy(await mk(doubled),'world_trade',slots,'quote-d26b2')).result;
 assert.equal(dbl.freight,461,'费率翻倍：24 × 20 × 0.024 × 20 × 2 = 460.8 → 461');
});
test('D26 ④ 实际订车→等客→发车→夜宿→到站→取货，24km按规则于九月十七09:00到',async t=>{
 const CART='transport_asset:d26_clock';
 const ui=await uiSession(t,{mutate:scene('loc_hw',monthDayMinute(9,15,8),s=>{
  s.player.coins=100;s.inventory.item_oats=stack(5,{weight:0.5});Object.assign(s.npcs[ZHENG],{location:'loc_hw',activity:'营业',status:'正常'});
  s.records[CART]={category:'transport_asset',id:CART,kind:'cart',owner:ZHENG,location:'loc_hw',durability:100,maxDurability:100,animal:null};
 })});
 await primed(ui);
 const slots={operation:'transport',contract:CART,location:'loc_bs',item:'item_oats',quantity:2};
 const quote=(await legacy(ui,'world_trade',{...slots,task:'quote'},'quote-clock')).result;
 // 手算：15日08:01已过08点，首可用班次09:00；1kg未满30kg，等一日到16日09:00。
 // 固定种子两日均晴、官道倍率1，24km÷3km/h=8小时；09–15行18km，夜宿16h，07–09行6km。
 const departure=monthDayMinute(9,16,9),night=monthDayMinute(9,16,15),arrival=monthDayMinute(9,17,9);
 assert.equal(quote.distanceKm,24);assert.equal(quote.departAt,departure);assert.equal(quote.estimatedArrivalAt,arrival);
 const booked=(await legacy(ui,'world_trade',{...slots,task:'book'},'book-clock')).result;
 assert.equal(booked.departAt,departure);assert.equal(booked.estimatedArrivalAt,arrival);assert.equal(booked.status,'booked');
 const row=async()=>(await ui.read()).state.records[booked.id];
 await ui.choose('time',{minutes:departure-(await ui.read()).state.minute-1});assert.equal((await row()).status,'booked');
 await ui.choose('time',{minutes:1});assert.equal((await row()).departedAt,departure);assert.equal((await row()).status,'moving');
 await ui.choose('time',{minutes:night-(await ui.read()).state.minute});
 assert.equal((await row()).transport.segment.kind,'rest');assert.equal((await row()).transport.remainingKm,6);
 await ui.choose('time',{minutes:arrival-(await ui.read()).state.minute-1});assert.equal((await row()).arrivedAt,undefined);
 await ui.choose('time',{minutes:1});assert.equal((await row()).arrivedAt,arrival);assert.equal((await row()).status,'arrived');
 assert.equal(held((await ui.read()).state.inventory,'item_oats'),3);
 const walk=await ui.choose('move',{destination:'loc_bs'},{target:'loc_bs'});assert.ok(walk.ok,walk.error);
 await legacy(ui,'world_trade',{operation:'transport',task:'collect',business:booked.id},'collect-clock');
 assert.equal((await row()).status,'delivered');assert.equal(held((await ui.read()).state.inventory,'item_oats'),5);
});
