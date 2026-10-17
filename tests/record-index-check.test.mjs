// R31: self-check of the advance-pass records index (storage.mjs recordsWhere / recordEntriesWhere /
// recordsMemo). With the check on, every index or memo hit is recomputed from the records and compared,
// so code that edits state.records behind the PatchCursor's back during an advance fails here.
import test from 'node:test';
import assert from 'node:assert/strict';
import {recordsWhere,recordEntriesWhere,recordsMemo,withRecordIndex,recordIndexCheck,setRecordIndexCheck} from '../server-plugin/storage.mjs';
import {setup,wait,growing,source,legacy} from './farm-pests-fixture.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
setRecordIndexCheck(true);

test('自检能发现索引过期：就地改 kind、增删行、memo 依赖字段被改写', () => {
    const records={a:{kind:'x',v:1},b:{kind:'y',v:2},c:{kind:'x',v:3}};
    withRecordIndex(()=>{
        recordsWhere(records,'kind','x');assert.equal(recordsWhere(records,'kind','x').length,2);   // 第二次查询建索引并核对
        records.b.kind='x';
        assert.throws(()=>recordsWhere(records,'kind','x'),/索引过期.*kind=x/);
    });
    const entries={a:{category:'p'},b:{category:'q'}};
    withRecordIndex(()=>{
        recordEntriesWhere(entries,'category','p');recordEntriesWhere(entries,'category','p');
        entries.z={category:'p'};
        assert.throws(()=>recordEntriesWhere(entries,'category','p'),/索引过期.*entries/);
    });
    const memoRecords={a:{n:1}};
    withRecordIndex(()=>{
        const build=()=>new Map(Object.entries(memoRecords).map(([k,r])=>[k,r.n]));
        recordsMemo(memoRecords,'sum',build);recordsMemo(memoRecords,'sum',build);
        memoRecords.a={n:2};
        assert.throws(()=>recordsMemo(memoRecords,'sum',build),/索引过期.*memo/);
    });
    assert.ok(recordIndexCheck.violations.length>=3);
    recordIndexCheck.violations.length=0;
});

test('自检模式下推进一段：害兽夹具（播种、逐日）与野生生态（逐日与周结）索引与全表扫描一致', async () => {
    recordIndexCheck.hits=0;recordIndexCheck.memoHits=0;
    const set=setup('index-check-farm');
    let c=await growing(set);
    for(let i=0;i<10;i++)c=await wait(set.run,c,1440,`farm-day-${i}`);
    c=await wait(set.run,c,7*1440,'farm-week');
    const engine=new WorldEngine(source),run=(doc,minutes,id)=>engine.reduce(doc,{tool:'world_time',args:{minutes},eventId:id});
    let wild=engine.createCharacter(legacy,{},'index-check-wild');
    const {applyPatches}=await import('../server-plugin/storage.mjs');
    for(let i=0;i<8;i++)wild=applyPatches(wild,(await run(wild,1440,`wild-day-${i}`)).patches);
    wild=applyPatches(wild,(await run(wild,7*1440,'wild-week')).patches);
    wild=applyPatches(wild,(await run(wild,30*1440,'wild-month')).patches);
    assert.deepEqual(recordIndexCheck.violations,[]);
    assert.ok(recordIndexCheck.hits>0,'索引命中过');
    assert.ok(recordIndexCheck.memoHits>0,'memo 命中过');
});
