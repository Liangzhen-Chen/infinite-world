// 不变量：写债务/记录行之后，立即读派生值（净资产、记录索引、记忆）必须反映新行。
// 覆盖三条写路径：游标写（PatchCursor）、setRecordRow、对 state.records 原地写（夹具/规划快照）；
// 只读作用域（withReadIndex）在推进之外建的索引不得活过作用域，否则原地写之后读到旧值（m27-11 s3-finance #2）。
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,host,worker,DAY} from './helpers/finance.mjs';
import {netAssets} from '../server-plugin/finance-assets.mjs';
import {withReadIndex,recordsWhere,recordsMemo,setRecordRow} from '../server-plugin/storage.mjs';

const debtRow=amount=>({category:'debt',kind:'wage',debtor:host,creditor:worker,amount,paid:0,createdAt:600,deadline:600+90*DAY,status:'待偿还'});
const assets=f=>{const d=f.draft(),v=netAssets(d,f.e,host);d.done();return v;};
// 同一状态的独立深拷贝：records 是新对象，没有任何缓存，作为不经缓存的参照。
const reference=f=>{const real=f.doc;f.doc=structuredClone(real);try{return assets(f);}finally{f.doc=real;}};

test('原地写债务行：先读过净资产再写，再读必须与全新拷贝上的读数一致',()=>{
 const f=fixture(),amount=f.doc.state.npcs[host].coins;
 const before=assets(f);
 f.doc.state.records.wages=debtRow(amount);
 const after=assets(f);
 assert.equal(after,reference(f));
 assert.notEqual(after,before);
});

test('setRecordRow 写债务行：先读过净资产再写，再读必须与全新拷贝上的读数一致',()=>{
 const f=fixture(),amount=f.doc.state.npcs[host].coins;
 const before=assets(f);
 setRecordRow(f.doc.state,'wages',debtRow(amount));
 const after=assets(f);
 assert.equal(after,reference(f));
 assert.notEqual(after,before);
});

test('游标写债务行：同一入口读到的净资产与全新拷贝一致',()=>{
 const f=fixture(),amount=f.doc.state.npcs[host].coins;
 assets(f);
 const d=f.draft();d.set(['state','records','wages'],debtRow(amount));
 const after=netAssets(d,f.e,host);d.done();
 assert.equal(after,reference(f));
});

test('只读作用域的记录索引与记忆不活过作用域：作用域之间原地改写后重进读到新行',()=>{
 const records={'a:1':{category:'debt',n:1},'b:1':{category:'other',n:2}};
 const read=()=>withReadIndex(()=>{
  recordsWhere(records,'category','debt');// 第一次扫描，第二次建桶
  return {rows:recordsWhere(records,'category','debt').map(r=>r.n),memo:recordsMemo(records,'count',()=>Object.keys(records).length)};
 });
 assert.deepEqual(read(),{rows:[1],memo:2});
 records['a:2']={category:'debt',n:3};
 assert.deepEqual(read(),{rows:[1,3],memo:3});
});
