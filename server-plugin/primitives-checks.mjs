// Native NPC checks share the legacy dice keys, proficiency, hidden passives,
// equipment bounds and five degrees. The public check tool remains player-only.
import {npcProficiency,checkDie,checkDegree,helperSucceeds,toolBonuses} from './checks.mjs';
import {capacity} from './action-capacity.mjs';
import {isPhysicallyDead} from './holdings.mjs';
import {reject} from './primitive-policy.mjs';

const integer=(n,min,max)=>{if(!Number.isSafeInteger(n)||n<min||n>max)reject('E-CHECK-BOUND','Check input is outside its native bounds');return n;};
const die=(d,id,label)=>checkDie(d.document,id,label);
// Only the native open executor calls this with a server-derived breakdown.
// Public check() and checkActor() still accept registered tiers only. Run all
// their attribute/tool/helper/context protections, then grade the very same die
// against the exact world threshold; never encode server resistance in context.
export function checkDerivedActor(d,engine,args,eventId,actor,derived){
 const context=derived.context??{modifier:0};
 integer(context.modifier,-5,5);
 if(context.modifier&&!String(context.reason??'').trim())reject('E-OPEN-CONTEXT','情境修正须说明理由');
 if(args.opponent){
  const result=engine.primitiveCheck(d,args,eventId,actor);
  result.difficultyBreakdown={...structuredClone(derived),resistanceApplied:false,reason:'对抗沿用对手属性/技能与适应，不叠加固定目标抗性'};
  d.set(['state','checks',eventId],result);return result;
 }
 const world=integer(derived.world,0,Number.MAX_SAFE_INTEGER),difficulty=world+context.modifier;
 if(!Number.isSafeInteger(difficulty))reject('E-OPEN-BOUND','Invalid derived difficulty');
 const registered=Object.values(engine.rules.check.difficulties)[0];
 // Proposal context is a bounded threshold adjustment (positive = harder).
 // The public check's separate actor bonus remains zero for this native check.
 const result=engine.primitiveCheck(d,{...args,difficulty:registered,context:0},eventId,actor);
 Object.assign(result,{difficulty,...checkDegree(result.die,result.total,difficulty),difficultyBreakdown:structuredClone(derived)});
 d.set(['state','checks',eventId],result);return result;
}
export function checkActor(d,engine,args,eventId,actor='player',{effectiveProficiency,hiddenCheckBonus,passiveDomain,trickKey,adaptationBonus,noteTrick,intelligenceFresh}={}){
 if(actor==='player')return engine.check(d,args,eventId);
 const context={engine,document:d.document},state=d.get('state'),body=state.npcs?.[actor];
 if(!body||capacity(context,actor,'check').level==='none'||isPhysicallyDead(engine,d,actor)||body.status==='濒死'||body.scheduleTravel||body.cognitionTravel)reject('E-CHECK-ACTOR','The actor cannot currently make this check');
 if(args.modifier!==undefined)reject('E-CHECK-BOUND','Check modifiers come from current facts');
 const attribute=args.attribute??'精神',skill=args.skill?engine.resolve(args.skill,'skill'):null;
 const attr=value=>{if(!engine.rules.attributes.includes(value))reject('E-CHECK-ATTRIBUTE','Unknown check attribute');return value;};
 attr(attribute);
 const domain=passiveDomain(engine,state,{...args,skill}),contextBonus=integer(args.context??0,-engine.rules.check.contextLimit,engine.rules.check.contextLimit);
 if(contextBonus&&(typeof args.contextReason!=='string'||!args.contextReason.trim()))reject('E-CHECK-CONTEXT','Context modifier requires a reason');
 const present=who=>{
  const other=who==='player'?state.player:state.npcs?.[who],location=who==='player'?state.location:other?.location;
  if(!other||location!==body.location||other.scheduleTravel||other.cognitionTravel||other.status==='濒死'||isPhysicallyDead(engine,d,who)||capacity(context,who,'check').level==='none')reject('E-CHECK-PRESENT','Check participant is not available at the actor location');
  return other;
 };
 const modifierFor=(who,a,s)=>{
  const other=present(who),score=other.attributes?.[a]??engine.byId.get(who)?.attributes?.[a]??10;
  const proficiency=s?(who==='player'?effectiveProficiency(d,engine,s):npcProficiency(d,engine,who,s)):0;
  return Math.floor((integer(score,1,1000)-10)/2)+Math.floor(proficiency/engine.rules.check.skillDivisor)+hiddenCheckBonus(engine,state,who,domain).bonus;
 };
 let difficulty,opponent,trick;
 if(args.opponent){
  if(args.difficulty!==undefined||Object.keys(args.opponent).some(k=>!['npc','attribute','skill'].includes(k)))reject('E-CHECK-OPPONENT','Opposed checks cannot supply difficulty or opponent modifiers');
  const npc=args.opponent.npc==='player'?'player':engine.resolve(args.opponent.npc,'npc');
  if(npc===actor)reject('E-CHECK-OPPONENT','The actor cannot oppose itself');
  const a=attr(args.opponent.attribute??attribute),s=args.opponent.skill?engine.resolve(args.opponent.skill,'skill'):null;
  trick=trickKey(attribute,skill);
  const wary=npc!=='player'&&intelligenceFresh(engine)?adaptationBonus(engine,state,npc,trick):0;
  const roll=die(d,eventId,'opponent:d20'),modifier=modifierFor(npc,a,s)+wary;
  opponent={npc,attribute:a,skill:s,die:roll,modifier,total:roll+modifier,...(wary?{wary}:{})};difficulty=opponent.total;
 }else{
  difficulty=typeof args.difficulty==='string'?engine.rules.check.difficulties[args.difficulty]:args.difficulty;
  if(!Object.values(engine.rules.check.difficulties).includes(difficulty))reject('E-CHECK-DIFFICULTY','Difficulty is not a registered tier');
 }
 const keys=args.helpers??[],helpers=[],people=new Set([actor,opponent?.npc]);
 if(!Array.isArray(keys)||keys.length>(engine.rules.check.maximumHelpers??2)||new Set(keys).size!==keys.length)reject('E-CHECK-HELPER','Invalid helper obligations');
 for(const key of keys){
  const o=state.obligations?.[key],npc=o?.promisor;
  if(!o||o.type!=='协助'||o.promisee!==actor||!['待履行','进行中'].includes(o.status)||o.deadline<=state.minute||people.has(npc)||o.skill!==skill||o.attribute!==attribute)reject('E-CHECK-HELPER','The helper obligation does not cover this check');
  people.add(npc);present(npc);
  if(skill&&npcProficiency(d,engine,npc,skill)<(engine.rules.check.helperMinimumProficiency??100))reject('E-CHECK-HELPER','Helper proficiency is insufficient');
  const roll=die(d,eventId,`helper:${npc}`),modifier=modifierFor(npc,attribute,skill),success=helperSucceeds(roll,modifier);
  helpers.push({obligation:key,npc,die:roll,modifier,total:roll+modifier,success,bonus:success?engine.rules.check.helperBonus??2:0});
 }
 let tools;
 try{tools=toolBonuses(d,engine,args.tools??[],attribute,skill,actor,body.level);}catch(error){reject('E-CHECK-TOOLS',error.message);}
 const details=tools.details,toolBonus=tools.bonus,hidden=hiddenCheckBonus(engine,state,actor,domain);
 const modifier=modifierFor(actor,attribute,skill)+contextBonus+toolBonus+helpers.reduce((n,r)=>n+r.bonus,0),rolls=[die(d,eventId,'d20')];
 if(args.advantage||args.disadvantage)rolls.push(die(d,eventId,'second'));
 const roll=args.advantage===args.disadvantage?rolls[0]:args.advantage?Math.max(...rolls):Math.min(...rolls),total=roll+modifier;
 const {degree,success}=checkDegree(roll,total,difficulty,opponent);
 const result={actor,die:roll,rolls,modifier,total,difficulty,degree,success,...(hidden.bonus?{hiddenPassive:{domain,...hidden}}:{}),...(opponent?{opponent}:{}),...(helpers.length?{helpers}:{}),...(details.length?{tools:details,toolBonus}:{})};
 d.set(['state','checks',eventId],result);
 if(opponent&&opponent.npc!=='player'&&success)noteTrick(d,engine,opponent.npc,trick,eventId);
 for(const row of helpers){
  d.set(['state','obligations',row.obligation,'status'],'已完成');d.set(['state','obligations',row.obligation,'completion'],{source:eventId,success:row.success,minute:state.minute});
  d.set(['state','npcs',row.npc,'developments'],[...d.get('state','npcs',row.npc,'developments')??[],{type:'协助行动',source:eventId,skill,attribute,success:row.success,minute:state.minute}]);
 }
 return result;
}
