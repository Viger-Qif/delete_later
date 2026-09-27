#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
command -v docker >/dev/null || { echo "Docker не найден. Установите Docker Desktop или Docker Engine."; exit 1; }
docker info >/dev/null 2>&1 || { echo "Docker не запущен. Запустите Docker и повторите."; exit 1; }
[ -f .env ] || cp .env.docker.example .env
docker compose up --build -d
for _ in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:8000/api/health >/dev/null 2>&1; then
    echo "Приложение готово: http://127.0.0.1:8000/"
    if command -v xdg-open >/dev/null; then xdg-open http://127.0.0.1:8000/ >/dev/null 2>&1 || true; fi
    exit 0
  fi
  sleep 2
docker compose ps
docker compose logs --tail=120 app
exit 1
