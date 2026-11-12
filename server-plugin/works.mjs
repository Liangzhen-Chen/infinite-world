import {preconditionFailure} from './precondition.mjs';
// U6: signed works. Through world_research operations a player writes and
// publishes books, copies skill books, performs, surveys maps and runs skill
// fusion experiments; finished crafts by painters and sculptors register as
// signed art (manufacturing). Works carry author, provenance and quality; they
// earn income, settlement contribution (civic.mjs) and fame (reputation account
// plus settlement standing), and each yields a world event. A masterpiece
// becomes breakthrough evidence through career-metrics, never a second path.
import {purse,purse as purseAccount,source,sink,moveCoins} from './money.mjs';
import {declareLedgerWriter} from './ledger.mjs';
import {craftInput,craftOutput,recordCraft} from './stock.mjs';
// S1b: 写作、抄书、测绘按作品规则（WORK_RULES，等同配方 works:<操作>）是 src:craft 制造守恒对：纸墨进 sink:consume，
// 成品来自 src:craft；出版印书同样按册耗纸墨、成书来自 src:craft（印刷费付印工手工，进 sink:export）。
declareLedgerWriter('works',{sources:{'src:import':{coin_river:200000},'src:craft':{'*':10000}},sinks:['sink:export','sink:consume']});
import {knowsKnowledge,knowledgeProficiency} from './education-state.mjs';
import {digest}from'./storage.mjs';
import {settlementAt}from'./reputation.mjs';
import {adjustStanding}from'./standing.mjs';
import {presentWitnesses}from'./world-events.mjs';
import {produceItems,transferItems,workmanshipTier}from'./items.mjs';
import {effectiveProficiency}from'./professions.mjs';
import {spellElements}from'./career-metrics.mjs';
import {declareHoldingWriter,holdingSet} from './holdings.mjs';
import {customerPurseShare} from './market.mjs';
import {subjectiveView} from './subjective-view.mjs';
import {npcDecision} from './npc-decision.mjs';
declareHoldingWriter('works',{kinds:['owns'],locations:true});

export const WORK_RULES=Object.freeze({
    literacySkill:'skill_literacy',scribeSkill:'skill_life_22_core',surveySkill:'skill_life_11_core',artSkills:['skill_life_14_core','skill_life_16_core'],
    paper:'item_parchment',ink:'item_soot_ink',manuscript:'item_work_manuscript',book:'item_work_book',map:'item_work_map',
    printCost:4,bookPrice:8,demand:10,performanceTip:{勉强成功:1,成功:2,大成功:3},minimumAudience:3,
    points:{publish:2,perform:1,survey:1,masterpiece:1},fame:{publish:1,perform:1,masterpiece:2},standing:2,
    fusion:{minimumProficiency:600,minimumCoins:20,minimumMinutes:240,fraction:4,difficulty:20},
});
const QUALITY=['粗糙','普通','精良','优秀','杰作'];
const OPERATIONS=new Set(['write','publish','copy','perform','survey','fuse']);
export const isWorkOperation=operation=>OPERATIONS.has(operation);
const integer=(value,min,max,label)=>{if(!Number.isSafeInteger(value)||value<min||value>max)throw preconditionFailure(`${label}需在${min}到${max}之间`);return value;};
const text=(value,label)=>{if(typeof value!=='string'||!value.trim()||value.length>200)throw preconditionFailure(`${label}无效`);return value.trim();};
const grade=value=>`${['初级','中级','高级','特级','专家级','大师级','宗师级','圣级','神级'][Math.min(8,Math.floor(value/300))]}${Math.floor(value%300/100)+1}等`;
// Same scale as manufacturing workmanship.
export const workQuality=(outcome,proficiency)=>!outcome.success?null:outcome.degree==='勉强成功'?'粗糙':outcome.degree==='大成功'?(proficiency>=2100?'杰作':proficiency>=1500?'优秀':'精良'):'普通';
const factor=(engine,quality)=>workmanshipTier(engine,quality).multiplier;

function learned(d,engine,name,label){
    const skill=engine.resolve(name,'skill');
    if(!d.get('state','skills',skill))throw preconditionFailure(`尚未掌握${label??engine.byId.get(skill)?.name??skill}`);
    return skill;
}
function literate(d,engine){
    if((d.get('state','skills',WORK_RULES.literacySkill,'proficiency')??0)<engine.rules.books.minimumLiteracy)throw preconditionFailure('识字熟练度不足');
}
function spend(d,engine,rows,eventId,recipe,outputs={}){
    for(const[item,amount]of rows)if(engine.quantity(d,'player',item)<amount)throw preconditionFailure(`缺少${engine.byId.get(item)?.name??item}`);
    for(const[item,amount]of rows)engine.itemDelta(d,'player',item,-amount,craftInput('works',eventId));
    // 行为人 = 玩家，发生地 = 玩家所在地的聚落。只有产出物品（印成册的书）的工序带 place 记耗料；撰写、抄录、勘绘的产物是文书记录不是物品，没有物品产物，不计入耗料日桶。
    recordCraft(d,{engine,actor:'player',...(Object.keys(outputs).length?{place:placeOf(d,engine).settlement}:{}),recipe,batches:1,inputs:Object.fromEntries(rows),outputs,writer:'works',eventId});
}
// 成品入账并补全本次制造凭据的产出。
function crafted(d,engine,item,quantity,{eventId,workmanship}){
    const ids=produceItems(d,engine,item,quantity,{eventId,workmanship,books:craftOutput('works',eventId)});
    const log=d.get('ledger','crafts');if(log?.length&&log.at(-1).eventId===eventId)d.set(['ledger','crafts',String(log.length-1),'outputs'],{...log.at(-1).outputs,[item]:quantity});
    return ids;
}
function placeOf(d,engine){
    const location=d.get('state','location');
    return{location,settlement:settlementAt(engine,location)};
}
function save(d,work){d.set(['state','works',work.id],work);return work;}

// Fame goes into the existing settlement reputation account (same key as the
// legal reputation ledger) and the settlement's standing toward the player.
export function addFame(d,engine,settlement,fame,sourceEvent,reason){
    if(!settlement||!fame)return null;
    const id=`reputation:${digest(['player','settlement',settlement]).slice(0,24)}`,old=d.get('state','records',id);
    if(old&&old.category!=='reputation')throw Error('声望账记录编号冲突');
    const account=old??{category:'reputation',subject:'player',scope:'settlement',target:settlement,reputation:0,fame:0,notoriety:0,deltas:[]};
    if(account.deltas.some(row=>row.sourceEvent===sourceEvent&&row.stage==='work'))return null;
    const minute=d.get('state','minute');
    d.set(['state','records',id],{...account,fame:account.fame+fame,deltas:[...account.deltas,{reputation:0,fame,notoriety:0,stage:'work',sourceEvent,minute,reason}]});
    adjustStanding(d,engine,settlement,'player',WORK_RULES.standing,{sourceEvent,reason:`work:${reason}`,via:'work',minute});
    return{settlement,fame};
}
const event=(kind,work,{masterpiece=false,value=0,skill=null}={})=>({verb:'author',target:null,tags:['work',kind,...(masterpiece?['masterpiece']:[])],work:work.id,value,
    ...(masterpiece&&skill?{masterpiece:true,skill}:{})});
const fameFor=(kind,masterpiece)=>(WORK_RULES.fame[kind]??0)+(masterpiece?WORK_RULES.fame.masterpiece:0);

function write(d,engine,args,id){
    literate(d,engine);
    const title=text(args.name,'书名'),concept=text(args.concept,'内容提要'),skill=learned(d,engine,(args.skills??[])[0]??WORK_RULES.literacySkill);
    const teaches=[...new Set((args.entities??[skill]).map(x=>engine.resolve(x)))];
    for(const entity of teaches)if(!['skill','recipe','spell'].includes(entity.split('_')[0])||!knowsKnowledge(engine,d.get('state'),'player',entity))throw preconditionFailure('只能写入本人已掌握的已登记技能、配方或法术');
    const minutes=integer(args.minutes??240,120,480,'写作时间');
    spend(d,engine,[[WORK_RULES.paper,1]],id,'works:write');
    engine.advance(d,minutes,id);
    const proficiency=effectiveProficiency(d,engine,skill),outcome=engine.check(d,{attribute:'智力',skill,difficulty:15},id),quality=workQuality(outcome,proficiency);
    if(!outcome.success){d.say(`《${title}》未能成稿，耗时${minutes}分钟`);return{operation:'write',minutes,...outcome};}
    const [instance]=crafted(d,engine,WORK_RULES.manuscript,1,{eventId:id,workmanship:quality});
    const masterpiece=quality==='杰作',{location,settlement}=placeOf(d,engine);
    const work=save(d,{id:`work_${id}`,kind:'manuscript',title,concept,author:'player',authorName:d.get('state','player','name'),skill,quality,masterpiece,
        teaches,knowledge:{grade:engine.rules.books.grades[Math.min(4,Math.floor(effectiveProficiency(d,engine,skill)/300))],teaches,
            ceilings:Object.fromEntries(teaches.map(entity=>[entity,effectiveProficiency(d,engine,entity.startsWith('skill_')?entity:engine.byId.get(entity).skill)])),author:'player',edition:1,chain:[]},
        minute:d.get('state','minute'),location,settlement,sourceEvent:id,item:WORK_RULES.manuscript,instance,editions:[]});
    holdingSet(d,null,['state','itemInstances',instance,'work'],work.id,'works');
    holdingSet(d,null,['state','itemInstances',instance,'book'],work.knowledge,'works');
    d.say(`写成《${title}》，${quality}`);
    return{operation:'write',work:work.id,quality,masterpiece,instance,minutes,...outcome,workEvent:event('write',work,{masterpiece,skill})};
}

function publish(d,engine,args,id){
    const work=d.get('state','works',args.project);
    if(!work||work.kind!=='manuscript'||work.author!=='player')throw preconditionFailure('需要自己写成的署名书稿');
    const unit=d.get('state','itemInstances',work.instance);
    if(!unit||unit.owner!=='player'||unit.status!=='持有')throw preconditionFailure('书稿不在手边');
    const{location,settlement}=placeOf(d,engine);if(!settlement)throw preconditionFailure('出版需要在有印坊书肆的聚落');
    const coins=integer(args.coins,WORK_RULES.printCost,WORK_RULES.printCost*200,'印刷费'),printed=Math.floor(coins/WORK_RULES.printCost);
    if(d.get('state','player','coins')<coins)throw preconditionFailure('印刷费不足');
    // 印书是真实制造：每册耗一张纸、一份墨，由著者备料交印坊（与抄书同料）；印刷费只付印工的手工。
    const materials=[[WORK_RULES.paper,printed],[WORK_RULES.ink,printed]];
    for(const[item,amount]of materials)if(engine.quantity(d,'player',item)<amount)throw preconditionFailure(`缺少${engine.byId.get(item)?.name??item}`);
    moveCoins(d,{from:purse(engine,'player'),to:sink('export','printing'),amount:coins,writer:'works',eventId:id});
    d.set(['state','player','coins'],d.get('state','player','coins')-coins);
    engine.advance(d,60,id);
    const multiplier=factor(engine,work.quality),edition=work.editions.length+1;
    // F014: a book sells only to real readers. A candidate is a literate resident of this settlement who can spare the
    // price (the shop-customer share of the purse, balance/economy shop.customerPurseShare) and does not already own a
    // copy. Each candidate decides for themselves through the NPC decision path (red lines, circumstances, cost against
    // the value of the book to them); nobody is assigned a copy by ranking. Their money moves from their own purse; the
    // same person is never a second edition's buyer.
    const price=Math.max(1,Math.round(WORK_RULES.bookPrice*multiplier)),owned=new Set(work.editions.flatMap(row=>row.buyers??[])),state=d.get('state'),share=customerPurseShare(engine);
    const readers=Object.entries(state.npcs??{}).filter(([npc,row])=>!owned.has(npc)&&settlementAt(engine,row.location)===settlement&&!['死亡','濒死','昏迷'].includes(row.status)
        &&knowledgeProficiency(engine,state,npc,WORK_RULES.literacySkill)>=engine.rules.books.minimumLiteracy&&Math.floor((row.coins??0)*share)>=price)
        .map(([npc])=>npc).sort();
    const buyers=[],ceiling=engine.rules.npcGrowth?.maximumProficiency??2700;
    for(const npc of readers){
        if(buyers.length>=printed)break;
        const literacy=knowledgeProficiency(engine,state,npc,WORK_RULES.literacySkill);
        const decision=npcDecision(subjectiveView(engine,d.document,npc),{kind:'purchase',from:'player',cost:{coins:price},reward:price,needSatisfaction:Math.min(100,Math.round(100*literacy/ceiling))});
        if(decision.outcome==='agree')buyers.push(npc);
    }
    const sold=buyers.length,income=sold*price;
    if(printed)spend(d,engine,materials,id,'works:publish',{[WORK_RULES.book]:printed});
    const kept=printed-sold,instances=printed?crafted(d,engine,WORK_RULES.book,printed,{eventId:id,workmanship:work.quality}):[];
    const sales=[];
    for(const [index,npc] of buyers.entries()){
        const unit=instances[index];
        transferItems(d,engine,'player',npc,WORK_RULES.book,1,[unit]);
        moveCoins(d,{from:purseAccount(engine,npc),to:purse(engine,'player'),amount:price,writer:'works',eventId:id});
        d.set(['state','npcs',npc,'coins'],d.get('state','npcs',npc,'coins')-price);sales.push({npc,instance:unit,price});
    }
    d.set(['state','player','coins'],d.get('state','player','coins')+income);
    const heldCopies=instances.slice(sold);
    for(const unitId of instances){holdingSet(d,null,['state','itemInstances',unitId,'work'],work.id,'works');if(work.knowledge)holdingSet(d,null,['state','itemInstances',unitId,'book'],{...work.knowledge,edition},'works');}
    // Fame, standing and civic points are earned once per work, by its first edition that actually finds readers.
    const first=!work.editions.some(row=>row.sold>0),credited=first&&sold>0;
    const row={edition,eventId:id,settlement,location,printed,sold,kept,price,income,cost:coins,buyers,minute:d.get('state','minute'),points:credited?WORK_RULES.points.publish+(work.masterpiece?WORK_RULES.points.masterpiece:0):0};
    save(d,{...work,editions:[...work.editions,row]});
    const fame=credited?addFame(d,engine,settlement,fameFor('publish',work.masterpiece),id,'publish'):null;
    d.say(`《${work.title}》第${edition}版印${printed}册，售出${sold}册得${income}铜`);
    return{operation:'publish',work:work.id,edition,printed,sold,kept,income,cost:coins,instances:heldCopies,buyers,...(fame?{fame}:{}),workEvent:event('publish',work,{value:income})};
}

// Highest grade among the held units of a book: an uncopied unit carries the
// catalog grade, a copy its own (never above its original).
export function heldBookGrade(d,engine,item){
    const definition=engine.byId.get(item),grades=engine.rules.books.grades;
    const held=d.get(...engine.bagPath('player'),item),ids=typeof held==='object'?held.instances??[]:[];
    const units=ids.map(unit=>d.get('state','itemInstances',unit)).filter(row=>row&&row.owner==='player'&&row.status==='持有'&&row.durability!==0);
    const copies=units.filter(row=>row.book),originals=definition?.book?engine.quantity(d,'player',item)-copies.length:0;
    const best=Math.max(-1,originals>0?grades.indexOf(definition.book.grade):-1,...copies.map(row=>grades.indexOf(row.book.grade)));
    const unit=originals>0&&best===grades.indexOf(definition.book.grade)?units.find(row=>!row.book)??null:copies.find(row=>grades.indexOf(row.book.grade)===best)??null;
    return best<0?null:{grade:grades[best],index:best,unit};
}

function copy(d,engine,args,id){
    const selected=d.get('state','itemInstances',args.project),item=selected?.item??engine.resolve(args.project,'item'),definition=engine.byId.get(item);
    if(!definition.book&&!selected?.book)throw preconditionFailure('只能抄写技能书');
    if(engine.quantity(d,'player',item)<1)throw preconditionFailure('抄写需要手头有原本');
    literate(d,engine);learned(d,engine,WORK_RULES.scribeSkill,'抄写员技能');
    const source=selected?.book&&selected.owner==='player'&&selected.status==='持有'&&selected.durability!==0?{unit:selected,index:engine.rules.books.grades.indexOf(selected.book.grade)}:heldBookGrade(d,engine,item);if(!source||source.index<0)throw preconditionFailure('原本已损坏，不能作为抄写底本');
    const grades=engine.rules.books.grades,scribe=effectiveProficiency(d,engine,WORK_RULES.scribeSkill);
    const index=Math.min(source.index,Math.floor(scribe/300),grades.length-1),minutes=engine.rules.books.readingMinutes[source.index];
    spend(d,engine,[[WORK_RULES.paper,source.index+1],[WORK_RULES.ink,1]],id,'works:copy');
    engine.advance(d,minutes,id);
    const outcome=engine.check(d,{attribute:'智力',skill:WORK_RULES.scribeSkill,difficulty:[10,15,20,25,30][source.index]??30},id);
    if(!outcome.success){d.say(`抄写《${definition.name}》失败，纸墨已耗`);return{operation:'copy',item,minutes,...outcome};}
    const origin=source.unit?.book??null,chain=[...origin?.chain??[],source.unit?.book?source.unit.id:`catalog:${item}`];
    const edition=(origin?.edition??0)+1,[instance]=crafted(d,engine,item,1,{eventId:id,workmanship:workQuality(outcome,scribe)});
    const author=origin?.author??definition.book?.author,recordAuthor=Boolean(author)&&(!engine.replaying||engine.replayResult?.bookAuthor!==undefined);
    const book={...origin,...(recordAuthor?{author}:{}),teaches:origin?.teaches??definition.book?.teaches??[],grade:grades[index],edition,chain,source:source.unit?.id??null,scribe:'player',scribeName:d.get('state','player','name'),copiedAt:d.get('state','minute')};
    holdingSet(d,null,['state','itemInstances',instance,'book'],book,'works');
    const{location,settlement}=placeOf(d,engine);
    const work=save(d,{id:`work_${id}`,kind:'copy',title:definition.name,author:definition.book?.author??origin?.author,scribe:'player',skill:WORK_RULES.scribeSkill,quality:workQuality(outcome,scribe),
        masterpiece:false,minute:d.get('state','minute'),location,settlement,sourceEvent:id,item,instance,grade:book.grade,edition,chain});
    holdingSet(d,null,['state','itemInstances',instance,'work'],work.id,'works');
    d.say(`抄成《${definition.name}》第${edition}代抄本，品级${book.grade}`);
    return{operation:'copy',work:work.id,item,instance,grade:book.grade,edition,chain,minutes,...(recordAuthor?{bookAuthor:author}:{}),...outcome,workEvent:event('copy',work)};
}

function perform(d,engine,args,id){
    const title=text(args.name,'曲目'),skill=learned(d,engine,(args.skills??[])[0]??'skill_life_13_core');
    const{location,settlement}=placeOf(d,engine);if(!settlement)throw preconditionFailure('表演需要在聚落里的场地');
    const before=d.get('state'),audience=presentWitnesses(before,location);
    if(!audience.length)throw preconditionFailure('场地没有观众');
    const minutes=integer(args.minutes??60,30,240,'表演时间');
    engine.advance(d,minutes,id);
    const proficiency=effectiveProficiency(d,engine,skill),outcome=engine.check(d,{attribute:engine.byId.get(skill)?.attribute??'魅力',skill,difficulty:15},id),quality=workQuality(outcome,proficiency);
    let income=0;const tips=[];
    if(outcome.success)for(const npc of audience){
        const purse=d.get('state','npcs',npc,'coins')??0,tip=Math.min(purse,WORK_RULES.performanceTip[outcome.degree]??0);
        if(!tip)continue;
        moveCoins(d,{from:purseAccount(engine,npc),to:purseAccount(engine,'player'),amount:tip,writer:'works',eventId:id});d.set(['state','npcs',npc,'coins'],purse-tip);income+=tip;tips.push({npc,coins:tip});
    }
    if(income)d.set(['state','player','coins'],d.get('state','player','coins')+income);
    const masterpiece=quality==='杰作',counted=outcome.success&&audience.length>=WORK_RULES.minimumAudience;
    const work=save(d,{id:`work_${id}`,kind:'performance',title,author:'player',authorName:d.get('state','player','name'),skill,quality,masterpiece,minute:d.get('state','minute'),
        location,settlement,sourceEvent:id,audience,income,success:outcome.success,points:counted?WORK_RULES.points.perform+(masterpiece?WORK_RULES.points.masterpiece:0):0});
    const fame=outcome.success?addFame(d,engine,settlement,fameFor('perform',masterpiece),id,'perform'):null;
    d.say(outcome.success?`演出《${title}》，${audience.length}位观众，得赏${income}铜`:`演出《${title}》未能打动观众`);
    return{operation:'perform',work:work.id,audience,income,tips,quality,masterpiece,minutes,...(fame?{fame}:{}),...outcome,workEvent:event('perform',work,{masterpiece,skill,value:income})};
}

// A map covers what the surveyor has walked: the current place and every
// discovered neighbour along a known route.
function survey(d,engine,args,id){
    const title=text(args.name,'图名'),skill=learned(d,engine,(args.skills??[])[0]??WORK_RULES.surveySkill);
    literate(d,engine);
    const{location,settlement}=placeOf(d,engine),known=id=>Boolean(d.get('state','discoveries',id))||id===location;
    const routes=engine.world.routes.filter(row=>[row.from,row.to].includes(location)&&known(row.from)&&known(row.to));
    const locations=[...new Set([location,...routes.flatMap(row=>[row.from,row.to])])].sort();
    const minutes=integer(args.minutes??180,120,480,'测绘时间');
    spend(d,engine,[[WORK_RULES.paper,1],[WORK_RULES.ink,1]],id,'works:survey');
    engine.advance(d,minutes,id);
    const proficiency=effectiveProficiency(d,engine,skill),outcome=engine.check(d,{attribute:'智力',skill,difficulty:15},id),quality=workQuality(outcome,proficiency);
    if(!outcome.success){d.say(`《${title}》测绘失败，纸墨已耗`);return{operation:'survey',minutes,...outcome};}
    const [instance]=crafted(d,engine,WORK_RULES.map,1,{eventId:id,workmanship:quality}),masterpiece=quality==='杰作';
    const work=save(d,{id:`work_${id}`,kind:'map',title,author:'player',authorName:d.get('state','player','name'),skill,quality,masterpiece,minute:d.get('state','minute'),
        location,settlement,sourceEvent:id,item:WORK_RULES.map,instance,locations,routes:routes.map(row=>row.id).sort(),points:settlement?WORK_RULES.points.survey:0});
    holdingSet(d,null,['state','itemInstances',instance,'work'],work.id,'works');
    holdingSet(d,null,['state','itemInstances',instance,'map'],{title,locations,routes:work.routes,surveyor:'player'},'works');
    d.say(`绘成《${title}》，图上${locations.length}处地点`);
    return{operation:'survey',work:work.id,instance,locations,routes:work.routes,quality,masterpiece,minutes,...outcome,workEvent:event('survey',work,{masterpiece,skill})};
}

// Map items held by the player reveal their places on the player's map.
export {heldMapLocations} from './map-state.mjs';

const related=(engine,a,b)=>{
    const x=engine.byId.get(a),y=engine.byId.get(b),pre=row=>(row?.prerequisites??[]).map(r=>typeof r==='string'?r:r.skill);
    if(x?.profession&&x.profession===y?.profession)return true;
    if(pre(x).includes(b)||pre(y).includes(a))return true;
    const elements=skill=>new Set((engine.world.spells??[]).filter(row=>row.skill===skill).flatMap(spellElements));
    const ex=elements(a);return [...elements(b)].some(e=>ex.has(e));
};
function fuse(d,engine,args,id){
    const rule=WORK_RULES.fusion,skills=(args.skills??[]).map(name=>engine.resolve(name,'skill'));
    if(skills.length!==2||skills[0]===skills[1])throw preconditionFailure('融合需要两项不同技能');
    const values=skills.map(skill=>{if(!d.get('state','skills',skill))throw preconditionFailure('尚未掌握参与融合的技能');return effectiveProficiency(d,engine,skill);});
    if(values.some(v=>v<rule.minimumProficiency))throw preconditionFailure('两项技能都需至少高级1等');
    if(!related(engine,...skills))throw preconditionFailure('两项技能缺少共同机制，不能融合');
    const name=text(args.name,'融合技能名'),mechanism=text(args.concept,'共同机制');
    const pair=[...skills].sort();
    if(Object.values(d.get('state','created')??{}).some(row=>row.fusion&&row.fusion.join('+')===pair.join('+')))throw preconditionFailure('这两项技能已经融合过');
    try{engine.resolve(name);throw preconditionFailure('名称已存在');}catch(error){if(!error.message.includes('未登记'))throw error;}
    const coins=integer(args.coins??rule.minimumCoins,rule.minimumCoins,10000,'实验材料费'),minutes=integer(args.minutes??rule.minimumMinutes,rule.minimumMinutes,480,'实验时间');
    if(d.get('state','player','coins')<coins)throw preconditionFailure('实验材料费不足');
    moveCoins(d,{from:purse(engine,'player'),to:sink('export','research'),amount:coins,writer:'works',eventId:id});
    d.set(['state','player','coins'],d.get('state','player','coins')-coins);
    engine.advance(d,minutes,id);
    const lower=values[0]<=values[1]?0:1,outcome=engine.check(d,{attribute:engine.byId.get(skills[lower])?.attribute??'智力',skill:skills[lower],difficulty:rule.difficulty},id);
    d.set(['state','fusionAttempts',`fusion_${id}`],{skills:pair,name,mechanism,coins,minutes,minute:d.get('state','minute'),success:outcome.success});
    if(!outcome.success){d.say(`融合实验未成，耗去${coins}铜与${minutes}分钟`);return{operation:'fuse',skills:pair,coins,minutes,...outcome};}
    const skill=`skill_created_${id.replace(/[^a-zA-Z0-9_-]/g,'_')}`,proficiency=Math.floor(Math.min(...values)/rule.fraction),base=engine.byId.get(skills[lower]);
    holdingSet(d,null,['state','created',skill],{id:skill,name,aliases:[],scope:d.get('state','location'),attribute:base?.attribute??'智力',profession:null,stage:Math.floor(proficiency/300),
        prerequisites:pair,notes:mechanism,fusion:pair,source:id},'works');
    const source={type:'fusion',id,skills:pair};
    d.set(['state','skills',skill],{proficiency,grade:grade(proficiency),breakthroughs:[],daily:{},source,learnedAt:d.get('state','minute')});
    d.say(`融合成功：${name}，熟练度${proficiency}`);
    return{operation:'fuse',skill,name,proficiency,skills:pair,coins,minutes,...outcome,workEvent:{verb:'author',target:null,tags:['work','fusion'],skill}};
}

export function workAction(d,args,id){
    const op=args.operation;
    if(op==='write')return write(d,this,args,id);
    if(op==='publish')return publish(d,this,args,id);
    if(op==='copy')return copy(d,this,args,id);
    if(op==='perform')return perform(d,this,args,id);
    if(op==='survey')return survey(d,this,args,id);
    if(op==='fuse')return fuse(d,this,args,id);
    throw preconditionFailure('未知作品操作');
}

// Painting and sculpture from the existing manufacture flow: a skilled finish
// (fine or better) by a painter or sculptor becomes a signed work.
export function recordArtWork(d,engine,{recipe,instances,workmanship,eventId}){
    if(!WORK_RULES.artSkills.includes(recipe.skill)||!instances.length||!['精良','优秀','杰作'].includes(workmanship))return null;
    const{location,settlement}=placeOf(d,engine),masterpiece=workmanship==='杰作';
    const work=save(d,{id:`work_${eventId}`,kind:'art',title:engine.byId.get(recipe.output.item)?.name??recipe.output.item,author:'player',authorName:d.get('state','player','name'),
        skill:recipe.skill,quality:workmanship,masterpiece,minute:d.get('state','minute'),location,settlement,sourceEvent:eventId,item:recipe.output.item,instance:instances[0]});
    for(const unit of instances)holdingSet(d,null,['state','itemInstances',unit,'work'],work.id,'works');
    const fame=masterpiece?addFame(d,engine,settlement,WORK_RULES.fame.masterpiece,eventId,'art'):null;
    return{work:work.id,quality:workmanship,...(fame?{fame}:{})};
}

// Civic contribution source: a publication or a counted performance/survey in
// this settlement, identified by its event id.
export function workContribution(state,sourceEvent){
    for(const work of Object.values(state.works??{})){
        const edition=work.editions?.find(row=>row.eventId===sourceEvent);
        if(edition)return{work:work.id,kind:'publish',settlement:edition.settlement,location:edition.location,points:edition.points,minute:edition.minute};
        if(work.sourceEvent===sourceEvent&&work.points>0)return{work:work.id,kind:work.kind==='map'?'survey':'perform',settlement:work.settlement,location:work.location,points:work.points,minute:work.minute};
    }
    return null;
}
