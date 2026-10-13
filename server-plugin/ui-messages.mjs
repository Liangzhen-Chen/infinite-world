import {playerDocuments} from './state-notices.mjs';

export function messageProjection(engine,document){
    const s=document.state,known=new Set(Object.values(s.turns??{}).flatMap(row=>row.present??[]));
    // These people are already identified by the current scene or a player record.
    for(const [id,row]of Object.entries(s.npcs??{}))if(row.location===s.location)known.add(id);
    for(const row of Object.values(s.records??{})){
        if(row.parties?.includes('player'))for(const id of row.parties)known.add(id);
        if(row.debtor==='player')known.add(row.creditor);
    }
    for(const row of Object.values(s.obligations??{}))if([row.promisor,row.promisee].includes('player')){known.add(row.promisor);known.add(row.promisee);}
    for(const row of Object.values(s.npcCognition?.messages??{}))if(row.to==='player'&&row.status==='已交付')known.add(row.from);
    const labels=Object.fromEntries([...known].filter(id=>id!=='player').map(id=>[id,engine.byId.get(id)?.name??s.created?.[id]?.name]).filter(([,name])=>name));
    labels.player=s.player.name;
    return {labels,documents:playerDocuments(s,id=>labels[id]??'路人')};
}

export function registerUIRoutes({post,readCampaign}){
    post('/ui/messages',async req=>{const {engine,document,reference}=await readCampaign(req);return {reference,...messageProjection(engine,document)};});
}
