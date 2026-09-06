/* React Bits Hyperspeed 的原生适配版。
 * 保留官方的双道路、车灯、路边灯柱和 turbulentDistortion 语义，
 * 只移除 React / postprocessing 外壳，以适配当前静态 Three.js 页面。 */
"use strict";

(() => {
  const host = document.getElementById("hyperspeedBg");
  if (!host || !window.THREE) return;
  const T = window.THREE;
  const options = {
    length: 400, roadWidth: 10, islandWidth: 2, lanesPerRoad: 3,
    lightPairsPerRoadWay: 40, totalSideLightSticks: 20,
    movingAwaySpeed: [60, 80], movingCloserSpeed: [-120, -160],
    leftCars: [0xd856bf, 0x6750a2, 0xc247ac],
    rightCars: [0x03b3c3, 0x0e5ea5, 0x324555], sticks: 0x03b3c3,
  };
  const renderer = new T.WebGLRenderer({ antialias: false, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x000000, 1);
  host.appendChild(renderer.domElement);
  const scene = new T.Scene();
  scene.fog = new T.Fog(0x000000, 35, 330);
  const camera = new T.PerspectiveCamera(90, 1, .1, 1000);
  camera.position.set(0, 8, -5);
  camera.lookAt(0, 4, -55);

  const distortion = `
    uniform float uTime;
    #define PI 3.14159265358979
    float nsin(float v){ return sin(v) * .5 + .5; }
    vec3 getDistortion(float p){
      float x = cos(PI * p * 4. + uTime) * 25. + pow(cos(PI * p * 8. + uTime * 2.), 2.) * 5.;
      float y = -nsin(PI * p * 8. + uTime) * 10. - pow(nsin(PI * p * 1. + uTime), 5.) * 10.;
      return vec3(x - 25., y + 10., 0.);
    }
  `;
  const roadVertex = `${distortion}
    varying vec2 vUv;
    void main(){
      vec3 p = position;
      vec3 d = getDistortion((p.y + 200.) / 400.);
      p.x += d.x; p.z += d.y; p.y -= d.z;
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.);
    }
  `;
  const roadFragment = `
    varying vec2 vUv;
    uniform float uTime;
    uniform float uLanes;
    void main(){
      vec2 uv = vUv;
      float lane = 1. / uLanes;
      float dash = step(.48, fract(uv.y * 10. + uTime * .5));
      float centerLine = step(.94, fract(uv.x * 2.));
      float laneLine = step(.965, fract(uv.x / lane));
      float mark = max(centerLine, laneLine) * dash;
      vec3 road = vec3(.031, .031, .035);
      vec3 light = vec3(.075, .075, .09);
      gl_FragColor = vec4(mix(road, light, mark), 1.);
    }
  `;
  const roadMat = new T.ShaderMaterial({ vertexShader: roadVertex, fragmentShader: roadFragment,
    uniforms: { uTime: { value: 0 }, uLanes: { value: options.lanesPerRoad } } });
  function road(x) {
    const mesh = new T.Mesh(new T.PlaneGeometry(options.roadWidth, options.length, 12, 100), roadMat);
    mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, 0, -options.length / 2); scene.add(mesh);
  }
  // 只保留流光和灯柱；灰色扭曲道路会压住菜单主体，故不加入道路面与中央隔离带。

  const moving = [];
  const color = (n) => new T.Color(n);
  function addCar(side, i) {
    const laneWidth = options.roadWidth / options.lanesPerRoad;
    const lane = i % options.lanesPerRoad;
    const roadCenter = side < 0 ? -(options.roadWidth + options.islandWidth) / 2 : (options.roadWidth + options.islandWidth) / 2;
    const x = roadCenter + lane * laneWidth - options.roadWidth / 2 + laneWidth / 2 + (Math.random() - .5) * laneWidth * .5;
    const material = new T.MeshBasicMaterial({ color: color((side < 0 ? options.leftCars : options.rightCars)[i % 3]), transparent: true, opacity: .82 });
    const mesh = new T.Mesh(new T.BoxGeometry(.12 + Math.random() * .22, .08, 2 + Math.random() * 8), material);
    mesh.position.set(x, .12 + Math.random() * .18, -Math.random() * options.length);
    scene.add(mesh); moving.push({ mesh, side, speed: side < 0 ? 68 + Math.random() * 18 : -(125 + Math.random() * 35) });
  }
  for (let i = 0; i < options.lightPairsPerRoadWay; i++) { addCar(-1, i); addCar(1, i); }
  for (let i = 0; i < options.totalSideLightSticks; i++) {
    const side = i % 2 ? 1 : -1;
    const mesh = new T.Mesh(new T.BoxGeometry(.12 + Math.random() * .35, 1.3 + Math.random() * .4, .08),
      new T.MeshBasicMaterial({ color: options.sticks, transparent: true, opacity: .7 }));
    mesh.position.set(side * (options.roadWidth + 2.2), .7, -Math.random() * options.length);
    scene.add(mesh); moving.push({ mesh, side, speed: 135 + Math.random() * 35, stick: true });
  }
  let width = 1, height = 1, last = performance.now(), raf = 0;
  function resize() {
    width = Math.max(1, host.clientWidth); height = Math.max(1, host.clientHeight);
    renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
  }
  function tick(now) {
    const dt = Math.min((now - last) / 1000, .05); last = now;
    roadMat.uniforms.uTime.value += dt * 1.7;
    for (const item of moving) {
      item.mesh.position.z += item.speed * dt;
      if (item.mesh.position.z > 15) item.mesh.position.z = -options.length;
      if (item.mesh.position.z < -options.length - 10) item.mesh.position.z = 15;
    }
    renderer.render(scene, camera); raf = requestAnimationFrame(tick);
  }
  window.addEventListener("resize", resize, { passive: true });
  window.addEventListener("pagehide", () => cancelAnimationFrame(raf), { once: true });
  resize(); tick(performance.now());
})();
