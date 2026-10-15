import {deriveWorldEvents,eventRumorId,registerWorldEventSubscriber}from'./world-events.mjs';
import {npcCognitionView}from'./npc-cognition.mjs';
import {scheduleAt,npcAvailability}from'./npc-schedule.mjs';
import {MemoryIndex,engineIndexOptions}from'./retrieval.mjs';
import {npcRumors}from'./npc-rumors.mjs';
import {npcOpinions}from'./public-opinion.mjs';
import {npcLifeNews}from'./npc-life.mjs';
import {memoryGuardUntil,mindSleepUntil}from'./magic-mind-space.mjs';
import {waterEarthHeldUntil}from'./magic-water-earth.mjs';
import {personSimulation}from'./entity-view.mjs';

export function memoryBlurMinute(d,npcId,memory,ttl,now){
 return Math.max(memory.minute+ttl*1440,memoryGuardUntil(d,npcId,memory.id,now));
}

const full=(engine,id)=>personSimulation(engine,{},id).value;
const awake=npc=>npc&&!['死亡','濒死','昏迷','患病'].includes(npc.status)&&!/(睡眠|熟睡|睡觉)/.test(npc.activity??'');
const present=(state,location=state.location)=>Object.entries(state.npcs).filter(([,npc])=>npc.location===location&&awake(npc)).map(([id])=>id);
function witnessedThroughout(engine,before,after,id){
    if(after.npcs[id]?.location!==before.location||!awake(after.npcs[id]))return false;
    if(before.player.companions?.includes(id)&&after.location===before.location)return true;
    for(let cursor=before.minute;cursor<after.minute;){
        const slot=scheduleAt(engine,id,cursor,after);if(!slot)return true;
        if(slot.location!==before.location||!awake({activity:slot.activity}))return false;
        cursor=slot.until;
    }
    return true;
}

// These facts are derived from completed engine actions. Free-form summaries
// supplied by the narrator never become an NPC's witnessed event.
// Subscribes to the primary world event of the call by verb.
export function recordNpcMemories(d,engine,before,events,...rest){
    // Direct callers may still pass (tool,args,detail,eventId); it becomes the same event.
    if(typeof events==='string')rest=[{args:rest[0]??{},detail:rest[1]??{},eventId:rest[2]}],events=deriveWorldEvents(engine,before,d.get('state'),{tool:events,...rest[0]});
    const {args={},detail={},eventId}=rest[0];
    if(!Object.keys(d.get('state','npcs')).some(id=>full(engine,id)))return;
    const event=events[0],verb=event.verb;
    const after=d.get('state'),name=id=>id==='player'?after.player.name:engine.byId.get(id)?.name??id;
    const resolve=value=>{if(!value)return null;try{return engine.resolve(value);}catch{return null;}};
    const facts=[],add=(key,content,participants,options={})=>facts.push({key,content,participants:[...new Set(participants.filter(Boolean))],location:before.location,minute:after.minute,salience:2,emotion:'平静',...options});
    if(verb==='remember'&&detail.rumor&&!detail.duplicate){
        add(`rumor_${detail.rumor}`,detail.content,['player',detail.source],{observers:[],private:true,reliability:'未核实',rumor:detail.rumor});
    }else if(verb==='trade'){
        const buyer=detail.buyer??resolve(args.buyer??'player'),seller=detail.seller??resolve(args.seller);
        const what=detail.item?`${name(detail.item)}${detail.quantity}份`:detail.debt&&args.payment==='repay'?'欠款':args.service==='住宿'?`${detail.days}天住宿`:'交易';
        add('trade',`${name(buyer)}向${name(seller)}${args.payment==='repay'?'偿还':detail.payment==='credit'?'赊欠':'支付'}${detail.cost}铜${args.payment==='repay'?'欠款':`，办理${what}`}`, [buyer,seller],{salience:detail.debt?3:2,entities:detail.item?[detail.item]:[]});
    }else if(verb==='learn'){
        const teacher=detail.teacher??(detail.source?.type==='teacher'?detail.source.id:null);
        add('learn',`${name('player')}${teacher?`向${name(teacher)}学习`:'研读'}${name(detail.entity)}，花费${detail.minutes}分钟、${detail.cost}铜，${detail.success?'学会了':'尚未学会'}`,['player',teacher],{salience:3});
    }else if(verb==='craft'){
        const recipe=engine.byId.get(detail.recipe);
        if(recipe)add('craft',`${name('player')}尝试${recipe.name}，${detail.success?`制成${name(recipe.output.item)}${recipe.output.quantity}件`:'没有得到成品'}，花费${detail.spent.minutes}分钟`,['player'],{salience:3});
    }else if(verb==='repair'){
        add('repair',`${name('player')}修整${name(detail.item)}，${detail.success?'完成':'未成功'}，耐久从${detail.before.durability}变为${detail.after.durability}`,['player'],{salience:3});
    }else if(verb==='cast'||verb==='help'&&event.tags.includes('magic')){
        const spell=engine.byId.get(detail.spell??resolve(args.spell));
        if(spell)add('cast',`${name('player')}施放${spell.name}，${detail.success?'施法成功':'施法失败'}`,['player',resolve(args.target)],{salience:3});
    }else if((verb==='harm'||verb==='clash')&&event.tags.includes('magic')){
        add('conflict',`${name('player')}施放${name(event.spell)}伤及${name(event.target)}，对方受伤${event.harm}`,['player',event.target],{salience:4,emotion:'警惕'});
    }else if(verb==='duel'){
        add('duel',`${name('player')}与${name(detail.target)}按战书正式交锋，${detail.duelRule==='touch'?'点到为止':'生死决斗'}`,['player',detail.target],{salience:3,emotion:'郑重'});
    }else if(verb==='harm'||verb==='clash'){
        add('conflict',`${name('player')}与${name(detail.target)}交锋，对方受伤${detail.damage}，自己受伤${detail.received}`,['player',detail.target],{salience:4,emotion:'警惕'});
    }else if(verb==='steal'){
        const witnesses=detail.witnesses??[];
        add('crime',`${name('player')}试图偷取${name(detail.target)}的财物`,['player',detail.target],{observers:witnesses,onlyObservers:true,salience:4,emotion:'警惕'});
    }else if(verb==='move'&&before.location!==after.location){
        for(const companion of before.player.companions??[])if(after.npcs[companion]?.location===after.location)add(`travel_${companion}`,`${name(companion)}与${name('player')}一同从${name(before.location)}抵达${name(after.location)}`,['player',companion],{location:after.location,observers:[],salience:3});
    }else if(verb==='promise'&&detail.permission&&!detail.duplicate){
        const permit=detail.permission;
        add('permission',`${name(permit.grantor)}${permit.revoked?'收回':'给予'}${name('player')}进入${name(permit.subject)}的拜访许可`,['player',permit.grantor],{salience:3,observers:[],private:true});
    }else if(verb==='quest'&&detail.quest){
        const quest=after.quests[detail.quest];
        // Board completion/cancellation already records party memory. Player
        // acceptance and legacy quests still need this witnessed-action fallback.
        const receiptKey=quest&&`${quest.id}:${quest.status}`;
        const recorded=after.records?.[receiptKey]?.category==='quest_receipt'&&!before.records?.[receiptKey];
        if(quest?.taker==='player'&&args.operation!=='inspect'&&!recorded)add('quest',`${name('player')}参与的委托“${quest.content??quest.name}”现为${quest.status}`,['player',quest.publisher],{salience:3,observers:[],private:true});
    }
    for(const [id,obligation]of Object.entries(after.obligations??{})){
        const old=before.obligations?.[id];if(old?.status===obligation.status)continue;
        const terms=obligation.type==='付款'?`${obligation.coins}铜付款`:obligation.type==='送货'?`${name(obligation.item)}${obligation.quantity}份送货`:obligation.type;
        add(`obligation_${id}`,`${name(obligation.promisor)}对${name(obligation.promisee)}的${terms}约定：${obligation.status}`,[obligation.promisor,obligation.promisee],{observers:[],partyNotice:Boolean(old),...(obligation.deliveryVersion===1&&Number.isSafeInteger(obligation.resolvedAt)?{minute:obligation.resolvedAt}:{}),...(old?{location:null,noticeKey:`:obligation_${id}`}:{ }),salience:4,emotion:obligation.status==='违约'?'失望':'认真'});
    }
    // Debt parties know the state of their agreement; bystanders do not learn
    // a debt or its amount from a later, off-screen deadline calculation.
    for(const [id,debt]of Object.entries(after.records??{}))if(debt.category==='debt'&&before.records?.[id]&&before.records[id].status!==debt.status){
        add(`debt_${id}`,`${name(debt.debtor)}对${name(debt.creditor)}的欠款${debt.amount}铜现为${debt.status}`,[debt.debtor,debt.creditor],{observers:[],partyNotice:true,location:null,minute:debt.status==='逾期'?debt.overdueAt:debt.paidAt??after.minute,salience:4,emotion:debt.status==='逾期'?'失望':'平静'});
    }
    // The primary social fact of a witnessed, weighty event carries its rumor id.
    const rumorId=eventRumorId(engine,after,event);
    if(rumorId)for(const fact of facts)if(['conflict','crime','cast'].includes(fact.key)&&!fact.private)fact.eventRumor=rumorId;
    const streams=new Map();
    for(const fact of facts){
        const observers=fact.observers??present(before).filter(id=>witnessedThroughout(engine,before,after,id));
        const parties=fact.onlyObservers?[]:fact.participants.filter(id=>fact.partyNotice
            ?!fact.noticeKey||before.npcs[id]?.memoryStream?.some(row=>row.id.endsWith(fact.noticeKey))
            :before.npcs[id]?.location===before.location&&awake(before.npcs[id]));
        const recipients=new Set([...observers,...parties]);
        for(const npcId of recipients){
            if(!full(engine,npcId)||!after.npcs[npcId])continue;
            // Remote actors only receive their own contract/quest facts, never
            // a public observation of a room they did not occupy.
            const existing=streams.get(npcId)??[...after.npcs[npcId].memoryStream??[]];
            const id=`${eventId}:${fact.key}`;if(existing.some(row=>row.id===id))continue;
            existing.push({id,sourceEvent:eventId,kind:fact.key.split('_')[0],minute:fact.minute,location:fact.location,participants:fact.participants,
                content:fact.content,...(fact.private?{private:true}:{}),...(fact.rumor?{rumor:fact.rumor,reliability:fact.reliability,permittedRecipients:['player']}:{}),...(fact.entities?.length?{entities:fact.entities}:{}),...(fact.eventRumor?{rumor:fact.eventRumor,rumorSource:npcId,eventRumor:true}:{}),sourceType:fact.partyNotice?'约定核对':fact.participants.includes(npcId)&&!fact.onlyObservers?'亲历':'目击',salience:fact.salience,emotion:fact.emotion});
            streams.set(npcId,existing);
        }
    }
    for(const [id,stream]of streams)d.set(['state','npcs',id,'memoryStream'],stream);
}

export function selectNpcSeedMemories(engine,document,id,query=''){
    const base=engine.byId.get(id);if(!personSimulation(engine,document.state,id).value)return [];
    const seeds=(base.memorySeeds??[]).filter(row=>row.knownBy?.includes(id)),index=new MemoryIndex(engineIndexOptions(engine));
    for(const row of seeds)index.upsert({id:row.id,text:row.event,entities:row.knownBy.filter(other=>other!==id),salience:row.salience,minute:0});
    const near=present(document.state).filter(other=>other!==id);
    const relevant=index.search(query,{present:near,limit:2}).map(row=>row.id);
    return [...new Set([...relevant,...seeds.map(row=>row.id)])].slice(0,2).map(key=>seeds.find(row=>row.id===key).event);
}

export function npcContext(engine,document,id,query=''){
    const base=engine.byId.get(id),npc=document.state.npcs[id];if(!personSimulation(engine,document.state,id).value||!npc)return null;
    const cognition=npcCognitionView(engine,document,id);
    const memories=cognition.memories.filter(row=>row.participants?.includes('player'));
    const index=new MemoryIndex(engineIndexOptions(engine));
    for(const memory of memories){
        const items=(memory.entities??[]).map(value=>engine.byId.get(value)).filter(row=>row?.id.startsWith('item_'));
        const keywords=items.length?['购买 买过 买的 货物 交易',...items.flatMap(row=>[row.name,...row.aliases??[],row.use??''])]:[];
        index.upsert({id:memory.id,text:memory.content,keywords,entities:[...memory.participants,...memory.entities??[]],minute:memory.minute,salience:memory.salience,eventId:memory.sourceEvent});
    }
    const selected=new Set(index.search(query.replace(/吃食|食品/g,'食物'),{now:document.state.minute,present:[id],limit:3}).map(row=>row.id));
    const shared=memories.filter(row=>selected.has(row.id)).sort((a,b)=>a.minute-b.minute);
    const goals=Object.values(npc.goals??base.goals??{}).flat().filter(row=>row.progress<100&&row.status!=='已完成');
    return{appearance:base.appearance,voice:base.voice,values:base.personality.values,flaws:base.personality.flaws,
        concern:goals[0]?.content??base.currentConcern??'',known:(base.knowledge.known??[]).map(row=>row.fact),unknown:base.knowledge.unknown,rumors:npcRumors(engine,id,document),
        recentActivities:Object.values(document.state.npcAutonomy?.actions??{}).filter(row=>row.npc===id&&row.minute<=document.state.minute).slice(-2).map(row=>({minute:row.minute,content:row.summary})),
        memories:shared,lifeNews:npcLifeNews(engine,document,id),opinions:npcOpinions(engine,document,id).slice(0,3),reflections:cognition.reflections.filter(row=>row.about==='player').slice(-1),seeds:selectNpcSeedMemories(engine,document,id,query),behavior:base.behaviorRules??{},
        relations:base.relationships.map(row=>({with:row.with,type:row.type,note:row.note})),
        background:npcBackground(engine,document,id,query)};
}

// A relationship is the owner's channel, never the other person's private profile.
export function npcBackground(engine,document,id,query=''){
    const base=engine.byId.get(id),state=document.state;if(!base||!state.npcs[id])return null;
    const mentioned=engine.resolver.mentions(query,state.location);
    const relations=(base.relationships??[]).filter(row=>mentioned.has(id)||mentioned.has(row.with)||state.npcs[row.with]?.location===state.location)
        .map(row=>({source:`${id}.relationships`,with:row.with,name:engine.byId.get(row.with)?.name??row.with,type:row.type,note:row.note,
            publicRole:engine.byId.get(row.with)?.occupation??''}));
    const dayStart=state.minute-state.minute%1440,slots=[];
    if(base.schedule)for(let minute=dayStart;minute<dayStart+1440;){
        const slot=scheduleAt(engine,id,minute,state);if(!slot)break;
        const seasonal=base.schedule.seasonal?.[String(engine.calendar(minute).season)];
        const leaf=seasonal?.[slot.variant]?`seasonal.${engine.calendar(minute).season}.${slot.variant}`:
            base.schedule[slot.variant]?slot.variant:seasonal?.default?`seasonal.${engine.calendar(minute).season}.default`:'default';
        slots.push({source:slot.festival?`state.records.${slot.festival}`:`${id}.schedule.${leaf}`,start:minute,end:Math.min(slot.until,dayStart+1440),location:slot.location,activity:slot.activity});
        minute=slot.until;
    }
    const slot=slots.find(row=>row.start<=state.minute&&state.minute<row.end),available=npcAvailability(engine,{...state,player:state.player??{}},id),npc=state.npcs[id];
    const draft={get:(...path)=>path.reduce((value,key)=>value?.[key],document)};
    const current=slot&&npc.location===slot.location&&available.activity===slot.activity&&!npc.scheduleTravel&&!npc.cognitionTravel&&
        mindSleepUntil(draft,id,state.minute)<=state.minute&&waterEarthHeldUntil(state,id,state.minute)<=state.minute&&
        !state.player?.companions?.includes(id)&&!engine.npcObligationAt?.(state,id)&&!engine.npcAutonomyBusy?.(state,id)?
        {minute:state.minute,location:npc.location,activity:slot.activity}:null;
    return {relations,schedule:{scope:'routine-background',slots,current,
        limit:'作息是有时间边界的工作背景；current仅确认当前状态。过去活动须重建实际时段并排除行程、约定及失能覆盖；不证明完成数量或具体进度。'}};
}
// World-event subscriber; settlement order is the `order` field.
registerWorldEventSubscriber({id:'npc_memory',order:30,on:(d,engine,events,c)=>recordNpcMemories(d,engine,c.before,events,c)});
