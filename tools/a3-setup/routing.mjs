import {registerSetupLoader} from './index.mjs';
import {initializeFestivalProject} from '../../server-plugin/routing-programs.mjs';
registerSetupLoader({fields:['festivalProjects'],order:86,load(ctx,setup){
 if(!Array.isArray(setup.festivalProjects)){ctx.unmet('festivalProjects','expected an array');return;}
 for(const [i,row] of setup.festivalProjects.entries())ctx.native(`festivalProjects[${i}]`,d=>initializeFestivalProject(d,ctx.engine,row,{origin:'initial',eventId:`a3-setup:festival:${row?.id}`}));
}});
