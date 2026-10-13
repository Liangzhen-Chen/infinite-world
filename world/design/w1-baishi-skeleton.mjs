// T90 authors the roster locally. Model calls are factual reviews only.
export const revision='t90-baishi-1';
const pad=n=>String(n).padStart(3,'0');
const surnames='贺 顾 邵 傅 罗 夏 蔡 韩 程 魏 秦 姚 卢 谭 陆 汪 邢 钟 侯 薛 石 熊 乔 戴 彭 邓 叶 邹 郝 任 姜 潘 余 杜 钱 蒋 丁 沈 孟 田 邱 江 雷 文 苏 白 马 龚 汤 于 段 朱 金 廖 康 毛 洪 袁 尹 赖 阎 陶 邝 崔 武 费 高 郭 翁 柳 纪 滕 梅 柯 鲍 季 裴 舒 曲 苗 倪 闵 祝 童 包 司 蓝 蒲 莫 艾'.split(' ');
const given=['澄','绵','笙','砺'];
export const districts=[
 ['hebu','河埠街',[23.7,-.3],'码头与船户','清晨缆绳擦过石桩，岸边常有湿木气味。'],
 ['zhanxi','栈西街',[23.7,.1],'货栈与车运','车轮压过碎石，门边挂着写有货主姓名的木牌。'],
 ['guanqian','官前街',[24,.25],'官署与户籍','午前有人候着递纸，屋檐下留着供等候者坐的矮凳。'],
 ['nanshi','南市街',[24,-.25],'市集与食业','晨间能闻到热麦饼，摊布卷起后露出磨平的石沿。'],
 ['luxiang','炉巷',[24.3,-.25],'手工行会','锤声隔着院墙传来，巷口的灰尘带着炭味。'],
 ['dongxue','东学街',[24.3,.25],'寺庙与学馆','门廊的读书声时断时续，东门风把纸角吹得翻起。'],
];
// name, district, function, opening minutes, interior, entrance rule
const buildings=[
 ['dock','河埠交接棚',0,'船货交接',[360,1200],'系缆石桩、交接桌','棚外可询问船期，货物由货主交接。'],
 ['boat','船户会屋',0,'船户约期',[480,1080],'船期板、旧桨架','前厅听取来意，借桨须问物主。'],
 ['weigh','河埠验秤房',0,'货重核对',[480,1080],'秤架、刻度样板','可在前厅等候，秤具须由当值人操作。'],
 ['store','栈西货栈',1,'商货暂存',[420,1140],'交接廊、封袋货架','前厅开放，内库由保管人带入。'],
 ['carter','栈西车行',1,'车运联络',[420,1140],'候车凳、车轮架','先在门边约车，车具仍归物主。'],
 ['guild','商旅行会联络处',1,'货单与担保联络',[480,1080],'货单桌、担保人名簿','可询问代理，签约以当事人实际同意为准。'],
 ['office','白石镇公署',2,'户籍与公事登记',[480,1020],'递件窗、公开事项板','前厅递件；案卷房由保管人带入。'],
 ['watch','镇巡值房',2,'巡更交接',[480,1080],'值更板、失物登记桌','可在前厅报失，值房不授予外人执法权。'],
 ['hall','街议厅',2,'街区公议',[480,1080],'长桌、意见匣','可递交意见，议事不得替私人物主作决定。'],
 ['market','南市棚',3,'市集摊位交接',[360,1140],'摊位石沿、遮雨棚','营业时可走动，摊货须向卖家购买。'],
 ['oven','南市麦饼铺',3,'食物售卖联络',[360,1140],'柜台、烘饼间门帘','前厅可询价，内灶须店主同意。'],
 ['inn','南市客舍',3,'旅人住宿联络',[420,1260],'柜台、候客长凳','前厅可候客，客房依房客及店主许可。'],
 ['smith','炉巷铁作坊',4,'金属修补联络',[480,1080],'接件桌、旧工具架','先在接件桌说明用途，工位由匠人安排。'],
 ['potter','炉巷陶作屋',4,'陶工行会联络',[480,1080],'样坯架、交件桌','可问陶工工序，镇内小窑仍在镇口公共处。'],
 ['cloth','炉巷缝织屋',4,'布衣修补联络',[480,1080],'接衣柜台、布样架','衣物按物主分包，不因挂在架上而可取。'],
 ['school','东街学馆',5,'识字与抄录联络',[480,1080],'字样板、前厅书桌','前厅可问学，未成年学徒只安排日常学习。'],
 ['temple','东街灯祠',5,'送行与灯会联络',[420,1140],'灯架、避风门廊','门廊可歇脚，供灯须先问保管人。'],
];
const trades=[
 ['系缆与装卸','船具修补','码头计数'],['货栈交接','车运安排','货单抄写'],
 ['户籍抄录','公署递件','巡更交接'],['麦饼烘制','摊位整理','客舍洗晒'],
 ['铁件修补','陶坯制作','衣物缝补'],['学馆抄录','灯祠照看','字样板描写'],
];
const traits=[['仔细','怕吵'],['急性子','念旧'],['好面子','守时'],['健谈','怕欠情'],['节俭','固执'],['谨慎','爱插话']];
const concerns=[
 ['想把自家晾绳挪离落水台，怕晒好的衣物又湿。','担心下一趟接货时没人帮看门，想先问同户的空闲。','正在核对自己记下的船期，怕把午后的约见写早。'],
 ['想请同户另找放车轮的角落，门边现在不好转身。','惦记窗缝漏风，打算问补木条要多少工钱。','怕交件单的折角遮住货主姓名，想换一种折法。'],
 ['想腾出晚饭前的时间，把自家散开的旧纸重新夹好。','怕递件的人误认屋门，准备给家门添一条布记号。','挂心夜更回来太响，想同家人商量开门的办法。'],
 ['惦记自家晾布与邻户的雨棚挨得太近，想商量移位。','担心洗晒的衣物混进别家的包，打算缝上姓氏记号。','怕晚饭前买不到惯用的菜，想把买菜时辰提前。'],
 ['想把接件时辰写在门板上，免得家人替自己反复答话。','挂心旧围裙的绑带松了，打算收工后自己补上。','担心家中泥屑蹭到衣料，想把用过的鞋留在门外。'],
 ['怕家中抄纸被风吹散，打算请同户帮忙压住纸角。','惦记门廊漏雨，想先看看雨水从哪道瓦缝进来。','希望傍晚能留一小块安静桌面，重描没认准的字。'],
];
const features=['袖口用深色线补了一道','讲话前会把指尖擦在围裙边','腰带上系着一小片刻姓木牌','帽檐折出一条浅白线','鞋带两端打着不同大小的结','衣襟夹着折成窄条的旧纸','拎篮时总把提手转向左边','眉尾有一小块浅色旧疤','外衣扣子有一枚比别的颜色深','说话时会把垂下的袖角卷起来'];
const ageBucket=a=>a<18?'children':a<35?'youngAdults':a<60?'adults':'elders';
const ages=people=>people.reduce((s,p)=>(s[ageBucket(p.age)]++,s),{children:0,youngAdults:0,adults:0,elders:0});
function route(from,to,locations){const a=locations.find(l=>l.id===from),b=locations.find(l=>l.id===to);return{id:`route_t90_${to}_${from}`,from,to,lengthKm:Math.hypot(a.coordinates[0]-b.coordinates[0],a.coordinates[1]-b.coordinates[1]),terrainMultiplier:1,modes:['walk'],closedSeasons:[],toll:0,risk:0};}

export function baishiSkeleton(world){
 const oldTown=world.locations.find(l=>l.id==='loc_bs'),oldYan=world.npcs.find(p=>p.id==='npc_hw_yanzhe');
 if(!oldTown||!oldYan||!world.locations.some(l=>l.id==='bld_bs_shrine'))throw Error('白石既有接点缺失');
 const locations=districts.map(([key,name,coordinates,purpose,sense])=>({id:`loc_bs_${key}`,name,coordinates,parent:'loc_bs',scope:'loc_bs',aliases:[],terrain:'平地',openHours:[0,1440],purpose,owner:'loc_bs',rooms:[],inventory:{},description:`${name}是白石镇的${purpose}街区。${sense}街面可通行，入户先在门前招呼。`}));
 for(const [key,name,d,purpose,openHours,interior,rule] of buildings){const center=districts[d][2];locations.push({id:`bld_bs_${key}`,name,parent:`loc_bs_${districts[d][0]}`,scope:'loc_bs',aliases:[],coordinates:[center[0]+.025,center[1]+.025*(1+buildings.filter(b=>b[2]===d).findIndex(b=>b[0]===key))],terrain:'平地',openHours,purpose,owner:'loc_bs',rooms:[{id:`room_bs_${key}_front`,name:'公开接洽前厅',purpose:interior,access:'营业时接洽；内室和财物另须许可'}],inventory:{},description:`${name}用于${purpose}，可见${interior}。${rule}前厅接洽时间为每日${openHours[0]/60}时至${openHours[1]/60}时，打烊后另约。`});}
 const households=[],residents=[],kinship=[];
 for(let h=1;h<=90;h++){
  const district=Math.floor((h-1)/15),size=h<=36?4:3,home=`bld_bs_home_${pad(h)}`,house=`house_bs_${pad(h)}`;
  // Yan's household has four adult lodgers, not invented parents or spouse.
  const memberAges=h===1?[30,32,29,26]:h>=75?[72+(h%5),46+(h%5),43+(h%5)]:[44+h%7,41+h%7,h<=7?22:15,...(size===4?[11]:[])];
  const members=memberAges.map((_,j)=>h===1&&j===0?oldYan.id:`npc_bs_${pad(h)}_${j+1}`);
  households.push({id:house,settlement:'loc_bs',homeLocation:home,members,tenure:h===1?'严辙与三名成年住客分间居住；登记不认定房屋产权。':'本户共居私宅；户籍不合并成员钱物，不补写买卖或租金债务。'});
  for(let j=0;j<memberAges.length;j++){
   if(h===1&&j===0)continue;
   const age=memberAges[j],name=`${surnames[h-1]}${given[j]}`,occupation=age<18?'日常识字与家中轻活':trades[district][(h+j)%3];
   residents.push({id:members[j],name,aliases:[],tier:'roster',age,sex:j%2?'女':'男',culture:'culture_river',settlement:'loc_bs',scope:'loc_bs',householdId:house,household:members.filter(id=>id!==members[j]),occupation,traits:traits[(h+j)%traits.length],home:{location:home,access:'同户共居；进入私宅须先取得成年住户的有效许可。'},location:home,flags:{minor:age<18,romanceable:age>=18},currentConcern:age<18?`想在家人忙完${trades[district][h%3]}以后，请他们看看自己没认准的字。`:concerns[district][(h+j)%3],visibleFeature:`${features[(h*3+j)%features.length]}。`});
  }
  if(h>1&&h<75)for(const child of members.slice(2))for(const parent of members.slice(0,2))kinship.push({parent,child});
  const center=districts[district][2],col=(h-1)%5,row=Math.floor(((h-1)%15)/5);
  locations.push({id:home,name:`${h===1?'严辙合住':surnames[h-1]}户居处`,parent:`loc_bs_${districts[district][0]}`,scope:'loc_bs',aliases:[],coordinates:[center[0]-.04-.018*col,center[1]-.04-.018*row],terrain:'平地',openHours:[0,0],purpose:'私宅',owner:null,access:{mode:'private',requiresConsent:true,residents:members},rooms:[{id:`room_bs_home_${pad(h)}_common`,name:'共用起居间'},{id:`room_bs_home_${pad(h)}_sleep`,name:'分间睡处'}],inventory:{},description:`这处私宅是${members.map(id=>id===oldYan.id?'严辙':residents.find(p=>p.id===id).name).join('、')}的登记住处。门前可招呼，入屋须成年住户许可；同户钱物分别归各自持有人。`});
 }
 const yan={...structuredClone(oldYan),settlement:'loc_bs',householdId:households[0].id,household:households[0].members.filter(id=>id!==oldYan.id),home:{...oldYan.home,location:households[0].homeLocation}};
 const town={...structuredClone(oldTown),scope:'loc_bs',description:'白石镇口连接官道和六条街区。公共小窑工作台仍在镇口，陶作屋可询问工序；白石归途殿仍在东门附近，登记条件沿用原规则。'};
 const registered=ages([...residents,yan]),pending={children:210,youngAdults:140,adults:280,elders:64},ageStructure=Object.fromEntries(Object.keys(registered).map(k=>[k,registered[k]+pending[k]]));
 const publicIds=[...buildings.map(b=>`bld_bs_${b[0]}`),'bld_bs_shrine'];
 const profile={id:'loc_bs',parent:'loc_capital',population:1000,householdCount:300,registeredPopulation:306,pendingPopulation:694,registeredHouseholdCount:90,pendingHouseholdCount:210,registrationMode:'seeded-on-demand',populationSeed:'t90-baishi-population-1',residentIds:[yan.id,...residents.map(p=>p.id)],visitors:[],commuters:[],externalRelatives:[],facts:['白石镇登记306人90户，另有694人210户按稳定种子待生成；总计1000人300户。','待生成户为146个三人户及64个四人户；生成时须从剩余人口与年龄配额扣除，不计入当前名册。','严辙为本镇居民，同时保留每五天往返河湾的既有安排。','登记住宅按90个已登记户落地；210个待生成户的住宅随实际生成落地。'],kinship,coordinates:oldTown.coordinates,terrain:'平地',climate:'河谷温带，冬季湿冷，夏季常有阵雨。',buildingIds:[...publicIds,...households.map(h=>h.homeLocation)],ageStructure,registeredAgeStructure:registered,pendingAgeStructure:pending,pendingProfileSections:['seed住户及住宅按需生成','名册升为完整档','镇公共生产库存税贸账尚未接运行时','官署裁决和节俗传播尚未接运行时']};
 const issueRows=[
  ['码头雨棚占交接道','bld_bs_dock',0,'希望卸货时留出通道','希望等船的家属能避雨','把等候凳移到棚边，由船户先试走满载交接路线。','移凳须在场者同意，雨斜时棚边仍会淋湿。','按船次错开等候与卸货，由计数人记录使用时段。','误船时需要另约，不能保证每天都按时。'],
  ['货单日期抄在折角','bld_bs_guild',1,'希望每张单能直接看到日期','希望保留货主自己的折法','先请货主核对日期，再另写一份公开交接摘要。','摘要须货主认可，额外抄写占用代理时间。','在接货时展开原单，当面读明交货日再封回。','每次需当事人在场，不能代替正式担保。'],
  ['递件窗与夜更板混用','bld_bs_office',2,'希望递件号按先来顺序','希望夜更交接不挤进候件队','把递件与夜更各用半张板，清楚标出当值时段。','板面变小，长案由仍要另存案卷。','夜更在值房交接，公署只接收最终简记。','多一道递送手续，迟交不能当作已登记。'],
  ['摊布挡住雨水沟','bld_bs_market',3,'希望摊货不被过路泥水溅到','希望雨水沟能露出便于清理','市日前由摊主把布边抬高，留出可检查的沟口。','需要摊主自己提供支物，无法保证大雨无积水。','将靠沟摊位轮换到棚内，由双方试用一旬再议。','棚内位置有限，搬运的工夫仍由当事人商量。'],
  ['陶泥鞋印带进缝织屋','bld_bs_cloth',4,'希望接衣处保持干净','希望交陶坯时不用绕远路','请陶工在门外换下沾泥鞋，再由物主亲自交件。','要自备净鞋，不承诺缝织屋额外看管鞋物。','把两家的交件时段错开，门外单留一张接件凳。','时段冲突须再约，凳子使用需保管者同意。'],
  ['学馆门廊读字与送灯重叠','bld_bs_school',5,'希望傍晚留安静桌面','希望送灯的人能避风等候','把读字安排在前厅，送灯在灯祠门廊约定等候处。','两个地点各有保管人，须分别商量开放时间。','门廊分早晚时段，先读字后送灯，逐旬核对人数。','迟到者要另约，不能让学徒独自值守到深夜。'],
 ];
 const adultFor=d=>residents.filter(p=>p.age>=18&&Math.floor((Number(p.householdId.slice(-3))-1)/15)===d).slice(0,2);
 const problems=issueRows.map((r,i)=>({id:`problem_bs_${i+1}`,title:r[0],location:r[1],status:'unresolved',public:true,stakeholders:adultFor(r[2]).map((p,j)=>({person:p.id,position:r[3+j]})),options:[{proposal:r[5],costOrLimit:r[6]},{proposal:r[7],costOrLimit:r[8]}]}));
 const rumors=problems.flatMap((p,i)=>[{id:`rumor_bs_${i+1}_a`,claim:`${p.title}仍待商量。`,truth:'true',source:p.stakeholders[0].person,carriers:[p.stakeholders[0].person],witnesses:[p.stakeholders[1].person],sourceProblem:p.id,fact:`${p.title}的两方尚未达成解决约定。`,verification:'向两名当事人分别问清各自需要。',status:'authored-seed',propagation:'pending-event',distortion:'可能把提议误说成已经完成。'},{id:`rumor_bs_${i+1}_b`,claim:i%2?'公署能替所有住户同意入屋。':'只要登记了职业，就能从行会领走工具。',truth:'false',source:p.stakeholders[1].person,carriers:[p.stakeholders[1].person],witnesses:[p.stakeholders[0].person],sourceProblem:p.id,fact:i%2?'入屋须成年住户有效许可，公署登记不替住户同意。':'职业名册不生成工具或可领取库存。',verification:i%2?'核对具体住宅的成年住户许可。':'问物主并核对实际库存与交接记录。',status:'authored-seed',propagation:'pending-event',distortion:'把场地登记误说成财物或入户授权。'}]);
 profile.details={id:profile.id,name:'白石镇',parent:profile.parent,coordinates:profile.coordinates,terrain:profile.terrain,climate:profile.climate,population:1000,householdCount:300,ageStructure,outsiderRatio:null,outsiderRatioReason:'现有名册登记住处与职业，未登记每人的迁入来源；不能由姓氏推算外来比例。',buildingIds:profile.buildingIds,economy:{industries:['船货与车运','木料亚麻收购','铁陶缝织修补','市集食物与旅宿'],production:null,publicStock:null,priceFactor:null,tax:null,tradePartners:['loc_hw','loc_bs_yupo','loc_bs_weiting','loc_bs_liquan','loc_bs_sangban'],status:'pending-ledger',reason:'镇经济以既有实际库存和合同交易为准。小窑使用费5铜；严辙200铜及商品库存沿用旧档，每五天往返河湾收木料与亚麻。新行业场所不赠物，不虚设生产数字或公库，镇税章与公共收支另待接账。'},governance:{coordinators:[adultFor(2)[0].id,adultFor(2)[1].id],meetingPlace:'bld_bs_office',meeting:'公署前厅递件，街议厅按议题约各方到场；名册责任人须升档并实际在场后办事。',customs:['户籍窗口登记住址与同户索引，身份争议保存原件待核。','镇巡值房接报失与巡更交接，定罪移交既有司法流程。','商旅行会联络处核货单与担保，铁陶织联络点只安排当事人商量工序。'],head:null,enforcers:[],authority:'本卡登记官署职责和联络人员，未授予名册居民可执行官职；镇长任命、税章和裁决权限待正式接入。'},problems,rumors,calendar:{marketDays:world.rules.calendar.marketDays,marketLocation:'bld_bs_market',marketNote:'????5?15?25????????????????',festivals:[{name:'东街送灯日',month:12,day:25,location:'bld_bs_temple',host:adultFor(5)[0].id,status:'custom-only',practice:'家户自愿带自家灯到门廊等候，保管人先询问放置位置；不自动出灯或出席。'}]},sensory:{seasonal:['春雨打湿河埠石阶，木牌上的墨字有人用布遮着。','夏午后棚布热得发闷，车行门边常有人避日头。','秋风吹过晾布绳，栈西车轮碾得碎石轻响。','冬天公署檐下漏风，等候者把纸件藏进衣襟。'],daily:['清晨麦饼铺先有火光，河埠有人检查绳结。','午前递件窗外有人等候，字样板旁传来低声跟读。','傍晚炉巷锤声稀了，门板陆续盖上接件时间。','夜里街面安静，镇口小窑和殿门仍按各自原有规则使用。']},hiddenPlaces:[{id:'hidden_bs_guild',location:'bld_bs_guild',name:'货单桌背面的浅夹格',knownBy:[oldYan.id],detail:'?????????????????',clue:'????????????',status:'unregistered-feature',access:'夹格仅为外观细节，没有独立路线或赠送财物；检看桌面与单据仍须保管人同意。'}],pendingProfileSections:profile.pendingProfileSections};
 const allLocations=[...world.locations.filter(l=>l.id!==town.id),town,...locations];
 const routes=locations.map(l=>route(l.parent,l.id,allLocations));
 routes.push(route('loc_bs_dongxue','bld_bs_shrine',allLocations));
 const entries=[...residents.map(d=>({id:d.id,kind:'resident',draft:d})),...locations.map(d=>({id:d.id,kind:'location',draft:d})),{id:'loc_bs',kind:'town',draft:town},{id:'profile_bs',kind:'profile',draft:profile},{id:'contact_bs_yanzhe',kind:'contact',draft:yan}];
 const promotionGroups=Array.from({length:3},(_,g)=>({id:['dock','office-market','guild-school'][g],ids:residents.filter(p=>p.age>=18&&Math.floor((Number(p.householdId.slice(-3))-1)/30)===g).slice(0,33).map(p=>p.id)}));
 return{residents,households,locations,routes,profile,yan,town,entries,promotionGroups};
}
