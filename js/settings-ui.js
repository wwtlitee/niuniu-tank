/* =====================================================================
   js/settings-ui.js —— 设置面板 / 帮助 / 确认弹窗 / 静音切换
   依赖：AudioMixer / BGMSystem（js/audio-mixer.js + js/bgm-system.js）
   暴露：window.Settings（供其它模块查询/订阅）
   持久化键：tank3d.settings.v1
   ===================================================================== */
"use strict";

/* ---------- BGM 曲目清单（用户可丢 mp3/ogg 进对应 url，无文件时降级合成） ---------- */
const BGM_TRACKS = [
 {id:'menu',slot:'menu',name:'空城 · 集结',url:'assets/audio/music/empty-city.ogg'},
 {id:'prep',slot:'prep',name:'荒原 · 备战',url:'assets/audio/music/wasteland.ogg'},
 {id:'battle',slot:'battle',name:'搜索 · 战斗',url:'assets/audio/music/searching.ogg'},
 {id:'boss',slot:'boss',name:'深境 · 首领',url:'assets/audio/music/searching.ogg'},
 {id:'victory',slot:'victory',name:'余生 · 战后',url:'assets/audio/music/empty-city.ogg'},
 {id:'defeat',slot:'defeat',name:'失联 · 余烬',url:'assets/audio/music/wasteland.ogg'}
];

/* ---------- 画面/操作持久化 ---------- */
const VIDEO_DEFAULTS = Object.freeze({ quality: "auto", shadows: true, particles: true, shake: true, damageText: true });
const STORAGE_KEY = "tank3d.settings.v1";

const Settings = (() => {
  let _video = { ...VIDEO_DEFAULTS };
  let _currentBgmId = null; // 用户手动指定的曲目
  const _subs = new Set();
  function _emit() { _subs.forEach((cb) => { try { cb({ video: { ..._video }, currentBgmId: _currentBgmId }); } catch (_) {} }); }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const obj = JSON.parse(raw);
      if (obj.video) Object.assign(_video, obj.video);
      if (typeof obj.currentBgmId === "string") _currentBgmId = obj.currentBgmId;
    } catch (_) {}
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ video: { ..._video }, currentBgmId: _currentBgmId })); } catch (_) {}
  }

  function getVideo() { return { ..._video }; }
  function setVideo(patch) { Object.assign(_video, patch); save(); _emit(); }
  function setQuality(q) { setVideo({ quality: q }); }
  function getQuality() { return _video.quality; }
  function isShadows() { return _video.shadows; }
  function isParticles() { return _video.particles; }
  function isShake() { return _video.shake; }
  function isDamageText() { return _video.damageText; }
  function setBgmTrack(id) { _currentBgmId = id; save(); _emit(); }
  function getBgmTrack() { return _currentBgmId; }
  function onChange(cb) { _subs.add(cb); return () => _subs.delete(cb); }

  load();
  return { getVideo, setVideo, setQuality, getQuality, isShadows, isParticles, isShake, isDamageText, setBgmTrack, getBgmTrack, onChange, VIDEO_DEFAULTS, STORAGE_KEY };
})();

if (typeof window !== "undefined") window.Settings = Settings;

/* ---------- 设置面板渲染与交互 ---------- */
const SettingsUI = (() => {
  let _open = false;

  function _$(id) { return document.getElementById(id); }
  function _show(id) { const el = _$(id); if (el) el.classList.remove("hidden"); }
  function _hide(id) { const el = _$(id); if (el) el.classList.add("hidden"); }

  /* 把 0..1 的音量映射到滑块的 var(--p) 以便渐变填充 */
  function _paintRange(el, value01) {
    if (!el) return;
    const pct = Math.round(value01 * 100);
    el.value = pct;
    el.style.setProperty("--p", pct + "%");
  }

  function _refreshFromMixer() {
    if (!window.AudioMixer) return;
    const m = window.AudioMixer.getVolume("master") * 100;
    const s = window.AudioMixer.getVolume("sfx") * 100;
    const u = window.AudioMixer.getVolume("music") * 100;
    const muted = window.AudioMixer.isMuted();
    _paintRange(_$("volMaster"), m / 100);
    _paintRange(_$("volSfx"), s / 100);
    _paintRange(_$("volMusic"), u / 100);
    _$("volMasterText").textContent = Math.round(m) + "%";
    _$("volSfxText").textContent = Math.round(s) + "%";
    _$("volMusicText").textContent = Math.round(u) + "%";
    const mt = _$("mutToggle") || _$("muteToggle");
    if (mt) {
      mt.classList.toggle("on", muted);
      mt.setAttribute("aria-checked", muted ? "true" : "false");
    }
    const txt = _$("muteText");
    if (txt) txt.textContent = muted ? "开启" : "关闭";
  }

  function _refreshVideoToggles() {
    const v = Settings.getVideo();
    const pairs = [
      ["toggleShadows", v.shadows],
      ["toggleParticles", v.particles],
      ["toggleShake", v.shake],
      ["toggleDamageText", v.damageText],
    ];
    pairs.forEach(([id, on]) => {
      const el = _$(id); if (!el) return;
      el.classList.toggle("on", !!on);
      el.setAttribute("aria-checked", on ? "true" : "false");
      const sib = el.nextElementSibling;
      if (sib && sib.classList.contains("value")) sib.textContent = on ? "开启" : "关闭";
    });
    const sel = _$("videoQuality"); if (sel) sel.value = v.quality;
  }

  function _renderBgmTracks() {
    const wrap = _$("bgmTracks"); if (!wrap || !window.BGMSystem) return;
    wrap.innerHTML = "";
    const currentId = Settings.getBgmTrack();
    const auto=document.createElement('button');auto.className='trackBtn'+(!currentId?' sel':'');auto.textContent='自动 · 跟随战况';auto.onclick=()=>{Settings.setBgmTrack(null);BGMSystem.setManualTrack(null);_renderBgmTracks();};wrap.appendChild(auto);
    BGM_TRACKS.forEach((track) => {
      const b = document.createElement("button");
      b.className = "trackBtn" + (track.id === currentId ? " sel" : "");
      b.dataset.trackId = track.id;
      b.innerHTML = `<span class="slotTag">${track.slot.toUpperCase()}</span>${track.name}`;
      b.addEventListener("click", () => {
        Settings.setBgmTrack(track.id);
        if (window.BGMSystem.setManualTrack) window.BGMSystem.setManualTrack(track.id);
        _renderBgmTracks();
        _setBgmStatus("已切换到「" + track.name + "」");
      });
      wrap.appendChild(b);
    });
    _setBgmStatus("自动跟随战况，也可选择喜欢的主题。");
  }

  function _setBgmStatus(msg) { const el = _$("bgmStatus"); if (el) el.textContent = msg; }

  function _bindAudioTab() {
    const bindRange = (id, channel) => {
      const el = _$(id); if (!el) return;
      el.addEventListener("input", () => {
        const v = Number(el.value) / 100;
        window.AudioMixer.setVolume(channel, v);
        el.style.setProperty("--p", el.value + "%");
        const txt = _$(id + "Text"); if (txt) txt.textContent = el.value + "%";
      });
    };
    bindRange("volMaster", "master");
    bindRange("volSfx", "sfx");
    bindRange("volMusic", "music");

    const mt = _$("mutToggle") || _$("muteToggle");
    if (mt) {
      mt.addEventListener("click", () => { window.AudioMixer.toggleMuted(); _refreshFromMixer(); });
      mt.addEventListener("keydown", (e) => { if (e.code === "Space" || e.code === "Enter") { e.preventDefault(); window.AudioMixer.toggleMuted(); _refreshFromMixer(); } });
    }

    _$( "bgmPreviewBtn").addEventListener("click", async () => {
      const id = Settings.getBgmTrack() || BGMSystem.getCurrentTrackId();
      if (!id || !window.BGMSystem) return;
      const track = BGM_TRACKS.find((t) => t.id === id);
      _setBgmStatus(" 试听「" + (track ? track.name : id) + "」…");
      await window.BGMSystem.preview(id);
    });
    _$("bgmStopPreviewBtn").addEventListener("click", () => {
      if (window.BGMSystem) {window.BGMSystem.stopPreview();if(state===STATE.PAUSED)window.BGMSystem.pause();}
      _setBgmStatus("已停止试听");
    });
  }

  function _bindVideoTab() {
    const sel = _$("videoQuality"); if (sel) sel.addEventListener("change", () => Settings.setQuality(sel.value));
    const bind = (id, key) => {
      const el = _$(id); if (!el) return;
      el.addEventListener("click", () => {
        const cur = Settings.getVideo();
        Settings.setVideo({ [key]: !cur[key] });
        _refreshVideoToggles();
      });
      el.addEventListener("keydown", (e) => { if (e.code === "Space" || e.code === "Enter") { e.preventDefault(); el.click(); } });
    };
    bind("toggleShadows", "shadows");
    bind("toggleParticles", "particles");
    bind("toggleShake", "shake");
    bind("toggleDamageText", "damageText");
  }

  function _switchTab(name) {
    document.querySelectorAll("#settings .settingsNav button").forEach((b) => {
      b.classList.toggle("active", b.dataset.tab === name);
    });
    document.querySelectorAll("#settings .settingsSection").forEach((s) => {
      s.classList.toggle("active", s.dataset.section === name);
    });
  }

  function _bindNav() {
    document.querySelectorAll("#settings .settingsNav button").forEach((b) => {
      b.addEventListener("click", () => _switchTab(b.dataset.tab));
    });
  }

  function _bindFooter() {
    _$("settingsCloseBtn").addEventListener("click", () => SettingsUI.close());
    _$("settingsResetBtn").addEventListener("click", () => {
      window.AudioMixer.applySettings({ ...window.AudioMixer.DEFAULTS });
      Settings.setVideo({ ...Settings.VIDEO_DEFAULTS });
      Settings.setBgmTrack(null);
      if (window.BGMSystem && window.BGMSystem.setManualTrack) window.BGMSystem.setManualTrack(null);
      _refreshFromMixer();
      _refreshVideoToggles();
      _renderBgmTracks();
      if (window.toast) window.toast("已恢复默认设置");
    });
  }

  function _bindOutsideClose() {
    // 点击 backdrop 关闭（注意 overlay 内子元素不冒泡触发）
    _$("settings").addEventListener("click", (e) => {
      if (e.target.id === "settings") SettingsUI.close();
    });
  }

  function open() {
    if (_open) return;
    _open = true;
    _show("settings");
    _refreshFromMixer();
    _refreshVideoToggles();
    _renderBgmTracks();
    _switchTab("audio");
  }
  function close() {
    if (!_open) return;
    _open = false;
    _hide("settings");
    if (window.BGMSystem) {
      window.BGMSystem.stopPreview();
      if(state===STATE.PAUSED)window.BGMSystem.pause();
    }
  }
  function isOpen() { return _open; }

  function init() {
    _bindAudioTab();
    _bindVideoTab();
    _bindNav();
    _bindFooter();
    _bindOutsideClose();
  }

  return { open, close, isOpen, init, _refreshFromMixer };
})();

if (typeof window !== "undefined") window.SettingsUI = SettingsUI;

/* ---------- 帮助（键位速查）overlay ---------- */
const HelpOverlay = (() => {
  const KEYS = [
    { label: "通用", entries: [
      { k: "ESC", d: "暂停 / 继续" },
      { k: "M", d: "一键静音" },
    ]},
    { label: "经典模式", entries: [
      { k: "WASD", d: "移动坦克" },
      { k: "鼠标", d: "瞄准" },
      { k: "左键 / Space", d: "开火" },
      { k: "P", d: "空袭轰炸" },
    ]},
    { label: "生存模式", entries: [
      { k: "方向键", d: "移动镜头" },
      { k: "左键", d: "选中单位 / 建筑" },
      { k: "右键", d: "移动或攻击" },
      { k: "A+左键", d: "攻击移动" },
      { k: "S", d: "停止" },
      { k: "P", d: "巡逻" },
      { k: "B", d: "建造" },
      { k: "T", d: "研究院" },
      { k: "G", d: "大门升级" },
      { k: "Shift", d: "多选" },
    ]},
  ];

  function _render() {
    const root = document.getElementById("helpKeyList"); if (!root) return;
    root.innerHTML = "";
    KEYS.forEach((group) => {
      const wrap = document.createElement("div");
      wrap.style.gridColumn = "1 / -1";
      wrap.innerHTML = `<h3 style="font-size:14px;color:#ffd75e;letter-spacing:2px;margin:14px 0 6px;">${group.label}</h3>`;
      root.appendChild(wrap);
      group.entries.forEach((e) => {
        const item = document.createElement("div");
        item.className = "keyItem";
        item.innerHTML = `<kbd>${e.k}</kbd><span class="desc">${e.d}</span>`;
        root.appendChild(item);
      });
    });
  }

  function open() { _render(); document.getElementById("helpOverlay").classList.remove("hidden"); }
  function close() { document.getElementById("helpOverlay").classList.add("hidden"); }

  function init() {
    document.getElementById("helpCloseBtn").addEventListener("click", close);
    document.getElementById("helpOverlay").addEventListener("click", (e) => { if (e.target.id === "helpOverlay") close(); });
  }
  return { open, close, init };
})();
if (typeof window !== "undefined") window.HelpOverlay = HelpOverlay;

/* ---------- 确认弹窗（带 Promise API） ---------- */
const ConfirmDialog = (() => {
  let _resolve = null;
  function _bind() {
    const ok = document.getElementById("confirmOk");
    const cancel = document.getElementById("confirmCancel");
    ok.addEventListener("click", () => { document.getElementById("confirm").classList.add("hidden"); if (_resolve) _resolve(true); _resolve = null; });
    cancel.addEventListener("click", () => { document.getElementById("confirm").classList.add("hidden"); if (_resolve) _resolve(false); _resolve = null; });
    document.getElementById("confirm").addEventListener("click", (e) => {
      if (e.target.id === "confirm") { document.getElementById("confirm").classList.add("hidden"); if (_resolve) _resolve(false); _resolve = null; }
    });
  }
  function ask(title, msg) {
    document.getElementById("confirmTitle").textContent = title;
    document.getElementById("confirmMsg").textContent = msg;
    document.getElementById("confirm").classList.remove("hidden");
    return new Promise((res) => { _resolve = res; });
  }
  return { ask, init: _bind };
})();
if (typeof window !== "undefined") window.ConfirmDialog = ConfirmDialog;

/* ---------- 重开本局 / 返回主菜单（带确认） ---------- */
function restartCurrentRun() {
  if (typeof window.resetGame !== "function") return;
  const m = typeof ACTIVE_MODE!=='undefined' && ACTIVE_MODE.key;
  if (m !== "survival" && m !== "classic") {
    if (window.toast) window.toast("当前模式无重开入口");
    return;
  }
  // 关闭可能打开的覆盖层
  SettingsUI.close();
  document.getElementById("pause").classList.add("hidden");
  window.resetGame();
  if (window.toast) window.toast("已重新开始本局");
}
function backToMenuWithConfirm() {
  SettingsUI.close();
  ConfirmDialog.ask("返回主菜单？", "当前进度将保留（生存模式会自动存档）。确定要离开吗？").then((ok) => {
    if (!ok) return;
    if (typeof window.backToMenu === "function") window.backToMenu();
  });
}

/* ---------- BGM 系统接入：曲目清单与 manual track 联动 ---------- */
function configureBGM() {
  if (!window.BGMSystem) return;
  window.BGMSystem.configure(BGM_TRACKS);
  const cur = Settings.getBgmTrack();
  if (cur) window.BGMSystem.setManualTrack(cur);
}

/* ---------- 全局快捷键：M 键一键静音 ---------- */
function _bindGlobalKeys() {
  addEventListener("keydown", (e) => {
    if (e.code !== "KeyM" || e.repeat) return;
    const tag = e.target && e.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    e.preventDefault();
    const muted = window.AudioMixer && window.AudioMixer.toggleMuted();
    if (window.toast) window.toast(muted ? " 已静音" : " 声音已恢复");
    if (SettingsUI.isOpen()) SettingsUI._refreshFromMixer();
  });
}

/* ---------- 入口按钮绑定（主菜单 / 暂停菜单） ---------- */
function _bindEntryPoints() {
  const settingsMenuBtn = document.getElementById("settingsMenuBtn");
  if (settingsMenuBtn) settingsMenuBtn.addEventListener("click", () => SettingsUI.open());
  const helpMenuBtn = document.getElementById("helpMenuBtn");
  if (helpMenuBtn) helpMenuBtn.addEventListener("click", () => HelpOverlay.open());

  const pauseSettingsBtn = document.getElementById("pauseSettingsBtn");
  if (pauseSettingsBtn) pauseSettingsBtn.addEventListener("click", () => SettingsUI.open());

  const pauseRestartBtn = document.getElementById("pauseRestartBtn");
  if (pauseRestartBtn) pauseRestartBtn.addEventListener("click", () => {
    ConfirmDialog.ask("重新开始本局？", "当前进度将被清空（金币、波次、人口都将归零）。").then((ok) => {
      if (ok) restartCurrentRun();
    });
  });

  // 旧的 #pauseMenuBtn 在主菜单按钮区里，改为带确认
  const pauseMenuBtn = document.getElementById("pauseMenuBtn");
  if (pauseMenuBtn) {
    pauseMenuBtn.removeEventListener && pauseMenuBtn.removeEventListener("click", null);
    pauseMenuBtn.addEventListener("click", backToMenuWithConfirm);
  }
  // 主菜单按钮 #menuBtn / gameover 后面接的 menuBtn 也走确认
  const menuBtn = document.getElementById("menuBtn");
  if (menuBtn) menuBtn.addEventListener("click", backToMenuWithConfirm);
}

/* ---------- 启动钩子 ---------- */
function boot() {
  if (typeof window.AudioMixer === "undefined") {
    // audio-mixer.js 未就绪：延迟
    setTimeout(boot, 50);
    return;
  }
  // 启动时应用 mixer 已从 localStorage 加载的设置；无需额外动作
  configureBGM();
  if(window.applyPresentationSettings){Settings.onChange(window.applyPresentationSettings);window.applyPresentationSettings();}
  HelpOverlay.init();
  ConfirmDialog.init();
  SettingsUI.init();
  _bindEntryPoints();
  _bindGlobalKeys();

  // 监听 AudioMixer 变化，UI 同步
  window.AudioMixer.onChange(() => {
    if (SettingsUI.isOpen()) SettingsUI._refreshFromMixer();
  });
}

/* 脚本在 body 末尾加载：DOM 已就绪；若 audio() 还未调用 mixer 此时为空但 bus('master')==null，UI 仍可渲染 */
boot();

addEventListener('keydown',event=>{
 const confirm=document.getElementById('confirm'),help=document.getElementById('helpOverlay');
 if(!confirm.classList.contains('hidden')){if(event.code==='Escape')document.getElementById('confirmCancel').click();event.stopImmediatePropagation();return;}
 if(!help.classList.contains('hidden')){if(event.code==='Escape'||event.code==='F1')HelpOverlay.close();event.stopImmediatePropagation();event.preventDefault();return;}
 if(SettingsUI.isOpen()){if(event.code==='Escape'){SettingsUI.close();event.preventDefault();}event.stopImmediatePropagation();return;}
 if(event.code==='F1'){event.preventDefault();event.stopImmediatePropagation();if(state!==STATE.MENU&&state!==STATE.PAUSED)setPause(true);HelpOverlay.open();}
},{capture:true});

for(const [id,key] of [['settingsMenuBtn','settings'],['helpMenuBtn','research']]){const node=document.querySelector('#'+id+' .ico');if(node)node.innerHTML=UIIcons.svg(key);}
