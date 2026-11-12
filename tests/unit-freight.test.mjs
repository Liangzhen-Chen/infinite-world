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
// 前置：库存货品（粮木石铁，rules.economy.shops.stockItems）有聚落日产量，供给源不止产地（取可达源最小值）；本文件的手推只覆盖"唯一供给源 = 目录产地"的货。
const stockGoods=new Set(Object.values(engine.rules.economy.shops.stockItems));
const pick=engine.world.items.find(i=>!stockGoods.has(i.id)&&i.weight>=0&&originOf(i.id)&&settlements.some(s=>s!==originOf(i.id)&&reach(originOf(i.id),s)));
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
 const others=engine.world.items.filter(i=>!stockGoods.has(i.id)&&i.weight>=0&&originOf(i.id)&&originOf(i.id)!==far&&reach(originOf(i.id),far));
 assert.ok(others.length>=2);
 for(const i of others)assert.ok(unitFreight(read,engine,{item:i.id,to:far})>0,i.id);
 assert.equal(engine.rules.settlementTrade.distanceFactorPerKm,undefined);
});

test('供给源 = 产地 + 能自产的聚落：目的聚落自产为 0；没有任何可达供给源返回 null（不报错、不夹取）',()=>{
 // 夹具：一个没有路的孤立聚落（路网里没有它的路线），状态里给它一份聚落账；日产量为 0 时它不自产任何库存货。
 const w=structuredClone(world);w.locations.push({id:'loc_iso_test',name:'孤村',parent:null,coordinates:[0,10],terrain:'平地'});
 const e=new WorldEngine(w),iso=e.createCharacter(legacy,{},'unit-freight-iso'),r=documentReader(iso);
 iso.state.settlements.loc_iso_test={name:'孤村',population:10,food:0,foodPerDay:0,wood:0,woodPerDay:0,stone:0,iron:0,treasury:0};
 assert.ok(!e.world.routes.some(x=>x.from==='loc_iso_test'||x.to==='loc_iso_test'),'前置：孤村没有路线');
 const originIn=id=>{const o=e.byId.get(id).origin;return o?placeSettlement(e,iso.state,o).value:null;};
 const stocks=Object.entries(e.rules.economy.shops.stockItems).filter(([,id])=>e.byId.get(id).weight>=0&&originIn(id)&&originIn(id)!=='loc_iso_test');
 assert.ok(stocks.length>0,'前置：存在有产地的库存货');
 const [stock,id]=stocks.find(([name])=>name!=='food')??stocks[0];
 assert.equal(unitFreight(r,e,{item:id,to:'loc_iso_test'}),null,'孤村不自产、产地到不了：不能经陆路运入');
 assert.equal(unitFreight(r,e,{item:pick.id,to:'loc_iso_test'}),null);
 iso.state.settlements.loc_iso_test[`${stock}PerDay`]=5;
 assert.equal(unitFreight(documentReader(iso),e,{item:id,to:'loc_iso_test'}),0,'孤村有该库存货的日产量：自产，运费 0');
});

test('封路季与通路季的运输因子相同：封路只影响货能不能到（供给），不进运费',()=>{
 // 推导：把该条路线上所有路段在季节 0 封闭（closedSeasons=[0]），另一世界不封。运费取一年里各月走得通的最便宜路线，
 // 封路世界在季节 0 的值 = 通路世界在季节 2 的值（季节 0 之外各月路线相同，最便宜者不变）。默认历法一季 3 个月、每月 30 天。
 const from=originOf(pick.id),open=reach(from,far),ids=new Set(open.edges);
 const w=structuredClone(world);for(const r of w.routes??[])if(ids.has(r.id))r.closedSeasons=[0];
 const closedEngine=new WorldEngine(w),closedDoc=closedEngine.createCharacter(legacy,{},'unit-freight-closed');
 closedDoc.state.minute=5*1440;
 const openDoc=engine.createCharacter(legacy,{},'unit-freight-open');openDoc.state.minute=6*30*1440+5*1440;
 const a=unitFreight(documentReader(closedDoc),closedEngine,{item:pick.id,to:far,minute:closedDoc.state.minute});
 const b=unitFreight(documentReader(openDoc),engine,{item:pick.id,to:far,minute:openDoc.state.minute});
 assert.ok(a>0);assert.ok(Math.abs(a-b)<=1e-9*b);
});
