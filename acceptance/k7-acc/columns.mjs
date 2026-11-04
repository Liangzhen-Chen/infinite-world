// 矩阵的列：适用于主人的原语 ×（与持有物相关的持有种类、义务种类），再加日常动词别名。
import {ontology,propertyHoldingKinds} from './rows.mjs';
const P=new Map(ontology.primitives.map(p=>[p.id,p]));
const T=new Map(ontology.templates.map(t=>[t.id,t]));
const tl=id=>T.get(id)?.label??id;
// 卡里点名的、适用于主人的原语（全部须在 primitives.json 里存在）。
export const OWNER_PRIMITIVES=['destroy','transfer','vital','fact.set','create','move','status','transition'].filter(id=>P.has(id));
const HOLDING_OPS=['holding.open','holding.close','holding.transfer','holding.rescale'].filter(id=>P.has(id));
const OBLIGATION_OPS=['obligation.create','obligation.settle','obligation.cancel'].filter(id=>P.has(id));
// 与持有物相关的义务种类：债权人消失时转入遗产（onCreditorGone=estate），即这笔义务本身是债权人的财产。
export const propertyObligationKinds=ontology.obligations.filter(o=>o.onCreditorGone==='estate');
const animal=row=>['creature','pet','herd'].includes(row.id);
const writable=P.get('fact.set')?.writable??{};
// —— 不适用的世界内理由：只从本体字段与设计稿已定规律推出 ——
function naPrimitive(op,row){
  if(op==='vital'&&!animal(row))return `${row.label}不是动物，没有可伤的生命（vital 作用于生灵）`;
  if(op==='destroy'&&animal(row))return `活体的消灭走致死 vital，不是 destroy（设计稿 4.1 保留"Living bodies require vital effects"）`;
  if(op==='fact.set'&&!writable[row.kind])return `${row.label}没有可改写的事实字段（primitives fact.set.writable 只有 ${Object.keys(writable).join('、')}）`;
  if(op==='move'&&row.template==='place')return `${row.label}本身就是地点，不能被搬走`;
  if(op==='move'&&T.get(row.template)?.located===false)return `${row.label}是无形的权利，没有位置（entity-templates located:false）`;
  return null;
}
function naHolding(op,kind,row){
  if(!kind.subjectKinds.includes(row.template))return `「${kind.label}」的标的只能是${kind.subjectKinds.map(tl).join('、')}，不能是${tl(row.template)}`;
  if(op==='holding.rescale'&&kind.sum===undefined)return `「${kind.label}」不是份额型持有（没有份额之和）`;
  return null;
}
export const COLUMNS=[];
for(const op of OWNER_PRIMITIVES)COLUMNS.push({id:op,label:op,family:'primitive',op,na:row=>naPrimitive(op,row)});
for(const op of HOLDING_OPS)for(const k of propertyHoldingKinds)COLUMNS.push({id:`${op}:${k.id}`,label:`${op}(${k.label})`,family:'holding',op,kind:k.id,na:row=>naHolding(op,k,row)});
for(const op of OBLIGATION_OPS)for(const k of propertyObligationKinds)COLUMNS.push({id:`${op}:${k.id}`,label:`${op}(${k.label})`,family:'obligation',op,kind:k.id,na:()=>null});
// —— 日常动词别名：每个写明映射到哪个原语或持有/义务种类；registered 为动作目录里对应的登记动作（若有） ——
const H=new Map(ontology.holdings.map(h=>[h.id,h]));
const subjectOf=k=>row=>H.get(k).subjectKinds.includes(row.template)?null:`「${H.get(k).label}」的标的只能是${H.get(k).subjectKinds.map(tl).join('、')}`;
const only=(ids,why)=>row=>ids.includes(row.id)?null:why(row);
export const ALIASES=[
 {id:'宰杀',maps:'vital(致死)；种群先个体化',registered:'core:combat',na:only(['creature','pet','herd'],r=>`不能宰杀${r.label}：它不是活的动物`)},
 {id:'卖',maps:'transfer(标的→买方)+transfer(钱→卖方)；无账户者 holding.transfer(所有)',registered:'core:trade.sell_to',na:()=>null},
 {id:'送',maps:'transfer(标的→受赠人)；无账户者 holding.transfer(所有)',registered:'documents:give(仅文书)',na:()=>null},
 {id:'丢弃',maps:'holding.close(所有, reason=abandoned)；可搬之物 move 到地上',registered:null,na:()=>null},
 {id:'毁坏',maps:'destroy',registered:null,na:row=>naPrimitive('destroy',row)??(row.template==='place'?`${row.label}不会被毁灭，只能被糟蹋（改 fact）`:row.template==='instrument'?`${row.label}是无形权利，不能被物理毁坏（可免除，见 open:waive_debt）`:null)},
 {id:'改装',maps:'fact.set(condition)；或 create(新模板)+destroy(原物)',registered:null,na:row=>animal(row)||row.id==='corpse'?'活物或尸体不能改装':row.template==='instrument'||row.template==='collective'?`${row.label}是权利，不能改装`:null},
 {id:'繁育',maps:'create(kind:creature, 亲本)；src:birth',registered:null,na:only(['creature','pet','herd'],r=>`${r.label}不会繁殖`)},
 {id:'挤奶剪毛',maps:'transfer(src:husbandry→行囊)',registered:null,na:only(['creature','pet','herd'],r=>`${r.label}不产奶毛`)},
 {id:'放生',maps:'holding.close(所有/驯服)',registered:'core:pet.release',na:only(['creature','pet','herd'],r=>`${r.label}不是活物，谈不上放生`)},
 {id:'分群',maps:'transfer(种群账户→sink:individuated)+create(creature)；两群则 holding.rescale',registered:null,na:only(['herd'],r=>`${r.label}不是成群的，没法分群`)},
 {id:'个体化',maps:'transfer(种群账户→sink:individuated,n)+create(n 个 creature)+holding.open(所有)',registered:null,na:only(['herd'],r=>`${r.label}不是种群，无须个体化`)},
 {id:'合群',maps:'transition(gone, aggregated)+transfer(src:aggregated→种群账户)',registered:null,na:only(['creature','pet','herd'],r=>`${r.label}不是动物，不能并入畜群`)},
 {id:'拆解',maps:'destroy+create(部件/残骸)',registered:null,na:row=>animal(row)?'活物要先宰杀再取材，不能拆解':['land','crop','claim','share','permit','coin','mark'].includes(row.id)?`${row.label}没有可拆的部件`:null},
 {id:'修理',maps:'fact.set(condition↑)',registered:'core:craft.repair',na:row=>writable[row.kind]?null:`${row.label}没有可修的完好度（fact.set.writable）`},
 {id:'种植',maps:'create(作物批) 于土地',registered:'core:farm.private_sow',na:only(['land','crop'],r=>`只能在土地上种植，不能"种"${r.label}`)},
 {id:'采收',maps:'transition(作物→收获)+transfer(src:harvest→行囊)；尸体为取材',registered:'core:farm.private_harvest / core:wildlife.gather',na:only(['crop','tree','corpse','herd'],r=>`${r.label}没有可采收的产出`)},
 {id:'砍伐',maps:'destroy(林木)+transfer(src:harvest 木材→行囊)',registered:'core:site.woodcut',na:only(['tree'],r=>`只有树木能砍伐，${r.label}不能`)},
 {id:'出租',maps:'holding.open(租赁)+obligation.create(租金)',registered:'core:trade.rent_out',na:subjectOf('leases')},
 {id:'抵押',maps:'holding.open(质押)+obligation.create(借贷)',registered:'core:trade.borrow',na:subjectOf('pledged')},
 {id:'典当',maps:'holding.open(质押)+obligation.create(借贷/pawn)',registered:'core:trade.pawn',na:subjectOf('pledged')},
 {id:'遗赠',maps:'owns 的 handover.gone=estate；生前指定承接人＝holding.transfer(所有, 条件:身故)',registered:null,na:()=>null},
 {id:'换物',maps:'transfer(标的→对方)+transfer(对方物→自己)',registered:null,na:()=>null},
 {id:'抵债',maps:'transfer(标的→债权人)+obligation.settle',registered:null,na:()=>null},
];
for(const a of ALIASES)COLUMNS.push({id:`alias:${a.id}`,label:a.id,family:'alias',alias:a,na:a.na});
