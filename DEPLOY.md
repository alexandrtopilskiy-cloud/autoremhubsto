# Как запустить AutoRemHub на сервере

Инструкция для VPS с Ubuntu 22.04 или 24.04. На сервере работают три контейнера Docker: база PostgreSQL, само приложение и Caddy, который выдаёт HTTPS-сертификат и отдаёт сайт наружу.

Что понадобится:

- VPS с Ubuntu, минимум 2 ГБ памяти и 20 ГБ диска;
- IP-адрес сервера и пароль root (их присылает хостинг);
- домен, если он есть. Если домена нет, подойдёт бесплатный адрес вида `81-161-118-132.sslip.io`: это IP сервера, где точки заменены дефисами. Он сразу указывает на ваш сервер, и для него тоже выдаётся HTTPS.

HTTPS обязателен: без него браузер не сохранит вход в систему.

## 1. Подключиться к серверу

На компьютере откройте терминал (Windows: «PowerShell», macOS: «Терминал») и введите, подставив свой IP:

```bash
ssh root@81.161.118.132
```

На вопрос `Are you sure you want to continue connecting` ответьте `yes`, затем введите пароль root (при вводе он не отображается, это нормально).

Все следующие команды вводятся уже на сервере.

## 2. Установить Docker и git

```bash
apt update
apt install -y docker.io docker-compose-v2 git
```

Docker Hub часто недоступен с российских серверов, поэтому сразу укажите зеркало:

```bash
mkdir -p /etc/docker
echo '{ "registry-mirrors": ["https://mirror.gcr.io"] }' > /etc/docker/daemon.json
systemctl restart docker
```

Проверка: `docker compose version` должна напечатать номер версии.

## 3. Скачать проект

```bash
cd /opt
git clone https://github.com/alexandrtopilskiy-cloud/autoremhubsto.git
cd autoremhubsto
```

Если репозиторий закрытый, git спросит логин и пароль: введите логин GitHub, а вместо пароля токен, созданный на https://github.com/settings/tokens (Fine-grained token с правом чтения Contents этого репозитория).

## 4. Настроить адрес и пароль базы

```bash
cp deploy/env.example .env
nano .env
```

В редакторе поменяйте две строки:

```
DOMAIN=81-161-118-132.sslip.io
POSTGRES_PASSWORD=придумайте-длинный-пароль-из-латинских-букв-и-цифр
```

Если есть свой домен, впишите его в `DOMAIN`, а у регистратора домена создайте A-запись, указывающую на IP сервера.

Сохранить и выйти: `Ctrl+O`, `Enter`, `Ctrl+X`.

## 5. Запустить

```bash
docker compose up -d --build
```

Первая сборка идёт 5–10 минут. Когда команда закончится, проверьте, что все три контейнера работают (`Up`):

```bash
docker compose ps
```

Если в списке нет `caddy`, а `docker compose logs caddy` пуст, порты 80/443 на сервере уже занимает другая программа (обычно nginx). Тогда переходите к разделу «Если на сервере уже есть nginx».

Откройте в браузере `https://81-161-118-132.sslip.io` (или свой домен). Сертификат выдаётся при первом заходе, поэтому первая загрузка может занять до минуты.

## 6. Первый вход

Откройте «Регистрация» и создайте свою СТО: компания, ваше имя, почта и пароль. Это ваш кабинет владельца, сотрудников добавляете уже внутри.

Демо-данные на рабочем сервере не нужны. Для пробного стенда их можно добавить командой `docker compose exec app npm run db:seed` (вход `demo@autoremhub.local` / `demo12345`), но тогда смените этот пароль.

## Если на сервере уже есть nginx

Проверка: `ss -tlnp | grep -E ':80 |:443 '`. Если в ответе `nginx`, сайт подключается через него, а Caddy не нужен.

1. В файле `.env` удалите строку `COMPOSE_PROFILES=caddy` (`nano .env`) и перезапустите:

   ```bash
   docker compose rm -sf caddy
   docker compose up -d
   ```

   Приложение теперь доступно nginx по адресу `127.0.0.1:3100` (снаружи этот порт закрыт). Если 3100 уже занят, добавьте в `.env` строку `APP_PORT=3200` и используйте этот номер ниже.

2. Создайте настройку сайта для nginx, подставив свой адрес в `server_name`:

   ```bash
   cat > /etc/nginx/sites-available/autoremhub <<'EOF'
   server {
       listen 80;
       server_name 81-161-118-132.sslip.io;
       client_max_body_size 12m;
       location / {
           proxy_pass http://127.0.0.1:3100;
           proxy_set_header Host $http_host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   EOF
   ln -s /etc/nginx/sites-available/autoremhub /etc/nginx/sites-enabled/
   nginx -t && systemctl reload nginx
   ```

3. Получите HTTPS-сертификат (certbot сам допишет его в настройку и будет продлевать):

   ```bash
   apt install -y certbot python3-certbot-nginx
   certbot --nginx -d 81-161-118-132.sslip.io
   ```

   На вопрос про почту введите свою, на условия ответьте `Y`.

После этого сайт открывается по `https://81-161-118-132.sslip.io`.

## Обновление до новой версии

```bash
cd /opt/autoremhubsto
git pull
docker compose up -d --build
```

Новые таблицы и поля в базе создаются автоматически при запуске. Данные сохраняются.

## Резервная копия базы

Сделать копию (все данные и вложенные файлы хранятся в базе):

```bash
cd /opt/autoremhubsto
docker compose exec -T db pg_dump -U sto sto | gzip > backup-$(date +%F).sql.gz
```

Скачайте файл к себе командой на своём компьютере: `scp root@81.161.118.132:/opt/autoremhubsto/backup-*.sql.gz .`

Чтобы копия делалась каждую ночь в 3:00 и хранилась 14 дней, выполните на сервере:

```bash
mkdir -p /opt/backups
( crontab -l 2>/dev/null; echo '0 3 * * * cd /opt/autoremhubsto && docker compose exec -T db pg_dump -U sto sto | gzip > /opt/backups/sto-$(date +\%F).sql.gz && find /opt/backups -name "sto-*.sql.gz" -mtime +14 -delete' ) | crontab -
```

Восстановить из копии (текущие данные будут заменены):

```bash
docker compose stop app
docker compose exec -T db psql -U sto -d postgres -c "DROP DATABASE sto" -c "CREATE DATABASE sto"
gunzip -c backup-2026-10-20.sql.gz | docker compose exec -T db psql -U sto sto
docker compose start app
```

## Если что-то не работает

- Посмотреть ошибки приложения: `docker compose logs app --tail 50`
- Ошибки HTTPS и сертификата: `docker compose logs caddy --tail 50`. Частые причины: домен ещё не указывает на сервер, или у хостинга закрыты порты 80 и 443 (откройте их в панели хостинга или командой `ufw allow 80,443/tcp`, если включён ufw).
- Перезапустить всё: `docker compose restart`
