import test from 'node:test';
import assert from 'node:assert/strict';
import {applyPatches} from '../server-plugin/storage.mjs';
import {createNpcObligation,advanceNpcObligations,assertNpcObligationAction,npcObligationAt} from '../server-plugin/npc-obligations.mjs';
class Draft{constructor(document){this.document=document;this.patches=[];}get(...p){return p.reduce((x,k)=>x?.[k],this.document);}set(path,value){const p={op:'set',path,value};this.document=applyPatches(this.document,[p]);this.patches.push(p);}remove(path){const p={op:'delete',path};this.document=applyPatches(this.document,[p]);this.patches.push(p);}}
function setup(){
 const locations=[{id:'home'},{id:'market'}],npcs=['a','b'].map(id=>({id,tier:'full',schedule:{default:[{start:0,end:1440,location:'home',activity:'营业',services:['trade']}]}}));
 const engine={world:{npcs,locations},byId:new Map([...npcs,...locations].map(x=>[x.id,x])),resolve:x=>x,calendar:()=>({market:false,day:1,season:0}),actor:(d,id)=>d.get('state',id==='player'?'player':'npcs',...(id==='player'?[]:[id])),route:(from,to)=>{if(!from)throw new Error('不在地点');return {minutes:from===to?0:10,cost:from===to?0:2,edges:from===to?[]:['road']};}};
 const document={randomSeed:'obligation',state:{minute:100,location:'home',player:{coins:30,status:'正常',companions:[]},npcs:Object.fromEntries(npcs.map(n=>[n.id,{location:'home',coins:30,status:'正常',inventory:{}}])),obligations:{}}};
 const advance=(doc,minutes,action={tool:'time',args:{}})=>{const d=new Draft(doc),before=doc.state.minute;d.set(['state','minute'],before+minutes);engine.npcObligationAction=action;advanceNpcObligations(d,engine,before,before+minutes,'advance');return d;};
 return {engine,document,advance};
}
test('会面按真实路线占用时段，途中不在任一端点，到时才完成且路费只扣一次',()=>{
 const {engine,document,advance}=setup(),d=new Draft(document);
 createNpcObligation(d,engine,{promisor:'a',promisee:'b',type:'会面',content:'到集市谈木料',location:'market',start:120,deadline:140},'meet');
 let c=advance(d.document,15).document;assert.equal(c.state.npcs.a.location,null);assert.equal(c.state.npcs.a.scheduleTravel.arrive,120);assert.equal(c.state.npcs.a.coins,28);assert.equal(c.state.obligations.obl_meet.togetherMinutes,0);
 c=advance(c,15).document;assert.equal(c.state.npcs.a.location,'market');assert.equal(c.state.obligations.obl_meet.togetherMinutes,10);
 const ended=advance(c,10);assert.equal(ended.document.state.obligations.obl_meet.status,'已完成');assert.equal(ended.document.state.obligations.obl_meet.resolvedAt,140);assert.equal(ended.document.state.obligations.obl_meet.togetherMinutes,20);
 const snapshot=structuredClone(ended.document);advanceNpcObligations(ended,engine,130,140,'repeat');assert.deepEqual(ended.document,snapshot);
 assert.deepEqual(document.state.npcs.a,{location:'home',coins:30,status:'正常',inventory:{}});
});
test('创建冲突和行动冲突拒绝且不改钱物；提前取消释放时段，开始后单方取消记违约',()=>{
 const {engine,document}=setup(),d=new Draft(document),args={promisor:'a',type:'会面',content:'谈工事',start:120,deadline:150};
 createNpcObligation(d,engine,args,'one');const snapshot=structuredClone(d.document);
 assert.throws(()=>createNpcObligation(d,engine,{...args,start:130},'two'),/冲突/);assert.deepEqual(d.document,snapshot);
 assert.throws(()=>assertNpcObligationAction(d,engine,['a'],{start:110,minutes:20,kind:'teach'}),/冲突/);
 assert.equal(npcObligationAt(d.document.state,'a',130).id,'obl_one');
 const cancelled=createNpcObligation(d,engine,{operation:'cancel',obligation:'obl_one',actor:'player'},'cancel');assert.equal(cancelled.obligation.status,'取消');assert.equal(npcObligationAt(d.document.state,'a',130),null);
 d.set(['state','minute'],120);createNpcObligation(d,engine,{...args,start:120},'new');assert.equal(createNpcObligation(d,engine,{operation:'cancel',obligation:'obl_new',actor:'player'},'late').obligation.status,'违约');
});
test('玩家未到场会留下真实责任；移动全过程不算抵达后的会面时间',()=>{
 const {engine,document,advance}=setup(),d=new Draft(document);
 createNpcObligation(d,engine,{promisor:'a',type:'等候',content:'等旅人回来',start:100,deadline:120},'wait');
 d.set(['state','location'],'market');let c=advance(d.document,20).document;
 assert.equal(c.state.obligations.obl_wait.status,'违约');assert.deepEqual(c.state.obligations.obl_wait.keptBy,['a']);assert.deepEqual(c.state.obligations.obl_wait.breachedBy,['player']);
 const fresh=new Draft(document);createNpcObligation(fresh,engine,{promisor:'a',type:'会面',content:'在屋里聊',start:100,deadline:120},'travel');
 c=advance(fresh.document,20,{tool:'move',args:{destination:'home'}}).document;assert.equal(c.state.obligations.obl_travel.attendance.player,0);assert.equal(c.state.obligations.obl_travel.status,'违约');
});
test('路被封或临时失能不会瞬移；长等待与分段推进的约定和人物状态一致',()=>{
 const {engine,document,advance}=setup(),d=new Draft(document);
 createNpcObligation(d,engine,{promisor:'a',promisee:'b',type:'会面',content:'集市碰面',location:'market',start:120,deadline:140},'meet');
 const one=advance(d.document,80).document;let many=d.document;for(let i=0;i<8;i++)many=advance(many,10).document;
 assert.deepEqual(many,one);
 engine.route=()=>{throw new Error('路封了');};const blocked=advance(d.document,40).document;assert.equal(blocked.state.npcs.a.location,'home');assert.equal(blocked.state.npcs.a.coins,30);assert.equal(blocked.state.obligations.obl_meet.status,'违约');
 const ill=new Draft(d.document);ill.set(['state','npcs','a','status'],'患病');const interrupted=advance(ill.document,40).document;assert.equal(interrupted.state.obligations.obl_meet.attendance.a,0);assert.equal(interrupted.state.npcs.a.location,'home');assert.equal(interrupted.state.npcs.a.coins,30);
});
test('回放相同补丁可重建占时与结果，撤销恢复此前状态；无full档保留旧登记职责',()=>{
 const {engine,document,advance}=setup(),d=new Draft(document);createNpcObligation(d,engine,{promisor:'a',type:'会面',content:'当面交谈',deadline:120},'meet');
 const first=advance(d.document,20),again=advance(d.document,20);assert.deepEqual(first.document,again.document);assert.deepEqual(applyPatches(d.document,first.patches),first.document);
 assert.equal(d.document.state.obligations.obl_meet.status,'进行中');assert.equal(d.document.state.obligations.obl_meet.togetherMinutes,0);
 for(const npc of engine.world.npcs)delete npc.tier;assert.equal(createNpcObligation(new Draft(document),engine,{promisor:'a',type:'等候'},'old'),null);
});
test('玩家可按真实路线准时赴异地会面，途中不算占时，到场后整段履约',()=>{
 const {engine,document,advance}=setup(),d=new Draft(document);createNpcObligation(d,engine,{promisor:'a',type:'会面',content:'集市碰面',location:'market',start:120,deadline:140},'arrive');
 let c=advance(d.document,10).document;const moving=new Draft(c);assert.doesNotThrow(()=>assertNpcObligationAction(moving,engine,['player'],{minutes:10,location:'market',kind:'move'}));moving.set(['state','location'],'market');
 c=advance(moving.document,10,{tool:'move',args:{destination:'market'}}).document;assert.equal(c.state.obligations.obl_arrive.attendance.player,0);
 assert.throws(()=>assertNpcObligationAction(new Draft(c),engine,['player'],{minutes:1,location:'home',kind:'move'}),/冲突/);
 c=advance(c,20).document;assert.equal(c.state.obligations.obl_arrive.status,'已完成');
});
test('等候的被等者可在窗口内到来，实际到场后可离开；等待者仍须守满时段',()=>{
 const {engine,document,advance}=setup(),d=new Draft(document);createNpcObligation(d,engine,{promisor:'a',type:'等候',content:'集市等旅人',location:'market',start:120,deadline:150},'wait');
 let c=advance(d.document,25).document;const moving=new Draft(c);assert.doesNotThrow(()=>assertNpcObligationAction(moving,engine,['player'],{minutes:10,location:'market',kind:'move'}));moving.set(['state','location'],'market');
 c=advance(moving.document,10,{tool:'move',args:{destination:'market'}}).document;assert.equal(c.state.obligations.obl_wait.attendance.player,0);c=advance(c,1).document;
 assert.doesNotThrow(()=>assertNpcObligationAction(new Draft(c),engine,['player'],{minutes:10,location:'home',kind:'move'}));assert.throws(()=>assertNpcObligationAction(new Draft(c),engine,['a'],{minutes:10,location:'home',kind:'move'}),/冲突/);
 const leaving=new Draft(c);leaving.set(['state','location'],'home');c=advance(leaving.document,14,{tool:'move',args:{destination:'home'}}).document;assert.equal(c.state.obligations.obl_wait.status,'已完成');
});
test('NPC被等候者完成一次到场后恢复作息，单次与分段等待相同',()=>{
 const {engine,document,advance}=setup(),d=new Draft(document);createNpcObligation(d,engine,{promisor:'a',promisee:'b',type:'等候',content:'在集市交代事务',location:'market',start:120,deadline:150},'npc_wait');
 const once=advance(d.document,50).document;let split=d.document;for(let i=0;i<10;i++)split=advance(split,5).document;
 assert.deepEqual(split,once);assert.equal(once.state.obligations.obl_npc_wait.status,'已完成');assert.equal(once.state.obligations.obl_npc_wait.attendance.b,1);assert.equal(once.state.npcs.b.location,'home');
});
