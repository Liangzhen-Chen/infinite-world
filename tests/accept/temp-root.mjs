// 测试临时根（卷十二 §2.11 gatefac `test-temp-root`，inRepo 为假；李白 11-17 裁定三、四）。
// 实现在 tools/accept/lib/temp-root.mjs（门禁工具与测试共用同一份），这里原样 re-export，测试照旧从本文件取。
export { ROOT, testTempRoot, assertTempRoot, assertRelUnderTempRoot, writeUnderTempRoot, removeTempRoot, removeUnderTempRoot } from '../../tools/accept/lib/temp-root.mjs';
