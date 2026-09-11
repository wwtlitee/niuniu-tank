/* 可选部署配置 v8.2.0。默认使用 PeerJS 公共信令；比赛由玩家浏览器计算。
 * 自建信令时设置 peerOptions: {host:'signal.example.com',port:443,path:'/race',secure:true}。
 * 自建 TURN 时在 peerOptions.config.iceServers 配置 STUN/TURN，凭据应使用短期授权。
 * 不要在网页中写入服务器管理员密码或长期 TURN 密钥。
 */
window.RACING_NETWORK_CONFIG=window.RACING_NETWORK_CONFIG||{peerOptions:{}};
