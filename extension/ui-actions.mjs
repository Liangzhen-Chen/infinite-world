import {renderActionsPanel} from './actions-view.mjs';

// A1 可做之事面板：此处可做、对象菜单（人/物/出路）、快捷栏与事件流；动作直接经 world_act 结算，不经模型。
export function registerUI(shell){
    if(!document.querySelector('link[data-fields-actions]')){
        const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('./actions-view.css',import.meta.url).href;
        link.dataset.fieldsActions='';document.head.append(link);
    }
    shell.registerPanel({id:'actions',title:'可做之事',render:renderActionsPanel});
}
