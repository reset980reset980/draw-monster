# 교실 대결 로비 서버 (미니PC)

- 주소: `wss://monster.xsw.kr/ws` (상태 확인 `https://monster.xsw.kr/health`)
- 위치: `~/projects/monster-lobby` · 서비스: `systemctl --user status monster-lobby`
- Caddy 경로: `monster-lobby-route.timer`가 1분마다 관리 API(127.0.0.1:2019)로 경로가 있는지 확인하고 없으면 추가 (Caddyfile은 건드리지 않음)
- 로그: `~/projects/monster-lobby/lobby.log`
- 업데이트: 새 `lobby-server.js`를 복사한 뒤 `systemctl --user restart monster-lobby`
