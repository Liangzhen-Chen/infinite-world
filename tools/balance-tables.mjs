// S1 数值参数表（数值方案 §2）：加载 world/rules/tables/balance/*.json，校验，并提供包覆盖的界内改值。
// 三区：params（标量或复合参数）、rows（领域行，带 key）、curves（曲线与饱和）。每个条目带来源类别 basis
// （hard 硬设定 / play 玩法决定 / derived 可推算 / calibrate 待仿真标定）、出处 source 与上下界 bounds。
// 本模块只读数据、不改任何结算行为；消费者（BalSim、指标库、将来的结算规则）经 loadBalanceTables 取表。
//
// 用法：node tools/balance-tables.mjs [--json]   校验并输出各表条目数，有错误则退出码 1。
import fs from 'node:fs';
import path from 'node:path';
import Ajv from 'ajv';
import {digest} from '../server-plugin/storage.mjs';

const ROOT=path.resolve(import.meta.dirname,'..');
export const BALANCE_DIR='rules/tables/balance';
// 数值方案 §2.1 的 22 个文件；world 带该目录时必须齐全，多出的文件报错。
export const TABLE_NAMES=Object.freeze(['progression','learning','attributes','combat','yields','economy','credit','tax','loot','crafting','ecology',
 'population','body','action-costs','event-weights','social','health','transport','law','magic','pace','targets']);
export const BASIS_LABELS=Object.freeze({hard:'硬设定',play:'玩法决定',derived:'可推算',calibrate:'待仿真标定'});
export const BASES=Object.freeze(Object.keys(BASIS_LABELS));

const RESERVED=new Set(['key','id','value','basis','source','note','bounds','closed','closedFields','playDecision','decisionRef','calibration','from','formula','output','tolerance','unit']);
const PARAM_KEYS=new Set(['id','value','basis','source','note','bounds','closed','closedFields','playDecision','decisionRef','calibration','from','formula','output','tolerance','unit']);
const CURVE_KEYS=new Set(['id','points','interp','saturation','bounds','basis','source','note','closed','closedFields','playDecision','decisionRef','calibration','from','formula','output','tolerance','unit']);

// ---- 可推算行的重算公式（数值方案 §1.1）--------------------------------------
// inputs 是 from 引用的上游参数值（按 from 顺序，非数值引用跳过），row 为所在行。
export const DERIVED_FORMULAS=Object.freeze({
 // 日经验参照 dailyXpRef(L) = c × L^a 的系数：每级所需经验 L⁴/10 ÷ 每级所需全职日 dH/dL = H20·a/20^a·L^(a−1)
 xpDailyRefCoef:({inputs:[H20,a]})=>20**a/(10*H20*a),
 // 到达等级 L 的全职日数 H(L) = H20 × (L/20)^a
 levelTimeDays:({inputs:[H20,a],row})=>H20*(row.startLevel/20)**a,
 // 与上游同值的派生（例如日经验参照的指数就是成长曲线指数）
 identity:({inputs:[x]})=>x,
});

const ajv=new Ajv({allErrors:true,strict:false});
let tableValidator=null,targetValidator=null;
const schemaOf=name=>JSON.parse(fs.readFileSync(path.join(ROOT,'schemas',name),'utf8'));
const tableCheck=()=>tableValidator??=ajv.compile(schemaOf('balance-table.schema.json'));
const targetCheck=()=>targetValidator??=ajv.compile(schemaOf('balance-targets.schema.json'));

const isNum=v=>typeof v==='number'&&Number.isFinite(v);
const clone=v=>structuredClone(v);

// ---- 路径工具：叶子路径 "perHour.work" / "tierFactor.3"；界键可用 * 通配一段 ---------------
function numericLeaves(value,prefix=''){
 if(isNum(value))return [[prefix,value]];
 if(Array.isArray(value))return value.flatMap((v,i)=>numericLeaves(v,prefix?`${prefix}.${i}`:String(i)));
 if(value&&typeof value==='object')return Object.entries(value).flatMap(([k,v])=>numericLeaves(v,prefix?`${prefix}.${k}`:k));
 return [];
}
function patternMatches(pattern,leaf){
 const p=pattern.split('.'),l=leaf.split('.');
 return p.length===l.length&&p.every((seg,i)=>seg==='*'||seg===l[i]);
}
const pathGet=(value,leaf)=>leaf.split('.').reduce((v,k)=>v?.[k],value);
function pathSet(value,leaf,next){
 const parts=leaf.split('.');let cur=value;
 for(const k of parts.slice(0,-1))cur=cur[k];
 cur[parts.at(-1)]=next;
}

// ---- 单个条目：界内、来源类别、可推算 -------------------------------------------
// fields：条目里承载数值的部分（params 是 {'':value}，rows 是除保留字段外的各字段，curves 不走这里）。
function entryErrors(entry,where,ctx,{fields,scalarBounds}){
 const errors=[],fail=msg=>errors.push(`${where}: ${msg}`);
 const {basis}=entry;
 if(basis==='play'&&entry.playDecision!==true)fail('basis=play 的条目必须 playDecision: true');
 if(entry.playDecision===true&&!entry.decisionRef)fail('playDecision 条目缺决定记录 decisionRef（改值前须在 docs/待用户确认.md 或 docs/决策.md 登记用户决定）');
 if(basis==='hard'&&entry.closed!==true)fail('basis=hard 的条目必须 closed: true（包不能改值）');
 if(basis==='hard'&&entry.calibration!=='fixed')fail('basis=hard 的条目 calibration 必须为 fixed');
 if(basis==='derived'&&entry.calibration!=='derived')fail('basis=derived 的条目 calibration 必须为 derived');
 if(basis==='calibrate'&&!['pending','calibrated'].includes(entry.calibration))fail('basis=calibrate 的条目 calibration 只能是 pending（待标定）或 calibrated');
 if(basis==='play'&&!['pending','calibrated','fixed'].includes(entry.calibration))fail('basis=play 的条目 calibration 只能是 pending、calibrated 或 fixed');
 if(basis==='derived'){
  if(!entry.from?.length)fail('basis=derived 的条目必须带 from（上游 id；非本表参数的出处写 doc:…）');
  for(const ref of entry.from??[])if(!ref.startsWith('doc:')&&!ctx.refs.has(ref))fail(`from 引用不存在：${ref}`);
 }else if(entry.from)fail('只有 basis=derived 的条目才带 from');
 if(entry.formula&&basis!=='derived')fail('只有 basis=derived 的条目才带 formula');
 if(entry.formula&&!DERIVED_FORMULAS[entry.formula])fail(`未登记的重算公式：${entry.formula}`);
 // 界：必填，除非 closed。界键必须对应到条目里真实的数值叶子。
 const leaves=fields.flatMap(([name,value])=>numericLeaves(value,name).map(([leafPath,n])=>[leafPath,n]));
 for(const [leafPath,n] of leaves)if(!Number.isFinite(n))fail(`${leafPath} 不是有限数`);
 const closedPatterns=entry.closedFields??[];
 const bounds=scalarBounds?(entry.bounds?{'':entry.bounds}:{}):(entry.bounds??{});
 const boundKeys=Object.keys(bounds);
 for(const key of boundKeys){
  const b=bounds[key];
  if(!Array.isArray(b)||b.length!==2||!b.every(isNum)||b[0]>b[1]){fail(`bounds.${key} 不是 [下界, 上界]（下界 ≤ 上界）`);continue;}
  if(!leaves.some(([leaf])=>patternMatches(key,leaf)))fail(`bounds.${key} 对应不到任何数值字段`);
 }
 if(entry.closed===true)return errors;
 for(const [leafPath,n] of leaves){
  if(closedPatterns.some(p=>patternMatches(p,leafPath)))continue;
  const hits=boundKeys.filter(k=>patternMatches(k,leafPath)&&Array.isArray(bounds[k])&&bounds[k].length===2);
  if(!hits.length){fail(`${leafPath} 缺上下界（未 closed 的数值必须带 bounds，不改值的字段列入 closedFields）`);continue;}
  for(const k of hits){const [lo,hi]=bounds[k];if(n<lo||n>hi)fail(`${leafPath}=${n} 超出界 [${lo}, ${hi}]`);}
 }
 return errors;
}

function recompute(entry,where,ctx,rowOrNull){
 const errors=[];
 if(entry.basis!=='derived'||!entry.formula||!DERIVED_FORMULAS[entry.formula])return errors;
 const inputs=(entry.from??[]).filter(ref=>!ref.startsWith('doc:')).map(ref=>ctx.values.get(ref));
 if(inputs.some(v=>!isNum(v))){errors.push(`${where}: 重算公式 ${entry.formula} 的上游不是数值`);return errors;}
 const computed=DERIVED_FORMULAS[entry.formula]({inputs,row:rowOrNull});
 const actual=rowOrNull?rowOrNull[entry.output??'value']:entry.value;
 const tol=entry.tolerance??0.01;
 if(!isNum(actual)||Math.abs(computed-actual)>tol*Math.max(Math.abs(computed),1e-9))
  errors.push(`${where}: 可推算值 ${actual} 与重算结果 ${Number(computed.toPrecision(6))} 不一致（容差 ${tol}，公式 ${entry.formula}，上游 ${entry.from.join('、')}）`);
 return errors;
}

// ---- 曲线与饱和 --------------------------------------------------------------
function curveErrors(curve,where,ctx){
 const errors=[],fail=msg=>errors.push(`${where}: ${msg}`);
 const hasPoints=Array.isArray(curve.points),hasSat=curve.saturation!==undefined;
 if(hasPoints===hasSat)fail('曲线条目必须恰有 points 或 saturation 之一');
 errors.push(...entryErrors({...curve,bounds:{}},where,ctx,{fields:[],scalarBounds:false}));
 if(hasPoints){
  const xs=curve.points.map(p=>p[0]);
  if(xs.some((x,i)=>i&&x<=xs[i-1]))fail('points 的 x 必须严格递增');
  if(curve.interp==='log'&&xs.some(x=>x<=0))fail('log 插值要求 x > 0');
  const y=curve.bounds.y;
  if(!y&&curve.closed!==true)fail('曲线必须带 bounds.y（或 closed: true）');
  if(y&&curve.closed!==true)for(const [x,v] of curve.points)if(v<y[0]||v>y[1])fail(`点 (${x}, ${v}) 的 y 超出界 [${y[0]}, ${y[1]}]`);
  if(y&&y[0]>y[1])fail('bounds.y 下界大于上界');
  const bx=curve.bounds.x;
  if(bx&&curve.closed!==true)for(const [x] of curve.points)if(x<bx[0]||x>bx[1])fail(`点的 x=${x} 超出界 [${bx[0]}, ${bx[1]}]`);
  for(const k of Object.keys(curve.bounds))if(!['x','y'].includes(k))fail(`bounds.${k} 不是 x 或 y`);
 }else if(hasSat){
  const s=curve.saturation,param=s.kind==='geometric'?'q':'n0';
  if(s[param]===undefined)fail(`saturation.kind=${s.kind} 需要 ${param}`);
  const b=curve.bounds[param];
  if(!b&&curve.closed!==true)fail(`饱和曲线必须带 bounds.${param}`);
  else if(b&&curve.closed!==true&&s[param]!==undefined&&(s[param]<b[0]||s[param]>b[1]))fail(`saturation.${param}=${s[param]} 超出界 [${b[0]}, ${b[1]}]`);
  for(const k of Object.keys(curve.bounds))if(k!==param)fail(`bounds.${k} 不适用于 ${s.kind} 饱和`);
 }
 return errors;
}

// ---- 目标表 --------------------------------------------------------------------
function targetErrors(doc,file){
 const errors=[],check=targetCheck();
 if(!check(doc))for(const e of check.errors)errors.push(`${file}: ${formatPath(e.instancePath,doc,'rows','metric')} ${e.message}${e.params?.additionalProperty?`：${e.params.additionalProperty}`:''}`);
 const seen=new Set();
 for(const row of doc.rows??[]){
  const where=`${file}: rows[${row.metric}]`;
  if(seen.has(row.metric))errors.push(`${where}: metric 重复`);seen.add(row.metric);
  const okBound=b=>Array.isArray(b)&&b.length===2&&b.every(x=>x===null||isNum(x))&&!(b[0]===null&&b[1]===null)&&!(b[0]!==null&&b[1]!==null&&b[0]>b[1]);
  if(row.kind==='range'){
   if(!okBound(row.target))errors.push(`${where}: kind=range 的 target 必须是 [下界, 上界]（至少一侧有界，下界 ≤ 上界）`);
   else if(row.hardFloor!==undefined&&row.target[0]!==null&&row.hardFloor>row.target[0])errors.push(`${where}: hardFloor 高于目标下界`);
  }else if(row.kind==='bands'){
   if(!row.bands?.length)errors.push(`${where}: kind=bands 必须带 bands`);
   const labels=new Set();
   for(const band of row.bands??[]){
    if(labels.has(band.label))errors.push(`${where}: bands[${band.label}] 标签重复`);labels.add(band.label);
    if(band.report===true){if(band.target!==undefined)errors.push(`${where}: bands[${band.label}] report 的分组不带 target`);}
    else if(!okBound(band.target))errors.push(`${where}: bands[${band.label}] 的 target 必须是 [下界, 上界]`);
   }
  }else if(row.kind==='derived'){
   if(!row.derivedFrom)errors.push(`${where}: kind=derived 必须带 derivedFrom`);
  }
  if(!['range','bands','derived'].includes(row.kind)&&row.target!==undefined&&row.target!==null)errors.push(`${where}: kind=${row.kind} 不带 target`);
  if(row.kind!=='bands'&&row.bands)errors.push(`${where}: 只有 kind=bands 才带 bands`);
  if(row.tolerance&&row.tolerance.kind!=='none'&&!isNum(row.tolerance.value))errors.push(`${where}: tolerance 缺 value`);
 }
 return errors;
}

function formatPath(instancePath,doc,area,keyField){
 return instancePath.split('/').slice(1).map((seg,i,all)=>{
  if(i===1&&/^\d+$/.test(seg)&&all[0]===area){const item=doc[area]?.[Number(seg)];return `[${item?.[keyField]??seg}]`;}
  return (i?'.':'')+seg;
 }).join('')||'(根)';
}

// ---- 全表校验 ------------------------------------------------------------------
// tables：{表名: 文档}。返回错误字符串数组（每条以“文件: 字段: 原因”开头）。
export function validateBalanceTables(tables,{requireAll=true}={}){
 const errors=[],file=name=>`${BALANCE_DIR}/${name}.json`;
 for(const name of Object.keys(tables))if(!TABLE_NAMES.includes(name))errors.push(`${file(name)}: 未登记的参数表（数值方案 §2.1 只有 ${TABLE_NAMES.length} 张）`);
 if(requireAll)for(const name of TABLE_NAMES)if(!tables[name])errors.push(`${file(name)}: 缺少参数表`);
 const check=tableCheck();
 // 第一遍：形状、id/key 唯一、收集上游引用。
 const refs=new Set(),values=new Map(),globalIds=new Map(),shapeOk=new Set();
 for(const [name,doc] of Object.entries(tables)){
  if(name==='targets')continue;
  if(!check(doc)){for(const e of check.errors)errors.push(`${file(name)}: ${formatPath(e.instancePath,doc,e.instancePath.startsWith('/params')?'params':e.instancePath.startsWith('/curves')?'curves':'rows',e.instancePath.startsWith('/rows')?'key':'id')} ${e.message}${e.params?.additionalProperty?`：${e.params.additionalProperty}`:''}`);continue;}
  shapeOk.add(name);
  if(doc.schema!==`balance/${name}@1`)errors.push(`${file(name)}: schema 应为 balance/${name}@1，实为 ${doc.schema}`);
  const local=new Set();
  for(const p of doc.params){
   if(local.has(p.id))errors.push(`${file(name)}: params[${p.id}] id 重复`);local.add(p.id);
   if(globalIds.has(p.id)&&globalIds.get(p.id)!==name)errors.push(`${file(name)}: params[${p.id}] 与 ${file(globalIds.get(p.id))} 的 id 冲突`);
   globalIds.set(p.id,name);refs.add(p.id);values.set(p.id,p.value);
   for(const k of Object.keys(p))if(!PARAM_KEYS.has(k))errors.push(`${file(name)}: params[${p.id}] 未知字段 ${k}`);
  }
  const keys=new Set();
  for(const r of doc.rows){
   if(keys.has(r.key))errors.push(`${file(name)}: rows[${r.key}] 主键重复（表行主键重复在加载期报冲突）`);keys.add(r.key);refs.add(`${name}/${r.key}`);
  }
  for(const c of doc.curves){
   if(local.has(c.id))errors.push(`${file(name)}: curves[${c.id}] id 与参数重复`);local.add(c.id);
   if(globalIds.has(c.id)&&globalIds.get(c.id)!==name)errors.push(`${file(name)}: curves[${c.id}] 与 ${file(globalIds.get(c.id))} 的 id 冲突`);
   globalIds.set(c.id,name);refs.add(c.id);
   for(const k of Object.keys(c))if(!CURVE_KEYS.has(k))errors.push(`${file(name)}: curves[${c.id}] 未知字段 ${k}`);
  }
 }
 // 第二遍：语义。
 const ctx={refs,values};
 for(const [name,doc] of Object.entries(tables)){
  if(name==='targets'){errors.push(...targetErrors(doc,file(name)));continue;}
  if(!shapeOk.has(name))continue;
  for(const p of doc.params){
   const where=`${file(name)}: params[${p.id}]`;
   const numeric=numericLeaves(p.value).length>0;
   if(!numeric&&p.closed!==true){errors.push(`${where}: 不含数值的参数必须 closed: true`);continue;}
   if(isNum(p.value)){
    if(p.closed===true){if(p.bounds!==undefined&&!(Array.isArray(p.bounds)&&p.value>=p.bounds[0]&&p.value<=p.bounds[1]))errors.push(`${where}: closed 条目的 value 不在其 bounds 内`);}
    else if(!Array.isArray(p.bounds)){errors.push(`${where}: 数值参数 bounds 必须是 [下界, 上界]`);continue;}
    errors.push(...entryErrors({...p,bounds:p.bounds},where,ctx,{fields:[['',p.value]],scalarBounds:true}));
   }else if(numeric){
    if(p.bounds!==undefined&&Array.isArray(p.bounds)){errors.push(`${where}: 复合参数的 bounds 必须是 {字段路径: [下界, 上界]}`);continue;}
    errors.push(...entryErrors(p,where,ctx,{fields:[['',p.value]],scalarBounds:false}));
   }else errors.push(...entryErrors({...p,bounds:undefined},where,ctx,{fields:[],scalarBounds:false}));
   errors.push(...recompute(p,where,ctx,null));
  }
  for(const r of doc.rows){
   const where=`${file(name)}: rows[${r.key}]`;
   const fields=Object.entries(r).filter(([k])=>!RESERVED.has(k));
   errors.push(...entryErrors(r,where,ctx,{fields,scalarBounds:false}));
   errors.push(...recompute(r,where,ctx,r));
  }
  for(const c of doc.curves)errors.push(...curveErrors(c,`${file(name)}: curves[${c.id}]`,ctx));
 }
 return errors;
}

// ---- 读盘 ----------------------------------------------------------------------
// 世界根（含 rules/tables/balance）下读全部参数表。目录不存在 = 该世界不带参数表（测试夹具）：返回空集。
export function loadBalanceTablesSync(worldRoot=path.join(ROOT,'world')){
 const dir=path.join(worldRoot,BALANCE_DIR);
 if(!fs.existsSync(dir))return {tables:{},errors:[],files:[],present:false};
 const tables={},errors=[],files=fs.readdirSync(dir).filter(f=>f.endsWith('.json')).sort();
 for(const f of files){
  const name=f.slice(0,-5);
  try{tables[name]=JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'));}
  catch(e){errors.push(`${BALANCE_DIR}/${f}: JSON 无法解析：${e.message}`);}
 }
 errors.push(...validateBalanceTables(Object.fromEntries(Object.entries(tables))));
 return {tables,errors,files:files.map(f=>`${BALANCE_DIR}/${f}`),present:true};
}
export async function loadBalanceTables(worldRoot){return loadBalanceTablesSync(worldRoot);}

// 校验失败即抛出，供 loadWorld 使用：世界带参数表时，表里有错误就不能加载。
export function requireBalanceTables(worldRoot){
 const loaded=loadBalanceTablesSync(worldRoot);
 if(loaded.errors.length)throw new Error(`数值参数表校验失败（${loaded.errors.length} 项）：\n${loaded.errors.slice(0,20).join('\n')}${loaded.errors.length>20?`\n……另 ${loaded.errors.length-20} 项`:''}`);
 return loaded.tables;
}

// ---- 查询 ----------------------------------------------------------------------
// id → {table, kind: 'param'|'curve', entry}；行用 `${table}/${key}`。
export function indexBalanceTables(tables){
 const index=new Map();
 for(const [table,doc] of Object.entries(tables)){
  for(const p of doc.params??[])index.set(p.id,{table,kind:'param',entry:p});
  for(const c of doc.curves??[])index.set(c.id,{table,kind:'curve',entry:c});
  for(const r of doc.rows??[])index.set(`${table}/${r.key}`,{table,kind:'row',entry:r});
 }
 return index;
}
export function balanceValue(tables,id,fallback=undefined){
 const hit=indexBalanceTables(tables).get(id);
 return hit?.kind==='param'?hit.entry.value:fallback;
}
// 参数向量哈希：BalSim 报告的“参数向量哈希”（数值平衡调研 §3.1 第 5 条）。只含取值，不含说明文字。
export function parameterHash(tables){
 const vector={};
 for(const [id,hit] of [...indexBalanceTables(tables)].sort(([a],[b])=>a<b?-1:1)){
  const e=hit.entry;vector[id]=hit.kind==='param'?e.value:hit.kind==='curve'?(e.points??e.saturation):Object.fromEntries(Object.entries(e).filter(([k])=>!RESERVED.has(k)));
 }
 return digest(vector);
}
export function summarizeBalanceTables(tables){
 return Object.fromEntries(Object.entries(tables).map(([name,doc])=>{
  const count={params:doc.params.length,rows:doc.rows.length,curves:doc.curves.length,byBasis:{}};
  for(const e of [...doc.params,...doc.rows,...doc.curves]){const k=e.grade?`${e.grade}级目标`:e.basis;if(k)count.byBasis[k]=(count.byBasis[k]??0)+1;}
  return [name,count];
 }));
}

// ---- 可推算值重算 ----------------------------------------------------------------
// 上游（例如 xp.time.H20）被改后，带 formula 的可推算条目按公式刷新取值。就地改 tables，返回被改动的条目数。
export function recomputeDerived(tables){
 let changed=0;
 for(let pass=0;pass<5;pass++){
  const values=new Map(Object.values(tables).flatMap(doc=>(doc.params??[]).map(p=>[p.id,p.value])));
  let moved=false;
  for(const doc of Object.values(tables))for(const entry of [...(doc.params??[]),...(doc.rows??[])]){
   if(entry.basis!=='derived'||!entry.formula||!DERIVED_FORMULAS[entry.formula])continue;
   const inputs=(entry.from??[]).filter(ref=>!ref.startsWith('doc:')).map(ref=>values.get(ref));
   if(inputs.some(v=>!isNum(v)))continue;
   const computed=DERIVED_FORMULAS[entry.formula]({inputs,row:entry.key!==undefined?entry:null});
   const field=entry.key!==undefined?(entry.output??'value'):'value';
   if(entry[field]!==computed){entry[field]=computed;moved=true;changed++;}
  }
  if(!moved)break;
 }
 return changed;
}

// ---- 包覆盖：只能在界内改值 ------------------------------------------------------
// overrides：[{table, id|key, field?, value, decisionRef?, pack?}]。
//   参数：{table, id, value}（复合参数加 field 路径）；行：{table, key, field, value}。
// 包不能改 bounds、不能改 closed 条目、不能直接改 derived 条目（改上游）；playDecision 条目须带 decisionRef。
// 返回 {tables, errors, applied}：错误时 tables 为原表的副本（未改动该项），整套重新校验以保证可推算行仍一致。
export function applyBalanceOverrides(tables,overrides,{pack='(未命名包)'}={}){
 const out=clone(tables),errors=[],applied=[];
 for(const o of overrides){
  const label=`包 ${o.pack??pack}: ${BALANCE_DIR}/${o.table}.json: ${o.id?`params[${o.id}]`:`rows[${o.key}]`}${o.field?`.${o.field}`:''}`;
  const doc=out[o.table];
  if(!doc){errors.push(`${label}: 没有参数表 ${o.table}`);continue;}
  if(o.bounds!==undefined||o.closed!==undefined||o.basis!==undefined){errors.push(`${label}: 包只能在上下界内改值，不能改 bounds、closed 或 basis`);continue;}
  if(o.table==='targets'){errors.push(`${label}: 目标表不接受包覆盖（改目标先登记理由）`);continue;}
  const entry=o.id?doc.params.find(p=>p.id===o.id):doc.rows.find(r=>r.key===o.key);
  if(!entry){errors.push(`${label}: 找不到该条目`);continue;}
  if(entry.closed===true){errors.push(`${label}: 条目是 closed（${BASIS_LABELS[entry.basis]}），包不能改值`);continue;}
  if(entry.basis==='derived'){errors.push(`${label}: 可推算条目由上游重算，包不能直接改（改 ${entry.from.join('、')}）`);continue;}
  if(entry.playDecision===true&&!o.decisionRef){errors.push(`${label}: 玩法决定条目改值必须带决定记录 decisionRef`);continue;}
  if(!isNum(o.value)){errors.push(`${label}: 覆盖值必须是数`);continue;}
  const target=o.id?entry.value:entry;
  const leaf=o.id?(o.field??''):o.field;
  if(!o.id&&!o.field){errors.push(`${label}: 行覆盖需指明 field`);continue;}
  if(leaf===undefined||(leaf===''&&!isNum(entry.value))||(leaf!==''&&!isNum(pathGet(target,leaf)))){errors.push(`${label}: 没有这个数值字段`);continue;}
  if((entry.closedFields??[]).some(p=>patternMatches(p,leaf))){errors.push(`${label}: 该字段是 closedFields，包不能改值`);continue;}
  const bounds=o.id&&leaf===''?{'':entry.bounds}:(entry.bounds??{});
  const hits=Object.keys(bounds).filter(k=>patternMatches(k,leaf)&&Array.isArray(bounds[k]));
  if(!hits.length){errors.push(`${label}: 该字段没有上下界，不可覆盖`);continue;}
  const bad=hits.find(k=>o.value<bounds[k][0]||o.value>bounds[k][1]);
  if(bad!==undefined){errors.push(`${label}: ${o.value} 超出界 [${bounds[bad][0]}, ${bounds[bad][1]}]（包只能改界内值）`);continue;}
  if(o.id&&leaf==='')entry.value=o.value;else pathSet(target,leaf,o.value);
  applied.push({table:o.table,id:o.id??o.key,field:o.field??null,value:o.value,pack:o.pack??pack});
 }
 if(!errors.length){
  // 上游改值后，可推算条目按公式刷新，再整体重新校验（界内、重复、引用）。
  recomputeDerived(out);
  errors.push(...validateBalanceTables(out,{requireAll:false}).map(e=>`覆盖后重新校验：${e}`));
 }
 return {tables:errors.length?clone(tables):out,errors,applied};
}

if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename)){
 const loaded=loadBalanceTablesSync();
 const summary=loaded.present?summarizeBalanceTables(loaded.tables):{};
 if(process.argv.includes('--json'))console.log(JSON.stringify({files:loaded.files.length,errors:loaded.errors,summary,hash:loaded.errors.length?null:parameterHash(loaded.tables)},null,2));
 else{
  for(const [name,s] of Object.entries(summary))console.log(`${name.padEnd(14)} 参数 ${String(s.params).padStart(3)}  行 ${String(s.rows).padStart(3)}  曲线 ${String(s.curves).padStart(2)}  ${Object.entries(s.byBasis).map(([b,n])=>`${BASIS_LABELS[b]??b}${n}`).join(' ')}`);
  for(const e of loaded.errors)console.error(e);
  console.log(loaded.errors.length?`参数表校验失败：${loaded.errors.length} 项`:`参数表校验通过：${loaded.files.length} 个文件`);
 }
 if(loaded.errors.length)process.exitCode=1;
}
