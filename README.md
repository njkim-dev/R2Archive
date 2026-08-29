# R2Archive

알투비트 곡 정보를 한곳에서 찾아보기 위해 만든 개인 프로젝트입니다.
현재 서비스 중인 곡과 과거 피망에서 서비스했던 곡을 함께 정리하고 있습니다.

## 서비스 주소

- https://music.r2archive.com

곡명이나 아티스트로 검색할 수 있으며, 난이도와 BPM 등으로 목록을 필터링할 수 있습니다.
곡을 선택하면 BPM, 콤보와 다른 난이도의 곡 정보를 확인할 수 있습니다.

## 사용 기술

- Frontend: React, Vite, Zustand
- Backend: FastAPI, PostgreSQL/PostGIS
- Web: Caddy, Uvicorn
- Deployment: Kubernetes(k3s), GHCR
