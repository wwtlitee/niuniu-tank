'use strict';
const path=require('node:path'),{spawn}=require('node:child_process');
const {createStaticServer}=require('./asset-runtime-catalog.cjs');
(async()=>{
 const root=path.resolve(__dirname,'..'),server=await createStaticServer(root);
 try{
  const mode=process.argv[2]||'classic',url=mode==='classic'?'classic.html?autotest=1':'index.html?mode=survival&autotest=1';
  const actions={steps:[{buttons:[],frames:120},{buttons:['left_mouse_button'],frames:60,mouse_x:640,mouse_y:140},{buttons:['right'],frames:12},{buttons:[],frames:15}]};
  const client=path.join(process.env.USERPROFILE,'.codex/skills/develop-web-game/scripts/web_game_playwright_client.js');
  const args=[client,'--url',`http://127.0.0.1:${server.address().port}/${url}`,'--actions-json',JSON.stringify(actions),'--iterations','1','--pause-ms','1200','--screenshot-dir',path.join(root,'output','av-polish','client-'+mode)];
  await new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{stdio:'inherit',cwd:root});child.on('error',reject);child.on('exit',code=>code?reject(new Error('client exit '+code)):resolve());});
 }finally{await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
