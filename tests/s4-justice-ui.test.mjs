import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeTrial,trialCall,trialPeople as p} from './helpers/trial-actions.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {affairs} from '../server-plugin/ui-affairs.mjs';
import {registerAffairsPanels,renderAffairsPanel} from '../extension/affairs-panels.mjs';
import {loadActionRegistry} from '../server-plugin/action-registry.mjs';

test('案件面板投影只列当事人的正式案件、可见办理人和可触及原件',async()=>{
 const f=await nativeTrial({paper:true}),view=affairs(f.engine,f.document);
 assert.deepEqual(view.cases.map(c=>c.id),[f.case]);assert.equal(view.cases[0].stage,'pending');assert.equal(view.cases[0].fine,null);
 assert.ok(view.legalPapers.some(paper=>paper.id===f.paper));assert.ok(view.legalPeople.some(person=>person.id===p.judge));
 assert.ok(!view.legalPeople.some(person=>person.id===p.handler));
 assert.ok(!view.cases.some(c=>c.id.startsWith('legal_suspicion:')));
 await trialCall(f,'request_hearing',{case:f.case,authority:p.judge},'ui-trial-hearing');
 const judged=affairs(f.engine,f.document).cases[0];assert.equal(judged.fine,11);assert.equal(judged.evidenceScore,2);
 assert.equal(f.document.state.records['world_event:ui-trial-hearing'].actor,p.judge);
 await trialCall(f,'core:law.appeal',{case:f.case,authority:p.reviewer},'ui-trial-appeal');
 const appealed=affairs(f.engine,f.document).cases[0];assert.equal(appealed.appeal.pending,true);assert.equal(appealed.appeal.staysExecution,true);assert.equal(appealed.fine,judged.fine);
});

class Element{
 constructor(tag,doc){this.tag=tag;this.ownerDocument=doc;this.children=[];this.dataset={};this.isConnected=true;this.text='';this.classList={add:()=>{}};}
 append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;this.text='';}
 set textContent(value){this.text=String(value);this.children=[];}get textContent(){return this.text+this.children.map(n=>n.textContent).join(' ');}
 setAttribute(key,value){this[key]=value;}
}
const nodes=root=>[root,...root.children.flatMap(nodes)];
test('案件页按钮真实递证、核验、缴罚和申请复审，改判返款刷新同一界面',async()=>{
 const f=await nativeTrial({paper:true,itemTheft:true,stays:false});let serial=0;
 const doc={createElement:tag=>new Element(tag,doc),createDocumentFragment:()=>new Element('fragment',doc)},root=new Element('div',doc),calls=[];
 const context={api:async()=>affairs(f.engine,f.document),act:async(action,slots)=>{
  calls.push({action,slots});const out=await f.engine.reduce(f.document,{tool:'world_act',eventId:`justice-ui-${++serial}`,args:{action,slots}});
  f.document=applyPatches(f.document,out.patches);assert.notEqual(out.result.receipt?.status,'rejected',JSON.stringify(out.result));return {ok:true,result:out.result};
 }};
 const choose=(label,value)=>{const field=nodes(root).find(n=>n['aria-label']===label);assert.ok(field,label);field.value=value;};
 const click=async label=>{const button=nodes(root).find(n=>n.tag==='button'&&n.textContent===label);assert.ok(button,label);await button.onclick();};
 renderAffairsPanel(root,affairs(f.engine,f.document),'cases',context);
 assert.match(root.textContent,/待审/);choose('在场办理人',p.judge);await click('请求审理');
 assert.equal(f.document.state.records[f.case].judgment.judge,p.judge);assert.match(root.textContent,/已裁判/);
 const balance=f.document.state.player.coins,fine=f.document.state.records[f.case].judgment.fine;
 choose('在场办理人',p.guard);await click('缴纳罚款');assert.equal(f.document.state.player.coins,balance-fine);
 choose('文书原件',f.paper);await click('递交原件');assert.match(root.textContent,/待核验/);
 choose('在场办理人',p.reviewer);choose('文书原件',f.paper);await click('请求核验');assert.match(root.textContent,/已核验真实/);
 choose('在场办理人',p.reviewer);await click('提出上诉');assert.equal(f.document.state.records[f.case].appeal.pending,true);assert.match(root.textContent,/等待复审/);
 choose('在场办理人',p.reviewer);await click('请求复审');assert.equal(f.document.state.player.coins,balance);assert.match(root.textContent,/撤销/);
 assert.equal(nodes(root).some(n=>n.tag==='button'&&n.textContent==='缴纳罚款'),false);
 assert.equal(f.document.state.records[f.case].evidence.filter(e=>e.document===f.paper).length,1);
 assert.deepEqual(calls.map(c=>c.action),['law:request_hearing','core:law.pay','law:submit_evidence','law:verify_evidence','core:law.appeal','law:request_review']);
});

test('案件页与六个新动作共用现有注册目录，不依赖浏览器或模型',()=>{
 const panels=[];registerAffairsPanels({registerPanel:p=>panels.push(p)});assert.ok(panels.some(p=>p.id==='cases'&&p.title==='案件'));
 const registry=loadActionRegistry();
 for(const op of ['request_hearing','submit_evidence','verify_evidence','request_review','execute_fine','decide_case']){
  const action=registry.byId.get(`law:${op}`);assert.equal(action.call.operation,op);assert.equal(action.call.tool,'world_law');assert.ok(!action.label.includes('?'));
 }
});
