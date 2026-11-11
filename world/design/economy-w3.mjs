import {attachPhysical} from "../../tools/item-physical-facts.mjs";
// W3 batch 1: distinct domestic products with authored process and material
// decisions. Numbers and links are fixed here; DeepSeek supplies prose only.
const groups = {
  kitchen: { station: 'cooking', skill: 3, teacher: 'npc_hw_linsui', origin: 'bld_hw_qingdeng', tools: ['cooking_pot','kitchen_knife'], injury: 0 },
  cloth: { station: 'weaving', skill: 4, teacher: 'npc_hw_sulan', origin: 'bld_hw_weaving', tools: ['sewing_needle','whittling_knife'], injury: 0 },
  wood: { station: 'woodworking', skill: 6, teacher: 'npc_hw_ayan', origin: 'bld_hw_mill', tools: ['whittling_knife'], injury: 1 },
  iron: { station: 'smithing', skill: 5, teacher: 'npc_hw_duanyan', origin: 'bld_hw_forge', tools: ['smith_hammer','smith_tongs'], injury: 2 },
  clay: { station: 'pottery', skill: 14, teacher: null, origin: 'loc_bs', tools: ['pottery_wheel'], injury: 0 },
};
// id, name, price, kg, shelf days, minutes, proficiency, inputs, purpose/process.
const rows = {
  kitchen: [
    ['oat_crisp','无盐燕麦脆片',8,.28,10,45,0,'oat_flour:1,water:1,wood_shavings:1','将粉与水压成薄片，厚锅慢烙后烘干；成品可掰碎泡汤，咸味须另加盐。'],
    ['milk_oat_mash','乳香燕麦糊',10,.55,1,25,0,'oat_flour:1,milk:1,wood_shavings:1','乳液缓缓拌入粉中，隔着锅底不停搅动，煮成可用匙舀取的稠糊；给牙口弱的食客当餐吃。'],
    ['fruit_paste','醋煮干果酱',9,.16,3,35,0,'dried_fruit:1,fruit_vinegar:1,water:1,wood_shavings:1','干果先浸软，再以果醋煮成粗酱；无糖添加，酸甜来自果肉，随餐蘸薄饼。'],
    ['fish_oat_cake','碎鱼燕麦烙饼',12,.46,1,40,100,'fish:1,oat_flour:1,salt:1,wood_shavings:1','剔去鱼刺，把鱼肉剁碎拌粉与盐，利用鱼肉水分压成薄饼，厚锅烙熟；鱼刺和焦屑弃置。'],
    ['fish_broth','清煮鱼汤',9,.65,1,30,0,'fish:1,water:2,salt:1,wood_shavings:1','剖净鱼切块煮汤，撇去浮沫后调盐，分食时仍须挑骨；清汤不含未列的药草。'],
    ['warm_vinegar_drink','温果醋饮',6,.25,1,15,0,'fruit_vinegar:1,water:1,wood_shavings:1','果醋兑清水后温热，作为带酸味的佐餐饮品；不用发酵，也无治疗用途。'],
    ['fruit_milk_pudding','干果乳粉糕',14,.48,1,50,100,'milk:1,oat_flour:1,dried_fruit:1,wood_shavings:1','切碎干果，加入乳粉稠糊，以厚锅文火凝成软糕；冷却后分切，当天吃完。'],
    ['toasted_oats','锅焙燕麦粒',6,.36,20,35,0,'oats:1,wood_shavings:1','手搓去壳后筛去轻壳，用厚锅翻焙谷粒；可煮粥，颗粒仍硬，不直接作幼儿食物。'],
    ['salted_curd','压盐鲜乳饼',22,.16,2,45,100,'fresh_curd:2,salt:1','两块鲜乳凝块捏散拌盐，以锅底压紧并沥去少量乳清；只是鲜乳饼，不经过熟成。'],
    ['fruit_oat_dumpling','干果燕麦团',11,.44,1,40,100,'oat_flour:1,dried_fruit:1,water:2,wood_shavings:1','软果碎包入粉团，投入沸水煮至中心熟透；粉团无酵种，外皮结实，沥水后食用。'],
  ],
  cloth: [
    ['linen_apron','交背麻围裙',19,.31,365,65,0,'linen_cloth:1,wool_yarn:1','裁出挡胸与裙身，用布边折成两条交背带，毛线缝接受力点；供厨房挡面粉和水点。'],
    ['pot_wrap','夹层锅布',19,.37,365,45,0,'linen_cloth:1,wool:1','麻布包住摊薄的羊毛并绗缝，折叠后隔开温热锅柄；只供短时隔热，不能抓明火里的铁钳。'],
    ['needle_roll','卷式针包',18,.18,365,40,0,'linen_cloth:1,wool_yarn:1','布条折出浅袋逐道缝合，长边卷拢系住；用来收缝针，交付时不附针。'],
    ['herb_pouch','透气药草袋',18,.19,180,35,0,'linen_cloth:1,wool_yarn:1','疏缝袋口并留穿绳通道，装已晒干且辨认好的草药；麻袋只便于透气，不延长药草自身期限。'],
    ['head_wrap','遮尘麻头巾',15,.25,365,25,0,'linen_cloth:1','整裁方布，剪出的窄边搓线锁住布边；磨坊工作时包住头发，布纹仍会透过细灰。'],
    ['wool_wristband','针缝毛腕套',16,.12,365,60,100,'wool_yarn:4','用缝针将毛线逐圈缠结，收成成对的短腕套；开口须留活动余量，不带手指部分。'],
    ['linen_filter','宽口滤布',15,.27,180,35,0,'linen_cloth:1','裁布并以边丝锁住毛边，搭在已有容器上滤出大颗粒；过滤不使水获得饮用保证。'],
    ['patch_bundle','锁边补衣片',15,.3,365,40,0,'linen_cloth:1','把布裁为不同形状的补片，边丝锁边后叠成一包；用于破衣局部修补，需另备缝线。'],
    ['flax_cord','三股麻绳',10,.23,365,50,0,'flax:2','把梳理纤维分束逐段加捻，三股反向合捻，捻尾折回；只作日常绑扎，不是攀岩保险绳。'],
    ['felt_seat','压毡坐垫',18,.47,365,90,100,'wool:2,water:2','净毛交错铺层，洒水后用手反复揉压缩合成毡；阴干后作薄坐垫，不做织纹描写。'],
  ],
  wood: [
    ['wood_spoon','偏柄木匙',8,.08,null,35,0,'wood:1','从直纹小料顺纹削出浅匙腹，柄向一侧略偏便于沿锅缘舀取；余料留作一份干刨屑。'],
    ['mixing_paddle','长柄搅糊板',9,.24,null,35,0,'wood:1','削宽而扁的头部，倒圆边角以免刮伤锅底；柄端留握持处，专供搅稠糊。'],
    ['spindle_whorl','木纺轮片',7,.08,null,35,0,'wood:1','削成圆片并从两侧刻通轴孔，试装纺锤杆时少量修孔；是替换纺轮，不附整套纺锤。'],
    ['shuttle','尖梭织纬器',9,.11,null,45,100,'wood:1','两头削尖而不留锐刺，中段挖出绕线凹槽；用于窄幅织架引纬，不承担开经。'],
    ['weaving_sword','压纬木片',9,.18,null,40,100,'wood:1','沿纹削成薄片并磨去毛刺，宽面压紧纬线；配现有织架使用，边缘不能刻齿。'],
    ['boot_form','短靴木撑',12,.65,null,70,100,'wood:1','削出圆脚背和收窄后跟，底面留平便于立放；撑住湿靴形状，尺码固定不能自行伸缩。'],
    ['darning_egg','补袜木卵',8,.15,null,40,0,'wood:1','先削椭圆再细修两端，把粗糙凸棱削平；放在袜内托住破洞，便于重新织补。'],
    ['line_winder','八字绕线板',8,.13,null,35,0,'wood:1','扁木片两端刻浅叉，侧边倒圆；渔线或纱线绕成八字，空板出售不附线。'],
    ['door_wedge','宽背门挡楔',7,.2,null,25,0,'wood:1','沿直纹削成宽斜面，后端留厚便于抽取；塞门缝以阻止轻微摆动，不代替门锁。'],
    ['seed_marker','槽头播种牌',7,.09,null,35,0,'wood:1','削出短尖脚和宽牌面，顶端刻浅槽供夹纸签；插在苗床边辨认作物，交付时空白。'],
  ],
  iron: [
    ['s_hook','双弯铁挂钩',11,.16,null,45,0,'iron_scrap:1,charcoal:1','把边料锻细，两端反向弯成钩并磨钝尖头；吊挂轻锅与器具，未设承重上限。'],
    ['iron_awl','锥尖穿孔针',12,.14,null,50,0,'iron_scrap:1,charcoal:1','边料拉出锥身，一端卷成握环，针尖留短；给皮革预穿缝孔，不能当凿石工具。'],
    ['belt_buckle','折舌腰带扣',13,.13,null,60,100,'iron_scrap:1,charcoal:1','边料锻为框环和可动舌，卷接后检验开合；扣件单卖，皮带另备。'],
    ['seam_rivet','短身皮铆钉组',14,.12,null,65,100,'iron_scrap:1,charcoal:1','锻出短杆和扁头并配小垫片，四枚为一组；用于接合皮片，夹合时须配托面。'],
    ['lamp_bracket','折臂灯托',26,.55,null,100,100,'iron:1,charcoal:2','锻弯支臂与浅托圈，尾片打出安装孔；托住已有油灯，安装钉与灯都需另备。'],
    ['fire_poker','钩头拨火杆',24,.7,null,80,0,'iron:1,charcoal:2','铁坯拉成长杆，末端弯出浅钩，另一端卷握环；拨动炉内炭块，整根无木柄。'],
    ['hearth_trivet','三脚铁锅架',29,1.35,null,130,100,'iron:1,charcoal:2','分锻托圈和三脚，热铆相接后放平试稳；供厚底煮锅离炭，不附锅具。'],
    ['chain_link_set','锻接短链节',25,1.25,null,110,100,'iron:1,charcoal:2','拉条后逐环卷合并搭接锻闭，连接成六节短链；适合门栓拉手，不作起重链。'],
    ['scraper_blade','平口刮木片',12,.15,null,60,100,'iron_scrap:1,charcoal:1,stone:1','边料展宽成薄片，以石料的粗面磨出平直刮口；刮去木面细屑，薄片两侧供手握。'],
    ['iron_ring','圆眼系绳环',10,.15,null,40,0,'iron_scrap:1,charcoal:1','拉出条料并卷成闭环，搭口在热态敲合；用于穿绳收束，安装处另配扣件。'],
  ],
  clay: [
    ['clay_bowl','敞口粗陶碗',13,.48,null,720,100,'clay:1,charcoal:2','陶轮拉敞口碗，修平圈足，完全干坯后渐升窑温并缓冷；素胎无釉，适合短时盛饭。'],
    ['clay_oil_lamp','浅腹陶油灯',14,.34,null,720,100,'clay:1,charcoal:2','拉低腹后捏出搭芯槽，修稳底足，干坯入窑烧成；空灯出售，油与灯芯另备。'],
    ['clay_funnel','短颈陶漏斗',15,.4,null,780,150,'clay:1,charcoal:2','拉出收口圆锥并保持短颈通畅，晾干后入窑缓烧；分装颗粒或凉液，窄口易积残渣。'],
    ['clay_spool','双沿陶线轴',13,.3,null,720,100,'clay:1,charcoal:2','捏成中孔短筒并加宽两端，压实连接后干坯烧成；收绕线团，交货不附线。'],
    ['clay_bead_set','串线陶珠组',14,.24,null,780,100,'clay:1,charcoal:2','把泥分成十二粒小珠，刻通穿线孔并干透，散排入窑烧成；一组十二粒，绳子另备。'],
    ['clay_lid','平钮陶盖',12,.38,null,660,100,'clay:1,charcoal:2','压出带平钮的圆盖，按素面陶罐口沿留收缩余量，干透烧成后试盖；盖合不等于密封。'],
    ['clay_dish','分格盐碟',14,.42,null,720,150,'clay:1,charcoal:2','拉浅碟并捏起一道隔棱，两侧盛不同调味料；压紧隔棱根部，干燥烧成后查底裂。'],
    ['clay_flowerpot','排水陶花盆',16,.68,null,840,100,'clay:1,charcoal:3','拉高腹盆并在底部开排水孔，盆沿卷厚，干坯烧成；育苗要另配土和种子。'],
    ['clay_roof_tile','叠搭弧瓦',14,.72,null,840,150,'clay:1,charcoal:2','把泥压成弧片，边口留叠搭阶，阴干到硬后入窑；用于局部补屋顶，铺盖须配合现有坡面。'],
    ['clay_net_weight','穿孔陶网坠',13,.55,null,720,0,'clay:1,charcoal:2','揉泥成长卵形，从中穿孔并磨平孔缘，干坯烧成；系在网下缘作配重，网和绳另备。'],
  ],
};
const id = value => `item_${value}`;
export const economyW3Supply=[{npc:'npc_hw_luqing',stock:{item_book_household_pottery:1},reason:'家用陶器旧抄本仅一册，售完需等抄写'}];
export function economyW3(world) {
  const items = [], recipes = [];
  const facts = new Map(world.items.map(row => [row.id, row]));
  for (const [category, products] of Object.entries(rows)) {
    const group = groups[category];
    for (const [slug,name,basePrice,weight,shelfLifeDays,minutes,minimumProficiency,input,processFacts] of products) {
      const materials = input.split(',').map(value => { const [name,count] = value.split(':'); return { item: id(name), amount: Number(count) }; });
      const cost = materials.reduce((sum,row) => sum + facts.get(row.item).basePrice * row.amount, 0);
      if (basePrice < cost) throw new Error(`${slug}价格低于原料成本 ${basePrice}/${cost}`);
      const inputWeight = materials.filter(row => !['item_charcoal','item_wood_shavings'].includes(row.item)).reduce((sum,row) => sum + facts.get(row.item).weight * row.amount, 0);
      if (weight > inputWeight + .001) throw new Error(`${slug}产物重量超过非燃料投料`);
      const recipeId = `recipe_w3_${slug}`;
      items.push({ id:id(slug), name, aliases:[], scope:null, quality:category==='iron'?'石':'木', weight, basePrice, durability:category==='kitchen'?100:category==='iron'?140:90,
        origin:group.origin, shelfLifeDays, seasonality:category==='kitchen'?'依厨房当日原料制作，售完后重新开工':'按工坊订单制作，工具维修季交货可能推迟',
        tags:[category==='kitchen'?'food':category==='clay'?'ceramic':category==='iron'?'metal':category==='cloth'?'fiber':'wood', 'w3_household'],
        use:processFacts, acquisition:{recipe:recipeId},
      });
      recipes.push({ id:recipeId, name:`制作${name}`, aliases:[], scope:null, skill:`skill_life_${group.skill}_core`, minimumProficiency, minutes, difficulty:minimumProficiency?15:10,
        materials, tools:[...group.tools,...(slug==='fish_broth'?['wood_spoon']:slug==='fruit_milk_pudding'?['mixing_paddle']:[])].map(id), workstation:group.station, output:{item:id(slug),quantity:1},
        byproducts:category==='wood'?[{item:'item_wood_shavings',amount:1}]:[],
        learningRequired:true, learnFee:4, learnMinutes:60, teachers:group.teacher?[group.teacher]:[], toolWear:1,
        failure:{recoverFraction:category==='iron'?.25:0,injury:group.injury},
        prerequisites:minimumProficiency?[{skill:`skill_life_${group.skill}_core`,minimum:minimumProficiency}]:[], processFacts,
      });
    }
  }
  // One authored course groups ten related ceramic processes. The book is a
  // real acquisition route where the current town has no pottery teacher.
  items.push({id:'item_book_household_pottery',name:'窑边家用陶器手记',aliases:[],scope:null,quality:'木',weight:.2,basePrice:25,durability:80,
    origin:'bld_hw_school',shelfLifeDays:365,seasonality:'小学堂按旧抄本誊写，需预约',tags:['paper','book'],
    use:'旧陶工留下的家用器形手记，记述十种陶器各自的成形难点和干坯烧成次序；识字100可读，阅读时间240分钟，具体器形仍受各配方熟练度要求限制。',
    book:{grade:'初级',author:'无署名陶工旧抄本',edition:'河湾器形校订本',origin:'bld_hw_school',teaches:recipes.filter(row=>row.workstation==='pottery').map(row=>row.id),readingMinutes:240,prerequisites:[]},
    acquisition:{seller:'npc_hw_luqing',mode:'有限抄本库存'},
  });
  return attachPhysical({items,recipes},world);
}
