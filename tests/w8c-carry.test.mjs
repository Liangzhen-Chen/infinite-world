// W8C 负重：安全负重从属性表 attr.carry 与身体力量派生（20 + 2 × 力量，公斤），不入存档；
// 买入/接受物品超限时回执说明差额与办法；放下后可买；同行/雇工/坐骑分担；临时修正不得越过表上限（20 + 4 × 力量）。
import test from 'node:test';
import assert from 'node:assert/strict';
import {uiSession} from './helpers/ui-script.mjs';
import {variant,scene,stack,monthDayMinute,item,primed,held} from './helpers/daily-b2.mjs';

const WEAVING='bld_hw_weaving',SULAN='npc_hw_sulan',WUSHUO='npc_hw_wushuo',CLOTH='item_linen_cloth';
// 夹具：一匹窄幅麻布按 5 公斤计（世界副本改重量，与其他日常测试改标价同一做法）；玩家空手，钱足够，苏岚备货 40 匹。
const bolt=world=>{item(world,CLOTH).weight=5;};
async function open(t,{patch=()=>{},fill=()=>{}}={}){
 const world=variant(w=>{bolt(w);patch(w);});
 const ui=await uiSession(t,{world,mutate:scene(WEAVING,monthDayMinute(6,8,9,30),s=>{
  s.player.coins=5000;s.inventory={};s.npcs[SULAN].inventory[CLOTH]=stack(40,{weight:5});fill(s);
 })});
 await primed(ui);return ui;
}
const load=async ui=>(await ui.server.api('ui/personal',{campaignId:ui.campaignId})).load;
const buy=(ui,quantity)=>ui.choose('trade.trade',{seller:SULAN,item:CLOTH,quantity},{search:true,target:SULAN});

test('安全负重 = 20 + 2 × 力量（手算），随力量变化；派生值不在存档里',async t=>{
 // 力量 10 → 20 + 2×10 = 40；力量 16 → 20 + 2×16 = 52。
 const a=await open(t),b=await open(t,{fill:s=>{s.player.attributes.力量=16;}});
 assert.equal((await load(a)).safeKg,40);assert.equal((await load(b)).safeKg,52);
 const saved=JSON.stringify((await a.read()).state);
 assert.ok(!/safeCarry|safeKg|carryKg|spareKg/.test(saved),'存档里没有任何负重派生字段');
});

test('买入超重被拒且回执说明差额；钱货不动；刚好等于上限可买；放下后可再买',async t=>{
 const ui=await open(t),before=await ui.read();
 // 9 匹 × 5 = 45 公斤，身上 0，上限 40 → 差 5 公斤。
 const over=await buy(ui,9);
 assert.equal(over.ok,false);assert.match(over.error,/拿不动/);assert.match(over.error,/还差5公斤/);assert.match(over.error,/安全负重40公斤/);
 const after=await ui.read();
 assert.equal(after.state.player.coins,before.state.player.coins,'被拒时一文不扣');assert.equal(held(after.state.inventory,CLOTH),0);
 // 8 匹 × 5 = 40 公斤，恰好等于上限：可买。
 const ok=await buy(ui,8);assert.ok(ok.ok,ok.error);
 assert.equal(held((await ui.read()).state.inventory,CLOTH),8);
 assert.equal((await load(ui)).spareKg,0);
 // 已满载：再买 1 匹（5 公斤）→ 差 5 公斤。
 const full=await buy(ui,1);assert.equal(full.ok,false);assert.match(full.error,/还差5公斤/);
 // 放下（卖回给苏岚）2 匹后，空出 10 公斤，可买 2 匹，不可买 3 匹。
 const sold=await ui.choose('trade.sell_to',{buyer:SULAN,item:CLOTH,quantity:2},{search:true,target:SULAN});assert.ok(sold.ok,sold.error);
 assert.equal(held((await ui.read()).state.inventory,CLOTH),6);
 const three=await buy(ui,3);assert.equal(three.ok,false);assert.match(three.error,/还差5公斤/);
 const two=await buy(ui,2);assert.ok(two.ok,two.error);
});

test('同行同伴在场且有余力时分担；不在场、被押解者、无余力者不算',async t=>{
 // 吴朔力量 10 → 他能背 20+2×10 = 40 公斤，空手 → 余力 40；玩家 40 + 40 = 80 公斤。
 const here=s=>{s.player.companions=[WUSHUO];s.npcs[WUSHUO].location=WEAVING;s.npcs[WUSHUO].inventory={};};
 const joined=await open(t,{fill:here});
 assert.equal((await load(joined)).helperKg,40);
 const nine=await buy(joined,9);assert.ok(nine.ok,nine.error);                    // 45 <= 80
 const sixteen=await buy(joined,7);assert.ok(sixteen.ok,sixteen.error);          // 45+35 = 80 <= 80
 const over=await buy(joined,1);assert.equal(over.ok,false);assert.match(over.error,/共85公斤/);assert.match(over.error,/同行搭手另可分担40公斤/);assert.match(over.error,/还差5公斤/);
 const away=await open(t,{fill:s=>{here(s);s.npcs[WUSHUO].location='bld_hw_qingdeng';}});
 assert.equal((await load(away)).helperKg,0);assert.equal((await buy(away,9)).ok,false);
 const loaded=await open(t,{fill:s=>{here(s);s.npcs[WUSHUO].inventory[CLOTH]=stack(8,{weight:5});}});
 assert.equal((await load(loaded)).helperKg,0);assert.equal((await buy(loaded,9)).ok,false);
 const captive=await open(t,{fill:s=>{here(s);s.records.w8c_wanted={category:'wanted',id:'w8c_wanted',subject:WUSHUO,captive:{by:'player'}};}});
 assert.equal((await load(captive)).helperKg,0);
});

test('当前受雇的帮工在场时分担',async t=>{
 // 一份有效的作坊雇佣（雇主 = 玩家）：吴朔在场、空手 → 余力 40。
 const hired=await open(t,{fill:s=>{s.npcs[WUSHUO].location=WEAVING;s.npcs[WUSHUO].inventory={};
  s.records.w8c_hire={category:'contract',kind:'workshop',id:'w8c_hire',worker:WUSHUO,owner:'player',parties:[WUSHUO,'player'],status:'有效',createdAt:0,deadline:10000000,wage:10};}});
 assert.equal((await load(hired)).helperKg,40);
 const ok=await buy(hired,16);assert.ok(ok.ok,ok.error);                          // 80 = 40 + 40
});

test('临时修正叠加在派生值上，但不越过表上限 20 + 4 × 力量',async t=>{
 const mod=value=>w=>{w.derived={...w.derived,modifiers:[...(w.derived?.modifiers??[]),{id:'w8c-carry-aid',pack:'market',target:'body:carry',stage:'add',value}]};};
 // 力量 10：派生 40；+5 → 45；表上限 20+4×10 = 60。
 assert.equal((await load(await open(t,{patch:mod(5)}))).safeKg,45);
 // +100：槽自身 x2 钳制是 80，表上限 60 更紧，取 60。
 assert.equal((await load(await open(t,{patch:mod(100)}))).safeKg,60);
 const high=await open(t,{patch:mod(100)});
 assert.ok((await buy(high,12)).ok);
 const more=await buy(high,1);assert.equal(more.ok,false);assert.match(more.error,/还差5公斤/);
});
