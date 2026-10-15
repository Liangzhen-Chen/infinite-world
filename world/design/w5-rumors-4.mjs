import {row,ref} from './w5-rumors-common.mjs';
const festivalClaims=[
['修渠灶饭要先验收田渠，病人的一份先留；哪家捐得多也不能拿饭换优先水权。','true'],
['水痕描槛确实比旧水位，可画完水痕，地界便自动移到那道线。','half'],
['果枝空篮日一摆空篮，就有权进所有人的园子采果，管理者无权挡。','false'],
['借凳归途日先得殿方允准，听返乡话不改变原来住宿债务和登记费。','true'],
['清阶日有人扫庭阶，因此扫过的人就有权代屋主签契。','half'],
['公灯交值日谁受邀谁就欠下一整年的灯班，不必本人答应。','false'],
['留白忆亲只展家属愿公开的文字，记不清就留白，悼念也不能顶作事实凭证。','true'],
['副契晾墨用旧誊本练责任词句，所以练习纸只要有姓名就成了正式契约。','half'],
['交绳歇井日摊贩可以堵住饮水口，示范绳也随时能替掉真井绳。','false'],
['识蹄骨哨日要畜主在场点头，少年在栏外听，庆日不送出骑乘权。','true'],
['晒种会讲失败苗株，所以匣里的种子展示后就保证全部成活。','half'],
['换绑听枝靠敲巢树试音，不用停用承重处，也无须合格工人。','false'],
['晒嗅布要各群证布分开放，鼻闻和亲见还得分说；好心洗布反而会毁掉证物。','true'],
['低鸣忆路让老人先讲熟路，既然唱过旧路，就必须亲自带所有人再走一次。','half'],
['补帆夜的船主一接受救助，整条船便归补帆人，补好也保证适航。','false'],
['空泊阅潮只看港方愿公开的部分，岸上比画吃水不等于获准泊位或保证当日可航。','true'],
['封湾验具要清点自家救船具，点过以后便人人有权破冰出港。','half'],
['换芯长夜点了灯能延长白昼，冬储油也不经同意就可取用。','false'],
['候雨市得有可收集的首雨且水源确认，空罐敲着不裂，也不能证明水里没毒。','true'],
['量影日借阴凉歇脚，既然坐在井边，就一起取得了井水份额。','half'],
['停炉补架日不用炉主确认停炉，还能借修担架取消旧工伤份额。','false'],
['退楔示裂只在指定处对比旧裂纹，不再让事故楔承重；护身的说法查不到依据。','true'],
['撤旧符日会核效期，所以只要节日到了，旧债便一并撤掉。','half'],
['晴檐拓尺能把水位改高，普通纸拓过水尺便都有符术效果。','false']
];
export function rumors(w){const out=festivalClaims.map(([c,t],i)=>{const f=w.festivals[i];return row(4,i,c,t,['condition','custom','permission'].map(field=>ref('festivals',f.id,field)),`${f.name}：${f.condition}；${f.custom}；${f.permission}。`,
 `查${f.name}的公开举办条件与场地；到场前确认主办人在场和当日可举办，未开办不能凭传闻扣料或领权。`);});
 const fs=w.factions.filter(f=>f.clock?.stages?.length&&!['faction_blackfloat','faction_quietledger'].includes(f.id)).slice(0,21);
 for(const [i,f]of fs.entries()){const stage=f.clock.stages.find(s=>s.id==='s1')??f.clock.stages[0],truth=['true','half','false'][i%3];
  const claim=truth==='true'?`${f.name}的${f.clock.name}打算先做“${stage.name}”。这只是阶段安排，得核对条件和公库，不能听说就算办成。`:
   truth==='half'?`${f.name}确有“${stage.name}”这一阶段，所以只要到日子就必定推进，公库不足也不碍事。`:
   `${f.name}的${f.clock.name}根本没有“${stage.name}”这一步，公开阶段表里也找不到。`;
  out.push(row(4,out.length,claim,truth,[ref('factions',f.id,'clock.stages'),ref('factions',f.id,'clock.name')],`${f.clock.name}已登记阶段“${stage.name}”；条件${JSON.stringify(stage.condition)}，消耗${JSON.stringify(stage.cost)}。到期仍按实际条件与概率结算，不保证已发生。`,
   `去${w.locations.find(l=>l.id===f.clock.contact?.location)?.name??'该势力联络点'}查阶段和实际执行记录；出钱物干预须按已登记入口处理，不能靠一句听闻改结局。`));
 }
 return out;}
