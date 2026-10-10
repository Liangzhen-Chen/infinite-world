import {journeySupplies,journeyTools,journeyArms} from './economy-w3-journey-supplies.mjs';
import {journeyCraft} from './economy-w3-journey-craft.mjs';
const iid=slug=>`item_${slug}`;
const groups={
 grain:{skill:3,station:'cooking',origin:'bld_hw_qingdeng',title:'麦锅火候与稠度录',focus:'十二种麦豆主食的浸泡、收汁与夹馅顺序'},
 preserve:{skill:3,station:'cooking',origin:'bld_hw_qingdeng',title:'短藏小食辨味册',focus:'十种短期加工食物的分量、余液处理与弃坏边界'},
 sewing:{skill:4,station:'weaving',origin:'bld_hw_weaving',title:'帆布与软衬裁缝图',focus:'十二种袋套和衬垫的折叠、受力缝与空件交付'},
 wood:{skill:6,station:'woodworking',origin:'bld_hw_mill',title:'木角芦片杂工记',focus:'十二种木、角、芦及板岩器件的开料与边缘整修'},
 metal:{skill:5,station:'smithing',origin:'bld_hw_forge',title:'钢刃热修与薄片工谱',focus:'十二种钢凿、金属连接件和软金属饰片的锻修次序'},
 desk:{skill:22,station:'woodworking',origin:'bld_hw_mill',title:'书桌装订小作录',focus:'十种笔册辅料的裁口、穿脊、护边和空白交付'},
 smallcraft:{skill:18,station:'woodworking',origin:'bld_hw_mill',title:'骨角饰线细作谱',focus:'九种骨角、贝片、银丝、刷具及染液的材料边界'},
 upkeep:{skill:20,station:'cooking',origin:'bld_hw_qingdeng',title:'器物养护备料手记',focus:'八种护革、擦洗和灯芯耗材的配制与实际维修区别'},
};
const suppliers={npc_hw_linsui:'bld_hw_qingdeng',npc_hw_yanzhe:'loc_bs',npc_hw_meiling:'loc_hw_orchard',npc_hw_duanyan:'bld_hw_forge',npc_hw_ayan:'bld_hw_mill',npc_hw_sulan:'bld_hw_weaving',npc_hw_luqing:'bld_hw_school',npc_hw_wushuo:'loc_hw_northwood',npc_hw_zhengshuisheng:'loc_hw_dock'};
const coldUpkeep=new Set(['damp_sand_rub','wick_coil','linen_cleaning_swab','felt_polishing_pad']);
const metalProducts={broad_steel_chisel:6,hooked_pruning_knife:9,leather_round_knife:20,carpenters_adze:6,steel_gouge_tip:14,small_trowel:7};
export function economyW3Journey(world){
 const items=[],recipes=[],supply=[];
 const stock=(npc,item,quantity)=>{let plan=supply.find(x=>x.npc===npc);if(!plan){plan={npc,stock:{},reason:'本批有限开市库存，售罄不自动补回'};supply.push(plan);}plan.stock[item]=quantity;};
 const base=(slug,name,basePrice,weight,shelfLifeDays,origin,quality='木',durability=100)=>({id:iid(slug),name,basePrice,weight,shelfLifeDays,origin,quality,durability,aliases:[],scope:null,seasonality:'集市按当季货源小批供应，现货售罄须等待另一次实际补货',tags:['w3_journey']});
 for(const[slug,name,price,kg,days,seller,use]of journeySupplies){const row={...base(slug,name,price,kg,days,suppliers[seller]),use,acquisition:{seller,mode:'有限材料库存'}};row.tags.push(journeySupplies.findIndex(x=>x[0]===slug)<20?'food':'material');items.push(row);stock(seller,row.id,4);}
 for(const[slug,name,price,kg,durability,quality,skill,bonus,use]of journeyTools){const seller=['goat_hair_brush','quill_knife'].includes(slug)?'npc_hw_luqing':['loom_reed','fine_sewing_needle','loop_turner'].includes(slug)?'npc_hw_sulan':'npc_hw_yanzhe';const row={...base(slug,name,price,kg,null,suppliers[seller],quality,durability),use,checkBonus:{bonus,skills:[`skill_life_${skill}_core`]},acquisition:{seller,mode:'专业工具有限现货'}};row.tags.push('tool');items.push(row);stock(seller,row.id,quality==='金'?1:2);}
 for(const[slug,name,price,kg,durability,quality,attack,defense,hit,use]of journeyArms){const seller=['steel_arming_sword','ash_spear','singlebit_axe','oak_cudgel','quarterstaff','practice_sword'].includes(slug)?'npc_hw_duanyan':'npc_hw_yanzhe';const row={...base(slug,name,price,kg,null,suppliers[seller],quality,durability),use,combat:{attack,defense,hit},acquisition:{seller,mode:'有限近战器械库存'}};row.tags.push('weapon');items.push(row);stock(seller,row.id,quality==='金'||quality==='白金'?1:2);}
 const byId=new Map([...world.items,...items].map(x=>[x.id,x]));
 for(const[group,rows]of Object.entries(journeyCraft)){
  const spec=groups[group],groupRecipeIds=[];
  for(const[slug,name,weight,shelfLifeDays,minutes,minimumProficiency,labor,inputs,toolList,processFacts]of rows){
   const materials=inputs.split(',').map(x=>{const[slug,count]=x.split(':');return{item:iid(slug),amount:Number(count)};});
   for(const m of materials)if(!byId.has(m.item))throw new Error(`缺原料 ${slug}/${m.item}`);
   const cost=materials.reduce((n,m)=>n+byId.get(m.item).basePrice*m.amount,0),mass=materials.filter(m=>!['item_charcoal','item_wood_shavings'].includes(m.item)).reduce((n,m)=>n+byId.get(m.item).weight*m.amount,0);
   if(weight>mass+.0001)throw new Error(`产物超投料 ${slug}: ${weight}>${mass}`);
   const hot=slug==='redwood_dye'||slug==='paste_cup_portion';const cold=group==='upkeep'&&coldUpkeep.has(slug);
   const station=hot?'cooking':cold?'weaving':spec.station,origin=hot?'bld_hw_qingdeng':cold?'bld_hw_weaving':spec.origin;
   const quality=metalProducts[slug]?(minimumProficiency>=500?'银':'铁'):'木';
   const recipe=`recipe_w3c_${slug}`,row={...base(slug,name,cost+labor,weight,shelfLifeDays,origin,quality,metalProducts[slug]?280:120),use:processFacts,acquisition:{recipe}};
   row.tags.push(['grain','preserve'].includes(group)?'food':metalProducts[slug]?'tool':'craft');if(metalProducts[slug])row.checkBonus={bonus:2,skills:[`skill_life_${metalProducts[slug]}_core`]};items.push(row);byId.set(row.id,row);
   const tools=toolList.split(',').map(iid);for(const tool of tools)if(!byId.has(tool))throw new Error(`缺工具 ${slug}/${tool}`);
   const skill=`skill_life_${slug==='redwood_dye'?16:spec.skill}_core`;
   recipes.push({id:recipe,name:`制作${name}`,aliases:[],scope:null,skill,minimumProficiency,minutes,difficulty:minimumProficiency>=400?25:minimumProficiency>=200?20:minimumProficiency?15:10,materials,tools,workstation:station,output:{item:row.id,quantity:1},byproducts:[],learningRequired:true,learnFee:10,learnMinutes:120,teachers:[],toolWear:group==='metal'?2:1,failure:{recoverFraction:group==='metal'?.25:0,injury:group==='metal'?2:0},prerequisites:minimumProficiency?[{skill,minimum:minimumProficiency}]:[],processFacts});groupRecipeIds.push(recipe);
  }
  const id=`book_journey_${group}`,book={...base(id,spec.title,70,.3,365,'bld_hw_school','木',100),use:`讲解${spec.focus}；识字100可读，阅读450分钟，各工序另需对应熟练度和工具。`,book:{grade:'中级',author:'白石手艺人合抄',edition:'河湾供货校对本',origin:'bld_hw_school',teaches:groupRecipeIds,readingMinutes:450,prerequisites:[]},acquisition:{seller:'npc_hw_luqing',mode:'有限预约抄本'}};book.tags.push('book');items.push(book);stock('npc_hw_luqing',book.id,1);
 }
 if(items.length!==182||recipes.length!==85)throw new Error(`本批目标不符：${items.length}/${recipes.length}`);
 const ids=items.map(x=>x.id);if(new Set(ids).size!==ids.length)throw new Error('本批物品编号重复');
 return{items,recipes,supply};
}
