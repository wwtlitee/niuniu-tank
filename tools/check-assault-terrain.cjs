const {spawnSync}=require('node:child_process');
const result=spawnSync(process.execPath,['--test','--test-name-pattern=近战|啃|峡谷|坡道|高台|土路|攻击|治疗|地形','tests/runtime-contract.test.cjs'],{stdio:'inherit'});process.exitCode=result.status||0;
