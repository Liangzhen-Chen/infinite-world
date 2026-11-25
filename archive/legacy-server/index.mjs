// 服务端装配文件（卷二 §2.9 第 0 条"装配文件"与封闭清单 :974；扫描规则 :996、S19；state-owners `assembly.calls`；体检 K6-80、K6-81 装配一侧、块 5 遗留 1–3）。
// SillyTavern 加载服务端插件的入口，单个文件，不属于任何模块组。只许三种语句：import、导出的 init(router)、函数体内对清单内函数的调用。
// 块 6 调八个：createRouterCaps、createDigestCap、createWallTimer（取能力对象）与 mountKernel、registerSystems、mountOutput、mountMenuEntry、mountSaveRoutes（挂接）。
// 不调 mountAi、mountNarration（aiGate 不建，卷二勘误 1119k3）与 mountInput（块 6 无输入边；清单里这一项可缺，§2.9 第 0 条）。
// 实参只是形参 router、前面调用的返回值，或只由它们组成的对象字面量；仓库根、显示语言、原语目录都由各挂接函数自己从内核取，装配文件不读属性。

import { createRouterCaps } from './kernel/transport/router-caps.mjs';
import { createDigestCap } from './textcore/digest.mjs';
import { createWallTimer } from './kernel/scheduler.mjs';
import { mountKernel } from './kernel/mount.mjs';
import { registerSystems } from './systems.mjs';
import { mountOutput } from './output-gate/mount.mjs';
import { mountMenuEntry } from './kernel/transport/menu-entry.mjs';
import { mountSaveRoutes } from './kernel/save.mjs';

// 等李白裁定（C1）：SillyTavern 服务端插件要求导出 info，而卷二 :996 只许 import、init(router)、清单内调用三种语句；两者冲突，info 暂保留。
export const info = { id: 'infinite-wilds', name: 'Infinite Wilds', description: 'Rule engine, menu and save routes for the infinite wilds world' };

/**
 * SillyTavern 插件入口：由宿主以 router 调用一次。
 * @param {{post: (path: string, handler: (req: any, res: any) => unknown) => unknown}} router
 * @returns {Promise<void>}
 */
export async function init(router) {
  const caps = createRouterCaps(router);
  const digestCap = createDigestCap();
  const wallTimer = createWallTimer();
  const kernel = mountKernel({ digestCap, wallTimer });
  registerSystems(kernel);
  mountOutput({ caps, kernel });
  mountMenuEntry(caps);
  mountSaveRoutes(caps);
}
