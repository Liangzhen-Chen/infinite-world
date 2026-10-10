import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { CampaignStorage, digest } from './storage.mjs';
import { WorldEngine } from './engine.mjs';
import { MemoryIndex } from './retrieval.mjs';
import { archivedReducer } from './archived-reducer.mjs';
import { loadWorld } from '../tools/load-world.mjs';
import { migrateLegacyChat } from './migrations.mjs';
import { WorldRegistry } from './world-registry.mjs';
import { atomicJSON } from './storage.mjs';
import {catalogDefinition}from'./catalog.mjs';
import {publicLoreEntries}from'./lore.mjs';
import {settleNpcPlanning}from'./npc-planning-service.mjs';
import {getChronicle,syncChronicleIndex}from'./chronicle.mjs';

export const info={id:'infinite-fields',name:'无限原野本地战役存储',description:'本项目自有的存档、账本与检索服务器插件'};
export async function init(router,{ world=null, baseRoot=null, newCampaignSeed=randomUUID, npcPlanner, npcPlanningEnabled=Boolean(process.env.DEEPSEEK_API_KEY), npcPlanningOptions={} }={}){
    world ??= await loadWorld();
    const engine=new WorldEngine(world),stores=new Map(),indexes=new Map(),registries=new Map();
    const seed=JSON.parse(await fs.readFile(new URL('./legacy/seed.json',import.meta.url),'utf8'));
    const getStore=req=>{
        const root=baseRoot??req.user?.directories?.root;if(!root)throw new Error('没有当前用户的存档目录');
        if(!stores.has(root)){
            const registry=new WorldRegistry(path.join(root,'infinite-fields-worlds'));registries.set(root,registry);
            const reducer=archivedReducer(registry,engine);
            const store=new CampaignStorage(path.join(root,'infinite-fields'),{reducer});store.worldRegistry=registry;stores.set(root,store);
        }
        return stores.get(root);
    };
    const handle=callback=>async(req,res)=>{
        try{
            const result=await callback(req);
            if(result?.document){const{privateState,...document}=result.document;res.json({...result,document});}
            else res.json(result);
        }catch(error){res.status(error.code==='ENOENT'?404:400).json({ok:false,error:error.message});}
    };
    const exportWithWorlds=async(store,id)=>{
        const bundle=await store.export(id),hashes=new Set([bundle.initial.worldHash,
            ...bundle.events.flatMap(event=>[event.input?.worldHash,event.result?.worldHash])].filter(Boolean));
        bundle.worlds={};for(const hash of hashes)bundle.worlds[hash]=(await store.worldRegistry.get(hash)).world;
        return bundle;
    };
    const upgrade=async(store,id)=>{
        const view=await store.read(id);if(view.document.schemaVersion!==2||view.document.releaseVersion!==1)return view;
        // The source hash records the edition accepted, even if historical IDs
        // make the compatible campaign edition differ from the shipped one.
        const incomingHash=digest(world);
        if((view.document.worldSourceHash??view.document.worldHash)===incomingHash)return view;
        await store.worldRegistry.put(world);
        const backup=path.join(store.directory(id),`before-world-update-${view.reference.sequence}-${incomingHash.slice(0,12)}.json`);
        await atomicJSON(backup,await exportWithWorlds(store,id));
        const eventId=`world_update_${incomingHash}_${view.reference.sequence}`;
        await store.transact(id,{id:eventId,input:{type:'world_upgrade',worldHash:incomingHash,eventId},expectedSequence:view.reference.sequence},store.reducer);
        return store.read(id);
    };
    const getIndex=async(store,id,document)=>{
        const key=`${store.root}:${id}`;
        const selectedEngine=(await store.worldRegistry.get(document.worldHash)).scoped(document);
        const identity=`${document.worldHash}:${digest(document.state.created??{})}`;
        if(indexes.get(key)?.entityIdentity!==identity){
            const old=indexes.get(key),next=new MemoryIndex({entities:selectedEngine.entities});
            next.entityIdentity=identity;
            if(old){
                for(const record of old.documents.values())if(!record.id.startsWith('chat_')&&!record.id.startsWith('memory_')&&!record.id.startsWith('lore_'))next.upsert({...record,revision:undefined});
                next.syncChat(old.chatMessages);
            }
            indexes.set(key,next);
        }
        const index=indexes.get(key),wanted=new Set();
        for(const row of publicLoreEntries(selectedEngine.world))index.upsert({
            id:`lore_${row.id}`,text:`${row.name}：${row.description}`,source:'公开世界设定',entities:[row.id,...row.references??[]],
            keywords:row.aliases??[],salience:2,revision:digest(row)});
        for(const [id,memory]of Object.entries(document.memories??{})){
            wanted.add(`memory_${id}`);index.upsert({id:`memory_${id}`,text:memory.content,source:'长期事实',
                entities:[memory.subject],keywords:memory.keywords??[],salience:memory.pinned?5:3,minute:memory.minute??0,
                revision:digest(memory)});
        }
        for(const id of index.documents.keys())if(id.startsWith('memory_')&&!wanted.has(id))index.remove(id);
        index.chronicle=await getChronicle(store,id);
        syncChronicleIndex(index,index.chronicle);
        return index;
    };
    router.post('/create',handle(async req=>{
        const legacy={state:seed.state,memories:seed.memories},randomSeed=newCampaignSeed();
        const document=req.body.character===undefined?engine.initialFromLegacy(legacy,randomSeed):engine.createCharacter(legacy,req.body.character,randomSeed);
        if(req.body.character===undefined&&req.body.name)document.state.player.name=String(req.body.name).slice(0,60);
        const store=getStore(req),registry=registries.get(baseRoot??req.user.directories.root);
        document.worldHash=await registry.put(world);
        return store.create({worldVersion:world.version,document});
    }));
    router.post('/read',handle(req=>upgrade(getStore(req),req.body.campaignId)));
    router.post('/execute',handle(async req=>{
        const {campaignId,tool,args,eventId,anchor,expectedSequence}=req.body;
        // Health is an internal combat primitive, not a model-controlled tool.
        if(['world_health','world_revive'].includes(tool))throw new Error('生命变化只能由交锋、治疗或死亡结算产生');
        const store=getStore(req),view=await store.read(campaignId);
        if(view.document.schemaVersion!==2)throw new Error('存档尚未升级到新引擎');
        const saved=await store.transact(campaignId,{id:eventId,input:{tool,args,eventId},anchor,expectedSequence},store.reducer);
        const after=saved.document??(await store.read(campaignId)).document;
        const crossedDay=Math.floor(after.state.minute/1440)>Math.floor(view.document.state.minute/1440);
        if(!saved.duplicate&&npcPlanningEnabled&&(crossedDay||after.state.location!==view.document.state.location)){
            let planning;
            try{planning=await settleNpcPlanning(store,campaignId,{anchor,enabled:true,...(npcPlanner?{planner:npcPlanner}:{}),options:npcPlanningOptions});}
            catch(error){planning={status:'failed',reason:'本次人物规划未能保存，已完成的玩家行动仍保留'};}
            const current=await store.read(campaignId);return{...saved,document:current.document,reference:current.reference,npcPlanning:planning};
        }
        return saved;
    }));
    router.post('/reconcile',handle(req=>getStore(req).reconcile(req.body.campaignId,req.body.validAnchors??[],req.body.excludeAnchor)));
    router.post('/feedback',handle(req=>getStore(req).feedback(req.body.campaignId)));
    router.post('/scene',handle(async req=>{
        const store=getStore(req),view=await store.read(req.body.campaignId),selectedEngine=await registries.get(baseRoot??req.user.directories.root).get(view.document.worldHash),index=await getIndex(store,req.body.campaignId,view.document);
        if(Array.isArray(req.body.chat))index.syncChat(req.body.chat);
        const scoped=selectedEngine.scoped(view.document);
        return {scene:scoped.scene(view.document,req.body.query??'',index),reference:view.reference,
            labels:Object.fromEntries(scoped.entities.map(row=>[row.id,row.name]))};
    }));
    router.post('/search',handle(async req=>{
        const store=getStore(req),view=await store.read(req.body.campaignId),index=await getIndex(store,req.body.campaignId,view.document);
        if(Array.isArray(req.body.chat))index.syncChat(req.body.chat);
        return {results:index.search(req.body.query??'',{now:view.document.state.minute,scope:view.document.state.location,limit:req.body.limit})};
    }));
    router.post('/catalog',handle(async req=>{
        const store=getStore(req),view=await store.read(req.body.campaignId),selected=await store.worldRegistry.get(view.document.worldHash);
        return catalogDefinition(selected,view.document,req.body);
    }));
    router.post('/export',handle(async req=>{
        return exportWithWorlds(getStore(req),req.body.campaignId);
    }));
    router.post('/import',handle(async req=>{
        const store=getStore(req),registry=registries.get(baseRoot??req.user.directories.root),bundle=req.body.bundle;
        for(const [hash,data]of Object.entries(bundle.worlds??{})){
            if(digest(data)!==hash)throw new Error('导入的世界版本校验失败');await registry.put(data);
        }
        const hashes=new Set([bundle.initial?.worldHash,...(bundle.events??[]).flatMap(event=>[event.input?.worldHash,event.result?.worldHash])].filter(Boolean));
        for(const hash of hashes)await registry.get(hash);
        return store.import(bundle);
    }));
    router.post('/migrate',(_req,res)=>res.status(410).json({ok:false,error:'自动迁移已停用，请在副本上启用新版'}));
    router.post('/enable-copy',handle(async req=>{
        if(baseRoot)throw new Error('测试隔离服务器不读取真实聊天');
        const directory=req.user.directories.chats;
        const character=req.body.character,chatId=req.body.chatId;
        for(const value of [character,chatId])if(typeof value!=='string'||!value||value.length>180||/[\\/:*?"<>|\x00-\x1f]|[. ]$|^\.{1,2}$/.test(value))throw new Error('聊天路径无效');
        const source=path.join(directory,character,`${chatId}.jsonl`);
        const root=await fs.realpath(directory),resolved=await fs.realpath(source);
        const relative=path.relative(root,resolved);
        if(relative.startsWith('..')||path.isAbsolute(relative))throw new Error('聊天路径超出当前用户目录');
        if((await fs.lstat(path.dirname(source))).isSymbolicLink()||(await fs.lstat(source)).isSymbolicLink())throw new Error('聊天路径不能是链接');
        const bytes=await fs.readFile(source,'utf8'),lines=bytes.split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
        if(!lines[0]?.chat_metadata)throw new Error('聊天头部缺失');
        const store=getStore(req),id=`campaign_${randomUUID()}`;
        const worldHash=await registries.get(req.user.directories.root).put(world);
        const previous=lines[0].chat_metadata.infinite_fields;
        if(previous?.format===2){
            const exported=await exportWithWorlds(store,previous.campaignId);
            await store.import(exported,id);
            const migrated=await store.transact(id,{id:'release_r1',input:{type:'release_migration',release:'R1'},anchor:null},store.reducer);
            await upgrade(store,id);
            await atomicJSON(path.join(store.directory(id),'r1-migration-report.json'),{...migrated.result,sourceUnchanged:true,sourceEvents:exported.events.length});
        }else if(previous){
            await migrateLegacyChat({source,store,oldSeed:seed,id});
            const migrated=await store.transact(id,{id:'schema_v2',input:{type:'schema_migration',release:'R1',randomSeed:randomUUID(),worldHash},anchor:null},store.reducer);
            await atomicJSON(path.join(store.directory(id),'r1-migration-report.json'),{...migrated.result.releaseReport,sourceUnchanged:true,sourceEvents:previous.journal.length});
        }else{
            const document=engine.createCharacter({state:seed.state,memories:seed.memories},{},randomUUID());document.worldHash=worldHash;
            await store.create({id,worldVersion:world.version,document});
        }
        const view=await store.read(id),copyId=`新版试玩-${new Date().toISOString().slice(0,10)}-${randomUUID().slice(0,8)}`;
        lines[0].chat_metadata.infinite_fields=view.reference;
        if(await fs.readFile(source,'utf8')!==bytes)throw new Error('复制期间聊天发生变化，请重试');
        await fs.writeFile(path.join(path.dirname(source),`${copyId}.jsonl`),lines.map(line=>JSON.stringify(line)).join('\n')+'\n',{flag:'wx'});
        return {chatId:copyId,reference:view.reference,sourceUnchanged:true};
    }));
    router.post('/edit-index',handle(async req=>{
        const store=getStore(req),view=await store.read(req.body.campaignId),index=await getIndex(store,req.body.campaignId,view.document);
        index.editChat(req.body.index,req.body.message);return {ok:true};
    }));
    router.post('/sync-index',handle(async req=>{
        const store=getStore(req),view=await store.read(req.body.campaignId),index=await getIndex(store,req.body.campaignId,view.document);
        index.syncDelta(req.body.start,req.body.messages,req.body.total);return {ok:true,messages:index.chatMessages.length};
    }));
    router.get('/health',(_req,res)=>res.json({ok:true,worldVersion:world.version,format:2}));
}
