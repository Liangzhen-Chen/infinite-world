import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {parseFieldPath,parsePublication,applySupersedes,createTagSourceResolver,overlayFieldReverts,revertSuperseded,revertedRows,APPROVAL_SOURCES} from '../tools/approved-revisions.mjs';
import {verifyPublished as a3wVerify} from '../world/design/a3w-props-approval.mjs';
import {fixedSample,recomputeCorpusHash} from '../tools/w3-wave-score.mjs';
import {hashContent} from '../tools/content-pipeline.mjs';

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
const layer=(tags,verify=async()=>{})=>({name:'层',load:async()=>({revision:'r',fields:{tags,capacityMl:{item_c:250}},verifyPublished:verify})});
test('标签来源：只认登记表里已审叠加层；无来源返回空；层核验失败报错',async()=>{
 const resolve=createTagSourceResolver({registry:[layer({item_y:['cut']})]});
 assert.equal(await resolve({id:'item_y'},'cut').then(r=>Boolean(r?.source)),true);
 assert.equal(await resolve({id:'item_y'},'grip'),null);
 assert.equal(await resolve({id:'item_y'},'drinkable'),null);
 const failing=createTagSourceResolver({registry:[layer({item_y:['cut']},async()=>{throw new Error('回执失效');})]});
 await assert.rejects(()=>failing({id:'item_y'},'cut'),/核验不通过.*回执失效/);
});
test('叠加字段回退：值与登记相符才归因；层核验失败报错；无登记的字段不归因',async()=>{
 const entries=[{id:'item_c',entity:{capacityMl:250}},{id:'item_d',entity:{capacityMl:250}},{id:'item_c2',entity:{lifecycle:{}}}];
 const r=await overlayFieldReverts(entries,{registry:[layer({})]});
 assert.deepEqual(r.map(x=>[x.id,x.parts[0],x.remove]),[['item_c','capacityMl',true]]);
 await assert.rejects(()=>overlayFieldReverts(entries,{registry:[layer({},async()=>{throw new Error('坏');})]}),/核验不通过/);
});
test('语料哈希重算：变化可归因且样本未变才重算；有无法归因的变化仍判失效',()=>{
 const seed='ab'.repeat(32),old=Array.from({length:20},(_,i)=>({id:`entry_${i}`,entity:{description:`文字${i}`,tags:['t'],basePrice:12}}));
 const report={seed,corpusHash:hashContent(old),samples:fixedSample(old,seed).map(x=>({id:x.id,entityHash:hashContent(x.entity)}))};
 const sample=new Set(report.samples.map(s=>s.id)),target=old.find(x=>!sample.has(x.id)).id,other=old.find(x=>!sample.has(x.id)&&x.id!==target).id;
 const now=structuredClone(old),row=now.find(x=>x.id===target);row.entity.tags=['t','cut'];row.entity.basePrice=4;row.entity.capacityMl=250;
 const explained=[{id:target,parts:['tags'],old:['t'],source:'叠加层'},{id:target,parts:['basePrice'],old:12,source:'回执'},{id:target,parts:['capacityMl'],remove:true,source:'a3cap'}];
 const next=recomputeCorpusHash(report,now,explained,{now:new Date('2026-01-01T00:00:00Z')});
 assert.equal(next.corpusHash,hashContent(now));assert.equal(next.corpusRecomputations[0].beforeCorpusHash,report.corpusHash);assert.equal(next.corpusRecomputations[0].basis.length,3);
 assert.throws(()=>recomputeCorpusHash(report,now,explained.slice(0,2)),/无法归因/);
 const unexplained=structuredClone(now);unexplained.find(x=>x.id===other).entity.description+='改';assert.throws(()=>recomputeCorpusHash(report,unexplained,explained),/无法归因/);
 const sampleChanged=structuredClone(now);sampleChanged.find(x=>x.id===report.samples[0].id).entity.description+='改';assert.throws(()=>recomputeCorpusHash(report,sampleChanged,explained),/条目哈希已改变/);
 assert.throws(()=>recomputeCorpusHash(report,now,[]),/没有可归因/);
});

// ---- 下游审批层对已审批修订回执的回退（正文修订批发布后，早先审批的层仍能核验）
const textSups=()=>parsePublication({revision:'t1',receipt:'dir/r',entries:[
 {id:'item_a-description',target:'item_a',file:'world/meta/items.json',field:'description',before:'旧文',after:'新文',supersedes:[{receipt:'world/drafts/w3/items/item_a.json#item_a',field:'description'}]},
 {id:'rec_a-process',target:'rec_a',file:'world/meta/recipes.json',field:'process',before:'旧法',after:'新法',supersedes:[{receipt:'world/drafts/w3/recipes/rec_a.json#rec_a',field:'process'}]},
]});
test('回退：现值等于回执 after 的字段回到 before；回执之外的值、其他文件、其他条目保持原样；不改入参',()=>{
 const sups=textSups(),rows=[{id:'item_a',description:'新文',use:'u'},{id:'item_b',description:'新文'}];
 const out=revertSuperseded(rows,'world/meta/items.json',sups);
 assert.deepEqual(out,[{id:'item_a',description:'旧文',use:'u'},{id:'item_b',description:'新文'}]);
 assert.equal(rows[0].description,'新文');
 assert.deepEqual(revertSuperseded([{id:'item_a',description:'旧文'}],'world/meta/items.json',sups),[{id:'item_a',description:'旧文'}]);
 assert.deepEqual(revertSuperseded([{id:'item_a',description:'有人另改的正文'}],'world/meta/items.json',sups),[{id:'item_a',description:'有人另改的正文'}]);
 assert.deepEqual(revertSuperseded([{id:'item_a',description:'新文'}],'world/meta/recipes.json',sups),[{id:'item_a',description:'新文'}]);
 assert.deepEqual(revertSuperseded([{id:'rec_a',process:'新法'}],'world/meta/recipes.json',sups),[{id:'rec_a',process:'旧法'}]);
});
test('回退走已核验的回执：审批来源未登记或缺冻结候选的回执不被认可；登记并核验通过才回退',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'rev-text-')),batch=path.join(dir,'tb');
 try{
  await fs.mkdir(batch,{recursive:true});
  const e={id:'item_a-description',target:'item_a',file:'world/meta/items.json',field:'description',before:'旧文',after:'新文',supersedes:[{receipt:'world/drafts/w3/items/item_a.json#item_a',field:'description'}]};
  await fs.writeFile(path.join(batch,'publication.json'),JSON.stringify({revision:'t1',receipt:'dir/r',entries:[e]}));
  await assert.rejects(revertedRows([{id:'item_a',description:'新文'}],'world/meta/items.json',dir),/缺 candidate\.json/);
  await fs.writeFile(path.join(batch,'candidate.json'),JSON.stringify({revision:'t1',approval:{via:'未登记来源'},entries:[e],drafts:[],contexts:[{}]}));
  await assert.rejects(revertedRows([{id:'item_a',description:'新文'}],'world/meta/items.json',dir),/审批来源未登记/);
  APPROVAL_SOURCES['未登记来源']=async()=>({verifyFrozen:async()=>{}});
  try{assert.deepEqual(await revertedRows([{id:'item_a',description:'新文'}],'world/meta/items.json',dir),[{id:'item_a',description:'旧文'}]);}
  finally{delete APPROVAL_SOURCES['未登记来源'];}
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('a3w-props 核验：正文修订批发布后正式目录仍通过；回执之外有人改了正文仍报错',async()=>{
 const items=JSON.parse(await fs.readFile('world/meta/items.json','utf8'));
 assert.deepEqual(await a3wVerify(),{published:29});
 const reverted=await revertedRows(items,'world/meta/items.json');
 assert.deepEqual(await a3wVerify(reverted),{published:29});
 const tampered=structuredClone(reverted);tampered.find(x=>x.id==='item_mining_pick').description+='（有人另改）';
 await assert.rejects(a3wVerify(tampered),/发布骨架或引用事实已改变 item_mining_pick|正式目录与历史审批回执不符/);
});
