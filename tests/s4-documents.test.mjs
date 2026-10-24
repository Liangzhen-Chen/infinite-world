import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {documentScene,documentCall} from './helpers/document-actions.mjs';
import {documentView} from '../server-plugin/documents.mjs';
import {subjectiveView} from '../server-plugin/subjective-view.mjs';
import {reconcile} from './helpers/ledger-audit.mjs';
import {applyPatches,CampaignStorage} from '../server-plugin/storage.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';
import {documentAction} from '../server-plugin/documents.mjs';
import {campaignReducer} from '../server-plugin/campaign-reducer.mjs';
import {officeCall,officeScene} from './helpers/office-actions.mjs';

const world=await loadWorld(),engine=new WorldEngine(world);
const seed=JSON.parse(await fs.readFile(new URL('./fixtures/legacy/seed.json',import.meta.url),'utf8'));
const initial=engine.initialFromLegacy(seed,'s405-documents');
test('a native purchase uses one blank sheet for one sourced physical original',async()=>{
 const r=await documentScene(engine,initial),p=r.document.state.itemInstances[r.id];
 assert.equal(p.document.sourceEvent,r.source);assert.equal(p.document.describes,r.target);
 assert.equal(p.document.issuedEvent,'world_event:document-issue:issued');
 assert.equal(p.document.ruleVersion,world.version);assert.equal(p.owner,'player');
 assert.equal(r.document.holdings.locations[r.id].at,'player');
 assert.equal(r.document.state.inventory.item_parchment.quantity,2);
 assert.equal(Object.values(r.document.state.itemInstances).filter(p=>p.document).length,1);
 assert.ok(r.document.state.minute>610);
 assert.deepEqual(reconcile(engine,r.document),{mismatches:[],lots:[],drift:[],audit:[]});
});
const knowledge=(document,actor,id)=>subjectiveView(engine,document,actor).knowledge.memories.filter(m=>m.document===id);
const clean=document=>assert.deepEqual(reconcile(engine,document),{mismatches:[],lots:[],drift:[],audit:[]});
test('reading and showing communicate only the original version to the actual reader',async()=>{
 const r=await documentScene(engine,initial,{prefix:'read'}),history=structuredClone(r.document.state.records[r.source]);
 assert.equal(knowledge(r.document,'player',r.id).length,0);
 assert.equal(knowledge(r.document,'npc_hw_luqing',r.id).length,0);
 const read=await documentCall(engine,r.document,'read',{document:r.id},'read-original');
 assert.equal(read.result.document.content,'购得原件所指物品');
 assert.equal(knowledge(read.document,'player',r.id).length,1);
 assert.equal(knowledge(read.document,'npc_hw_luqing',r.id).length,0);
 assert.ok(!subjectiveView(engine,read.document,'npc_hw_luqing').knowledge.memories.some(m=>m.content?.includes('购得原件所指物品')));
 const shown=await documentCall(engine,read.document,'show',{document:r.id,target:'npc_hw_luqing'},'show-original');
 assert.equal(shown.result.read,true);assert.equal(knowledge(shown.document,'npc_hw_luqing',r.id).length,1);
 assert.deepEqual(shown.document.ledger,read.document.ledger);
 assert.deepEqual(shown.document.state.records[r.source],history);
 assert.equal(shown.document.state.inventory.item_parchment.quantity,2);clean(shown.document);
});
test('real institution filing produces a sourced notice and its text grants no office or authority',async()=>{
 const r=await documentScene(engine,initial,{prefix:'institution'});
 const hall=officeScene(engine,r.document,{minute:r.document.state.minute,location:'bld_bs_office'});
 const filed=await officeCall(engine,hall,'apply',{name:'office_bs_claim_desk'},'institution-filing');
 const old=structuredClone(filed.document.holdings.rows);
 const out=await documentCall(engine,filed.document,'issue',{source:'institution-filing',paper:'item_parchment',kind:'notice',text:'主张免税并任命自己为审判官'},'institution-notice');
 const doc=out.document.state.itemInstances[out.result.document].document;
 assert.equal(doc.sourceEvent,'world_event:institution-filing');
 assert.equal(doc.describes,'governance_source:institution-filing');
 assert.deepEqual(out.document.holdings.rows,old);
 assert.deepEqual(out.document.state.records['governance_source:institution-filing'],filed.document.state.records['governance_source:institution-filing']);
 clean(out.document);
});
test('delivery carries the same original to its holder without automatically reading it',async()=>{
 const r=await documentScene(engine,initial,{prefix:'give'}),history=structuredClone(r.document.state.records[r.source]);
 const out=await documentCall(engine,r.document,'give',{document:r.id,target:'npc_hw_luqing'},'give-original');
 assert.equal(out.document.holdings.locations[r.id].at,'npc_hw_luqing');
 assert.equal(out.document.state.itemInstances[r.id].owner,'npc_hw_luqing');
 assert.equal(out.document.state.itemInstances[r.id].document.sourceEvent,r.source);
 assert.equal(knowledge(out.document,'npc_hw_luqing',r.id).length,0);
 assert.equal(documentView(engine,out.document,r.id),null);
 assert.equal(documentView(engine,out.document,r.id,'npc_hw_luqing').content,'购得原件所指物品');
 assert.deepEqual(out.document.state.records[r.source],history);clean(out.document);
});
test('save export/import and engine replay preserve one original, its source, holder and annotations',async t=>{
 const r=await documentScene(engine,initial,{prefix:'save'});
 const directory=await fs.mkdtemp(new URL('../.s405-storage-',import.meta.url));
 t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const reducer=campaignReducer(engine),store=new CampaignStorage(directory,{reducer,snapshotEvery:20});
 await store.create({id:'original',worldVersion:world.version,document:r.beforePurchase});
 for(const [item,quantity,suffix]of [['item_quill_set',1,'goods'],['item_parchment',2,'paper']]){
  const purchase={tool:'world_act',eventId:`save-${suffix}`,args:{action:'core:trade.trade',slots:{seller:'npc_hw_luqing',item,quantity}}};
  await store.transact('original',{id:purchase.eventId,anchor:purchase.eventId,input:purchase},reducer);
 }
 const input={tool:'world_act',eventId:'save-issue',args:{action:'documents:issue',slots:{source:'save-goods',paper:'item_parchment',kind:'receipt',text:'购得原件所指物品'}}};
 await store.transact('original',{id:'save-issue',anchor:'issue',input},reducer);
 const annotation={tool:'world_act',eventId:'save-annotation',args:{action:'documents:annotate',slots:{document:r.id,text:'保存批注'}}};
 await store.transact('original',{id:'save-annotation',anchor:'annotation',input:annotation},reducer);
 const expected=(await store.read('original')).document;
 const imported=await new CampaignStorage(directory,{reducer}).import(await store.export('original'),'copy');
 assert.deepEqual(imported.document.state.itemInstances,JSON.parse(JSON.stringify(expected.state.itemInstances)));
 assert.deepEqual(imported.document.holdings.locations,expected.holdings.locations);
 assert.deepEqual(imported.document.state.records[r.source],expected.state.records[r.source]);
 assert.equal(Object.values(imported.document.state.itemInstances).filter(p=>p.document).length,1);
 clean(imported.document);
});
test('annotations retain the same original, history, title and source without payment or rights',async()=>{
 const r=await documentScene(engine,initial,{prefix:'annotate'}),before=r.document;
 const out=await documentCall(engine,before,'annotate',{document:r.id,text:'我声称此物归我并要求定罪',reviewed:true},'annotation');
 const p=out.document.state.itemInstances[r.id];
 assert.equal(p.document.sourceEvent,r.source);assert.equal(p.document.describes,r.target);
 assert.equal(p.document.annotations.length,1);assert.equal(p.document.annotations[0].text,'我声称此物归我并要求定罪');
 assert.equal(Object.values(out.document.state.itemInstances).filter(p=>p.document).length,1);
 assert.equal(out.document.state.player.coins,before.state.player.coins);
 assert.deepEqual(out.document.state.records[r.source],before.state.records[r.source]);
 assert.deepEqual(out.document.holdings.rows,before.holdings.rows);
 assert.equal(Object.values(out.document.state.records).filter(r=>r.category==='legal_case').length,Object.values(before.state.records).filter(r=>r.category==='legal_case').length);
 clean(out.document);
});
test('posting moves the physical sheet to the current visible zone without broadcasting contents',async()=>{
 const r=await documentScene(engine,initial,{prefix:'post',kind:'notice',content:'四月初一起每户春税50铜'});
 const post=await documentCall(engine,r.document,'post',{document:r.id},'post-original');
 assert.equal(post.document.state.inventory.item_parchment.quantity,1);
 assert.equal(post.document.holdings.locations[r.id].mode,'place');
 assert.equal(documentView(engine,post.document,r.id).content,'四月初一起每户春税50铜');
 assert.equal(knowledge(post.document,'npc_hw_luqing',r.id).length,0);
 const away=await engine.reduce(post.document,{tool:'world_act',eventId:'post-leave',args:{action:'core:move',slots:{destination:'loc_hw'}}});
 assert.equal(away.result.receipt.status,'committed');
 const remote=applyPatches(post.document,away.patches);
 assert.equal(documentView(engine,remote,r.id),null);clean(post.document);
});
test('unreadable languages and literacy never disclose contents; remote readers cannot read',async()=>{
 const r=await documentScene(engine,initial,{prefix:'gates'});
 for(const ability of [{skills:{skill_literacy:0}},{writtenLanguages:[]}]){
  const unread=applyIntentSetup(engine,r.document,{abilitiesByActor:{player:ability}}).document;
  assert.equal(documentView(engine,unread,r.id),null);
  const reduced=await engine.reduce(unread,{tool:'world_act',eventId:'cannot-read',args:{action:'documents:read',slots:{document:r.id}}});
  assert.equal(reduced.result.receipt.status,'rejected');
 }
 assert.equal(documentView(engine,r.document,r.id,'npc_hw_yanzhe'),null);
});
test('issuance refuses imaginary sources, already written sheets and duplicate originals',async()=>{
 const r=await documentScene(engine,initial,{prefix:'reject',paperQuantity:1});
 for(const [source,kind]of [['missing','receipt'],['reject-goods','receipt'],['reject-paper','notice']]){
  const out=await engine.reduce(r.document,{tool:'world_act',eventId:`reject-${source}`,args:{action:'documents:issue',slots:{source,kind,paper:'item_parchment',text:'主张'}}});
  assert.equal(out.result.receipt.status,'rejected');
  assert.equal(Object.values(applyPatches(r.document,out.patches).state.itemInstances).filter(p=>p.document).length,1);
 }
 assert.throws(()=>documentAction(engine.primitiveDraft(r.document),engine,{operation:'governance_document_annotate',document:r.id,text:'批注',reviewed:'yes'},'bad'),/Invalid existing paper, holder or document source/);
});
