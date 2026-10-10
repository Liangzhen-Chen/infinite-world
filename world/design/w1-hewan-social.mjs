export const hewanSocial={
 vice:[['hedi','贪小便宜','轮到自己取家用水时，常想说动不熟悉规矩的人代排队'],['fangqin','好赌','休息时爱押小彩，输后不肯认错'],['luxun','懒散','能做的轻家务也常推说等一会儿'],['shenhe','刻薄','见生人问得不清楚，容易用尖话堵回去'],['shaohe','贪杯','闲下来就惦记酒，家人劝停时装作没听见'],['shaoyun','贪小利','分晒位时把自己的边线多挪一点，被指出才退回'],['randai','爱嚼舌根','把没有问清的邻里小事拿来猜人心思'],['dengjia','嗜赌','赌输赢偶尔耽误约好的轻活'],['feiyin','欺软怕硬','敢催不爱争辩的靳苹让位，却不敢催声气强的人']],
 outsiders:[['hedi','觉得外来人不懂船边规矩，常先让他们去别处等'],['shenhe','生人问及驿站时先冷脸打量来意'],['shaohe','不喜欢陌生人在自己歇脚时凑近搭话'],['shaoyun','担心生人踩乱晒物，接近时先板起脸'],['randai','对新来的同行先挑毛病才肯搭话'],['jinping','不愿向陌生人解释家务安排，常只简短应声']],
 misconduct:[['hedi','曾把没做的整理工时混入草记，被指出后已划掉，没有由此形成现欠报酬'],['fangqin','曾在输掉口头小彩后反口说自己没答应，后来已当面对清，不生成当前债务'],['dengjia','曾为赴赌局谎称身体不适，爽约一次邻里清路轻活，事后补做了该段']],
 profitableLiar:['hedi','为了让外来者替自己排队，会隐瞒实际已经轮到自家的情况'],
 conflicts:[
 ['hedi','shaoyun','争用晾绳与晒粮交会的空处','何荻认为绳料挡路较少','邵芸认为粮粒怕再淋湿'],
 ['fangqin','luxun','歇脚处安静看旧纸与闲谈互相打扰','方芩希望该时段少说话','陆荀不愿自己的休息被排开'],
 ['shenhe','randai','冉黛追问未公开的家信话头','沈荷坚持由收件人自己开口','冉黛想先知道邻里消息'],
 ['shaohe','dengjia','清路轻活撞上各自想留作消遣的时段','邵鹤希望晚辈先做','邓稼要求轮到谁就谁承担'],
 ['feiyin','jinping','争用织坊允许协商的同一晒布时段','费茵想先把本户布收干','靳苹要求先来者不被声气大的人挤走'],
 ['yuxing','ruanzheng','争用同一窗边风干旧衣的晾位','余杏惦记顾岑湿衣','阮筝想把苏岚补好的衣袖先晾干'],
 ],
};
export function applyHewanSocial(residents){
 const person=key=>residents.find(n=>n.id===`npc_hw_${key}`);
 for(const [key,vice,detail]of hewanSocial.vice){const n=person(key);n.traits=[vice,n.traits[1]];n.socialProfile={...n.socialProfile,vice:{kind:vice,detail}};}
 for(const [key,detail]of hewanSocial.outsiders){const n=person(key);n.socialProfile={...n.socialProfile,outsiderAttitude:detail};}
 for(const [key,detail]of hewanSocial.misconduct){const n=person(key);n.socialProfile={...n.socialProfile,pastMisconduct:detail};}
 person(hewanSocial.profitableLiar[0]).socialProfile.liesForBenefit=hewanSocial.profitableLiar[1];
 for(const [left,right,issue,leftPosition,rightPosition]of hewanSocial.conflicts)for(const [key,other,position]of [[left,right,leftPosition],[right,left,rightPosition]]){
  const n=person(key);n.socialProfile={...n.socialProfile,conflicts:[...(n.socialProfile?.conflicts??[]),{with:`npc_hw_${other}`,issue,position}]};n.currentConcern=`${n.currentConcern}；眼下${issue}，${position}。`;
 }
}
