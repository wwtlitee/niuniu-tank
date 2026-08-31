/* 客观红色像素统计：默认扫描 c1-c7.png（含 HUD），加 --pure 改扫 c*-pure.png（无 HUD）。
   违和红像素判定：R 主导（R>G*1.25 且 R>B*1.25）、有饱和度（max-min>40）、非纯黑纯白。
   输出 redFrac、红色像素数、红色聚集包围盒、红色像素平均色。 */
import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const pure = process.argv.includes("--pure");
const suffix = pure ? "-pure" : "";
const files = ["c1","c2","c3","c4","c5","c6","c7"].map(n => `${n}-${pure ? "pure" : "panorama"}`).map(s => s.replace("panorama","panorama"));
const OUT = "smoke/out";
const list = ["c1","c2","c3","c4","c5","c6","c7"].map(n => `${n}${suffix}.png`);

const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 400, height: 300 } });
await p.goto("about:blank");

let anyBad = false;
for(const f of list){
  const abs = path.resolve(OUT, f);
  if(!fs.existsSync(abs)){ console.log(`${f}: MISSING`); continue; }
  const b64 = fs.readFileSync(abs).toString("base64");
  const stat = await p.evaluate(async (data) => {
    const img = new Image();
    img.src = "data:image/png;base64," + data;
    await img.decode();
    const cv = document.createElement("canvas");
    cv.width = img.width; cv.height = img.height;
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const { width:w, height:h, data:px } = ctx.getImageData(0,0,img.width,img.height);
    let red=0, total=0, minx=w, miny=h, maxx=0, maxy=0;
    let sr=0, sg=0, sb=0;
    for(let y=0;y<h;y++){
      for(let x=0;x<w;x++){
        const i=(y*w+x)*4;
        const r=px[i], g=px[i+1], bl=px[i+2];
        total++;
        const mx=Math.max(r,g,bl), mn=Math.min(r,g,bl);
        if(r>60 && r<245 && r>g*1.25 && r>bl*1.25 && (mx-mn)>40){
          red++; sr+=r; sg+=g; sb+=bl;
          if(x<minx)minx=x; if(x>maxx)maxx=x; if(y<miny)miny=y; if(y>maxy)maxy=y;
        }
      }
    }
    return { w, h, red, total, box: red>0?[minx,miny,maxx,maxy]:null,
      avgRed: red>0?[Math.round(sr/red),Math.round(sg/red),Math.round(sb/red)]:null };
  }, b64);
  const frac = stat.red/stat.total;
  const flag = frac > 0.0015 ? "  <== 违和" : "";
  if(frac > 0.0015) anyBad = true;
  const box = stat.box ? `${stat.box[0]},${stat.box[1]}-${stat.box[2]},${stat.box[3]}` : "-";
  const avg = stat.avgRed ? `rgb(${stat.avgRed.join(",")})` : "-";
  console.log(`${f.padEnd(16)} redFrac=${(frac*100).toFixed(3)}%  redPx=${stat.red}/${stat.total}  avg=${avg}  box=[${box}]${flag}`);
}
console.log(anyBad ? "\n>>> 仍有红色违和，需继续优化。" : "\n>>> 全部通过：无红色违和像素。");
process.exit(anyBad?1:0);