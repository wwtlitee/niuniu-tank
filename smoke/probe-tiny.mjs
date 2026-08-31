import { chromium } from "playwright";
console.log("A: launching");
const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
console.log("B: launched ok");
const p = await b.newPage({ viewport: { width: 800, height: 600 } });
console.log("C: page ok");
await p.goto("http://127.0.0.1:8030/index.html", { waitUntil: "load", timeout: 30000 });
console.log("D: goto ok", p.url());
await p.waitForTimeout(1000);
console.log("D2: waited");
await p.screenshot({ path: "smoke/out/probe.png" });
console.log("D3: shot ok");
process.exit(0); // ★ b.close() 在 swiftshader 下原生崩溃，父进程退出后管道断开浏览器自回收
console.log("E: done");
process.exit(0);
