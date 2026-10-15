// New local practice rules; existing gods, people and institutions are reused.
export const faithRules={version:1,
 initiation:{coins:12,minutes:60},ordinaryRite:{coins:1,minutes:30,offerings:{item_resin:1}},
 conversion:{default:{attitude:'tolerant',familyDelta:-2,organizationDelta:-2,formerDelta:-5},
  cultures:{culture_civic:{attitude:'notice',familyDelta:-1,organizationDelta:-1,formerDelta:-3},culture_reed:{attitude:'customary',familyDelta:-4,organizationDelta:-3,formerDelta:-6}},polities:{}},
 competition:true,
 uses:{relief:{coins:3,items:{item_ration:1},minutes:10},medicine:{coins:2,items:{item_herb:1},minutes:15},
  repair:{coins:6,items:{item_timber:1},minutes:60},school:{coins:4,items:{},minutes:60,skill:'skill_literacy',gain:2},assembly:{coins:2,items:{item_ration:1},minutes:30}},
 rites:[{id:'bank_sign',deity:'deity_bank',season:0,coins:2,minutes:30,offerings:{item_resin:1},collective:3,devotionDays:2,cooldownDays:7,responseMinutes:30,
  sign:'供盘上的芦岸记号发出微光，三十分钟后消散；它不指认人或物的真伪。'},
 {id:'lintel_sign',deity:'deity_lintel',season:1,coins:2,minutes:30,offerings:{item_resin:1},collective:3,devotionDays:2,cooldownDays:7,responseMinutes:30,
  sign:'供盘上的门印记号发出微光，三十分钟后消散；它不证明合同有效或陈述属实。'}]
};
const facts=[
 ['affiliation','居民信仰优先沿当前师承与家户取值，再参考居住地寺观和文化。迁居与改业会改变默认归属，个人明确立下的信仰保留为覆盖。'],
 ['experience','受寺观救济、施药或教导的居民可能转而亲近该寺观。灾祸及谎言被揭可令当事人中断持续虔信，不把旁人的私事变成共同知识。'],
 ['treasury','香火钱与供粮逐笔进入寺观公库。查看寺观可以看钱粮余额、经手用途和受助去向，同一笔钱粮不会因组织视图而多出一份。'],
 ['relief','每次救济从公库交给一名在场受助者三铜与一份干粮。施药每次交付一份药草，并向主持付两铜；药草交付本身不会治愈疾病。'],
 ['school','义学一课占用六十分钟，公库付主持四铜。主持须实际比学生懂得识字，学生每课最多增长两点，不超过主持的程度。'],
 ['assembly','法会占用三十分钟，从公库给参加者一份干粮，并付主持两铜。修缮预留六铜与一份木料，设施接点未开放时不能扣除钱粮或凭空修好建筑。'],
 ['conversion','正式入教须在寺观清醒主持在场时完成六十分钟仪式，费用十二铜。改宗移出旧寺观成员关系并改变旧寺观、家户和组织对本人的立场；主持须先交接职位。'],
 ['custom','城邦文化通常以告知为改宗态度，旧寺观立场减三、家人及组织各减一。芦岸文化较重原师规，旧寺观减六、家人减四、组织减三；当地法典有明文时优先按法典。'],
 ['conflict','同地两教会发生真实信众改宗后，争议按七日时钟发展。先争信众与香火，再形成地盘争端，继而提出待受理的地方裁断请求；请求不等于已判决，可在争端前请暂停。'],
 ['rite','普通祭仪占用三十分钟，捐一铜并耗一份树脂。供品与时间真实消耗，缺少神迹条件时仍是一场普通祭仪。'],
 ['sign','芦岸记号在春季、门印记号在夏季的相应寺观可回应集体祈愿。三名同信者须实际在场、连续守信两日，仪式捐两铜并耗一份树脂；显兆限供盘记号发光三十分钟，寺观同神冷却七日，不验证真相或窥知隐私。'],
 ['pilgrimage','朝圣以寺观所在地为目的地，按现有路线付路费并花费行程时间。居民赴约仍受日程与其他义务限制，临时朝圣不迁户籍，结束后恢复自己的作息。']
];
export const entries=facts.map(([id,text])=>({id:`rw07_${id}`,text}));
export const draftFor=e=>({id:e.id,text:e.text});
export const revision='rw07-v1';
