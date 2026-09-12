/* Independent circuit definitions. Coordinates are metres: x, z, road height. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RacingCircuits=api;})(typeof window==='object'?window:globalThis,function(){
 'use strict';
 const definitions={
  canyon:{id:'canyon',revision:1,name:'峡谷试验场',english:'CANYON CIRCUIT',theme:'canyon',description:'开阔高速 / 巨物峡谷',width:24,shortcut:[3,5],anchors:[[0,0],[0,140],[65,210],[155,175],[190,65],[270,90],[325,20],[290,-105],[160,-160],[45,-130],[-45,-65]]},
  city:{id:'city',revision:1,name:'云环都市',english:'SKYLINE DRIFT CIRCUIT',theme:'city',description:'连续反打 / 城市高架',width:24,shortcut:[3,5],anchors:[[0,-180,1.2],[0,-90,1.2],[0,0,1.2],[-45,90,1.2],[0,150,1.2],[-50,215,1.2],[5,280,1.2],[100,285,1.2],[145,225,1.2],[105,175,1.2],[175,130,1.2],[245,170,1.2],[295,110,1.2],[250,45,7],[150,0,18],[60,0,18],[-60,0,18],[-155,0,18],[-205,-60,18],[-170,-130,15],[-235,-185,7],[-180,-255,1.2],[-100,-275,1.2],[-40,-370,1.2],[55,-370,1.2],[150,-320,1.2],[185,-250,1.2],[140,-195,1.2],[100,-230,1.2],[70,-290,1.2],[30,-310,1.2],[0,-280,1.2],[0,-230,1.2]]}
 };
 for(const d of Object.values(definitions)){d.anchors.forEach(Object.freeze);Object.freeze(d.anchors);Object.freeze(d.shortcut);Object.freeze(d);}
 function get(id){if(!Object.prototype.hasOwnProperty.call(definitions,id))throw new Error('Unknown racing circuit: '+id);return definitions[id];}
 return {get,list:()=>Object.values(definitions)};
});
