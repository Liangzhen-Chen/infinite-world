// C3: existing residents and profession IDs, existing learn/certify/trade operations.
export const teachingDesign=[
 {id:'npc_bs_077_1',route:'道',role:'profession_taoist',location:'bld_bs_reed_dao',core:'skill_taoist_combat_01',spell:'spell_mind_01',shared:['spell_s1_marked_letter','spell_mind_05'],book:'item_bs_dao_primer',title:'验汀符笔初课',lineage:'裴澄从验汀来的符笔师纪砚舟学过控墨与护界辨识，在镇里设芦衡观授基础；师名纪砚舟只见于师承记录。',rule:'先问来料归属，符记不得冒用别人的姓名；护界和驱邪仍待合格仪轨。'},
 {id:'npc_bs_076_3',route:'佛',role:'profession_monk',location:'bld_bs_still_temple',core:'skill_monk_combat_01',spell:'spell_mind_01',shared:['spell_mind_05'],book:'item_bs_monk_primer',title:'止波寺三息课',lineage:'季笙随止波寺开院师澈照学静息与体术，白日授三息定桩；澈照只见于师承记录。止波寺属原创止波师承，东街灯祠与四神教派各循原礼。',rule:'不向未同意者施精神术，习武时不伤害已停手的人；度亡仪轨尚须另得主持资格。'},
 {id:'npc_bs_077_2',route:'法',role:'profession_mage',location:'bld_bs_school',core:'skill_light',spell:'spell_light',shared:['spell_mind_05','spell_s1_marked_letter'],book:'item_bs_mage_primer',title:'东学光术初课',lineage:'裴绵采用许苓公开的元素观测方法授光术，要求学员自己记录失败与用时；没有与许苓相识的私人经历。',rule:'研究需说明材料出处，实验失败仍负担耗材，不以光术诊断疾病。'},
 {id:'npc_bs_079_1',route:'武',role:'profession_swordsman',location:'bld_bs_measured_hall',core:'skill_swordsman_combat_01',shared:[],book:'item_bs_martial_primer',title:'量廊馆探步初课',lineage:'曲澄以自家传下的两步量距法在量廊武馆授探步，先练空地步法再谈兵器。',rule:'量距留出路人通道，练习双方可随时停手。'},
 {id:'npc_bs_078_2',route:'巫祝',role:'profession_witch',location:'bld_bs_temple',core:'skill_witch_combat_01',spell:'spell_mind_01',shared:[],lineage:'舒绵在灯祠照看之外沿巫师旧职授辨识与静息，巫祝另与祭司礼仪分记。',rule:'供物逐袋认清物主；不代替本人同意，也不声称已经获仪式主持资格。'},
 {id:'npc_bs_078_1',route:'炼丹',role:'profession_life_8',location:'bld_bs_school',core:'skill_life_8_core',shared:[],lineage:'舒澄以既有炼金师手艺讲解药炭分袋与配伍，炼丹成品另依真实配方，学馆不赠药。',rule:'未知药不能给人试服，原料按自己的袋逐件核清。'},
 {id:'npc_bs_080_3',route:'祭礼',role:'profession_priest',location:'bld_bs_temple',core:'skill_priest_combat_01',shared:[],lineage:'苗笙保留祭司职业的灯祠礼仪教学，与止波寺佛门师承分开登记。',rule:'问明本人信奉与供灯意愿，认证不等于取得四神教派的仪式主持许可。'},
];
const institutions=[
 ['bld_bs_reed_dao','芦衡观',[24.35,.325],'验汀传统控墨、符箓与护界初课','裴澄白日坐在公开课桌授符笔控墨，观内留有试墨盘。学费按课结算，仪式主持另须合格许可。'],
 ['bld_bs_still_temple','止波寺',[24.35,.35],'原创止波师承静息与体术初课','季笙白日在公开静息廊授三息定桩，廊外留出通行处。寺中采用止波师承，度亡主持另须合格许可。'],
 ['bld_bs_measured_hall','量廊武馆',[24.35,.375],'侠客步法与兵器基础','曲澄白日在公开练步廊授探步量距，练习者须留出行人通道。兵器实练仍需学习目录中相应技能。'],
];
export function contentAdditions(world){
 const locations=institutions.map(([id,name,coordinates,purpose,description])=>({id,name,aliases:[],parent:'loc_bs_dongxue',scope:'loc_bs',coordinates,terrain:'平地',openHours:[480,1080],purpose,owner:'loc_bs',rooms:[{id:`room_${id}_front`,name:'公开教学前廊',purpose,access:'白日可问学，内室与财物须另问保管人'}],inventory:{},description:`${description}前廊每日8时至18时开放；每旬10、20、30日导师在家休息。基础师授每课12铜、120分钟，本处战斗职业认证须10级及基础100熟练度，成功付30铜；学馆的炼金师是生活职业，另按原目录一级、20铜办理。` }));
 const routes=locations.map(l=>({id:`route_${l.id}`,from:'loc_bs_dongxue',to:l.id,lengthKm:0.12,terrainMultiplier:1,modes:['walk'],closedSeasons:[],toll:0,risk:0,description:'从东学街沿公开门廊抵达，夜里按门前开放钟点另约。'}));
 const items=teachingDesign.filter(t=>t.book).map(t=>({id:t.book,name:t.title,aliases:[],scope:'loc_bs',quality:'木',durability:80,weight:.15,basePrice:12,origin:t.location,shelfLifeDays:365,seasonality:'导师个人少量抄本，售完须另等补抄',tags:['paper','book'],use:'识字达到100后可读入门手艺，书不代替职业认证。',book:{grade:'初级',author:t.id,edition:'白石初课第一版',origin:t.location,teaches:[t.core,...t.spell?[t.spell]:[]],readingMinutes:120,prerequisites:[]},description:`${t.title}记载${world.skills.find(s=>s.id===t.core).name}的动作次序，是导师个人的基础抄本。${t.lineage}识字100可读120分钟，学习检定未过仍耗时，书册不授仪式资格。`,inspection:'逐页检查墨迹、页号与装订，缺页或破损不能作为完整学习来源。',storage:'放在干燥书夹内，避水与明火，阅后压平。'}));
 const shared=[['skill_mind_01',['profession_monk','profession_taoist','profession_witch']],['skill_mind_05',['profession_monk','profession_taoist']],['skill_s1_marked_letter',['profession_taoist']]].map(([id,roles])=>({id,learningProfessions:['profession_mage',...roles]}));
 return{locations,routes,items,shared,teaching:teachingDesign};
}
export function applyAdditions(world){
 const a=contentAdditions(world),append=(rows,added)=>[...rows,...added.filter(r=>!rows.some(x=>x.id===r.id))];
 return{...world,locations:append(world.locations,a.locations),routes:append(world.routes,a.routes),items:append(world.items,a.items),skills:world.skills.map(s=>{const row=a.shared.find(r=>r.id===s.id);return row?{...s,learningProfessions:row.learningProfessions}:s;}),professions:world.professions.map(p=>{const t=teachingDesign.find(t=>t.role===p.id);return t?{...p,trainingInstitutions:[t.location],trainingRule:t.rule}:p;})};
}
export function applyTeaching(people,world){
 const next=applyAdditions(world);
 for(const t of teachingDesign){
  const p=people.find(p=>p.id===t.id);if(!p)throw Error(`导师未在33人内 ${t.id}`);
  const role=next.professions.find(p=>p.id===t.role);if(!role)throw Error(`无职业 ${t.role}`);
  p.professions=[t.role];p.level=30;
  if(role.kind==='combat')p.combatProfession=t.role;else p.lifeProfessions=[t.role];
  p.skills=[t.core,...t.spell?[next.spells.find(s=>s.id===t.spell).skill]:[],...t.shared.map(id=>next.spells.find(s=>s.id===id).skill)];
  p.proficiencies=Object.fromEntries(p.skills.map(id=>[id,600]));
  p.services=['trade',t.role,t.core,...t.spell?[t.spell]:[],...t.shared];p.teachingStages={[t.role]:1};
  if(t.route==='法'){p.services.push('skill_literacy');p.skills.push('skill_literacy');p.proficiencies.skill_literacy=600;}
  if(t.book)p.inventory[t.book]=2;
  p.workplace={location:t.location,access:'公开前廊白日接授，内室和物件须另问保管人。'};
  for(const day of ['default','market'])for(const slot of p.schedule[day])if(slot.services.length){slot.location=t.location;slot.services=['trade','teach'];slot.activity=`${p.occupation}与${t.route}基础师授`;}
  for(const entity of [t.role,t.core,...t.spell?[t.spell]:[],...t.shared])p.serviceCatalog.push({kind:'teach',what:entity,price:{mode:'catalog',source:entity},unlocksService:false});
  if(t.route==='法')p.serviceCatalog.push({kind:'teach',what:'skill_literacy',price:{mode:'catalog',source:'skill_literacy'},unlocksService:false});
  p.description+=t.lineage+t.rule+`问学先学${next.skills.find(s=>s.id===t.core).name}，每课12铜120分钟；${role.kind==='life'?'一级':'十级'}、基础熟练100再考认证，成功付${role.fee}铜。`;
  p.notes+=t.lineage+t.rule;p.knowledge.known.push({fact:t.lineage+t.rule,source:p.id,reliability:'本人教学安排'});
  const place=next.locations.find(l=>l.id===t.location);
  p.knowledge.known[2]={fact:`${place.name}是自己日常接洽与授课的地方，前廊每日8时至18时开放，休息日另约。`,source:t.location,reliability:'本人教学安排与门前告示'};
  p.voice.samples[0]=`${role.name}初课先练${next.skills.find(s=>s.id===t.core).name}，愿意学就把时辰和学费说清。`;
 }
}
