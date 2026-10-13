import {getSettings,subscribeSettings} from './ui-settings.mjs';
import {subscribeMessages} from './message-view.mjs';

const base=new URL('./assets/visual/',import.meta.url);
let manifestRequest,controller,backgroundRequest=0;
export function assetURL(file){return new URL(file,base).href;}
export async function loadArt(){
    if(!manifestRequest)manifestRequest=fetch(assetURL('manifest.json')).then(response=>{if(!response.ok)throw Error('场景素材未能读取');return response.json();});
    return manifestRequest;
}
export function selectBackground(art,location,overview){
    const scene=art.locations[location];if(!scene||!overview.weather)return null;
    const period=overview.date.daylight?'day':'night',weather=art.weatherGroups[overview.weather.name];
    return weather?art.backgrounds[`${scene}-${period}-${weather}`]??null:null;
}
export class BackgroundView{
    constructor({doc=document,loadImage=url=>new Promise((resolve,reject)=>{const image=new Image();image.onload=resolve;image.onerror=reject;image.src=url;})}={}){
        this.doc=doc;this.loadImage=loadImage;this.ticket=0;this.key=null;this.scope=null;this.root=null;this.front=0;this.reducedMotion=false;
    }
    clear(){this.ticket++;this.root?.remove();this.root=null;this.key=null;this.scope=null;this.doc.body.classList.remove('fields-scenery-active','fields-scenery-fallback');}
    setReducedMotion(value){this.reducedMotion=value;if(this.root)this.root.dataset.reducedMotion=String(value);}
    async select(row,{scope,reducedMotion=false}={}){
        if(this.scope!==scope){this.clear();this.scope=scope;}
        if(!row){this.clear();return;}
        this.setReducedMotion(reducedMotion);
        if(this.key===row.file){this.ticket++;return;}
        const ticket=++this.ticket,url=assetURL(row.file);
        try{await this.loadImage(url);}catch{return;}
        if(ticket!==this.ticket)return;
        if(!this.root){
            const root=this.doc.createElement('div');root.id='fields-scenery';root.setAttribute('aria-hidden','true');
            for(let i=0;i<2;i++){const layer=this.doc.createElement('div');layer.className='fields-scenery-layer';root.append(layer);}
            const host=this.doc.querySelector('#bg1');(host??this.doc.body).prepend(root);this.root=root;this.front=1;
            this.doc.body.classList.add('fields-scenery-active');if(!host)this.doc.body.classList.add('fields-scenery-fallback');
        }
        const wasEmpty=this.key===null;this.root.dataset.reducedMotion=String(this.reducedMotion||wasEmpty);
        const next=1-this.front,layers=this.root.children;layers[next].style.backgroundImage=`url("${url}")`;
        // Commit the hidden image before starting the opacity transition.
        void layers[next].offsetWidth;layers[next].style.opacity='1';layers[this.front].style.opacity='0';
        this.root.dataset.background=row.file;this.root.dataset.label=row.label;this.front=next;this.key=row.file;
        if(wasEmpty&&!this.reducedMotion){void this.root.offsetWidth;this.root.dataset.reducedMotion='false';}
    }
}
export async function updateBackground(view,overview,scope){
    controller??=new BackgroundView();const request=++backgroundRequest;
    try{
        const art=await loadArt();if(request!==backgroundRequest)return;
        await controller.select(selectBackground(art,view.document.state.location,overview),{scope,reducedMotion:getSettings().reducedMotion});
    }catch{/* Cosmetic asset failures leave the current scene and ledger usable. */}
}
export function clearBackground(){backgroundRequest++;controller?.clear();}
export function installArtPresentation(art){
    subscribeSettings(settings=>controller?.setReducedMotion(settings.reducedMotion));
    subscribeMessages(()=>{
        const toolbar=document.querySelector('#fields-toolbar');
        if(toolbar&&!toolbar.querySelector('.fields-game-logo')){
            const logo=document.createElement('img');logo.className='fields-game-logo';logo.src=assetURL(art.logo);logo.alt='无限原野';logo.width=40;logo.height=40;toolbar.prepend(logo);
        }
        for(const badge of document.querySelectorAll('[data-fields-known-speaker="true"]')){
            const file=art.portraits[badge.dataset.speakerId],avatar=badge.querySelector('.fields-speaker-avatar');
            if(!file||!avatar)continue;
            const image=document.createElement('img');image.src=assetURL(file);image.alt='';image.width=40;image.height=40;avatar.replaceChildren(image);
        }
    });
}
export function renderArtSheet(container,art){
    container.replaceChildren();container.className='fields-art-sheet';const doc=container.ownerDocument;
    const intro=doc.createElement('p');intro.textContent='原创河谷纹章与场景插画。背景是场景示意，不标示人物、道路通行或天气风险。';container.append(intro);
    const grid=doc.createElement('div');grid.className='fields-art-grid';
    for(const row of Object.values(art.backgrounds)){
        const figure=doc.createElement('figure'),image=doc.createElement('img'),caption=doc.createElement('figcaption');
        image.src=assetURL(row.file);image.alt=row.label;image.loading='lazy';image.width=320;image.height=180;caption.textContent=row.label;figure.append(image,caption);grid.append(figure);
    }
    container.append(grid);
}
