/* 装甲竞速 v8.3.0 — 矢量道具图标，无字体图标或图片请求。 */
(function(root){
 'use strict';
 const icons={
  boost:'<path d="M19 5 8 23h11l-2 12 15-21H21l3-9Z"/>',
  missile:'<path d="m13 26 5-14 11-6-1 13-10 11Z"/><path d="m13 21-6 3 5 3m9-1 1 7 5-8M12 30l-5 6m9-4-2 5"/><circle cx="23" cy="14" r="2"/>',
  mine:'<ellipse cx="20" cy="25" rx="13" ry="6"/><path d="M8 24v-6c0-7 24-7 24 0v6M20 7v5M7 11l5 4m21-4-5 4M3 21h4m26 0h4"/><circle cx="20" cy="18" r="3"/>',
  shield:'<path d="M20 4 7 10v10c0 8 13 16 13 16s13-8 13-16V10Z"/><path d="m13 20 5 5 10-12"/>',
  leader:'<path d="M7 13 5 6l9 5 6-8 6 8 9-5-2 7M12 18h16m-15 3 7 14 7-14Z"/><path d="M4 25h5m22 0h5M20 15v-2"/>',
  ufo:'<ellipse cx="20" cy="17" rx="17" ry="6"/><path d="M11 13c0-12 18-12 18 0M14 23 9 35m17-12 5 12M20 25v11"/><path d="M7 17h1m11 2h2m11-2h1"/>',
  emp:'<circle cx="20" cy="20" r="15"/><path d="m22 7-9 15h7l-2 11 9-15h-7Z"/>',
  empty:'<path d="M12 8H8v6m20-6h4v6M8 26v6h6m18-6v6h-6M16 20h8m-4-4v8"/>'
 };
 const accents={boost:'#ffc56e',missile:'#f4a078',mine:'#d6ac7f',shield:'#7edbc8',leader:'#ff7a69',ufo:'#bda3ff',emp:'#84cfff',empty:'#9bafa7'};
 function icon(type){const model=root.RacingUI.models&&root.RacingUI.models[type];if(model)return '<img class="itemModel" src="'+model+'" alt="" draggable="false"/>';return '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(icons[type]||icons.empty)+'</svg>';}
 root.RacingUI={icon,accents};
})(window);
