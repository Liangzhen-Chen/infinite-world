// W8C 负重：安全负重从属性表 attr.carry 与身体力量派生（20 + 2 × 力量，公斤），不入存档；
// 买入/接受物品超限时回执说明差额与办法；放下后可买；同行/雇工/坐骑分担；临时修正不得越过表上限（20 + 4 × 力量）。
import test from 'node:test';
import assert from 'node:assert/strict';
import {uiSession} from './helpers/ui-script.mjs';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {withPetRules} from '../world/design/pet-foundation.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {carryLoad} from '../server-plugin/carry.mjs';
import {fixture} from './helpers/finance.mjs';
import {produceItems,changeItems} from '../server-plugin/items.mjs';
import {derivedStats} from '../server-plugin/combat.mjs';
import {baseWorld,variant,scene,stack,monthDayMinute,item,primed,held} from './helpers/daily-b2.mjs';

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

test('安全负重 = rules.json 的 carryBase 10 + 2 × 力量（手算，与 combat.derivedStats 同源同值），随力量变化；派生值不在存档里',async t=>{
 // 力量 10 → 10 + 2×10 = 30；力量 16 → 10 + 2×16 = 42。
 const a=await open(t),b=await open(t,{fill:s=>{s.player.attributes.力量=16;}});
 assert.equal((await load(a)).safeKg,30);assert.equal((await load(b)).safeKg,42);
 for(const [ui,str] of [[a,10],[b,16]]){const attributes={...(await ui.read()).state.player.attributes,力量:str};assert.equal((await load(ui)).safeKg,derivedStats({level:1,attributes},baseWorld.rules).carryKg,'与 combat.derivedStats 的 carryKg 同值');}
 const saved=JSON.stringify((await a.read()).state);
 assert.ok(!/safeCarry|safeKg|carryKg|spareKg/.test(saved),'存档里没有任何负重派生字段');
});

test('买入超重被拒且回执说明差额；钱货不动；刚好等于上限可买；放下后可再买',async t=>{
 const ui=await open(t),before=await ui.read();
 // 7 匹 × 5 = 35 公斤，身上 0，上限 30 → 差 5 公斤。
 const over=await buy(ui,7);
 assert.equal(over.ok,false);assert.match(over.error,/拿不动/);assert.match(over.error,/还差5公斤/);assert.match(over.error,/安全负重30公斤/);
 const after=await ui.read();
 assert.equal(after.state.player.coins,before.state.player.coins,'被拒时一文不扣');assert.equal(held(after.state.inventory,CLOTH),0);
 // 6 匹 × 5 = 30 公斤，恰好等于上限：可买。
 const ok=await buy(ui,6);assert.ok(ok.ok,ok.error);
 assert.equal(held((await ui.read()).state.inventory,CLOTH),6);
 assert.equal((await load(ui)).spareKg,0);
 // 已满载：再买 1 匹（5 公斤）→ 差 5 公斤。
 const full=await buy(ui,1);assert.equal(full.ok,false);assert.match(full.error,/还差5公斤/);
 // 放下（卖回给苏岚）2 匹后，空出 10 公斤，可买 2 匹，不可买 3 匹。
 const sold=await ui.choose('trade.sell_to',{buyer:SULAN,item:CLOTH,quantity:2},{search:true,target:SULAN});assert.ok(sold.ok,sold.error);
 assert.equal(held((await ui.read()).state.inventory,CLOTH),4);
 const three=await buy(ui,3);assert.equal(three.ok,false);assert.match(three.error,/还差5公斤/);
 const two=await buy(ui,2);assert.ok(two.ok,two.error);
});

test('同行同伴在场且有余力时分担；不在场、被押解者、无余力者不算',async t=>{
 // 吴朔力量 10 → 他能背 10+2×10 = 30 公斤，空手 → 余力 30；玩家 30 + 30 = 60 公斤。
 const here=s=>{s.player.companions=[WUSHUO];s.npcs[WUSHUO].location=WEAVING;s.npcs[WUSHUO].inventory={};};
 const joined=await open(t,{fill:here});
 assert.equal((await load(joined)).helperKg,30);
 const seven=await buy(joined,7);assert.ok(seven.ok,seven.error);                  // 35 <= 60
 const twelve=await buy(joined,5);assert.ok(twelve.ok,twelve.error);              // 35+25 = 60 <= 60
 const over=await buy(joined,1);assert.equal(over.ok,false);assert.match(over.error,/共65公斤/);assert.match(over.error,/同行搭手另可分担30公斤/);assert.match(over.error,/还差5公斤/);
 const away=await open(t,{fill:s=>{here(s);s.npcs[WUSHUO].location='bld_hw_qingdeng';}});
 assert.equal((await load(away)).helperKg,0);assert.equal((await buy(away,7)).ok,false);
 const loaded=await open(t,{fill:s=>{here(s);s.npcs[WUSHUO].inventory[CLOTH]=stack(6,{weight:5});}});
 assert.equal((await load(loaded)).helperKg,0);assert.equal((await buy(loaded,7)).ok,false);
 const captive=await open(t,{fill:s=>{here(s);s.records.w8c_wanted={category:'wanted',id:'w8c_wanted',subject:WUSHUO,captive:{by:'player'}};}});
 assert.equal((await load(captive)).helperKg,0);
});

test('当前受雇的帮工在场时分担',async t=>{
 // 一份有效的作坊雇佣（雇主 = 玩家）：吴朔在场、空手 → 余力 30。
 const hired=await open(t,{fill:s=>{s.npcs[WUSHUO].location=WEAVING;s.npcs[WUSHUO].inventory={};
  s.records.w8c_hire={category:'contract',kind:'workshop',id:'w8c_hire',worker:WUSHUO,owner:'player',parties:[WUSHUO,'player'],status:'有效',createdAt:0,deadline:10000000,wage:10};}});
 assert.equal((await load(hired)).helperKg,30);
 const ok=await buy(hired,12);assert.ok(ok.ok,ok.error);                          // 60 = 30 + 30
});

test('临时修正叠加在派生值上，但不越过上限 carryBase + 4 × 力量',async t=>{
 const mod=value=>w=>{w.derived={...w.derived,modifiers:[...(w.derived?.modifiers??[]),{id:'w8c-carry-aid',pack:'market',target:'body:carry',stage:'add',value}]};};
 // 力量 10：派生 30；+5 → 35；上限 carryBase + 4×力量 = 10+4×10 = 50。
 assert.equal((await load(await open(t,{patch:mod(5)}))).safeKg,35);
 // +100：槽自身 x2 钳制是 60，上限 50 更紧，取 50。
 assert.equal((await load(await open(t,{patch:mod(100)}))).safeKg,50);
 const high=await open(t,{patch:mod(100)});
 assert.ok((await buy(high,10)).ok);
 const more=await buy(high,1);assert.equal(more.ok,false);assert.match(more.error,/还差5公斤/);
});

test('骑乘中的坐骑分担：真实 world_pet mount 之后才计入，余量 = 载重 150 − 骑者 60',async()=>{
 // 夹具驮马(pets.test 同款规则)：carryKg 150、riderWeightKg 60 → 坐骑可驮货 90 公斤。
 const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8')),id='monster_fixture_pack';
 const world=withPetRules(await loadWorld());
 world.monsters.push({id,name:'夹具驮马',aliases:[],template:0,levelRange:[1,4],habitatTags:['村旁'],grouping:'独居',diet:'杂食',drops:[],taming:{possible:true,conditions:['持续接触']},intelligence:1,
  tamingRule:{category:'mount',minimumSkill:100,minimumPlayerLevel:1,trustThreshold:20,minutes:60,difficulty:10,food:[{item:'item_ration',hungerRelief:50,trustGain:5}],skills:['跟随训练'],rideable:true,riderWeightKg:60,carryKg:150}});
 const engine=new WorldEngine(world),doc=engine.initialFromLegacy(seed,'w8c-mount');
 doc.state.location='loc_hw';
 doc.state.creatures={[id]:{name:'夹具驮马',location:'loc_hw',hp:30,maxHp:30,level:1,status:'正常',owner:'player',
  care:{version:1,hunger:20,fatigue:0,mood:60,loyalty:50,sickness:false,sickHours:0,neglectHours:0,nextTick:doc.state.minute+60,bond:30,contactDay:-1,feedDay:-1,groomDay:-1,trainDay:-1,skills:{},experience:0}}};
 doc.state.pets[id]={petFormat:1,creature:id,category:'mount',status:'活跃',following:true,acquired:doc.state.minute,source:'isolated-fixture'};
 assert.equal(carryLoad(engine,doc).helperKg,0,'未骑乘：坐骑不分担');
 const out=await engine.reduce(doc,{tool:'world_pet',args:{operation:'mount',target:id},eventId:'w8c-mount'}),mounted=applyPatches(doc,out.patches);
 assert.equal(mounted.state.player.mount,id);
 assert.equal(carryLoad(engine,mounted).helperKg,90,'150 - 60 = 90');
});

test('制作产出与其他直接入囊同样过检：超重整步拒绝，合同托管归还与豁免项不受限',async()=>{
 // 木料每份 2 公斤，上限 30：产出 16 份 = 32 公斤超限(差 2)，15 份 = 30 公斤刚好。
 const f=fixture();f.doc.state.inventory={};
 const d=f.draft();
 assert.throws(()=>produceItems(d,f.e,'item_wood',16,{eventId:'w8c-craft-a',recipe:'x'}),e=>/拿不动/.test(e.message)&&/还差2公斤/.test(e.message));
 assert.equal(f.e.quantity(d,'player','item_wood'),0,'被拒时没有产物进囊');
 produceItems(d,f.e,'item_wood',15,{eventId:'w8c-craft-b',recipe:'x'});
 assert.equal(f.e.quantity(d,'player','item_wood'),15);
 assert.throws(()=>changeItems(d,f.e,'player','item_wood',1,{}),/还差2公斤/,'直接入囊同样过检');
 changeItems(d,f.e,'player','item_wood',1,{carryExempt:true});
 assert.equal(f.e.quantity(d,'player','item_wood'),16,'显式豁免(合同退还类)不被行囊重量卡住');
 changeItems(d,f.e,'npc_hw_chenbai','item_wood',500,{});
 assert.equal(f.e.quantity(d,'npc_hw_chenbai','item_wood'),500,'本卡只约束玩家：NPC 没有载荷概念');
});

test('A3V2-048 前提可由真实行囊满足：原题 setup 无 unmet，剩余负重恰为 3 公斤，阿砚在场',async()=>{
 const {applyIntentSetup}=await import('../tools/a3-score.mjs');
 const rows=JSON.parse(await fs.readFile('tests/fixtures/a3-intents-v2.json','utf8')),row=(rows.items??rows).find(r=>r.id==='A3V2-048');
 const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8')),engine=new WorldEngine(baseWorld),initial=engine.initialFromLegacy(seed,'w8c-048');
 const out=applyIntentSetup(engine,initial,row.setup);
 assert.deepEqual(out.setupUnmet,[]);
 const view=carryLoad(engine,out.document);
 // 力量 10 → 30 公斤；剩余 = 30 - 已背 = 3。
 assert.equal(view.safeKg,30);assert.equal(view.spareKg,3);
});
