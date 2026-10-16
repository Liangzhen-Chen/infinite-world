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
 const postage=before.state.player.coins-mid.state.player.coins;assert.ok(postage>=1);assert.equal(mid.state.npcs[ZHENG].coins-before.state.npcs[ZHENG].coins,postage,'邮资付给承运人');
 const heard=s=>(s.state.npcs[YANZHE].memoryStream??[]).filter(m=>m.channel==='post');
 assert.equal(heard(mid).length,0,'④送达前收信人不知道信的内容');
 await ui.choose('time',{minutes:60});
 assert.equal(heard(await ui.read()).length,0,'④在途中仍不知道');
 await ui.choose('time',{minutes:sent.result.estimatedArrivalAt-(await ui.read()).state.minute});
 const after=await ui.read(),delivered=after.state.records[post.id];
 assert.ok(delivered.deliveredAt>=mid.state.minute+60,'③信不是瞬间送到');assert.ok(delivered.deliveredAt<=sent.result.estimatedArrivalAt);
 assert.equal(heard(after).length,1);assert.equal(heard(after)[0].content,LETTER,'⑤送达后收信人记下信中内容');assert.equal(heard(after)[0].heardFrom,'player');
});
test.todo('D25 ①邮资 8 文（铜钱 50→42，驿站 +8）——引擎邮资按 里程 × 重量 × 费率 公式（1 文），不读驿传价表：缺 carriers.json 驿传价/发车表消费（S5 运力与运费；缺省值已补入 transport.json）');
test.todo('D25 ②背包里的信 −1——引擎信是一条记忆文本（post.payload），不是背包物品：缺“信件物品 + 代表它的义务”（S3 票据 = 义务 + 代表物品；S6 文书）');
test.todo('D25 ③五月初四送达——引擎载件马车当天约 8 小时到（本例送达 16:00），题面驿站“明日送到”由发车表决定：缺 carriers.json departures（辰初发、当日截件午初后次日发）的消费（S5）');

// ---- D26 托运货物 ----
test('D26 托运货物 ②③④⑤：托运 2 石（5→3），在途不在仓库也不在粮行，次日到达标为玩家所有待取，提取到手 2 石、数量不变；运费付给车行',async t=>{
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
 assert.equal(baseEngine.calendar(row.arrivedAt).text.match(/\d+日/)[0],'16日','④九月十六到达');
 assert.equal(held(arrived.state.inventory,'item_oats'),3,'待取期间仍不在仓库里');assert.equal(held(arrived.state.npcs[YANZHE].inventory,'item_oats'),held(before.state.npcs[YANZHE].inventory,'item_oats'),'待取期间不在粮行的货架上');
 const walk=await ui.choose('move',{destination:'loc_bs'},{target:'loc_bs'});assert.ok(walk.ok,walk.error);
 const collected=await legacy(ui,'world_trade',{operation:'transport',task:'collect',business:booked.id},'collect-d26');
 const end=await ui.read();assert.equal(held(end.state.inventory,'item_oats'),5,'⑤提取后 3+2=5：数量与托运时一致');
 assert.deepEqual(end.state.records[booked.id].deliveredCargo.map(c=>c.quantity),[2]);assert.equal(end.state.records[booked.id].status,'delivered');
 assert.ok(collected.ok);
});
test.todo('D26 ①运费 30 文（铜钱 100→70，车行 +30）——引擎运费按 里程 × 重量 × 费率 公式（本例 1 文），不读运费表：缺 transport.json 运输成本比/carriers 价表的消费（S5 运力；缺省值已补入表）');
test.todo('D26 ④到达钟点“九月十六午时前后”——引擎马车日行 8 小时、夜不行车，次日上午到（本例 09:20）；与午时有约 2 小时差距：缺 carriers.json 发车表与 transport.json 车速（S5）');
