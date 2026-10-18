// L1 decision library: this module accepts only an I25 projection, never truth.
import {subjectiveFact,knownActiveObligations} from './subjective-view.mjs';
export const DECISION_ORDER=['red_lines','relations','cost_benefit','circumstances','conflicts'];
const goals=v=>Object.values(v.self.goals??{}).flat().filter(g=>(g.progress??0)<100);
export function npcDecision(view,request={}){
 const trace=[],add=(stage,basis)=>trace.push({stage,basis});
 const relation=view.self.relations[request.from??'player']??{trust:0,favors:[]};
 const tags=[request.kind,...request.tags??[]];
 const red=view.self.redLines.find(r=>tags.some(t=>typeof t==='string'&&(typeof r==='string'?r.includes(t):r.action===t||r.tags?.includes(t))));
 add('red_lines',{matched:red??null,values:view.self.traits.values??[],minor:view.self.minor});
 add('relations',{...relation,breaches:view.knowledge.memories.filter(m=>m.kind==='breach'||m.eventType==='违约'||['obligation','debt'].includes(m.kind)&&/违约|逾期/.test(m.content??'')).filter(m=>(m.participants??[]).includes(request.from??'player')).map(m=>m.content)});
 const money=Math.max(0,request.cost?.coins??0),time=Math.max(0,request.cost?.minutes??0),risk=Math.max(0,request.cost?.risk??0);
 const belief=request.proposition?subjectiveFact(view,request.proposition):null;
 const riskAversion=view.self.traits.riskAversion??1;
 const values=view.self.traits.values??[],weight=name=>values.includes(name)?values.length-values.indexOf(name):1;
 const cost=money+time/30+risk*riskAversion*10+Math.max(0,request.cost?.family??0)*weight('家人')+Math.max(0,request.cost?.reputation??0)*weight('体面');
 const benefit=Math.max(0,request.reward??0)+(relation.trust??0)/10+(relation.favors?.filter(f=>f.status!=='已还').length??0)*3+(request.needSatisfaction??0);
 add('cost_benefit',{cost,benefit,belief,coins:view.self.coins,riskAversion});
 const urgent=goals(view).find(g=>(g.urgency??0)>(request.urgency??0));
 const busy=/睡|赶路|拘留|昏迷/.test(view.self.activity)||['死亡','濒死','昏迷'].includes(view.self.status)||(view.self.busyUntil??0)>view.minute||(view.self.mental.stress??0)>=90;
 add('circumstances',{busy,mental:view.self.mental,urgent:urgent?.content??null,plan:view.self.plan?.goal??null});
 const conflicts=knownActiveObligations(view).filter(o=>Math.max(view.minute,o.start??view.minute)<Math.min(view.minute+Math.max(1,time),o.deadline??Infinity));
 const identity=subjectiveFact(view,'identity_conflict')?.value,norm=subjectiveFact(view,`norm:${request.kind}`)?.value;
 const publicKey=request.kind==='public_key';
 add('conflicts',{obligations:conflicts.map(o=>o.id),identity:identity??null,norm:norm??null,publicKey,publicKeyRule:publicKey?'公共仓库钥匙仅由有职权的管事保管':null});
 const alternatives=view.observable.services.filter(s=>s.provider!==view.observer&&(!request.service||s.service===request.service));
 let outcome='agree',reason='可以，就这么办。',conditions=null;
 if(red||view.self.minor&&tags.includes('romance')){outcome='refuse';reason=red?`这触犯我的底线：${typeof red==='string'?red:red.reason??red.action}`:'未成年人物只进行正常互动。';}
 else if(publicKey){outcome='refuse';reason='公共仓库的钥匙不能私借，请找有职权的管事。';}
 else if(money>view.self.coins||belief?.value===false){outcome='refuse';reason=belief?.value===false?'我相信这件事不可靠。':'我没有足够的随身钱款。';}
 else if(busy||urgent||view.self.plan&&view.self.plan.status!=='completed'&&(view.self.plan.urgency??0)>(request.urgency??0)){outcome='defer';reason=urgent?`我得先${urgent.content}。`:'我现在脱不开身，稍后再说。';}
 else if(conflicts.length||identity===true||norm==='forbid'){outcome='refuse';reason=conflicts.length?'这与我已经答应的事冲突。':identity?'这与我的身份职责冲突。':'我知道的成员规矩不允许这样做。';}
 else if(cost>benefit||trace[1].basis.breaches.length&&!request.prepaid&&request.kind!=='greet'){
  outcome='conditional';const price=Math.max(1,Math.ceil(cost-benefit));conditions={prepay:price};reason=`需先付${price}文，再谈这件事。`;
 }
 const result={outcome,reason,conditions,alternatives,trace,...(outcome==='defer'?{due:view.minute+60}:{})};
 // Kept non-enumerable: events contain data, not a function (JSON replay).
 Object.defineProperty(result,'explain',{value:()=>structuredClone(trace)});return result;
}
export const npcDecisionLibrary=Object.freeze({npcDecision});
