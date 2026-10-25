// S2a 持有种类注册表（L1，01 §1.3、02 I5、附录 A §A.4 / §A.15）：读 world/ontology/holdings.json，
// 逐种校验注册形状（缺必填项即启动失败），登记进 L0 存储（holdings.mjs）；另给出实体模板解析与
// 职能有效 effective()、受限 confined()、钉住侧 pinnedSides() 三个派生的接口（读仍走旧字段的阶段，
// 它们只由测试与后续阶段的读者使用）。包的持有种类走同一 registerHoldingKinds（12 §12.2）。
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {registerHoldingKind,registerHoldingReasons,holdingKind,holdingKindIds,aliveHoldings,holdingRow,entityRow} from './holdings.mjs';

const FILE=fileURLToPath(new URL('../world/ontology/holdings.json',import.meta.url));
const TEMPLATES_FILE=fileURLToPath(new URL('../world/ontology/entity-templates.json',import.meta.url));
export const HOLDER_TEMPLATES=['vacate','stay','succeed','estate','close','revert','retain_disputed','suspend'];
export const SUBJECT_TEMPLATES=['close','stay','estate','reparent'];
export const PIN_SIDES=['none','holder','subject','both'];
export const CONTESTS=['lottery','price','arrival','rank'];
export const POLICIES=['forbid','auto_vacate','needs_permission','flag'];
export const HOOK_ON=/^(holder\.gone|self\.closed|holder\.holdingClosed|subject\.gone|subject\.transferred|event)(\(.*\))?$/;
const PSEUDO_TEMPLATES=['holding','account'];// frozen 的标的是持有或账户，不是实体
const PRIMITIVE_OPS=['transfer','holding.open','holding.close','holding.transfer','holding.rescale','obligation.create','obligation.settle','obligation.cancel','fact.set','vital','status','move','create','destroy','emit','schedule','transition','learn','time'];

// I5 注册表完整性：返回错误列表（空即通过）。entries = 全部待登记种类（core + 包）。
export function validateHoldingKinds(entries,{templates}={}){
    templates??=new Set(JSON.parse(fs.readFileSync(TEMPLATES_FILE,'utf8')).entries.map(t=>t.id));
    const errors=[],ids=new Set(entries.map(e=>e.id));
    const err=(e,field,message)=>errors.push({kind:e.id,field,message});
    for(const e of entries){
        for(const side of ['holderKinds','subjectKinds']){
            if(!Array.isArray(e[side])||!e[side].length)err(e,side,'缺两端模板');
            else for(const t of e[side])if(!templates.has(t)&&!(side==='subjectKinds'&&PSEUDO_TEMPLATES.includes(t)))err(e,side,`未知实体模板 ${t}`);
        }
        if(typeof e.exclusive!=='boolean')err(e,'exclusive','须声明 exclusive');
        if(e.transferable!==undefined&&typeof e.transferable!=='boolean')err(e,'transferable','Must be a boolean');
        for(const k of ['gone','vacated','defected']){
            if(!e.handover||!(k in e.handover))err(e,`handover.${k}`,'缺必填交接项');
            else if(e.handover[k]!==null&&!HOLDER_TEMPLATES.includes(e.handover[k]))err(e,`handover.${k}`,`未知钩子模板 ${e.handover[k]}`);
        }
        // I6：持有人 gone 时不得 stay；I9：governs 必 succeed。
        if(e.handover?.gone==='stay')err(e,'handover.gone','持有人消失时不得取 stay（I6）');
        if(e.handover?.gone==null&&e.handover&&'gone' in e.handover)err(e,'handover.gone','持有人消失的交接不能为空');
        if(e.id==='governs'&&e.handover?.gone!=='succeed')err(e,'handover.gone','governs 的持有人消失必须 succeed（I9）');
        if(!('onSubjectGone' in e)||!SUBJECT_TEMPLATES.includes(e.onSubjectGone))err(e,'onSubjectGone',`缺或未知标的侧模板 ${e.onSubjectGone}`);
        if(!PIN_SIDES.includes(e.pins))err(e,'pins',`未知钉住侧 ${e.pins}`);
        if(e.contest!==null&&!CONTESTS.includes(e.contest))err(e,'contest',`未知争夺规则 ${e.contest}`);
        if(typeof e.concluded!=='boolean')err(e,'concluded','须声明 concluded');
        if(typeof e.functional!=='boolean')err(e,'functional','须声明 functional');
        if(!e.derives||typeof e.derives!=='object')err(e,'derives','须声明 derives');
        if(e.sum!==undefined&&!(e.sum>0))err(e,'sum','份额之和须为正数');
        if(e.sum!==undefined&&e.exclusive)err(e,'sum','份额种类不能同时 exclusive');
        if(e.parent&&!ids.has(e.parent))err(e,'parent',`上位种类未登记 ${e.parent}`);
        const rules=[...e.incompatibleWith??[],...Object.values(e.variants??{}).flatMap(v=>v.incompatibleWith??[])];
        for(const r of rules){
            if(!ids.has(r.kind))err(e,'incompatibleWith',`不相容种类未登记 ${r.kind}`);
            else if(r.variant&&!entries.find(x=>x.id===r.kind)?.variants?.[r.variant])err(e,'incompatibleWith',`不相容变体未登记 ${r.kind}:${r.variant}`);
            if(!POLICIES.includes(r.policy))err(e,'incompatibleWith',`未知策略 ${r.policy}`);
            if(r.policy==='needs_permission'&&!r.permit)err(e,'incompatibleWith','needs_permission 须写明许可 permit');
            if(r.subjectFilter)err(e,'incompatibleWith','subjectFilter 是 RX 表达式，求值器到 A3 才有（S2a 不接受）');
        }
        for(const [name,v] of Object.entries(e.variants??{})){
            if(!/^[a-z_]+$/.test(name))err(e,`variants.${name}`,'变体名无效');
            if(v.pins&&!PIN_SIDES.includes(v.pins))err(e,`variants.${name}.pins`,`未知钉住侧 ${v.pins}`);
            if(v.contest!=null&&!CONTESTS.includes(v.contest))err(e,`variants.${name}.contest`,`未知争夺规则 ${v.contest}`);
        }
        for(const [i,hk] of (e.hooks??[]).entries()){
            if(!HOOK_ON.test(hk.on??''))err(e,`hooks[${i}].on`,`钩子触发点不在六种形式内：${hk.on}`);
            if(typeof hk.do==='string'){if(![...HOLDER_TEMPLATES,'reparent'].includes(hk.do))err(e,`hooks[${i}].do`,`未知钩子模板 ${hk.do}`);}
            else if(!Array.isArray(hk.do)||!hk.do.length||hk.do.some(p=>!PRIMITIVE_OPS.includes(p?.op)))err(e,`hooks[${i}].do`,'钩子的 do 须为模板或原语列表');
        }
        if(e.capacity&&e.exclusive)err(e,'capacity','容量约束只用于非互斥种类');
    }
    return errors;
}

let registry=null;
// 加载 core 注册表（与可选的包种类）；校验失败即抛出（启动失败，I5）。
export function registerHoldingKinds(extra=[]){
    const doc=JSON.parse(fs.readFileSync(FILE,'utf8')),entries=[...doc.entries,...extra];
    const errors=validateHoldingKinds(entries);
    if(errors.length)throw Error(`持有注册表不完整（I5）：${errors.map(e=>`${e.kind}.${e.field} ${e.message}`).join('；')}`);
    for(const e of entries)registerHoldingKind(e);
    registerHoldingReasons(doc.reasons.map(r=>r.id));
    registry={version:doc.version,ids:entries.map(e=>e.id)};
    return registry;
}
registerHoldingKinds();

// ---- 派生接口（附录 A §A.15.18 / §A.15.24 / §A.15.25） ------------------------------------
// confined(x)：x 是一条存活 guest_of{detained} 的持有人。
export const confined=(d,x)=>aliveHoldings(d,{kind:'guest_of',holder:x}).some(r=>r.variant==='detained');
// effective(h) = alive(holder) ∧ ¬suspend ∧ ¬impaired(holder) ∧ (¬confined(holder) ∨ h ∈ regime.keepsEffective)。
// alive / impaired 由调用方给出（旧字段：人物 status）；regime 读 guest_of 条款 terms.regime.keepsEffective。
export function effective(d,id,{alive=()=>true,impaired=()=>false}={}){
    const h=holdingRow(d,id);if(!h||h.until!==undefined)return false;
    if((d.peek?d.peek('holdings','protocol','entities',h.holder):d.get('holdings','protocol','entities',h.holder))?.gone)return false;
    if(!holdingKind(h.kind)?.functional)return alive(h.holder);
    if(!alive(h.holder)||h.terms?.suspended||impaired(h.holder))return false;
    const custody=aliveHoldings(d,{kind:'guest_of',holder:h.holder}).filter(r=>r.variant==='detained');
    return !custody.length||custody.every(r=>(r.terms?.regime?.keepsEffective??[]).some(k=>k===h.kind||k===h.id));
}
// 钉住（§A.15.18 (b)）：实体处在某条声明 pins 的存活持有的被钉侧。
export function pinnedBy(d,x){
    return [...aliveHoldings(d,{holder:x}),...aliveHoldings(d).filter(r=>r.subject===x&&r.holder!==x)].filter(r=>{
        const k=holdingKind(r.kind),pins=k?.variants?.[r.variant]?.pins??k?.pins??'none';
        const hostPerson=r.kind==='guest_of'&&r.variant==='detained'&&String(r.subject).startsWith('npc_');
        return (r.holder===x&&(pins==='holder'||pins==='both'))||(r.subject===x&&(pins==='subject'||pins==='both'||hostPerson));
    }).map(r=>r.id);
}
export const holdingKinds=()=>holdingKindIds().map(holdingKind);
export {entityRow};
