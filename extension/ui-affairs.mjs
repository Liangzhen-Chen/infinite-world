import {registerAffairsPanels} from './affairs-panels.mjs';

export function registerUI(shell){
    if(!document.querySelector('link[data-fields-affairs]')){
        const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('./affairs-panels.css',import.meta.url).href;
        link.dataset.fieldsAffairs='';document.head.append(link);
    }
    registerAffairsPanels(shell);
}
