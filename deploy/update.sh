#!/usr/bin/env bash
# Обновление сайта до свежей версии из main. Запускается автоматически из GitHub (см. DEPLOY.md, «Автообновление»)
# или вручную на сервере: /opt/autoremhubsto/deploy/update.sh
set -euo pipefail
cd "$(dirname "$0")/.."

# один запуск за раз: если обновление уже идёт, ждём его
exec 9>/tmp/autoremhubsto-update.lock
flock 9

echo "== $(date '+%F %T') обновление"
git pull --ff-only
docker compose up -d --build
docker image prune -f >/dev/null

# ждём, пока сайт ответит (при запуске он ещё применяет изменения базы)
addr=$(docker compose port app 3000)
for _ in $(seq 1 60); do
  if curl -fsS -o /dev/null "http://$addr/login"; then
    echo "== готово: $(git log -1 --format='%h %s')"
    exit 0
  fi
  sleep 2
done
echo "!! сайт не ответил за 2 минуты" >&2
docker compose logs --tail 50 app >&2
exit 1
