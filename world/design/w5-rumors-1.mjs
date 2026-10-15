import {row,ref} from './w5-rumors-common.mjs';
export function rumors(w){const out=[],add=(claim,truth,collection,id,field,fact,verification)=>out.push(row(1,out.length,claim,truth,[ref(collection,id,field)],fact,verification));
 const provinces=[
 ['prov_xichui','西陲的货路离不开河谷田粮、麻布和渡口，问运货的人，往往先问水。','true'],
 ['prov_hanlu','寒炉有铜铁矿，便全归王国管；赭牙两谷也照王国官差的税册交钱。','half'],
 ['prov_xingwan','星湾一带靠咸鱼、灯油与冬储营生，去那边问路，最好把救船的事也问明白。','true'],
 ['prov_feicui','翡翠林盟的林地只有王国官员作主，林盟和砾耳兽裔都没有自己的议事地盘。','false'],
 ['prov_hupo','琥珀海岸做港运和修船的人多，绳具与救船不是码头外的闲话。','true'],
 ['prov_zhonglu','中陆有官署和市集，所有城邦便必定遵同一份普通郡制，从未有特许。','half'],
 ['prov_fengji','风脊草原的诸帐养马、制毡，也做绳索；谈生意得先认是哪家帐。','true'],
 ['prov_jingzhao','镜沼到灰盐是一整片干山，从来没有泥沼芦滩，更做不出芦纸。','false'],
 ['prov_wushan','雾杉外林有林产，春夏秋冬便都能任意进林伐取，杉根联邑不会管。','half']];
 for(const [id,c,t]of provinces){const r=w.regions.find(r=>r.id===id);add(c,t,'regions',id,'description',`纲要记载：${r.description}`,`核对${r.name}的省纲要与邻接说明，只据纲要问路，不把未生成的村落当成已见。`);}
 const counties=[
 ['county_xichui_longqu','垄渠郡治所叫渠阳城，白石的陶窑和集市也列在这郡的营生里。','true'],
 ['county_xichui_xiadu','下渡郡治所在雁渡，渡运船坞之外也有芦编和河鱼生计。','true'],
 ['county_xichui_huancheng','环城郡既有官仓转运，所有织染和车马生意便都由官仓包办。','half'],
 ['county_xichui_shangzha','上闸郡完全没有水磨和闸坝，只卖海船，治所也不叫上闸堡。','false'],
 ['county_hanlu_tongji','铜脊的矿具、铜器都围着铜矿和冶炉做，治所在铜脊城。','true'],
 ['county_hanlu_tuixie','退楔郡有冰窖，便说明当地除了存冰什么营生也没有。','half'],
 ['county_hanlu_zheya','赭牙谷不产铁、不养驮兽，所谓赭牙大营也是后人编的名字。','false'],
 ['county_hanlu_heilu','黑炉谷有冶铁和木炭，所以每座山坡都可以随手烧炭，不必问地权。','half'],
 ['county_xingwan_xuedeng','雪灯郡既无冰窖又不存腌肉，山口也没有驿站。','false']];
 for(const [id,c,t]of counties){const r=w.regions.find(r=>r.id===id);add(c,t,'regions',id,'description',`郡纲要：${r.description}`,`比对${r.name}的治所和产业纲要；具体住户、价格与权限须到访后另问。`);}
 const societies=[
 ['loc_ms_tanjie','炭阶地宫的住区沿旧窑道展开，洞里敲管传话，不是地面镇街。','true','description'],
 ['loc_ms_tanjie','炭阶有人愿用菌粮和修补活计换粮，也有人嫌价贱想抢粮；谈粮约不能只听一边。','true','monsterSociety.positions'],
 ['loc_ms_tanjie','炭阶既有守窟换粮的人，便已全窟同意粮约，抢粮的主张再没人提了。','half','monsterSociety.positions'],
 ['loc_ms_taideng','苔灯坞的气味绳既指路也传话，夜里尾尖冷光在树根家巢间来往。','true','description'],
 ['loc_ms_taideng','苔灯狐有人愿结互助之缘，所以夹伤的旧账也就自动全免了。','half','monsterSociety.positions'],
 ['loc_ms_taideng','苔灯坞没有追偿派，从来没有狐族收着旧捕夹等猎户认账。','false','monsterSociety.positions'],
 ['loc_ms_yugen','榆根里的树穴下面接着地窟，夜里木精扎根，穴鼬和林獾才出窟干活。','true','description'],
 ['loc_ms_yugen','榆根里确有穴居者干排水运土，便可认定林产分配已经由各族共同议定。','half','monsterSociety.positions'],
 ['loc_ms_yugen','榆根里从来只有木精，没有穴鼬和林獾居住，更没有地窟。','false','description'],
 ['loc_ms_lielu','裂炉营有工匠主张按件换粮，说明砾泉纳贡早已取消，守贡派也散了。','half','monsterSociety.positions'],
 ['loc_ms_lielu','裂炉营人人都只认守贡，哥布林工匠从没提出按工分粮。','false','monsterSociety.positions'],
 ['loc_ms_lielu','裂炉营的契板是空的，营里约定全凭口说，从不画在板上。','false','description']];
 for(const [id,c,t,field]of societies){const l=w.locations.find(l=>l.id===id);add(c,t,'locations',id,field,`核验原文：${JSON.stringify(field==='description'?l.description:l.monsterSociety.positions)}`,`沿登记支路到${l.name}，在获准接触的公共处询问；派别主张须与议事结果分开。`);}
 const tribes=[
 ['北林獾群有想划界互市的，也有要往深林退的；别把一群掘界者当成全群意见。','true'],
 ['北林獾群想拿块根换盐，所以河湾已经答应把北林所有田埂送给它们。','half'],
 ['北林獾群只想不分边界地杀人，从没有提出停夹或互市。','false'],
 ['旧矿道巨魔里有人要按工换粮，有人索性想退深洞；肯背矿不等于肯受轭。','true'],
 ['巨魔提出学凿石，所以裂炉营已经全体承认它们是独立一族，往后无需再议。','half'],
 ['砾泉巨魔从不反对受轭，也没人提出背矿要换粮，断轭众的名字是虚构的。','false'],
 ['北岗白獐有主张按季采芝的，也有躲雾岗的；封山怎么议，群内还分几种想法。','true'],
 ['白獐愿跟木精学认药，所以北岗全年封禁已成约定，所有采药人都得立即退走。','half'],
 ['北岗白獐没有学艺诉求，也从来不在意套獐取角和连根采芝。','false']];
 tribes.forEach(([c,t],i)=>{const j=Math.floor(i/3),d=w.rules.tribalAwakening.dynamics[j];add(c,t,'rules',null,`tribalAwakening.dynamics.${j}`,`此为诉求与分派，未必成为结局：${JSON.stringify({name:d.name,factions:d.factions,demands:d.demands})}`,`询问${w.npcs.find(n=>n.id===d.carriers[0]).name}或去${w.locations.find(l=>l.id===d.home).name}核对诉求，再查实际议事和立约记录。`);});
 const hazards=[
 ['河湾汛期得等雨势和水情，水涨的消息不等于眼下渡口已经封路。','true','clocks.0'],
 ['冬荒要看实际存粮与阶段，听见缺粮传话，先查当地公库与粮价。','true','clocks'],
 ['河泻症走水路传播，所以只要净一次水，所有已经发病的人立刻痊愈。','half','measures'],
 ['寒咳疫能经空气传，所以隔开病户和照护病人完全没有用。','half','measures'],
 ['河泻症只有咳嗽没有腹泻，喝水的来路也从来不影响传播。','false','diseases.0'],
 ['寒咳疫不伤胸口，也不发寒热，水净了就能断掉全部空气传播。','false','diseases.1']];
 for(const [c,t,field]of hazards)add(c,t,'rules',null,`hazardClock.${field}`,`灾害依登记阶段与条件推进；疾病和措施原文：${JSON.stringify(field==='clocks'||field==='clocks.0'?w.rules.hazardClock.clocks[0]:field==='measures'?w.rules.hazardClock.measures:w.rules.hazardClock.diseases[Number(field.at(-1))])}`,'问渡口水情或当地照护者，核对已发生的阶段、症状和措施；不能拿预警当作已经发生的灾情。');
 return out;
}
