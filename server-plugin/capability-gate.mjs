// A bare request (free text, no structured effects or means) that asks for a
// world capability the actor does not have is refused up front, with the
// missing source named (06 §6.10.4). Capability vocabulary is catalog data:
// an action declares signature.capabilities as
//   {id,label,terms:[...],mechanisms:[...],sources:[...],alternative}
// where terms name the request, mechanisms are the spell mechanisms that grant
// it, and sources are boolean fields of a feature present in the scene that
// provide it without a spell (e.g. a registered anchor). Nothing about any
// capability is written in code. This runs before entity clarification: a
// request that cannot be satisfied is not a request for more details.
import {reject} from './action-rejection.mjs';
import {environmentFeatures} from './environment.mjs';
import {intentText} from './routing-programs.mjs';
import {actorKnowledge} from './action-router.mjs';

const normalize=text=>String(text).normalize('NFKC').toLowerCase();
export function capabilityRefusal(engine,document,proposal,context,registry){
 if(proposal.effects?.length||proposal.means&&Object.keys(proposal.means).length)return null;
 const text=normalize(intentText(proposal)),actor=context.actor??'player';
 for(const action of registry.actions)for(const capability of action.signature?.capabilities??[]){
  if(!capability.terms?.some(term=>text.includes(normalize(term))))continue;
  const known=Object.keys(actorKnowledge(engine,document,actor).spells??{});
  if(known.some(id=>{const spell=engine.byId.get(id);return capability.mechanisms?.includes(spell?.mechanism??spell?.effectSpec?.kind);}))continue;
  const location=actor==='player'?document.state.location:document.state.npcs?.[actor]?.location;
  if(capability.sources?.some(field=>environmentFeatures(engine,document,row=>row.location===location&&row[field]===true).length))continue;
  const alternative=capability.alternative&&registry.actions.find(a=>a.id===capability.alternative);
  reject('E-ACTION-CAPABILITY',`尚不具备${capability.label}的能力：没有掌握相应法术，现场也没有现成的来源`,{
   missing:[`没有掌握${capability.label}的法术，现场也没有可用的来源`],
   repair:[`先学会相应法术或找到现成的来源`,...alternative?[`可改选「${alternative.label}」（${alternative.id}），按正常路线出行并查看路程`]:[]]});
 }
 return null;
}
