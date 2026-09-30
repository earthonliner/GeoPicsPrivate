#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { listen, installShutdownHooks } from '../server/index.js';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const valueOf = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

if (flag('-h') || flag('--help')) {
  console.log('用法: geophotograph [--port 5178] [--no-open]\n  在本机启动 GeoPhotoGraph（仅监听 127.0.0.1）。');
  process.exit(0);
}

installShutdownHooks();
const port = Number(valueOf('--port') || process.env.PORT || 5178);
const { port: actual } = await listen({ port });
const url = `http://localhost:${actual}`;
console.log(`GeoPhotoGraph 已启动：${url}`);
console.log('照片只在本机处理；按 Ctrl+C 退出。');

if (!flag('--no-open')) {
  const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';
  execFile(opener, [url], () => {});
}
