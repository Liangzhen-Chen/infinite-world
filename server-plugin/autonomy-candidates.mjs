import {preconditionFailure} from './precondition.mjs';
// L1 extension point. Pack predicates and scores receive the four-domain view.
import {withReadScope} from './read-scope.mjs';
import {npcDecision} from './npc-decision.mjs';
import {consumerCoefficients} from './derived-consumers.mjs';
import {subjectiveFact} from './subjective-view.mjs';
import {loadActionRegistry,findAction} from './action-registry.mjs';
const evalValue=(value,v)=>typeof value==='function'?value(v):value;
function applies(c,v){
 const p=c.applicability;if(typeof p==='function')return Boolean(p(v));
 if(!p)return true;
 if(typeof p!=='object')throw Error('自治候选需使用主观字段条件');
 return subjectiveFact(v,p.fact)?.value===p.equals;
}
// L2 playpacks register what a person may do on his own that no data list can name in advance: candidates derived from the
// world as it stands, and the execution of the action kinds they use. The engine never names a pack.
const providers=new Map(),kinds=new Map();
export function registerAutonomyProvider(id,provider){providers.set(id,provider);}
export function registerAutonomyKind(kind,spec){kinds.set(kind,spec);}
export const autonomyKind=kind=>kinds.get(kind)??null;
export function autonomyRelevant(engine,state,id,presence,projectDocument){
 const rows=[...providers.values()];
 if(!rows.some(p=>p.relevant(engine,state,id,presence)))return false;
 // Preserve the old shared OR gate. A provider without an explicit necessary
 // candidate condition may still contribute when another provider opens it.
 if(!projectDocument)return true;
 return rows.some(p=>!p.candidateRelevant||p.candidateRelevant(engine,projectDocument(),id,presence));
}
export function autonomyCandidates(engine,view,{fallback=[] ,scheduled=[],document=null}={}){
 const coefficients=consumerCoefficients(view,'autonomy'),decisionCoefficients=consumerCoefficients(view,'decision');
 const derivedRows=document?withReadScope(()=>[...providers.values()].flatMap(p=>p.candidates(engine,view,document))):[];
 const candidates=[...(engine.world.autonomy?.candidates??[]),...(engine.rules.npcAutonomy?.candidates??[]),...derivedRows,...scheduled,...fallback];
 const needs=Object.values(view.self.goals??{}).flat().filter(g=>(g.progress??0)<100).sort((a,b)=>(b.urgency??0)-(a.urgency??0));
 const need=needs[0]?.need;
 return candidates.filter(c=>(!c.npc||c.npc===view.observer)&&(!need||!c.need||c.need===need)&&applies(c,view)).map(c=>{
  const decision=npcDecision(view,{kind:c.kind??c.action,from:c.from??view.observer,cost:c.cost,needSatisfaction:c.needSatisfaction??100,urgency:c.urgency??needs[0]?.urgency??0,tags:c.tags});
  return {...c,decision,score:Number(evalValue(c.utility??0,view))*coefficients.utilityWeight-Number(evalValue(c.risk??0,view))*(view.self.traits.riskAversion??1)*decisionCoefficients.riskAversion*coefficients.riskWeight};
 }).filter(c=>c.decision.outcome==='agree').sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
}
// `via` submits a candidate; it never executes a caller's scheduled command.
export function scheduleNpcAutonomy(d,{npc,action,slots={},via,need='need:curiosity',utility=0,risk=0,horizon=1,steps,deadline},id){
 if(via!=='npc-autonomy')throw Error('NPC 自主候选须经 via: npc-autonomy');
 if(!d.get('state','npcs',npc))throw Error('自治人物不存在');
 const candidate={id,npc,action,slots:structuredClone(slots),need,utility,risk,horizon,...(steps?{steps:structuredClone(steps)}:{}),...(deadline!==undefined?{deadline}:{})};
 d.set(['state','autonomyCandidates',id],candidate);return {candidate,status:'待决策'};
}
export function candidateAction(engine,c){
 if(c.legacy)return structuredClone(c.legacy);
 const a=findAction(engine.actionRegistry??loadActionRegistry(),c.action);
 if(!a?.autonomy)throw preconditionFailure('这个注册动作尚无 NPC 执行适配');
 const slots={...c.slots,...a.call?.fixed??{}};
 return Object.fromEntries(Object.entries(a.autonomy).map(([k,v])=>[k,typeof v==='string'&&v.startsWith('$')?slots[v.slice(1)]:v]));
}
export function planFromCandidate(view,c){
 return {goal:c.goal??c.need,steps:structuredClone(c.steps??[{action:c.action,slots:c.slots??{},done:false}]),secrecy:c.secrecy??'public',deadline:c.deadline??view.minute+1440*(c.horizon??1),basis:c.decision.trace,urgency:c.urgency??0,candidate:c.id};
}
