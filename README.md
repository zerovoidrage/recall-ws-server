# Recall WebSocket Server

WebSocket сервер для приёма real-time транскрипции от Recall.ai и пересылки в Next.js приложение.

## Как это работает

```
Recall Bot → WebSocket (этот сервер) → HTTP POST → Next.js → EventEmitter → SSE → Frontend
```

1. **Recall подключается к этому WebSocket серверу** и отправляет транскрипцию в реальном времени
2. **Сервер валидирует токен** для безопасности
3. **Пересылает данные в Next.js** через HTTP POST на `/api/recall/ws-bridge`
4. **Next.js эмитит события** через EventEmitter
5. **Frontend получает через SSE** (`/api/recall/stream`)

## Установка локально (для тестирования)

```bash
cd recall-ws-server
npm install
cp env.example .env
# Отредактируй .env файл
npm start
```

## Переменные окружения

- `PORT` - Порт сервера (по умолчанию 3001)
- `AUTH_TOKEN` - Секретный токен для валидации (должен совпадать с `RECALL_WS_BRIDGE_TOKEN` в Next.js)
- `NEXTJS_WEBHOOK_URL` - URL Next.js endpoint (`https://www.unifies.space/api/recall/ws-bridge`)

## Деплой на Railway.app

### 1. Создай аккаунт на Railway

Зайди на https://railway.app и зарегистрируйся через GitHub.

### 2. Создай новый проект

1. Нажми **"New Project"**
2. Выбери **"Deploy from GitHub repo"**
3. Выбери репозиторий `unifies`
4. Railway автоматически найдёт `recall-ws-server` папку

### 3. Настрой переменные окружения

В Railway dashboard добавь переменные:

```
AUTH_TOKEN=ТВОЙ_СЕКРЕТНЫЙ_ТОКЕН_СЮДА
NEXTJS_WEBHOOK_URL=https://www.unifies.space/api/recall/ws-bridge
```

**Важно:** Сгенерируй надёжный `AUTH_TOKEN`:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 4. Получи публичный URL

После деплоя Railway даст тебе URL типа:
```
https://recall-ws-server-production-xxxx.up.railway.app
```

Твой WebSocket URL будет:
```
wss://recall-ws-server-production-xxxx.up.railway.app/ws
```

### 5. Обнови Next.js

Добавь в `.env.local` (и в Vercel Environment Variables):
```
RECALL_WS_SERVER_URL=wss://recall-ws-server-production-xxxx.up.railway.app/ws
RECALL_WS_BRIDGE_TOKEN=ТВОЙ_СЕКРЕТНЫЙ_ТОКЕН_СЮДА
```

## Health Check

Проверить что сервер работает:
```bash
curl https://your-railway-url.railway.app/health
```

Ответ:
```json
{
  "status": "ok",
  "connections": 0,
  "uptime": 123.45
}
```

## Мониторинг

В Railway dashboard можешь смотреть:
- Логи в реальном времени
- Использование ресурсов
- Метрики

## Безопасность

- ✅ Токен валидация на каждое подключение
- ✅ HTTPS/WSS через Railway (автоматические SSL сертификаты)
- ✅ Только POST запросы в Next.js с токеном в заголовках
- ✅ Валидация botId

## Troubleshooting

### Recall не может подключиться
- Проверь что URL правильный (`wss://...`)
- Проверь что токен в Recall конфиге совпадает с `AUTH_TOKEN`
- Проверь логи в Railway

### Данные не доходят до Next.js
- Проверь что `NEXTJS_WEBHOOK_URL` правильный
- Проверь что `RECALL_WS_BRIDGE_TOKEN` совпадает в обоих местах
- Проверь логи Next.js endpoint

### Соединение закрывается сразу
- Проверь токен
- Проверь что передаёшь `botId` в query params

