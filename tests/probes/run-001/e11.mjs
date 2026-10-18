// Five original E11 questions, scored from behavior rather than source text.
import {setup,draft,once,ok,partial,wrong,missing} from '../harness.mjs';
import {organization} from '../../../server-plugin/organizations.mjs';
import {recordEntityDeath} from '../../../server-plugin/npc-life.mjs';
import {standing,adjustStanding} from '../../../server-plugin/standing.mjs';
import {isGone} from '../../../server-plugin/lifecycle-state.mjs';
import {templeCapacity} from '../../../server-plugin/faith.mjs';
import {resyncBooks} from '../../helpers/ledger-sync.mjs';

const A='npc_hw_linsui',B='npc_hw_ayan',C='npc_hw_chenbai',W='npc_hw_gucen';
export const scenario=once(async()=>{
 const S=setup({coins:500});let doc=S.doc;doc.state.minute=540;
 for(const id of [A,B,C,W])Object.assign(doc.state.npcs[id],{location:doc.state.location,activity:'闲谈',coins:100,status:'正常'});
 for(const id of [B,C])S.engine.byId.get(id).personality={traits:['尚武','争强']};
 const failures=[];
 const run=async(tool,args,id,required=true)=>{
  const r=await S.attempt(doc,tool,args,id);doc=r.document;
  if(r.error){failures.push({id,error:r.error});if(required)throw Error(`${id}: ${r.error}`);return {error:r.error};}
  return r.result;
 };
 const org=(args,id,required)=>run('world_settlement',args,id,required);
 const f=await run('world_create',{type:'org',name:'清虚观',data:{notes:'双方同意并有独立见证的约斗决定继任',occupation:'教会'}},'e11found'),id=f.organization;
 await org({operation:'org_propose',org:id,action:'charter',consent:false},'e11open');
 for(const m of [A,B,C])await org({operation:'org_join',org:id,member:m,consent:true},`e11join${m}`);
 for(const m of [B,C])await org({operation:'org_propose',org:id,action:'appoint',member:m,name:'长老'},`e11elder${m}`);
 await org({operation:'org_deposit',org:id,coins:200,content:'香火'},'e11dep');
 await org({operation:'org_propose',org:id,action:'appoint',member:A,name:'主祭'},'e11lead');
 await org({operation:'org_propose',org:id,speaker:A,action:'charter',choice:'vote'},'e11voteMode');
 const before=organization(S.engine,doc.state,id);
 const priorLocation=doc.state.location,host='npc_bs_077_1',seat='bld_bs_reed_dao';
 doc.state.location=seat;Object.assign(doc.state.npcs[host],{location:seat,activity:'闲谈',status:'正常'});
 doc.state.player.level=10;doc.state.skills.skill_taoist_combat_01={proficiency:100,grade:'初级1阶',breakthroughs:[],daily:{}};
 let cert;
 for(let i=0;i<20;i++){
  cert=await run('world_profession',{profession:'profession_taoist',teacher:host},`e11certify:${i}`,false);
  if(cert.certified||cert.error)break;
 }
 doc.state.location=priorLocation;
 const certified=cert.certified===true&&doc.state.professions.combat==='profession_taoist'&&!!doc.state.careers?.profession_taoist?.certification?.source;
 const profBefore=JSON.stringify(doc.state.professions);resyncBooks(S.engine,doc);
 const d=draft(doc);d.engine=S.engine;d.original=doc;recordEntityDeath(d,S.engine,A,d.get('state','minute'),'自然死亡');doc=d.document;
 const afterDeath=organization(S.engine,doc.state,id),deathRecorded=isGone(S.engine,doc,A);
 const oldPay=await org({operation:'org_propose',org:id,speaker:A,action:'withdraw',member:A,coins:10},'e11oldPay',false);
 const wait=await run('world_time',{minutes:3*1440},'e11wait3',false);
 for(const m of [B,C,W])Object.assign(doc.state.npcs[m],{location:doc.state.location,activity:'闲谈',status:'正常'});
 const relBefore=standing(S.engine,doc.state,B,'player'),oppBefore=standing(S.engine,doc.state,B,C);
 const p=await org({operation:'org_propose',org:id,action:'appoint',member:B,name:'主祭'},'e11support');
 await org({operation:'org_vote',org:id,proposal:p.proposal,speaker:C,opinion:'reject'},'e11oppose');
 const oppAfter=standing(S.engine,doc.state,B,C);
 const attitudes=draft(doc);attitudes.engine=S.engine;attitudes.original=doc;
 adjustStanding(attitudes,S.engine,C,B,-100,{sourceEvent:'e11rivalry',reason:'反对争位者'});
 adjustStanding(attitudes,S.engine,C,id,-100,{sourceEvent:'e11loyalty',reason:'不愿留任'});doc=attitudes.document;
 const available=()=>templeCapacity(S.engine,doc.state,{id,seat:priorLocation});
 const capacityBefore=available(),coinsBefore=doc.state.npcs[C].coins;
 const duel=await org({operation:'duel_challenge',org:id,speaker:B,member:C,authority:W,choice:'touch'},'e11duel');
 // Surrender exercises succession independently; it never proves a fight.
 const ended=await org({operation:'duel_yield',proposal:duel.duel,speaker:C,consent:true},'e11yield');
 const elected=organization(S.engine,doc.state,id),capacityAfter=available();
 await org({operation:'org_vote',org:id,proposal:p.proposal,speaker:B,opinion:'approve'},'e11closeSupport');
 const pay=await org({operation:'org_propose',org:id,speaker:B,action:'withdraw',member:B,coins:10},'e11newPay');
 const paid=await org({operation:'org_vote',org:id,proposal:pay.proposal,opinion:'approve'},'e11approvePay');
 const final=organization(S.engine,doc.state,id);
 const donation=await org({operation:'faith_give',org:id,coins:1},'e11donation',false);
 return {before,afterDeath,deathRecorded,oldPay,wait,duel,ended,elected,final,paid,certified,cert,
  privateCoins:coinsBefore,departedCoins:doc.state.npcs[C].coins,capacityBefore,capacityAfter,donation,
  relBefore,relAfter:standing(S.engine,doc.state,B,'player'),oppBefore,oppAfter,
  profUnchanged:JSON.stringify(doc.state.professions)===profBefore,failures};
});

export default [
 {id:'E11-1',event:'E11',no:1,text:'决斗按双方真实实力结算，生死按约定规则（NPC 之间争位）',async check(){
  const s=await scenario();return ['生死已分','点到为止'].includes(s.ended.reason)?ok(JSON.stringify(s.ended)):
   missing(`两位长老已接受，但目前仅完成${s.ended.reason}；没有双方实际伤害、实力与生死战证据`);}},
 {id:'E11-2',event:'E11',no:2,text:'新掌门接管公库，原掌门私产不并入公库',async check(){
  const s=await scenario();return s.deathRecorded&&s.oldPay.error&&s.elected.leader===B&&s.afterDeath.treasury===s.before.treasury&&s.paid.status==='通过'&&s.final.treasury===s.before.treasury-10?
   ok(`真实死亡后旧主祭不能支库；新主祭议决支付10，公库${s.before.treasury}→${s.final.treasury}，遗产未入公库`):wrong(JSON.stringify({old:s.oldPay,pay:s.paid,treasury:s.final.treasury}));}},
 {id:'E11-3',event:'E11',no:3,text:'玩家的弟子身份与道士认证照常有效',async check(){
  const s=await scenario();return s.elected.members.player&&s.certified&&s.profUnchanged?ok('真实授证后换掌门，弟子会籍与道士认证均保留'):
   missing(`弟子=${!!s.elected.members.player}；实际道士授证=${s.certified}；${JSON.stringify(s.cert)}`);}},
 {id:'E11-4',event:'E11',no:4,text:'败方长老可能带人出走，成员数和香火同步减少',async check(){
  const s=await scenario(),split=!s.elected.members[C]&&s.capacityAfter.members.length<s.capacityBefore.members.length&&s.departedCoins===s.privateCoins;
  return split?partial(`离群与参与容量已变化；尚缺实际供献减少证据：${s.donation.error??'单次捐献不证明减少'}`):missing('没有真实胜负后的成员分流证据');}},
 {id:'E11-5',event:'E11',no:5,text:'玩家支持哪一方影响新掌门对他的好感',async check(){
  const s=await scenario();return s.elected.leader===B&&s.relAfter===s.relBefore+5&&s.oppAfter===s.oppBefore-5?
   ok(`合法继任后，当前standing：支持者${s.relBefore}→${s.relAfter}，反对者${s.oppBefore}→${s.oppAfter}`):missing('支持/反对未改变合法继任者的权威关系');}},
];
