'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { createStaticServer } = require('../tools/asset-runtime-catalog.cjs');

let server, browser, page;
const errors = [],
  results = [];
const output = path.resolve(__dirname, '../output/centered-hud');
before(async () => {
  fs.mkdirSync(output, { recursive: true });
  server = await createStaticServer(path.resolve(__dirname, '..'));
  browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=d3d11'] });
  page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html?mode=survival&autotest=1`);
  await page.waitForFunction(() => typeof state !== 'undefined' && state === 7, null, { timeout: 60000 });
  await page.evaluate(() => {
    state = STATE.PAUSED;
    questActive = false;
    hideQuestPanel();
    game.gold = 784;
    game.popUsed = 4;
    game.popMax = 12;
    wc3Select('base', baseSelectionRef());
    wc3RenderSel();
    renderCmdCard();
    updateDockRes();
  });
});
after(async () => {
  fs.writeFileSync(path.join(output, 'layout.json'), JSON.stringify({ results, errors }, null, 2));
  await browser?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
});

test('命令居中，金币人口在基地状态右侧无框显示且面板不重叠', async () => {
  for (const [width, height] of [
    [1280, 720],
    [1600, 900],
    [1920, 1080],
    [2323, 1263],
    [1024, 768],
    [760, 600],
  ]) {
    await page.setViewportSize({ width, height });
    const layout = await page.evaluate(() => {
      const rect = (id) => document.getElementById(id).getBoundingClientRect().toJSON();
      const ids = ['mmDock', 'selPanel', 'cmdcard', 'resDock', 'topLeft', 'waveInfo'];
      const panels = ids.map((id) => ({ id, ...rect(id) }));
      return {
        width: innerWidth,
        height: innerHeight,
        panels,
        goldFont: parseFloat(getComputedStyle(document.getElementById('dockGold')).fontSize),
        popFont: parseFloat(getComputedStyle(document.getElementById('dockPop')).fontSize),
        columns: getComputedStyle(document.getElementById('cmdcard')).gridTemplateColumns.split(' ').length,
        resourceBorder: getComputedStyle(document.getElementById('resDock')).borderTopWidth,
        resourceBackground: getComputedStyle(document.getElementById('resDock')).backgroundImage,
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    results.push(layout);
    const card = layout.panels.find((p) => p.id === 'cmdcard');
    const resources = layout.panels.find((p) => p.id === 'resDock');
    assert.ok(Math.abs(card.x + card.width / 2 - width / 2) < 2, `命令区未居中：${width}, x=${card.x}`);
    const base = layout.panels.find((p) => p.id === 'topLeft');
    assert.ok(resources.left >= base.right + 8 && resources.left - base.right <= 40, '资源应在基地状态右侧');
    assert.ok(resources.top <= 30, '资源应位于左上方');
    assert.equal(layout.resourceBorder, '0px');
    assert.equal(layout.resourceBackground, 'none');
    assert.ok(layout.goldFont >= 22 && layout.popFont >= 22, '主要资源数字必须足够醒目');
    assert.equal(layout.columns, 4);
    assert.equal(layout.overflow, false);
    for (const a of layout.panels) {
      assert.ok(
        a.left >= 0 && a.right <= width && a.top >= 0 && a.bottom <= height,
        `${width}: ${a.id} 越界`,
      );
      for (const b of layout.panels)
        if (a.id !== b.id) {
          assert.ok(
            a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom,
            `${width}: ${a.id} 与 ${b.id} 重叠`,
          );
        }
    }
    await page.screenshot({ path: path.join(output, `base-${width}.png`) });
  }
});

test('资源更新和人口满员反馈不会更换正在操作的命令按钮', async () => {
  await page.setViewportSize({ width: 1600, height: 900 });
  const data = await page.evaluate(() => {
    const button = document.querySelector('#cmdcard .cmdBtn');
    const gold = document.getElementById('dockGold');
    game.gold = 1234567.8;
    game.popUsed = 12;
    game.popMax = 12;
    for (let i = 0; i < 50; i++) updateDockRes();
    const full = document.getElementById('dockPopStatus')?.textContent;
    const result = {
      gold: gold.textContent,
      pop: document.getElementById('dockPop').textContent,
      full,
      sameButton: button === document.querySelector('#cmdcard .cmdBtn'),
      sameResource: gold === document.getElementById('dockGold'),
      fits: gold.scrollWidth <= gold.clientWidth,
    };
    game.popMax = 20;
    updateDockRes();
    result.available = document.getElementById('dockPopStatus')?.textContent;
    return result;
  });
  assert.equal(data.gold, '1234567');
  assert.equal(data.pop, '12/12');
  assert.equal(data.full, '已满');
  assert.equal(data.available, '可用 8');
  assert.ok(data.sameButton && data.sameResource && data.fits);
});

test('没有选中目标时部署提示居中，资源仍然可见', async () => {
  await page.evaluate(() => {
    wc3ClearSel();
    wc3RenderSel();
    renderCmdCard();
  });
  const data = await page.evaluate(() => {
    const idle = document.getElementById('selectionIdle').getBoundingClientRect();
    const res = document.getElementById('resDock').getBoundingClientRect();
    return {
      center: idle.x + idle.width / 2,
      width: innerWidth,
      resourceVisible: res.height > 0,
      buttons: document.querySelectorAll('#cmdcard .cmdBtn').length,
    };
  });
  assert.ok(Math.abs(data.center - data.width / 2) < 2);
  assert.ok(data.resourceVisible);
  assert.equal(data.buttons, 0);
  await page.screenshot({ path: path.join(output, 'idle.png') });
  await page.evaluate(() => {
    wc3Select('base', baseSelectionRef());
    wc3RenderSel();
    renderCmdCard();
  });
});

test('生产栏出现后主操作仍居中，提示卡与资源和按钮互不遮挡', async () => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.evaluate(() => {
    heavyFactories.push({
      group: new THREE.Group(),
      hp: 760,
      maxHp: 760,
      queue: [{ typeId: 'light', remaining: 3, total: 7 }],
      progress: 0.5,
      rally: { x: 4, z: 10 },
    });
    renderFactoryQueueDock();
  });
  await page.locator('#cmdcard .cmdBtn').first().hover();
  const data = await page.evaluate(() => {
    const rect = (id) => document.getElementById(id).getBoundingClientRect().toJSON();
    return {
      card: rect('cmdcard'),
      queue: rect('factoryQueueDock'),
      tip: rect('wc3tip'),
      res: rect('resDock'),
      width: innerWidth,
    };
  });
  assert.ok(Math.abs(data.card.x + data.card.width / 2 - data.width / 2) < 2);
  assert.ok(data.queue.left >= data.card.right + 8 && data.queue.right <= data.width);
  assert.ok(
    data.tip.left >= data.card.right + 8 && data.tip.bottom <= data.queue.top,
    '提示应在右侧队列上方',
  );
  assert.ok(data.tip.top >= data.res.bottom, '提示不得覆盖主要资源');
  await page.screenshot({ path: path.join(output, 'queue-tooltip.png') });
  await page.mouse.move(640, 200);
  await page.evaluate(() => {
    heavyFactories.pop();
    renderFactoryQueueDock();
    state = STATE.PREP;
    game.gold = 500;
    openWc3Build();
  });
  await page.locator('#cmdcard .cmdBtn').filter({ hasText: '标准炮台' }).click();
  assert.equal(await page.evaluate(() => shopList()[buildSel]?.id), 'turret');
  assert.deepEqual(errors, []);
});

test('点击左上资源不向地图下单，金矿升级仍可用鼠标完成', async () => {
  const before = await page.evaluate(() => ({
    jobs: constructionJobs.length,
    selection: wc3Sel?.kind,
    buildSel,
  }));
  await page.locator('#dockGold').click();
  const after = await page.evaluate(() => ({
    jobs: constructionJobs.length,
    selection: wc3Sel?.kind,
    buildSel,
  }));
  assert.deepEqual(after, before, '点击资源不能穿透至地图建造或改变选择');
  const level = await page.evaluate(() => {
    state = STATE.BUILD;
    game.gold = 10000;
    const mineIndex=shopList().findIndex(item=>item.id==='goldmine'),mineBuild=shopList()[mineIndex];
    selectBuild(mineIndex);ghost.visible=true;
    for(let z=0;z<GRID&&!goldMines.length;z++)for(let x=0;x<GRID&&!goldMines.length;x++){
      if(!footprintPlaceable({x,z},mineBuild))continue;
      const center=footprintCenter({x,z},mineBuild);placeBuildingImmediately(center.x,center.z);
    }
    if(!goldMines.length)throw new Error('Unable to create the mine fixture');
    wc3Select('goldmine', goldMines[0]);
    wc3RenderSel();
    renderCmdCard();
    updateDockRes();
    return goldMines[0].level;
  });
  await page.locator('#cmdcard .cmdBtn').filter({ hasText: '升级' }).click();
  assert.equal(await page.evaluate(() => goldMines[0].level), level + 1);
  await page.evaluate(() => {
    state = STATE.PAUSED;
    updateDockRes();
  });
  await page.mouse.move(700, 300);
  await page.screenshot({ path: path.join(output, 'mine-upgrade.png') });
  assert.deepEqual(errors, []);
});
