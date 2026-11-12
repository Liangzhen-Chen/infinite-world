// MKTW R5③：运输因子按物品目录的 origin 整类推导（不再只对燕麦、不再有 distanceFactorPerKm）。期望按挑夫运价手推。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {documentReader} from '../server-plugin/read-scope.mjs';
import {placeSettlement} from '../server-plugin/entity-view.mjs';
import {unitFreight} from '../server-plugin/transport.mjs';
import transportBalance from '../world/rules/tables/balance/transport.json' with {type:'json'};

const world=await loadWorld(),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const engine=new WorldEngine(structuredClone(world)),doc=engine.createCharacter(legacy,{},'unit-freight'),read=documentReader(doc);
const rate=transportBalance.rows.find(r=>r.key==='carrier:pack').rate;
const originOf=item=>{const o=engine.byId.get(item).origin;return o?placeSettlement(engine,doc.state,o).value:null;};
const settlements=[...new Set(engine.world.items.map(i=>originOf(i.id)).filter(Boolean))];
const minute=doc.state.minute;
// 取一件非燕麦、有产地聚落、有重量的货，和一个与产地不同、本季走得通的聚落。
const reach=(from,to)=>{try{return engine.route(from,to,'walk',minute,read.get('randomSeed'));}catch(error){if(error.message.startsWith('没有当前季节'))return null;throw error;}};
const pick=engine.world.items.find(i=>i.id!=='item_oats'&&i.weight>=0&&originOf(i.id)&&settlements.some(s=>s!==originOf(i.id)&&reach(originOf(i.id),s)));
const far=settlements.find(s=>s!==originOf(pick.id)&&reach(originOf(pick.id),s));

test('产地聚落本地运费为 0；无 origin 的货运费为 0',()=>{
 // 推导：货从产地运到产地所在聚落，路程 0，没有运费。
 assert.equal(unitFreight(read,engine,{item:pick.id,to:originOf(pick.id)}),0);
 const none=engine.world.items.find(i=>!i.origin);
 if(none)assert.equal(unitFreight(read,engine,{item:none.id,to:far}),0);
});

test('远方聚落单位运费 = Σ(路段公里 × 计费重量 × 挑夫费率) + 路线通行费，不含关税',()=>{
 // 推导：计费重量 = max(单件重量, 体积×250, 1)，体积缺省 = 重量÷250；费率取 carrier:pack.rate；路线与通行费取引擎同一条 walk 路线。
 const route=reach(originOf(pick.id),far),kg=Math.max(pick.weight,(pick.volumeM3??pick.weight/250)*250,1);
 const km=route.edges.reduce((n,id)=>n+engine.world.routes.find(r=>r.id===id).lengthKm,0);
 const expected=km*kg*rate+(route.cost??0);
 assert.ok(expected>0);
 assert.ok(Math.abs(unitFreight(read,engine,{item:pick.id,to:far})-expected)<=1e-9*expected);
});

test('整类适用：不止燕麦，任一有产地的货对远方聚落都有运费，且规则里不再有 distanceFactorPerKm',()=>{
 const others=engine.world.items.filter(i=>i.id!=='item_oats'&&i.weight>=0&&originOf(i.id)&&originOf(i.id)!==far&&reach(originOf(i.id),far));
 assert.ok(others.length>=2);
 for(const i of others)assert.ok(unitFreight(read,engine,{item:i.id,to:far})>0,i.id);
 assert.equal(engine.rules.settlementTrade.distanceFactorPerKm,undefined);
});
