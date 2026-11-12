// EC-1a 真实路径：npc-schedule 推进循环里的 NPC 路费（克隆副本 + 末尾与 original 比较回写）。
// 场景：付款人 A 0 币，同户 B 100 币（B 备足面包，不去买粮），A 的作息在 600 分钟从 X 换到 Y，X-Y 这条路有路费（改世界路线 toll，路费以引擎 route 读出，不写死）。
// 经 world_time 真实推进跨过 600：A 起程付路费，户池（B）全额垫付。
// 期望（手推）：fare = engine.route(X,Y).cost > 0；A 本人钱 0 + 补足 fare − 付出 fare = 0；B = 100 − fare；A、B 的旧字段都与账本钱袋一致；账本无差错。
// 旧缺陷：补足额恰等于路费时，克隆副本等于 original，末尾不写回，草稿字段 = fare 而账本 = 0。
// npc-obligations.simulateNpc 的同类修法目前没有真实路径测试（需要构造带约会的预订并推进，未能在不运行的前提下写稳），只有源码结构检查（ec1a-payment-paths）。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {openLedger,auditLedger} from '../server-plugin/ledger.mjs';
import {purse} from '../server-plugin/money.mjs';

const world=await loadWorld(),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const A='npc_hw_luowei',B='npc_hw_duanyan',C='npc_hw_shendu',D='npc_hw_linsui';

test('schedule travel fare paid wholly by the household pool: payer field equals ledger, housemate pays exactly the fare', async () => {
 const w=structuredClone(world);
 delete w.rules.householdSubsistence;
 const edge=w.routes[0],X=edge.from,Y=edge.to;edge.toll=4;
 const slot=(start,end,location,activity)=>({start,end,location,activity,services:[]});
 w.npcs.find(n=>n.id===A).schedule={default:[slot(0,600,X,'闲居'),slot(600,1440,Y,'闲居')]};
 w.households=[{id:'fare-house',members:[A,B],settlement:'loc_hw',homeLocation:X},{id:'fare-stranger',members:[C],settlement:'loc_hw',homeLocation:X},{id:'fare-payee',members:[D],settlement:'loc_hw',homeLocation:X}];
 const e=new WorldEngine(w),doc=e.createCharacter(legacy,{},'ec1a-fare-real-path');
 doc.state.minute=590;doc.state.location=X;
 const coins={[A]:0,[B]:100,[C]:500,[D]:0};
 doc.state.npcs=Object.fromEntries([A,B,C,D].map(id=>[id,{...doc.state.npcs[id],coins:coins[id],inventory:id===B?{item_bread:{quantity:100}}:{},location:X,status:'正常',activity:'闲居'}]));
 doc.ledger=openLedger(e,doc);
 const fare=e.route(X,Y,'walk',600,doc.randomSeed??'default-campaign').cost;
 assert.ok(fare>0,'前提：X-Y 路线有路费（引擎读出）');
 return e.reduce(doc,{tool:'world_time',args:{minutes:30},eventId:'fare-advance'}).then(out=>{
  const after=applyPatches(doc,out.patches),d=e.primitiveDraft(after),field=id=>d.get('state','npcs',id,'coins'),ledger=id=>d.get('ledger','accounts',purse(e,id))??0;
  assert.ok(d.get('state','npcs',A,'scheduleTravel')||d.get('state','npcs',A,'location')===Y,'前提：A 已按作息起程');
  assert.equal(field(A),0);assert.equal(ledger(A),0,'付款人：草稿字段与账本一致');
  assert.equal(field(B),100-fare);assert.equal(ledger(B),100-fare,'同户成员：字段与账本一致，恰好垫付路费');
  assert.deepEqual(auditLedger(d.get('ledger')),[]);
 });
});
