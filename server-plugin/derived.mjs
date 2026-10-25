// L1 derived slots (D05 §5.9 / A.16). Registries belong to a world, not a process.
import {compileRX,evaluateRX,fixedUnits,fixedNumber,fixedMultiply,checkedFixed} from './rx.mjs';
import {holdingKind,aliveHoldings,holdingsView} from './holdings.mjs';
import {subjectiveView,subjectiveFact} from './subjective-view.mjs';
import {wageQuote} from './obligation-state.mjs';

const STAGES=['add','mul','max','min','clamp'];
const DEFAULT={stages:['mul','clamp'],bounds:[0.5,2],relative:true};
const cache=new WeakMap();
const unknown=Symbol('unknown fact');
export class DerivedRejected extends Error {
 constructor(code,reason){super(reason);this.code=code;this.reason=reason;}
}
const reject=(code,reason)=>{throw new DerivedRejected(code,reason);};
const range=b=>Array.isArray(b)&&b.length===2&&b.every(Number.isFinite)&&b[0]<=b[1];
const inside=(v,b)=>Number.isFinite(v)&&v>=b[0]&&v<=b[1];
const compare=(a,b)=>a<b?-1:a>b?1:0;
const order=(a,b)=>compare(a.pack,b.pack)||compare(a.id,b.id);
const functions={fact:{args:['string','string'],returns:'number'},has:{args:['string','string'],returns:'boolean'}};
const schema={subject:'string',holder:'string',target:'string',kind:'string'};
const expression=value=>{
 if(typeof value!=='string')return null;
 const compiled=compileRX(value,{schema,functions});
 if(compiled.functions.includes('roll'))reject('E-DERIVED-RANDOM','派生修正不能调用 roll');
 return compiled;
};

// Pure compilation is also used by the loader, before a campaign can start.
export function loadDerivedRegistry(world){
 const data=world.derived??{},slots=new Map(),modifiers=[],ids=new Set();
 for(const row of data.slots??[]){
  if(!row.id||slots.has(row.id))reject('E-DERIVED-SLOT','派生槽名称为空或重复');
  const slot={...DEFAULT,...row};
  if(!range(slot.bounds)||!Array.isArray(slot.stages)||slot.stages.some(s=>!STAGES.includes(s))||new Set(slot.stages).size!==slot.stages.length)reject('E-DERIVED-BOUNDS',`派生槽 ${row.id} 的阶段或边界无效`);
  for(const b of [...Object.values(slot.stageBounds??{}),...Object.values(slot.kindBounds??{})])if(!range(b))reject('E-DERIVED-BOUNDS',`派生槽 ${row.id} 的修正边界无效`);
  slots.set(row.id,slot);
 }
 const definition=id=>{
  const seen=new Set();let slot=slots.get(id)??{...DEFAULT,id},kind=slot.kind;
  while(slot.alias){if(seen.has(slot.id))reject('E-DERIVED-ALIAS','派生别名循环');seen.add(slot.id);slot=slots.get(slot.alias);if(!slot)reject('E-DERIVED-ALIAS','派生别名缺少目标');kind??=slot.kind;}
  return {slot,kind};
 };
 const resolve=id=>definition(id).slot,kindOf=id=>definition(id).kind;
 for(const id of slots.keys())resolve(id);
 for(const raw of [...data.modifiers??[],...world.rules?.modifiers??[]]){
  const row={pack:'core',...raw},key=`${row.pack}:${row.id}`;
  if(!row.id||!row.target||ids.has(key))reject('E-DERIVED-MODIFIER','修正项名称为空或重复');ids.add(key);
  const slot=resolve(row.target);
  if(slot.closed)reject('E-DERIVED-CLOSED',slot.reason??'此数值受守恒或裁定规则约束，不能受外力修正');
  if(!slot.stages.includes(row.stage)||row.stage==='clamp')reject('E-DERIVED-STAGE',`此数值不接受 ${row.stage} 修正`);
  const kind=kindOf(row.target);
  const allowed=slot.stageBounds?.[row.stage]??(row.stage==='mul'?(slot.relative?(slot.kindBounds?.[kind]??slot.bounds):DEFAULT.bounds):null);
  if(typeof row.value==='number'){
   if(!Number.isFinite(row.value)||allowed&&!inside(row.value,allowed))reject('E-DERIVED-BOUNDS',`修正项 ${row.id} 超出允许幅度`);
  }else if(typeof row.value!=='string'||!range(row.bounds)||allowed&&(!inside(row.bounds[0],allowed)||!inside(row.bounds[1],allowed)))reject('E-DERIVED-BOUNDS',`修正项 ${row.id} 须声明允许幅度内的表达式边界`);
  if(row.bounds&&(!range(row.bounds)||typeof row.value==='number'&&!inside(row.value,row.bounds)))reject('E-DERIVED-BOUNDS',`修正项 ${row.id} 的边界无效`);
  const when=expression(row.when),value=expression(row.value);
  if(value&&!value.fields.length&&!value.functions.length&&!inside(evaluateRX(value),row.bounds))reject('E-DERIVED-BOUNDS',`修正项 ${row.id} 的常量表达式超出声明幅度`);
  modifiers.push({...row,whenRX:when,valueRX:value});
 }
 const registry={slots,modifiers:modifiers.sort(order),resolve,kindOf};cache.set(world,registry);return registry;
}
const registryOf=engine=>cache.get(engine.world)??loadDerivedRegistry(engine.world);
function declaration(kind,field){
 const seen=new Set();let row=holdingKind(kind);
 while(row&&!seen.has(row.id)){seen.add(row.id);if(field==='conduction'&&row.derives&&Object.hasOwn(row.derives,field))return row.derives[field];if(field!=='conduction'&&Object.hasOwn(row,field))return row[field];row=holdingKind(row.parent);}
 return undefined;
}

// Beliefs carry their own version of a holding. Never use a remembered id as
// authority to dereference hidden current terms (or to test current existence).
export function knownDerivedHoldings(engine,document,observer=null){
 const truth=aliveHoldings(holdingsView(document));if(observer===null)return truth;
 const view=subjectiveView(engine,document,observer),rows=new Map();
 for(const row of truth)if(declaration(row.kind,'visibility')==='public')rows.set(row.id,row);
 for(const row of view.self.holdings)rows.set(row.id,row);
 for(const fact of Object.values(view.knowledge.facts)){
  const row=fact.value?.holding??fact.value;
  if(row&&typeof row==='object'&&row.id&&row.kind&&row.holder&&row.subject){if(row.until===undefined)rows.set(row.id,row);else rows.delete(row.id);}
 }
 return [...rows.values()].sort((a,b)=>compare(a.id,b.id));
}

function contextFor(engine,document,subject,{observer=null,holder=subject,target=subject,kind='',...input}={}){
 const view=observer===null?null:subjectiveView(engine,document,observer),holdings=knownDerivedHoldings(engine,document,observer),sources=new Set();
 const fact=(id,key)=>{
  const source=`fact:${id}:${key}`;let value;
  if(view){
   const known=subjectiveFact(view,source);value=known?.value;
   if(known)sources.add(known.source);
   else if(id===observer&&Object.hasOwn(view.self.body,key))value=view.self.body[key];
   else throw unknown;
  }else{
   const entity=document.holdings?.entities?.[id],instance=document.state.itemInstances?.[id],actor=id==='player'?document.state.player:document.state.npcs?.[id]??document.state.creatures?.[id];
   const base=document.state.created?.[id]??engine.byId.get(instance?.item??id);
   value=entity?.facts?.[key]??instance?.[key]??actor?.[key]??base?.[key]??null;
  }
  sources.add(source);return value??null;
 };
 return {view,holdings,sources,input,bindings:{subject,holder,target,kind},functions:{fact,has:(id,tag)=>{
  const tags=fact(id,'tags');return Array.isArray(tags)&&tags.includes(tag);
 }},fact};
}
const evalExpr=(compiled,ctx)=>evaluateRX(compiled,ctx.bindings,{functions:ctx.functions});
const optionalRead=fn=>{try{return fn();}catch(error){if(error===unknown)return undefined;throw error;}};
function matches(selector,id,ctx){
 if(!selector)return true;
 return Object.entries(selector).every(([key,value])=>{
  if(key==='holding'||key==='organization'){
   const holding=ctx.holdings.find(h=>h.holder===id&&(key==='holding'?h.kind===value:h.subject===value));
   if(holding)ctx.sources.add(`holding:${holding.id}`);return Boolean(holding);
  }
  const actual=ctx.fact(id,key);return Array.isArray(actual)?actual.includes(value):actual===value;
 });
}

// Baseline selectors use the same fact and holding view as modifiers.
export function selectDerivedBaseline(engine,document,rows,subject,options={}){
 const ctx=contextFor(engine,document,subject,options),selected=[];
 for(const row of [...rows].sort((a,b)=>compare(a.id??'',b.id??''))){
  ctx.sources.clear();
  if(optionalRead(()=>matches(row.holder,ctx.bindings.holder,ctx)&&matches(row.target,ctx.bindings.target,ctx))){
   const value=optionalRead(()=>row.fact?ctx.fact(subject,row.fact):row.value);
   if(value!==undefined&&value!==null)selected.push({id:row.id,value,source:row.source??row.id,facts:[...ctx.sources].sort()});
  }
 }
 return selected;
}

// One-hop conduction; callers supply their already projected values. This does
// not recursively walk relationships or import a particular standing consumer.
export function derivedConduction(engine,document,subject,values,{observer=null}={}){
 const rows=knownDerivedHoldings(engine,document,observer),data=engine.world.derived?.conduction??{};
 return rows.filter(h=>h.holder===subject).flatMap(h=>{
  const declared=declaration(h.kind,'conduction');if(!declared)return [];
  let coefficient=typeof declared==='number'?declared:data[h.kind];
  let parent=holdingKind(h.kind)?.parent;
  while(coefficient===undefined&&parent){coefficient=data[parent];parent=holdingKind(parent)?.parent;}
  if(!Number.isFinite(coefficient)||!Number.isFinite(values[h.subject]))return [];
  return [{id:h.id,source:h.source??h.id,subject:h.subject,coefficient,value:fixedNumber(fixedMultiply(fixedUnits(values[h.subject]),fixedUnits(coefficient)))}];
 });
}

// Base formulas remain owned by their consumers; base may be supplied for a
// registered formula. The two valuation aliases reuse today's native inputs.
export function explainDerived(engine,document,id,subject,options={}){
 const registry=registryOf(engine),slot=registry.resolve(id),kind=registry.kindOf(id)??options.kind??'';
 const ctx=contextFor(engine,document,subject,{...options,kind});
 let base=options.base,baseline=[];
 if(base===undefined&&slot.baselines){baseline=selectDerivedBaseline(engine,document,slot.baselines,subject,{...options,kind});base=fixedNumber(baseline.reduce((sum,r)=>checkedFixed(sum+fixedUnits(r.value)),0n));}
 if(base===undefined&&slot.id==='economy:value'){
  if(kind==='labor')base=wageQuote(options).daily;
  else base=optionalRead(()=>ctx.fact(subject,'basePrice'));
 }
 if(!Number.isFinite(base))reject('E-DERIVED-BASE','尚无足够知情或事实计算这个数值');
 let value=fixedUnits(base);const contributions=[];
 for(const row of registry.modifiers){
  if(registry.resolve(row.target).id!==slot.id)continue;
  const rowKind=registry.kindOf(row.target);if(rowKind&&rowKind!==kind)continue;
  ctx.sources.clear();
  const applied=optionalRead(()=>{
   // Explicit fact sources are gates as well as explanation metadata.
   for(const source of [...row.facts??[],...(typeof row.source==='string'&&row.source.startsWith('fact:')?[row.source]:[])]){
    if(source&&typeof source==='object'){ctx.fact(source.subject,source.key);continue;}
    const prefix='fact:';if(typeof source!=='string'||!source.startsWith(prefix))reject('E-DERIVED-SOURCE','修正来源须为事实键');
    const at=source.lastIndexOf(':');ctx.fact(source.slice(prefix.length,at),source.slice(at+1));
   }
   if(row.when===false||row.whenRX&&!evalExpr(row.whenRX,ctx))return null;
   return row.valueRX?evalExpr(row.valueRX,ctx):row.value;
  });
  if(applied===undefined||applied===null)continue;
  if(!Number.isFinite(applied)||row.bounds&&!inside(applied,row.bounds))reject('E-DERIVED-BOUNDS',`修正项 ${row.id} 的事实结果超出声明幅度`);
  contributions.push({id:row.id,pack:row.pack,source:row.source??row.id,stage:row.stage,value:applied,facts:[...ctx.sources].sort(),exclusiveGroup:row.exclusiveGroup,priority:row.priority??0});
 }
 const groups=new Map();
 for(const row of contributions.filter(r=>r.exclusiveGroup)){
  const old=groups.get(row.exclusiveGroup);if(!old||row.priority>old.priority||row.priority===old.priority&&row.value>old.value)groups.set(row.exclusiveGroup,row);
 }
 const active=contributions.filter(r=>!r.exclusiveGroup||groups.get(r.exclusiveGroup)===r);
 for(const stage of STAGES.slice(0,-1))for(const row of active.filter(r=>r.stage===stage)){
  const before=value,n=fixedUnits(row.value);
  value=stage==='add'?checkedFixed(value+n):stage==='mul'?fixedMultiply(value,n):stage==='max'?(value>n?value:n):(value<n?value:n);
  row.before=fixedNumber(before);row.after=fixedNumber(value);
 }
 if(slot.paceable){const pace=options.pace??1;if(!Number.isFinite(pace)||pace<=0)reject('E-DERIVED-PACE','节奏系数必须为正数');value=fixedMultiply(value,fixedUnits(pace));}
 const bounds=slot.kindBounds?.[kind]??slot.bounds;
 const limits=bounds.map(n=>slot.relative?fixedMultiply(fixedUnits(base),fixedUnits(n)):fixedUnits(n)).sort((a,b)=>a<b?-1:a>b?1:0);
 const unclamped=value;
 if(slot.stages.includes('clamp'))value=value<limits[0]?limits[0]:value>limits[1]?limits[1]:value;
 return {id,slot:slot.id,kind,base,value:fixedNumber(value),baseline,contributions:STAGES.flatMap(stage=>active.filter(r=>r.stage===stage)),clamp:{before:fixedNumber(unclamped),bounds:limits.map(fixedNumber),after:fixedNumber(value)}};
}
export const derived=(engine,document,id,subject,options={})=>explainDerived(engine,document,id,subject,options).value;
