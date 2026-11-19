// T93: locally authored biographies; DeepSeek is used only for factual L2.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import Ajv from 'ajv';
import {teachingDesign,applyTeaching,contentAdditions,applyAdditions} from './w1-baishi-craft-teaching.mjs';
import {baishiSkeleton} from './w1-baishi-skeleton.mjs';
import {loadWorld} from '../../tools/load-world.mjs';
import {DeepSeekClient} from '../../tools/deepseek-client.mjs';
import {runContentPipeline,defaultReviewRequest,readApprovedContent,hashContent} from '../../tools/content-pipeline.mjs';
import {validateNpcDepth,validateNpcProfiles} from '../../tools/npc-profile-validation.mjs';

export const revision='t93-craft-1';
export const root=path.resolve('world/drafts/w1/baishi-craft');
export const budgetRoot=path.resolve('world/drafts/w1');
const read=f=>fs.readFile(f,'utf8').then(JSON.parse);
export async function write(f,v){await fs.mkdir(path.dirname(f),{recursive:true});const temp=`${f}.${process.pid}.tmp`;await fs.writeFile(temp,JSON.stringify(v,null,2)+'\n');await fs.rename(temp,f);}

// Witnessed discussions do not grant appointment or approval.
const incidents=[
 [
  "试坯底",
  "bld_bs_potter",
  "去年秋天，三人把各自的空陶坯排在接件凳上，阎澄发现一只底圈偏斜，阎绵用布条标出，陶澄扶稳凳腿后各取回自己的坯。",
  "先修底圈再试装水",
  "布条要留给衣物分包",
  "愿用平凳检看坯底"
 ],
 [
  "门板字距",
  "bld_bs_smith",
  "去年春末，三人在铁作坊门前读各自写的接件纸，陶绵发现字挤在木纹里，邝澄指出背光的位置，邝绵在自用纸上加宽字距。",
  "想留出看清钟点的字距",
  "午后背光处另挂小纸",
  "愿用浅墨先试一行"
 ],
 [
  "旧带补眼",
  "bld_bs_cloth",
  "去年冬前，三人在缝织屋前厅检看各自的旧绑带，崔澄指出破眼，崔绵翻出补线，武澄用自己的布试缠了一圈。",
  "破眼边要先磨平",
  "补线颜色应让物主认出",
  "想把缠带松紧试清"
 ],
 [
  "冷柄与湿坯",
  "bld_bs_potter",
  "去年雨季，三人在陶作屋门前看各自带来的小物，武绵的冷铁柄在三人带来的空凳上滚动，费澄以自己的木片垫住，费绵把湿坯移回手边。",
  "冷柄也要有止滚垫",
  "想把铁件和湿泥分两边放",
  "担心空凳沾泥后难擦"
 ],
 [
  "量袖留边",
  "bld_bs_cloth",
  "去年夏末，三人在缝织屋前厅用自己的旧袖布量边，高澄压住卷边，高绵读出线痕，郭澄发现自己折进去半指布后重新展开。",
  "愿先压平卷边",
  "缝补前让物主指出旧线",
  "想把折边宽度说准"
 ],
 [
  "锤声停刻",
  "bld_bs_smith",
  "去年冬末，三人在铁作坊前厅比对自用的接件钟点纸，郭绵说锤声停时才能听清，翁澄把一张午前纸翻正，翁绵记下各自认出的时辰。",
  "想在停锤后听清来件",
  "愿逐人复述钟点",
  "先问清是否当天取件"
 ],
 [
  "灯座与静席",
  "bld_bs_temple",
  "去年送灯日前，季澄、季绵和季笙在灯祠门廊试放各自带来的空灯座，季澄留出风口，季绵用废纸量席宽，季笙读出自己的尺寸；三人未分配他人的席位。",
  "灯座不堵避风口",
  "读字席旁别摆明火",
  "想把静坐时间写清"
 ],
 [
  "墨笔与页码",
  "bld_bs_school",
  "去年入秋，裴澄、裴绵和裴笙在学馆前厅检查各自的练习页，裴澄用旧笔画出浓淡，裴绵指出重复页号，裴笙按原顺序把自己的页码重写。",
  "先练笔墨再谈符式",
  "页号应能从折角看到",
  "只抄物主许可的练习页"
 ],
 [
  "添炭与送灯",
  "bld_bs_temple",
  "去年初冬，舒澄、舒绵和舒笙在灯祠门廊看自己的灯盏，舒澄问清炭块归谁，舒绵取回自己的炭袋，舒笙把字纸移离灯火；没有交换炭块。",
  "炼药用炭先分清归属",
  "灯会供物各自点清",
  "想把练字纸远离火星"
 ],
 [
  "步距与廊沿",
  "bld_bs_school",
  "去年夏天，曲澄、曲绵和曲笙在学馆门廊量自己的步距，曲澄停在石沿内，曲绵在自用纸上画出两步位置，曲笙读明拐角距离；没有让路过者参加练习。",
  "量距时留出路人通道",
  "愿把脚印图画得疏一些",
  "先走一回再读图"
 ],
 [
  "午席归置",
  "bld_bs_school",
  "去年春天，苗澄、苗绵和苗笙在学馆前厅收起各自的坐席，苗澄按宽窄试叠，苗绵指出席角压住自用页，苗笙松开席角取回纸页。",
  "愿按宽窄收自己的席",
  "读完再压住页角",
  "想让送灯等候处留有空席"
 ]
];
const biographies=[
 [
  "给同户倒水时坯底渗出一圈湿痕，自己换盆接水，翌日磨平底圈再试。",
  "自家水盆不再渗漏",
  "用冷水试盆底半刻",
  "舍不得丢那只旧盆",
  "先看底圈，装满水再说结不结实。",
  "短句先指出缺处",
  "摸坯底会用指背"
 ],
 [
  "孩子把两包衣料混在一起，自己凭补线分开，次日把布条分包系好。",
  "家衣的补线都认得出",
  "晚饭后各挑一件旧衣辨线",
  "怕别人笑自己线色配得杂",
  "布条先分人，我才肯量衣。",
  "轻声讲颜色",
  "回话时捻布条边"
 ],
 [
  "家中凳脚松了，自己塞入木楔，坐下仍摇，同户扶凳后重调了一次。",
  "家中矮凳稳当",
  "请同户空坐试两回",
  "想留住父辈传下的凳子",
  "凳腿扶稳了，坯底才能看得准。",
  "喜欢演示承重位置",
  "说话会先按一下凳面"
 ],
 [
  "晚归时同户认错门上接件纸，自己将家事纸收回屋里，另写门板钟点。",
  "家事纸和接件纸分开",
  "备两种不同宽度的纸条",
  "厌烦家人总替自己报时",
  "钟点留白些，木纹里看不清。",
  "报时逐字重读",
  "指字时避开墨迹"
 ],
 [
  "孩子在昏暗门角找鞋，自己以旧白布作记号，天亮再改到看得见处。",
  "阴天也能找到家鞋",
  "白天试看门边记号",
  "觉得自己写字不如孩子好",
  "这处背光，纸挪半掌再读。",
  "讲方位很快",
  "遇认字会停下等人"
 ],
 [
  "围裙旧带越补越硬，自己拆掉一圈补线，同户帮着试了松紧。",
  "围裙带不勒腰",
  "用旧线试补一个带眼",
  "担心拆坏最后一块旧布",
  "浅墨先试，别把整张纸用完。",
  "说话留有试做余地",
  "算材料时摸围裙带"
 ],
 [
  "自家桶耳磨破绑带，自己用砂石磨平，同户提空桶才不再挂线。",
  "提桶绑带耐用一些",
  "先磨桶耳再穿带",
  "不愿承认自己提重桶太急",
  "破眼边扎手，先磨再补。",
  "直说手感",
  "回话时缩开受磨的指头"
 ],
 [
  "同户缝袖用了看不清的浅线，自己在灯下认出位置后补了一段深线。",
  "全户都认得旧袖补口",
  "天亮把补线指给同户看",
  "希望补过的衣也看着齐整",
  "原来的线在这里，别全拆。",
  "讲针脚位置细致",
  "看袖口会翻出内面"
 ],
 [
  "家中提篮带太紧，孩子提起勒手，自己松开一圈让孩子空提。",
  "孩子提篮不勒掌",
  "与同户试一条软布垫带",
  "不愿让邻户看见自家旧篮",
  "缠一圈先提，松紧有手才知道。",
  "先试后给意见",
  "问人时把提带递向掌心"
 ],
 [
  "自家的小铁柄滑到门槛下，自己找了许久，后来垫一块旧木防滚。",
  "铁柄不再滚进门角",
  "把垫木切出浅槽",
  "怕孩子碰到自己放乱的铁物",
  "冷柄也能滚，垫稳再放。",
  "先指出危险位置",
  "低头找边角后开口"
 ],
 [
  "抬铁件回家蹭湿自家布包，自己晾包到第二天，另找一块垫木。",
  "铁件和布包分开放",
  "与同户试两个摆物位置",
  "舍不得把湿包换掉",
  "铁在这边，泥坯放到另一头。",
  "以左右位置说明",
  "说完会让开半步"
 ],
 [
  "自家泥鞋在饭桌旁留下碎泥，同户扫过后自己把鞋改留门边。",
  "饭前少一遍扫泥",
  "回家先擦鞋底再过门",
  "羡慕同户屋里总干净",
  "凳上沾泥先擦，别让衣料压着。",
  "声音平缓",
  "提家务时搓鞋上干泥"
 ],
 [
  "自家旧衣卷边藏住裂口，自己展开后发现补小了，重新留出余边。",
  "旧衣补口经得起洗",
  "天亮展开旧衣核裂口",
  "舍不得剪掉那块旧袖布",
  "压平了再量，卷边吃尺寸。",
  "量物逐处确认",
  "说数前展平手中布"
 ],
 [
  "给孩子量袖时忘看旧线，缝好后太短，自己拆边多留一指。",
  "孩子的袖口合手",
  "请孩子伸手再认旧线",
  "怕孩子嫌自己总要返工",
  "旧线指给我，补多补少你说。",
  "问细节会耐心等",
  "指线时放轻声音"
 ],
 [
  "将家布折窄再量导致尺寸偏小，同户展开指出后自己另写了数。",
  "家布尺寸记准",
  "把常用那片布展开复量",
  "不想别人知道自己算错数",
  "折进去的半指也算布，展开量。",
  "纠错直接",
  "说完会把布边展开"
 ],
 [
  "晚饭时锤声仍在耳边，自己没听清孩子的话，次日先安静坐半刻。",
  "晚饭时听清孩子说话",
  "停工后先坐下喝水",
  "怕孩子以后不愿再讲",
  "停锤后再说，我这会听得准。",
  "承认听漏后重问",
  "开口前轻揉耳后"
 ],
 [
  "同户把取件午前误写午后，自己回家逐字读给对方听才改清。",
  "家中约时不再错半天",
  "睡前复述明日钟点",
  "嫌复述显得自己啰嗦",
  "这纸翻正，午前午后差得多。",
  "擅长复述短句",
  "报时会将纸朝自己转正"
 ],
 [
  "家中留物取回时少问日期，自己空等一晚，后来把日期加在纸头。",
  "等候都先问日期",
  "请同户读出下次取件日",
  "不喜欢空等时只能干坐",
  "当天取吗？日期要放在前头。",
  "先问日期再谈工序",
  "等答复时压住纸头"
 ],
 [
  "送灯回家带回熏黑灯座，自己洗了一晚，同户说下回先遮风再点。",
  "送灯以后少熏一层黑",
  "用空灯座试两处避风角",
  "其实更喜欢不点灯的静廊",
  "风口留着，空灯座先摆一回。",
  "先谈风向",
  "看灯架会侧头听风"
 ],
 [
  "孩子描字靠灯太近，自己闻到纸边焦味，移到前厅明处继续看字。",
  "孩子描字时纸离火远",
  "早晨找一处自然光桌角",
  "怕说多了孩子反而瞒着自己",
  "字席旁不点火，白日够看清。",
  "语调平稳",
  "讲灯火时先移开纸"
 ],
 [
  "在家静坐太久误了端饭，自己与同户约好先洗碗再坐三息。",
  "静坐和家饭有合适次序",
  "端饭前报明练息时刻",
  "担心家人觉得学佛就是离家",
  "饭先端好，三息定桩再慢慢练。",
  "把动作与日用相连",
  "示范时放松肩膀"
 ],
 [
  "家中研墨太浓糊住旧笔，自己洗笔到水清，另在废纸试浓淡。",
  "自家的旧笔还能写细线",
  "先在废纸试墨再写正页",
  "怕新学徒看出自己也写糊过",
  "符笔先控墨，护界的事到合格后再学。",
  "分步骤示范",
  "讲笔墨会竖起笔尖"
 ],
 [
  "给同户夹练习页时页码重复，自己夜里逐页读清，重新写了索引。",
  "家中练习页按号可找",
  "饭后核一遍折角页号",
  "希望有张专放纸的桌面",
  "折角露出页号，原页别重新排。",
  "沿页号逐项解释",
  "开口前捋平折角"
 ],
 [
  "借孩子的练习页抄字后没先问，孩子生气，自己还回并改用废纸。",
  "家人愿意互借练习页",
  "抄前问清哪页能用",
  "觉得孩子的字已经胜过自己",
  "页是你的，愿意借我才抄。",
  "会先说明归属",
  "借纸时将手留在桌边"
 ],
 [
  "煎自家药时混用灯会炭袋，发现是同户的才取回自己的小袋重排。",
  "家用药炭分袋可辨",
  "给自己的炭袋打结",
  "担心药炉火候总被送灯事打断",
  "炭袋是谁的，炼药先认料。",
  "用来料顺序解释",
  "说药材时翻袋口查看"
 ],
 [
  "归家数灯盏漏看袋底一个，同户摸出后自己逐个报数才收好。",
  "家中灯物出入都数清",
  "与同户并排数空灯盏",
  "想把最亮的灯留在家里",
  "供物先点清，灯会时辰再商量。",
  "报数清晰",
  "说完拉开空袋给人看"
 ],
 [
  "家中练字纸靠炉边被火星点了小孔，自己补纸后把纸夹移到窗边。",
  "练字纸远离炉火",
  "试把纸夹挂在窗内干处",
  "舍不得丢那张有洞的字纸",
  "纸夹放这边，火星够不到。",
  "用距离讲原因",
  "提旧纸会轻拂纸孔"
 ],
 [
  "教孩子绕凳走步时占了门道，同户端饭进不来，自己移到院边试。",
  "家人走门时不被练步挡住",
  "与同户量一段院边空地",
  "羡慕年轻人步子轻快",
  "量距留条过路的空，探步再走。",
  "动作简洁",
  "回话时脚尖朝空地转"
 ],
 [
  "在家画脚印太密，孩子读不清先后，自己用大纸隔开两步位置。",
  "家中步图人人看得懂",
  "请孩子按图空走一次",
  "怕自己的字样板也挤得这样乱",
  "脚印隔开画，一眼看得出次序。",
  "先讲先后位置",
  "指图从近处向远处移"
 ],
 [
  "同户照自己的廊图走错拐角，自己陪走一遍后补画门槛。",
  "自用廊图指得准",
  "白天核清拐角与门槛",
  "不喜欢自己被当作只会抄字",
  "走一回，图里漏门槛就补。",
  "用走过的细节说事",
  "说拐角时转身指廊口"
 ],
 [
  "家中席子按花色叠后总散开，自己改按宽窄，孩子能抽出自己的席。",
  "孩子自己收好坐席",
  "与孩子空叠两种席",
  "舍不得把褪色旧席换掉",
  "宽的放下面，席角自然就平。",
  "喜欢先放物再解释",
  "提坐席时抚过磨损处"
 ],
 [
  "家中读完的页被席角压皱，同户帮着压平，自己用布夹替代席角。",
  "自用书页少皱一回",
  "饭后试布夹松紧",
  "想把抄书字练得比同户整齐",
  "页读完再收，压住也找不着。",
  "说话慢而清楚",
  "看页时先松布夹"
 ],
 [
  "送灯等候归来才知同户收了自己常坐的席，自己说清次日还要用。",
  "家中留一张可取的空席",
  "睡前说清明日用席时段",
  "喜欢清晨独坐门前片刻",
  "要用的席我先说，不让人猜。",
  "直接报自己安排",
  "等人回应时拍平席角"
 ]
];
export const responsibilities=[];
const workplaceFor=p=>({'铁件修补':'bld_bs_smith','陶坯制作':'bld_bs_potter','衣物缝补':'bld_bs_cloth','灯祠照看':'bld_bs_temple','学馆抄录':'bld_bs_school','字样板描写':'bld_bs_school'})[p.occupation];
const dutyFor=p=>({'铁件修补':'向来客说明修补接件时段，来料由物主与匠人核清。','陶坯制作':'带来客看接件处的坯样，试坯先问物主。','衣物缝补':'辨补线和尺寸，衣物由物主交接。','灯祠照看':'点清灯物和门廊等候处，灯会各户自愿带灯。','学馆抄录':'核页号与字样，抄本须原本持有人许可。','字样板描写':'说明字样位置和练习时段，未成年孩子白日随同户来学。'})[p.occupation];
export function authorCraft(world){
 const bones=baishiSkeleton(world),craft=bones.residents.filter(p=>p.age>=18&&Number(p.householdId.slice(-3))>=61&&Number(p.householdId.slice(-3))<=75).slice(0,18),school=bones.residents.filter(p=>p.age>=18&&Number(p.householdId.slice(-3))>=76).slice(0,15);
 const sources=[...craft,...school];assert.equal(sources.length,33);
 const events=incidents.map(([title,location,event,...positions],i)=>({id:`memory_t93_${i+1}`,title,location,event,actors:sources.slice(i*3,i*3+3).map(p=>p.id),positions}));
 const people=sources.map((p,i)=>{
  const [family,wish,step,secret,speech,register,habit]=biographies[i],event=events[Math.floor(i/3)],pos=i%3,peers=sources.slice(Math.floor(i/3)*3,Math.floor(i/3)*3+3).filter(x=>x.id!==p.id),familyId=p.household.find(id=>id!==bones.yan.id&&!peers.some(x=>x.id===id))??p.household[0],familyMember=bones.residents.find(x=>x.id===familyId)??bones.yan;
  const duty=dutyFor(p);const coins=18+i%9,inventory={[i%2?'item_wood':'item_flax_cord']:1},workplace=workplaceFor(p);
  const end=Math.min(1080,world.locations.find(l=>l.id===workplace).openHours[1]);const day=[{start:0,end:420,location:p.home.location,activity:'睡眠',services:[]},{start:420,end:480,location:p.home.location,activity:'用早饭、商量家中安排',services:[]},{start:480,end:720,location:workplace,activity:p.occupation,services:['trade']},{start:720,end:780,location:p.home.location,activity:'回家午饭',services:[]},{start:780,end,location:workplace,activity:p.occupation,services:['trade']},{start:end,end:1200,location:p.home.location,activity:'家中起居与整理个人物件',services:[]},{start:1200,end:1440,location:p.home.location,activity:'晚饭与休息',services:[]}];
  const goal=(term,content,steps,deadlineDay)=>[{id:`goal_t93_${i+1}_${term}`,content,progress:0,deadlineDay,resources:[{kind:'协商',description:'须当事人另行确认的空闲时辰',availability:'unverified',grantsInventory:false}],steps:steps.map(content=>({content,status:'pending'}))}];
  const relations=peers.map((other,j)=>({with:other.id,type:'街务往来',trust:8+pos*3,affection:0,note:`记得与${other.name}在场时的事：${event.event}${j===0?`${p.name}${event.positions[pos]}，而${other.name}${event.positions[sources.indexOf(other)%3]}。`:`记得${other.name}在${world.locations.find(l=>l.id===event.location).name}与自己一起经历过${event.title}；${other.name}${event.positions[sources.indexOf(other)%3]}，${p.name}${event.positions[pos]}。`}`}));
  const familyRelation=relations.find(r=>r.with===familyMember.id);if(familyRelation){relations.splice(relations.indexOf(familyRelation),1);const neighbor=bones.residents.find(r=>r.id==="npc_bs_081_1");relations.push({with:neighbor.id,type:"字页往来",trust:6,affection:0,note:`${p.name}曾在学馆门廊向${neighbor.name}展示自己的练习页，指着页角讲起${wish}；${p.name}记得自己当时${habit}。`});}
  relations.push({with:familyMember.id,type:'同户共居',trust:18,affection:6,note:`${familyRelation?.note??""}${p.name}记得与${familyMember.name}共居时的事：${family}`});
  return{...structuredClone(p),tier:'full',trust:0,affection:0,coins,inventory,skills:[],services:[],intelligence:{level:2,growth:0},birth:{year:-p.age,month:3+i%9,day:2+i%25},familyNotes:`${p.name}与${p.household.map(id=>id===bones.yan.id?'严辙':bones.residents.find(x=>x.id===id).name).join('、')}共居。${family}`,appearance:[p.visibleFeature,'外衣下摆有一道晒浅的折痕',i%2?'袖里收着一张折窄的旧纸':'提篮的把手用旧布缠过'],voice:{register,accent:'河谷日常口音',habits:[habit],samples:[speech,`${wish}，我准备${step}。`,`${event.positions[pos]}，这事下次见面还得说清。`]},personality:{traits:p.traits,values:[wish,'约好的事要报明变动'],flaws:[secret]},proficiencies:{},professions:[],level:1,combat:null,wealth:{cashRange:[coins,coins],property:[],valuables:[],debts:[]},home:{...p.home,ownership:'unspecified'},workplace:{location:workplace,access:'营业时在前厅招呼；内室与器具另问保管人。'},schedule:{default:day,market:structuredClone(day),rest:[{start:0,end:480,location:p.home.location,activity:'休息',services:[]},{start:480,end:1200,location:p.home.location,activity:'家中照护与休息',services:[]},{start:1200,end:1440,location:p.home.location,activity:'晚饭与睡眠',services:[]}],restDays:[10,20,30]},relationships:relations,memorySeeds:[{id:event.id,event:`${event.actors.map(id=>sources.find(x=>x.id===id).name).join('、')}一起经历：${event.event}`,location:event.location,salience:4,knownBy:event.actors,reliability:'亲历'},{id:`memory_t93_private_${i+1}`,event:family,salience:3,knownBy:[p.id],reliability:'个人回忆'}],goals:{short:goal('short',wish,[step],30),mid:goal('mid',`与同户找到家务和${p.occupation}都能照看的时辰`,[`请${familyMember.name}说出最需要自己在家的时段`,'把有冲突的约见另约到双方空闲时'],180),long:goal('long',`让${event.title}引起的分歧有一个能维持的办法`,[`向${peers[0].name}说明：${event.positions[pos]}`,`听取${peers[1].name}的顾虑后提出一回小范围试做`],720)},fears:[`怕${wish}一再因临时工作搁下`],redLines:['自己的物件须自己点头才能拿走','不替同户答应照护和出门时辰'],secrets:[{content:secret,knownBy:[p.id]}],knowledge:{known:[{fact:event.event,source:event.actors[0],reliability:'当时在场亲历'},{fact:family,source:p.id,reliability:'个人亲历'},{fact:`${world.locations.find(l=>l.id===workplace).name}是自己日常做${p.occupation}的地方，前厅开放时间为${world.locations.find(l=>l.id===workplace).openHours.map(m=>m/60).join('至')}时。`,source:workplace,reliability:'日常出入与门前告示'}],unknown:[`${familyMember.name}下次何时能留在家里看门？`,`${peers[0].name}是否愿意试做自己提出的${event.title}办法？`]},opinions:{factions:'行业师傅应把收费与可做的工序讲明，家户自己的物件自己决定。',magic:'若要用法术搬动东西，想先看会不会碰坏物件。',adventurers:'外来的帮手若把钟点说明白，愿意先谈一件小事。',neighbors:peers.map(x=>({with:x.id,view:`记得一起处理过${event.title}，具体安排还需要听${x.name}说。`}))},towardPlayer:{baseline:{trust:0,affection:0},raises:['按说好的钟点到场','借物先征询'],lowers:['让家人久等却不报变动','擅拿私人物件'],attitude:'初见先在前厅说明来意，愿谈自己手边的闲置物件。'},behaviorRules:{bargaining:'只出售本人愿卖的一件闲置物，价钱按当次报价谈。',honesty:'记得的说清楚，读不准的姓名会请对方复述。',risk:'未认清物主与工序时先问明来意，不替家户决定。',threatResponse:'退到附近公开前厅寻人作证。',bribeResponse:'不因好处替物主交出衣料或字页。'},serviceCatalog:[{kind:'trade',what:'本人闲置库存',price:{mode:'engineQuote'},unlocksService:false}],hooks:[wish,event.positions[pos]],ttsVoice:p.sex==='女'?'zh_female_resident_01':'zh_male_resident_01',portraitPrompt:`原创河谷成年居民${p.name}，${p.age}岁，${p.visibleFeature}，朴素衣着，${p.occupation}`,notes:`职责：${duty}${p.currentConcern}${event.positions[pos]}。`,description:`${p.name}是白石镇的${p.occupation}住户，${p.age}岁。${p.visibleFeature}职责是${duty}${family}${wish}是近来惦记的事，说话时${habit}。遇到${event.title}的讨论，${event.positions[pos]}。`};
 });
 for(const person of people)person.schedule.seasonal={};
 applyTeaching(people,world);
 const entries=people.map((draft,i)=>({id:draft.id,kind:'npc',source:sources[i],draft}));
 const additions=contentAdditions(world),next=applyAdditions(world);
 for(const [kind,rows] of [['location',additions.locations],['item',additions.items],['skill',next.skills.filter(s=>additions.shared.some(a=>a.id===s.id))],['profession',next.professions.filter(p=>teachingDesign.some(t=>t.role===p.id))]])for(const draft of rows)entries.push({id:draft.id,kind,source:{id:draft.id,authored:true},draft});
 return{sources,people,events,entries};
}

function catalogOriginal(world,entry){if(["location","item"].includes(entry.kind))return null;const row=world[({location:"locations",item:"items",skill:"skills",profession:"professions"})[entry.kind]].find(r=>r.id===entry.id);if(!row)return null;const {learningProfessions,trainingInstitutions,trainingRule,...original}=row;return original;}
export function reviewContext(entry,bundle,world){
 if(entry.kind!=='npc')return {authoredCatalog:contentAdditions(world),original:catalogOriginal(world,entry),approvedProfileDesign:bundle.people.filter(p=>teachingDesign.some(t=>t.id===p.id)).map(p=>({id:p.id,name:p.name,services:p.services,inventory:p.inventory,workplace:p.workplace})),limits:'本卡原创的机构、步行路线和教材与教学安排是作者设计。已存在技能只加learningProfessions，职业只加trainingInstitutions与trainingRule；旧字段和法术效果保持。认证沿既有十级/100熟练度及费用规则。仪式资格与守戒没有现有取得操作，教材不授主持许可。'};
 const i=bundle.sources.findIndex(p=>p.id===entry.id),event=bundle.events[Math.floor(i/3)];
 const bones=baishiSkeleton(world),all=new Map([...bones.residents,bones.yan].map(p=>[p.id,p]));
 const authorDesign=Object.fromEntries(['skills','services','teachingStages','combatProfession','lifeProfessions','relationships','appearance','voice','personality','home','workplace','schedule','proficiencies','professions','level','combat','goals','fears','redLines','opinions','towardPlayer','behaviorRules','serviceCatalog','hooks'].map(k=>[k,entry.draft[k]]));
 return{...(entry.id==='npc_bs_078_1'?{originalAlchemyProfession:catalogOriginal(world,{kind:'profession',id:'profession_life_8'}),feeNote:'新机构前廊的30铜是四条战斗路线收费，舒澄在既有学馆授既有生活职业炼金师，目录认证费20铜最低一级。'}:{}),teaching:teachingDesign.find(r=>r.id===entry.id)??null,newCatalog:contentAdditions(world),authoredResponsibility:{role:responsibilities.find(r=>r[0]===entry.id)?.[1]??entry.source.occupation,duty:dutyFor(entry.source),authority:'教学只依登记项目收学费，修补联络不替物主签约'},governance:world.settlementProfiles.find(p=>p.id==='loc_bs').details.governance,originalRoster:bundle.sources[i],authoredBiography:{familyEpisode:biographies[i][0],familyWith:entry.draft.relationships.at(-1).with,privateWish:biographies[i][1],wishAction:biographies[i][2],unsharedThought:biographies[i][3]},authoredDesign:authorDesign,authoredEvent:{...event,expressedPositions:event.actors.map((id,j)=>({id,name:all.get(id).name,proposal:event.positions[j],knownBy:event.actors})),state:"三人当时公开表达各自意见，未达成共同约定。"},townName:world.locations.find(l=>l.id==="loc_bs").name,participants:bundle.sources.filter(p=>event.actors.includes(p.id)),household:world.households.find(h=>h.id===entry.source.householdId),cohabitants:entry.source.household.map(id=>all.get(id)).map(p=>({id:p.id,name:p.name,age:p.age})),workplaces:world.locations.filter(l=>!contentAdditions(world).locations.some(n=>n.id===l.id)&&[event.location,entry.draft.workplace.location].includes(l.id)),authorHoldings:{coins:entry.draft.coins,inventory:entry.draft.inventory,ownership:'个人初始零用钱与一件闲置物；不是公库、雇佣付款或货栈代管货物。'},limits:'T93作者设计新生活往事、私人目标、外貌和说话习惯；不把相容的新人物事实误判为缺少旧史依据。T90原名册事实必须保留。共享事件与意见须相容，提议仍未决定；私下想法仅本人知晓。教学项目按teaching与newCatalog设计开放，学徒费用与认证沿现有操作结算；灯祠和四神教派保持旧称，道观和佛寺各有原创师承，仪式资格没有取得操作所以暂不发资格。钱物为个人初始零用与明确教学书库存，不添加债务、产权或公共库存。'};
}
export async function validate(bundle,world){
 const proposed=integrate(world,bundle),s=await read('schemas/world.schema.json'),ajv=new Ajv({strict:true,allowUnionTypes:true,allErrors:true}),check=ajv.compile({$ref:'#/$defs/npc',$defs:s.$defs});
 for(const p of bundle.people)assert.ok(check(p),`${p.id}: ${JSON.stringify(check.errors)}`);
 assert.deepEqual(validateNpcProfiles(proposed),[]);
 assert.deepEqual(validateNpcDepth(proposed).issues,[]);
 const blocked=await read('world/i18n/blocklist.zh.json');for(const p of bundle.people)assert.ok(!blocked.entries.map(e=>e.word).some(n=>JSON.stringify(p).includes(n)),p.id);
 for(let i=0;i<bundle.people.length;i++)for(const key of Object.keys(bundle.sources[i]))if(!['tier','home'].includes(key))assert.deepEqual(bundle.people[i][key],bundle.sources[i][key],`${bundle.people[i].id}.${key}`);
 return bundle;
}
export function integrate(world,bundle){
 const ids=new Set(bundle.people.map(p=>p.id));
 // Existing full profiles can have runtime/static edits after first promotion.
 return{...applyAdditions(world),npcs:[...world.npcs,...bundle.people.filter(p=>!world.npcs.some(n=>n.id===p.id))],residents:world.residents.filter(p=>!ids.has(p.id))};
}
export async function prepare(world){
 world??=await loadWorld();const bundle=authorCraft(world);await validate(bundle,world);
 const frozen=await read(path.join(root,'candidate.json')).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
 const published=await read(path.join(root,'published.json')).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
 if(published){assert.ok(frozen,'已发布卡缺少原审核来源');assert.deepEqual(frozen.entries.map(e=>correctServiceReferences(e.draft)),bundle.entries.map(e=>e.draft),'已审作者稿须受控修订，prepare不得覆盖原审核来源');}
 else await write(path.join(root,'candidate.json'),{revision,formalWrite:false,...bundle});
 return{world,bundle};
}
export async function review(){
 const {world,bundle}=await prepare(),ledger=await read(path.join(budgetRoot,'budget.json'));
 const allocation={cardId:'T93',waveLimitYuan:20,incrementLimitYuan:7,maxRequests:160,startingSpentYuan:ledger.spentYuan,startingReservedYuan:ledger.reservedYuan};
 const result=await runContentPipeline({entries:bundle.entries,root,budgetRoot,client:new DeepSeekClient({logFile:path.join(root,'usage.jsonl')}),cardId:'T93',allocation,revision,concurrency:1,batchSize:bundle.entries.length,retryManual:true,reuseFrozenDrafts:true,reviewDraftFor:e=>e.draft,buildDraftRequest:()=>{throw Error('T93禁止模型起草');},contextFor:e=>reviewContext(e,bundle,world),validateDraft:(draft,e)=>({errors:hashContent(draft)===hashContent(e.draft)?[]:['固定作者稿不符'],warnings:[]}),buildReviewRequest:(e,d,c)=>{const request=defaultReviewRequest({id:e.id,kind:e.kind,source:e.source},d,c);request.max_tokens=1600;request.messages[0].content+=' 本卡作者有权为原短名册创作完整人物。authoredDesign为手工设计的新日程、意向、性格和交谈规则，不是旧档事实推断。核对原名册保留、建筑时段、钱物数值、知识与私密边界、派生叙述及双方事件是否与明确素材相反。不能因为旧名册没有写过新稿事实就报无依据，也不将职业日常描写当作新引擎能力；没有明确相反事实不报矛盾。 expressedPositions按id标明各自公开意见，持有提议不等于已约定。自己的家务目标与当前关切可以并存，过去纸单问题不排除现在仍有折角问题。历史事件发生地与工作地可以不同。骨架的household是同户索引，不将共居推断为婚姻；未在knowledge中重述私人secret表示知情隔离。';return request;}});
 return{passed:result.summary.passed,manual:result.summary.manual,pending:result.summary.pending,budget:result.summary.budget.cards.T93};
}
export async function approved(world){
 world??=await loadWorld();const bundle=authorCraft(world),audited=await read(path.join(root,'candidate.json')),contexts=new Map();
 // Keep the real review immutable. The authorized correction removes operation
 // names from top-level services; schedules and inventory trading stay intact.
 for(const e of audited.entries){const record=await read(path.join(root,`${e.id}.json`)),response=await read(path.join(budgetRoot,record.responseEvidence.at(-1).file));contexts.set(e.id,JSON.parse(response.request.messages[1].content).publishedFacts);}
 const rows=await readApprovedContent(root,audited.entries,{revision,contextFor:e=>contexts.get(e.id)});
 assert.equal(rows.length,bundle.entries.length,'仍有未通过条目');assert.deepEqual(rows.map(correctServiceReferences),bundle.entries.map(e=>e.draft));await validate(bundle,world);
 const l4=await read(path.join(root,'l4.json'));assert.equal(l4.randomTen.length,10);assert.equal(new Set(l4.randomTen.map(r=>r.id)).size,10);
 for(const row of l4.randomTen){assert.ok(bundle.people.some(p=>p.id===row.id));assert.equal(row.scores.length,6);assert.ok(row.scores.every(s=>s>=3&&s<=5));assert.ok(row.note);}
 assert.ok(l4.randomTen.flatMap(r=>r.scores).reduce((a,b)=>a+b,0)/60>=4);
 return{world,bundle};
}
export function correctServiceReferences(draft){const result=structuredClone(draft);if(result.id.startsWith('npc_'))result.services=result.services.filter(s=>s!=='trade');return result;}
export async function publish(){
 const {world,bundle}=await approved(),next=integrate(world,bundle),changed=[];
 for(const [file,value] of [['people/baseline.json',next.npcs],['people/residents.json',next.residents],['geo/locations.json',next.locations],['geo/routes.json',next.routes],['meta/skills.json',next.skills],['meta/items.json',next.items],['meta/professions.json',next.professions]])if(hashContent(await read(`world/${file}`))!==hashContent(value)){await write(`world/${file}`,value);changed.push(file);}
 const ledger=await read(path.join(budgetRoot,'budget.json')),result={ids:bundle.people.map(p=>p.id),changed,sharedEvents:bundle.events.length,calls:Object.values(ledger.requests).filter(r=>r.card==='T93'&&!['reserved','cancelled-unissued'].includes(r.status)).length,...ledger.cards.T93};
 await write(path.join(root,'published.json'),result);return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){const command=process.argv[2]??'prepare';if(command==='prepare'){const {bundle}=await prepare();console.log(JSON.stringify({people:bundle.people.length,events:bundle.events.length,modelCalls:0}));}else if(command==='review')console.log(JSON.stringify(await review()));else if(command==='publish')console.log(JSON.stringify(await publish()));else throw Error('命令须为prepare/review/publish');}
