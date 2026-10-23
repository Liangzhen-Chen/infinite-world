import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { CampaignStorage, digest } from './storage.mjs';
import { WorldEngine } from './engine.mjs';
import { MemoryIndex } from './retrieval.mjs';
import {promptScope} from './prompt-scope.mjs';
import { archivedReducer } from './archived-reducer.mjs';
import { loadWorld } from '../tools/load-world.mjs';
import { migrateLegacyChat } from './migrations.mjs';
import { WorldRegistry } from './world-registry.mjs';
import { atomicJSON } from './storage.mjs';
import {catalogDefinition}from'./catalog.mjs';
import {publicLoreEntries}from'./lore.mjs';
import {settleNpcPlanning}from'./npc-planning-service.mjs';
import {getChronicle,syncChronicleIndex}from'./chronicle.mjs';
import {groupHistory}from'../extension/history-window.mjs';
import {registerUIRoutes} from './ui-routes.mjs';
import {translateCall,narrateExecution,timeSegments,CLIENT_READS} from './action-gateway.mjs';
import {loadActionRegistry,actionCall,catalogRow,searchActions,consentIsOwn,CONSENT_PENDING} from './action-registry.mjs';
import {worldActions} from './action-affordances.mjs';
import {ensurePopulationProfiles,modelProfileGenerator}from'./population-service.mjs';
import {beginConsistencyTurn,captureConsistencySearch,captureConsistencyFailure,reconcileConsistencyTurn,reviewConsistencyReply,gateConsistencyTurn,assertConsistencyCommit,sharedModelClient}from'./consistency-service.mjs';

import {primitiveRuntime} from './primitives-runtime.mjs';
export const info={id:'infinite-fields',name:'无限原野本地战役存储',description:'本项目自有的存档、账本与检索服务器插件'};
export async function init(router,{ world=null, baseRoot=null, newCampaignSeed=randomUUID, npcPlanner, npcPlanningEnabled=Boolean(process.env.DEEPSEEK_API_KEY), npcPlanningOptions={}, consistencyEnabled=true, consistencyClient, consistencyBudgetYuan=20, populationGenerator, populationProfilesEnabled=Boolean(process.env.DEEPSEEK_API_KEY)||Boolean(populationGenerator) }={}){
    world ??= await loadWorld();
    const actionRegistry=loadActionRegistry();if(actionRegistry.errors.length)throw Error(actionRegistry.errors.join('; '));
    const engine=new WorldEngine(world),stores=new Map(),indexes=new Map(),registries=new Map(),modelClients=new Map();
    const getModelClient=store=>{
        if(!modelClients.has(store.root))modelClients.set(store.root,sharedModelClient(store,{client:consistencyClient===undefined?npcPlanningOptions.client:consistencyClient,budgetYuan:consistencyBudgetYuan}));
        return modelClients.get(store.root);
    };
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
    const getIndex=async(store,id,document,chronicle)=>{
        const key=`${store.root}:${id}`;
        const selectedEngine=(await store.worldRegistry.get(document.worldHash)).promptScoped(document);
        const identity=`${document.worldHash}:${selectedEngine.remoteKey??''}:${document.state.location}:${document.state.player.name}:${digest(document.state.created??{})}`;
        if(indexes.get(key)?.entityIdentity!==identity){
            const old=indexes.get(key),next=new MemoryIndex({entities:selectedEngine.entities,resolver:selectedEngine.resolver});
            next.entityIdentity=identity;
            if(old){
                for(const record of old.documents.values())if(!record.id.startsWith('chat_')&&!record.id.startsWith('memory_')&&!record.id.startsWith('lore_')&&!record.id.startsWith('settlement_'))next.upsert({...record,revision:undefined});
                next.syncChat(old.chatMessages);
            }
            indexes.set(key,next);
        }
        const index=indexes.get(key),wanted=new Set();
        index.syncSettlements(selectedEngine.world,document,promptScope(selectedEngine,document.state).profiles);
        index.syncSites(selectedEngine.world,document);
        for(const row of publicLoreEntries(selectedEngine.world))index.upsert({
            id:`lore_${row.id}`,text:`${row.name}：${row.description}`,source:'公开世界设定',entities:[row.id,...row.references??[]],
            keywords:row.aliases??[],salience:2,revision:digest(row)});
        for(const [id,memory]of Object.entries(document.memories??{})){
            wanted.add(`memory_${id}`);index.upsert({id:`memory_${id}`,text:memory.content,source:'长期事实',
                entities:[memory.subject],keywords:memory.keywords??[],salience:memory.pinned?5:3,minute:memory.minute??0,guardUntil:memory.guardUntil??0,
                revision:digest(memory)});
        }
        for(const id of index.documents.keys())if(id.startsWith('memory_')&&!wanted.has(id))index.remove(id);
        index.chronicle=chronicle??await getChronicle(store,id);
        syncChronicleIndex(index,index.chronicle);
        return index;
    };
    await registerUIRoutes(router,{handle,getStore});
    router.post('/create',handle(async req=>{
        const legacy={state:seed.state,memories:seed.memories},randomSeed=newCampaignSeed();
        const document=req.body.character===undefined?engine.initialFromLegacy(legacy,randomSeed):engine.createCharacter(legacy,req.body.character,randomSeed);
        if(req.body.character===undefined&&req.body.name)document.state.player.name=String(req.body.name).slice(0,60);
        const store=getStore(req),registry=registries.get(baseRoot??req.user.directories.root);
        document.worldHash=await registry.put(world);
        return store.create({worldVersion:world.version,document});
    }));
    router.post('/read',handle(req=>upgrade(getStore(req),req.body.campaignId)));
    router.post('/history/coverage',handle(async req=>{
        const store=getStore(req),{campaignId,expectedSequence}=req.body,view=await store.read(campaignId);
        if(view.reference.sequence!==expectedSequence)throw new Error('历史覆盖检查前账本已变化');
        const index=await getIndex(store,campaignId,view.document),chronicle=index.chronicle;
        const chat=index.chatMessages.filter(message=>!message.is_system||message.extra?.tool_invocations);
        const groups=await groupHistory(chat,{format:'host',tokenCounts:chat.map(()=>0)});
        return store.exclusive(campaignId,async()=>{
            const state=await store.load(campaignId);if(state.sequence!==expectedSequence||chronicle.reference.sequence!==expectedSequence)throw new Error('历史覆盖检查期间账本已变化');
            const events=state.events.filter(event=>state.active.has(event.sequence)),anchors={};
            for(const group of groups){if(!group.anchor)continue;
                const matched=events.filter(event=>event.anchor===group.anchor),terminal=matched.find(event=>event.input?.tool==='world_turn');
                const texts=group.messages.filter(message=>!message.is_system&&!message.extra?.tool_invocations);
                const indexed=texts.every(message=>index.chatMessages.some((row,i)=>row===message&&index.documents.has(`chat_${i}`)));
                anchors[group.anchor]={processed:Boolean(terminal)&&matched.every(event=>event.sequence<=chronicle.reference.sequence),indexed,
                    complete:Boolean(terminal)&&group.closed&&!group.invalidated,fingerprint:group.fingerprint,
                    eventIds:matched.map(event=>event.id),factIds:chronicle.facts.filter(fact=>fact.anchor===group.anchor).map(fact=>fact.id)};
            }
            return {reference:store.reference(state),revision:state.revision,anchors};
        });
    }));
    router.post('/review/begin',handle(req=>beginConsistencyTurn(getStore(req),req.body.campaignId,{anchor:req.body.anchor,eventId:req.body.eventId,playerText:req.body.playerText,expectedSequence:req.body.expectedSequence,enabled:consistencyEnabled&&req.body.enabled!==false,captureSearch:req.body.captureSearch===true})));
    router.post('/review/gate',handle(req=>gateConsistencyTurn(getStore(req),req.body.campaignId,{token:req.body.token,expectedSequence:req.body.expectedSequence})));
    router.post('/review/reply',handle(async req=>{
        const store=getStore(req),{campaignId,token,draft,expectedSequence}=req.body;
        const view=await store.read(campaignId),index=await getIndex(store,campaignId,view.document);
        const selected=(await store.worldRegistry.get(view.document.worldHash)).scoped(view.document);
        const scene=selected.scene(view.document,String(req.body.query??'').slice(0,20000),index);
        return reviewConsistencyReply(store,campaignId,{token,draft,expectedSequence,scene,chat:index.chatMessages,sceneSequence:view.reference.sequence,client:getModelClient(store)});
    }));
    router.post('/propose',handle(async req=>{
        const {campaignId,eventId,args}=req.body,store=getStore(req),view=await store.read(campaignId);
        const selected=await store.worldRegistry.get(view.document.worldHash);
        const tool=req.body.tool??'world_act';
        if(!['world_act','world_propose'].includes(tool))throw Error('预览只接受注册动作或开放提案');
        return {...await selected.previewAction(view.document,{tool,args,eventId}),reference:view.reference};
    }));
    router.post('/actions/permission',handle(async req=>{
        const {campaignId,action,slots}=req.body,store=getStore(req),view=await store.read(campaignId);
        const selected=await store.worldRegistry.get(view.document.worldHash);
        return {...selected.actionPermission(view.document,{action,slots}),reference:view.reference};
    }));
    router.post('/execute',handle(async req=>{
        const {campaignId,eventId,anchor,expectedSequence}=req.body;
        const store=getStore(req),view=await store.read(campaignId);
        const selected=await store.worldRegistry.get(view.document.worldHash);
        // A1: world_act is stored as the legacy call it aliases, so replay and review see the old tool.
        const translated=translateCall(req.body.tool,req.body.args,primitiveRuntime.registry(selected)),{tool,args}=translated;
        // Health is an internal combat primitive, not a model-controlled tool.
        if(['world_health','world_revive'].includes(tool))throw new Error('生命变化只能由交锋、治疗或死亡结算产生');
        if(view.document.schemaVersion!==2)throw new Error('存档尚未升级到新引擎');
        if(tool==='world_turn')await assertConsistencyCommit(store,campaignId,{reviewId:req.body.reviewId,anchor,args,expectedSequence});
        // begin/reconcile share the campaign queue with writes. Validate again
        // inside a new tail's transaction so replacing the active token between
        // the HTTP precheck and the write cannot publish an old turn.
        const executeReducer=tool==='world_turn'?async(document,input)=>{
            await assertConsistencyCommit(store,campaignId,{reviewId:req.body.reviewId,anchor,args,expectedSequence});
            return store.reducer(document,input);
        }:store.reducer;
        // A wait longer than one event may span (engine cap, see action-gateway) runs as several world_time events, one per segment,
        // the same events the player would have made by waiting in stages. A retry of the whole request finds segment 1 recorded.
        const segments=req.body.tool==='world_act'?timeSegments(tool,args,view.document.state.minute):null;
        if(segments){
            const prior=await store.recorded(campaignId,`${eventId}#1`);
            if(prior)return {ok:true,duplicate:true,result:{...prior.result,segments:segments.length},reference:view.reference};
        }
        const runs=segments?segments.map((segment,i)=>({args:segment,eventId:`${eventId}#${i+1}`})):[{args,eventId}];
        let saved,interrupted=null;const saves=[];
        for(const [i,run] of runs.entries()){
            try{
                saved=await store.transact(campaignId,{id:run.eventId,input:{tool,args:run.args,eventId:run.eventId},anchor,expectedSequence:i?saved.reference.sequence:expectedSequence},executeReducer);
                saves.push(saved);
            }catch(error){
                if(i){interrupted=error.message;break;}// earlier segments stand, exactly as if the player had stopped waiting there
                await captureConsistencyFailure(store,campaignId,{anchor,expectedSequence,tool,args,eventId},error);
                // world_act never carries someone else's consent: when the legacy judgement asks for the other party's agreement, say so in-world.
                // (An action acting on the player themself keeps its own refusal reason.)
                if(translated.action&&!consentIsOwn(translated.action,req.body.args?.slots??{})&&/同意/.test(error.message))throw new Error(CONSENT_PENDING);
                throw error;
            }
        }
        if(segments)saved={...saved,duplicate:saves.every(row=>row.duplicate),result:{...saved.result,elapsed:saves.reduce((n,row)=>n+(row.result?.elapsed??0),0),segments:saves.length,...(interrupted?{interrupted}:{})}};
        const after=saved.document??(await store.read(campaignId)).document;
        // Event-stream text from the effects the engine applied (display only; a failure here never undoes the action).
        let narration;
        if(!saved.duplicate&&tool!=='world_turn')try{
            const scoped=(await store.worldRegistry.get(after.worldHash)).scoped(after);
            narration=narrateExecution({engine:scoped,before:view.document,after,tool,args,result:saved.result,action:translated.action});
        }catch{narration=undefined;}
        const crossedDay=Math.floor(after.state.minute/1440)>Math.floor(view.document.state.minute/1440);
        if(!saved.duplicate&&npcPlanningEnabled&&(crossedDay||after.state.location!==view.document.state.location)){
            let planning;
            try{planning=await settleNpcPlanning(store,campaignId,{anchor,enabled:true,...(npcPlanner?{planner:npcPlanner}:{}),options:{...npcPlanningOptions,client:getModelClient(store)??npcPlanningOptions.client}});}
            catch(error){planning={status:'failed',reason:'本次人物规划未能保存，已完成的玩家行动仍保留'};}
            const current=await store.read(campaignId);return{...saved,document:current.document,reference:current.reference,npcPlanning:planning,...(narration?{narration}:{})};
        }
        return narration?{...saved,narration}:saved;
    }));
    // A1 动作目录（只读）：不带 campaignId 时列注册表；带 campaignId 时按此处与对象派生可做之事；resolve 只翻译不执行。
    router.post('/actions',handle(async req=>{
        const {campaignId,target,query,resolve}=req.body??{};
        let view,scoped;
        if(campaignId){const store=getStore(req);view=await store.read(campaignId);scoped=(await store.worldRegistry.get(view.document.worldHash)).scoped(view.document);}
        const registry=scoped?primitiveRuntime.registry(scoped):loadActionRegistry();
        if(resolve){
            const call=actionCall(registry,resolve.action,resolve.slots??{});
            return call.projection?{action:call.action.id,projection:call.projection}:{action:call.action.id,tool:call.tool,args:call.args,clientRead:CLIENT_READS.has(call.tool)};
        }
        const limit=Number.isSafeInteger(req.body?.limit)&&req.body.limit>0&&req.body.limit<=100?req.body.limit:24;
        if(!campaignId){
            const rows=(query?searchActions(registry,query,{limit}):registry.actions.filter(a=>a.visibility.catalog!=='llm')).map(catalogRow);
            return {namespaces:registry.namespaces,count:registry.actions.length,actions:rows};
        }
        return {...worldActions(scoped,view.document,{target:target??null,query:query??null,limit,registry}),reference:view.reference};
    }));
    router.post('/reconcile',handle(async req=>{
        const store=getStore(req),{campaignId,excludeAnchor}=req.body,validAnchors=req.body.validAnchors??[];
        const view=await store.reconcile(campaignId,validAnchors,excludeAnchor);
        await reconcileConsistencyTurn(store,campaignId,validAnchors,excludeAnchor);return view;
    }));
    router.post('/feedback',handle(req=>getStore(req).feedback(req.body.campaignId)));
    router.post('/scene',handle(async req=>{
        // Naming a seeded resident in conversation drafts their full profile once.
        let populationProfiles=[];
        if(populationProfilesEnabled&&typeof req.body.query==='string'&&req.body.query){
            const store=getStore(req),client=populationGenerator?null:getModelClient(store),generator=populationGenerator??(client?modelProfileGenerator(client):null);
            try{populationProfiles=await ensurePopulationProfiles(store,req.body.campaignId,{engineFor:document=>store.worldRegistry.get(document.worldHash),query:req.body.query,generator});}
            catch(error){populationProfiles=[{status:'skipped',reason:String(error.message).slice(0,200)}];}
        }
        const store=getStore(req),view=await store.read(req.body.campaignId),selectedEngine=await registries.get(baseRoot??req.user.directories.root).get(view.document.worldHash),index=await getIndex(store,req.body.campaignId,view.document);
        if(Array.isArray(req.body.chat))index.syncChat(req.body.chat);
        const scoped=selectedEngine.scoped(view.document);
        return {scene:scoped.scene(view.document,req.body.query??'',index),reference:view.reference,
            labels:Object.fromEntries(scoped.entities.map(row=>[row.id,row.name])),...(populationProfiles.length?{populationProfiles}:{})};
    }));
    router.post('/search',handle(async req=>{
        const store=getStore(req),{campaignId,token,anchor,expectedSequence,limit}=req.body,query=req.body.query??'';
        // Chronicle preparation uses the campaign queue itself. Prepare first,
        // then verify its sequence again while search and receipt hold that queue.
        let chronicle,preparationError;
        try{chronicle=await getChronicle(store,campaignId);}catch(error){preparationError=error;}
        return captureConsistencySearch(store,campaignId,{token,anchor,expectedSequence,query,limit},async state=>{
            if(preparationError)throw preparationError;
            if(chronicle.reference.sequence!==state.sequence)throw Error('检索准备期间账本已变化');
            if(typeof query!=='string'||limit!==undefined&&(!Number.isSafeInteger(limit)||limit<1||limit>100))throw Error('检索参数无效');
            const index=await getIndex(store,campaignId,state.document,chronicle);
            if(Array.isArray(req.body.chat))index.syncChat(req.body.chat);
            return {results:index.search(query,{now:state.document.state.minute,scope:state.document.state.location,limit})};
        });
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
