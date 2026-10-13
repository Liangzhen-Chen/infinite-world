import {registerPersonalPanels} from './personal-panels.mjs';

export function registerUI(shell){
    if(!document.querySelector('link[data-fields-personal]')){
        const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('./personal-panels.css',import.meta.url).href;
        link.dataset.fieldsPersonal='';document.head.append(link);
    }
    registerPersonalPanels(shell);
}
