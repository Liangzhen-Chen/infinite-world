// 宿主 express 的 CJS 入口（出题方 haiku-orca-test-s13b）。经 createRequire 取得，避免 tsc 追随 require 把 node_modules/express 的 JS 源码当作检查对象。
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const EXPRESS = 'express';
export const express = require(EXPRESS);
export default express;
