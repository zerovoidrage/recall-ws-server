import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import dotenv from 'dotenv';

dotenv.config();

const PORT = process.env.PORT || 3001;
const AUTH_TOKEN = process.env.AUTH_TOKEN || 'default-secret-token';
const NEXTJS_WEBHOOK_URL = process.env.NEXTJS_WEBHOOK_URL || 'https://www.unifies.space/api/recall/ws-bridge';

// Создаём HTTP сервер для health checks
const httpServer = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'ok', 
      connections: wss.clients.size,
      uptime: process.uptime()
    }));
    return;
  }
  
  res.writeHead(404);
  res.end('Not found');
});

// Создаём WebSocket сервер
const wss = new WebSocketServer({ 
  server: httpServer,
  path: '/ws'
});

console.log('🚀 Recall WebSocket Server starting...');
console.log(`📍 Port: ${PORT}`);
console.log(`🔐 Auth token configured: ${AUTH_TOKEN ? 'YES' : 'NO'}`);
console.log(`📡 Next.js webhook URL: ${NEXTJS_WEBHOOK_URL}`);

// Хранилище активных соединений по botId
const connections = new Map();

wss.on('connection', async (ws, req) => {
  const url = new URL(req.url, `ws://localhost:${PORT}`);
  const urlBotId = url.searchParams.get('botId');
  const token = url.searchParams.get('token');

  console.log(`\n🔌 New WebSocket connection attempt`);
  console.log(`   Bot ID (from URL): ${urlBotId || 'not provided - will extract from messages'}`);
  console.log(`   Token: ${token ? '✓' : '✗'}`);
  console.log(`   IP: ${req.socket.remoteAddress}`);

  // Валидация токена
  if (AUTH_TOKEN && token !== AUTH_TOKEN) {
    console.log(`❌ Invalid token, closing connection`);
    console.log(`   Expected: ${AUTH_TOKEN.substring(0, 20)}...`);
    console.log(`   Received: ${token ? token.substring(0, 20) + '...' : 'none'}`);
    console.log(`   Match: ${token === AUTH_TOKEN}`);
    ws.close(1008, 'Invalid token');
    return;
  }

  console.log(`✅ Connection authenticated`);
  
  // BotId будет извлечен из первого сообщения от Recall
  let botId = urlBotId;
  
  // Сохраняем соединение
  connections.set(botId, {
    ws,
    botId,
    connectedAt: new Date(),
    messagesReceived: 0
  });

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      
      // ЛОГИРУЕМ ВСЁ ЧТО ПРИХОДИТ
      console.log(`\n📨 RAW MESSAGE RECEIVED:`);
      console.log(JSON.stringify(message, null, 2));
      
      // Извлекаем botId из сообщения если его ещё нет
      if (!botId && (message.bot_id || message.data?.bot?.id)) {
        botId = message.bot_id || message.data?.bot?.id;
        console.log(`📋 Bot ID extracted from message: ${botId}`);
        
        // Обновляем соединение с правильным botId
        if (connections.has(urlBotId)) {
          const conn = connections.get(urlBotId);
          connections.delete(urlBotId);
          connections.set(botId, { ...conn, botId });
        } else {
          connections.set(botId, {
            ws,
            botId,
            connectedAt: new Date(),
            messagesReceived: 0
          });
        }
      }
      
      const conn = connections.get(botId);
      if (conn) conn.messagesReceived++;

      console.log(`📨 Message from bot ${botId || 'unknown'}:`, {
        type: message.type || message.event,
        hasWords: !!(message.words || message.data?.words),
        wordsCount: (message.words || message.data?.words || []).length
      });

      // Пересылаем данные в Next.js (только если есть botId)
      if (botId) {
        try {
          const response = await fetch(NEXTJS_WEBHOOK_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-WS-Bridge-Token': AUTH_TOKEN,
              'X-Bot-Id': botId
            },
            body: JSON.stringify({
              botId,
              ...message
            })
          });

          if (!response.ok) {
            console.error(`⚠️ Failed to forward to Next.js: ${response.status} ${response.statusText}`);
          } else {
            console.log(`✅ Forwarded to Next.js successfully`);
          }
        } catch (error) {
          console.error(`❌ Error forwarding to Next.js:`, error.message);
        }
      } else {
        console.warn(`⚠️ Received message but botId not yet known, skipping forward`);
      }

    } catch (error) {
      console.error(`❌ Error processing message from bot ${botId}:`, error.message);
    }
  });

  ws.on('close', (code, reason) => {
    const conn = connections.get(botId);
    console.log(`🔌 Connection closed for bot ${botId}:`, {
      code,
      reason: reason.toString(),
      messagesReceived: conn?.messagesReceived || 0,
      duration: conn ? Math.round((Date.now() - conn.connectedAt.getTime()) / 1000) + 's' : 'unknown'
    });
    connections.delete(botId);
  });

  ws.on('error', (error) => {
    console.error(`❌ WebSocket error for bot ${botId}:`, error.message);
  });

  // Отправляем приветственное сообщение (необязательно)
  ws.send(JSON.stringify({
    type: 'connected',
    botId,
    timestamp: new Date().toISOString()
  }));
});

wss.on('error', (error) => {
  console.error('❌ WebSocket Server error:', error);
});

// Запускаем сервер
httpServer.listen(PORT, () => {
  console.log(`\n✨ Server is running!`);
  console.log(`📡 WebSocket: ws://localhost:${PORT}/ws?botId=BOT_ID&token=TOKEN`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
  console.log(`\nWaiting for connections from Recall.ai...\n`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n🛑 SIGTERM received, closing server...');
  httpServer.close(() => {
    console.log('👋 Server closed');
    process.exit(0);
  });
});

// Periodic connection status
setInterval(() => {
  if (connections.size > 0) {
    console.log(`\n📊 Active connections: ${connections.size}`);
    for (const [botId, conn] of connections.entries()) {
      const uptime = Math.round((Date.now() - conn.connectedAt.getTime()) / 1000);
      console.log(`   - Bot ${botId}: ${conn.messagesReceived} messages, ${uptime}s uptime`);
    }
  }
}, 60000); // Every minute

