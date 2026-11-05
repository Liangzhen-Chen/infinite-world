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
