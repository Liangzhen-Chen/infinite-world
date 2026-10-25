// Player map knowledge, shared by routing and the map projection.
const rank={rumor:1,reliable:2,experienced:3};
const visible=(row,now)=>row&&(row.minute??row.updated??0)<=now&&
    (!row.private||(row.permittedRecipients??row.knownBy??[]).includes('player'))&&
    (!row.permittedRecipients||row.permittedRecipients.includes('player'));
const sourceKind=row=>row.rumor||/未核实|未经|存疑/.test(row.reliability??'')?'rumor':
    row.source==='亲历'||row.sourceType==='亲历'||row.source==='出生地'?'experienced':
    /可靠|已核实|可信/.test(row.reliability??'')||row.source==='可靠转述'?'reliable':'rumor';


export function heldMapLocations(state){
    const ids=new Set();
    for(const row of Object.values(state.itemInstances??{}))if(row?.owner==='player'&&row.status==='持有'&&row.map)for(const id of row.map.locations??[])ids.add(id);
    return [...ids].sort();
}

export function mapKnowledge(engine,document){
    // A transit stop is a real junction with at least two distinct neighbours.
    // Parallel routes to one neighbour do not create a junction. Knowledge is
    // applied below, so topology alone never teaches the player a place.
    const neighbours=new Map();
    for(const edge of engine.world.routes??[])for(const [from,to] of [[edge.from,edge.to],[edge.to,edge.from]]){
        if(from===to)continue;
        if(!neighbours.has(from))neighbours.set(from,new Set());neighbours.get(from).add(to);
    }
    const state=document.state,now=state.minute,places=new Map(engine.world.locations.filter(row=>row.mapHierarchy||(neighbours.get(row.id)?.size??0)>=2).map(row=>[row.id,row]));
    const known=new Map(),edgeKnowledge=new Map();
    const add=(id,kind)=>{if(places.has(id)&&rank[kind]>(rank[known.get(id)]??0))known.set(id,kind);};
    for(const [id,row]of Object.entries(state.discoveries??{}))if(visible(row,now)){
        add(id,sourceKind(row));edgeKnowledge.set(id,sourceKind(row));
    }
    add(state.location,'experienced');
    // U6: places drawn on a map the player holds.
    for(const id of heldMapLocations(state))add(id,'reliable');
    for(const row of Object.values(document.memories??{})){
        if(!visible(row,now))continue;
        // Legacy world_remember stores location facts under their subject. Heard
        // records belong to player and must name player among the recipients.
        if(row.subject!=='player'&&!places.has(row.subject))continue;
        if(row.sourceType==='听说'&&!row.participants?.includes('player'))continue;
        const kind=sourceKind(row);
        add(row.subject,kind);
        for(const id of row.entities??[])add(id,kind);
        for(const id of engine.resolver.mentions(row.content??''))add(id,kind);
        // 'location' on a heard record is where it was heard, not the rumor's site.
        if(row.subject==='player'&&row.participants?.includes('player'))add(row.location,'experienced');
    }
    // Knowing a room establishes its containing settlement, never its siblings.
    for(const [id,kind]of [...known]){
        const visited=new Set([id]);let parent=places.get(id)?.parent;
        while(places.get(parent)?.mapHierarchy&&!visited.has(parent)){visited.add(parent);add(parent,kind);parent=places.get(parent).parent;}
    }
    return {places,known,edgeKnowledge};
}
