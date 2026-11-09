// K4：物品用途与可食性按类别和属性派生，不按 id。
// 类别规则在 world/meta/item-use-tags.json 的 classes（标签 → 类别）；数值在 world/rules/tables/balance/crafting.json。
// 加载期（引擎构造）派生营养与生熟：营养 = 配方投入营养之和 ×（1 − 加工损耗）÷ 产出份数；
// 加工是否加热看配方是否烧掉燃料类材料；需加热的生料（谷、肉、鱼、蛋）未经加热不能当一餐。
import useTags from '../world/meta/item-use-tags.json' with {type:'json'};
import craftingBalance from '../world/rules/tables/balance/crafting.json' with {type:'json'};

const CLASSES=useTags.classes;
const SUB=Array.isArray(useTags.substitutable)?{classes:useTags.substitutable}:useTags.substitutable??{};
const param=(world,id)=>((world?.balance?.crafting??craftingBalance).params.find(p=>p.id===id)??craftingBalance.params.find(p=>p.id===id)).value;
export const craftingParam=(engine,id)=>param(engine?.world,id);

// 一件物品属于哪些类别：标签命中类别的 tags，且不带 exclude 里的标签；durable 另含"配方里当工具用的物品"。
const memo=new WeakMap();
function classTable(world){
 let t=memo.get(world);if(t)return t;
 const recipeTools=new Set((world.recipes??[]).flatMap(r=>r.tools??[]));
 t=new Map();
 for(const item of world.items??[]){
  const tags=new Set(item.tags??[]),out=[];
  for(const [cls,rule] of Object.entries(CLASSES)){
   if((rule.exclude??[]).some(x=>tags.has(x)))continue;
   if((rule.tags??[]).some(x=>tags.has(x))||rule.recipeTool&&recipeTools.has(item.id)||rule.nutrition&&item.nutrition)out.push(cls);
  }
  t.set(item.id,out);
 }
 memo.set(world,t);return t;
}
export function itemClasses(engine,item){return classTable(engine.world).get(item)??[];}
export function isItemClass(engine,item,cls){return itemClasses(engine,item).includes(cls);}
export function classItems(engine,cls){return [...classTable(engine.world)].filter(([,c])=>c.includes(cls)).map(([id])=>id).sort();}

// 卡 Q：手艺档位表（balance/crafting 的 workmanship:* 行，从低到高）。
export const craftingRows=engine=>(engine?.world?.balance?.crafting??craftingBalance).rows.filter(r=>r.key.startsWith('workmanship:'));
// 手艺档（仿制、粗陋、粗糙……杰作）的唯一查法（items.mjs 转出）。档序与 multiplier（乘耐久与战斗属性）只在规则表
// equipment.workmanship；price（报价）、attain（品质达成度）、loses（该档实例不再具备的用途类别）在 balance/crafting。
// 没有手艺档（非制作所得，null/undefined）的按标准件：倍率 1；写了档名却查不到的报错。
export function workmanshipTier(engine,name){
 if(name===null||name===undefined)return {name:null,rank:null,multiplier:1,price:1,attain:1,loses:[]};
 const order=engine.rules?.equipment?.workmanship??[],rank=order.findIndex(r=>r.name===name),row=craftingRows(engine).find(r=>r.name===name);
 if(rank<0)throw Error(`手艺档未登记：${name}`);
 return {name,rank,multiplier:order[rank].multiplier,price:row?.price??1,attain:row?.attain??1,loses:row?.loses??[]};
}
// 手艺档名，从低到高（规则表 equipment.workmanship 的顺序）。
export const workmanshipNames=engine=>(engine.rules?.equipment?.workmanship??[]).map(r=>r.name);
// 一件物品的用途类别：上面的类别，加上它标着的用途标签（item-use-tags.tags：cut、pierce…），
// 加上它带的机制字段（combat 战斗属性、checkBonus 检定加成）。
export function useClasses(engine,item){
 const def=engine.byId?.get(item),tags=new Set(def?.tags??[]);
 return [...itemClasses(engine,item),...Object.keys(useTags.tags??{}).filter(t=>tags.has(t)),...['combat','checkBonus'].filter(f=>def?.[f])];
}
// 投入材料（不含工具）凭物性能提供的用途：材料标签查 runtime world 的 materialUses 表（world/meta/mechanics/material-uses.json）；
// requiresHeat 的行只在加热加工（投入里有燃料类材料，item-use-tags.heat）时提供。
export function providedUses(engine,inputs){
 const rows=engine.world?.materialUses?.rows??{},heated=inputs.some(id=>isItemClass(engine,id,useTags.heat.materialClass)),out=new Set();
 for(const id of inputs)for(const tag of engine.byId?.get(id)?.tags??[]){const row=rows[tag];if(row&&(!row.requiresHeat||heated))for(const u of row.uses)out.add(u);}
 return out;
}
// 一件物品做成某手艺档时缺掉的用途：该档 loses 与物品用途类别的交集；给了投入材料（inputs，物品 id）时，
// 投入凭物性能提供的用途保留（形似但低耐久，该有的用途有），检定加成不由材料提供。制成时记在实例的 lostUses 上。
export function lostUses(engine,item,workmanship,inputs=null){
 const loses=new Set(workmanshipTier(engine,workmanship).loses);
 const lost=useClasses(engine,item).filter(c=>loses.has(c));
 if(!inputs||!lost.length)return lost;
 const provided=providedUses(engine,inputs);
 return lost.filter(c=>c==='checkBonus'||!provided.has(c));
}
// 单件实例的用途类别：物品的用途类别减去实例缺掉的用途（lostUses；旧实例没记的按手艺档推）。低档实例“形似”而缺用途。
export function instanceClasses(engine,unit){
 if(!unit)return [];
 const lost=new Set(Array.isArray(unit.lostUses)?unit.lostUses:lostUses(engine,unit.item,unit.workmanship));
 return useClasses(engine,unit.item).filter(c=>!lost.has(c));
}
export const isInstanceClass=(engine,unit,cls)=>instanceClasses(engine,unit).includes(cls);
// 单件实例缺掉的用途（实例记的 lostUses；旧实例没记的按手艺档推；不是单件或标准件为空）。用到实例的判断——当工具的检定加成、
// 兵器战斗属性、按用途选工具、盛液——都读它：仿制的镰刀没有刃口，仿制的錾杆不给检定加成。
export function unitLostUses(engine,unit){
 if(Array.isArray(unit?.lostUses))return unit.lostUses;
 return unit?.item&&unit.workmanship?lostUses(engine,unit.item,unit.workmanship):[];
}
export const unitLacks=(engine,unit,use)=>unitLostUses(engine,unit).includes(use);

// 持有人行囊里某类物品，按 id 排序（稳定）。
export function heldOfClass(d,engine,holder,cls){
 const bag=d.get(...engine.bagPath(holder))??{};
 return Object.keys(bag).sort().filter(item=>isItemClass(engine,item,cls)).map(item=>({item,quantity:engine.quantity(d,holder,item)})).filter(r=>r.quantity>0);
}
// 选一件够数的同类物品：先认指定的（须属于该类），再按 id 顺序。没有就返回 null。
export function pickHeldOfClass(d,engine,holder,cls,amount=1,{prefer=null}={}){
 if(prefer&&isItemClass(engine,prefer,cls)&&engine.quantity(d,holder,prefer)>=amount)return prefer;
 return heldOfClass(d,engine,holder,cls).find(r=>r.quantity>=amount)?.item??null;
}
// 账户式库存（{item:quantity}，如组织账户 items）里某类物品的第一件。
export function pickStockOfClass(engine,items,cls,amount=1){
 return Object.keys(items??{}).sort().find(item=>isItemClass(engine,item,cls)&&(items[item]??0)>=amount)??null;
}
// 配方材料按类别落到实际持有的物品：材料行的物品属于可替换类（item-use-tags.substitutable.classes，如燃料），
// 而持有人不够这一件时，换成持有的同类物品。返回 [{item,amount,class?,authored?}]，同一物品合并；不替换的行原样返回。
export function resolveMaterials(d,engine,holder,materials){
 const need=new Map(),out=[];
 for(const row of materials){
  const amount=row.amount;let item=row.item,cls=null;
  const sub=(SUB.classes??[]).find(c=>isItemClass(engine,row.item,c));
  if(sub&&engine.quantity(d,holder,row.item)-(need.get(row.item)??0)<amount){
   // 替代品必须具备原物品的全部用途类别（requireAllClasses）：木料（燃料+木材）能顶木炭去烧，木炭顶不了木料。
   const own=itemClasses(engine,row.item),covers=item=>!SUB.requireAllClasses||own.every(c=>isItemClass(engine,item,c));
   const alt=heldOfClass(d,engine,holder,sub).find(r=>r.quantity-(need.get(r.item)??0)>=amount&&covers(r.item))?.item;
   if(alt){item=alt;cls=sub;}
  }
  need.set(item,(need.get(item)??0)+amount);
  out.push({item,amount,...(cls?{class:cls,authored:row.item}:{})});
 }
 return out;
}

// 家户每日用度（唯一一份定义）：按类别、按重量。npc-life 每日照此从户里扣，household-budget 照此自留，market 照此补买。
// 每行 {cls, purpose（账本用途）, gramsPerDay}；状态里的欠量与短缺日按 `${cls}DebtG`、`${cls}ShortDays` 记。
export function householdUsage(engine,minute,members){
 const fuel=craftingParam(engine,'household.fuelKgPerDay'),season=engine.calendar(minute).season;
 const fuelKg=fuel.cooking+(fuel.heating[season]??0),ref=fuelReferenceHeat(engine);
 // 燃料需求本质是热量：现行“每日公斤”是按参照燃料类（fuelReferenceClass）的有效热值算的，demandMJ = 公斤 × 基准热值；
 // 具体一件燃料顶多少，见 usageGrams（有效热值 ÷ 基准）。没有任何燃料知道热值时不带 demandMJ，一切同现行。
 return [{cls:'fuel',purpose:'fuel',gramsPerDay:fuelKg*1000,...(ref?{demandMJ:fuelKg*ref}:{})},
  {cls:'salt',purpose:'seasoning',gramsPerDay:craftingParam(engine,'household.saltGramsPerPersonDay')*members.length}];
}

// D12 卡 B：燃料有效热值（MJ/件重 kg）= 热值 ×（1 − 含水率）− 水分汽化潜热 × 含水率。热值与含水率按材料属性（materialProps）；
// 热值是 MJ/kg 干物质，所以干物质 (1−m) 公斤放热，m 公斤水要先汽化吸热。潜热是物理常数（balance/crafting household.waterLatentHeat）。
// 任一属性未知返回 null（不给默认值）。
export function fuelEffectiveHeat(engine,item){
 const p=materialProps(engine,item);
 if(!p.heatValue.known||!p.moisture.known)return null;
 const m=p.moisture.value;
 return p.heatValue.value*(1-m)-craftingParam(engine,'household.waterLatentHeat')*m;
}
// 基准有效热值：现行“每日公斤”原本针对的参照燃料类（规则表 household.fuelReferenceClass）按类别行的热值与含水率算的有效热值；
// 类别行缺任一项（含表为空）返回 null，一切同现行。只读规则数据，不随其他燃料的属性变化。
export function fuelReferenceHeat(engine){
 const table=engine.world?.materialProps,row=table?.classes?.[craftingParam(engine,'household.fuelReferenceClass')];
 const heat=rowValue(row,'heatValue',table?.kcalPerSatiety),m=rowValue(row,'moisture',table?.kcalPerSatiety);
 if(heat===undefined||m===undefined)return null;
 const h=heat*(1-m)-craftingParam(engine,'household.waterLatentHeat')*m;
 return h>0?h:null;
}
// 一件用度类物品顶多少“基准克”：燃料按有效热值 ÷ 基准热值折算其重量（含水多的柴要烧更多公斤，同热量需求不变）；
// 其余类、或属性未知，原样返回重量克数。有效热值不为正的燃料返回 0（烧不出净热）。
export function usageGrams(engine,item,cls,grams){
 if(cls!=='fuel')return grams;
 const ref=fuelReferenceHeat(engine),heat=ref?fuelEffectiveHeat(engine,item):null;
 return heat===null?grams:grams*Math.max(0,heat)/ref;
}

// —— 加载期派生营养与生熟 ——
// 物品表写了 nutrition 的照用；没写的食物：有产出它的配方就按投入守恒派生，没有配方就按重量 × 类别密度。
// 结果：可直接当一餐的食物写入 nutrition（消费方照旧读 nutrition）；全部食物写 nutrientContent（含生料）与 foodState。
export function deriveItemAttributes(world){
 const byId=new Map((world.items??[]).map(i=>[i.id,i])),table=classTable(world);
 const has=(id,cls)=>(table.get(id)??[]).includes(cls);
 const density=param(world,'nutrition.densityPerKg'),loss=param(world,'nutrition.processLoss');
 const producers=new Map();
 for(const r of [...world.recipes??[]].sort((a,b)=>a.id.localeCompare(b.id)))if(r.output?.item&&r.output.quantity>0)producers.set(r.output.item,[...producers.get(r.output.item)??[],r]);
 const heated=r=>(r.materials??[]).some(m=>has(m.item,useTags.heat.materialClass));
 const cache=new Map(),busy=new Set();
 const base=item=>{
  const tags=item.tags??[],key=Object.keys(density).find(k=>k!=='default'&&tags.includes(k));
  // D12 卡 B：干物质能量密度与含水率都已知时，饱腹 = 重量(kg) × 能量密度(饱腹/kg 干物质) ×（1 − 含水率）×（可食部分比例，已知时）；任一未知走现行三档密度。
  const mp=materialProps({world,byId},item.id);
  // 可食部分比例已知时再乘（壳、核、骨不供能）；未知不乘，同现行。
  if(mp.energyDensity.known&&mp.moisture.known)return {satiety:(item.weight??0)*mp.energyDensity.value*(1-mp.moisture.value)*(mp.edibleFraction.known?mp.edibleFraction.value:1),hydration:0,raw:has(item.id,'needsHeat')};
  const perKg=key?density[key]:density.default;
  return {satiety:(item.weight??0)*perKg,hydration:0,raw:has(item.id,'needsHeat')};
 };
 const content=id=>{
  if(cache.has(id))return cache.get(id);
  const item=byId.get(id);if(!item)return null;
  if(item.nutrition)return set(id,{satiety:item.nutrition.satiety??0,hydration:item.nutrition.hydration??0,raw:false,authored:true});
  if(!has(id,'food'))return set(id,{satiety:0,hydration:0,raw:false,inedible:true});
  if(busy.has(id))return null;
  busy.add(id);
  let best=null;
  for(const r of producers.get(id)??[]){
   const inputs=(r.materials??[]).map(m=>({m,c:content(m.item)}));
   if(inputs.some(x=>x.c===null))continue;
   const hot=heated(r),keep=1-(hot?loss.heated:loss.unheated),q=r.output.quantity;
   const row={satiety:inputs.reduce((n,x)=>n+x.c.satiety*x.m.amount,0)*keep/q,hydration:inputs.reduce((n,x)=>n+x.c.hydration*x.m.amount,0)*keep/q,
    raw:!hot&&inputs.some(x=>x.c.raw),recipe:r.id,heated:hot};
   if(!best||row.satiety<best.satiety)best=row;
  }
  busy.delete(id);
  return set(id,best??base(item));
 };
 function set(id,v){cache.set(id,v);return v;}
 for(const item of world.items??[]){
  const c=content(item.id);if(!c||c.inedible)continue;
  if(c.authored)continue;
  item.foodState=c.raw?'raw':'ready';
  item.nutrientContent={satiety:Math.floor(c.satiety),hydration:Math.floor(c.hydration)};
  if(c.raw)continue;
  const nutrition={...(Math.floor(c.satiety)>0?{satiety:Math.floor(c.satiety)}:{}),...(Math.floor(c.hydration)>0?{hydration:Math.floor(c.hydration)}:{})};
  if(Object.keys(nutrition).length)item.nutrition=nutrition;
 }
 return world;
}

// D12 卡 A：材料属性（物理量）。类别行在 world/meta/mechanics/material-props.json（runtime world 的 materialProps），
// 物品个别偏离写在 mechanics/items.json 的 props 行。不新造分类：类别键是现有标签或用途类别名（itemClasses）。
// 取值：物品所属类别中按表头 precedence（从最具体到最一般）逐维取第一个写了该维的类别；物品自己的 props 覆盖类别值；
// 多类别冲突取更具体者，不求平均；没有任何来源的维度返回 {known:false}，不给默认值。
export const MATERIAL_DIMENSIONS=['moisture','edibleFraction','energyDensity','heatValue','charYield'];
// D12 卡 D 整类修复：含水、可食部分、能量密度不手写，由行内的出处原值（sources）推出；heatValue、charYield 仍直接写。
//   sources：[{name, citation, moistureFraction（水占鲜重）, kcalPer100gWet（鲜重 kcal/100g）, refuseFraction（不可食部分，壳核骨）, range?}]
//   selection：{method:'single'|'mean'|'representative', representative?, reason}；多出处时按 mean（逐项算术平均）或 representative（取代表出处）。
//   推算（唯一一处，取整规则统一）：moisture = 取值后的含水分数，四舍五入到 3 位小数；edibleFraction = 1 − 不可食部分，3 位小数；
//   energyDensity（饱腹/kg 干物质）= round(kcalPer100gWet × 10 ÷ (1 − moisture) ÷ kcalPerSatiety)，取整到个位；
//   kcalPerSatiety 读表头（world/meta/mechanics/material-props.json 的 kcalPerSatiety，calibrate 标定值），代码里不写死。
//   行里若仍直接存了 moisture/edibleFraction/energyDensity，值必须等于推算值（L1 校验）；没有 sources 的行（夹具）直接用存的值。
const meanOf=a=>a.reduce((n,x)=>n+x,0)/a.length,round3=x=>Math.round(x*1000)/1000;
export function deriveFromSources(row,kcalPerSatiety){
 const srcs=Array.isArray(row?.sources)?row.sources:null;
 if(!srcs?.length)return {};
 const sel=row.selection??{method:'single'};
 const pick=key=>{
  const have=srcs.filter(x=>x[key]!==undefined);
  if(!have.length)return undefined;
  if(sel.method==='mean')return meanOf(have.map(x=>x[key]));
  const one=sel.method==='representative'?srcs.find(x=>x.name===sel.representative):srcs[0];
  return one?.[key];
 };
 const out={},m=pick('moistureFraction'),refuse=pick('refuseFraction'),kcal=pick('kcalPer100gWet');
 if(m!==undefined)out.moisture=round3(m);
 if(refuse!==undefined)out.edibleFraction=round3(1-refuse);
 if(kcal!==undefined&&out.moisture!==undefined&&out.moisture<1&&kcalPerSatiety>0)out.energyDensity=Math.round(kcal*10/(1-out.moisture)/kcalPerSatiety);
 return out;
}
const derivedMemo=new WeakMap();
// 行上某一维的取值：行里直接存了就用存的；否则从 sources 推出；都没有为 undefined。
export function rowValue(row,dim,kcalPerSatiety){
 if(!row)return undefined;
 if(row[dim]!==undefined)return row[dim];
 if(!Array.isArray(row.sources))return undefined;
 let m=derivedMemo.get(row);if(!m||m.k!==kcalPerSatiety){m={k:kcalPerSatiety,d:deriveFromSources(row,kcalPerSatiety)};derivedMemo.set(row,m);}
 return m.d[dim];
}
export function materialProps(engine,item){
 const table=engine.world?.materialProps,def=engine.byId?.get(item),own=def?.props??{},kps=table?.kcalPerSatiety;
 const member=new Set([...itemClasses(engine,item),...(def?.tags??[])]);
 const chain=(table?.precedence??[]).filter(k=>member.has(k)&&table.classes?.[k]);
 const out={};
 for(const dim of MATERIAL_DIMENSIONS){
  const mine=rowValue(own,dim,kps);
  if(mine!==undefined){out[dim]={known:true,value:mine,source:'item'};continue;}
  const cls=chain.find(k=>rowValue(table.classes[k],dim,kps)!==undefined);
  out[dim]=cls?{known:true,value:rowValue(table.classes[cls],dim,kps),source:cls}:{known:false};
 }
 return out;
}
// L1：属性表校验。表头 dimensions 声明每维的单位与范围（分数 0–1）；precedence 必须恰好列全部类别键；
// 每个类别行与物品 props 行必须带 basis；类别键必须是已存在标签（物品标签、用途标签或用途类别名）。
export function validateMaterialProps(world){
 const t=world.materialProps,errors=[];
 if(t===undefined)return errors;
 const dims=t.dimensions??{},known=new Set([...(world.items??[]).flatMap(i=>i.tags??[]),...Object.keys(CLASSES),...Object.keys(useTags.tags??{})]);
 for(const d of MATERIAL_DIMENSIONS){const h=dims[d];
  if(!h||typeof h.unit!=='string'||!h.unit)errors.push(`材料属性表头缺单位：${d}`);
  else if(!(Number.isFinite(h.min)&&Number.isFinite(h.max)&&h.min<=h.max))errors.push(`材料属性表头缺范围：${d}`);}
 for(const d of Object.keys(dims))if(!MATERIAL_DIMENSIONS.includes(d))errors.push(`材料属性维度未登记：${d}`);
 const kps=t.kcalPerSatiety;
 if(kps!==undefined){
  if(!(Number.isFinite(kps)&&kps>0))errors.push('材料属性表头 kcalPerSatiety 须为正数');
  if(typeof t.kcalPerSatietyBasis!=='string'||!t.kcalPerSatietyBasis.trim())errors.push('材料属性表头 kcalPerSatiety 缺标定依据 kcalPerSatietyBasis');
 }
 // 出处字段：齐全、范围合法；存了推算维度的必须与推算值一致。
 const checkSources=(row,where)=>{
  const srcs=row.sources;
  if(srcs===undefined){if(row.selection!==undefined)errors.push(`材料属性 selection 没有 sources：${where}`);return;}
  if(!Array.isArray(srcs)||!srcs.length){errors.push(`材料属性 sources 须为非空数组：${where}`);return;}
  const sel=row.selection;
  if(!sel||!['single','mean','representative'].includes(sel.method)||typeof sel.reason!=='string'||!sel.reason.trim())errors.push(`材料属性缺 selection（method 取 single/mean/representative 并写 reason）：${where}`);
  else{
   if(sel.method==='single'&&srcs.length!==1)errors.push(`材料属性 single 只能有 1 个出处：${where}`);
   if(sel.method==='mean'&&srcs.length<2)errors.push(`材料属性 mean 至少 2 个出处：${where}`);
   if(sel.method==='representative'&&!srcs.some(x=>x.name===sel.representative))errors.push(`材料属性 representative 不在 sources 里：${where}`);
  }
  const bounds={moistureFraction:[0,1],refuseFraction:[0,0.99],kcalPer100gWet:[0,900]},names=new Set();
  srcs.forEach((x,i)=>{
   const w=`${where}.sources[${i}]`;
   if(typeof x?.name!=='string'||!x.name.trim()||names.has(x.name))errors.push(`材料属性出处缺 name 或重名：${w}`);else names.add(x.name);
   if(typeof x?.citation!=='string'||!x.citation.trim())errors.push(`材料属性出处缺 citation：${w}`);
   for(const [key,[lo,hi]] of Object.entries(bounds))if(x?.[key]!==undefined&&!(Number.isFinite(x[key])&&x[key]>=lo&&x[key]<=hi))errors.push(`材料属性出处越界：${w}.${key}=${x[key]}（${lo}–${hi}）`);
   for(const [key,r] of Object.entries(x?.range??{}))if(!(Array.isArray(r)&&r.length===2&&r[0]<=r[1]&&Number.isFinite(x[key])&&x[key]>=r[0]&&x[key]<=r[1]))errors.push(`材料属性出处取值不在公认区间内：${w}.${key}`);
  });
  if(sel?.method==='mean')for(const key of Object.keys(bounds)){const n=srcs.filter(x=>x?.[key]!==undefined).length;if(n!==0&&n!==srcs.length)errors.push(`材料属性 mean 要求各出处都写 ${key}：${where}`);}
  const hasKcal=srcs.some(x=>x?.kcalPer100gWet!==undefined);
  if(hasKcal&&!(kps>0))errors.push(`材料属性表头缺 kcalPerSatiety，无法由出处推算能量：${where}`);
  const d=deriveFromSources(row,kps);
  if(hasKcal&&d.energyDensity===undefined)errors.push(`材料属性写了 kcalPer100gWet 却缺含水分数，无法推算能量：${where}`);
  for(const [dim,v] of Object.entries(d)){
   const h=dims[dim];if(h&&(v<h.min||v>h.max))errors.push(`材料属性推算值越界：${where}.${dim}=${v}（${h.min}–${h.max} ${h.unit}）`);
   if(row[dim]!==undefined&&!(Math.abs(row[dim]-v)<1e-9))errors.push(`材料属性 ${dim} 与出处推算值不一致：${where}（存 ${row[dim]}，推算 ${v}）`);
  }
  for(const dim of ['moisture','edibleFraction','energyDensity'])if(row[dim]!==undefined&&d[dim]===undefined)errors.push(`材料属性存了 ${dim} 但出处推不出：${where}`);
 };
 const check=(row,where)=>{
  if(typeof row?.basis!=='string'||!row.basis.trim())errors.push(`材料属性缺 basis：${where}`);
  checkSources(row??{},where);
  for(const [k,v] of Object.entries(row??{})){
   if(k==='basis'||k==='sources'||k==='selection')continue;
   if(!MATERIAL_DIMENSIONS.includes(k)){errors.push(`材料属性维度未登记：${where}.${k}`);continue;}
   const h=dims[k];if(!h)continue;
   if(typeof v!=='number'||!Number.isFinite(v)||v<h.min||v>h.max)errors.push(`材料属性越界：${where}.${k}=${v}（${h.min}–${h.max} ${h.unit}）`);
  }};
 const keys=Object.keys(t.classes??{});
 for(const k of keys){if(!known.has(k))errors.push(`材料属性类别不是已有标签：${k}`);check(t.classes[k],`classes.${k}`);}
 const order=t.precedence??[];
 if(!Array.isArray(order)||order.length!==new Set(order).size||order.length!==keys.length||keys.some(k=>!order.includes(k)))errors.push('材料属性 precedence 必须恰好列出全部类别键且不重复（从最具体到最一般）');
 for(const i of world.items??[])if(i.props!==undefined)check(i.props,`items.${i.id}.props`);
 return errors;
}
