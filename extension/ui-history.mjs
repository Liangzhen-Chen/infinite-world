import {registerHistoryPanels} from './people-history.mjs';

export function registerUI(shell){
    if(!document.querySelector('link[data-fields-history]')){
        const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('./people-history.css',import.meta.url).href;
        link.dataset.fieldsHistory='';document.head.append(link);
    }
    registerHistoryPanels(shell);
}
