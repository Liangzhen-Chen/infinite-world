// 只读入口检查用的预加载：任何联网尝试直接抛错（--import 方式载入，经 NODE_OPTIONS 继承给子进程）。
// 拦住：fetch；http/https 的 request/get；net.connect/createConnection 与 net.Socket.prototype.connect（http、https、tls 最终都经它建 TCP，
//   所以具名导入快照 `import {request} from 'node:https'` 也会在连接时被拦）；tls.connect；dgram（createSocket 与 Socket 的 send/connect/bind）；
//   dns 的 lookup、lookupService 与全部 resolve*（回调版、Resolver 类、dns.promises）。
// 已知限制（拦不住）：子进程起外部程序联网（curl、git、ssh、wget 等）；入口自己传 env 起子进程会丢掉 NODE_OPTIONS；
//   worker_threads 里拿未打补丁的原生绑定；用文件里读出的密钥访问是否被拦取决于上面几项。
//   这次登记的只读入口不触发这些情况：tools、world/design 下没有 child_process 起 curl/git/ssh/wget，也没有带 env: 的 spawn（见 tests/no-network-preload.test.mjs 里的 grep 校验）。
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import dns from 'node:dns';
import dgram from 'node:dgram';
const deny = () => { throw new Error('NETWORK DENIED'); };
const denyAsync = async () => deny();
globalThis.fetch = denyAsync;
for (const m of [http, https]) { m.request = deny; m.get = deny; }
net.connect = deny; net.createConnection = deny; net.Socket.prototype.connect = deny; tls.connect = deny;
dgram.createSocket = deny;
for (const k of ['send', 'connect', 'bind']) dgram.Socket.prototype[k] = deny;
const netNames = o => Object.keys(o).filter(k => typeof o[k] === 'function' && /^(lookup|lookupService|resolve)/.test(k));
for (const k of netNames(dns)) dns[k] = deny;
for (const k of netNames(dns.promises)) dns.promises[k] = denyAsync;
for (const k of Object.getOwnPropertyNames(dns.Resolver.prototype)) if (/^(resolve|reverse)/.test(k)) dns.Resolver.prototype[k] = deny;
for (const k of Object.getOwnPropertyNames(dns.promises.Resolver.prototype)) if (/^(resolve|reverse)/.test(k)) dns.promises.Resolver.prototype[k] = denyAsync;
dns.reverse = deny;
