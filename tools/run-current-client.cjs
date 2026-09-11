const {spawnSync}=require('node:child_process'),fs=require('node:fs');
fs.writeFileSync('output/current-actions.json',JSON.stringify({steps:[{buttons:[],frames:120},{buttons:['right'],frames:12},{buttons:[],frames:10}]}));
const version=require('../package.json').version;
const r=spawnSync(process.execPath,['C:/Users/39215/.codex/skills/develop-web-game/scripts/web_game_playwright_client.js','--url','http://127.0.0.1:8001/play/niuniu-tank/index.html?mode=survival&autotest=1','--actions-file','output/current-actions.json','--iterations','1','--pause-ms','1500','--screenshot-dir',`output/client-${version}-release`],{stdio:'inherit'});process.exitCode=r.status||0;
