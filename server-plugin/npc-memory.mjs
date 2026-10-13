import {npcCognitionView}from'./npc-cognition.mjs';
import {scheduleAt}from'./npc-schedule.mjs';
import {MemoryIndex}from'./retrieval.mjs';
import {npcRumors}from'./npc-rumors.mjs';
import {memoryGuardUntil}from'./magic-mind-space.mjs';

export function memoryBlurMinute(d,npcId,memory,ttl,now){
 return Math.max(memory.minute+ttl*1440,memoryGuardUntil(d,npcId,memory.id,now));
}

const full=(engine,id)=>engine.byId.get(id)?.tier==='full';
const awake=npc=>npc&&!['死亡','濒死','昏迷','患病'].includes(npc.status)&&!/(睡眠|熟睡|睡觉)/.test(npc.activity??'');
const present=(state,location=state.location)=>Object.entries(state.npcs).filter(([,npc])=>npc.location===location&&awake(npc)).map(([id])=>id);
function witnessedThroughout(engine,before,after,id){
    if(after.npcs[id]?.location!==before.location||!awake(after.npcs[id]))return false;
    if(before.player.companions?.includes(id)&&after.location===before.location)return true;
    for(let cursor=before.minute;cursor<after.minute;){
        const slot=scheduleAt(engine,id,cursor);if(!slot)return true;
        if(slot.location!==before.location||!awake({activity:slot.activity}))return false;
        cursor=slot.until;
    }
    return true;
}

// These facts are derived from completed engine actions. Free-form summaries
// supplied by the narrator never become an NPC's witnessed event.
export function recordNpcMemories(d,engine,before,tool,args,detail,eventId){
    if(!engine.world.npcs.some(npc=>npc.tier==='full'))return;
    if(tool==='craft'&&args.operation==='repair')tool='repair';
    const after=d.get('state'),name=id=>id==='player'?after.player.name:engine.byId.get(id)?.name??id;
    const resolve=value=>{if(!value)return null;try{return engine.resolve(value);}catch{return null;}};
    const facts=[],add=(key,content,participants,options={})=>facts.push({key,content,participants:[...new Set(participants.filter(Boolean))],location:before.location,minute:after.minute,salience:2,emotion:'平静',...options});
    if(tool==='remember'&&detail.rumor&&!detail.duplicate){
        add(`rumor_${detail.rumor}`,detail.content,['player',detail.source],{observers:[],private:true,reliability:'未核实',rumor:detail.rumor});
    }else if(tool==='trade'){
        const buyer=detail.buyer??resolve(args.buyer??'player'),seller=detail.seller??resolve(args.seller);
        const what=detail.item?`${name(detail.item)}${detail.quantity}份`:detail.debt&&args.payment==='repay'?'欠款':args.service==='住宿'?`${detail.days}天住宿`:'交易';
        add('trade',`${name(buyer)}向${name(seller)}${args.payment==='repay'?'偿还':detail.payment==='credit'?'赊欠':'支付'}${detail.cost}铜${args.payment==='repay'?'欠款':`，办理${what}`}`, [buyer,seller],{salience:detail.debt?3:2,entities:detail.item?[detail.item]:[]});
    }else if(tool==='learn'){
        const teacher=detail.teacher??(detail.source?.type==='teacher'?detail.source.id:null);
        add('learn',`${name('player')}${teacher?`向${name(teacher)}学习`:'研读'}${name(detail.entity)}，花费${detail.minutes}分钟、${detail.cost}铜，${detail.success?'学会了':'尚未学会'}`,['player',teacher],{salience:3});
    }else if(tool==='craft'){
        const recipe=engine.byId.get(detail.recipe);
        if(recipe)add('craft',`${name('player')}尝试${recipe.name}，${detail.success?`制成${name(recipe.output.item)}${recipe.output.quantity}件`:'没有得到成品'}，花费${detail.spent.minutes}分钟`,['player'],{salience:3});
    }else if(tool==='repair'){
        add('repair',`${name('player')}修整${name(detail.item)}，${detail.success?'完成':'未成功'}，耐久从${detail.before.durability}变为${detail.after.durability}`,['player'],{salience:3});
    }else if(tool==='cast'){
        const spell=engine.byId.get(detail.spell??resolve(args.spell));
        if(spell)add('cast',`${name('player')}施放${spell.name}，${detail.success?'施法成功':'施法失败'}`,['player',resolve(args.target)],{salience:3});
    }else if(tool==='combat'||tool==='conflict'){
        add('conflict',`${name('player')}与${name(detail.target)}交锋，对方受伤${detail.damage}，自己受伤${detail.received}`,['player',detail.target],{salience:4,emotion:'警惕'});
    }else if(tool==='crime'){
        const witnesses=detail.witnesses??[];
        add('crime',`${name('player')}试图偷取${name(detail.target)}的财物`,['player',detail.target],{observers:witnesses,onlyObservers:true,salience:4,emotion:'警惕'});
    }else if(tool==='move'&&before.location!==after.location){
        for(const companion of before.player.companions??[])if(after.npcs[companion]?.location===after.location)add(`travel_${companion}`,`${name(companion)}与${name('player')}一同从${name(before.location)}抵达${name(after.location)}`,['player',companion],{location:after.location,observers:[],salience:3});
    }else if(tool==='promise'&&detail.permission&&!detail.duplicate){
        const permit=detail.permission;
        add('permission',`${name(permit.grantor)}${permit.revoked?'收回':'给予'}${name('player')}进入${name(permit.subject)}的拜访许可`,['player',permit.grantor],{salience:3,observers:[],private:true});
    }else if(tool==='quest'&&detail.quest){
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
                content:fact.content,...(fact.private?{private:true}:{}),...(fact.rumor?{rumor:fact.rumor,reliability:fact.reliability,permittedRecipients:['player']}:{}),...(fact.entities?.length?{entities:fact.entities}:{}),sourceType:fact.partyNotice?'约定核对':fact.participants.includes(npcId)&&!fact.onlyObservers?'亲历':'目击',salience:fact.salience,emotion:fact.emotion});
            streams.set(npcId,existing);
        }
    }
    for(const [id,stream]of streams)d.set(['state','npcs',id,'memoryStream'],stream);
}

export function selectNpcSeedMemories(engine,document,id,query=''){
    const base=engine.byId.get(id);if(base?.tier!=='full')return [];
    const seeds=base.memorySeeds.filter(row=>row.knownBy?.includes(id)),index=new MemoryIndex({entities:engine.entities});
    for(const row of seeds)index.upsert({id:row.id,text:row.event,entities:row.knownBy.filter(other=>other!==id),salience:row.salience,minute:0});
    const near=present(document.state).filter(other=>other!==id);
    const relevant=index.search(query,{present:near,limit:2}).map(row=>row.id);
    return [...new Set([...relevant,...seeds.map(row=>row.id)])].slice(0,2).map(key=>seeds.find(row=>row.id===key).event);
}

export function npcContext(engine,document,id,query=''){
    const base=engine.byId.get(id),npc=document.state.npcs[id];if(base?.tier!=='full'||!npc)return null;
    const cognition=npcCognitionView(engine,document,id);
    const memories=cognition.memories.filter(row=>row.participants?.includes('player'));
    const index=new MemoryIndex({entities:engine.entities});
    for(const memory of memories){
        const items=(memory.entities??[]).map(value=>engine.byId.get(value)).filter(row=>row?.id.startsWith('item_'));
        const keywords=items.length?['购买 买过 买的 货物 交易',...items.flatMap(row=>[row.name,...row.aliases??[],row.use??''])]:[];
        index.upsert({id:memory.id,text:memory.content,keywords,entities:[...memory.participants,...memory.entities??[]],minute:memory.minute,salience:memory.salience,eventId:memory.sourceEvent});
    }
    const selected=new Set(index.search(query.replace(/吃食|食品/g,'食物'),{now:document.state.minute,present:[id],limit:3}).map(row=>row.id));
    const shared=memories.filter(row=>selected.has(row.id)).sort((a,b)=>a.minute-b.minute);
    const goals=Object.values(npc.goals??base.goals??{}).flat().filter(row=>row.progress<100&&row.status!=='已完成');
    return{appearance:base.appearance,voice:base.voice,values:base.personality.values,flaws:base.personality.flaws,
        concern:goals[0]?.content??'',known:base.knowledge.known.map(row=>row.fact),unknown:base.knowledge.unknown,rumors:npcRumors(engine,id,document),
        recentActivities:Object.values(document.state.npcAutonomy?.actions??{}).filter(row=>row.npc===id&&row.minute<=document.state.minute).slice(-2).map(row=>({minute:row.minute,content:row.summary})),
        memories:shared,reflections:cognition.reflections.filter(row=>row.about==='player').slice(-1),seeds:selectNpcSeedMemories(engine,document,id,query),behavior:base.behaviorRules,
        relations:base.relationships.map(row=>({with:row.with,type:row.type,note:row.note}))};
}
