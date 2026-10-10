// Hand-authored everyday production. Numerical mechanics are fixed; generated
// prose may explain them but may not change outputs, bonuses or preservation.
// This is the first part of the 400-item/200-recipe catalogue, not a new target.
const raw=[
 ['oats','带壳燕麦',3,.5,100,'loc_hw_fields',180,['grain','food'],'一袋半公斤带壳谷物，脱壳磨粉后才能烙饼；潮袋会生霉。','秋收后集中入仓，春末存货减少'],
 ['oat_flour','燕麦粉',4,.4,100,'bld_hw_mill',30,['grain','food'],'一袋四百克磨粉，可煮粥或烙薄饼；不含酵种，不能保证面团膨发。','秋冬磨粮多，雨季易结块'],
 ['salt','粗盐小包',1,.02,100,'loc_yandu',null,['mineral','food'],'二十克粗盐供调味和少量腌制；含沙时须先筛拣，不是药物。','全年经渡口输入'],
 ['water','清水一份',1,.25,100,'loc_hw',1,['water','food'],'二百五十毫升清水，购买者须自备容器；容易受污，不保证消毒或附送陶罐。','全年供应，旱季取水需排队'],
 ['milk','鲜牛乳小壶',3,.5,100,'loc_hw_fields',1,['food','milk'],'半公斤鲜乳须当日使用；加热可用于制鲜乳凝块，酸败乳不可回用。','春夏供应较多，冬季少'],
 ['wool','洗净羊毛束',5,.3,100,'loc_bs',180,['fiber','wool'],'三百克洗净羊毛可手纺，短毛多时断头更多；不是已经织好的布。','春季剪毛后供应增多'],
 ['flax','梳理麻纤维束',4,.3,100,'bld_hw_weaving',180,['fiber','flax'],'三百克已沤麻并梳理的纤维；可纺线或搓灯芯，粗硬短茎已剔去。','秋后晒干存放，连续雨天运输受限'],
 ['rawhide','刮净生皮',8,1,100,'loc_hw_northwood',2,['hide','material'],'一公斤生皮仅刮净残肉与脂肪，毛尚在，未浸灰或鞣制；仍会腐败，撒盐不等于完成鞣制。','狩猎季集中出现，炎热天须及时处理'],
 ['tannin_bark','干鞣树皮片',2,.2,100,'loc_hw_northwood',180,['bark','material'],'二百克干树皮用于鞣液原料；需要浸提和皮料处理，不能直接变成成革。','冬春修枝所得，雨季须避湿'],
 ['clay','筛过黏土团',3,1,100,'loc_hw_dock',null,['clay','material'],'一公斤筛过黏土仍需揉匀除气；可拉坯，未经烧成遇水会软化。','低水位时易取土，汛期取土点封闭'],
 ['charcoal','木炭小袋',3,.25,100,'loc_hw_northwood',null,['carbon','fuel'],'二百五十克木炭供小炉工序，火灰留在炉内；不能当同重铁料使用。','冬季耗量大，雨季须封袋'],
 ['iron_scrap','铁边料小块',2,.2,100,'bld_hw_forge',null,['metal','iron','material'],'二百克边料来自下料和锻造；须验锈裂后回炉，不能冒称完整新坯。','全年，农具维修季较多'],
 ['fish','剖净鲜鱼',3,.3,100,'loc_hw_dock',1,['fish','food'],'三百克剖净鲜鱼可煮食或盐腌；鱼刺仍在，炎热时当天处理。','水位平稳时渔获较多，封河日无新货'],
 ['dried_fruit','干果小袋',3,.15,100,'loc_hw_orchard',60,['fruit','food'],'一百五十克切片晒干果肉，可煮粥或作行粮；受潮发黏后保存期缩短。','秋末新晒，春季多为存货'],
 ['beeswax','滤净蜂蜡块',4,.05,100,'loc_hw_apiary',null,['wax','material'],'五十克已滤去蜂巢渣的蜂蜡可制小烛；只是燃料材料，没有照明魔法。','夏末清理旧脾后供货，冬季库存交易'],
 ['fruit_vinegar','酸果醋小瓶',2,.05,100,'loc_hw_orchard',90,['vinegar','food'],'五十毫升已发酵完成的果醋供调味和凝乳；不能把未发酵果汁当醋。','秋冬果醋成熟后供应'],
];
const tools=[
 ['cooking_pot','厚底煮锅',14,1.5,120,'loc_bs',['metal','tool'],'配小灶煮粥、加热乳液；锅壁破裂或内锈脱落时需维修。',3,'智力',1],
 ['kitchen_knife','案上切刀',10,.3,100,'bld_hw_forge',['metal','tool'],'切食物与修鱼，不作为削木小刀替代；刀背用于压碎小粒盐。',3,'智力',1],
 ['spindle','木纺锤',6,.12,80,'bld_hw_mill',['wood','tool'],'手持悬空旋转的木纺锤，没有轴承；牵纤维并加捻成线，杆身偏轴时容易把细线拉断。',4,'敏捷',1],
 ['loom','窄幅手织架',35,5,180,'bld_hw_weaving',['wood','tool'],'织宽度有限的麻布，开织前须设经线；不是穿戴物或随手针线。',4,'敏捷',1],
 ['hide_scraper','弧口刮皮刀',9,.35,100,'bld_hw_forge',['metal','tool'],'刮除生皮残脂，操作失误会削薄皮面；它不能加速完整鞣制周期。',20,'力量',1],
 ['pottery_wheel','手拨陶轮',28,8,180,'loc_bs',['wood','tool'],'由制作者拨转成形湿泥；烧陶仍需窑火，不会自行烧制。',14,'敏捷',1],
 ['smith_hammer','锻工手锤',16,1.2,160,'bld_hw_forge',['metal','tool'],'在砧上锻打小件，握柄松动会影响落点；不能代替细工锉。',5,'力量',1],
 ['smith_tongs','长柄铁钳',12,.7,130,'bld_hw_forge',['metal','tool'],'夹持热坯，须配手锤和砧台；钳口磨平后夹持易滑。',5,'力量',0],
 ['sewing_needle','粗眼缝针',3,.005,70,'bld_hw_forge',['metal','tool'],'穿粗线缝麻袋，针尖弯折会卡在布缝中；随身持有，不由工作台凭空提供。',4,'敏捷',0],
];
const products=[
 ['oat_flatbread','燕麦薄饼',3,.12,100,'bld_hw_qingdeng',3,['food'],'干锅烙成的薄饼，可携带；厚片中心没熟不能因外皮上色当合格品。'],
 ['fruit_porridge','干果燕麦粥',7,.3,100,'bld_hw_qingdeng',1,['food'],'两碗批次里的每碗三百克，带切碎干果；须当日吃，结冻不是保鲜法术。'],
 ['fresh_curd','果醋鲜乳凝块',9,.1,100,'bld_hw_qingdeng',1,['food','milk'],'加热鲜乳并用果醋凝成的鲜乳块，每块一百克，当天食用；不是经过长日熟成的硬奶酪。'],
 ['salt_fish','短腌咸鱼',5,.25,100,'loc_hw_dock',3,['fish','food'],'小鱼经短时间盐腌形成的咸鱼，仍需冷凉保存和烹煮；不能当长航程储粮。'],
 ['wool_yarn','粗毛线团',3,.08,100,'bld_hw_weaving',180,['fiber','wool'],'八十克手纺粗毛线，用于保暖衣片和扎束；毛线弹性不同于麻织经线。'],
 ['linen_cloth','窄幅麻布',12,.4,100,'bld_hw_weaving',180,['fiber','cloth'],'一段窄幅麻布，裁成袋或包布前须量尺寸；不是无限长度的成匹布。'],
 ['tanned_leather','鞣熟软革',18,.65,120,'loc_bs',365,['leather','material'],'经过完整浸鞣、漂洗与干燥的一小张软革；用于皮袋，强度不足以冒充重甲。'],
 ['wax_candle','细蜂蜡烛',4,.015,20,'loc_hw_apiary',null,['wax','light'],'一支十五克小烛，燃烧需要灯芯；风会吹熄，密闭处点多支会积烟。'],
 ['clay_cup','小陶杯',6,.22,60,'loc_bs',null,['ceramic','container'],'小陶杯经窑烧后盛凉水，急冷急热易裂；没有保温或净水效果。'],
 ['clay_pot','素面陶罐',10,.6,70,'loc_bs',null,['ceramic','container'],'一只普通储物陶罐，口沿须配盖与封布；未经封口不能让食物长期不坏。'],
 ['iron_nail','小铁钉',1,.04,100,'bld_hw_forge',null,['metal','iron','component'],'四十克小钉固定木片，钉入前须防劈；不能代替承重梁上的锻造连接件。'],
 ['iron_hinge','门柜小铰链',26,.5,120,'bld_hw_forge',null,['metal','iron','component'],'五百克小铰链供门柜使用，须配木螺销或钉安装；表面锈会使转轴发涩。'],
 ['grain_sack','麻布粮袋',18,.32,90,'bld_hw_weaving',180,['cloth','container'],'由窄幅麻布缝成的小粮袋，装粮前应检查袋缝；带袋交易不额外复制袋中粮食。'],
];
const existingFacts={
 item_ration:['loc_bs',30,'烘干切块的混合行粮，单份二百克；受潮长霉后不能按新行粮出售。','旅人旺季需求大'],
 item_staff:['bld_hw_mill',null,'普通旧木杖用于支撑和探路；承受重击会损坏，照明术需另行施放。','全年旧物交易'],
 item_bag:['bld_hw_weaving',180,'普通布制行囊，装载仍受本人负重限制；行囊不会自行扩大容量。','春秋出行时需求多'],
 item_clothes:['bld_hw_weaving',180,'一套日常布衣，湿布须晾干；没有附带护甲、法术或额外职业名额。','换季需按厚薄挑选'],
 item_bread:['bld_hw_qingdeng',2,'普通面包是酒馆食物，单个一百五十克；表面硬化和霉斑应分开判断。','每天少量出炉'],
 item_wood:['loc_hw_northwood',365,'两公斤通用木料，未限定树种；做柄前要挑无裂段，梁材需另验承重。','冬伐存料，雨季防潮'],
 item_stone:['loc_hw_dock',null,'三公斤普通石料供补墙与配重；不是已雕刻好的器物或宝石。','低水位运输容易'],
 item_iron:['bld_hw_forge',null,'两公斤可回炉铁坯，锻件须另耗燃料；铁料不等于已成形兵器。','全年，春修农具时紧张'],
 item_herb:['bld_hw_herbs',7,'一束未分具体药种的普通药草，需辨认再配方；不直接保证治疗任何病。','生长期采集较多'],
 item_resin:['loc_hw_northwood',180,'一百克普通树脂用于黏接或引火；须核对配方，不是无限通用施法媒介。','暖季易采集'],
 item_literacy_primer:['bld_hw_school',365,'陆青所编田契识字课本，教授已有目录中的识字技能；阅读仍需相应识字基础。','学堂全年少量抄本'],
 item_whittling_knife:['loc_bs',null,'削薄木片、修木楔与小工具木柄；逆纹下刀会崩口，不适合伐木。','全年铁匠小件供货'],
 item_wooden_peg:['bld_hw_mill',365,'五十克榫用木楔用来夹紧榫口，拆卸先敲松；湿木涨缩要留余量。','修磨坊和家具时需求多'],
 item_tool_handle:['bld_hw_mill',365,'三百克通用小工具木柄供凿锤装柄；未声明树种，重斧用柄须另验。','全年木作余料加工'],
 item_wood_shavings:['bld_hw_mill',30,'一百克干木刨屑可引火或吸收少量漏液；潮湿后不保证引火成功。','木作旺季多，雨季防湿'],
};
const recipeRows=[
 ['mill_oats','筛磨燕麦粉',0,0,20,10,'woodworking',[['oats',1]],['oat_flour',1],['whittling_knife'],'先在磨坊脱壳，再用已有磨盘碾细、筛出硬壳；小刀只用于开谷袋。剩壳另入不可食废堆。','npc_hw_ayan'],
 ['bake_flatbread','烙燕麦薄饼',3,0,35,10,'cooking',[['oat_flour',1],['water',1],['salt',1],['wood_shavings',1]],['oat_flatbread',4],['cooking_pot'],'将粉、水和盐压成四片薄饼，以厚锅底小火烙到两面定形；不用酵种，不能写成发酵面包。','npc_hw_linsui'],
 ['cook_porridge','熬干果燕麦粥',3,0,25,10,'cooking',[['oat_flour',1],['water',2],['dried_fruit',1],['wood_shavings',1]],['fruit_porridge',2],['cooking_pot','kitchen_knife'],'切碎干果，水沸后缓入粉并不断搅锅底；分为两碗，锅边焦糊须弃，不混入合格份额。','npc_hw_linsui'],
 ['curdle_milk','凝制果醋鲜乳块',3,100,40,15,'cooking',[['milk',2],['fruit_vinegar',1],['charcoal',1]],['fresh_curd',2],['cooking_pot'],'鲜乳加热后少量兑醋，凝结后沥去乳清，形成两块鲜乳凝块；乳清弃置，不叫长日熟成奶酪。','npc_hw_linsui'],
 ['salt_fish','短腌小咸鱼',3,0,180,10,'cooking',[['fish',1],['salt',1]],['salt_fish',1],['kitchen_knife'],'顺鱼体划浅口，抹匀盐后放冷凉处三小时；留下的不是长期风干鱼，仍按三日保存期限处理。','npc_hw_linsui'],
 ['spin_wool','手纺粗毛线',4,0,60,10,'weaving',[['wool',1]],['wool_yarn',3],['spindle'],'梳齐羊毛并逐段牵伸，用纺锤加捻，分成三团；短毛和断头不计作线团，不冒称丝线。','npc_hw_sulan'],
 ['weave_linen','织窄幅麻布',4,100,180,15,'weaving',[['flax',2]],['linen_cloth',1],['spindle','loom'],'将已梳理纤维纺成经纬线，设经后逐行织紧，裁下规定长度；余经头弃置，不复制整匹布。','npc_hw_sulan'],
 ['dip_candles','浸制细蜂蜡烛',3,0,30,10,'cooking',[['beeswax',1],['flax',1],['charcoal',1]],['wax_candle',4],['cooking_pot'],'从麻束搓出四条细芯，在微热蜡液中反复浸挂，四支成形后放凉；余麻不生成无限灯芯。','npc_hw_anhuai'],
 ['fire_cup','拉烧小陶杯',14,100,600,15,'pottery',[['clay',1],['charcoal',2]],['clay_cup',3],['pottery_wheel'],'揉泥后拉三只小杯，低热干坯再在小窑升火烧成，缓慢冷却；裂坯与烧灰弃置，不变成可用杯。',null],
 ['fire_pot','拉烧素面陶罐',14,150,720,15,'pottery',[['clay',1],['charcoal',2]],['clay_pot',1],['pottery_wheel'],'拉出宽肚小罐，保持口沿同厚，干坯与逐步升温后缓冷；不带釉，罐盖需另配。',null],
 ['forge_nails','锻制小铁钉',5,0,80,10,'smithing',[['iron',1],['charcoal',2]],['iron_nail',40],['smith_hammer','smith_tongs'],'把铁坯拉成细条，逐节截断并锻钉头，冷却检直；氧化皮与断头不可计入四十枚成品。','npc_hw_duanyan'],
 ['forge_hinge','锻制门柜铰链',5,100,120,15,'smithing',[['iron',1],['charcoal',2]],['iron_hinge',1],['smith_hammer','smith_tongs'],'分出两片叶片与销轴，卷耳后对轴装合，开闭检验再收工；较大余料留为铁边料一份。','npc_hw_duanyan'],
 ['sew_sack','缝制麻布粮袋',4,0,45,10,'weaving',[['linen_cloth',1],['wool_yarn',1]],['grain_sack',1],['whittling_knife','sewing_needle'],'裁定袋身并穿粗眼针缝合双折口，小刀只切割布；针与小刀必须实际持有，不随成品带走。','npc_hw_sulan'],
];
const itemId=name=>name.startsWith('item_')?name:`item_${name}`;
export function economyFoundation(world){
 const baselineItems=new Map(world.items.map(row=>[row.id,row]));
 const items=Object.entries(existingFacts).map(([id,fact])=>{
    const row=baselineItems.get(id);if(!row)throw new Error(`基础物品丢失：${id}`);
    const[origin,shelfLifeDays,use,seasonality]=fact;
    // Published prose must not become input mechanics on the next build.
    const {description,inspection,storage,...mechanics}=structuredClone(row);
    return {...mechanics,origin,shelfLifeDays,use,seasonality};
 });
 for(const[short,name,basePrice,weight,durability,origin,shelfLifeDays,tags,use,seasonality]of raw)items.push({id:itemId(short),name,basePrice,weight,durability,origin,shelfLifeDays,tags,use,seasonality,quality:'木',aliases:[],scope:null});
 for(const[short,name,basePrice,weight,durability,origin,tags,use,profession,attribute,bonus]of tools)items.push({id:itemId(short),name,basePrice,weight,durability,origin,tags,use,quality:'木',aliases:[],scope:null,shelfLifeDays:null,seasonality:'全年作坊供货，维修需留出工时',checkBonus:{bonus,attributes:[attribute],skills:[`skill_life_${profession}_core`]}});
 for(const[short,name,basePrice,weight,durability,origin,shelfLifeDays,tags,use]of products)items.push({id:itemId(short),name,basePrice,weight,durability,origin,shelfLifeDays,tags,use,quality:'木',aliases:[],scope:null,seasonality:'按原料与工坊订单加工，存货不是无限供应'});
 const known=new Map(items.map(row=>[row.id,row]));
 const baselineRecipes=new Map(world.recipes.map(row=>[row.id,row]));
 const recipes=['recipe_wooden_pegs','recipe_tool_handle'].map(id=>{
    const row=baselineRecipes.get(id);if(!row)throw new Error(`基础配方丢失：${id}`);
    return structuredClone(row);
 });
 for(const[short,name,profession,minimumProficiency,minutes,difficulty,workstation,materials,output,tools,process,author]of recipeRows){
    const id=`recipe_${short}`,skill=`skill_life_${profession}_core`,bookId=`item_book_${short}`;
    const converted=materials.map(([name,amount])=>({item:itemId(name),amount}));
    const cost=converted.reduce((n,row)=>n+known.get(row.item).basePrice*row.amount,0);
    const product=known.get(itemId(output[0]));
    // Fixed economic decisions are explicit errors rather than price inflation.
    if(product.basePrice*output[1]<cost)throw new Error(`${id}成品价低于来料成本：${product.basePrice*output[1]} < ${cost}`);
    recipes.push({id,name,aliases:[],scope:null,skill,minimumProficiency,minutes,difficulty,workstation,process,
        materials:converted,tools:tools.map(itemId),output:{item:product.id,quantity:output[1]},byproducts:short==='forge_hinge'?[{item:'item_iron_scrap',amount:1}]:[],
        learningRequired:true,learnFee:4,learnMinutes:120,teachers:[],toolWear:1,failure:{recoverFraction:short==='forge_nails'||short==='forge_hinge'?.25:0,injury:short==='forge_nails'||short==='forge_hinge'?2:0},
        prerequisites:minimumProficiency?[{skill,minimum:minimumProficiency}]:[]});
    items.push({id:bookId,name:`${name}工序册`,aliases:[],scope:null,quality:'木',basePrice:12,weight:.12,durability:80,origin:'bld_hw_school',shelfLifeDays:365,
        seasonality:'学堂依订单抄写，不保证常年现货',tags:['paper','book'],use:`记载${name}的原料与完整工序；阅读要识字100，${minimumProficiency?`相关技能至少${minimumProficiency}。`:'可以从基础学习。'}不会直接赠送成品。`,
        book:{grade:'初级',author:author??'无署名旧工序抄本',edition:'河谷校订抄本第一版',origin:'bld_hw_school',teaches:[id],readingMinutes:120,prerequisites:minimumProficiency?[{skill,minimum:minimumProficiency}]:[]}});
 }
 const workstations=[
  ['bld_hw_mill','station_hw_mill_bench','woodworking','loc_hw',2],
  ['bld_hw_qingdeng','station_hw_kitchen','cooking','npc_hw_linsui',3],
  ['bld_hw_forge','station_hw_anvil','smithing','npc_hw_duanyan',4],
  ['bld_hw_weaving','station_hw_loom_table','weaving','npc_hw_sulan',2],
  ['loc_bs','station_bs_small_kiln','pottery','loc_bs',5],
 ].map(([location,id,kind,owner,fee])=>({location,id,kind,owner,fee,access:'public'}));
 return{scope:'首批日常经济机制骨架，待模型起草和人工内容审查；400物品/200配方原目标保留',items,recipes,workstations};
}
