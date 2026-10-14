// T102 authored candidates: furnace work, airflow and water/earth spells for the
// Baishi Taoist, martial and alchemy teachers plus three bookshop volumes.
// Mechanics stay in the existing consumers (magic-object, magic-air,
// magic-water-earth); DeepSeek only reviews these fixed drafts.
export const revision='w2-s2-1';

const DAO='npc_bs_077_1',WU='npc_bs_079_1',DAN='npc_bs_078_1',SELLER='npc_hw_luqing';
export const routes={
 道:{profession:'profession_taoist',teacher:DAO,material:'item_s2_talisman',phrase:'一张朱砂黄符'},
 武:{profession:'profession_swordsman',teacher:WU,material:'item_s2_talc',phrase:'一小包滑石粉'},
 丹:{profession:'profession_life_8',teacher:DAN,material:'item_charcoal',phrase:'一份木炭'},
 法:{profession:'profession_mage',teacher:null,material:'item_charcoal',phrase:'一份木炭'},
 通:{profession:null,teacher:null,material:'item_charcoal',phrase:'一份木炭'},
};
const open={river:'public',city:'public',port:'public'},guarded={river:'consent',city:'permit',port:'permit'},personal={river:'consent',city:'consent',port:'consent'};
const support={targeting:{lineOfSight:true,consent:'support_magic'}};
export const routeOf={};
const spell=(key,name,route,stage,mp,minutes,duration,rangeMeters,effectSpec,effect,extra={})=>{
 const r=routes[route],id=`spell_s2_${key}`;routeOf[id]=route;
 const {law=open,...rest}=extra;
 return {id,name,aliases:[],scope:null,skill:`skill_s2_${key}`,stage,mp,minutes,duration,durationLimit:duration,rangeMeters,
  difficulty:stage?15:10,materials:[{item:r.material,amount:1}],mechanism:effectSpec.operation,effectSpec,effect,
  learnFee:stage?40:12,learnMinutes:stage?240:120,teachers:r.teacher?[r.teacher]:[],law,...rest};
};
const object=(operation,power,limitC)=>({kind:'object',operation,power,...(limitC===undefined?{}:{limitC})});
const heat=(operation,power,extra={})=>({kind:'heat',operation,power,...extra});
const air=(operation,power)=>({kind:'air',operation,power});
const earth=(operation,power)=>({kind:'water_earth',operation,power});

export const spells=[
 // 炼丹控火：舒澄在东街学馆丹房授课。
 spell('even_fire','匀炉调火','丹',1,8,2,60,3,object('craft_heat',1000,120),'对燃烧中、登记温区与裂损规则的丹炉，最多60分钟内随实际燃烧每分钟附加至多1000焦耳（炉温不超过120摄氏度），并拉近最热与最冷炉壁温区；不添燃料。'),
 spell('bellows_fire','武火催炉','丹',1,7,1,30,3,object('forge_heat',3000,120),'对燃烧中且仍有燃料的炉子，最多30分钟内每分钟附加至多3000焦耳，炉温到120摄氏度为止；燃尽或熄火即停，不改变炉壁温差。'),
 spell('slow_fire','文火省炭','丹',0,3,1,60,3,object('fuel',100),'现有炉火最多60分钟内少烧一成燃料，每分钟有效热量不变；不点火、不补燃料。'),
 spell('wall_trace','炉壁炭线','丹',0,2,1,0,0,{kind:'object',operation:'sense_heat',power:1,surface:true},'直接接触登记温区的炉壁，读出整体与各温区温度，并留下可复查的炭线记录；不改变炉温。'),
 spell('smoke_vent','丹房排烟','丹',0,4,1,5,3,air('smoke',2000),'沿登记房间的连通出口每分钟把起点房间的烟最多引走2000毫克，最多5分钟；现有空气按容量回流，不灭烟源，关门或石墙阻断。'),
 // 道门制符：裴澄在芦衡观授课，施术耗一张朱砂黄符。
 spell('fire_seal','镇火符','道',1,6,2,20,3,heat('contain_fire',1,{upkeepMp:1}),'封住一间登记房间最多20分钟：屋内相连燃物不再蔓火，通风停止，火只耗屋内现有空气；每分钟维持1点魔力，离场、失常或魔力不足即失效。'),
 spell('fire_line','火线符','道',1,6,1,10,3,heat('barrier',5000),'点燃登记的两米地面引火草线（燃料干燥未燃且不超过5000毫克），最多10分钟内阻挡横穿的近处行路；燃尽即熄，可用实际水浇灭。',{law:guarded}),
 spell('hush','静声符','道',0,3,1,5,3,air('quiet',80),'一间登记房间最多5分钟内压低经过的声音80点声量，传话、呼喊与警号同受影响。'),
 spell('wind_block','阻风符','道',1,7,1,5,3,air('area_wind',5),'在登记道路段起逆风最多5分钟，期间沿该路出入的行程多花至多5分钟，施术者与同行者同样受阻。',{law:guarded}),
 spell('water_veil','水帘符','道',0,4,1,3,3,earth('veil_water',1000),'从三米内水缸暂取1000毫升现有水，在登记窄通道挂水帘最多3分钟，遮挡穿过的视线并削弱声音，水声五米内可闻；期满或被切断后水回原缸。'),
 spell('bank_hold','固堤符','道',1,6,1,10,3,earth('levee',50),'登记土埂最多10分钟内冲刷量减半，流向下方淤泥处的土减少；期满照常冲刷，不修补缺口。'),
 spell('altar_level','整坛符','道',1,6,1,0,3,earth('level_ground',4),'把不超过四平方米、高差1至10厘米的登记设坛地表土一次整平，高差归零；地下根系与管道照旧留在原处，冻土与基岩不行。'),
 spell('seam_seal','泥缝符','道',0,3,1,10,3,earth('mud_seal',5),'取三米内黏土200克封住压力不超过5千帕的登记裂缝，最多10分钟止漏；须至少每3分钟察看一次，否则提前失效。'),
 // 武者器用：曲澄在量廊武馆授课，施术耗一小包滑石粉。
 spell('arrow_turn','拨矢风','武',0,4,1,2,3,air('deflect',60),'本人或同意者最多2分钟内，射向其身的轻型投射物更难命中，越重的箭矢受影响越小。',support),
 spell('light_drop','落叶身','武',0,3,1,2,3,air('slow_fall',80),'本人或同意者最多2分钟内从实际高处跳下，坠落伤害只剩两成；携带超过20千克不能承托。',support),
 spell('held_breath','闭息囊','武',1,6,1,1,3,air('air_bubble',600),'从三米内洁净可呼吸的登记房间封取600毫克现有空气围住本人或同意者口鼻，最多1分钟，用尽即散，不多造空气。',support),
 spell('wind_listen','听风辨位','武',0,2,1,0,3,{kind:'air',operation:'sense_air',power:1},'读出登记房间当下风向，并沿相连出口听出路径尽头的回声延迟；关门或石墙截断。'),
 spell('warm_palm','暖掌活腕','武',0,2,1,30,0,heat('warm',1000,{limitC:38}),'本人或同意者的手掌最多30分钟内回暖，掌温不超过38摄氏度，可接触较凉的登记器物传热；不烫伤、不点火。'),
 spell('stone_wedge','开石楔劲','武',1,7,1,0,3,earth('fracture',5),'沿登记岩石已有裂隙施劲，裂隙加宽5毫米、完整度减5；登记的相邻结构同受5点震损。'),
 spell('water_rope','水索缠腕','武',1,7,1,2,3,earth('bind_water',2000),'从目标三米内水源暂取2000毫升现有水，缠住视线内一肢或不超过2千克的未固定轻物，最多2分钟内挪不开；风刃可断，期满水回原处。',{law:personal,targeting:{lineOfSight:true}}),
 spell('mire_step','陷足泥','武',1,6,1,5,3,earth('mud_trap',4),'登记湿泥地最多5分钟内更易陷脚：范围内交手吃亏，横穿多花至多2分钟；铺板或离开湿泥即可摆脱，施术者同样受困。',{law:guarded}),
 // 法师读本（陆青书铺）。
 spell('lift','托物风柱','法',0,3,1,2,3,air('lift',2000),'把三米内一件不超过2千克、未固定的登记轻物托高1米，最多2分钟后落回；两米内松散轻物被卷开1米。'),
 spell('dust_sweep','拂尘风','法',0,2,1,0,3,{kind:'air',operation:'clean_air',power:1000},'吹走登记物件表面至多1000毫克松散尘土，尘土进入相连房间的空气；牢固污渍不受影响。'),
 spell('voice_lane','顺风传声','法',0,2,1,0,3,{kind:'air',operation:'carry_voice',power:80},'沿登记房间连通出口送出一句不超过80字的话，路径上靠近各处的人都能听见；水帘与静声会削弱。'),
 spell('echo_probe','砾声探空','法',1,6,1,0,3,earth('survey_earth',3),'读出登记岩体三米深以内各层深度、岩性与空隙，并带实测误差；更深处听不出。'),
 spell('ore_band','矿纹显露','法',1,6,1,0,3,earth('ore',1),'显出登记岩体一米深以内的矿物条带，只看不采。'),
 // 通用读本（陆青书铺），无职业限制。
 spell('grain_dry','摊谷排湿','通',0,4,1,10,3,air('dry_grain',1000),'已翻动摊开的登记谷堆最多10分钟内每分钟排出至多1000毫克水分进入相连房间空气；出口须敞开，空气饱和或谷堆封起即停。'),
 spell('soil_read','辨壤','通',0,1,1,0,3,earth('sense_soil',1),'读出三米内登记土样的质地、湿度与板结程度，不说明归属。'),
 spell('loosen','松土','通',0,4,1,0,3,earth('till',4),'把不超过四平方米的登记耕土板结度降低40个百分点并记为已耕作；不排石、不播种，冻土与基岩不行。'),
 spell('wall_load','承重辨纹','通',0,2,1,0,3,earth('structural_sense',1),'读出登记梁架当下的实际受力、承载、超载量与完整度，只读不修。'),
];

// [theory, casting, counter, socialConsequences]
const texts={
 even_fire:['匀炉调火作用于仍在燃烧、登记了炉壁温区与裂损规则的丹炉，最多60分钟。燃料每烧一分钟，术式便随之送入至多一千焦耳热量，炉温不超过120摄氏度，同时把最热与最冷的炉壁温区各拉近一些；炉火熄灭或燃料烧尽时不再起作用。','用一份木炭在炉门两侧各划一道横线，站在三米内看清炉身，手掌由热的一侧向冷的一侧缓推。须先取得炉主许可，炉中也要有正在燃烧的实际燃料。','冷炉、熄火或没有登记温区的炉子不能调匀，术式也不替炉中添一块炭。','学馆丹炉归舒澄照管，借炉调火要先问过炉主。温区调匀能减少烘丹时的焦裂，但丹丸成不成仍看配方和手艺，不能把一次调火说成保证成丹。'],
 bellows_fire:['武火催炉为正在燃烧且仍有燃料的炉子每分钟附加至多三千焦耳热量，炉温到120摄氏度便不再加热，最多30分钟。燃料烧尽、火被浇熄或期满后不再供热；炉壁各温区之间的温差不因此改变。','耗一份木炭在掌心捻碎，对准三米内看得清的炉口连推三次。动手前确认炉主同意，炉膛里已有实际燃烧的炭火。','冷炉或炭已烧尽的炉子不能催火，浇灭炉火后效果也随之中止。','催火能让丹炉更快升到烘丹所需的温度，却要另外守着炉温别越过配方上限。借用别人的炉子须先得同意，炉中添炭仍按实际用量自备。'],
 slow_fire:['文火省炭让一口已经燃烧的炉火在最多60分钟内少烧一成燃料，每分钟送进炉中的有效热量保持原样。它不点火、不补炭，炉火熄灭后效果不再起作用。','耗一份木炭在炉门上划一道细长的缓纹，站在三米内对着炉火徐徐收掌。须先得炉主许可，并确认炉中正有实际燃烧。','未燃的炉子无从省炭；炉温能升多少仍由原有火势决定。','长时间烘药时可省下一些木炭。省下的燃料仍留在炉中，炉主若要收回余炭，应等火熄、炉冷后再清点。'],
 wall_trace:['炉壁炭线须直接接触登记了温区的炉壁，读出炉身整体温度和各温区的温度，并在壁上留下一道可再查看的炭线记录。它只读温度，不改变炉温或温区之间的差。','取一份木炭，沿炉壁从一侧画到另一侧，手指始终贴着炉身。炉主同意后再下笔。','隔空看炉、没有登记温区的器物或缺少木炭时，都读不出温区差。','炭线记录可供炉主和同伴事后核对温差，帮助判断要不要先调匀炉火。它不说明炉壁有无暗裂，修炉仍要请匠人察看。'],
 smoke_vent:['丹房排烟沿登记房间相连的出口，把起点房间里的烟每分钟引走至多两千毫克，一段段送往外面，最多5分钟；外侧现有的空气也会按容量回流进来。它不灭烟源，出口被关上或被石墙隔断时气流就停下。','耗一份木炭在门框上画一道向外的引线，站在三米内依次指过丹房、前廊和后院。私人房间须先得主人许可，并说清烟要从哪个出口出去。','封闭的房间没有去处可引；炉火仍在冒烟时，烟还会继续生出。','烘丹时排烟能让丹房好待一些，但烟会被送进前廊和后院，过路的人也会闻到。选出口时要顾及邻近的人。'],
 fire_seal:['镇火符贴在一间登记的房间里，最多20分钟内封住屋中气流：屋内相连燃物之间不再蔓火，通风随之停止，正在烧的火只能用屋里现有的空气，空气耗尽就熄。维持期间每分钟另付一点魔力。','取一张朱砂黄符贴在门楣，站在三米内看清屋内，压掌封门。须得房主许可；施术者离开此地、失去正常状态或魔力不够时，符力提前散去。','离开所在地、失去正常状态或魔力不足都会让符力中断；屋外的火不在其内。','符房里香炉靠近旧纸架，封屋能防火星引燃纸堆。封屋同时闷住了屋里的空气，门内若有人，需先请其出屋。'],
 fire_line:['火线符点燃登记好的一段两米地面引火草线，草线里的燃料须干燥未燃且不超过五千毫克。燃着的火线挡住横穿它的近处行路，最多10分钟后熄止；燃料提前烧完也会熄灭，用实际的水也能浇灭。','把一张朱砂黄符压在草线一端，站在三米内看清整条线，指尖沿线一划。草线属观里所有，点火前要得到主人同意。','潮湿、已燃或燃料过多的草线点不起来，旁人可以绕行或泼水浇灭。','火线只用来暂隔近处来人。点在别人要走的路上会让人受阻，城中这样做须先有许可；火熄后草线要重新铺。'],
 hush:['静声符在一间登记房间里压低声响，最多5分钟。经过这间屋的说话、呼喊和警号都减弱八十点声量，本来不大的声音就传不出去。','取一张朱砂黄符贴在屋内梁下，站在三米内看清整间屋，以两指按住符脚。须先得房主许可。','声音不经过这间屋就不受影响；符力只到期满为止。','抄符时可挡住外头传来的嘈杂，也会挡住屋里的呼救声。用在别人屋里要先说清用途，不能借它掩盖争执。'],
 wind_block:['阻风符在登记的一段道路上吹起逆风，最多5分钟。这段时间里沿这条路出入的行程多花至多5分钟，施术者本人和同行者走这段路也一样受阻。','取一张朱砂黄符压在路边石下，站在三米内对着路面挥袖三次。','绕开这段路或等符力过去即可；风只拖慢行程，不把人吹倒。','观门外的土路是镇上公用的，城里拦路须先有许可。阻风只能拖住片刻，不能当作关门闭户的手段。'],
 water_veil:['水帘符从三米内的水缸取一千毫升现有水，挂在登记的窄通道上，最多3分钟。水帘遮住穿过通道的视线，也削弱穿过它的声音；水帘自身哗哗作响，五米内的人都听得见。期满或水帘被切断，水就回到原来的水缸。','取一张朱砂黄符浸湿一角，贴近通道一侧，站在三米内引水上扬。水缸和通道都要先得主人许可，缸里的水须够一千毫升。','风刃能把水帘切断；通道过宽或水量不足时挂不起来。','水帘能暂挡来人视线，响声却会暴露所在。借别人的水缸要说明用量，期满后水仍回到缸里。'],
 bank_hold:['固堤符让一段登记的土埂在最多10分钟内冲刷量减半，流到下方淤泥处的土随之变少。期满后照常冲刷，已经冲走的土不会回来，缺口仍要挑土修补。','取一张朱砂黄符插在埂顶，站在三米内看清埂身与下方淤泥处，掌心向下按稳。土埂主人须先同意。','没有实际冲刷的土堆用不上；符力过后流失照旧。','渠水急时，可替修埂的人争出片刻。符不能代替挑土，也不能当作土埂已经修好的凭据。'],
 altar_level:['整坛符把一块不超过四平方米的登记设坛地一次整平，原有一至十厘米的高差归零，表土仍是原来那些土，只是摊平。地下的树根和埋管照旧留在原处，冻住的地和露出的基岩整不动。','取一张朱砂黄符压在地块中央，站在三米内看清四角，掌心贴地向外推平。设坛地属观里，须先得主人许可。','面积过大、高差超过十厘米或已经平整的地用不上；冻土和基岩也不行。','观里设坛前可省下夯土的工夫，但坛基是否牢靠仍要匠人另行夯实。整平别人的地要先说清用途，免得被当作侵占。'],
 seam_seal:['泥缝符取三米内黏土堆里二百克黏土，封住压力不超过五千帕的登记裂缝，最多10分钟内止住渗漏。封泥须至少每3分钟察看一次，没人察看就会提前失效。','取一张朱砂黄符包住一团黏土，站在三米内按在裂缝上。水缸、承水盆和黏土堆都要先得主人许可。','压力过高或黏土不够二百克时封不住；无人察看时封泥会先失效。','修缸前可暂时止漏，已经漏到承水盆里的水并不会回到缸中。封泥只是暂补，缸主仍要请匠人修缝。'],
 arrow_turn:['拨矢风在本人或经本人同意的同伴身边扰动气流，最多2分钟内使射向此人的轻型投射物更难命中。箭矢越重，受影响越小。','在掌心抹一小包滑石粉，绕身前划一个圈，指向三米内要护的人。替同伴施术须先取得其本人同意。','对近身刀剑没有用处；风势只护所选之人。','护送行路时能替同伴挡些冷箭，却不能让人刀枪不入。替别人施术前要说清，免得对方以为自己有了万全之防。'],
 light_drop:['落叶身让本人或经同意的同伴在最多2分钟内从实际高处跳下时，坠落伤害只剩原来的两成。身上携带超过二十千克时无法承托。','在两腕抹一小包滑石粉，站在三米内看清要护的人，双臂向下轻摆。替别人施术须先得其同意。','负重过多、超过时限或并未从高处跳下时都用不上。','练功高台上可借它练习下跳，搬重货的人却不能靠它从屋顶跳下。替同伴施术要提醒其卸下重物。'],
 held_breath:['闭息囊从三米内一间洁净、可呼吸的登记房间封取六百毫克现有空气，围在本人或同意者口鼻处，最多1分钟。这份空气用完就失效，用力时消耗得更快，术式不会多造出空气。','在鼻翼两侧抹一小包滑石粉，深吸后看向三米内的房间收拢双掌。房间须得主人许可，替同伴施术还须取得其本人同意。','房间有烟、有尘或空气不足时取不出气囊；时限一到便散。','穿过浓烟前可撑住片刻。它只够很短的时间，同伴仍须尽快离开险处。'],
 wind_listen:['听风辨位在一间登记房间读出当下的风向，并沿相连的出口听出路径尽头那一处的回声延迟。关闭的出口或石墙会截断回声；它只听不改，不惊动风势。','在耳后抹一小包滑石粉，站在三米内侧耳面向房间静听。只读风声，不必向房主讨要使用许可。','房间之间的出口关闭或被石墙隔开时，回声就到此为止。','练步时可凭风向调整站位，也能先听出外场是否空旷。它不辨认人声，不能拿来偷听别人说话。'],
 warm_palm:['暖掌活腕让本人或经同意者的手掌在最多30分钟内逐分钟回暖，掌温不超过38摄氏度；暖掌可以接触较凉的登记器物，把一部分热传过去。它不会烫伤人，也点不着火。','把一小包滑石粉搓在掌心，双手相合按住要暖的手。替别人暖掌须直接接触，并先得其本人同意。','器物比掌心还热时传不过去热量；期满后手掌慢慢回到平常温度。','冬日练兵器前可先活开手腕，也能替冻僵的同伴暖手。替人暖掌要先问过，免得对方误会。'],
 stone_wedge:['开石楔劲顺着登记岩石上已有的裂隙施劲，裂隙加宽五毫米，岩石完整度减去五点；登记为相邻的结构也同受五点震损。没有现成裂隙的石头无从下手。','在掌缘抹一小包滑石粉，站在三米内看准裂隙，以掌缘沿缝连劈。石头属武馆，须先得馆主许可。','完整无缝的石头和已经裂得过宽的石头都用不上。','外场试劲石供学员练劲用，裂开后要等馆主换石。对别人的墙基施劲会震伤邻近结构，先要问过主人。'],
 water_rope:['水索缠腕从目标三米内的水源取两千毫升现有水，缠住视线内一肢或一件不超过两千克的未固定轻物，最多2分钟内使其挪不开。水索被风刃切断或期满后，水回到原处。','在腕上抹一小包滑石粉，对准视线内的目标一抖手腕，引水成索。借用水槽须先得主人许可。','水不够两千毫升或水源离目标太远时成不了索；风刃可将其切断。','练功时可先用木桩试索。未经同意缠住别人的手脚就是对人动手，不能拿来对付没有同意的人。'],
 mire_step:['陷足泥让一片登记的湿泥地在最多5分钟内更易陷脚：站在泥坑范围里的人交手时脚下吃亏，横穿泥坑的人多花至多2分钟。铺上木板或走出湿泥便可摆脱，施术者自己踏入也一样受困。','把一小包滑石粉撒在泥坑边缘，站在三米内看清泥面，掌心向下一压。泥坑属武馆，须先得馆主许可。','泥地不够湿或已铺上木板时不起作用。','武馆用它练习泥地步法。设在别人必经的路上会害人陷足，城里这样做须先有许可。'],
 lift:['托物风柱把三米内一件不超过两千克、未固定的登记轻物托高一米，最多2分钟后落回原处。旋风同时把两米内松散的轻物卷开一米。','耗一份木炭在地上画一个小圈，站在三米内对着轻物向上一引。','固定的、超重的或已有风柱托着的物件托不起来。','晾药竹匾可借风柱换个高度，但旁边散放的轻物会被卷乱，事先要收好。'],
 dust_sweep:['拂尘风吹走登记物件表面至多一千毫克松散尘土，尘土散进与它相连的房间空气里。牢固的污渍不受影响，物件本身也不会因此受损。','耗一份木炭在物件旁划一道短弧，站在三米内顺着尘面轻吹。','没有松散浮尘或缺少相连空间时吹不动；牢固污渍要另行清洗。','前廊挂帘可借它除尘，扬起的灰会落进廊里，打扫前要请旁人避开。'],
 voice_lane:['顺风传声沿登记房间的连通出口送出一句不超过八十字的话。路径上靠近各处的人都能听见，不只指定的收听者；水帘和静声会削弱或截断声音。','耗一份木炭在门框画一道顺风线，站在三米内对着起点房间清楚说出要传的话。','出口关上或被石墙隔断时声音传不过去；话一说出就收不回。','学馆里可借它从前廊叫人回来。说出的话谁都可能听到，不宜传私事。'],
 echo_probe:['砾声探空敲出登记岩体三米深以内的岩层回声，读出各层的深度、岩性和其中的空隙，结果带着这块岩体实测的误差；更深处的岩层听不出来。','耗一份木炭在岩面点三个点，站在三米内依次叩击，再侧耳收声。','没有岩层回声记录的松土无从探测；误差由岩体本身决定，熟练也消不掉。','挖窖、凿井前可先探明浅处是否有空洞。读数只说明三米以内，不能拿来担保更深处安全。'],
 ore_band:['矿纹显露显出登记岩体一米深以内的矿物条带，只看不采。取矿仍要开凿和冶炼，更深处的矿脉显不出来。','耗一份木炭沿岩面画一道竖线，站在三米内用掌心顺线抹过。','岩面没有可见矿物条带时一无所得。','学馆用露头岩坎教学生认矿。显出矿纹不代表有权开采，采矿仍须向地主或官署问明。'],
 grain_dry:['摊谷排湿让已经翻动摊开的登记谷堆在最多10分钟内每分钟排出至多一千毫克水分，送进相连房间的空气里。房间须有敞开的出口；空气中的水汽饱和或谷堆封起后不再排湿。','先亲手把谷翻开摊平，再耗一份木炭在谷筛边画一道风纹，站在三米内掌心向外推送。','未翻动的谷、封起的谷或闷着的屋子都排不出湿气。','雨季晾谷时可加快一些，翻谷仍要人手来做。谷物属学馆公用，取用仍按原规矩。'],
 soil_read:['辨壤读出三米内登记土样的质地、湿度和板结程度，只读不改，也不说明土地归谁。','耗一份木炭在土面写一个小记号，站在三米内抓起一把土捻开。','没有质地记录的土样读不出结果。','下种前可以先看看土况。读数不能当作地契，也不替人决定该种什么。'],
 loosen:['松土把不超过四平方米的登记耕土板结度降低四十个百分点，并记为已经耕作。它不排石、不播种，冻土和基岩也松不动。','耗一份木炭在土畦四角各点一下，站在三米内双手向上一抖。','面积超过四平方米、冻结或露出基岩的地松不开。','后院试种土畦可借它省些锄地的力气，播种、除石仍要自己动手。'],
 wall_load:['承重辨纹读出登记梁架当下的实际受力、承载、超载多少和完整度，只读不修。','耗一份木炭在梁身画一道细纹，站在三米内顺着纹路望去。','没有登记受力的物件读不出数据；修梁仍要材料和匠人。','堆货前可先看前廊横梁还能不能多放。读数只说明此刻，不担保日后不坏。'],
};
const key=s=>s.id.slice('spell_s2_'.length);
export function spellDraft(s){
 const i=spells.findIndex(row=>row.id===s.id),[theory,casting,counter,socialConsequences]=texts[key(s)],r=routes[routeOf[s.id]];
 const failed=[`纹路散开时，已花的魔力、${r.phrase}和施法时间仍计入这一次尝试，目标没有新的术式效果。`,`若收束没有成功，本次魔力与${r.phrase}仍已用去，施法时间也不会退回，目标不获得这次效果。`,`手势未能闭合时，此次所用魔力和${r.phrase}已消耗，时间照常过去；没有新的效果留在目标上。`][i%3];
 return {id:s.id,prose:{theory,casting,failure:failed,counters:[counter,`施法前若魔力或${r.phrase}不足，就无法开始这次施术。`],socialConsequences,
  proficiencyEffects:['初学时先核对对象和条件，再练习把手势完整收束。','练熟之后，符合条件的尝试更容易完成，失败仍承担同样消耗。','进一步熟练能改善成功把握，不能越过距离或对象边界。','熟练不改变固定施法时间、用量和效果期限，也不赋予额外能力。']},source:structuredClone(sources.mappings[i])};
}

// Three bookshop volumes for the mage and general spells.
const volumes=[
 ['air','风力与传声读本',0,['lift','dust_sweep','voice_lane']],
 ['stone','岩层回声读本',1,['echo_probe','ore_band']],
 ['farm','谷土梁架读本',0,['grain_dry','soil_read','loosen','wall_load']],
];
export const books=volumes.map(([k,name,stage,keys])=>({id:`item_book_s2_${k}`,name,aliases:[],scope:null,quality:'木',durability:80,weight:.2,basePrice:stage?80:24,tags:['paper','book'],origin:'bld_hw_school',shelfLifeDays:365,seasonality:'现有抄本售罄后不自动补货',
 book:{grade:stage?'中级':'初级',author:'未署名抄本',edition:'白石分题习术本',origin:'bld_hw_school',teaches:keys.map(k=>`spell_s2_${k}`),readingMinutes:stage?240:120,prerequisites:[]}}));

const mapping=s=>{
 const r=routes[routeOf[s.id]],b=books.find(b=>b.book.teaches.includes(s.id));
 return {spell:s.id,book:b?.id??null,teacher:r.teacher,sourceOwner:b?SELLER:r.teacher,minimumLiteracy:b?100:null,requiresCertification:s.stage&&r.profession?r.profession:null,
  readingMinutes:b?.book.readingMinutes??null,teachers:s.teachers,
  skill:{id:s.skill,name:s.name,aliases:[],scope:null,attribute:'精神',profession:r.profession,stage:s.stage,action:'cast',description:`用于施展${s.name}，材料及效果以对应法术为准。`,learnFee:s.learnFee,learnMinutes:s.learnMinutes,prerequisites:[],combatAction:null}};
};
export const sources={books:books.map(item=>({item,stock:{owner:SELLER,item:item.id,quantity:2}})),mappings:spells.map(mapping)};

export function bookDraft(b){
 const names=b.book.teaches.map(id=>spells.find(s=>s.id===id).name).join('、'),stage=b.book.grade==='中级';
 return {id:b.id,prose:{description:`这册未署名抄本收录${names}。识字达到100并持有完好的书，才可每次用${b.book.readingMinutes}分钟研读一种；${stage?'这些一阶法术还须有法师认证。':'书中均为零阶法术，研读不需职业认证。'}阅读失败仍花去时间，书与购书成本不会退还。`,
  inspection:'逐页对照标题和篇末，检查有无缺页、大片洇墨或错接的书帖。抄本的笔迹只说明书写习惯，不能据此认定未署名作者的身份。',
  storage:'翻页前擦净手上的泥灰，读后合进干燥书匣。用纸条标出篇次，避免折角遮住施术条件；存放时远离炉火与潮湿的墙角。'}};
}

// Materials, alchemy herbs and products. Prose is reviewed with the batch.
const item=(id,name,weight,basePrice,tags,extra,prose)=>({id,name,aliases:[],scope:null,quality:'木',weight,basePrice,durability:100,origin:'loc_bs',shelfLifeDays:365,seasonality:'常年少量供应',tags,...extra,_prose:prose});
const itemRows=[
 item('item_s2_yellow_paper','黄表纸小帖',.02,2,['paper','talisman'],{acquisition:{seller:DAO,mode:'有限库存'}},{
  use:'四张裁好的黄表纸，供画朱砂黄符；受潮起皱的纸吃不住墨。',
  description:'芦衡观备下的黄表纸，四张一帖，每张约一掌半长、一掌宽，纸面微黄，正面较光，背面略带纤维。纸质薄而有韧性，适合细笔勾画；整帖用棉线轻轻捆住，便于取用。',
  inspection:'对着光看纸面有无破洞和水渍，再轻折一角，折痕不起毛、松手后不断裂的才合用；起皱或发软的纸画符时容易洇开。',
  storage:'平放在干燥的匣里，上面压一块薄板，避开水汽与炉火；受潮的纸要摊开阴干，不能在火边烘。'}),
 item('item_s2_cinnabar','朱砂小包',.01,6,['mineral','pigment'],{acquisition:{seller:DAO,mode:'有限库存'}},{
  use:'十克研细的朱砂粉，调水后作画符用的朱砂墨；含汞，不可入口，研调时别扬起粉尘。',
  description:'一小纸包研得极细的朱砂，色呈鲜红，略有光泽，捻在指间细滑无砂粒。朱砂是含汞的矿物，在观里只作画符的颜料使用，研调时用小碟加少许清水。',
  inspection:'打开纸包看颜色是否鲜红均匀，有无掺进灰土或暗色颗粒；用小指沾少许在纸上一抹，颜色鲜明、不带粗砂的为好。',
  storage:'包紧后放进有盖的小瓷盒，与食物分开存放，远离孩童；用后洗手，调剩的朱砂墨倒进专用碟里，不倒入水缸。'}),
 item('item_s2_talisman','朱砂黄符',.005,2,['paper','talisman'],{durability:50,shelfLifeDays:180,acquisition:{recipe:'recipe_s2_talisman'}},{
  use:'一张画好的朱砂黄符，施展芦衡观所授符术时耗用一张；符纸本身不发任何效果。',
  description:'在黄表纸上用朱砂墨画成的符，笔划连贯，红线清楚，纸边留出供压按的空白。每张符只在施术时耗用一次，平时只是一张画了字样的纸。',
  inspection:'看红线有无断笔、洇开或剥落，纸面有无折破；笔划断续或纸已破损的符不宜用来施术。',
  storage:'夹在干燥书页或符匣里，不要折叠，避开潮湿和火星；存放180天后纸色发暗，宜先用新符。'}),
 item('item_s2_talc','滑石粉小包',.005,1,['mineral','martial'],{acquisition:{seller:WU,mode:'有限库存'}},{
  use:'五克滑石细粉，抹在手掌、腕上或兵器握处防滑；量廊武馆所授术法施展时耗用一小包。',
  description:'用薄纸包起的滑石细粉，色白而滑，手指一捻便留下一层粉。武馆学员练兵器前常抹在掌心，吸去汗水，握柄不易打滑。',
  inspection:'打开纸包看粉色是否洁白，有无结块和杂质；结块说明受了潮，捻开后仍可用，混进砂粒的不宜抹手。',
  storage:'放在有盖的木盒里，远离水槽和湿泥坑；用时在下风处轻抹，不要扬到别人脸上。'}),
 item('item_s2_tinder','艾绒引火包',.004,1,['fuel','fiber'],{acquisition:{seller:DAN,mode:'有限库存'}},{
  use:'四克捶软晒干的艾绒，放进登记炉具作引火料，再用点火的法子点着；受潮的艾绒点不起来。',
  description:'把晒干的艾叶反复捶打、筛去碎末后得到的绒团，色灰黄，质地蓬松，用纸包成小包。艾绒容易引着，燃起后火头不大，适合先引着炉中的小火。',
  inspection:'捏一下是否蓬松干爽，闻起来应有艾叶的气味；发潮、结团或有霉味的艾绒不容易点着。',
  storage:'装在干燥的罐里盖紧，远离炉口火星和水汽；与炭分开放，免得炭灰混进绒里。'}),
 item('item_s2_huangjing','制黄精片',.05,4,['herb','alchemy'],{shelfLifeDays:180,acquisition:{seller:DAN,mode:'有限库存'}},{
  use:'五十克蒸晒过的黄精切片，作蜜丸配料；不单独当药服用。',
  description:'黄精的根茎经反复蒸晒后切成的厚片，色黑褐，断面带油润光泽，嚼之微甜。学馆炼丹课用它与茯苓、甘草配伍做补养蜜丸，按包称量出售。',
  inspection:'看切片是否干透、色泽均匀，断面不发白、不生霉点；闻起来应有淡淡的甜香，有酸味或霉味的不能入药。',
  storage:'装在纸袋里放进带盖的木箱，置阴凉干燥处，防潮防虫；180天内用完，受潮发黏时摊开阴干后再收。'}),
 item('item_s2_fuling','茯苓块',.05,4,['herb','alchemy'],{shelfLifeDays:365,acquisition:{seller:DAN,mode:'有限库存'}},{
  use:'五十克切好的茯苓块，作蜜丸配料；不单独当药服用。',
  description:'茯苓是寄生在松根上的菌核，削去外皮后切成小方块，色白质坚，捏之不散，入口淡而微黏。炼丹课上把它研成细粉，与黄精、甘草同用。',
  inspection:'看块面是否洁白，有无发黄、虫眼或霉斑；敲开后断面细腻，用手捻不粘手的为好。',
  storage:'放在干燥阴凉处的瓷罐里，罐口用纸封好，防潮防虫；受潮后容易发霉，发霉的整块弃去。'}),
 item('item_s2_gancao','甘草片',.02,2,['herb','alchemy'],{shelfLifeDays:365,acquisition:{seller:DAN,mode:'有限库存'}},{
  use:'二十克甘草切片，在蜜丸里调和诸药；不单独当药服用。',
  description:'甘草根斜切成的椭圆薄片，外皮红棕，切面淡黄，有放射状纹理，嚼之味甜。蜜丸配方里用量不多，主要用来调和其他药味。',
  inspection:'看切面是否黄白清楚，有无黑心和霉点；味道应甜而不苦，发苦或有霉味的弃用。',
  storage:'装纸袋放在干燥处，与潮湿的药材分开；虫蛀的片子挑出另放。'}),
 item('item_s2_pill','黄精茯苓蜜丸',.003,6,['medicine','alchemy'],{shelfLifeDays:180,acquisition:{recipe:'recipe_s2_pill'}},{
  use:'一粒约三克的蜜丸，供日常补养调理；不治急病、不解毒，也不能代替医师诊治。',
  description:'把制黄精、茯苓、甘草研粉，用滤过的蜂蜜调成药泥，搓丸后放在学馆丹炉上隔火烘成。成丸色深褐，表面微亮，闻之有蜜香和淡淡药味；炉温不匀时一部分丸子会焦裂报废，不计入成品。',
  inspection:'看丸子是否圆整、颜色均匀，有无焦黑、开裂或发霉；掰开一粒，内里应软硬一致、不夹生粉。',
  storage:'装进有盖的瓷瓶，放阴凉干燥处，180天内服完；受潮发黏或有霉味的整瓶弃去。'}),
];
export const items=itemRows.map(({_prose,...row})=>row);
export const itemProse=Object.fromEntries(itemRows.map(r=>[r.id,r._prose]));
export function itemDraft(i){return{id:i.id,prose:structuredClone(itemProse[i.id])};}

export const recipes=[
 {id:'recipe_s2_talisman',name:'画朱砂黄符',aliases:[],scope:null,skill:'skill_taoist_combat_01',minimumProficiency:0,minutes:40,difficulty:10,
  materials:[{item:'item_s2_yellow_paper',amount:1},{item:'item_s2_cinnabar',amount:1}],tools:['item_ink_brush'],location:'bld_bs_reed_dao',
  output:{item:'item_s2_talisman',quantity:4},byproducts:[],learningRequired:true,learnFee:12,learnMinutes:60,teachers:[DAO],toolWear:1,failure:{recoverFraction:0,injury:0}},
 {id:'recipe_s2_pill',name:'烘制黄精茯苓蜜丸',aliases:[],scope:null,skill:'skill_life_8_core',minimumProficiency:0,minutes:40,difficulty:15,
  materials:[{item:'item_s2_huangjing',amount:2},{item:'item_s2_fuling',amount:2},{item:'item_s2_gancao',amount:1},{item:'item_honey',amount:1}],tools:[],workstation:'pill_furnace',location:'bld_bs_school',
  output:{item:'item_s2_pill',quantity:10},byproducts:[],learningRequired:true,learnFee:20,learnMinutes:60,teachers:[DAN],toolWear:0,failure:{recoverFraction:0,injury:0}},
];
export const recipeProse={
 recipe_s2_talisman:'在芦衡观符案上，用短毫画笔蘸朱砂调成的符墨，在一帖四张黄表纸上依次画成四张黄符；笔划断续或墨色不匀时整帖作废，纸和朱砂都不退回。',
 recipe_s2_pill:'把制黄精片、茯苓块和甘草片研成细粉，与滤蜜调成药泥搓成十粒蜜丸，放在东街学馆丹炉上隔火烘40分钟；整段时间炉火须在燃烧，炉温保持在70至140摄氏度之间，炉壁温区不匀时一部分丹丸会焦裂。',
};
export function recipeDraft(r){return{id:r.id,prose:{process:recipeProse[r.id]}};}

// Registered scene objects at the three Baishi institutions.
const water=(capacityMl,waterMl)=>({capacityMl,waterMl,turbidity:0,saltMg:0,toxinUg:0,pathogenRisk:0,odor:'无明显气味'});
const f=(id,name,kind,owner,access,position,state,extra={})=>({id:`feature_s2_${id}`,name,aliases:[],kind,owner,access,position,state,...extra});
const thermal=(model,fuelMg)=>({thermalModel:{ambientC:20,efficiencyPermille:900,ashPermille:50,ignitionMaximumMg:5000,ignitable:true,dryable:false,fuels:[],...model},thermalInitial:{temperatureC:20,fuelMg,moistureMg:0}});
const room=(model,exits,extra={})=>({airModel:{hearingRadiusMeters:2,...model},links:{exits},...extra});
const charcoal={item:'item_charcoal',milligramsPerUnit:250000},tinder={item:'item_s2_tinder',milligramsPerUnit:4000};
export const placements={
 bld_bs_school:[
  f('pill_room','学馆丹房','room',DAN,'consent',[0,0],{},room({capacityMg:400000,ventilationMgPerMinute:50,vaporCapacityMg:200000,windVector:[0,1],echoDelayMs:20},['feature_s2_school_hall'],{fireLinks:[['feature_s2_pill_furnace','feature_s2_coal_box']]})),
  f('school_hall','学馆前廊','room','loc_bs','public',[1,0],{},room({capacityMg:400000,ventilationMgPerMinute:2000,vaporCapacityMg:400000,windVector:[1,0],echoDelayMs:30},['feature_s2_school_yard'])),
  f('school_yard','学馆后院','room','loc_bs','public',[2,0],{},room({capacityMg:1000000,ventilationMgPerMinute:50000,vaporCapacityMg:1000000,windVector:[1,1],echoDelayMs:60},[])),
  f('pill_furnace','学馆丹炉','object',DAN,'consent',[0,0],{},thermal({heatCapacityJPerC:1000,maximumC:400,passiveExchangeJPerMinute:1500,burnMgPerMinute:100,fuelJPerMg:20,fuels:[charcoal,tinder],wallOffsetsC:[-5,5],kiln:{safeGradientC:6,safeRiseCPerMinute:4,crackPermillePerStress:3}},0)),
  f('coal_box','丹房炭箱','object',DAN,'consent',[0,.5],{},thermal({heatCapacityJPerC:5000,maximumC:100,passiveExchangeJPerMinute:100,burnMgPerMinute:1,fuelJPerMg:1,efficiencyPermille:1,ashPermille:0,ignitionMaximumMg:1,ignitable:false},0)),
  f('grain_sieve','前廊晾谷筛','grain','loc_bs','public',[1,1],{moistureMg:50000,turned:false,exposed:false},{links:{air:'feature_s2_school_hall'}}),
  f('dusty_curtain','前廊积尘挂帘','prop','loc_bs','public',[1,.5],{looseDustMg:20000,stainMg:300,material:'cloth',integrity:100},{links:{air:'feature_s2_school_hall'}}),
  f('herb_tray','前廊晾药竹匾','prop','loc_bs','public',[1,-.5],{massMg:800000,heightMeters:0}),
  f('loose_tags','竹匾旁散放药签','prop','loc_bs','public',[1.5,-.5],{massMg:1000,loose:true}),
  f('school_beam','前廊承重梁','structure','loc_bs','public',[1,-1],{integrity:2000,loadKg:400,capacityKg:600}),
  f('trial_plot','后院试种土畦','soil','loc_bs','public',[2,-1],{...water(200000,60000),baseMoisturePercent:15,moisturePercent:30,worked:false,texture:'loam',compactionPercent:70,areaM2:4}),
  f('rock_ledge','后院露头岩坎','rock','loc_bs','public',[2.5,0],{integrity:3000,crackMm:1,echoErrorMeters:.5,
   strata:[{depthMeters:.5,material:'砂岩',echoMs:8,gap:false},{depthMeters:1.5,material:'页岩夹层',echoMs:15,gap:true},{depthMeters:4,material:'深层灰岩',echoMs:40,gap:false}],
   oreBands:[{depthMeters:.3,mineral:'褐铁矿细带'},{depthMeters:5,mineral:'方铅矿脉'}]},{links:{structures:[]}}),
 ],
 bld_bs_reed_dao:[
  f('talisman_room','芦衡观符房','room',DAO,'consent',[0,0],{},room({capacityMg:200000,ventilationMgPerMinute:1000,vaporCapacityMg:200000,windVector:[0,1],echoDelayMs:25},['feature_s2_dao_court'],{fireLinks:[['feature_s2_incense_burner','feature_s2_paper_rack']]})),
  f('dao_court','芦衡观前庭','room','loc_bs','public',[2,1.5],{},room({capacityMg:1000000,ventilationMgPerMinute:50000,vaporCapacityMg:1000000,windVector:[1,0],echoDelayMs:50},[])),
  f('incense_burner','符房铜香炉','object',DAO,'consent',[0,0],{},thermal({heatCapacityJPerC:500,maximumC:300,passiveExchangeJPerMinute:200,burnMgPerMinute:20,fuelJPerMg:20,ashPermille:100,fuels:[tinder]},4000)),
  f('paper_rack','符房旧纸架','object',DAO,'consent',[1,0],{},thermal({heatCapacityJPerC:2000,maximumC:600,passiveExchangeJPerMinute:300,burnMgPerMinute:200,fuelJPerMg:15,efficiencyPermille:800,ashPermille:80,dryable:true},60000)),
  f('fire_strip','观前引火草线','object',DAO,'consent',[0,1],{},{...thermal({heatCapacityJPerC:200,maximumC:600,passiveExchangeJPerMinute:100,burnMgPerMinute:300,fuelJPerMg:15,efficiencyPermille:500,ashPermille:100,dryable:true,fuels:[tinder]},3000),fireLine:{end:[2,1],exitTo:[]}}),
  f('gate_road','观门土路','road','loc_bs','public',[0,2],{resistanceMinutes:5},{links:{route:'route_bld_bs_reed_dao'}}),
  f('side_passage','观门侧廊','passage',DAO,'consent',[1,1],{widthMeters:1.2}),
  f('water_jar','观门水缸','container',DAO,'consent',[1,.5],water(50000,30000)),
  f('ditch_bank','观后渠埂','levee',DAO,'consent',[2,0],{earthGrams:50000000,erosionGramsPerMinute:20,erodedGrams:0},{waterEarthProcess:'erosion',links:{silt:'feature_s2_bank_silt'}}),
  f('bank_silt','渠埂下淤泥','silt_heap',DAO,'consent',[2,.5],{siltGrams:0}),
  f('altar_ground','观中设坛地','soil',DAO,'consent',[0,-1],{...water(100000,20000),baseMoisturePercent:15,moisturePercent:25,worked:false,texture:'loam',areaM2:3,reliefCm:6,soilVolumeLitres:300,roots:['老槐根须'],pipes:[]}),
  f('cracked_vat','后院裂缝水缸','seam',DAO,'consent',[1,-1],{...water(20000,15000),pressureKpa:3,leakMlPerMinute:5},{waterEarthProcess:'leak',links:{drain:'feature_s2_vat_basin'}}),
  f('vat_basin','裂缝承水盆','container',DAO,'consent',[1.5,-1],water(20000,0)),
  f('clay_heap','观后黏土堆','soil',DAO,'consent',[2,-1],{...water(100000,20000),baseMoisturePercent:20,moisturePercent:40,worked:false,texture:'clay',clayGrams:100000}),
 ],
 bld_bs_measured_hall:[
  f('practice_corridor','练步长廊','room',WU,'consent',[0,0],{},room({capacityMg:300000,ventilationMgPerMinute:3000,vaporCapacityMg:300000,windVector:[1,0],echoDelayMs:30},['feature_s2_outer_court'])),
  f('outer_court','武馆外场','room',WU,'consent',[2,0],{},room({capacityMg:1000000,ventilationMgPerMinute:50000,vaporCapacityMg:1000000,windVector:[1,1],echoDelayMs:60,hearingRadiusMeters:3},[])),
  f('rope_post','缠索木桩','prop',WU,'consent',[1,0],{massGrams:1500,integrity:100,material:'wood'}),
  f('wash_trough','洗手水槽','container',WU,'consent',[1,1],water(40000,20000)),
  f('mud_pit','外场湿泥坑','soil',WU,'consent',[2,1],{...water(100000,60000),baseMoisturePercent:20,moisturePercent:70,worked:false,texture:'loam',compactionPercent:30,areaM2:3,radiusMeters:1}),
  f('trial_stone','外场试劲石','rock',WU,'consent',[2,-1],{integrity:5000,crackMm:2},{links:{structures:[]}}),
  f('jump_platform','练功高台','ledge',WU,'consent',[0,1],{fallHeightMeters:3}),
 ],
};
export const stations={bld_bs_school:[{id:'station_s2_pill_furnace',kind:'pill_furnace',owner:DAN,access:'public',fee:4,thermalRequirement:{feature:'feature_s2_pill_furnace',minimumC:70,maximumC:140,burning:true}}]};

// Teaching and stock added to existing residents; reviewed prose stays unchanged.
export const mentors={
 [DAO]:{teach:[...spells.filter(s=>routeOf[s.id]==='道').map(s=>s.id),'recipe_s2_talisman'],inventory:{item_s2_yellow_paper:6,item_s2_cinnabar:3,item_s2_talisman:4,item_s2_tinder:4,item_ink_brush:1}},
 [WU]:{teach:spells.filter(s=>routeOf[s.id]==='武').map(s=>s.id),inventory:{item_s2_talc:10}},
 [DAN]:{teach:[...spells.filter(s=>routeOf[s.id]==='丹').map(s=>s.id),'spell_s1_tinder','recipe_s2_pill'],inventory:{item_s2_huangjing:6,item_s2_fuling:6,item_s2_gancao:4,item_honey:3,item_s2_tinder:6,item_charcoal:6}},
};
