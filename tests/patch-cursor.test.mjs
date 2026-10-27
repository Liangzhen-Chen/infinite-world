import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {PatchCursor,applyPatches} from '../server-plugin/storage.mjs';

// P2 snapshot isolation / I31: reducing copy work must preserve every prior read.
test('cursor keeps every exposed ancestor and child immutable across interleaved writes',()=>{
    fc.assert(fc.property(fc.array(fc.record({
        row:fc.constantFrom('a','b','c'),field:fc.constantFrom('x','y'),
        value:fc.integer(),remove:fc.boolean(),read:fc.integer({min:0,max:4}),
    }),{minLength:10,maxLength:80}),steps=>{
        const initial={state:{records:{a:{x:1},b:{y:2}}}},cursor=new PatchCursor(initial),snapshots=[];
        let expected=initial;
        for(const step of steps){
            const paths=[[],['state'],['state','records'],['state','records',step.row],['state','records',step.row,step.field]];
            const value=paths[step.read].reduce((v,k)=>v?.[k],cursor.root);
            snapshots.push([cursor.expose(value),structuredClone(value)]);
            const patch={op:step.remove?'delete':'set',path:['state','records',step.row,step.field],value:step.value};
            cursor.apply(patch);expected=applyPatches(expected,[patch]);
            assert.deepEqual(cursor.root,expected);
            for(const [snapshot,saved] of snapshots)assert.deepEqual(snapshot,saved);
        }
        assert.deepEqual(initial,{state:{records:{a:{x:1},b:{y:2}}}});
    }),{numRuns:50,seed:20261026});
});

// The same snapshot guarantee also applies to arrays and rejected patch paths.
test('cursor isolates array children, rejected writes, replacement and reset',()=>{
    const cursor=new PatchCursor({state:{rows:[{n:1},{n:2}]}});
    const write=(path,value)=>cursor.apply({op:'set',path,value});
    write(['state','rows','0','n'],3);
    const first=cursor.expose(cursor.root);
    write(['state','rows','1','n'],4);
    write(['state','rows','0','n'],5);
    assert.deepEqual(first,{state:{rows:[{n:3},{n:2}]}});
    const second=cursor.expose(cursor.root.state.rows);
    assert.throws(()=>write(['state','rows','0','n','bad'],9));
    write(['state','rows'],[{n:6}]);
    assert.deepEqual(second,[{n:5},{n:4}]);
    cursor.reset(first);write(['state','rows','0','n'],7);
    assert.deepEqual(first,{state:{rows:[{n:3},{n:2}]}});
});
