// 整类不变量：所有由配方产出的可交易物品，售价不低于材料成本（材料现价 x 用量之和）。
// 仓库里没有"亏本出售"机制（world/、tools/、server-plugin/ 中无相关规则或标记），所以不设豁免；任何一条低于成本都是价格数据错误。
// 本测试读真实世界数据，这是不变量的本意；validate-world 里同一条规则只在装配时检查，这里单独钉住正式世界与回到旧版再装配的候选。
import test from 'node:test';
import assert from 'node:assert/strict';
import {loadWorld} from '../tools/load-world.mjs';
import {economyW3Trades} from '../world/design/economy-w3-trades.mjs';
import {assembleTradesCandidate} from '../tools/w3-trades.mjs';
import {readApprovedSupersedes} from '../tools/approved-revisions.mjs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {materializeRuntimeWorld} from '../server-plugin/runtime-world.mjs';

const world=await loadWorld();
// 与 validateWorld 同口径：带 mechanics 的已审世界按运行时世界（价格以运行时为准）检查，在副本上进行。
const below=reviewed=>{
 const w=reviewed.mechanics?materializeRuntimeWorld(structuredClone(reviewed)):reviewed;
 const price=new Map(w.items.map(i=>[i.id,i.basePrice])),bad=[];
 for(const r of w.recipes){
  const cost=r.materials.reduce((n,m)=>n+price.get(m.item)*m.amount,0),value=price.get(r.output.item)*r.output.quantity;
  if(!(value>=cost))bad.push(`${r.id} ${value}<${cost}`);
 }
 return bad;
};
test('正式世界（运行时口径）：每条配方的产出售价不低于材料成本',()=>{assert.deepEqual(below(world),[]);});
test('配方指向的材料与产出都有价格',()=>{
 const ids=new Set(world.items.map(i=>i.id));
 for(const r of world.recipes){assert.ok(ids.has(r.output.item),r.id);for(const m of r.materials)assert.ok(ids.has(m.item),`${r.id}/${m.item}`);}
});
test('回到旧版再装配：骨架里被已发布修订取代的价格按修订值装配，不与后来的派生价冲突',async()=>{
 // 旧版没有羊皮纸这一行（它由行商首批加入），但保留了依赖它的线装册配方与已级联的 37 文售价。
 const old=structuredClone(world),bones=economyW3Trades(world);
 old.items=old.items.filter(i=>i.id!=='item_parchment');
 const lore=[...bones.items.map(r=>({id:r.id,description:r.use,inspection:'检查可见磨损。',storage:'干燥放置。'})),...bones.recipes.map(r=>({id:r.id,process:r.processFacts}))];
 const candidate=assembleTradesCandidate(old,bones,lore,await readApprovedSupersedes());
 assert.equal(candidate.items.find(i=>i.id==='item_parchment').basePrice,world.items.find(i=>i.id==='item_parchment').basePrice);
 assert.deepEqual(below(candidate),[]);
});
test('伪造的、没有 candidate.json 的 publication.json 被拒绝，不进入装配',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'forged-drafts-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await fs.mkdir(path.join(root,'forged'));
 await fs.writeFile(path.join(root,'forged','publication.json'),JSON.stringify({revision:'forged',receipt:'x',entries:[{id:'e',target:'item_parchment',file:'world/meta/items.json',field:'basePrice',before:12,after:999,supersedes:[{receipt:'world/drafts/w3/trades/bones.json#item_parchment',field:'basePrice'}]}]}));
 await assert.rejects(readApprovedSupersedes(root),/缺 candidate\.json/);
});
