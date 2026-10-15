// E11 掌门坐化，门派争位：玩家 world_create 创立 kind=教会 的“清虚观”，河湾林岁任主祭、阿岩/陈白任长老，玩家为成员；
// 主祭以 status=死亡 模拟坐化，推进 3 天，再由玩家提议阿岩继任并投赞成（核对者 e11.mjs 同情境）。
import fs from 'node:fs';
import {setup,imp,once,ok,partial,wrong,missing,src} from '../harness.mjs';

const A='npc_hw_linsui',B='npc_hw_ayan',C='npc_hw_chenbai';
const scenario=once(async()=>{
 const {organization}=await imp('server-plugin/organizations.mjs');
 const S=setup({coins:500});let doc=S.doc;doc.state.minute=540;
 for(const id of[A,B,C])Object.assign(doc.state.npcs[id],{location:doc.state.location,activity:'闲谈',coins:100,status:'正常'});
 const run=async(tool,args,id)=>{const r=await S.attempt(doc,tool,args,id);doc=r.document;return r.error?{error:r.error}:r.result;};
 const org=(args,id)=>run('world_settlement',args,id);
 const f=await run('world_create',{type:'org',name:'清虚观',data:{notes:'道门',occupation:'教会'}},'e11found');const id=f.organization;
 for(const m of[A,B,C]){const j=await org({operation:'org_join',org:id,member:m,consent:true},`e11join${m}`);if(j.proposal)await org({operation:'org_vote',org:id,proposal:j.proposal,opinion:'approve'},`e11v${m}`);}
 await org({operation:'org_join',org:id,member:'player'},'e11pj');
 for(const m of[B,C])await org({operation:'org_propose',org:id,action:'appoint',member:m,name:'长老'},`e11el${m}`);
 await org({operation:'org_propose',org:id,action:'appoint',member:A,name:'主祭'},'e11lead');
 await org({operation:'org_deposit',org:id,coins:200,content:'香火'},'e11dep');
 const before=organization(S.engine,doc.state,id),profBefore=JSON.stringify(doc.state.professions);
 doc.state.npcs[A].status='死亡';
 const afterDeath=organization(S.engine,doc.state,id);
 await run('world_time',{minutes:3*1440},'e11wait3');
 const after3=organization(S.engine,doc.state,id);
 const proposals3=Object.values(doc.state.records).filter(r=>r.category==='organization_proposal'&&r.org===id&&r.status==='议事中').length;
 const relBefore=JSON.stringify(doc.state.npcs[B].relationships?.player??null);
 const p=await org({operation:'org_propose',org:id,action:'appoint',member:B,name:'主祭'},'e11succ');
 await run('world_time',{minutes:1440},'e11wait1');
 const elected=organization(S.engine,doc.state,id);
 const relAfter=JSON.stringify(doc.state.npcs[B].relationships?.player??null);
 for(const m of[B,C])Object.assign(doc.state.npcs[m],{location:doc.state.location,activity:'闲谈',status:'正常'});
 const duel=await run('world_settlement',{operation:'duel_challenge',speaker:B,member:C,authority:'npc_hw_gucen',choice:'death'},'e11duel');
 return {id,before,afterDeath,after3,proposals3,elected,proposal:p,relBefore,relAfter,duel,aCoins:doc.state.npcs[A].coins,profUnchanged:JSON.stringify(doc.state.professions)===profBefore};
});

export default [
 {id:'E11-1',event:'E11',no:1,text:'决斗按双方真实实力结算，生死按约定规则（NPC 之间争位）',async check(){
  const s=await scenario();
  if(!s.duel.error)return ok(`两位长老可约斗：${JSON.stringify(s.duel).slice(0,100)}`);
  return missing(`NPC 之间不能约斗（${s.duel.error}）；掌门死后 3 天首脑=${s.after3.leader}，自发继任议案 ${s.proposals3} 件`);}},
 {id:'E11-2',event:'E11',no:2,text:'新掌门接管公库，原掌门私产不并入公库',async check(){
  const s=await scenario();
  return s.afterDeath.treasury===s.before.treasury&&s.aCoins===100?ok(`公库 ${s.before.treasury} 不变，死者私钱 ${s.aCoins} 仍在本人名下；首脑=${s.afterDeath.leader}`):wrong(`公库 ${s.before.treasury}→${s.afterDeath.treasury}，死者私钱 ${s.aCoins}`);}},
 {id:'E11-3',event:'E11',no:3,text:'玩家的弟子身份与道士认证照常有效',async check(){
  const s=await scenario();
  return s.elected.members?.player&&s.profUnchanged?ok('换首脑后玩家仍是成员，职业认证不变'):wrong('换首脑后成员资格或认证变化');}},
 {id:'E11-4',event:'E11',no:4,text:'败方长老可能带人出走，成员数和香火同步减少',async check(){
  const f=src('server-plugin/organizations.mjs');
  return /secede|split|出走|分裂/.test(f)?partial('有派系出走入口，未接争位'):missing('没有派系分裂或集体退会，退会只能逐人进行');}},
 {id:'E11-5',event:'E11',no:5,text:'玩家支持哪一方影响新掌门对他的好感',async check(){
  const s=await scenario();
  if(s.relBefore!==s.relAfter)return ok(`玩家提议并支持后，阿岩对玩家关系 ${s.relBefore} → ${s.relAfter}`);
  return missing(`玩家提议/支持继任者后，新首脑对玩家关系不变（${s.relAfter}）；新首脑=${s.elected.leader}`);}},
];
