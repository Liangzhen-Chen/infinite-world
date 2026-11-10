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

// 饱腹系数 = Π 各因子（饱腹不等于热量：同样的热量，低能量密度的食物更饱，高能量密度的更不饱）。
// 参数在 crafting.json nutrition.satietyFactor：energyDensity 因子 =（成品能量密度 ÷ ref）^k 夹在 [min,max]；
// 整体乘积再夹到同一 [min,max]；dimensions 里每项 {k,ref,min,max} 是按材料属性维度追加的因子（如蛋白、纤维、含水），该物品该维度未知则因子取 1，现在为空。
// 配方的能量守恒不动：系数只在最终写入 nutrition / nutrientContent 时乘一次。
const factorOf=(spec,x)=>Math.min(spec.max,Math.max(spec.min,(x/spec.ref)**spec.k));
export function satietyFactor(world,item,satiety){
 const spec=param(world,'nutrition.satietyFactor'),kps=world?.materialProps?.kcalPerSatiety,dims=Object.entries(spec.dimensions??{});
 let f=1;
 if(spec.energyDensity&&kps>0&&item.weight>0&&satiety>0)f*=factorOf(spec.energyDensity,satiety*kps/(item.weight*1000));
 if(dims.length){const mp=materialProps({world,byId:new Map((world.items??[]).map(i=>[i.id,i]))},item.id);for(const [dim,d] of dims){const v=mp[dim];if(v?.known)f*=factorOf(d,v.value);}}
 // 全部因子的乘积整体再夹到 energyDensity 的 [min,max]，多个维度叠加也不会超出范围。
 return spec.energyDensity?Math.min(spec.energyDensity.max,Math.max(spec.energyDensity.min,f)):f;
}

// —— 加载期派生营养与生熟 ——
// 物品表写了 nutrition 的维度照用（视为按热量的基值，同样乘饱腹系数），没写的维度和没写 nutrition 的食物：有产出它的配方就按投入守恒派生，没有配方就按重量 × 类别密度。
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
  // 幂等：已派生过的物品（nutrition 与 nutrientContent 仍一致，说明没被人改过）按当时记下的“按热量基值” nutrientBase 重算，不把已乘过系数的值再当手写值乘一遍。
  const prior=item.nutrition&&item.nutrientBase&&item.nutrientContent&&(item.nutrition.satiety??0)===item.nutrientContent.satiety&&(item.nutrition.hydration??0)===item.nutrientContent.hydration?item.nutrientBase:null;
  if(prior)return set(id,{satiety:prior.satiety,hydration:prior.hydration,raw:false,authored:true});
  const auth=item.nutrition;
  if(auth&&auth.satiety!==undefined&&auth.hydration!==undefined)return set(id,{satiety:auth.satiety,hydration:auth.hydration,raw:false,authored:true});
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
  // 物品表手写的营养按维度合并：写了哪个维度用手写值（作为“按热量的基值”，同样乘系数），没写的维度用推导值。
  const d=best??base(item);
  return set(id,auth?{...d,...(auth.satiety!==undefined?{satiety:auth.satiety}:{}),...(auth.hydration!==undefined?{hydration:auth.hydration}:{}),raw:false,authored:true}:d);
 };
 function set(id,v){cache.set(id,v);return v;}
 for(const item of world.items??[]){
  const c=content(item.id);if(!c||c.inedible)continue;
  item.foodState=c.raw?'raw':'ready';
  const sat=Math.floor(c.satiety*satietyFactor(world,item,c.satiety));
  item.nutrientContent={satiety:sat,hydration:Math.floor(c.hydration)};
  // nutrientBase：未乘系数的“按热量基值”（配方的能量守恒在它上面成立；重复派生时也从它重算）。
  item.nutrientBase={satiety:c.satiety,hydration:c.hydration};
  if(c.raw)continue;
  const nutrition={...(sat>0?{satiety:sat}:{}),...(Math.floor(c.hydration)>0?{hydration:Math.floor(c.hydration)}:{})};
  if(Object.keys(nutrition).length)item.nutrition=nutrition;
 }
 return world;
}

// D12 卡 A：材料属性（物理量）。类别行在 world/meta/mechanics/material-props.json（runtime world 的 materialProps），
// 物品个别偏离写在 mechanics/items.json 的 props 行。不新造分类：类别键是现有标签或用途类别名（itemClasses）。
// 取值：物品所属类别中按表头 precedence（从最具体到最一般）逐维取第一个写了该维的类别；物品自己的 props 覆盖类别值；
// 多类别冲突取更具体者，不求平均；没有任何来源的维度返回 {known:false}，不给默认值。
export const MATERIAL_DIMENSIONS=['moisture','edibleFraction','energyDensity','heatValue','charYield','mealCap'];
// D12 卡 D 整类修复：含水、可食部分、能量密度不手写，由行内的出处原值（sources）推出；heatValue、charYield 仍直接写。
//   sources：[{name, citation, moistureFraction（水占鲜重）, kcalPer100gWet（鲜重 kcal/100g）, refuseFraction（不可食部分，壳核骨）, range?, item?}]
//   每个出处代表类别里的一个成员；成员对应的世界物品 id 写在表头 memberItems[类别键][出处 name]（也接受出处里的 item 字段）；没有对应物品的是参照成员。
//   链接放在表头而不在类别行里，是为了不改动类别行的内容（类别行内容进 L2 指纹，只为登记链接不应让已审结论作废）。
//   selection：{method:'single'|'mean', reason}。整类口径（李白 2026-11-09 13:1x 定，适用所有类别，不对个别类别特判）：
//   类别代表值 = 对每个成员（出处）分别用同一程序推算，再对各成员的推算结果取平均；只有 1 个出处时用 single。
//   成员推算（唯一一处，取整规则统一）：含水 m_i = 出处含水分数；干基能量 e_i = kcalPer100gWet × 10 ÷ (1 − m_i) ÷ kcalPerSatiety（饱腹/kg 干物质，不取整）；
//   可食部分 = 1 − 不可食比例。类别值：moisture = 平均 m_i，四舍五入到 3 位小数；edibleFraction = 平均可食部分，3 位小数；energyDensity = 平均 e_i，取整到个位。
//   kcalPerSatiety 读表头（world/meta/mechanics/material-props.json 的 kcalPerSatiety，calibrate 标定值），代码里不写死。
//   成员偏差：每个成员与类别代表值比较三项——干物质比例（1 − 含水，含水对鲜重的影响经它起作用）、干基能量、鲜重能量（e×(1 − 含水)，消费者实际用的）——
//   相对偏差任一超过表头 memberDeviationThreshold 的成员，必须单独写覆盖行（物品 props，带自己的出处，推算值与该出处一致）；L1 检查，没有覆盖即报错（memberDeviations）。
//   行里若仍直接存了 moisture/edibleFraction/energyDensity，值必须等于推算值（L1 校验）；没有 sources 的行（夹具）直接用存的值。
const meanOf=a=>a.reduce((n,x)=>n+x,0)/a.length,round3=x=>Math.round(x*1000)/1000;
// 单个成员（出处）的推算量：m 含水、edible 可食部分、e 干基能量（饱腹/kg 干物质，未取整）。
export function memberValues(x,kcalPerSatiety){
 const o={},m=x?.moistureFraction;
 if(m!==undefined)o.m=m;
 if(x?.refuseFraction!==undefined)o.edible=1-x.refuseFraction;
 if(x?.kcalPer100gWet!==undefined&&m!==undefined&&m<1&&kcalPerSatiety>0)o.e=x.kcalPer100gWet*10/(1-m)/kcalPerSatiety;
 // 干物质为 0（含水 1）：没有可供能的物质，能量为 0（通用规则；有热量却无干物质是矛盾，不推算）。
 else if(x?.kcalPer100gWet===0&&m===1&&kcalPerSatiety>0)o.e=0;
 // 单餐量按鲜重给（mealGrams）；mealBasis:'dryMatter' 的出处，惯常量是干物质量：mealGrams × (1 − 食用时的含水)（eatenMoistureFraction，没写取出处自己的含水；谷、豆按煮熟后食用），类别里存干物质量，到每件物品再按它自己的含水折回鲜重（鲜果与干果同一个类值）。
 if(x?.mealGrams!==undefined){if(x.mealBasis==='dryMatter'){const eaten=x.eatenMoistureFraction??m;if(eaten!==undefined)o.capDry=x.mealGrams*(1-eaten);}else o.cap=x.mealGrams;}
 return o;
}
export function deriveFromSources(row,kcalPerSatiety){
 const srcs=Array.isArray(row?.sources)?row.sources:null;
 if(!srcs?.length)return {};
 const sel=row.selection??{method:'single'};
 const ms=(sel.method==='single'?srcs.slice(0,1):srcs).map(x=>memberValues(x,kcalPerSatiety));
 const avg=key=>{const v=ms.map(o=>o[key]).filter(x=>x!==undefined);return v.length?meanOf(v):undefined;};
 const out={},m=avg('m'),edible=avg('edible'),e=avg('e'),cap=avg('cap'),capDry=avg('capDry');
 if(m!==undefined)out.moisture=round3(m);
 if(edible!==undefined)out.edibleFraction=round3(edible);
 if(e!==undefined)out.energyDensity=Math.round(e);
 if(cap!==undefined)out.mealCap=Math.round(cap*10)/10;
 // mealDry：干物质基准的单餐量（g 干物质/人·餐），不是存储维度；materialProps 按物品自己的含水折成 mealCap。
 if(capDry!==undefined)out.mealDry=Math.round(capDry*100)/100;
 return out;
}
// 每个带 item 的成员与类别代表值的相对偏差（三项）与其中最大绝对值。
export function memberDeviations(row,kcalPerSatiety,links={}){
 const cls=deriveFromSources(row,kcalPerSatiety),out=[],rel=(a,b)=>(a-b)/b;
 for(const x of row?.sources??[]){
  const item=x.item??links?.[x.name];
  if(!item)continue;
  const o=memberValues(x,kcalPerSatiety),dev={};
  if(o.m!==undefined&&cls.moisture!==undefined)dev.dryFraction=rel(1-o.m,1-cls.moisture);
  if(o.e!==undefined&&cls.energyDensity!==undefined){dev.dmEnergy=rel(o.e,cls.energyDensity);dev.freshEnergy=rel(o.e*(1-o.m),cls.energyDensity*(1-cls.moisture));}
  out.push({item,name:x.name,dev,max:Math.max(0,...Object.values(dev).map(Math.abs))});
 }
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
 // 干物质基准的类别单餐量：按这件物品自己的含水折成鲜重（含水未知则没有上限，不猜）。
 if(!out.mealCap.known&&out.moisture.known&&out.moisture.value<1){
  const cls=chain.find(k=>rowValue(table.classes[k],'mealDry',kps)!==undefined);
  if(cls)out.mealCap={known:true,value:Math.round(rowValue(table.classes[cls],'mealDry',kps)/(1-out.moisture.value)*10)/10,source:cls};
 }
 return out;
}
// 单餐可食量上限：物品所属类别（或物品自己的 props）写了 mealCap（g/人·餐）才有上限；没写就是没有上限（不给默认值）。
// 上限按“池”计：同一类别的物品共用一个池（醋、油、蜜各是各的池），物品自己覆盖的上限单独成池。
// 返回 {pool, mg}（每人每餐可吃多少毫克）或 null。数量一律用整数毫克（重量也折成毫克），存档里不出现浮点。
export const itemMg=(engine,item)=>Math.round((engine.byId?.get(item)?.weight??0)*1e6);
export function mealCapOf(engine,item){
 const cap=materialProps(engine,item).mealCap;
 return cap.known?{pool:cap.source==='item'?`item:${item}`:cap.source,mg:Math.round(cap.value*1000)}:null;
}
// 单餐额度（李白 2026-11-09 决定 A，协调者 2026-11-10 修正：任一天可吃量 ≤ 一天额度）。
// 每户存档只记整件开封后的余量（state.family.mealCap[户键] = {open:{物品:毫克}}）：整瓶油、整罐蜜可以分好几天吃完，由 open 负责。
// 一天的额度 = 每人每餐上限 × 表头 mealsPerDay × 人数；当天没吃完的额度作废，不跨日叠加（不存“攒下的额度”）。
// 日推进时：这户手里（库存或开封余量）有这个池的东西，当天才有额度；吃饭时先吃开封余量，不够再开新的一件（整件从背包扣，余量进 open）。
// 预算（多日采购）同一公式：期内可吃量 = 天数 × 一天额度（新买的货到货后才开始，整天向下取整），首日可用额度不超过一天；
// 需求每天都有缺口时每天吃满当天额度，所以按期内总量限购的买进量都吃得掉；需求当天已满足的日子额度作废，那笔购买本来就不被需要。
// opts：days = 各成员的预算天数（日推进为每人 1），saved = 存档里这户的 {open}。表头没有 mealsPerDay 时没有任何上限。
export function mealCapPools(engine,{days=[],saved=null,poolMemo=new Map()}={}){
 const perDay=engine?.world?.materialProps?.mealsPerDay,active=perDay>0,used=new Map(),openUsed=new Map(),held=new Set(),bad=new Set(),open0=saved?.open??{};
 // 性能：mealCapOf 只读引擎世界表（加载后不变）与物品，同一 engine 下同一物品结果恒同；poolMemo 的作用域是
 // 调用方给定的一次计算（householdResources 一次调用内 engine 不变；不传则只在本次 mealCapPools 内），结果对象只读不改。
 const poolOf=item=>{let c=poolMemo.get(item);if(c===undefined){c=mealCapOf(engine,item);poolMemo.set(item,c);}return c;};
 // open0 里余量 > 0 的物品所属池：只依赖 open0 与 poolOf（均不变），首次用到时算一次；语义同原先每次 some 扫描。
 let openPools=null;
 const openPoolSet=()=>openPools??=new Set(Object.keys(open0).filter(k=>(open0[k]??0)>0).map(k=>poolOf(k)?.pool));
 const accrual=(c,start)=>c.mg*perDay*days.reduce((n,x)=>n+Math.max(0,Math.floor(x-start+1e-9)),0);
 const api={
  active,
  // 登记这户现在手里有这件（库存 > 0）；开封余量 > 0 的物品由 openMg 自动视为持有。
  markHeld(item){const c=active&&poolOf(item);if(c)held.add(c.pool);},
  holding(item){const c=active&&poolOf(item);return Boolean(c)&&(held.has(c.pool)||openPoolSet().has(c.pool));},
  // 这个池总共能吃多少毫克：start = 货到手的天数（手里已有则 0）。
  // 一天的额度（每人每餐上限 × mealsPerDay × 人数）。
  dayMg(item){const c=active&&poolOf(item);return c?c.mg*perDay*days.length:Infinity;},
  allowMg(item,start=0){const c=active&&poolOf(item);if(!c)return Infinity;const now=api.holding(item);return accrual(c,now?0:start);},
  roomMg(item,start=0){const c=active&&poolOf(item);if(!c)return Infinity;return Math.max(0,api.allowMg(item,start)-(used.get(c.pool)??0));},
  openMg(item){return Math.max(0,(open0[item]??0)-(openUsed.get(item)??0));},
  take(item,{eatMg=0,fromOpen=0,start=0}={}){const c=active&&poolOf(item);if(!c)return;if(eatMg>api.roomMg(item,start)+1e-6)bad.add(c.pool);if(eatMg>0)used.set(c.pool,(used.get(c.pool)??0)+eatMg);if(fromOpen>0)openUsed.set(item,(openUsed.get(item)??0)+fromOpen);},
  // 购买整件：最多买几件才保证都吃得掉（货到手后才开始累计额度）。
  unitsRoom(item,start=0){const r=api.roomMg(item,start),w=itemMg(engine,item);return !(r<Infinity)||!(w>0)?Infinity:Math.floor(r/w+1e-9);},
  usedMg:pool=>used.get(pool)??0,
  pools:()=>[...used.keys()],
  // 不变量：每个池吃掉与买进的总量不超过它的额度（买了就吃得掉）；take 时记下违反者。
  violations:()=>[...bad]
 };
 return api;
}

// L1：属性表校验。表头 dimensions 声明每维的单位与范围（分数 0–1）；precedence 必须恰好列全部类别键；
// 每个类别行与物品 props 行必须带 basis；类别键必须是已存在标签（物品标签、用途标签或用途类别名）。
// 饮品判据（action-router 的 isDrink）读 drinkable 标签；液态物品是否带标签由本整类规则保证，不靠逐件记忆。
// 在派生后的副本上核对（nutrientContent 含生食，不受“生食不写 nutrition”影响）：
//   水分>0 且热量(饱腹)==0 的物品是纯饮品，必须带 drinkable；带 drinkable 的物品必须有水分>0。有热量的饮品（如牛乳）带标签合法。
export function validateDrinkable(world){
 const w=structuredClone(world);deriveItemAttributes(w);const errors=[];
 for(const item of w.items??[]){
  const hyd=item.nutrientContent?.hydration??0,sat=item.nutrientContent?.satiety??0,tagged=(item.tags??[]).includes('drinkable');
  if(hyd>0&&sat===0&&!tagged)errors.push(`饮品缺 drinkable 标签：${item.id}（派生后水分${hyd}、饱腹0）`);
  if(tagged&&!(hyd>0))errors.push(`带 drinkable 标签的物品派生后水分须>0：${item.id}`);
 }
 return errors;
}
export function validateMaterialProps(world){
 const t=world.materialProps,errors=[];
 if(t===undefined)return errors;
 const dims=t.dimensions??{},known=new Set([...(world.items??[]).flatMap(i=>i.tags??[]),...Object.keys(CLASSES),...Object.keys(useTags.tags??{})]);
 // 单餐可食量上限（mealCap，g/人·餐）：出处给每餐摄入量 mealGrams；换算成“人·餐数”需要表头 mealsPerDay（每人每日餐数），须带依据。
 const usesCap=Object.values(t.classes??{}).some(r=>r?.sources?.some(x=>x?.mealGrams!==undefined))||(world.items??[]).some(i=>i.props?.sources?.some(x=>x?.mealGrams!==undefined));
 if(usesCap){
  if(!(Number.isInteger(t.mealsPerDay)&&t.mealsPerDay>0))errors.push('材料属性表头 mealsPerDay 须为正整数（单餐可食量上限换算人·餐数用）');
  if(typeof t.mealsPerDayBasis!=='string'||!t.mealsPerDayBasis.trim())errors.push('材料属性表头 mealsPerDay 缺依据 mealsPerDayBasis');
 }
 // mealCap 是后加的维度：表里用到它（出处写了 mealGrams）或表头声明了它才要求表头单位与范围，早先不含单餐上限的表（含测试夹具）照旧合格。
 for(const d of MATERIAL_DIMENSIONS){if(d==='mealCap'&&!usesCap&&!dims.mealCap)continue;const h=dims[d];
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
  if(!sel||!['single','mean'].includes(sel.method)||typeof sel.reason!=='string'||!sel.reason.trim())errors.push(`材料属性缺 selection（method 取 single/mean 并写 reason）：${where}`);
  else{
   if(sel.method==='single'&&srcs.length!==1)errors.push(`材料属性 single 只能有 1 个出处：${where}`);
   if(sel.method==='mean'&&srcs.length<2)errors.push(`材料属性 mean 至少 2 个出处：${where}`);
  }
  const bounds={moistureFraction:[0,1],refuseFraction:[0,0.99],kcalPer100gWet:[0,920],mealGrams:[0,2000]},names=new Set();
  srcs.forEach((x,i)=>{
   const w=`${where}.sources[${i}]`;
   if(typeof x?.name!=='string'||!x.name.trim()||names.has(x.name))errors.push(`材料属性出处缺 name 或重名：${w}`);else names.add(x.name);
   if(typeof x?.citation!=='string'||!x.citation.trim())errors.push(`材料属性出处缺 citation：${w}`);
   for(const [key,[lo,hi]] of Object.entries(bounds))if(x?.[key]!==undefined&&!(Number.isFinite(x[key])&&x[key]>=lo&&x[key]<=hi))errors.push(`材料属性出处越界：${w}.${key}=${x[key]}（${lo}–${hi}）`);
   for(const [key,r] of Object.entries(x?.range??{}))if(!(Array.isArray(r)&&r.length===2&&r[0]<=r[1]&&Number.isFinite(x[key])&&x[key]>=r[0]&&x[key]<=r[1]))errors.push(`材料属性出处取值不在公认区间内：${w}.${key}`);
  });
  if(sel?.method==='mean')for(const key of Object.keys(bounds)){const n=srcs.filter(x=>x?.[key]!==undefined).length;if(n!==0&&n!==srcs.length)errors.push(`材料属性 mean 要求各出处都写 ${key}：${where}`);}
  // 单餐量基准：mealBasis 只能是 dryMatter（惯常量按干物质折算），须同时有 mealGrams 与含水分数；同一行不混用两种基准。
  for(const [i,x] of srcs.entries())if(x?.eatenMoistureFraction!==undefined&&!(x.mealBasis==='dryMatter'&&Number.isFinite(x.eatenMoistureFraction)&&x.eatenMoistureFraction>=0&&x.eatenMoistureFraction<1))errors.push(`材料属性 eatenMoistureFraction 只用于 dryMatter 基准且须在 0–1：${where}.sources[${i}]`);
  for(const [i,x] of srcs.entries())if(x?.mealBasis!==undefined&&(x.mealBasis!=='dryMatter'||x.mealGrams===undefined||(x.moistureFraction===undefined&&x.eatenMoistureFraction===undefined)))errors.push(`材料属性 mealBasis 只能是 dryMatter，且须同时写 mealGrams 与 moistureFraction：${where}.sources[${i}]`);
  if(new Set(srcs.filter(x=>x?.mealGrams!==undefined).map(x=>x.mealBasis??'wet')).size>1)errors.push(`材料属性同一行不能混用鲜重与干物质两种单餐量基准：${where}`);
  const hasKcal=srcs.some(x=>x?.kcalPer100gWet!==undefined);
  if(hasKcal&&!(kps>0))errors.push(`材料属性表头缺 kcalPerSatiety，无法由出处推算能量：${where}`);
  const d=deriveFromSources(row,kps);
  if(hasKcal&&d.energyDensity===undefined)errors.push(`材料属性写了 kcalPer100gWet 却缺含水分数，无法推算能量：${where}`);
  for(const [dim,v] of Object.entries(d)){
   const h=dims[dim];if(h&&(v<h.min||v>h.max))errors.push(`材料属性推算值越界：${where}.${dim}=${v}（${h.min}–${h.max} ${h.unit}）`);
   if(row[dim]!==undefined&&!(Math.abs(row[dim]-v)<1e-9))errors.push(`材料属性 ${dim} 与出处推算值不一致：${where}（存 ${row[dim]}，推算 ${v}）`);
  }
  for(const dim of ['moisture','edibleFraction','energyDensity','mealCap'])if(row[dim]!==undefined&&d[dim]===undefined)errors.push(`材料属性存了 ${dim} 但出处推不出：${where}`);
 };
 const check=(row,where)=>{
  if(typeof row?.basis!=='string'||!row.basis.trim())errors.push(`材料属性缺 basis：${where}`);
  checkSources(row??{},where);
  for(const [k,v] of Object.entries(row??{})){
   if(k==='basis'||k==='sources'||k==='selection'||k==='mealCapBasis')continue;
   if(!MATERIAL_DIMENSIONS.includes(k)){errors.push(`材料属性维度未登记：${where}.${k}`);continue;}
   const h=dims[k];if(!h)continue;
   if(typeof v!=='number'||!Number.isFinite(v)||v<h.min||v>h.max)errors.push(`材料属性越界：${where}.${k}=${v}（${h.min}–${h.max} ${h.unit}）`);
  }};
 const keys=Object.keys(t.classes??{});
 for(const k of keys){if(!known.has(k))errors.push(`材料属性类别不是已有标签：${k}`);check(t.classes[k],`classes.${k}`);}
  // 整类口径：类别代表值是成员逐项推算后的平均；带 item 的成员偏差超阈值必须有自己的覆盖行。
 const thr=t.memberDeviationThreshold,meanKeys=keys.filter(k=>t.classes[k]?.selection?.method==='mean');
 if(meanKeys.length){
  if(!(Number.isFinite(thr)&&thr>0&&thr<1))errors.push('材料属性表头 memberDeviationThreshold 须为 0–1 之间的正数');
  if(typeof t.memberDeviationBasis!=='string'||!t.memberDeviationBasis.trim())errors.push('材料属性表头 memberDeviationThreshold 缺依据 memberDeviationBasis');
 }
 for(const k of meanKeys){
  const row=t.classes[k];
  for(const d of memberDeviations(row,kps,t.memberItems?.[k])){
   const item=(world.items??[]).find(i=>i.id===d.item);
   if(!item){errors.push(`材料属性类别成员物品不存在：classes.${k} 的 item ${d.item}`);continue;}
   if(!(thr>0)||d.max<=thr)continue;
   const pct=`${(d.max*100).toFixed(1)}%`;
   if(!Array.isArray(item.props?.sources)){errors.push(`材料属性类别 ${k} 的成员 ${d.item}（${d.name}）与类别代表值偏差 ${pct} 超过阈值 ${thr*100}%，须单独写覆盖行（带自己的出处）`);continue;}
   const own=deriveFromSources(item.props,kps),mine=deriveFromSources({sources:[row.sources.find(x=>x.name===d.name)],selection:{method:'single'}},kps);
   for(const dim of ['moisture','energyDensity'])if(mine[dim]!==undefined&&own[dim]!==mine[dim])errors.push(`材料属性成员 ${d.item} 的覆盖行 ${dim} 与类别里它的出处不一致（覆盖 ${own[dim]}，出处 ${mine[dim]}）`);
  }
 }
 for(const [k,m] of Object.entries(t.memberItems??{}))for(const name of Object.keys(m))if(!t.classes?.[k]?.sources?.some(x=>x.name===name))errors.push(`材料属性 memberItems 的出处不存在：${k}.${name}`);
 const order=t.precedence??[];
 if(!Array.isArray(order)||order.length!==new Set(order).size||order.length!==keys.length||keys.some(k=>!order.includes(k)))errors.push('材料属性 precedence 必须恰好列出全部类别键且不重复（从最具体到最一般）');
 for(const i of world.items??[])if(i.props!==undefined)check(i.props,`items.${i.id}.props`);
 return errors;
}
