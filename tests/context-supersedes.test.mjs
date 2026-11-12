// 回执的上下文一侧（scope:'context'）与删除键还原的键位：规则层通用，不点名任何字段。
import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePublication,applySupersedes,revertSuperseded,revertReceiptRow,revertReceiptContext,classifySupersedes,restoreValue,alignKeyOrder} from '../tools/approved-revisions.mjs';
import {REMOVE} from '../world/design/p1-revision-approval.mjs';
import {hashContent} from '../tools/content-pipeline.mjs';

const pub=(extra={})=>parsePublication({revision:'r',receipt:'dir/r',entries:[{id:'e1',target:'t1',file:'world/geo/x.json',field:'details.a.k',before:5,after:REMOVE,
  supersedes:[{receipt:'dir/rec/t1.json#t1',field:'a.k'},{receipt:'dir/rec/t1.json#t1',field:'cfg.a.k',scope:'context',followedBy:'next'}],...extra}]});

test('context 声明：解析带 scope 与 followedBy；条目行一侧的读者全部忽略它', () => {
  const sups=pub(),ctx=sups.filter(s=>s.scope==='context');
  assert.equal(ctx.length,1);assert.equal(ctx[0].followedBy,'next');assert.deepEqual(ctx[0].parts,['cfg','a','k']);
  assert.equal(sups.filter(s=>s.scope!=='context').length,1);
  // 条目行：applySupersedes / revertSuperseded / revertReceiptRow / classifySupersedes 不被 context 声明影响
  const row={id:'t1',a:{}};
  assert.deepEqual(applySupersedes([structuredClone(row)],'dir/rec/t1.json',sups),[]);
  assert.deepEqual(revertReceiptRow(row,'dir/rec/t1.json',sups),{id:'t1',a:{k:5}});
  assert.equal(classifySupersedes(sups,/^dir\/rec\/([^/]+)\.json$/).removed.length,1);
  assert.throws(()=>pub({supersedes:[{receipt:'dir/rec/t1.json#t1',field:'a.k',scope:'other'}]}),/scope/);
});

test('revertReceiptContext：只还原现值等于 after 的上下文字段，键回到 followedBy 之前；已被另改的保持原样', () => {
  const sups=pub().filter(s=>s.scope==='context');
  const ctx={cfg:{a:{x:1,next:2,y:3}}};
  const out=revertReceiptContext(ctx,'dir/rec/t1.json','t1',sups);
  assert.deepEqual(Object.keys(out.cfg.a),['x','k','next','y']);assert.equal(out.cfg.a.k,5);
  assert.deepEqual(Object.keys(ctx.cfg.a),['x','next','y']);
  assert.deepEqual(revertReceiptContext({cfg:{a:{k:9,next:2}}},'dir/rec/t1.json','t1',sups),{cfg:{a:{k:9,next:2}}});
  assert.deepEqual(revertReceiptContext(ctx,'dir/rec/other.json','t1',sups),ctx);
});

test('restoreValue：followedBy 为键名则插在其前，null 则放最后，未给则追加；还原后指纹等于原对象', () => {
  const orig={a:1,k:5,b:2},cut={a:1,b:2};
  for(const [fb,keys] of [['b',['a','k','b']],[null,['a','b','k']],[undefined,['a','b','k']]]){const o=structuredClone(cut);restoreValue({r:o},['r','k'],5,fb);assert.deepEqual(Object.keys(o),keys);}
  const o=structuredClone(cut);restoreValue({r:o},['r','k'],5,'b');assert.equal(hashContent(o),hashContent(orig));
  const rows=revertSuperseded([{id:'t1',details:{a:{...cut}}}],'world/geo/x.json',parsePublication({revision:'r',receipt:'d',entries:[{id:'e',target:'t1',file:'world/geo/x.json',field:'details.a.k',before:5,after:REMOVE,followedBy:'b',supersedes:[{receipt:'d/t1.json#t1',field:'a.k'}]}]}));
  assert.deepEqual(Object.keys(rows[0].details.a),['a','k','b']);
});

test('alignKeyOrder：只调键序，不增减键、不改值', () => {
  const out=alignKeyOrder({c:3,a:1,b:{y:2,x:1},extra:9},{a:0,b:{x:0,y:0},c:0});
  assert.deepEqual(Object.keys(out),['a','b','c','extra']);assert.deepEqual(Object.keys(out.b),['x','y']);
  assert.equal(hashContent(alignKeyOrder({b:2,a:1},{a:1,b:2})),hashContent({a:1,b:2}));
  // 模板里没有的键保持相对顺序追加在后；模板里有而行里没有的键不会被造出来。
  assert.deepEqual(Object.keys(alignKeyOrder({z:1,a:2},{a:0,gone:0})),['a','z']);
});

test('revertReceiptRow 带 template：被删键回到回执记录的原位，指纹与原行一致；不带 template 则追加在末尾',()=>{
  const sups=pub().filter(s=>s.scope!=='context'),receipt='dir/rec/t1.json',recorded={id:'t1',a:{x:1,k:5,b:2}};
  const current={id:'t1',a:{x:1,b:2}};
  const withTemplate=revertReceiptRow(current,receipt,sups,recorded);
  assert.deepEqual(Object.keys(withTemplate.a),['x','k','b']);assert.equal(hashContent(withTemplate),hashContent(recorded));
  assert.deepEqual(Object.keys(revertReceiptRow(current,receipt,sups).a),['x','b','k']);
  assert.deepEqual(current,{id:'t1',a:{x:1,b:2}});
});

test('verifyFrozen 负向：before 被改、缺条目、多出未登记的聚落、after 不是删除、scope 不是 context，都被拒',async()=>{
  const {buildEntries,verifyFrozen}=await import('../world/design/mktw-initialfood-approval.mjs');
  const entries=await buildEntries();assert.ok(entries.length>0);
  await verifyFrozen(entries);
  const clone=()=>structuredClone(entries);
  const wrongBefore=clone();wrongBefore[0].before+=1;await assert.rejects(verifyFrozen(wrongBefore),/before/);
  await assert.rejects(verifyFrozen(clone().slice(1)),/覆盖全部/);
  const unknown=clone();unknown[0].target='loc_not_registered';await assert.rejects(verifyFrozen(unknown));
  const notRemoval=clone();notRemoval[0].after=0;await assert.rejects(verifyFrozen(notRemoval),/条目形状/);
  const wrongScope=clone();wrongScope[0].supersedes=wrongScope[0].supersedes.map(s=>({...s,scope:'entry'}));await assert.rejects(verifyFrozen(wrongScope),/条目形状/);
});
