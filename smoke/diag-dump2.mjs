/* 流场/地形原始 dump：确认敌人转向依据是否自洽 */
import { chromium } from "playwright";
const URL = "http://127.0.0.1:8001/?mode=survival&autotest=1";
const log = (...a) => console.log("[dump]", ...a);

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=swiftshader"],
  });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on("pageerror", e => log("PAGEERROR:", String(e?.stack || e)));
  await page.goto(URL, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => typeof assetsReady === "function" && assetsReady() === true, { timeout: 40000 }).catch(() => {});
  await page.waitForFunction(() => typeof state !== "undefined" && state === 7, { timeout: 40000 });
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => typeof state !== "undefined" && state !== 5, { timeout: 5000 });
  await page.evaluate(() => { game.prepTime = 0; });
  await page.waitForTimeout(20000);

  const dump = await page.evaluate(() => {
    const out = { flowRows: [], typeRows: [], heightRows: [], passRows: [] };
    const X0 = 14, X1 = 24, Z0 = 0, Z1 = 8;
    for (let z = Z0; z <= Z1; z++) {
      let f = `z=${String(z).padStart(2)} F: `, t = `      T: `, h = `      H: `, p = `      P: `;
      for (let x = X0; x <= X1; x++) {
        f += String(flowDist[z * GRID + x]).padStart(4) + " ";
        t += String(grid[z][x]).padStart(4) + " ";
        const c = cellCenter(x, z);
        h += heightAt(c.x, c.z).toFixed(1).padStart(5) + " ";
        p += String(passableForFlow(x, z) ? 1 : 0).padStart(4) + " ";
      }
      out.flowRows.push(f); out.typeRows.push(t); out.heightRows.push(h); out.passRows.push(p);
    }
    // 坡道附近
    out.ramp = [];
    for (let z = 33; z <= 39; z++) {
      let f = `z=${z} F: `, t = `     T: `, h = `     H: `;
      for (let x = 14; x <= 24; x++) {
        f += String(flowDist[z * GRID + x]).padStart(4) + " ";
        t += String(grid[z][x]).padStart(4) + " ";
        const c = cellCenter(x, z);
        h += heightAt(c.x, c.z).toFixed(1).padStart(5) + " ";
      }
      out.ramp.push(f + "\n" + t + "\n" + h);
    }
    out.enemies = enemies.filter(e => e.alive).map(e => {
      const c = cellOf(e.group.position.x, e.group.position.z);
      const f = flowDirFor(e);
      return { cell: `${c.x},${c.z}`, hereD: f.hereD, best: f.best, bestD: f.bestD, dir: `${e.dir.x},${e.dir.z}` };
    });
    return out;
  });

  log("列 x = 14..24");
  log("--- 出生点 S1 附近 (z=0..8) ---");
  dump.flowRows.forEach((r, i) => log(r + "\n" + dump.typeRows[i] + "\n" + dump.heightRows[i] + "\n" + dump.passRows[i]));
  log("--- 坡口附近 (z=33..39) ---");
  dump.ramp.forEach(r => log(r));
  log("敌人当前流场决策:");
  dump.enemies.forEach(e => log("  " + JSON.stringify(e)));
  await browser.close();
})().catch(e => { console.error("FATAL", e); process.exit(2); });
