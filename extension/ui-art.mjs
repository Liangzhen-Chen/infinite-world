import {loadArt,installArtPresentation,renderArtSheet} from './background-view.mjs';

export async function registerUI({registerPanel}){
    if(!document.querySelector('link[data-fields-art]')){
        const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('./background-view.css',import.meta.url).href;link.dataset.fieldsArt='';document.head.append(link);
    }
    let art;try{art=await loadArt();installArtPresentation(art);}catch{/* Missing art does not block the game shell. */}
    registerPanel({id:'art',title:'场景画册',render:container=>{if(art)renderArtSheet(container,art);else container.textContent='场景素材读取失败，请重新载入界面。';}});
}
