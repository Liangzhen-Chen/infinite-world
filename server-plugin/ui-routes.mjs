import fs from 'node:fs/promises';

// New ui-*.mjs modules export registerUIRoutes({post, readCampaign}).
// UI requests read the selected campaign world without upgrading or settling it.
export async function registerUIRoutes(router,{handle,getStore}){
    const readCampaign=async req=>{
        const store=getStore(req),view=await store.read(req.body.campaignId);
        const engine=(await store.worldRegistry.get(view.document.worldHash)).scoped(view.document);
        return {...view,engine};
    };
    const post=(route,project)=>{
        if(!route.startsWith('/ui/'))throw Error('界面路由须位于 /ui/ 下');
        router.post(route,handle(project));
    };
    const names=(await fs.readdir(new URL('./',import.meta.url))).filter(name=>/^ui-.*\.mjs$/.test(name)&&name!=='ui-routes.mjs').sort();
    for(const name of names){
        const module=await import(new URL(name,import.meta.url));
        if(module.registerUIRoutes)await module.registerUIRoutes({post,readCampaign});
    }
}
