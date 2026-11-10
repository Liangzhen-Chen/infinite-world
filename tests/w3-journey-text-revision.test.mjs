import test from 'node:test';
import assert from 'node:assert/strict';
import {differences,buildEntries,guardDifferences,rewrittenRecord,MAX_DIFFERENCES,KINDS} from '../world/design/w3-journey-text-revision.mjs';
import {editJSONText} from '../world/design/p1-revision-approval.mjs';

const world={items:[{id:'i1',description:'旧',inspection:'a',storage:'b'}],recipes:[{id:'r1',process:'旧正文',minutes:30,name:'甲'},{id:'r2',process:'同',minutes:5}]};
const rows=[{kind:'recipes',draft:{id:'r1',process:'新正文'}},{kind:'recipes',draft:{id:'r2',process:'同'}},{kind:'items',draft:{id:'i1',description:'旧',inspection:'a',storage:'b'}}];
const rec=over=>()=>({fingerprint:'fp',attempts:2,...over});

test('只为正文不同的条目生成修订条目', async()=>{
 const diffs=await differences(world,rows,rec({l4Rejection:{}}));
 assert.deepEqual(diffs.map(d=>`${d.id}.${d.field}`),['r1.process']);
 const entries=buildEntries(world,diffs);
 assert.equal(entries.length,1);
 const [e]=entries;
 assert.deepEqual([e.target,e.file,e.path,e.before,e.after],['r1','world/meta/recipes.json',['process'],'旧正文','新正文']);
 assert.ok(e.supersedes.length&&e.basis.length&&e.boundary);
});
test('items 的三个正文字段各自比较', async()=>{
 const diffs=await differences(world,[{kind:'items',draft:{id:'i1',description:'旧',inspection:'改',storage:'改2'}}],rec({attempts:2}));
 assert.deepEqual(diffs.map(d=>d.field),KINDS.items.fields.filter(f=>f!=='description'));
});
test('没有发布后重写痕迹却不同、或差异条数过多：停下并报数量与例子，不生成条目', async()=>{
 const diffs=await differences(world,rows,rec({attempts:1}));
 assert.ok(!rewrittenRecord({attempts:1}));
 assert.throws(()=>buildEntries(world,diffs),/不一致.*1 条差异.*r1\.process/);
 const many=Array.from({length:MAX_DIFFERENCES+1},(_,i)=>({id:`r${i}`,field:'process',evidence:{rewritten:true}}));
 assert.throws(()=>guardDifferences(many),new RegExp(`共 ${MAX_DIFFERENCES+1} 条差异`));
});
test('发布只改指名的 process 字段；before 与现状不符时报错', ()=>{
 const text=JSON.stringify([{id:'r1',process:'旧正文',minutes:30},{id:'r2',process:'同',minutes:5}],null,2)+'\n';
 const edit={target:'r1',path:['process'],before:'旧正文',after:'新正文'};
 const out=editJSONText(text,[edit]);
 assert.deepEqual(JSON.parse(out),[{id:'r1',process:'新正文',minutes:30},{id:'r2',process:'同',minutes:5}]);
 assert.equal(out.replace('新正文','旧正文'),text);
 assert.throws(()=>editJSONText(text,[{...edit,before:'别的'}]),/发布前事实已改变/);
});
