/* 主菜单三张 3D 展示卡：复用游戏内的坦克与炮台模型构造函数。 */
"use strict";

(() => {
  const T = window.THREE;
  if (!T) return;
  const views = [];
  const mat = (color, glow = 0) => new T.MeshStandardMaterial({ color, roughness: .5, metalness: .4, emissive: color, emissiveIntensity: glow });

  function buildCard(host, kind) {
    if (kind === "td") {
      host.innerHTML = '<div class="mcQuestion" aria-hidden="true">?</div>';
      return;
    }
    const canvas = document.createElement("canvas"); host.appendChild(canvas);
    const renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setClearColor(0x000000, 0);
    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(28, 1, .1, 100);
    camera.position.set(0, 3.2, 9); camera.lookAt(0, .7, 0);
    scene.add(new T.HemisphereLight(0xc7d7df, 0x111315, 1.3));
    const key = new T.DirectionalLight(0xffedc2, 2.2); key.position.set(-3, 6, 5); scene.add(key);
    const root = new T.Group(); scene.add(root);
    const alertTurrets = [];
    if (kind === "classic") {
      const tank = typeof makeRtsTank === "function" ? makeRtsTank(0x2f8d42, 0x4bc15d, 1.08) : makeTank(0x2f8d42, 0x4bc15d, .9);
      tank.position.y = -.8; root.add(tank);
    } else if (kind === "survival") {
      const battery = new T.Group();
      [-1.65, 0, 1.65].forEach((x, index) => {
        const turret = typeof makeTurretMesh === "function" ? makeTurretMesh(index === 1 ? "cannon" : "turret") : new T.Group();
        turret.scale.setScalar(index === 1 ? .62 : .55);
        turret.position.set(x, -.85, 0);
        battery.add(turret);
        alertTurrets.push({ gun: turret.userData.turret || turret, phase: index * 1.7 });
      });
      root.add(battery); root.userData.battery = battery; root.userData.alertTurrets = alertTurrets;
    } else {
      const questionMat = mat(0x8b9397, .04);
      const curve = new T.Mesh(new T.TorusGeometry(.62, .16, 10, 24, Math.PI * 1.55), questionMat); curve.rotation.z = -.25; curve.position.y = .55; root.add(curve);
      const stem = new T.Mesh(new T.BoxGeometry(.26, .88, .26), questionMat); stem.position.set(.36, -.25, 0); stem.rotation.z = -.18; root.add(stem);
      const dot = new T.Mesh(new T.SphereGeometry(.15, 12, 8), questionMat); dot.position.set(.33, -1, 0); root.add(dot);
    }
    views.push({ host, renderer, scene, camera, root, last: performance.now() });
  }

  window.initMenuShowcase = () => {
    if (views.length) return;
    document.querySelectorAll(".mcPreview").forEach(host => buildCard(host, host.dataset.preview));
    const resize = () => views.forEach(view => { const w = Math.max(1, view.host.clientWidth), h = Math.max(1, view.host.clientHeight); view.renderer.setSize(w, h, false); view.camera.aspect = w / h; view.camera.updateProjectionMatrix(); });
    window.addEventListener("resize", resize, { passive: true }); resize();
    const render = now => { views.forEach(view => { const dt = Math.min((now - view.last) / 1000, .05); view.last = now;
      if (!view.root.userData.battery) view.root.rotation.y += dt * .42;
      (view.root.userData.alertTurrets || []).forEach(({ gun, phase }) => {
        const t = now / 1000 + phase;
        gun.rotation.y = Math.sin(t * 1.35) * .12;
      });
      view.renderer.render(view.scene, view.camera);
    }); requestAnimationFrame(render); };
    requestAnimationFrame(render);
  };
})();
