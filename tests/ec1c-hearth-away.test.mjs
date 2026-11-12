// EC-1 灶边判定（entity-view hearthPlace）：一户两人，一人在别的聚落过夜。开饭、白天预算、钱袋入户池共用同一判定。
// 期望全按规则手推：身体每人每天需 60 饱腹（夹具把饱腹代谢定为 2.5/小时，其余为 0），面包整个吃，一人一天要 ceil(60 ÷ 面包饱腹) 个。
//  · 外出者自成一桌（key = 户编号@所在聚落），吃自己背包里的粮；没有粮就缺口 60，不吃留守者的粮；
//  · 留守桌只喂在灶边的人，不替外出者做饭，也不吃他的粮；
//  · 外出者的钱不进留守者的户池，留守者的钱也不进外出者的（户池补足不隔着聚落）。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld,loadRuntimeWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {openLedger,auditLedger} from '../server-plugin/ledger.mjs';
import {advanceHouseholdMeals} from '../server-plugin/npc-life.mjs';
import {householdCash,householdPoolTopUp} from '../server-plugin/household-budget.mjs';

const world=await loadWorld(),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const A='npc_hw_luowei',B='npc_hw_duanyan',item='item_bread',home='bld_hw_qingdeng',away='bld_bs_watch',DAY=1440;
const SAT=(await loadRuntimeWorld()).items.find(i=>i.id===item).nutrition.satiety,breadsFor=satiety=>Math.ceil(satiety/SAT);
// 一户两人（A 留守在河湾，B 在 loc_bs 过夜或也在河湾），无公粮、无取水规则：只检验各人背包的吃法。
function fixture({bBread=0,aBread=0,bAway=true,richB=false}={}){
 const w=structuredClone(world);
 delete w.rules.householdSubsistence;
 for(const n of w.npcs){delete n.tier;delete n.schedule;}
 w.households=[{id:'meal-house-0',members:[A,B],settlement:'loc_hw',homeLocation:home}];
 for(const r of w.primitiveTables.body.rows)if(r.selector==='person')r.drainPerHour.light=r.need==='satiety'?2.5:0;
 const e=new WorldEngine(w),doc=e.createCharacter(legacy,{},'ec1c-hearth');
 doc.state.minute=0;doc.state.location=home;delete doc.state.records['agriculture:loc_hw'];
 doc.state.npcs=Object.fromEntries([A,B].map(id=>[id,{...doc.state.npcs[id],coins:(id===A)!==richB?10000:0,inventory:{},location:home,status:'正常',activity:'休息'}]));
 doc.state.npcs[A].inventory={[item]:aBread};doc.state.npcs[B].inventory={[item]:bBread};
 if(bAway)doc.state.npcs[B].location=away;
 doc.state.settlements={loc_hw:{...doc.state.settlements.loc_hw,population:2,granary:false,food:0,foodPerDay:0,woodPerDay:0}};
 doc.ledger=openLedger(e,doc);
 return {e,doc,d:e.primitiveDraft(doc)};
}
const byKey=(d,suffix)=>Object.entries(d.get('state','family','meals')??{}).find(([key])=>suffix?key.endsWith(suffix):!key.includes('@'))?.[1];

test('外出者带粮：在所在之处吃自己的粮，留守者只吃自己的',()=>{
 const one=breadsFor(60),f=fixture({aBread:one,bBread:one});
 advanceHouseholdMeals(f.d,f.e,1);
 assert.equal(f.e.quantity(f.d,A,item),0);assert.equal(f.e.quantity(f.d,B,item),0);
 const stay=byKey(f.d,null),out=byKey(f.d,'@loc_bs');
 assert.deepEqual(stay.members,[A]);assert.deepEqual(out.members,[B]);
 assert.equal(Number(out.shortfall.satiety),0);assert.equal(Number(stay.shortfall.satiety),0);
 assert.equal(out.settlement,'loc_bs');assert.deepEqual(auditLedger(f.d.get('ledger')),[]);
});

test('外出者没带粮：缺口 60 记在他的桌上，留守者的粮不替他吃',()=>{
 const one=breadsFor(60),f=fixture({aBread:2*one,bBread:0});
 advanceHouseholdMeals(f.d,f.e,1);
 // 留守桌只有 A 一张嘴：吃 ceil(60/SAT) 个，剩下的原样留着（有粮的同户成员不替外出者吃）。
 assert.equal(f.e.quantity(f.d,A,item),2*one-one);
 const stay=byKey(f.d,null),out=byKey(f.d,'@loc_bs');
 assert.deepEqual(stay.members,[A]);assert.deepEqual(out.members,[B]);
 assert.equal(Number(out.shortfall.satiety),60);assert.equal(Number(stay.shortfall.satiety),0);
});

test('对照：两人都在灶边时同一份粮喂两个人（共灶口粮池，EC-1a 不变）',()=>{
 const one=breadsFor(60),f=fixture({aBread:breadsFor(120),bBread:0,bAway:false});
 advanceHouseholdMeals(f.d,f.e,1);
 assert.equal(f.e.quantity(f.d,A,item),0);
 const [record]=Object.values(f.d.get('state','family','meals'));
 assert.deepEqual([...record.members].sort(),[A,B].sort());assert.equal(Number(record.shortfall.satiety),0);
 assert.ok(one>0);
});

test('钱袋：外出者的钱不进留守者的户池，反之亦然；在灶边时仍共用（EC-1a 不变）',()=>{
 const out=fixture({bAway:true}),at=fixture({bAway:false});
 // A 有 10000、B 有 0。外出：B 的可动用现金只有自己的 0；A 的户池里没有 B 的钱（本来 B 也是 0，另验 A 付款不向外出的 B 要钱）。
 assert.equal(householdCash(out.d,out.e,B),0);assert.equal(householdCash(at.d,at.e,B),10000);
 assert.equal(householdPoolTopUp(out.d,out.e,B,5,'away-pay'),0);
 assert.equal(householdPoolTopUp(at.d,at.e,B,5,'home-pay'),5);
 // 反向：B 有钱、A 没有。外出的 B 的钱不补给留守的 A。
 const rich=fixture({bAway:true,richB:true});
 assert.equal(householdCash(rich.d,rich.e,A),0);assert.equal(householdPoolTopUp(rich.d,rich.e,A,5,'stay-pay'),0);
});
