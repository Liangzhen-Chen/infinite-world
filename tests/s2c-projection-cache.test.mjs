import test from 'node:test';
import assert from 'node:assert/strict';
import {PatchCursor,withRecordIndex,recordsMemo} from '../server-plugin/storage.mjs';
test('推进目录与个人账户索引在原位补丁后失效，读者不沿用旧实体或余额',()=>withRecordIndex(()=>{
 const cursor=new PatchCursor({state:{created:{bld_school:{name:'学堂'}}},ledger:{accounts:{'npc_a|coin_river|purse':5}}});
 cursor.apply({op:'set',path:['state','created','bld_school','capacity'],value:12});
 cursor.apply({op:'set',path:['ledger','accounts','npc_a|coin_river|purse'],value:6});
 const created=()=>recordsMemo(cursor.root.state.created,'schools',()=>Object.values(cursor.root.state.created).map(x=>x.capacity));
 const purse=()=>recordsMemo(cursor.root.ledger.accounts,'purse',()=>Object.values(cursor.root.ledger.accounts).reduce((a,b)=>a+b,0));
 assert.deepEqual(created(),[12]);assert.equal(purse(),6);
 cursor.apply({op:'set',path:['state','created','bld_school','capacity'],value:24});
 cursor.apply({op:'set',path:['ledger','accounts','npc_a|coin_river|purse'],value:4});
 assert.deepEqual(created(),[24]);assert.equal(purse(),4);
}));
