// 回执的上下文一侧（scope:'context'）与删除键还原的键位：规则层通用，不点名任何字段。
import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePublication,applySupersedes,revertSuperseded,revertReceiptRow,revertReceiptContext,classifySupersedes,restoreValue,alignKeyOrder} from '../tools/approved-revisions.mjs';
import {REMOVE,sameValue} from '../world/design/p1-revision-approval.mjs';
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
  assert.ok(sameValue(undefined,REMOVE));
});
