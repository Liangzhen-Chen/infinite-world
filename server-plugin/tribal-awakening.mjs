import {isPhysicallyDead} from './lifecycle-state.mjs';
// U11 族群觉醒动态（指南3.8.5）。个体成精（wildlife-awakening：听息、立意）之上的一层：
// 以“物种+栖地”为单位的族群按季度累积觉醒进度，来源只认账本里实际发生的事：
//   吸收魔力  栖地内的灵地（wildlifeAwakening.spiritLands）、同栖的灵性物种（K8栖地种群）、首领领地；
//   受到教导  玩家对族群个体的传授记录、导师NPC每季的教导事件（写成世界事件）、完成的“教导”委托；
//   遭受不公  对族群个体的伤害事件、栖地迁出（驱赶）、本地灾害时钟阶段（U3）、被人役使。
// 到达阈值时，族群已现身的个体按 wildlife-awakening 的阶段经 K6 awakening 效果批量开灵，
// 不另起阶段。立意之后族群提出诉求，分成激进、和解、隐退三派，每派是一个 U1 组织
// （organization:<id>，可被查看、加入、捐入），各带一只按季推进的派别时钟。
// 玩家的教导、贸易、调停、镇压（或无视）从世界事件与委托回执里读出，经 K4 立场和派别时钟
// 改变走向；结局为结盟入人类社会、自治新聚居地（按种子生成骨架，只写战役状态）、
// 战争（tribal_war 记录，留给 U12 军队战争接管）或被镇压后潜伏。诉求与冲突经 U17 出委托。
// 参数全部在 rules.tribalAwakening；所有推进只在季度边界（每90日）发生。
import {createHash} from 'node:crypto';
// 开灵模块先载入：effects 与 faction-clock 互相引用，从 effects 起载会在登记时撞上未初始化的常量。
import {awakeningEligible,awakeningTotal,sapient} from './wildlife-awakening.mjs';
import {applyEffects,assertEffect} from './effects.mjs';
import {speciesInHabitat} from './wildlife-range.mjs';
import {adjustStanding,standing} from './standing.mjs';
import {worldEvents,publishTransitionEvent} from './world-events.mjs';
import {groupView} from './entity-view.mjs';
import {remoteWorld} from './remote-generation.mjs';
import {materializeWildlifeHabitats} from './wildlife-habitats.mjs';
import {planWildlifeMigration} from './wildlife-migration.mjs';
import {forestHabitatCapacity} from './forest-water.mjs';
import {clockRoll} from './world-clock.mjs';
import {registerQuestGenerator,postGeneratedQuest} from './quest-sources.mjs';
import {growIntelligence,levelProfile,GROWTH_POINTS} from './npc-intelligence.mjs';
import {declareHoldingWriter,holdingSet} from './holdings.mjs';
import {syncHoldings} from './holding-sources.mjs';
declareHoldingWriter('tribal-awakening',{kinds:['member_of','holds_office','tamed_by','allied_with','controls'],entities:['office','wreck'],locations:true});

const DAY=1440,clone=v=>structuredClone(v);
export const TRIBAL_AWAKENING_VERSION=1;
export const TRIBAL_STANCES=Object.freeze(['radical','accord','recluse']);
export const TRIBAL_CHOICES=Object.freeze(['teach','trade','mediate','suppress']);
export const TRIBAL_OUTCOMES=Object.freeze({ally:'结盟',autonomy:'自治',war:'战争',latent:'潜伏'});
const STANCE_NAME={radical:'激进',accord:'和解',recluse:'隐退'};
const MODES=['leader','vote','elders'],GRADES=['D','C','B','A','S'];
export const tribalKey=id=>`tribal_awakening:${id}`;
export const tribalOrgId=(dyn,stance)=>`tribe_${dyn}_${stance}`;
const clockKey=org=>`tribal_clock:${org}`;
const rules=engine=>engine.rules?.tribalAwakening??null;
const alive=(d,id,a)=>a&&!isPhysicallyDead(null,d,id)&&a.hp>0;
const npcAlive=(state,id,n)=>n&&!isPhysicallyDead(null,state,id);
function within(engine,location,place){const seen=new Set();while(location&&!seen.has(location)){if(location===place)return true;seen.add(location);location=engine.byId.get(location)?.parent;}return false;}
const habitatOf=(engine,dyn)=>engine.rules.wildlife?.habitats.find(h=>h.id===dyn.habitat);
const sum=(o)=>Object.values(o).reduce((n,v)=>n+v,0);

// ---- 校验 ------------------------------------------------------------------------
const int=(v,min,max=1e9)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const text=v=>typeof v==='string'&&v.trim()&&v.length<=200;
export function validateTribalAwakening(world){
 const t=world.rules?.tribalAwakening,errors=[];if(!t)return errors;
 const fail=m=>errors.push(`族群觉醒：${m}`);
 const locations=new Set(world.locations.map(l=>l.id)),npcs=new Set(world.npcs.map(n=>n.id)),items=new Set(world.items.map(i=>i.id));
 const factions=new Set((world.factions??[]).map(f=>f.id)),habitats=new Set((world.rules.wildlife?.habitats??[]).map(h=>h.id));
 const ranges=world.rules.quests?.rewardCopperRanges??{};
 if(t.version!==1||t.quarterDays!==90)fail('版本须为1，按季（90日）推进');
 if(!world.rules.wildlifeAwakening)fail('须先启用开灵规则（wildlifeAwakening）');
 if(!int(t.thresholds?.tingxi,1)||!int(t.thresholds?.liyi,t.thresholds.tingxi+1))fail('听息、立意阈值须为递增正整数');
 const w=t.sources??{};
 for(const [group,keys]of Object.entries({magic:['spiritLand','spiritSpecies','lair','cap'],teach:['player','npc','quest','cap'],injustice:['harm','displaced','hazard','enslaved','cap']}))
  if(keys.some(k=>!int(w[group]?.[k],0,100)))fail(`来源权重无效：${group}`);
 const c=t.clock??{};
 if(!int(c.segments,2,12)||!(c.probability>=0&&c.probability<=1)||!int(c.injusticeStep,1,100)||!int(c.suppressDecisive,1,20)||!int(c.choiceCap,1,6))fail('派别时钟参数无效');
 if(TRIBAL_CHOICES.some(k=>!Number.isSafeInteger(t.standing?.[k])||Math.abs(t.standing[k])>30)||!(t.standing.suppress<0))fail('立场变化参数无效');
 if(!int(t.intelligence?.teachForPlanning,1,1000))fail('族群灵智参数无效');
 const offer=(o,label)=>{
  if(!o||!GRADES.includes(o.grade)||!Array.isArray(ranges[o.grade])||!(o.reward>=ranges[o.grade][0]&&o.reward<=ranges[o.grade][1])||!int(o.days,1,30)||!text(o.content))return fail(`${label}委托等级、报酬、期限或内容无效`);
  const ob=o.objective;
  if(o.choice!==undefined&&!TRIBAL_CHOICES.includes(o.choice))fail(`${label}委托对应的选择无效`);
  if(ob?.type==='deliver'?!items.has(ob.item)||!int(ob.quantity,1,1000):ob?.type==='visit'?!locations.has(ob.location):o.choice!==undefined||ob!==undefined)fail(`${label}委托完成条件无效`);
 };
 const ids=new Set();
 for(const dyn of t.dynamics??[]){
  const label=`动态${dyn.id}`;
  if(typeof dyn.id!=='string'||!/^[a-z0-9_]{1,30}$/.test(dyn.id)||ids.has(dyn.id)){fail(`${label}编号无效或重复`);continue;}ids.add(dyn.id);
  const species=world.monsters?.find(m=>m.id===dyn.species);
  if(!text(dyn.name)||!species?.wildlife)fail(`${label}物种须为野生物种`);
  if(!habitats.has(dyn.habitat)||!locations.has(dyn.home))fail(`${label}栖地或居处未登记`);
  if(!world.locations.find(l=>l.id===dyn.anchor?.society)?.monsterSociety||!factions.has(dyn.anchor?.faction))fail(`${label}须挂靠已登记的聚居地及其议事势力`);
  if(!locations.has(dyn.board)||!npcs.has(dyn.publisher))fail(`${label}委托公告栏或发布人未登记`);
  for(const k of ['tutors','brokers','carriers'])if(!Array.isArray(dyn[k])||(k==='carriers'&&!dyn[k].length)||dyn[k].some(id=>!npcs.has(id)))fail(`${label}.${k}须为已登记人物`);
  if(!int(dyn.servitude,0,20)||!int(dyn.initialProgress,0,t.thresholds?.tingxi??0))fail(`${label}役使或初始进度无效`);
  if(TRIBAL_STANCES.some(s=>!int(dyn.drift?.[s],0,2)))fail(`${label}无人干预时的派别漂移无效`);
  if(!['ally','autonomy'].includes(dyn.accordOutcome))fail(`${label}和解派无人干预的结局须为ally或autonomy`);
  if(!Array.isArray(dyn.factions)||dyn.factions.length!==3||TRIBAL_STANCES.some(s=>dyn.factions.filter(f=>f.stance===s).length!==1)||
   dyn.factions.some(f=>!text(f.name)||!int(f.share,1,100)||!MODES.includes(f.mode)||!text(f.creed)))fail(`${label}须分激进、和解、隐退三派，各有名称、比重、议事方式与主张`);
  if(!Array.isArray(dyn.demands)||!dyn.demands.length)fail(`${label}缺少诉求`);
  const demandIds=new Set();
  for(const x of dyn.demands??[]){
   if(!/^[a-z0-9_]{1,30}$/.test(x.id??'')||demandIds.has(x.id)||!text(x.name)||!text(x.claim))fail(`${label}诉求编号、名称或内容无效`);demandIds.add(x.id);
   if(x.quest)offer(x.quest,`${label}诉求${x.id}`);if(x.quest&&!x.quest.choice)fail(`${label}诉求${x.id}委托须对应一种玩家选择`);
  }
  offer(dyn.conflict,`${label}冲突`);if(dyn.conflict?.objective||dyn.conflict?.choice)fail(`${label}冲突委托以族群结局为完成条件，不另写`);
  if(!Array.isArray(dyn.settlementNames)||!dyn.settlementNames.length||dyn.settlementNames.some(n=>!text(n)))fail(`${label}自治聚居地名库无效`);
  if(Object.keys(TRIBAL_OUTCOMES).some(k=>!text(dyn.outcomes?.[k]?.claim)))fail(`${label}四种结局须各有传闻说法`);
 }
 if(!ids.size)fail('至少登记一条族群动态');
 return errors;
}
const checked=new WeakSet();
export function assertTribalAwakening(engine){
 const t=rules(engine);if(!t||checked.has(t))return;
 const errors=validateTribalAwakening({...engine.world,rules:engine.rules});if(errors.length)throw Error(errors[0]);
 for(const dyn of t.dynamics)for(const kind of Object.keys(TRIBAL_OUTCOMES))for(const e of outcomeEffects(engine,dyn,kind,0))assertEffect(engine,e,'world');
 checked.add(t);
}

// ---- 族群成员 ----------------------------------------------------------------------
// 已现身（state.creatures 中）的本栖地同种个体，加上已编入三派组织的成员。
function membersOf(d,engine,dyn,rec){
 const h=habitatOf(engine,dyn),out=new Set();
 for(const [id,a]of Object.entries(d.get('state','creatures')??{}))
  if(alive(d,id,a)&&a.species===dyn.species&&(a.ecology===dyn.habitat||h&&within(engine,a.location,h.location)))out.add(id);
 for(const org of rec?.factions??[])for(const id of Object.keys(groupView(engine,d.get('state'),org)?.members.value??{}))if(alive(d,id,d.get('state','creatures',id)))out.add(id);
 return [...out].sort();
}
const ecologyCount=(d,dyn)=>d.get('state','records',`ecology:${dyn.habitat}`)?.populations?.[dyn.species]?.count??0;
function sustainableJoiners(d,engine,dyn){
 const h=habitatOf(engine,dyn),species=engine.byId.get(dyn.species),count=ecologyCount(d,dyn);
 if(!h||!species?.wildlife)return count;
 const keep=Math.max(2,Math.ceil(forestHabitatCapacity(engine,d.get('state'),h,species)/2));
 return Math.max(0,count-keep);
}

// ---- 一季的来源与玩家选择 ------------------------------------------------------------
function tribalQuests(state,dyn,from,at){
 return Object.values(state.quests??{}).filter(q=>q.source?.generator==='tribal_awakening'&&q.status==='已完成'&&q.taker==='player'&&
  String(q.source.cause??'').startsWith(`${dyn.id}:`)&&q.resolvedAt>from&&q.resolvedAt<=at);
}
function gather(d,engine,t,dyn,rec,members,from,at,sourceEvent){
 const state=d.get('state'),w=t.sources,member=new Set(members),orgs=new Set(rec.factions??[]),brokers=new Set(dyn.brokers);
 const inWindow=r=>r.minute>from&&r.minute<=at,h=habitatOf(engine,dyn);
 const events=worldEvents(state,inWindow);
 const quests=tribalQuests(state,dyn,from,at),questChoice=c=>quests.filter(q=>q.source.cause===`${dyn.id}:${c}`).length;
 // 吸收魔力
 const lands=(engine.rules.wildlifeAwakening?.spiritLands??[]).filter(l=>h&&within(engine,l.location,h.location)).length;
 const eco=state.records?.[`ecology:${dyn.habitat}`]?.populations??{};
 const spirits=h?speciesInHabitat(engine.rules,engine.world.monsters,h.id).filter(s=>s.id!==dyn.species&&(s.nature?.spirit||s.tags?.includes('spirit'))&&(eco[s.id]?.count??1)>0).length:0;
 const dead=new Set(Object.entries(state.creatures??{}).filter(([id,a])=>a.boss&&!alive(state,id,a)).map(([,a])=>a.boss));
 const lairs=h?(engine.world.bosses??[]).filter(b=>b.residence?.location&&within(engine,b.residence.location,h.location)&&!dead.has(b.id)).length:0;
 const magic=Math.min(w.magic.cap,lands*w.magic.spiritLand+spirits*w.magic.spiritSpecies+lairs*w.magic.lair);
 // 受到教导：玩家传授记录、导师NPC本季的教导（写成世界事件）、完成的教导委托
 let taught=0;
 for(const id of members)taught+=(state.creatures?.[id]?.cultivation?.sessions??[]).filter(s=>s.by==='player'&&s.kind==='teach'&&s.minute>from&&s.minute<=at).length;
 const tutors=dyn.tutors.filter(n=>npcAlive(state,n,state.npcs?.[n]));
 for(const tutor of tutors){
  const id=`${sourceEvent}:teach:${tutor}`;
  publishTransitionEvent(d,engine,{id,minute:at,location:dyn.home,witnesses:[],tool:'advance',
   verb:'learn',actor:tutor,target:rec.factions?.length?tribalOrgId(dyn.id,'accord'):null,tags:['learn','teach','tribal'],tribe:dyn.id,sourceEvent});
 }
 const teach=Math.min(w.teach.cap,taught*w.teach.player+tutors.length*w.teach.npc+questChoice('teach')*w.teach.quest);
 // 遭受不公：伤害、驱赶（栖地迁出）、灾害、役使
 const harmed=events.filter(e=>e.verb==='harm'&&member.has(e.target)).length;
 const displacedNow=eco[dyn.species]?.displaced??0,displaced=Math.max(0,displacedNow-(rec.seen?.displaced??displacedNow));// 首季只记基线
 const hazards=Object.values(state.records??{}).filter(r=>r.category==='hazard_clock'&&r.settlement===dyn.board).reduce((n,r)=>n+(r.history??[]).filter(x=>x.applied&&x.minute>from&&x.minute<=at).length,0);
 const owned=Object.entries(state.creatures??{}).filter(([id,a])=>alive(state,id,a)&&a.species===dyn.species&&a.owner).length;
 const servitude=['结盟','自治'].includes(rec.status)?0:dyn.servitude;
 const injustice=Math.min(w.injustice.cap,harmed*w.injustice.harm+displaced*w.injustice.displaced+hazards*w.injustice.hazard+owned*w.injustice.enslaved+servitude);
 // 玩家的选择（无视＝四项皆零）
 const choices={
  teach:taught+questChoice('teach'),
  trade:events.filter(e=>e.verb==='trade'&&[e.actor,e.target].includes('player')&&[e.actor,e.target].some(x=>member.has(x)||brokers.has(x))).length+questChoice('trade'),
  mediate:events.filter(e=>e.actor==='player'&&(e.verb==='organize'&&orgs.has(e.target)||['pact','gift','help'].includes(e.verb)&&(member.has(e.target)||brokers.has(e.target)))).length+questChoice('mediate'),
  suppress:events.filter(e=>e.verb==='harm'&&e.actor==='player'&&member.has(e.target)&&e.tags?.includes('hostile')).length+questChoice('suppress'),
 };
 return {magic,teach,injustice,detail:{lands,spirits,lairs,taught,tutors,harmed,displaced,hazards,owned,servitude},choices,displacedNow};
}

// ---- 批量开灵：沿用 wildlife-awakening 的听息、立意，经 K6 awakening 效果 -----------------
function batchAwaken(d,engine,dyn,members,stageId,at,sourceEvent){
 const stage=engine.rules.wildlifeAwakening.stages.find(s=>s.id===stageId),seed=d.document.randomSeed,day=Math.floor(at/DAY),done=[];
 for(const id of members){
  const actor=d.get('state','creatures',id);
  if(!awakeningEligible(engine,actor)||sapient(actor)||actor.owner&&actor.owner!=='player')continue;
  const need=stage.points-awakeningTotal(engine,seed,id,actor,day);
  if(stageId==='tingxi'&&need<=0)continue;
  const receipt=applyEffects(d,engine,[{kind:'awakening',target:id,points:Math.min(100,Math.max(1,need))}],
   {settlement:dyn.board,faction:dyn.anchor.faction,minute:at,sourceEvent:`${sourceEvent}:${stageId}`},'world');
  if(receipt.applied)done.push(id);
 }
 return done;
}

// ---- 分化：三派即三个 U1 组织，各带派别时钟 ----------------------------------------------
const hashValue=(...parts)=>createHash('sha256').update(parts.join(':')).digest().readUInt32BE(0);
function stanceFor(seed,dyn,id){
 const total=dyn.factions.reduce((n,f)=>n+f.share,0);let v=hashValue(seed,dyn.id,id)%total;
 for(const f of dyn.factions){if(v<f.share)return f.stance;v-=f.share;}
 return dyn.factions.at(-1).stance;
}
function placeMembers(d,engine,dyn,rec,members,at,sourceEvent){
 const seed=d.document.randomSeed;
 for(const id of members){
  const actor=d.get('state','creatures',id);if(!sapient(actor))continue;
  if(rec.factions.some(org=>groupView(engine,d.get('state'),org)?.members.value[id])||rec.factions.some(org=>d.get('state','records',`organization:${org}`)?.removed?.[id]))continue;
  const org=tribalOrgId(dyn.id,stanceFor(seed,dyn,id)),row=clone(d.get('state','records',`organization:${org}`));
  if(!groupView(engine,d.get('state'),org)?.leader.value){row.leader=id;row.members[id]={position:'会长',joinedAt:at,arrears:0};}
  else row.members[id]={position:'成员',joinedAt:at,arrears:0};
  holdingSet(d,null,['state','records',`organization:${org}`],row,'tribal-awakening');syncHoldings(d,engine,'org',org,{writer:'tribal-awakening',eventId:sourceEvent});
  publishTransitionEvent(d,engine,{id:`${sourceEvent}:join:${id}`,minute:at,location:dyn.home,witnesses:[],tool:'advance',verb:'organize',actor:id,target:org,member:id,position:row.members[id].position,tags:['organization','org:join','tribal'],tribe:dyn.id,sourceEvent});
 }
}
function split(d,engine,t,dyn,rec,members,at,sourceEvent){
 const total=dyn.factions.reduce((n,f)=>n+f.share,0),population=rec.population;
 rec.factions=[];
 for(const f of dyn.factions){
  const id=tribalOrgId(dyn.id,f.stance);
  holdingSet(d,null,['state','records',`organization:${id}`],{category:'organization',id,source:'created',name:f.name,kind:'会社',seat:dyn.home,founder:null,foundedAt:at,leader:null,
   members:{},removed:{},charter:{mode:f.mode,approval:true,fee:0,dues:0,rules:[f.creed]},treasury:0,ledger:[],sourceEvent,
   tribal:{dynamic:dyn.id,stance:f.stance,population:Math.round(population*f.share/total),status:'活动'}},'tribal-awakening');
  syncHoldings(d,engine,'org',id,{writer:'tribal-awakening',eventId:sourceEvent});
  holdingSet(d,null,['state','records',clockKey(id)],{category:'tribal_clock',id:clockKey(id),org:id,dynamic:dyn.id,stance:f.stance,filled:0,segments:t.clock.segments,history:[]},'tribal-awakening');
  const ev=`${sourceEvent}:found:${f.stance}`;
  publishTransitionEvent(d,engine,{id:ev,minute:at,location:dyn.home,witnesses:[],tool:'advance',verb:'organize',actor:id,target:null,
   tags:['organization','org:found','tribal',`stance:${f.stance}`],tribe:dyn.id,sourceEvent});
  rec.factions.push(id);
 }
 placeMembers(d,engine,dyn,rec,members,at,sourceEvent);
 rec.demands=dyn.demands.map(x=>({id:x.id,name:x.name,claim:x.claim,status:'提出',minute:at}));
 rec.splitAt=at;
 applyEffects(d,engine,[{kind:'rumor',id:`${dyn.id}_demands`.slice(0,40),claim:`${dyn.name}开了灵智，提出${rec.demands.map(x=>x.name).join('、')}，族里分成了${dyn.factions.map(f=>f.name).join('、')}。`.slice(0,200),
  carriers:dyn.carriers,salience:3}],{settlement:dyn.board,faction:dyn.anchor.faction,minute:at,sourceEvent:`${sourceEvent}:demands`},'world');
}

// ---- 派别时钟与玩家选择 ---------------------------------------------------------------
function advanceClocks(d,engine,t,dyn,rec,g,members,at,sourceEvent){
 const c=t.clock,cap=v=>Math.min(c.choiceCap,v),ch=g.choices,seed=d.document.randomSeed;
 const decisive=ch.suppress>=c.suppressDecisive;
 const pressure={
  accord:dyn.drift.accord+cap(ch.teach)+cap(ch.trade)+cap(ch.mediate),
  radical:dyn.drift.radical+(g.injustice>=c.injusticeStep?1:0)+(ch.suppress>0&&!decisive?1:0)-cap(ch.mediate),
  recluse:dyn.drift.recluse+(decisive?2:0),
 };
 const clocks={};
 for(const stance of TRIBAL_STANCES){
  const org=tribalOrgId(dyn.id,stance),row=clone(d.get('state','records',clockKey(org)));
  const roll=clockRoll(seed,clockKey(org),at/DAY),bonus=dyn.drift[stance]>0&&roll<c.probability?1:0,delta=pressure[stance]+bonus;
  row.filled=Math.max(0,Math.min(row.segments,row.filled+delta));
  row.history=[...row.history,{minute:at,delta,roll,filled:row.filled,choices:clone(ch),injustice:g.injustice,sourceEvent}];
  holdingSet(d,null,['state','records',clockKey(org)],row,'tribal-awakening');clocks[stance]=row;
  // K4：族群各派对玩家的看法随所作所为改变；激进派对镇压记恨加倍，隐退派不计较贸易。
  const s=t.standing,value=ch.teach*s.teach+(stance==='recluse'?0:ch.trade*s.trade)+ch.mediate*s.mediate+ch.suppress*s.suppress*(stance==='radical'?2:1);
  if(value)adjustStanding(d,engine,org,'player',value,{sourceEvent:`${sourceEvent}:standing`,reason:`${dyn.name}对你本季所为的看法`,minute:at});
 }
 // U7：受教的和解派成员灵智成长。
 if(ch.teach>0)for(const id of Object.keys(groupView(engine,d.get('state'),tribalOrgId(dyn.id,'accord'))?.members.value??{}))
  growIntelligence(d,engine,id,GROWTH_POINTS.teachSkill*Math.min(ch.teach,c.choiceCap),'tribal_teach',`${sourceEvent}:teach`);
 for(const k of TRIBAL_CHOICES)rec.choiceTotals[k]+=ch[k];
 const full=TRIBAL_STANCES.filter(s=>clocks[s].filled>=clocks[s].segments);if(!full.length)return null;
 const priority=decisive?['recluse','accord','radical']:['accord','recluse','radical'];
 const stance=full.sort((a,b)=>clocks[b].filled-clocks[a].filled||priority.indexOf(a)-priority.indexOf(b))[0];
 if(stance==='radical')return {stance,kind:'war'};
 if(stance==='recluse')return {stance,kind:'latent'};
 const tot=rec.choiceTotals;
 return {stance,kind:tot.teach+tot.trade>tot.mediate?'ally':tot.mediate>0?'autonomy':dyn.accordOutcome};
}

// ---- 结局 ----------------------------------------------------------------------------
function outcomeEffects(engine,dyn,kind,at){
 const rows=[{kind:'rumor',id:`${dyn.id}_${kind}`.slice(0,40),claim:dyn.outcomes[kind].claim,carriers:dyn.carriers,salience:3}];
 if(kind==='war')rows.push({kind:'wildlife_stir',habitat:dyn.habitat,minutes:90*DAY,factor:2});
 return rows;
}
// 自治聚居地骨架：同 T143 远方郡，是战役种子与动态数据的纯函数，只写进战役状态，不回写 world/。
export function tribalSettlementSkeleton(seed,dyn,{population,leader,council,minute,home}){
 const h=createHash('sha256').update(`${seed}:tribal:${dyn.id}:v${TRIBAL_AWAKENING_VERSION}`).digest();
 const name=dyn.settlementNames[h.readUInt32BE(0)%dyn.settlementNames.length],id=`loc_ta_${dyn.id}`;
 const districts=Math.max(1,Math.min(4,Math.ceil(population/40))),angle=h.readUInt32BE(4)/2**32*Math.PI*2,r=0.3+h.readUInt32BE(8)/2**32*0.6;
 const coordinates=home?.coordinates?[Math.round((home.coordinates[0]+Math.cos(angle)*r)*100)/100,Math.round((home.coordinates[1]+Math.sin(angle)*r)*100)/100]:null;
 const work=['觅食','守洞','掘土','传话','照看幼崽','记事'];
 return {version:TRIBAL_AWAKENING_VERSION,id,name,generated:'tribal',dynamic:dyn.id,species:dyn.species,parent:home?.parent??null,near:dyn.home,coordinates,
  population,council,leader,foundedAt:minute,
  districts:Array.from({length:districts},(_,i)=>({id:`${id}_d${i+1}`,name:`${name}${'东西南北'[i]}窝`,work:[work[(h[12+i]+i)%work.length],work[(h[16+i]+i+3)%work.length]].filter((v,j,a)=>a.indexOf(v)===j)})),
  roster:{named:leader?1:0,quota:Math.max(0,population-(leader?1:0)),note:'名册配额按种子登记，到访住区或点名交谈时才生成具体个体'}};
}
function resolveOutcome(d,engine,t,dyn,rec,{stance,kind},at,sourceEvent){
 const ev=`${sourceEvent}:${kind}`,org=tribalOrgId(dyn.id,stance),accord=tribalOrgId(dyn.id,'accord'),radical=tribalOrgId(dyn.id,'radical');
 const receipt=applyEffects(d,engine,outcomeEffects(engine,dyn,kind,at),{settlement:dyn.board,faction:dyn.anchor.faction,minute:at,sourceEvent:ev},'world');
 let transition;
 const event=(verb,actor,target,tags)=>{transition={id:ev,minute:at,location:dyn.home,witnesses:[],tool:'advance',verb,actor,target,tags:['tribal',...tags],tribe:dyn.id,sourceEvent:ev};};
 const setOrg=(id,patch)=>{const row=d.get('state','records',`organization:${id}`);if(row)holdingSet(d,null,['state','records',`organization:${id}`],{...row,tribal:{...row.tribal,...patch}},'tribal-awakening');};
 const outcome={kind,status:TRIBAL_OUTCOMES[kind],stance,org,minute:at,sourceEvent:ev,effects:receipt.applied?receipt.effects.map(e=>e.kind):[]};
 if(kind==='ally'){
  adjustStanding(d,engine,dyn.board,accord,20,{sourceEvent:ev,reason:`${dyn.name}结盟入村`,minute:at});
  adjustStanding(d,engine,accord,dyn.board,20,{sourceEvent:ev,reason:'结盟',minute:at});
  setOrg(accord,{status:'结盟',affiliation:dyn.board});setOrg(radical,{status:'散入'});
  event('pact',accord,dyn.board,['pact','alliance']);
 }else if(kind==='autonomy'){
  const resourceAware=Boolean(engine.rules.forestWater);
  const inhabitants=rec.awakened.filter(id=>alive(d,id,d.get('state','creatures',id)));
  // R24: only the sustainable surplus of unseen wild stock joins the census.
  // The range keeps half its current (forest-derived) capacity, never below a
  // breeding pair, so weekly births can refill it instead of the species dying out.
  const joining=sustainableJoiners(d,engine,dyn);
  const skeleton=tribalSettlementSkeleton(d.document.randomSeed,dyn,{population:joining+inhabitants.length,leader:groupView(engine,d.get('state'),accord)?.leader.value??null,council:accord,minute:at,home:engine.byId.get(dyn.home)});
  holdingSet(d,null,['state','records',`tribal_settlement:${dyn.id}`],{category:'tribal_settlement',dynamic:dyn.id,minute:at,sourceEvent:ev,hash:createHash('sha256').update(JSON.stringify(skeleton)).digest('hex').slice(0,24),skeleton,inhabitants},'tribal-awakening');
  d.set(['state','settlements',skeleton.id],{name:skeleton.name,population:skeleton.population,food:0,wood:0,stone:0,iron:0,treasury:0,...(resourceAware?{granary:false}:{})});
  for(const id of inhabitants)holdingSet(d,null,['state','creatures',id,'location'],skeleton.id,'tribal-awakening');
  // Unseen members now belong to the settlement census, not wild stock.
  const ecology=d.get('state','records',`ecology:${dyn.habitat}`)?.populations?.[dyn.species];
  if(ecology){const moved=Math.min(ecology.count,joining);holdingSet(d,null,['state','records',`ecology:${dyn.habitat}`,'populations',dyn.species],{...ecology,count:ecology.count-moved,withdrawn:ecology.withdrawn+moved},'tribal-awakening');}
  // Always derive from the authored base, including a second autonomy in this
  // same advance; using the previous overlay would append its households twice.
  if(resourceAware)engine.tribalBaseWorld??=engine.remoteBase?.world??engine.world;
  const overlay=materializeWildlifeHabitats(remoteWorld(engine.tribalBaseWorld??engine.remoteBase?.world??engine.world,d.get('state')));
  const habitats=overlay.rules.wildlife?.habitats.filter(h=>h.location===`${skeleton.id}_wild`)??[];
  const ecologyDocument=resourceAware?{...d.document,state:{...d.get('state'),minute:at}}:d.document;
  for(const patch of planWildlifeMigration(ecologyDocument,{...overlay.rules,wildlife:{...overlay.rules.wildlife,habitats}},overlay.monsters))holdingSet(d,engine,patch.path,patch.value,'tribal-awakening');
  // RW04: forest/water stocks and settlement lookups read the geographic view
  // (engine.world locations, byId), so a resource-aware world moves this same
  // advance onto the new view; archived worlds keep their original catalog.
  if(resourceAware){
   const locations=overlay.locations.filter(l=>!engine.byId.has(l.id));
   engine.world=overlay;engine.rules=overlay.rules;
   engine.entities=[...engine.entities,...locations];engine.resolver=engine.resolver.extend(locations);engine.byId=engine.resolver.entities;
  }
  // The new wild range is settled day by day from now on within this very
  // advance (wildlife.mjs reads engine.runtimeHabitats), exactly as the next
  // advance's overlay will carry it; ranges already in the catalog are skipped.
  engine.runtimeHabitats=[...(engine.runtimeHabitats??[]),...habitats.filter(h=>!(engine.rules.wildlife?.habitats??[]).some(x=>x.id===h.id))];
  setOrg(accord,{status:'自治',settlement:skeleton.id});outcome.settlement=skeleton.id;
  adjustStanding(d,engine,dyn.board,accord,5,{sourceEvent:ev,reason:`${dyn.name}自立聚居地`,minute:at});
  event('organize',accord,null,['organization','org:found','autonomy']);
  Object.assign(transition,{visibility:'public',subject:skeleton.id,participants:[skeleton.leader].filter(Boolean),summary:`${skeleton.name}建立自治聚居地`,tags:[...transition.tags,'entity-transition']});
 }else if(kind==='war'){
  // U12 接口：交战双方、前线、兵力与状态；军队与战争结算由 U12 接管。
  const strength=Object.keys(groupView(engine,d.get('state'),radical)?.members.value??{}).length+(d.get('state','records',`organization:${radical}`)?.tribal?.population??0);
  holdingSet(d,null,['state','records',`tribal_war:${dyn.id}`],{category:'tribal_war',dynamic:dyn.id,aggressor:radical,defenders:[dyn.board,dyn.anchor.faction],front:dyn.home,habitat:dyn.habitat,
   strength,status:'对峙',since:at,sourceEvent:ev,handler:'U12',note:'军队、兵役与战事结算待U12接管；此前只有野物躁动与立场敌对'},'tribal-awakening');
  adjustStanding(d,engine,dyn.board,radical,-40,{sourceEvent:ev,reason:`${dyn.name}起事`,minute:at});
  setOrg(radical,{status:'起事'});outcome.war=`tribal_war:${dyn.id}`;
  event('clash',radical,dyn.board,['war']);
 }else{
  for(const s of ['radical','accord'])setOrg(tribalOrgId(dyn.id,s),{status:'潜伏'});
  setOrg(tribalOrgId(dyn.id,'recluse'),{status:'潜伏'});
  event('organize',tribalOrgId(dyn.id,'recluse'),null,['organization','latent']);
 }
 rec.status=TRIBAL_OUTCOMES[kind];rec.outcome=outcome;
 holdingSet(d,null,['state','records',`tribal_awakening:${dyn.id}`],rec,'tribal-awakening');
 publishTransitionEvent(d,engine,transition);
 d.say(`${dyn.name}的觉醒有了结局：${TRIBAL_OUTCOMES[kind]}`);
}

// ---- 季度推进 ------------------------------------------------------------------------
function levelOf(t,rec){
 if(rec.status==='萌动')return 0;if(rec.status==='听息')return 1;
 return rec.taught>=t.intelligence.teachForPlanning?3:2;
}
function tick(d,engine,t,dyn,at){
 const k=tribalKey(dyn.id),prior=d.get('state','records',k),span=t.quarterDays*DAY;
 if(prior?.lastTick>=at)return;
 const rec=prior?clone(prior):{category:'tribal_awakening',id:dyn.id,name:dyn.name,species:dyn.species,habitat:dyn.habitat,home:dyn.home,status:'萌动',progress:dyn.initialProgress,
  totals:{magic:0,teach:0,injustice:0},taught:0,choiceTotals:{teach:0,trade:0,mediate:0,suppress:0},seen:{displaced:null},quarters:[],awakened:[],factions:[],demands:[],population:0,outcome:null};
 const from=prior?.lastTick??at-span,sourceEvent=`tribal:${dyn.id}:${at}`;
 let members=membersOf(d,engine,dyn,rec);
 const g=gather(d,engine,t,dyn,rec,members,from,at,sourceEvent);
 rec.seen.displaced=g.displacedNow;
 const gained=g.magic+g.teach+g.injustice;
 rec.progress+=gained;rec.taught+=g.teach;
 for(const s of ['magic','teach','injustice'])rec.totals[s]+=g[s];
 const row={minute:at,magic:g.magic,teach:g.teach,injustice:g.injustice,gained,progress:rec.progress,detail:g.detail,choices:g.choices,sourceEvent};
 const th=t.thresholds;
 if(rec.status==='萌动'&&rec.progress>=th.tingxi){rec.status='听息';rec.tingxiAt=at;}
 if(rec.status==='听息'&&rec.progress>=th.liyi){
  rec.status='分化';rec.liyiAt=at;rec.population=ecologyCount(d,dyn)+members.length;
  row.awakened=batchAwaken(d,engine,dyn,members,'liyi',at,sourceEvent);
  rec.awakened=[...new Set([...rec.awakened,...row.awakened])].sort();
  split(d,engine,t,dyn,rec,members,at,sourceEvent);row.split=true;
 }else if(rec.status==='听息'){row.awakened=batchAwaken(d,engine,dyn,members,'tingxi',at,sourceEvent);}
 else if(rec.liyiAt&&!['潜伏'].includes(rec.status)){
  // 后来现身的同族个体也随族群立意，并编入三派。
  const fresh=batchAwaken(d,engine,dyn,members,'liyi',at,sourceEvent);
  if(fresh.length){rec.awakened=[...new Set([...rec.awakened,...fresh])].sort();placeMembers(d,engine,dyn,rec,fresh,at,sourceEvent);row.awakened=fresh;}
 }
 for(const x of rec.demands){const q=Object.values(d.get('state','quests')??{}).find(q=>q.source?.key===`tribal:${dyn.id}:${x.id}`);if(q?.status==='已完成'&&x.status==='提出')Object.assign(x,{status:'已回应',quest:q.id,answeredAt:q.resolvedAt});}
 if(rec.status==='分化'&&rec.splitAt<at){
  const result=advanceClocks(d,engine,t,dyn,rec,g,members,at,sourceEvent);
  if(result){resolveOutcome(d,engine,t,dyn,rec,result,at,sourceEvent);row.outcome=result.kind;}
 }
 rec.level=levelOf(t,rec);rec.intelligence=levelProfile(rec.level).name;
 rec.quarters=[...rec.quarters,row].slice(-12);rec.lastTick=at;
 holdingSet(d,null,['state','records',k],rec,'tribal-awakening');
}
export function advanceTribalAwakening(d,engine,{before,after}){
 const t=rules(engine);if(!t)return;
 assertTribalAwakening(engine);
 const span=t.quarterDays*DAY;
 for(let at=(Math.floor(before/span)+1)*span;at<=after;at+=span)for(const dyn of t.dynamics)tick(d,engine,t,dyn,at);
}

// ---- U17：诉求与冲突出委托 -------------------------------------------------------------
function scanTribal(d,engine,at){
 const t=rules(engine);if(!t)return [];
 const posted=[];
 for(const dyn of t.dynamics){
  const rec=d.get('state','records',tribalKey(dyn.id));if(rec?.status!=='分化')continue;
  const base={generator:'tribal_awakening',board:dyn.board,publisher:dyn.publisher,funding:{treasury:dyn.board},minute:at};
  for(const x of rec.demands){
   const o=dyn.demands.find(y=>y.id===x.id)?.quest;if(!o||x.status!=='提出')continue;
   const objective=o.objective.type==='deliver'?{type:'deliver',item:o.objective.item,quantity:o.objective.quantity,location:dyn.board}:{type:'visit',location:o.objective.location};
   const q=postGeneratedQuest(d,engine,{...base,key:`tribal:${dyn.id}:${x.id}`,label:`${dyn.name}的诉求：${x.name}`,grade:o.grade,reward:o.reward,days:o.days,content:o.content,objective,cause:`${dyn.id}:${o.choice}`});
   if(q)posted.push(q.id);
  }
  const radical=d.get('state','records',clockKey(tribalOrgId(dyn.id,'radical')));
  if(radical&&radical.filled*2>=radical.segments){
   const o=dyn.conflict,q=postGeneratedQuest(d,engine,{...base,key:`tribal:${dyn.id}:conflict`,label:`${dyn.name}冲突`,grade:o.grade,reward:o.reward,days:o.days,content:o.content,
    objective:{type:'record',record:tribalKey(dyn.id),field:'status',equals:['结盟','自治','潜伏']},cause:`${dyn.id}:conflict`});
   if(q)posted.push(q.id);
  }
 }
 return posted;
}
registerQuestGenerator({id:'tribal_awakening',order:250,scan:scanTribal});

// ---- 读出 ---------------------------------------------------------------------------
export function tribalDynamics(engine,state){
 return (rules(engine)?.dynamics??[]).map(dyn=>({dyn,rec:state.records?.[tribalKey(dyn.id)]??null}));
}
export function tribalWars(state){return Object.values(state.records??{}).filter(r=>r.category==='tribal_war');}
const SIGN={听息:'近来常停步辨听人声，对同伴的呼唤有了固定回应',分化:'已立意'};
export function tribalScene(engine,document){
 const s=document.state,lines=[];
 for(const {dyn,rec}of tribalDynamics(engine,s)){
  if(!rec||rec.status==='萌动')continue;
  if(![dyn.home,dyn.anchor.society,dyn.board].some(p=>within(engine,s.location,p)))continue;
  const name=engine.byId.get(dyn.home)?.name??dyn.home;
  if(rec.status==='听息'){lines.push(`${name}的${dyn.name}${SIGN.听息}`);continue;}
  const orgs=rec.factions.map(id=>{const o=s.records?.[`organization:${id}`];return `${o?.name??id}（${id}，${STANCE_NAME[o?.tribal?.stance]??''}，${o?.tribal?.status??''}，${standing(engine,s,id,'player')>=10?'友善':standing(engine,s,id,'player')<=-10?'敌视':'观望'}）`;});
  if(rec.status==='分化')lines.push(`${name}的${dyn.name}已立意，分为${orgs.join('、')}；诉求：${rec.demands.map(x=>`${x.name}${x.status==='已回应'?'（已回应）':''}`).join('、')}`);
  else lines.push(`${name}的${dyn.name}已${rec.status}${rec.outcome?.settlement?`，自立为${s.records?.[`tribal_settlement:${dyn.id}`]?.skeleton?.name??''}`:''}${rec.outcome?.war?['对峙','交战'].includes(s.records?.[rec.outcome.war]?.status)?'，战事未止':'，战事已停':''}`);
 }
 return lines.length?`【族群】${lines.slice(0,2).join('；')}。`:'';
}
