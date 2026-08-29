# ── Stage 1: Frontend build ───────────────────────────────────────────────
FROM node:22-slim AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./

# 프로덕션에서는 Caddy가 /api, /static 경로를 프록시하므로 origin은 비움
ARG VITE_API_URL=""
ENV VITE_API_URL=${VITE_API_URL}

RUN npm run build


# ── Stage 2: Backend + Caddy ──────────────────────────────────────────────
FROM python:3.12-slim

WORKDIR /app
ENV OMP_THREAD_LIMIT=1

# Caddy + Tesseract OCR
RUN apt-get update && apt-get upgrade -y && \
    apt-get install -y curl debian-keyring debian-archive-keyring apt-transport-https tesseract-ocr && \
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg && \
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list && \
    apt-get update && apt-get install -y caddy && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Poetry 설치 및 Python 의존성
RUN pip install poetry

COPY backend/pyproject.toml backend/poetry.lock* ./backend/
RUN python -m pip install --no-cache-dir --upgrade "pip>=26.1.2" "setuptools>=78.1.1" && \
    cd backend && poetry config virtualenvs.create false && \
    poetry install --only main --no-interaction && \
    python -m pip install --no-cache-dir --upgrade "msgpack>=1.2.1" "setuptools>=78.1.1" && \
    python -c "from importlib.metadata import version; assert tuple(map(int, version('msgpack').split('.'))) >= (1, 2, 1); assert tuple(map(int, version('setuptools').split('.'))) >= (78, 1, 1)"

# 백엔드 소스
COPY backend/ ./backend/

# 프론트엔드 빌드 결과물 → Caddy 서빙 디렉토리
COPY --from=frontend-builder /app/frontend/dist /srv

# Caddyfile
COPY Caddyfile /etc/caddy/Caddyfile
RUN chown root:caddy /etc/caddy/Caddyfile && chmod 0640 /etc/caddy/Caddyfile

# Match the owning NAS account so the only writable bind mount
# (record_screenshots) remains usable without running the service as root.
RUN useradd --uid 1026 --gid 100 --home-dir /app --no-create-home app \
    && usermod --append --groups caddy app \
    && chown -R app:users /app

EXPOSE 3000

USER app

CMD caddy start --config /etc/caddy/Caddyfile && \
    uvicorn main:app --app-dir /app/backend --host 127.0.0.1 --port 8000 \
      --limit-concurrency 64 --backlog 128 --timeout-keep-alive 5
