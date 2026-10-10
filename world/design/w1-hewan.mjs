import {fullPeople,rosterPeople} from './w1-hewan-people.mjs';
import {applyHewanSocial} from './w1-hewan-social.mjs';
const id=key=>`npc_hw_${key}`,house=n=>`house_hw_${String(n).padStart(2,'0')}`;
const homes=['bld_hw_qingdeng','bld_hw_council','bld_hw_riverhome','bld_hw_forge','bld_hw_qingdeng','bld_hw_herbs','loc_hw_dock','bld_hw_qingdeng','bld_hw_weaving','bld_hw_post','bld_hw_qingdeng','bld_hw_school','loc_hw_apiary','bld_hw_post'];
const oldHomes=[['linsui','ayan'],['chenbai'],['xuling'],['duanyan','duanhe'],['wushuo'],['taozhi'],['zhengshuisheng'],['luowei'],['sulan'],['gucen'],['meiling'],['luqing'],['anhuai'],['shendu']];
const newHomes=[
 ['筛种院',[-.3,.1],'miaozhen'],['沟边矮屋',[-.4,-.2],'xinglu'],['南缝线屋',[.3,-.3],'ranmo'],['渡后木屋',[-.1,-.3],'puduo'],
 ['东檐小院',[.5,.2],'feikai'],['合住旧院',[.2,-.3],'zhongxiu'],['柳影泥屋',[-.3,-.4],'xiejin'],['补榫人家',[.4,-.2],'yinge'],
];
const slot=(start,end,location,activity)=>({start,end,location,activity,services:[]});
function schedule(p,home){
 const daily=(rest=false,winter=false)=>[slot(0,480,home,'睡眠'),slot(480,540,home,'吃饭与家务'),slot(540,winter?990:1080,rest?home:p.work,rest?p.restText:p.workText),slot(winter?990:1080,1260,home,p.restText),slot(1260,1440,home,'睡眠')];
 return{default:daily(),market:daily(),rest:daily(true),restDays:[10,20,30],seasonal:{'3':{default:daily(false,true),market:daily(false,true),rest:daily(true,true)}}};
}
export function w1HewanFoundation(world){
 const authoredIds=new Set(fullPeople.map(p=>id(p.key)));
 const old=world.npcs.filter(n=>n.id.startsWith('npc_hw_')&&!authoredIds.has(n.id));
 if(old.length!==18)throw new Error('本批只基于已发布18档；重新接批次前检查人口册');
 const residence=n=>n<=14?homes[n-1]:`bld_hw_home_${n}`;
 const authored=[...fullPeople,...rosterPeople];
 const households=Array.from({length:22},(_,i)=>({id:house(i+1),settlement:'loc_hw',homeLocation:residence(i+1),members:[...(oldHomes[i]??[]).map(id),...authored.filter(p=>p.house===i+1).map(p=>id(p.key))],
  tenure:i<14?'沿用已发布住处锚点；户籍索引不改原人物产权或现金':'私宅居住登记，产权未登记，不授予访客进入权'}));
 const family=p=>households[p.house-1].members.filter(x=>x!==id(p.key));
 const allNames=new Map([...old,...authored.map(p=>({id:id(p.key),name:p.name}))].map(n=>[n.id,n.name]));
 const npcs=fullPeople.map((p,index)=>{
  const npcId=id(p.key),home=residence(p.house),skills={[`skill_life_${p.skill}_core`]:p.proficiency};
  const relations=p.relations.map(([key,type,trust,affection,note])=>({with:id(key),type,trust,affection,note}));
  return{id:npcId,name:p.name,aliases:[],scope:'loc_hw',tier:'full',settlement:'loc_hw',householdId:house(p.house),age:p.age,sex:p.sex,
   birth:{year:-p.age,month:2+index%10,day:3+index},culture:'culture_river',location:home,coins:p.coins,inventory:{},skills:Object.keys(skills),proficiencies:skills,professions:[`profession_life_${p.skill}`],occupation:p.occupation,level:p.age>=65?2:3,combat:null,
   trust:0,affection:0,traits:p.traits,notes:`${p.occupation}，${p.workText}。${p.flaw}。`,intelligence:{level:1,growth:0},flags:{minor:false,romanceable:true},services:[],serviceCatalog:[],
   household:family(p),familyNotes:`与${family(p).map(x=>allNames.get(x)).join('、')}同列${house(p.house)}常住户；亲属类型以relationships逐项为准。`,appearance:p.look,
   voice:{register:p.speech,accent:'河谷日常口音',habits:[p.speech],samples:[]},personality:{traits:p.traits,values:[p.goals[2]],flaws:[p.flaw]},
   wealth:{cashRange:[p.coins,p.coins],property:[],valuables:[],debts:[]},home:{location:home,access:'访客先在公共处招呼，私宅及个人休息位置需本人允许',ownership:'unspecified'},workplace:{location:p.work,access:'工作物料归其实际持有人，帮工须经物主安排'},schedule:schedule(p,home),relationships:relations,
   memorySeeds:p.memories.map((event,i)=>({id:`memory_w1_${p.key}_${i}`,event,salience:i?3:4,knownBy:[npcId],reliability:'亲历'})),
   goals:Object.fromEntries(['short','mid','long'].map((term,i)=>[term,[{id:`goal_w1_${p.key}_${term}`,content:p.goals[i],progress:0,deadlineDay:[30,180,720][i],resources:[{kind:'time_and_consent',description:`${p.goals[i]}所需的本人时间、已核实材料与有关当事人同意`,grantsInventory:false}],steps:[{content:'先核对可用时间和当事人意愿',status:'pending'},{content:p.goals[i],status:'pending'}]}]])),
   fears:[p.fear],redLines:['个人物品与劳动需经本人同意'],secrets:[{content:p.secret,knownBy:[npcId]}],
   knowledge:{known:[{fact:p.memories[0],reliability:'亲历',source:npcId}],unknown:['本人不在场且无人转告的事','他人未公开的私有财物']},
   opinions:{factions:'主要按本人遇到的具体办事人判断',magic:'在实际用途和费用明确后再商量',adventurers:`愿先听来意；${p.speech}`,neighbors:relations.map(r=>({with:r.with,view:r.note}))},
   towardPlayer:{baseline:{trust:0,affection:0},raises:['按约定来','先问再动个人物品'],lowers:['答应后失约','强迫他人出工'],attitude:`初见先谈眼前生活；${p.workText}`},
   behaviorRules:{bargaining:'先约具体工事，实际报酬另经现有交易或约定登记',honesty:`可能因${p.flaw}而说话有所保留`,risk:`先留意${p.fear}`,threatResponse:'先离开直接危险并寻求在场者协助',bribeResponse:'不因馈赠许诺自己无权交付的财物'},hooks:p.hook?[p.goals[1]]:[],
   ttsVoice:p.sex==='女'?'zh_female_mature_01':'zh_male_low_01',portraitPrompt:`原创河谷居民${p.name}，${p.age}岁，${p.look.join('，')}`,description:'待逐条起草',
   authoredFacts:{appearance:p.look,speech:p.speech,flaw:p.flaw,memories:p.memories,work:p.workText,rest:p.restText},
  };
 });
 const residents=rosterPeople.map(p=>({id:id(p.key),name:p.name,aliases:[],tier:'roster',age:p.age,sex:p.sex,culture:'culture_river',settlement:'loc_hw',scope:'loc_hw',householdId:house(p.house),household:family(p),occupation:p.occupation,traits:p.traits,home:{location:residence(p.house),access:'同户居住；访客须先征得允许'},location:residence(p.house),flags:{minor:p.age<18,romanceable:p.age>=18},currentConcern:p.concern,visibleFeature:p.feature}));
 const locations=newHomes.map(([name,coordinates],index)=>({id:residence(index+15),name,parent:'loc_hw',scope:'loc_hw',aliases:[],coordinates,terrain:'平地',openHours:[0,0],owner:null,purpose:'私宅',access:{mode:'private',residents:households[index+14].members,requiresConsent:true},rooms:[{id:`room_hw_${index+15}_common`,name:'共用起居间'},{id:`room_hw_${index+15}_sleep`,name:'家人睡处'}],inventory:{},description:`${name}为本户共居的私宅，门前可以招呼，进屋须先取得居住者允许。`}));
 const routes=locations.map(l=>({id:`route_${l.id}`,from:'loc_hw',to:l.id,lengthKm:Math.hypot(...l.coordinates),terrainMultiplier:1,modes:['walk'],closedSeasons:[],toll:0,risk:0}));
 applyHewanSocial(residents);
 return{version:1,kind:'w1-hewan',npcs,residents,households,locations,routes,
  settlement:{id:'loc_hw',parent:'loc_bs',population:58,householdCount:22,residentIds:households.flatMap(h=>h.members),visitors:[id('hezhou')],commuters:[id('yanzhe')],externalRelatives:[{relatedTo:id('zhengshuisheng'),count:2,status:'成年子女在雁渡工作，不计河湾常住人口'},{relatedTo:id('zhongya'),count:2,status:'父母在外谋生，不计河湾常住人口'}],facts:['河湾58人22户，老人占比较高，部分年轻人在外谋生。','不重置既有粮食、田亩、户主产权或居民存档；本批人口映射属于内容候选。']},
  kinship:[['fanrong','taozhi'],['shijin','luoxing'],['luowei','luoxing'],['miaozhen','shaoyun'],['shaohe','shaoyun'],['shaoyun','shaoyu'],['huaci','xinglu'],['xinglu','xingshu'],['ranmo','randai'],['randai','dengtai'],['dengjia','dengtai'],['puduo','puxin'],['wengqiao','puxin'],['feikai','feiyin'],['hangli','feiyin'],['feikai','feizhuo'],['hangli','feizhuo'],['liyan','xiejin'],['xiejin','xierui'],['xiejin','xieyi'],['yinge','yinqiu'],['jinping','yinqiu'],['yinqiu','yinzhi']].map(([parent,child])=>({parent:id(parent),child:id(child)})),
  preservedIds:old.map(n=>n.id),formalWrite:false,
 };
}
