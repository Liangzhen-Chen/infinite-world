// Core mechanisms are authored here. Drafting may explain them, never enlarge them.
import {mechanismDuration}from'./spell-timing.mjs';
import {mechanismEffect}from'./spell-effects.mjs';
export const spellSchools=[
    ['fire','火',[
        ['火星术','点燃一撮干火绒，湿柴或活物无法成为目标','ignite'],['暖掌术','手掌暖到适合揉面，不能烫伤接触者','warm'],
        ['烘衣术','排出一件衣物中的潮气，保留染料与纤维','dry'],['驯灶术','稳定一口灶的火候，燃料消耗降低一成','fuel'],
        ['炭纹测温','以炭线显示器壁温差，需要接触器具','sense_heat'],['火线术','地面两米火线阻挡行路，可用水浇灭','barrier'],
        ['余烬刻印','在非活体材料留下可被辨认的火纹签记','mark'],['焰矢术','向视野内目标投射一束火焰，可被掩体阻断','damage_fire'],
        ['釉火调律','协助窑炉均匀升温，减少陶器烧制裂损','craft_heat'],['炉膛鼓焰','提高现有炉火温度，仍要投入正常燃料','forge_heat'],
        ['隔焰罩','为一人削减外来火焰伤害，不抵挡刀剑','shield_fire'],['熔缝术','以铁料填补金属裂缝，不能创造缺失部件','repair_metal'],
        ['烬雨术','范围内落下灼热火屑，友军也会受伤','area_fire'],['封焰结界','限制一间屋内火势蔓延，耗魔维持且会隔绝空气流通','contain_fire'],
    ]],
    ['water','水',[
        ['凝露术','在杯壁凝出少量水，速度受空气湿度限制','condense'],['净水术','去除一桶水中的悬浮污物，不能消除一切毒素','clean_water'],
        ['辨泉术','判断近处水源盐分与腐败气味，不能探出暗藏契约','sense_water'],['引水术','沿已存在的沟渠移动水，不能使水无源出现','irrigate'],
        ['止漏膜','暂封一个容器的漏口，超过压力上限会破裂','seal'],['清渠术','松开沟内淤泥，须有人将泥运走','clear_silt'],
        ['水绳术','以水流缠住一肢或同等粗细轻物，载荷不超过两公斤，可被切断媒介','bind_water'],['霜针术','投射短冰针，炎热环境中威力下降','damage_cold'],
        ['河床听辨','测出小段水道浅滩和流速，不能预测整条河','survey_water'],['缓流壁','削弱小股急流，不能阻断洪峰','slow_flow'],
        ['冰藏术','为封闭储柜降温保鲜，木柜隔热差时耗魔增加','preserve'],['回潮术','为干旱田垄补湿，需要引水并由耕作者处理土壤','soil_water'],
        ['流幕术','水帘掩住一处通道，水声会暴露施法位置','veil_water'],['潮压阵','在有水的狭小区域施压，站在其中的人均受影响','area_water'],
    ]],
    ['wind','风',[
        ['招风术','让两米内空气流动，可驱走烟但不消灭烟源','airflow'],['拂尘术','吹去物品表面松散尘土，不能剥离牢固污渍','clean_air'],
        ['传声线','顺一条短气流传话，沿途有人也能听见','carry_voice'],['听风术','辨出近处风向与回声，封闭石墙仍会阻断','sense_air'],
        ['晾谷风','帮助一堆谷物排湿，翻谷工作仍由人完成','dry_grain'],['缓坠术','减慢一人的下降，不能托住重型货物','slow_fall'],
        ['风刃术','切出一道薄气流，软物易切而硬甲会抵挡','damage_wind'],['静息幕','降低一小圈内的风声，同时影响传话和警号','quiet'],
        ['帆息调节','为已有船帆修正局部气流，不能改变整片海风','sail'],['气囊术','保持短暂可呼吸气泡，氧气耗尽后失效','air_bubble'],
        ['偏箭风','扰乱向一人飞来的轻型投射物，重弩矢受影响较小','deflect'],['烟雾分流','引走小范围烟雾，必须为污染选择实际出口','smoke'],
        ['盘旋风柱','短时托起轻物，旋涡会卷走周边松散物品','lift'],['逆风环','使一段道路难以穿行，对友军同样生效','area_wind'],
    ]],
    ['earth','土',[
        ['辨壤术','识别一把土的质地，不能直接知道地契归属','sense_soil'],['松土术','松开一小片耕土，不能代替排石与播种','till'],
        ['压印术','在软土上留下清晰足印或印模','imprint'],['砾声探路','根据石子的回声探查近处空隙，误差随岩层变化','survey_earth'],
        ['泥封术','以现有黏土封住低压缝口，需要定期检查','mud_seal'],['固堤术','临时提高一段土堤抗冲刷性，失效后须修缮','levee'],
        ['石弹术','加速一块已有小石，目标由瞄准决定','damage_earth'],['整地术','平整有限表土，不会消除地下根系和管道','level_ground'],
        ['矿纹显露','显出近处矿物条带，产量仍须开采与冶炼','ore'],['承重纹','提示一面墙受力异常，不能无材料修复整栋建筑','structural_sense'],
        ['石肤术','提高一人的抗撞击能力，同时降低灵活性','stone_skin'],['陷足地','使一片湿土更易陷足，铺板和脱离湿土可破解','mud_trap'],
        ['穹撑术','短时支撑正在下沉的顶板，不能替代永久梁柱','support'],['裂岩楔','扩开岩石已有裂隙，震动可能伤及邻近结构','fracture'],
    ]],
    ['light','光',[
        ['聚光术','把已有光束集中到一处，不提供额外热能','focus_light'],['读痕术','使材料表面磨损更易看清，不读取人的内心','reveal_wear'],
        ['暮灯术','在掌心生成柔光，可被遮挡和熄灭','light'],['反照印','使一块标记从特定方向反光','reflect'],
        ['眩点术','制造一瞬亮点干扰视线，闭眼者不受影响','dazzle'],['辨色谱','拆分矿物与染料的色泽，需提供样品','color'],
        ['清影线','在墙面显示投影边缘，有助于制图和测量','shadow_measure'],['光幕术','遮蔽一侧视线，幕另一边仍能听到声音','light_screen'],
        ['镜面步标','为已知路线留下短期可追踪光点，不能指向未知终点','waymark'],['斑痕追照','照出近日留下的浅表污痕，不给出行为者身份','trace'],
        ['折光衣','扰乱一人轮廓，移动和雨水会削弱效果','camouflage'],['破雾光','提高薄雾内可见度，浓雾仍限制距离','fog_light'],
        ['昼辉束','凝成灼目的光束，对有视觉的目标更有效','beam'],['显形环','照出靠光学伪装隐藏的轮廓，不能破除所有精神幻象','reveal'],
    ]],
    ['shadow','暗影',[
        ['遮灯术','压暗一盏光源，不改变其燃烧耗氧','dim'],['静影术','让衣物影子贴近身体，作用限于光照边缘','shadow'],
        ['暮纹术','在纸上写下暗光才显现的笔迹','secret_ink'],['寒痕辨识','判断近处曾有暗影魔力残留，不能指定施法者','sense_shadow'],
        ['遮窥帘','阻碍通过小缝隙窥视，公开开门即可看清','privacy'],['影足绊','在阴影内扰乱脚步，强光和离开阴影可解除','bind_shadow'],
        ['暗刺术','射出凝结暗影，穿过强光时迅速衰减','damage_shadow'],['契痕审读','显出一份魔法契约被修改的地方，不宣判法律效力','contract_sense'],
        ['夜视匣','提高一人在微光下辨物能力，完全无光仍无效','nightvision'],['影分术','制造外观分影，影子不能拿物或替人受全部伤害','decoy'],
        ['腐蚀印','缓慢损伤一处无生命材料，会留下可追查印记','corrode'],['怯影缚','以恐惧加强阴影束缚，需要精神施法许可','fear_bind'],
        ['黑幕阵','遮暗有限空间，施法者也需另有感知办法','dark_area'],['逆契索','反制正在执行的暗影契约，失败可能反噬双方','counter_contract'],
    ]],
    ['life','生命',[
        ['止血术','压住浅表出血，不能补回失去的血液','healing'],['辨草术','辨认一株药草的常见药性，未知种仍需研究','herb_sense'],
        ['护芽术','帮助新芽渡过轻霜，缺水与害虫仍会伤苗','seedling'],['缓痛术','缓解小范围疼痛，不修复伤口也不能替代诊断','pain'],
        ['合创术','促使简单伤口闭合，污物未清会加重感染','healing'],['果藏术','降低一箱果实腐败速度，容器须完整且先剔除坏果','preserve_food'],
        ['根脉引导','引导幼根朝现有水源生长，生长仍需多日','roots'],['疫痕辨识','指出常见感染征象，不能保证确定病原','disease_sense'],
        ['续息术','暂稳一名濒死者，需要后续真实救治','stabilize'],['净创术','清除创面常见污染，毒素与异物需另行处理','clean_wound'],
        ['嫁枝契','降低嫁接排异，需要兼容植株与园艺手艺','graft'],['驱蛊纹','排出可识别的小型寄生物，可能伤及宿主','parasite'],
        ['肌腱修复','协助断裂肌腱愈合，施法后长期负重会破坏成果','restore_tendon'],['林圃生息','提高有限园圃的生长活力，必须消耗肥料与水','garden'],
    ]],
    ['mind','精神',[
        ['定息术','帮助自愿者平稳呼吸，惊恐来源仍然存在','calm'],['意念记签','把自己的简短感受封在载体，不能取走他人记忆','record_feeling'],
        ['杂念分辨','察觉自愿者是否受到精神干扰，不透露念头内容','sense_mind'],['共感约','经双方同意分享简单情绪，随时可中断','consent_link'],
        ['守心结','降低外来的轻度精神干扰，施术需本人同意','mind_guard'],['梦醒铃','从普通噩梦唤醒自愿者，深度昏迷无效','wake'],
        ['心音线','向同意的近处接收者传一句话，距离受符记限制','mind_message'],['错觉点','扰乱目标一瞬知觉，属于受管制精神术','illusion'],
        ['誓意听辨','感受自愿者说话时的犹疑，不是测谎判决','hesitation'],['恐慌刺','加强短暂恐惧，镇定训练与守心术可反制','fear'],
        ['执念松解','协助自愿者摆脱轻度强迫暗示，需要多次照护','release_mind'],['眠纱术','使疲惫者更易入睡，对警觉者效果弱','sleep'],
        ['群心协调','让小队自愿者共享简单战术节奏，无法控制其意志','team_link'],['回忆护印','保护自愿者对某段往事的记忆，不能证明其记忆真实','memory_guard'],
    ]],
    ['space','空间',[
        ['界尺术','测定两个可见点的距离，不能穿墙侦知房间','measure'],['袋序术','让自有袋内物品易于取出，不增加实际容量','organize'],
        ['锚纹辨识','识别可见传送锚点是否损坏，不授予使用许可','anchor_sense'],['锁隙术','暂固定门锁机械间隙，需要真实钥匙才可正常打开','lock_space'],
        ['取回线','从视野内取回自有轻物，不能从别人手中强夺','retrieve'],['隔湿袋','使密封袋口更难渗水，破洞仍会漏','bag_seal'],
        ['界面警铃','在经许可的门框设通行警号，不能识别所有伪装','alarm'],['锚点校准','校正已有锚点的小幅偏移，需要登记许可','calibrate_anchor'],
        ['短距折步','在两个可见合法落脚点间短移，墙体与封界会阻断','blink'],['寄物格','短时封存自有轻物，失效时原地掉出','store'],
        ['双锚递送','在两个登记过且获准的锚点间送一件小货物','anchor_cargo'],['路口封界','阻碍一处狭小空间通道，需要公开标示和授权','block_space'],
        ['双锚迁行','沿获准锚点传送一人，不向未发现地点随机落地','teleport'],['界隙缝合','修补小型空间异常，无法封闭神性裂隙','repair_space'],
    ]],
    ['summon','召唤',[
        ['灯蛾唤引','吸引近处真实灯蛾，不把它们当作永久宠物','lure'],['灰尘役灵','召来短暂清扫役灵，不能处理厚重垃圾','clean_servant'],
        ['契纹听读','读出自己召唤契约的基本条款','contract_read'],['水盏役灵','让一只契约役灵搬动一杯水，必须维持魔力','servant'],
        ['火蜥投影','召出火元素短期投影，契约结束后消散','summon_fire'],['石屑役灵','召出搬运碎石的低阶役灵，载重有限','summon_earth'],
        ['风雀传签','由契约风雀投影沿已知短路线携带纸签','summon_air'],['潮鳍卫灵','召出只在水中活动的守卫投影','summon_water'],
        ['契约续供','延长已有合法召唤，必须持续支付魔力与约定供品','maintain'],['役灵换位','调换两只自有役灵的职责，不能改写其根本契约','reassign'],
        ['四元协作','组织已有低阶役灵共同完成简单工序','coordinate'],['契约解离','和平结束自身契约，违背条款可能付代价','dismiss'],
        ['元素护卫','召来中阶临时护卫，强度受契约与施术者能力限制','summon_guard'],['界门邀约','发出跨界来访邀约，对方可拒绝且须谈妥条款','invite'],
    ]],
    ['faith','信仰',[
        ['旅灯祝福','以仪式为旅人提供微弱定心，不能免除道路危险','bless_travel'],['病榻守祷','帮助病人安静休息，不保证疾病痊愈','rest_bless'],
        ['净坛术','清理受托祭坛上的普通污染，不裁定宗教争议','clean_altar'],['誓约见证','记录自愿者立誓的事实，不强迫守誓','witness_oath'],
        ['慈息术','在信众同意下缓解浅伤，需要教会规定的仪式','healing'],['渡魂慰语','安抚悲恸者并辨出低阶游魂，不能复活死去居民','comfort'],
        ['护灯纹','削弱一人遭遇的低阶邪秽干扰','ward'],['驱秽音','以仪式驱离低阶邪灵，误认目标会伤及无辜','exorcise'],
        ['戒行护体','持续守戒者获得短时防护，破戒会使其失效','discipline'],['圣契审读','查验本教派的仪式契约，需要相应授权','faith_contract'],
        ['归途祷标','为已登记祭坛提供可辨认祷标，不授予异地复活权','revival_mark'],['赎伤礼','以材料和长期照护换取伤势缓解，不能抹去犯罪','restore'],
        ['群祷庇护','由真诚信众共同支撑短时护罩，参与者疲劳会累积','faith_shield'],['祓界仪轨','清理有限区域的低阶邪秽，神性存在需另有条件','purify_area'],
    ]],
];

export function spellBlueprints(){
    return spellSchools.flatMap(([slug,school,rows])=>rows.map(([name,effect,mechanism],index)=>{
        const stage=Math.floor(index/4),mpRanges=[[1,5],[6,15],[16,35],[36,80]];
        const mp=mpRanges[stage][0]+index%4*Math.floor((mpRanges[stage][1]-mpRanges[stage][0])/3);
        const defaultMaterials=stage>=2?[{item:school==='生命'?'item_herb':'item_resin',amount:stage-1}]:[];
        const materials=mechanism==='repair_metal'?[{item:'item_iron',amount:1},...defaultMaterials]:defaultMaterials;
        const duration=mechanismDuration(mechanism,stage);
        return {id:`spell_${slug}_${String(index+1).padStart(2,'0')}`,name,school,stage,mp,mechanism,effect,
            skill:`skill_${slug}_${String(index+1).padStart(2,'0')}`,minutes:stage<2?1:2,duration,
            difficulty:[10,15,20,25][stage],learnFee:[12,40,100,250][stage],learnMinutes:[120,240,480,960][stage],
            materials,
            rangeMeters:[3,10,20,40][stage],teachers:[],aliases:[],scope:null,
            law:spellLaw(school,mechanism),
            boundaries:spellBoundaries(mechanism),durationLimit:duration,...mechanismEffect(mechanism,stage)};
    }));
}

// Legal status describes the intended use. Ownership and damage liability
// are evaluated separately; ordinary lighting is not automatically arson.
function spellLaw(school,mechanism){
    if(school==='精神'&&mechanism!=='record_feeling')return {river:'permit',city:'permit',port:'permit'};
    if(['calibrate_anchor','anchor_cargo','teleport','block_space','fear_bind'].includes(mechanism))return {river:'permit',city:'permit',port:'permit'};
    if(['repair_metal','privacy','contract_sense','corrode','release_mind','memory_guard','clean_altar','faith_contract'].includes(mechanism))return {river:'consent',city:'consent',port:'consent'};
    if(mechanism.startsWith('damage')||['area_fire','area_water','area_wind','fracture','beam','dark_area'].includes(mechanism))return {river:'public',city:'permit',port:'permit'};
    return {river:'public',city:'public',port:'public'};
}
function spellBoundaries(mechanism){
    const specific={
        warm:'热量温和传给直接接触物，温度上限38摄氏度；仅维持低功率暖掌，不作用于远物或大范围加热。',
        dry:'只作用于一件衣物，帆布、仓库货物不在目标范围内；正常施放保留染料与纤维。',
        sense_heat:'施法者及炭线须与受测器具保持直接接触；熟练度不能改成隔布、隔墙或远距读取。',
        irrigate:'最多沿既有沟渠移动20升现有水；水源不足时停止，不创造水或渠。',
        fuel:'只改善现有灶火，燃料节约上限10%，不可因熟练度提高而再增加。',
        healing:'仅处理所述伤口，不恢复死者、不造血或诊断所有疾病。',
        teleport:'只在两个已登记并获许可的锚点间移动，不发现未知地点。',
        air_bubble:'气泡体积两升，最多供一人静息呼吸一分钟，活动激烈时更短。随受术者面部移动，不能多人共用，不免除施救过失责任。',
        levee:'持续时间上限60分钟；四段熟练度只改变网层均匀程度，不延长时间。半天或多日防护须反复施放和实际修堤。',
        damage_fire:'目标必须有沿直线路径可见的部分。提升精度可命中露出部分，不绕过或穿透完整掩体。',
        bind_water:'需要两升已有水作媒介，缠绕一肢或粗细相当的轻物，载荷最多两公斤。不能固定沉重漂货。',
    };
    return specific[mechanism]??'范围、目标、材料与消耗按骨架固定；熟练度只改变可靠性和控制精度，不附加新能力。';
}
