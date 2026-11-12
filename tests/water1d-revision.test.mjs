// WATER-1D：修订批的通用“删除键”支持（REMOVE 标记）与批次预算上限由各批自定。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {makeTempDir} from '../tools/tmp-root.mjs';
import path from 'node:path';
import {REMOVE,isRemove,sameValue,getPath,setPath,editJSONText,isPublished,runRevision} from '../world/design/p1-revision-approval.mjs';
import {parsePublication,revertSuperseded,applySupersedes,classifySupersedes} from '../tools/approved-revisions.mjs';
import {loadWorld} from '../tools/load-world.mjs';
import * as water1d from '../world/design/water1d-approval.mjs';

const del=(target,parts,before)=>({target,path:parts,before,after:REMOVE});

test('删除标记：只认单键 {$remove:true}；setPath 删键且不改其余键；sameValue 对 REMOVE 要求键不存在',()=>{
  assert.ok(isRemove(REMOVE));assert.ok(!isRemove({$remove:true,x:1}));assert.ok(!isRemove(null));assert.ok(!isRemove([]));assert.ok(!isRemove({$remove:false}));
  const row={id:'a',n:{h:25},k:1};setPath(row,['n'],REMOVE);
  assert.deepEqual(row,{id:'a',k:1});assert.ok(!Object.hasOwn(row,'n'));
  assert.ok(sameValue(undefined,REMOVE));assert.ok(!sameValue(null,REMOVE));assert.ok(!sameValue({h:25},REMOVE));
  assert.ok(sameValue({h:25},{h:25}));assert.ok(!sameValue({h:25},{h:26}));assert.ok(sameValue(undefined,null));
});

test('文本删除：中间键、末尾键、唯一键，紧凑与缩进两种排版都只动被删键值对的字节，其余逐字不变',()=>{
  const rows=[{id:'a',x:1,n:{h:25},y:'z'},{id:'b',x:2,n:{h:3}},{id:'c',n:{h:7}}];
  for(const text of [JSON.stringify(rows),JSON.stringify(rows,null,2)+'\n']){
    const out=editJSONText(text,[del('a',['n'],{h:25}),del('b',['n'],{h:3}),del('c',['n'],{h:7})]);
    assert.deepEqual(JSON.parse(out),[{id:'a',x:1,y:'z'},{id:'b',x:2},{id:'c'}]);
    // 未被删的键值对在原文里的字节原样保留。
    for(const kept of text.includes('\n')?['  "x": 1,','  "y": "z"']:['"x":1,','"y":"z"'])assert.ok(out.includes(kept),kept);
  }
  // 嵌套路径：删数组内带 id 的元素的键。
  const nested=JSON.stringify([{id:'s',site:{resources:[{id:'r1',item:'i',q:3},{id:'r2',item:'j'}]}}]);
  const out=editJSONText(nested,[{target:'s',path:['site','resources',{id:'r1'},'q'],before:3,after:REMOVE}]);
  assert.deepEqual(JSON.parse(out),[{id:'s',site:{resources:[{id:'r1',item:'i'},{id:'r2',item:'j'}]}}]);
});

test('文本删除：发布前现值与 before 不符即拒绝；删除数组元素不被支持',()=>{
  const text=JSON.stringify([{id:'a',n:{h:25}}]);
  assert.throws(()=>editJSONText(text,[del('a',['n'],{h:26})]),/发布前事实已改变/);
  assert.throws(()=>editJSONText(text,[del('zz',['n'],{h:25})]),/缺少 zz/);
  assert.throws(()=>editJSONText(JSON.stringify([{id:'a',l:[{id:'e',v:1}]}]),[{target:'a',path:['l',{id:'e'}],before:{id:'e',v:1},after:REMOVE}]));
});

test('回执：after 为 REMOVE 可通过 parsePublication；键不存在时回退到 before，键存在或被另改则保持原样；取代声明按 REMOVE 应用',()=>{
  const sups=parsePublication({revision:'w',receipt:'dir/r',entries:[{id:'m-n',target:'m',file:'world/meta/items.json',field:'nutrition',before:{hydration:25},after:REMOVE,
    supersedes:[{receipt:'world/drafts/x/m.json#m',field:'nutrition'}]}]});
  assert.equal(sups.length,1);
  const rows=[{id:'m',use:'u'},{id:'o',use:'u'}];
  assert.deepEqual(revertSuperseded(rows,'world/meta/items.json',sups),[{id:'m',use:'u',nutrition:{hydration:25}},{id:'o',use:'u'}]);
  assert.deepEqual(rows,[{id:'m',use:'u'},{id:'o',use:'u'}]);
  assert.deepEqual(revertSuperseded([{id:'m',nutrition:{hydration:30}}],'world/meta/items.json',sups),[{id:'m',nutrition:{hydration:30}}]);
  const design=[{id:'m',nutrition:{hydration:25}}];
  assert.equal(applySupersedes(design,'world/drafts/x/m.json',sups).length,1);assert.ok(!Object.hasOwn(design[0],'nutrition'));
  assert.equal(applySupersedes(design,'world/drafts/x/m.json',sups).length,0); // 已是 after：保持
  assert.throws(()=>applySupersedes([{id:'m',nutrition:{hydration:99}}],'world/drafts/x/m.json',sups),/设计源值与修订回执不符/);
});

test('isPublished 与 getPath：REMOVE 条目在键已不存在时算已发布',()=>{
  const e={file:'world/meta/items.json',target:'m',path:['nutrition'],before:{hydration:25},after:REMOVE};
  assert.ok(isPublished({items:[{id:'m'}]},[e]));assert.ok(!isPublished({items:[{id:'m',nutrition:{hydration:25}}]},[e]));
  assert.equal(getPath({id:'m'},['nutrition']),undefined);
});

test('批次预算上限由各批自定：本批 0.5 元/60 次；不给 maxRequests 的批次沿用条目数；已有批次（P1、级联）保持 0.02 元、条目数',async()=>{
  assert.equal(water1d.LIMIT_YUAN,0.5);assert.equal(water1d.MAX_REQUESTS,60);
  const world=await loadWorld(),item=world.items[0];
  const mk=async(extra)=>{
    const dir=makeTempDir('rev-budget-');
    // 无改动条目（after 等于现值）：只验证 --prepare 写出的预算账，不改任何正式文件，不调模型。
    const entry={id:`${item.id}-basePrice`,target:item.id,file:'world/meta/items.json',path:['basePrice'],field:'basePrice',before:item.basePrice,after:item.basePrice,basis:['t'],facts:{},supersedes:[{receipt:`x.json#${item.id}`,field:'basePrice'}],boundary:'b'};
    const cfg={revision:'t-1',root:dir,CARD:'T',limitYuan:0.02,buildEntries:()=>[entry],draftFor:e=>({id:e.id,target:e.target,field:e.field,value:e.after}),contextFor:e=>({sourceFacts:e.basis,referencedFacts:e.facts,supersedes:e.supersedes}),
      validateDraft:()=>[],applyCandidate:w=>w,isPublished:()=>false,note:'t',...extra};
    const log=console.log;console.log=()=>{};try{await runRevision(cfg,['--prepare']);}finally{console.log=log;}
    return JSON.parse(await fs.readFile(path.join(dir,'budget.json'),'utf8'));
  };
  const plain=await mk({}),card=plain.cards.T;
  assert.equal(card.limitYuan,0.02);assert.equal(card.maxRequests,1);
  const own=await mk({limitYuan:water1d.LIMIT_YUAN,maxRequests:water1d.MAX_REQUESTS}).then(b=>b.cards.T);
  assert.equal(own.limitYuan,0.5);assert.equal(own.maxRequests,60);
  // 已有批次的 run() 不传 maxRequests、限额仍是各自的 0.02（读源码里的批次配置）。
  for(const f of ['world/design/p1-revision-approval.mjs','world/design/p1-cascade-approval.mjs']){
    const run=(await fs.readFile(new URL(`../${f}`,import.meta.url),'utf8')).split('\n').filter(l=>l.includes('runRevision({')).join('\n');
    assert.match(run,/limitYuan:0\.02\b/,f);assert.doesNotMatch(run,/maxRequests/,f);
  }
});

// ---- 取代声明按 after 分类：删除型减行数，修改型不减（对任何修订批同一规律）
const own = /^dir\/([^/]+)\.json$/;
const fixture = after => parsePublication({revision: 'f', receipt: 'dir/r', entries: [
  {id: 'x-n', target: 'x', file: 'f.json', field: 'n', before: 1, after, supersedes: [{receipt: 'dir/row_x.json#x', field: 'n'}]},
  // 指向别的回执目录的取代声明不属于本批。
  {id: 'y-n', target: 'y', file: 'f.json', field: 'n', before: 1, after: 2, supersedes: [{receipt: 'other/row_y.json#y', field: 'n'}]},
]});
test('分类：修改型取代（after 为新值）该行仍是现存条目，现存行数不变', () => {
  // 手推：本批 3 行（row_x、row_a、row_b）；x 的字段 1→5 只是改值，3 − 0 = 3 行。
  const {removed, changed} = classifySupersedes(fixture(5), own);
  assert.deepEqual(removed, []);
  assert.deepEqual(changed.map(c => c.id), ['row_x']);
  assert.equal(3 - new Set(removed.map(c => c.id)).size, 3);
});
test('分类：删除型取代（after 为 REMOVE）该行已移除，现存行数减一', () => {
  // 手推：本批 3 行；x 的字段被删，3 − 1 = 2 行。
  const {removed, changed} = classifySupersedes(fixture(REMOVE), own);
  assert.deepEqual(removed.map(c => c.id), ['row_x']);
  assert.deepEqual(changed, []);
  assert.equal(3 - new Set(removed.map(c => c.id)).size, 2);
});
