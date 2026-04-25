# ── Stage 1: Frontend build ───────────────────────────────────────────────
FROM node:20-slim AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm install

COPY frontend/ ./

# 프로덕션에서는 Caddy가 /api, /static 경로를 프록시하므로 origin은 비움
ARG VITE_API_URL=""
ENV VITE_API_URL=${VITE_API_URL}

RUN npm run build


# ── Stage 2: Backend + Caddy ──────────────────────────────────────────────
FROM python:3.12-slim

WORKDIR /app

# Caddy + Tesseract OCR 설치
RUN apt-get update && apt-get install -y curl debian-keyring debian-archive-keyring apt-transport-https tesseract-ocr && \
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg && \
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list && \
    apt-get update && apt-get install -y caddy && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Poetry 설치 및 Python 의존성
RUN pip install poetry

COPY backend/pyproject.toml backend/poetry.lock* ./backend/
RUN cd backend && poetry config virtualenvs.create false && \
    poetry install --only main --no-interaction

# 백엔드 소스
COPY backend/ ./backend/

# 프론트엔드 빌드 결과물 → Caddy 서빙 디렉토리
COPY --from=frontend-builder /app/frontend/dist /srv

# Caddyfile
COPY Caddyfile /etc/caddy/Caddyfile

EXPOSE 3000

CMD caddy start --config /etc/caddy/Caddyfile && \
    uvicorn main:app --app-dir /app/backend --host 127.0.0.1 --port 8000
