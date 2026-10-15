import test from 'node:test';
import assert from 'node:assert/strict';
import {scaleFixture,measureScale,fixtureDraft,SCALE_BUDGETS} from '../tools/scale-bench.mjs';
import {advanceLayerPlan,remoteScheduleBatch,regionProgressKey} from '../server-plugin/advance-layers.mjs';
import {advanceNpcSchedules,scheduleAt} from '../server-plugin/npc-schedule.mjs';
import {advanceRegistry} from '../server-plugin/advance-registry.mjs';
import {settlementPopulation,settlementPopulationCount} from '../server-plugin/entity-view.mjs';
import {promotionConditions} from '../server-plugin/promotion.mjs';
import {applyPatches,digest} from '../server-plugin/storage.mjs';

const full=process.env.SCALE_FULL==='1',fixture=await scaleFixture({counties:full?Infinity:2});
test('配额全展开；正式时钟、灾害、组织、战争和委托消费者保留',()=>{
    const {document,scale,session}=fixture;
    assert.equal(scale.counties,full?31:2);assert.equal(scale.generatedCounties,full?30:1);
    if(full)assert.equal(scale.provinces,9);
    assert.ok(scale.residents>500&&scale.hazards>32&&scale.factionClocks>=43);
    assert.equal(scale.tribes,session.rules.tribalAwakening.dynamics.length);assert.ok(scale.wars>0);
    for(const [id,p] of Object.entries(document.state.population)){
        assert.equal(p.remaining.population,0,id);assert.equal(p.remaining.households,0,id);
        assert.ok(Object.values(p.remaining.ages).every(n=>n===0),id);
        assert.equal(Object.keys(p.districts).length,Object.keys(p.template.districts).length,id);
        const people=Object.values(document.state.created).filter(p=>p.generated==='population'&&p.settlement===id);
        assert.equal(people.length,p.basis.pendingPopulation,id);assert.equal(new Set(people.map(p=>p.name)).size,people.length,id);
        assert.ok(people.filter(p=>p.age<18).every(p=>p.flags.romanceable===false));
    }
    for(const id of ['hazard_clock','faction_clock','tribal_awakening','military','war_diplomacy','organizations','quest_sources'])assert.ok(advanceRegistry.some(s=>s.id===id));
});
test('按所在地派生层级；统计层接近后无损补算，重启与分段重放相同',()=>{
    const doc=structuredClone(fixture.document),e=fixture.engine.scoped(doc),county=Object.keys(doc.state.remote)[0];
    const distant=e.world.locations.find(l=>l.region&&advanceLayerPlan(e,{...doc.state,location:l.id}).layers.get(county)==='statistics');
    assert.ok(distant,'存在远方地区');doc.state.location=distant.id;
    const d=fixtureDraft(doc),start=doc.state.minute,end=start+3*1440+100;
    const batch=remoteScheduleBatch(e,doc.state,start,end),ids=batch.groups.get(county).people;
    assert.ok(ids.length);assert.equal(batch.groups.get(county).layer,'statistics');
    const old=ids.map(id=>structuredClone(doc.state.npcs[id]));
    advanceNpcSchedules(d,e,start,end);
    assert.deepEqual(ids.map(id=>doc.state.npcs[id]),old);
    doc.state.minute=end;doc.state.location=doc.state.remote[county].skeleton.seat;
    const restored=JSON.parse(JSON.stringify(doc)),r=fixtureDraft(restored);
    advanceNpcSchedules(d,e,end,end,{promote:true});advanceNpcSchedules(r,fixture.engine.scoped(restored),end,end,{promote:true});
    assert.deepEqual(doc,restored);
    assert.equal(doc.state.records[regionProgressKey(county)].scheduleThrough,end);
    for(const id of ids){const slot=scheduleAt(e,id,end,doc.state);assert.equal(doc.state.npcs[id].location,slot.location);assert.equal(doc.state.npcs[id].activity,slot.activity);assert.equal(doc.state.npcs[id].coins,old[ids.indexOf(id)].coins);}
    const eager=structuredClone(fixture.document);eager.state.location=distant.id;
    const ed=fixtureDraft(eager),ee=fixture.engine.scoped(eager);ee.replaying=true;ee.replayResult={};
    for(let at=start;at<end;){const next=Math.min(end,at+120);advanceNpcSchedules(ed,ee,at,next);at=next;}
    assert.deepEqual(ids.map(id=>doc.state.npcs[id]),ids.map(id=>eager.state.npcs[id]));
    const again=digest(doc);advanceNpcSchedules(d,e,end,end,{promote:true});assert.equal(digest(doc),again);
});
test('特殊状态和完整档保留个体结算；旧回执不启用新层级',()=>{
    const doc=structuredClone(fixture.document),e=fixture.engine.scoped(doc),batch=remoteScheduleBatch(e,doc.state,doc.state.minute,doc.state.minute+1);
    const id=[...batch.persons.keys()][0];assert.ok(id);
    doc.state.npcs[id].caring={location:doc.state.npcs[id].location};
    assert.equal(remoteScheduleBatch(e,doc.state,0,1).persons.has(id),false);
    delete doc.state.npcs[id].caring;doc.state.npcs[id].life={kind:'illness'};
    assert.equal(remoteScheduleBatch(e,doc.state,0,1).persons.has(id),false);
    e.replaying=true;e.replayResult={};assert.equal(remoteScheduleBatch(e,doc.state,0,1).persons.size,0);
});
test('补货只读人口数与完整视图一致，零人口和无账本分支不失真；远方升格读取不授予四村任命权',()=>{
    const doc=structuredClone(fixture.document),e=fixture.engine.scoped(doc),sid=doc.state.remote[Object.keys(doc.state.remote)[0]].skeleton.settlements[0].id;
    assert.deepEqual(settlementPopulationCount(e,doc.state,sid),settlementPopulation(e,doc.state,sid).population);
    doc.state.settlements[sid].population=0;
    assert.deepEqual(settlementPopulationCount(e,doc.state,sid),settlementPopulation(e,doc.state,sid).population);
    delete doc.state.settlements[sid];
    assert.deepEqual(settlementPopulationCount(e,doc.state,sid),settlementPopulation(e,doc.state,sid).population);
    assert.doesNotThrow(()=>promotionConditions(e,doc.state,sid));
});
test('真实日/月推进、5000消息提示与存档读写守住大世界预算', {timeout:180000},async()=>{
    const before=digest(fixture.document),report=await measureScale(fixture);
    for(const [key,budget] of Object.entries(SCALE_BUDGETS))assert.ok(report.metrics[key]<=budget,`${key}: ${report.metrics[key]} > ${budget}`);
    assert.ok(report.metrics.advancedSaveBytes<=SCALE_BUDGETS.saveBytes);
    assert.equal(digest(fixture.document),before,'基准不能改写输入存档');
    const out=await fixture.engine.reduce(fixture.document,{tool:'world_time',args:{minutes:1},eventId:'scale-turnMs'});
    assert.equal(digest({patches:out.patches,result:out.result}),report.hashes.turnMs);
    const replay=await fixture.engine.reduce(fixture.document,{tool:'world_time',args:{minutes:1},eventId:'scale-turnMs'},{replay:true,result:out.result});
    assert.deepEqual(applyPatches(fixture.document,replay.patches),applyPatches(fixture.document,out.patches));
});
