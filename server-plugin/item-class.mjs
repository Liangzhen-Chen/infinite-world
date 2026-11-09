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
 return [{cls:'fuel',purpose:'fuel',gramsPerDay:(fuel.cooking+(fuel.heating[season]??0))*1000},
  {cls:'salt',purpose:'seasoning',gramsPerDay:craftingParam(engine,'household.saltGramsPerPersonDay')*members.length}];
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
export function materialProps(engine,item){
 const table=engine.world?.materialProps,def=engine.byId?.get(item),own=def?.props??{};
 const member=new Set([...itemClasses(engine,item),...(def?.tags??[])]);
 const chain=(table?.precedence??[]).filter(k=>member.has(k)&&table.classes?.[k]);
 const out={};
 for(const dim of MATERIAL_DIMENSIONS){
  if(own[dim]!==undefined){out[dim]={known:true,value:own[dim],source:'item'};continue;}
  const cls=chain.find(k=>table.classes[k][dim]!==undefined);
  out[dim]=cls?{known:true,value:table.classes[cls][dim],source:cls}:{known:false};
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
 const check=(row,where)=>{
  if(typeof row?.basis!=='string'||!row.basis.trim())errors.push(`材料属性缺 basis：${where}`);
  for(const [k,v] of Object.entries(row??{})){
   if(k==='basis')continue;
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
