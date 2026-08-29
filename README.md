# R2Archive

알투비트 곡 정보를 한곳에서 찾아보기 위해 만든 개인 프로젝트입니다.
한국 서버 곡을 중심으로 과거 피망 곡과 중국 XYX 서버 곡도 함께 정리하고 있습니다.

## 서비스 주소

- 한국 서버: https://music.r2archive.com
- 중국 서버: https://xyx.r2archive.com

곡명이나 아티스트로 검색할 수 있으며, 난이도와 BPM 등으로 목록을 필터링할 수 있습니다.
곡을 선택하면 BPM, 콤보, 다른 난이도 및 다른 서버의 동일한 곡 정보를 확인할 수 있습니다.

## 사용 기술

- Frontend: React, Vite, Zustand
- Backend: FastAPI, PostgreSQL/PostGIS
- Web: Caddy, Uvicorn
