import {registerMapPanel} from './map-view.mjs';

export function registerUI(shell){
    if(!document.querySelector('link[data-fields-map]')){
        const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('./map-view.css',import.meta.url).href;
        link.dataset.fieldsMap='';document.head.append(link);
    }
    registerMapPanel(shell);
}
