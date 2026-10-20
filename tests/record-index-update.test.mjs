import test from 'node:test';
import assert from 'node:assert/strict';
import {PatchCursor,recordsWhere,recordEntriesWhere,recordsMemo,withRecordIndex,setRecordIndexCheck} from '../server-plugin/storage.mjs';

test('cursor updates classification buckets without retaining derived memos',()=>{
    setRecordIndexCheck(true);
    try { withRecordIndex(()=>{
        const cursor=new PatchCursor({state:{records:{2:{kind:'x',category:'a',n:1},a:{kind:'y',category:'b',n:2},z:{kind:'x',category:'a',n:3}}}});
        const read=()=>cursor.root.state.records;
        const check=()=>{
            for(const field of ['kind','category'])for(const value of ['x','y','a','b',undefined]){
                assert.deepEqual(recordsWhere(read(),field,value),Object.values(read()).filter(r=>r?.[field]===value));
                assert.deepEqual(recordEntriesWhere(read(),field,value),Object.entries(read()).filter(([,r])=>r?.[field]===value));
            }
        };
        check();check();
        const unaffected=recordsWhere(read(),'kind','y');
        const sum=()=>Object.values(read()).reduce((n,r)=>n+r.n,0);
        assert.equal(recordsMemo(read(),'sum',sum),6);
        cursor.apply({op:'set',path:['state','records','2','n'],value:5});
        assert.equal(recordsWhere(read(),'kind','y'),unaffected);
        assert.equal(recordsMemo(read(),'sum',sum),10);check();
        const snapshot=cursor.expose(read());
        cursor.apply({op:'set',path:['state','records','a','kind'],value:'x'});check();
        assert.equal(snapshot.a.kind,'y');
        cursor.apply({op:'set',path:['state','records','1'],value:{kind:'x',category:'b',n:4}});check();
        cursor.apply({op:'set',path:['state','records','z'],value:{kind:'y',category:'b',n:9}});check();
        cursor.apply({op:'delete',path:['state','records','2']});check();
        cursor.apply({op:'delete',path:['state','records','a','category']});check();
    }); } finally {setRecordIndexCheck(false);}
});

test('continuous writes between advance passes retain valid buckets and discard memos',()=>{
    const cursor=new PatchCursor({state:{records:{a:{kind:'x',n:1},b:{kind:'y',n:2}}}});
    let bucket;
    withRecordIndex(()=>{
        recordsWhere(cursor.root.state.records,'kind','y');
        bucket=recordsWhere(cursor.root.state.records,'kind','y');
        recordsMemo(cursor.root.state.records,'sum',()=>3);
    });
    cursor.apply({op:'set',path:['state','records','a','n'],value:7});
    withRecordIndex(()=>{
        assert.equal(recordsWhere(cursor.root.state.records,'kind','y'),bucket);
        assert.equal(recordsMemo(cursor.root.state.records,'sum',()=>9),9);
    });
});

test('category-specific memos survive continuous rows but invalidate on reclassification',()=>{
    const cursor=new PatchCursor({state:{records:{a:{category:'physical_feature',n:1},b:{category:'contract',n:2}}}});
    const build=()=>Object.entries(cursor.root.state.records).filter(([,r])=>r.category!=='physical_feature');
    let memo;
    withRecordIndex(()=>{memo=recordsMemo(cursor.root.state.records,'contracts',build,['physical_feature']);});
    cursor.apply({op:'set',path:['state','records','a','n'],value:3});
    withRecordIndex(()=>assert.equal(recordsMemo(cursor.root.state.records,'contracts',build,['physical_feature']),memo));
    cursor.apply({op:'set',path:['state','records','a','category'],value:'contract'});
    withRecordIndex(()=>{
        const changed=recordsMemo(cursor.root.state.records,'contracts',build,['physical_feature']);
        assert.notEqual(changed,memo);assert.equal(changed.length,2);
    });
});
