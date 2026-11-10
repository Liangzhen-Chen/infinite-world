// 只读入口检查用的预加载：任何联网尝试直接抛错（--import 方式载入）。
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import dns from 'node:dns';
const deny = () => { throw new Error('NETWORK DENIED'); };
globalThis.fetch = async () => deny();
for (const m of [http, https]) { m.request = deny; m.get = deny; }
net.connect = deny; net.createConnection = deny; net.Socket.prototype.connect = deny; tls.connect = deny; dns.lookup = deny;
