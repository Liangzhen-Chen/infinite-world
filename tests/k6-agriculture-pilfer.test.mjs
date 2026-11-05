// K6: reaping the village's ripe common field for oneself happens - the grain
// goes from the field's crop account into one's own bag - and is committed as
// illegal harvest from the village. Unripe crop is still refused physically.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {withAgricultureRules} from '../world/design/agriculture-foundation.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {openLedger,auditLedger} from '../server-plugin/ledger.mjs';

const legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const source=withAgricultureRules(await loadWorld());
const record=c=>c.state.records['agriculture:loc_hw'];
const qty=(c,item)=>{const v=c.state.inventory[item];return typeof v==='number'?v:v?.quantity??0;};

function ripeField(){
 const engine=new WorldEngine(structuredClone(source)),c=engine.createCharacter(legacy,{},'k6-pilfer');
 const p=engine.rules.agriculture.settlements.find(s=>s.settlement==='loc_hw');
 // Isolated mature-crop fixture (the same one agriculture.test uses for harvest boundaries).
 record(c).field.cohorts=[{id:'mature-fixture',sownDay:0,areaUnits:100,grownDays:180,qualitySum:180,qualityDays:180,ready:true,readyDay:0,expiresDay:180,grownFood:1700,harvestedUnits:0,harvestedFood:0}];
 c.ledger=openLedger(engine,c);c.state.location=p.fieldLocation;
 return {engine,c,p};
}
const reap=(engine,c,eventId)=>engine.reduce(c,{tool:'world_act',args:{action:'core:farm.private_harvest',slots:{}},eventId});

test('私收村里公田：成熟的谷物确实割进自己的行囊，公田批次减少，账本守恒，命中盗采，失主是村子',async()=>{
 const {engine,c,p}=ripeField(),item=engine.rules.agriculture.grainItem,food=c.state.settlements.loc_hw.food;
 let out,id;for(let i=0;i<10;i++){id=`k6-reap-${i}`;out=await reap(engine,c,id);if(out.result.success)break;}
 assert.equal(out.result.success,true,JSON.stringify(out.result.receipt?.reason??out.result.note));
 const after=applyPatches(c,out.patches),got=qty(after,item)-qty(c,item);
 assert.ok(got>0);assert.deepEqual(out.result.obtained,[{item,quantity:got}]);
 assert.equal(record(after).field.cohorts[0]?.harvestedFood??1700,got);
 assert.equal(after.state.settlements.loc_hw.food,food,'粮仓不变：谷物没有进公仓');
 assert.deepEqual(auditLedger(after.ledger),[]);
 const offense=[...out.result.offenses??[],...(out.result.receipt?.consequences??[]).filter(x=>x.type==='offense')].find(o=>o.offense==='illegal_harvest');
 assert.ok(offense);assert.equal(offense.victim,p.settlement);assert.equal(after.state.records[offense.record].sourceEvent,id);
 assert.deepEqual(after.state.records[offense.record].stolen,{item,quantity:got});
});

test('公田作物未成熟时仍以物理理由拒绝',async()=>{
 const {engine,c}=ripeField();record(c).field.cohorts[0].ready=false;
 const out=await reap(engine,c,'k6-reap-green');
 assert.notEqual(out.result.success,true);assert.match(String(out.result.receipt?.reason??''),/尚未成熟/);
});
