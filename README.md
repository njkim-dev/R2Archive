# R2Archive

R2Archive는 알투비트의 음악과 의상 정보를 모아 둔 개인 프로젝트입니다. 한국ㆍ중국 서버와 과거 피망 시절의 곡을 찾아보고, 게임 의상을 3D로 입어볼 수 있습니다.

**[R2Archive 바로가기](https://r2archive.com/)**

## 주요 기능

<table>
  <thead>
    <tr><th scope="col" width="100">메뉴</th><th scope="col">소개</th></tr>
  </thead>
  <tbody>
    <tr>
      <td>음악</td>
      <td>곡명이나 아티스트로 게임에 수록된 음악을 찾을 수 있습니다.</td>
    </tr>
    <tr>
      <td>상점</td>
      <td>아이템을 찾아 의상을 조합하고 3D로 착용 모습을 확인할 수 있습니다. 앙코르 상점에서는 현재 회차의 판매 목록과 세트 구성품을 볼 수 있습니다.</td>
    </tr>
    <tr>
      <td>마이홈</td>
      <td>로그인하면 캐릭터별로 소장 의상과 대표 착장을 관리하고, 마이홈 링크를 공유할 수 있습니다.</td>
    </tr>
  </tbody>
</table>

## 기술 구성

| 구분 | 사용 기술 |
|---|---|
| 프론트엔드 | React, Vite, Zustand |
| API ㆍ 데이터베이스 | Python, FastAPI, Uvicorn, PostgreSQL |
| 웹 ㆍ 배포 | Caddy, GitHub Actions, GitHub Container Registry, K3s |
