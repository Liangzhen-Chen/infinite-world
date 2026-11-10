import test from 'node:test';
import assert from 'node:assert/strict';
import {parseFieldPath,parsePublication,applySupersedes,createTagSourceResolver} from '../tools/approved-revisions.mjs';

const pub=()=>({revision:'r1',receipt:'dir/review',entries:[
 {id:'a-basePrice',target:'item_a',file:'x.json',field:'basePrice',before:12,after:4,supersedes:[{receipt:'design/b.json#item_a',field:'basePrice'},{receipt:'design/items/item_a.json',field:'(说明文字，不变)'}]},
 {id:'loc-item',target:'loc_x',file:'g.json',field:'site.resources[id=ore].item',before:'scrap',after:'ore',supersedes:[{receipt:'commit 1fb65474 (note)',field:'tools'},{receipt:'design/s.mjs#loc_x',field:'site.resources[id=ore].item'}]},
]});
test('字段路径解析；无法解析的写法报错',()=>{
 assert.deepEqual(parseFieldPath('site.resources[id=ore].item'),['site','resources',{id:'ore'},'item']);
 for(const bad of ['','a..b','[id=x].a','a[id=]','a b'])assert.throws(()=>parseFieldPath(bad),/回执字段路径/);
});
test('回执格式：只返回指向设计源值的取代声明；格式不合法报错',()=>{
 assert.deepEqual(parsePublication(pub()).map(s=>[s.receiptFile,s.targetId,s.label]),[['design/b.json','item_a','basePrice'],['design/s.mjs','loc_x','site.resources[id=ore].item']]);
 const noSup=pub();noSup.entries[0].supersedes=[];assert.throws(()=>parsePublication(noSup),/修订回执格式不合法/);
 const badReceipt=pub();badReceipt.entries[0].supersedes[0].receipt='no-hash-path';assert.throws(()=>parsePublication(badReceipt),/修订回执格式不合法/);
 const otherField=pub();otherField.entries[0].supersedes[0].field='name';assert.throws(()=>parsePublication(otherField),/修订回执格式不合法/);
 assert.throws(()=>parsePublication({revision:'r'}),/修订回执格式不合法/);
});
test('应用取代：设计源值等于 before 才更新，等于 after 保持，其余报错',()=>{
 const sups=parsePublication(pub()),rows=[{id:'item_a',basePrice:12},{id:'loc_x',site:{resources:[{id:'ore',item:'scrap'}]}}];
 assert.equal(applySupersedes(rows,'design/b.json',sups).length,1);assert.equal(rows[0].basePrice,4);assert.equal(rows[1].site.resources[0].item,'scrap');
 assert.equal(applySupersedes(rows,'design/b.json',sups).length,0);
 assert.equal(applySupersedes(rows,'design/s.mjs',sups).length,1);assert.equal(rows[1].site.resources[0].item,'ore');
 assert.throws(()=>applySupersedes([{id:'item_a',basePrice:7}],'design/b.json',sups),/设计源值与修订回执不符/);
 assert.deepEqual(applySupersedes([],'design/b.json',sups),[]);
});
test('标签来源：无来源返回空；规则层 drinkable 需派生水分>0且饱腹0；叠加层核验失败不当作来源',async()=>{
 const world={items:[{id:'item_x',tags:['food']}],recipes:[]};
 const resolve=createTagSourceResolver({world,verifyPropsLayer:async()=>({item_y:['cut']})});
 assert.equal(await resolve({id:'item_y'},'cut').then(r=>Boolean(r?.source)),true);
 assert.equal(await resolve({id:'item_y'},'grip'),null);
 const failing=createTagSourceResolver({world,verifyPropsLayer:async()=>{throw new Error('回执失效');}});
 assert.match((await failing({id:'item_y'},'cut')).error,/回执失效/);
});
