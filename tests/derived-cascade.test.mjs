import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {loadWorld} from '../tools/load-world.mjs';
import {economyW3Journey} from '../world/design/economy-w3-journey.mjs';
import {cascadeEntries} from '../tools/derived-cascade.mjs';
import {getPath,setPath,rowOf,applyCandidate} from '../world/design/p1-revision-approval.mjs';
import {buildEntries} from '../world/design/p1-cascade-approval.mjs';
import {listRevisionBatches,readApprovedSupersedes} from '../tools/approved-revisions.mjs';

const helpers={getPath,setPath,rowOf};
const parchment=(before,after)=>({id:'item_parchment-basePrice',target:'item_parchment',file:'world/meta/items.json',path:['basePrice'],before,after});
const derived=(world,id)=>economyW3Journey(world).items.find(x=>x.id===id).basePrice;
// 世界里所有按规则派生的成品价，先对齐到当前材料价（模拟"上一次修订后已经级联过"的状态）。
const aligned=async()=>{const w=structuredClone(await loadWorld());for(const x of economyW3Journey(w).items)if(x.acquisition?.recipe){const r=w.items.find(i=>i.id===x.id);if(r)r.basePrice=x.basePrice;}return w;};

test('修订一个材料价触发级联：依赖它的派生价全部列出，别的物品不动',async()=>{
 const w=await aligned(),before=economyW3Journey(w).items,w2=structuredClone(w);
 const entries=cascadeEntries(w,[parchment(4,5)],helpers);
 // 先把修订本身设到 5，再直接用规则算全部成品价；级联结果必须正好是变了的那些。
 w2.items.find(i=>i.id==='item_parchment').basePrice=5;
 const after=economyW3Journey(w2).items,changed=after.filter(x=>x.acquisition?.recipe&&x.basePrice!==before.find(b=>b.id===x.id).basePrice).map(x=>x.id);
 assert.ok(changed.includes('item_stitchbound_folio')&&changed.includes('item_paper_cord_tags'));
 assert.deepEqual(entries.map(e=>e.id).sort(),changed.sort());
});
test('级联值等于派生规则直接算出的值，不手填',async()=>{
 const w=await aligned(),w2=structuredClone(w);
 w2.items.find(i=>i.id==='item_parchment').basePrice=5;
 for(const e of cascadeEntries(w,[parchment(4,5)],helpers))assert.equal(e.after,derived(w2,e.id));
 assert.equal(derived(w2,'item_stitchbound_folio'),3*5+5+20);
});
test('P1 级联批：条目取自当前正式世界，新旧值与规则一致，应用后正式值等于规则输出',async()=>{
 const w=await loadWorld();
 if(w.items.find(i=>i.id==='item_stitchbound_folio').basePrice!==61)return; // 已发布后不再有待级联条目（见 isPublished 校验）
 const entries=buildEntries(w);
 assert.ok(entries.length>=2);
 const applied=applyCandidate(w,entries);
 for(const e of entries){assert.equal(e.before,w.items.find(i=>i.id===e.target).basePrice);assert.equal(e.after,derived(applied,e.target));assert.ok(e.supersedes[0].receipt.endsWith(`#${e.target}`));}
});
test('正式值既不是修订前也不是修订后的派生值时报错，不静默覆盖',async()=>{
 const w=await aligned();w.items.find(i=>i.id==='item_stitchbound_folio').basePrice=999;
 assert.throws(()=>cascadeEntries(w,[parchment(4,5)],helpers),/既不是修订前派生值/);
});
test('readApprovedSupersedes 按目录发现全部修订批，不写死批次名',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'rev-'));
 const mk=async(name,pub,cand=true)=>{await fs.mkdir(`${dir}/${name}`);await fs.writeFile(`${dir}/${name}/publication.json`,JSON.stringify(pub));if(cand)await fs.writeFile(`${dir}/${name}/candidate.json`,'{}');};
 const e=id=>({id,target:'t',file:'f',field:'x',before:1,after:2,supersedes:[{receipt:`d.json#t`,field:'x'}]});
 await mk('a-first',{revision:'r1',receipt:'a/review',entries:[e('1')]});
 await mk('b-second',{revision:'r2',receipt:'b/review',entries:[e('2')]});
 await mk('c-not-revision',{revision:'m2',receipt:'c',entries:[{id:'p'}]});
 await mk('d-no-candidate',{revision:'r3',receipt:'d',entries:[e('3')]},false);
 assert.deepEqual((await listRevisionBatches(dir)).map(b=>b.pub.revision),['r1','r2']);
 await fs.rm(dir,{recursive:true});
});
test('发布后：真实回执目录里每个修订批都被读取并带各自版本号',async()=>{
 try{await fs.access('world/drafts/p1-cascade/publication.json');}catch{return;} // 级联批发布前跳过
 const revs=new Set((await readApprovedSupersedes()).map(s=>s.revision));
 assert.ok(revs.has('p1-revision-1')&&revs.has('p1-cascade-1'));
});
