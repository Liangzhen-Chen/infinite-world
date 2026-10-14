// U4 career depth: variant promotion routes, entry tasks and ultimate skills for
// the twelve combat professions, plus the hidden-profession initiation checks.
// Conditions name observable metrics kept by server-plugin/career-metrics.mjs:
//   region  — exchanges of real combat at places whose name or terrain (or a
//             parent's) contains one of the keywords;
//   element — successful casts whose spell carries that element;
//   faith   — light: light casts plus successful heals; shadow: shadow and mind casts.
// The minimum scales with the promotion rank (rank × perRank).
export const regionKeywords={
    海岸:['海','港','潮','礁','盐'],
    山地:['山','岭','峰','崖','岩','台地','坳'],
    林地:['林','森'],
    荒漠:['沙','漠','旱','戈壁'],
    冰原:['冰','雪','寒','霜','冻'],
};
export const elementLabels={fire:'火',cold:'霜',wind:'风',earth:'土',water:'水',lightning:'雷',light:'圣光',shadow:'暗影'};
const region=(key,prefix,orientation,trial)=>({route:`region_${regionKeyId(key)}`,kind:'region',key,keywords:regionKeywords[key],prefix,orientation,perRank:8,
    description:`在${key}地带累计实战（每阶8次），并通过导师主持的${trial}`});
const element=(key,prefix,orientation,trial)=>({route:`element_${key}`,kind:'element',key,prefix,orientation,perRank:15,
    description:`成功施放${elementLabels[key]}属性法术（每阶15次），并通过导师主持的${trial}`});
const faith=(key,prefix,orientation,trial)=>({route:`faith_${key}`,kind:'faith',key,prefix,orientation,perRank:15,
    description:`${key==='light'?'以圣光法术或救治成功':'以暗影或精神法术成功'}累计（每阶15次），并通过导师主持的${trial}`});
function regionKeyId(key){return {海岸:'coast',山地:'mountain',林地:'forest',荒漠:'desert',冰原:'tundra'}[key];}

export const careerDepth={
    warrior:{variants:[region('海岸','潮岸','defense','港口盾卫试炼'),region('山地','山岩','attack','隘口斩阵试炼')],
        entryTask:{name:'守住训练场狭口',description:'在导师注视下持械守住仅容一人的训练场入口，承受连续正面冲击而不退。'},
        ultimate:{name:'不移军壁',action:'guard',description:'以整身架势封住正面一线，期间几乎无法移动；侧后方仍会被击穿。',
            task:{name:'城门一夜',description:'受导师所托，在登记的险要门道守住一整夜袭扰，事后由守军核对伤亡与门道完好。'}}},
    knight:{variants:[faith('light','圣誓','defense','誓约见证'),region('荒漠','荒原','attack','长途驰援试炼')],
        entryTask:{name:'护送短途行人',description:'骑乘或步行护送一名登记行人走完训练路段，途中由导师制造险情。'},
        ultimate:{name:'誓约之盾',action:'guard',description:'为一名受护者承接一轮全部正面来击，坐骑与自身都承受真实损伤。',
            task:{name:'护驾长途',description:'护送受托者完成一段登记长途，导师核对路线、受护者安危与誓约记录。'}}},
    spellblade:{variants:[element('fire','焰纹','attack','焰刃熔试'),element('cold','霜纹','defense','冰锋守试'),element('lightning','雷纹','attack','雷脉直试')],
        entryTask:{name:'刃纹不散',description:'在导师面前于自有兵器上维持一道导纹，完成三次挥击而纹路不断。'},
        ultimate:{name:'万纹归一',action:'strike',description:'把已掌握的导纹压进一击释放，之后兵器导纹全部熄灭，需重新描摹。',
            task:{name:'熔炉试刃',description:'在导师监督下以导纹兵器斩开登记试材，器具损耗与魔力按实际结算。'}}},
    swordsman:{variants:[region('林地','林间','attack','密林游斗试炼'),region('冰原','雪原','defense','冰面立身试炼')],
        entryTask:{name:'三步不失',description:'在导师划定的窄道上与陪练交手，三次换位都不踏出界线。'},
        ultimate:{name:'无碍行剑',action:'strike',description:'沿已观察的空隙连续穿行斩击，路线上的障碍与地形仍会截断剑路。',
            task:{name:'千里一诺',description:'受托把一件信物送到远方并按约返回，途中冲突由导师事后逐条核对。'}}},
    assassin:{variants:[faith('shadow','暗影','attack','夜幕潜行考核'),region('荒漠','沙海','attack','沙丘伏杀考核')],
        entryTask:{name:'无声取标',description:'夜间在导师布置的院落里取回一枚标记而不惊动守夜人。'},
        ultimate:{name:'寂锋',action:'strike',description:'在完全未被察觉的前提下发出一击，一旦被看见即退化为普通短刺。',
            task:{name:'静夜之约',description:'按导师登记的合法委托潜入并取回证物，不伤及无关者，事后由委托方核对。'}}},
    archer:{variants:[region('林地','林猎','attack','林中追猎试射'),region('冰原','寒弦','defense','冰原守望试射')],
        entryTask:{name:'百步三中',description:'在导师面前于百步外射中三个不同方位的靶心，箭矢真实消耗。'},
        ultimate:{name:'百步巡星',action:'aim',description:'在已知距离上锁定一处要害连续出箭，失去视野即中断，箭矢照常耗用。',
            task:{name:'哨塔之夜',description:'在登记哨位值守一夜，发现并射退真实来袭者，由守备核对箭矢与记录。'}}},
    mage:{variants:[element('fire','炎术','attack','炎术论证'),element('water','潮术','defense','潮术论证'),element('wind','岚术','attack','岚术论证')],
        entryTask:{name:'灯下读符',description:'在导师面前点亮照明术并逐段辨读一张初级符面，错读处须当场订正。'},
        ultimate:{name:'流变',action:'cast',description:'把两项已掌握元素术的媒介接续成一次施法，分别支付消耗，失败时两份反噬都会发生。',
            task:{name:'学会公开论证',description:'向导师所在学会提交一份元素实验记录并当众复现，同行逐项质询。'}}},
    priest:{variants:[faith('light','圣光','defense','圣坛见证'),region('海岸','潮祭','defense','潮汐祭典')],
        entryTask:{name:'病榻一夜',description:'在导师指导下照护一名自愿病人一夜，记录体温、呼吸与用药。'},
        ultimate:{name:'慈航',action:'support',description:'为一群自愿者主持一次共同照护祈祷，所有人仍需真实休息与材料。',
            task:{name:'疫棚值守',description:'在登记疫棚完成连续照护，受照护者与教派共同核对结果。'}}},
    monk:{variants:[region('山地','山门','attack','山径负重试炼'),faith('light','净光','defense','静院守戒考核')],
        entryTask:{name:'晨钟立桩',description:'自晨钟起在导师面前站桩，期间承受推击而不移步。'},
        ultimate:{name:'止争法身',action:'guard',description:'以定息与架势承受一轮近处全部来击，期间不能还手。',
            task:{name:'调停械斗',description:'在见证人面前不伤人地分开一场持械争执，由双方与导师核对经过。'}}},
    witch:{variants:[faith('shadow','暮影','attack','暮契讲试'),region('林地','林梦','defense','林间梦仪')],
        entryTask:{name:'同意核验',description:'在导师面前为一名自愿者核对许可与意愿，完整记录后才施一道守心术。'},
        ultimate:{name:'众心见证',action:'support',description:'为多名自愿者建立共同见证，任何人可随时退出，不读取未同意的记忆。',
            task:{name:'解开旧咒',description:'按许可调查并解除一处登记在案的低阶诅咒，媒介与见证一并归档。'}}},
    taoist:{variants:[region('山地','山符','defense','山观守阵'),element('lightning','雷符','attack','雷法试符')],
        entryTask:{name:'一符成形',description:'在导师面前用真实符墨画成一张合格的辟秽符，并说明每笔用途。'},
        ultimate:{name:'观界',action:'control',description:'以已立阵标维持一处大范围护界，移走任一阵标即全部失效。',
            task:{name:'护观一旬',description:'在登记道观连续守阵，处理真实秽事并由观主核对阵具与记录。'}}},
    summoner:{variants:[element('earth','岩契','defense','岩灵约试'),element('wind','风契','attack','风灵约试')],
        entryTask:{name:'读契三条',description:'在导师面前逐条读出一份役灵契约的期限、供魔与解约条款，不得漏读。'},
        ultimate:{name:'万役调停',action:'support',description:'同时协调全部自有合法役灵完成一项工序，任何一份契约仍按原条款消耗。',
            task:{name:'界约议定',description:'与一位愿意回应的契约存在议定新契，导师与见证者核对全文。'}}},
};
export const hiddenInitiationAttribute={peaceDays:'精神',locationsVisited:'体质',promisesKept:'魅力',craftSuccesses:'敏捷',publicProjects:'体质',booksCopied:'智力',
    healingSuccesses:'精神',voyages:'体质',contractsCompleted:'魅力',tamedCreatures:'魅力',consensualRituals:'精神',researchCompleted:'智力',summonContracts:'精神',
    nonlethalConflicts:'敏捷',npcsTaught:'魅力',hiddenLuck:'体质'};

// Compiled into world/meta/careers.json (keyed by profession id) and new
// skills.json rows. Kept off the profession rows so reviewed catalog
// fingerprints that quote those rows stay valid.
export function careerCatalog(combat,hidden){
    const careers={},skills=[];
    for(const row of combat){
        const slug=row.id.slice('profession_'.length),depth=careerDepth[slug],tree=row.skills;
        const ultimate={id:`skill_${slug}_ultimate`,name:depth.ultimate.name,aliases:[],scope:null,attribute:row.attribute,profession:row.id,stage:4,
            action:depth.ultimate.action,description:depth.ultimate.description,source:'职业任务',teachers:[],ultimate:true,prerequisites:[{skill:tree[0].id,minimum:900}],combatAction:null};
        skills.push(ultimate);
        careers[row.id]={entryTask:depth.entryTask,
            ultimate:{skill:ultimate.id,name:ultimate.name,minimumPromotions:3,requiredSkill:tree[0].id,minimumProficiency:900,fee:1000,difficulty:25,minutes:240,task:depth.ultimate.task},
            // Variant routes per rank: the matching base direction's skill gate and fee plus an observable condition.
            variants:row.promotions.map((step,index)=>depth.variants.map(route=>{const like=step.choices[route.orientation==='defense'?0:1];
                return{...like,id:`${row.id}_rank_${index+1}_${route.route}`,name:`${route.prefix}${like.name}`,variant:{route:route.route,kind:route.kind,key:route.key,
                    ...(route.keywords?{keywords:route.keywords}:{}),minimum:route.perRank*(index+1),description:route.description}};}))};
    }
    for(const row of hidden){
        const attribute=hiddenInitiationAttribute[row.trigger.metric],skill=`skill_hidden_${row.id.slice(-2)}_ultimate`;
        skills.push({id:skill,name:`${row.name}·真意`,aliases:[],scope:null,attribute,profession:row.id,stage:4,action:'utility',
            description:`${row.ability}的极致运用；${row.cost}`,source:'隐藏职业',teachers:[],ultimate:true,prerequisites:[],combatAction:null});
        careers[row.id]={initiationCheck:{attribute,difficulty:20,minutes:240,retryMinutes:1440},ultimate:{skill}};
    }
    return{careers,skills};
}
