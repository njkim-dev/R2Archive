# R2Music Archive

리듬 게임 **알투비트(R2Beat)** 의 비공식 음악 아카이브.
곡 목록을 빠르게 탐색하고, 곡별 체감 난이도를 함께 쌓아가는 팬 프로젝트입니다.

🔗 **Live**: https://music.r2archive.com

## 주요 기능

- **곡 카탈로그** — 난이도(별/달/해), BPM, 아티스트, 변속 여부 등으로 즉시 필터링
- **체감 난이도 투표** — 0.5 단위로 곡별 체감 레벨을 매기고 의견을 남길 수 있음
- **성과 기록 / 랭킹** — 스크린샷을 등록하여 본인 성과 랭킹에 표출 가능
- **공개 범위 선택** — 기록은 공개 / 익명 / 비공개 중 선택
- **소셜 로그인** — 카카오 / 네이버 / Google OAuth (개인정보는 저장하지 않음)

## 기술 스택

- **Backend**: FastAPI + PostgreSQL, JWT 세션 쿠키, slowapi rate limiter
- **Frontend**: React + Vite, Zustand, react-window, Fuse.js
- **배포**: Docker + Caddy (HTTPS)
