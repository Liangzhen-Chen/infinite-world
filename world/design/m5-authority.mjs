// T123 (C1) governance authority sources. Skeletons are hand-designed and
// decide every number, holder, place and power; prose only explains them.
// Published into rules.governance.authority by tools/m5-authority.mjs.
export const VILLAGES=Object.freeze(['loc_bs_yupo','loc_bs_weiting','loc_bs_liquan','loc_bs_sangban']);
export const REGISTRAR_OCCUPATIONS=Object.freeze(['公署递件','户籍抄录']);

const superiors=[
 {id:'auth_bs_office_charter',kind:'superior',name:'白石镇公署任免章',
  skeleton:{institution:'白石镇公署',seat:'bld_bs_office',registrars:{workplace:'bld_bs_office',occupations:[...REGISTRAR_OCCUPATIONS]},
   jurisdiction:[...VILLAGES],appoints:['office_works_deputy','office_village_head'],decisionAfterDays:3,reviewEveryDays:30,
   removal:['犯罪裁定','任期届满','成年住户反对多于支持'],forwards:['auth_capital_title_registry'],
   duties:['收任职、封地申请并登记原件','按贡献、原头人举荐与住户意见作出任免','每月复核在任者','转呈封爵申请至王都封册署','代收贡赋、点验兵役'],
   limits:['递件人与抄录人只登记与送达，不替上级改判','不受理本人自报官职','任免只用于公署辖下四村']},
  prose:{
   text:'白石镇公署是榆坡、苇汀、砾泉、桑坂四村的上级登记处。任职和封地申请交到前厅递件窗，递件人与抄录人收下原件、登记日子，登记满3日后按章程给出任免结论：看申请人在本村的贡献、原头人是否举荐、本村成年住户里反对的是否多于支持的。每30日复核一次在任者，遇到犯罪裁定、任期届满或成年住户反对多于支持，照章免职。封爵申请不在镇里定，由公署转呈王都封册署；受封者的贡赋由公署代收，兵役也在这里点验。',
   counterLine:'先把原件放这儿，我只管登记日子；结论按章程出，不看谁嗓门大。'}},
 {id:'auth_capital_title_registry',kind:'superior',name:'王都封册署',
  skeleton:{institution:'王都封册署',seat:'loc_capital',channel:'bld_bs_office',decisionDays:20,
   grants:['准爵','勋爵'],petitionChannel:'bld_bs_office',tributeBase:'受封者所得封地收入',levyKind:'兵役',bases:['军功','治理','王室服务','领地规模'],
   duties:['按申请所附凭据审定封爵，不以贡献度自动授爵','登记爵位、等级、封地及其收入、贡赋与兵役份额','收取贡赋并点验兵役','对失职者降等、停俸或除爵'],
   limits:['只受理经白石镇公署转呈的申请','封地须是申请人现任官职所辖','男爵以上须有城镇以上辖区，眼下无可封之地']},
  prose:{
   text:'王都封册署设在王都，只受理经白石镇公署前厅转呈的申请。署里不看贡献度的高低直接授爵，只审申请所附的凭据：军功、治理、王室服务或领地规模，送达后20日给出结论。眼下能从这里得到的只有准爵和勋爵；男爵以上要有城镇以上的辖区，白石一带暂无可封之地。册上登记了每一级的封地收入、贡赋与兵役份额，受封者按册上的份额得封地收入、交贡赋、应兵役；失职的会被停俸、降等乃至除爵。',
   counterLine:'封册署只认凭据。你把凭据理清，我替你封好送走，回信要等上20日。'}},
];

const offices=[
 {id:'office_works_deputy',kind:'office',name:'工役协理',
  skeleton:{appointedBy:'auth_bs_office_charter',settlements:[...VILLAGES],requires:{citizen:true,contribution:30,headRecommendation:{by:'原头人',minStanding:10},residentOpinion:'本村成年住户反对不得多于支持'},appointingInstitution:'白石镇公署',
   termDays:180,monthlyQuotaD:3,monthlyBudgetCopper:600,powers:['public_project','quest_publish'],
   limits:['不批宅基','不改税率','不任命管事','超出月度额度的支出须另报']},
  prose:{
   text:'工役协理是公署给村里熟手开的差事，专管修路、补渠、搭棚这类公共工程。申请人要先是本村公民，攒够30点贡献，原头人愿意举荐，本村成年住户里反对的不能多于支持的。一任180日，每月最多从村公库动用600铜付料钱和工钱，每月还能以公家名义发3个D级委托。协理不批宅基、不改税率、不派管事，超出额度的开销得另报。',
   counterLine:'协理花的是村里的钱，账一笔笔记清，月底才好交代。'}},
 {id:'office_village_head',kind:'office',name:'村长',
  skeleton:{appointedBy:'auth_bs_office_charter',settlements:[...VILLAGES],requires:{citizen:true,contribution:120,headRecommendation:{by:'原头人',minStanding:30},residentOpinion:'本村成年住户反对不得多于支持'},appointingInstitution:'白石镇公署',
   termDays:360,monthlyQuotaD:10,monthlyBudgetCopper:2000,taxBps:{min:0,max:800},powers:['public_project','quest_publish','housing','tax','steward'],
   keeps:{formerHead:'原头人仍按本村法典审理财物案、在登记柜台办户籍'},
   limits:['不改本村法典','不得跨村批地','不得替缺席户签约','税率只在上级给定范围内调整']},
  prose:{
   text:'村长由镇公署任命，不由村里自封。申请人须是本村公民，在本村攒满120点贡献，原头人举荐，本村成年住户里反对的不多于支持的。一任360日，每月可发10个D级委托、动用2000铜以内的公款，能批宅基、组织工程、派管事，并在百分之零到百分之八之间调整粮约税率。原头人仍按本村法典审财物案、在柜台办户籍；新村长不能改法典，也不能替缺席户签约。',
   counterLine:'头人举荐只是一半，另一半是住户怎么说。两样都齐了，公署才落印。'}},
 {id:'office_village_steward',kind:'office',name:'村管事',
  skeleton:{appointedBy:'office_village_head',settlements:[...VILLAGES],requires:{adultResident:true,consent:true},
   termDays:90,monthlyQuotaD:0,monthlyBudgetCopper:0,powers:['housing_review'],
   rules:['只按村长写定的地块、资格与费率批建房','宅基费与地租当日入公账','越权或不合资格的申请退回原主','批准建房不等于代建'],
   limits:['不动用公款','不改费率','不发委托']},
  prose:{
   text:'村管事由村长从本村成年住户里挑选，本人同意才算数，一任90日。管事只照村长写下的规矩办建房申请：哪块地、什么人能申请、收多少钱，都写在条子上。合规的当场批，宅基费和地租当天交进公账；不合资格或超出条子的申请，原样退回申请人。管事不动公款、不改费率、不发委托，批了建房也只是准许，房子得申请人自己盖。',
   counterLine:'条子上写着的我就办，条子上没有的，你去找村长。'}},
];

const plot=(id,name,settlement,location,slots,feeCopper,annualRentCopper,materials,buildDays,rule,prose)=>({id,kind:'plot',name,
 skeleton:{settlement,location,slots,feeCopper,annualRentCopper,eligibility:'resident',materials,buildDays,rule},prose});
const plots=[
 plot('plot_yp_north','榆坡路口北坡宅基','loc_bs_yupo','loc_yp_path',4,40,12,{wood:30,stone:0},8,'宅基之间留一条搬运通道，院墙不得压到坡路',
  {text:'榆坡路口往北的缓坡上划出4块宅基，黄土地雨后粘脚，打地基得挑晴天。登记居民可以申请，每块一次交宅基费40铜，此后每年交地租12铜，都进榆坡公账。盖一间屋大约要30份木料、8日工夫，料由申请人自备。照坡上的老规矩，宅基之间要留出一条搬运通道，院墙不能压到坡路上。',
   counterLine:'北坡那几块地风大，墙脚多垫一层土，别占了搬运的那条道。'}),
 plot('plot_wt_dry','苇汀干路口高台宅基','loc_bs_weiting','loc_wt_path',3,35,10,{wood:25,stone:10},10,'须先垫高台基，涨水季不得在旧便道上堆料',
  {text:'苇汀干路口旁的一片高台只划了3块宅基，岸边湿，房子得先垫高台基才能起。登记居民可以申请，宅基费35铜，每年地租10铜，交进苇汀公账。一间屋要25份木料和10份石料，约10日完工，料由申请人自备。涨水季不许在旧便道上堆料，挡了路的料要自己挪走。',
   counterLine:'台基垫不够高，头一场涨水就漫进门槛，到时候可别怨划地的人。'}),
 plot('plot_lq_terrace','砾泉坡路口坡台宅基','loc_bs_liquan','loc_lq_path',3,45,12,{wood:20,stone:20},9,'不得截断泉槽或改动泉水流向',
  {text:'砾泉坡路口上方削出一段坡台，分成3块宅基。碎石坡干湿差得大，墙脚多用石料，一间屋约要20份木料、20份石料，9日左右完工，料由申请人自备。登记居民可以申请，宅基费45铜，每年地租12铜，交进砾泉公账。泉槽是全村的水，盖房时不许截断泉槽，也不许改了泉水的流向。',
   counterLine:'碎石你随便垒，泉槽一寸都不能动，这是砾泉人头一条规矩。'}),
 plot('plot_sb_outer','桑坂园外路口宅基','loc_bs_sangban','loc_sb_path',4,40,12,{wood:30,stone:0},8,'只在公共路一侧起屋，不得圈入私家桑园',
  {text:'桑坂园外路口靠公共路的一侧划了4块宅基，另一侧是各户私家桑园，不在其中。登记居民可以申请，宅基费40铜，每年地租12铜，交进桑坂公账。一间屋约要30份木料、8日工夫，料由申请人自备。房子只能起在公共路这边，篱笆不得圈进别人的桑园；晒布的木架若要挪，先问架子的主人。',
   counterLine:'路这边是公家划的，路那边是人家的桑园，别把篱笆扎过去。'}),
];

const treasury=[
 {id:'auth_village_treasury',kind:'treasury',name:'四村公库收支章',
  skeleton:{settlements:[...VILLAGES],account:'各村公账',income:['粮约税','户籍规费','宅基费','地租','捐赠'],
   spending:['获批工程的材料与工钱','以公家名义发布委托的托管报酬'],reserveCopper:300,wagePerWorkerDayCopper:24,
   rules:['每笔收支写明来源与经手人','动用后余额不得低于留底','工程中止时未用材料与未付工钱退回公账','任期内月度支出不超过官职额度']},
  prose:{
   text:'四村的公账各管各的，钱只从几处来：粮约税、户籍规费、宅基费、地租和村民的捐赠。能从公账出去的也只有两类：获批工程的材料和工钱，以及以公家名义发委托时先押下的报酬。每笔进出都写明来源和经手人；公账里始终要留300铜底子，动用后不能低于这个数。请人做工按每人每日24铜付工钱。工程中途停了，没用完的料和还没付的工钱都退回公账。',
   counterLine:'底子那三百铜是荒年救急的，谁当家，动用后的余额都不许落到这个数以下。'}},
];

const royal=new Set(['国王','皇帝']);
const title=(id,name,ranks,quota,fief,incomeBps,tributeBps,levy,attendance,bases,grantable,prose,extra={})=>({id,kind:'title',name,
 skeleton:{ranks,monthlyQuotaD:quota,fief,incomeBps,tributeBps,levy:levy.men===null?levy:{...levy,period:'每年'},attendance,bases,grantable,
  grantor:royal.has(name)?null:'auth_capital_title_registry',...(royal.has(name)?{grantNote:'不经封册署册封'}:{}),...extra},prose});
const titles=[
 title('title_1_zhunjue','准爵',['三等','二等','一等'],[2,3,5],'无封地',0,0,{men:1,days:10,personal:true},'每年到白石镇公署报到一次',{min:1,from:['军功','治理','王室服务']},true,
  {text:'准爵是最低一级爵位，分三等、二等、一等。有一样军功、治理或王室服务的凭据，就能经镇公署转呈王都封册署请封。准爵没有封地，也就没有封地收入和贡赋；每年要本人服兵役10日，并到白石镇公署报到一次。三等、二等、一等每月分别可发2、3、5个D级委托，报酬从自己口袋里押。',
   counterLine:'准爵听着体面，其实没地可收租，倒要先替王都出十日的力。'},{petitionChannel:'bld_bs_office',levyKind:'兵役'}),
 title('title_2_xunjue','勋爵',['三等','二等','一等'],[10,15,20],'一村',1000,2000,{men:2,days:15},'每年到白石镇公署报到一次',{min:2,from:['治理','军功','领地规模'],required:'治理'},true,
  {text:'勋爵分三等，封地是一个村，而且必须是受封者现任村长的那个村。请封要有治理凭据，再加一样军功或领地规模。受封后，封地每月实收的税费里有一成归勋爵；勋爵再把所得的两成作为贡赋交给王都。每年出2人服兵役15日，每年到白石镇公署报到一次。不再当这个村的村长，封地收入也就跟着停了。',
   counterLine:'封地跟着村长的印走，印交出去，地上的进项就不归你了。'},{fiefRule:'封地须是受封者现任村长所辖之村；不再任该村村长即停发封地收入',petitionChannel:'bld_bs_office',tributeBase:'受封者所得封地收入',levyKind:'兵役'}),
 title('title_3_nanjue','男爵',['三等','二等','一等'],[60,90,120],'一城或一镇',1500,2000,{men:6,days:20},'每年到王都朝见一次',{min:2,from:['治理','军功','领地规模'],required:'领地规模'},false,
  {text:'男爵分三等，封地是一城或一镇；一等男爵兼任城主时，每月可发120个D级委托，也可折成1个B级加2个C级，或12个C级。封地实收税费的一成半归男爵，所得两成交贡赋，每年出6人服兵役20日，并到王都朝见一次。白石一带眼下没有空出的城镇，封册署眼下不受理这一级的请封。',
   counterLine:'男爵要有城镇做封地，镇长的位子空着，可不是谁递张纸就能补上的。'},{tributeBase:'受封者所得封地收入',levyKind:'兵役',grantNote:'需城镇以上辖区；现无可封之地，不受理请封'}),
 title('title_4_zijue','子爵',['三等','二等','一等'],[200,300,400],'一城',1500,2000,{men:20,days:30},'每年到王都朝见一次',{min:2,from:['治理','军功','领地规模'],required:'领地规模'},false,
  {text:'子爵分三等，封地是一城，由王都封册署册封。封地实收税费的一成半归子爵，所得两成交贡赋；每年出20人服兵役30日，每年到王都朝见一次。每月委托额度按三等、二等、一等分别是200、300、400个D级。白石一带只有镇和村，这一级眼下只在册上，没有可封之地。',
   counterLine:'子爵的名字我只在册页上见过，咱这镇子还没人摸到过那道门槛。'}),
 title('title_5_bojue','伯爵',['三等','二等','一等'],[600,800,1000],'一郡',2000,2000,{men:60,days:30},'每年到王都朝见一次',{min:3,from:['治理','军功','领地规模','王室服务'],required:'领地规模'},false,
  {text:'伯爵分三等，封地是一郡，由王都封册署册封。封地实收税费的两成归伯爵，所得两成交贡赋；每年出60人服兵役30日，每年到王都朝见一次。请封至少要三样凭据，其中必须有领地规模。每月委托额度按三等、二等、一等分别是600、800、1000个D级。',
   counterLine:'伯爵手下的兵役名册，比咱四村加起来的人头还长。'}),
 title('title_6_houjue','侯爵',['三等','二等','一等'],[1500,2000,2500],'一省之内数郡',2000,2000,{men:200,days:40},'每年到王都朝见一次',{min:3,from:['治理','军功','领地规模','王室服务'],required:'领地规模'},false,
  {text:'侯爵分三等，封地是一省之内的数郡，由王都封册署册封。封地实收税费的两成归侯爵，所得两成交贡赋；每年出200人服兵役40日，每年到王都朝见一次。每月委托额度按三等、二等、一等分别是1500、2000、2500个D级。请封至少要三样凭据，其中必须有领地规模。',
   counterLine:'侯爵的册页厚得像账本，咱前厅一年也见不着一份。'}),
 title('title_7_gongjue','公爵',['三等','二等','一等'],[3000,4000,5000],'一省',2500,2000,{men:500,days:40},'每年到王都朝见一次',{min:3,from:['治理','军功','领地规模','王室服务'],required:'王室服务'},false,
  {text:'公爵分三等，是王室之下最高的爵位，封地是一整个省。封地实收税费的两成半归公爵，所得两成交贡赋；每年出500人服兵役40日，每年到王都朝见一次。请封必须有王室服务的凭据，单靠地广人多不够。每月委托额度按三等、二等、一等分别是3000、4000、5000个D级。',
   counterLine:'公爵得替王室办过实事，光地广人多，封册署也不落笔。'}),
 title('title_8_guowang','国王',['唯一'],[15000],'王国',null,0,{men:null,days:null},'主持朝见',{min:0,from:[]},false,
  {text:'国王只有一等，统领王国，坐镇王都主持朝见，各级受封者按年来见。国王不向谁交贡赋，兵役由他调遣而不是由他应役。王室每月可发15000个D级委托。国王不由封册署册封，封册署是替国王登记各级爵位的地方。',
   counterLine:'国王不是封出来的，封册署只是替王上记账的。'}),
 title('title_9_huangdi','皇帝',['唯一'],[60000],'数国之上',null,0,{men:null,days:null},'受诸王朝见',{min:0,from:[]},false,
  {text:'皇帝只有一等，位在诸王之上，受诸王朝见。按册上的写法，皇帝每月可发60000个D级委托。如今各国之上并无皇帝在位，封册署的册页上这一格空着，只留了名目；谁也不能凭这一格向四村收贡或点兵。',
   counterLine:'皇帝那一格空了不知多少代，册页上只剩个名目。'}),
];

titles.find(t=>t.id==='title_3_nanjue').skeleton.quotaAnchor='一等男爵兼城主每月1个B级加2个C级，或12个C级，或120个D级';
export const authorityEntries=[...superiors,...offices,...plots,...treasury,...titles];
export default authorityEntries;
