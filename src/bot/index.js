require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const http = require('http');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const ADMIN_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;
const isAdmin = (ctx) => String(ctx.from.id) === String(ADMIN_ID);
const PORT = process.env.PORT || 3000;
const WEBHOOK_URL = process.env.WEBHOOK_URL;

// ===== МОДЕЛИ =====
const ALL_MODELS = {
  sonnet:   'anthropic/claude-sonnet-4-5',
  haiku:    'anthropic/claude-haiku-4-5',
  gpt4o:    'openai/gpt-4o',
  gpt:      'openai/gpt-4o-mini',
  deepseek: 'deepseek/deepseek-chat',
  grok:     'x-ai/grok-2-1212',
  mistral:  'mistralai/mistral-small-3.1-24b-instruct:free',
  llama:    'meta-llama/llama-3.2-3b-instruct:free'
};

const DEFAULT_MODELS = [
  ALL_MODELS.sonnet,
  ALL_MODELS.haiku,
  ALL_MODELS.gpt,
  ALL_MODELS.mistral,
  ALL_MODELS.llama
];

// ===== СОСТОЯНИЕ =====
const conversationHistory = {};
const userAgent = {};
const userMode = {};
const reminders = [];
const stats = { messages: 0, voice: 0, photos: 0, searches: 0, start_time: Date.now() };
const lastMessage = {};
const RATE_LIMIT_MS = 2000;

// ===== РЕЖИМЫ =====
const MODES = {
  auto:       'Авто — SUS сам выбирает стиль по контексту',
  assistant:  'Ассистент — универсальная помощь',
  critic:     'Критик — риски, слабые места, честность',
  coder:      'Разработчик — код, архитектура, дебаг',
  strategist: 'Стратег — долгосрочные цели, рынок',
  writer:     'Автор — тексты, посты, документы',
  analyst:    'Аналитик — данные, цифры, выводы'
};

const MODE_PROMPTS = {
  auto:       '',
  assistant:  'Ты универсальный ассистент. Помогаешь с любой задачей кратко и по делу.',
  critic:     'Ты жёсткий критик. Находишь все слабые места и риски. Не льсти. Говори прямо.',
  coder:      'Ты senior разработчик. Пишешь чистый код, объясняешь решения, находишь баги.',
  strategist: 'Ты стратег. Думаешь системно, видишь картину целиком, даёшь конкретные рекомендации.',
  writer:     'Ты профессиональный автор. Пишешь убедительно и структурированно.',
  analyst:    'Ты аналитик. Работаешь с цифрами, строишь логику, делаешь выводы на фактах.'
};

// ===== АВТО-ОПРЕДЕЛЕНИЕ РЕЖИМА =====
function detectMode(text) {
  const t = text.toLowerCase();
  if (t.match(/код|code|функци|баг|ошибк|python|javascript|sql|api|deploy|программ/)) return 'coder';
  if (t.match(/риск|уязвим|проблем|опасн|слабое|критик|аудит|провер/)) return 'critic';
  if (t.match(/стратег|план|рынок|конкурент|позицион|долгосроч|масштаб/)) return 'strategist';
  if (t.match(/напиши|текст|пост|статья|описани|контент|копи|перепиши/)) return 'writer';
  if (t.match(/анализ|данные|статистик|метрик|сравн|процент|цифр/)) return 'analyst';
  return 'assistant';
}

// ===== СИСТЕМНЫЙ ПРОМПТ =====
const BASE_PROMPT = 'Ты SUS (Strategic Universal System) — персональный AI ассистент Архитектора.\n\n' +
'ЛИЧНОСТЬ:\n' +
'- Умный, честный, прямой партнёр и советник\n' +
'- Критически мыслишь, не боишься указывать на риски\n' +
'- Помогаешь с ЛЮБОЙ задачей — не только с LIBERTAS\n' +
'- НЕ тяни каждый ответ к LIBERTAS если вопрос не об этом\n\n' +
'ЯЗЫК:\n' +
'- ВАЖНО: отвечай на том же языке на котором написал пользователь\n' +
'- Русский → русский, English → English\n' +
'- Будь краток и по делу без лишней воды\n\n' +
'КОНТЕКСТ О ВЛАДЕЛЬЦЕ (Архитекторе):\n' +
'- Строит экосистему LIBERTAS — Web3 на Solana L3\n' +
'- VERITAS метавселенная + Veritum Passport биометрия\n' +
'- Токен AURA SPL, эмиссия 1 млрд\n' +
'- NFT тиры: Explorer $5, Pioneer $25, Builder $75, Visionary $250, Sovereign $1500\n' +
'- 5 бирж: Труда, Активов, Реального сектора, Рекламы, P2P\n' +
'- Реферал: 4 уровня 10/5/2/1%\n' +
'- Veritas Studio — AI агентская студия для людей и бизнеса\n' +
'- Digital Court — система цифрового правосудия\n' +
'- Veritum Passport — биометрическая идентификация\n' +
'- AI оркестр: Claude, DeepSeek, Perplexity, Grok, Mistral, Gemini\n' +
'- Roadmap: Q1 2026 SUS, Q2 NFT, Q3 Aureon devnet, Q4 mainnet\n' +
'- Проект создаётся для людей, не только для себя\n' +
'- Безопасность: RLS на Supabase включён, ключи в Railway Variables\n' +
'- Стек: Node.js, Telegraf, Supabase PostgreSQL, Railway, OpenRouter\n\n' +
'ПРАВИЛА:\n' +
'- Упоминай LIBERTAS только когда реально уместно\n' +
'- Давай честную критику, не только позитив\n' +
'- Если видишь риск — говори прямо\n' +
'- Используй историю разговора и базу знаний для контекста\n' +
'- Не повторяй одно и то же в разных формулировках';

function getSystemPrompt(userId, autoMode) {
  const mode = autoMode || userMode[userId] || 'auto';
  const modeExtra = (mode !== 'auto' && MODE_PROMPTS[mode])
    ? '\n\nТЕКУЩИЙ РЕЖИМ: ' + MODE_PROMPTS[mode] : '';
  return BASE_PROMPT + modeExtra;
}

function getModels(userId) {
  const agent = userAgent[userId];
  if (agent && ALL_MODELS[agent]) return [ALL_MODELS[agent], ALL_MODELS.sonnet, ALL_MODELS.haiku];
  return DEFAULT_MODELS;
}

function addToHistory(userId, role, content) {
  if (!conversationHistory[userId]) conversationHistory[userId] = [];
  conversationHistory[userId].push({ role: role, content: String(content).substring(0, 2000) });
  if (conversationHistory[userId].length > 20) {
    conversationHistory[userId] = conversationHistory[userId].slice(-20);
  }
}

function getHistory(userId) { return conversationHistory[userId] || []; }

// ===== НАПОМИНАНИЯ =====
setInterval(async function() {
  const now = Date.now();
  for (let i = reminders.length - 1; i >= 0; i--) {
    if (now >= reminders[i].time) {
      try {
        await bot.telegram.sendMessage(reminders[i].userId, '⏰ *Напоминание:*\n' + reminders[i].text, { parse_mode: 'Markdown' });
      } catch (e) { console.log('reminder error:', e.message); }
      reminders.splice(i, 1);
    }
  }
}, 30000);

// ===== ЕЖЕНЕДЕЛЬНЫЙ ОТЧЁТ (каждое воскресенье в 20:00) =====
setInterval(async function() {
  const now = new Date();
  if (now.getDay() === 0 && now.getHours() === 20 && now.getMinutes() < 1) {
    try {
      const { data: tasks } = await supabase.from('tasks').select('*').order('created_at', { ascending: false }).limit(20);
      const done = tasks ? tasks.filter(function(t) { return t.status === 'done'; }) : [];
      const pending = tasks ? tasks.filter(function(t) { return t.status === 'pending'; }) : [];

      let msg = '📅 *ЕЖЕНЕДЕЛЬНЫЙ ОТЧЁТ SUS*\n\n';
      msg += '✅ Выполнено: ' + done.length + '\n';
      msg += '⏳ В очереди: ' + pending.length + '\n';
      msg += '💬 Сообщений за сессию: ' + stats.messages + '\n\n';

      if (pending.length) {
        msg += '*Приоритеты на неделю:*\n';
        pending.slice(0, 5).forEach(function(t) { msg += '• ' + t.description + '\n'; });
      }

      msg += '\n🎯 Рекомендация: сфокусируйся на 1-2 ключевых задачах.';
      await bot.telegram.sendMessage(ADMIN_ID, msg, { parse_mode: 'Markdown' });
    } catch (e) { console.log('weekly report error:', e.message); }
  }
}, 60000);

// ===== АВТОСОХРАНЕНИЕ ДИАЛОГОВ =====
async function autoSaveConversation(userId, userMsg, aiReply) {
  try {
    const isImportant = userMsg.length > 100 ||
      userMsg.match(/важно|запомни|ключевое|сохрани|критично|решение|план|идея|вывод/i);
    if (isImportant) {
      await supabase.from('knowledge').insert({
        content: '[Диалог] ' + userMsg.substring(0, 120) + ' → ' + aiReply.substring(0, 180),
        source: 'auto_dialog',
        created_at: new Date().toISOString()
      });
    }
  } catch (e) { console.log('autosave error:', e.message); }
}

// ===== ВЕБ-ПОИСК =====
async function webSearch(query) {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return null;
  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: key, query: query, search_depth: 'basic', max_results: 4 })
    });
    const data = await response.json();
    if (!data.results) return null;
    return data.results.map(function(r) {
      return '*' + r.title + '*\n' + r.content.substring(0, 250);
    }).join('\n\n');
  } catch (e) { return null; }
}

// ===== ВЫЗОВ AI =====
async function callAI(messages, models) {
  for (let i = 0; i < models.length; i++) {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + process.env.OPENROUTER_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ model: models[i], messages: messages })
      });
      const data = await response.json();
      const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if (text && text.length > 0) return { text: text, model: models[i].split('/')[1] };
    } catch (e) { continue; }
  }
  return null;
}

// ===== ОТПРАВКА ДЛИННЫХ СООБЩЕНИЙ =====
async function sendLong(ctx, text, options) {
  const opts = options || {};
  if (text.length <= 4096) {
    return ctx.reply(text, opts);
  }
  const chunks = [];
  let current = '';
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if ((current + lines[i] + '\n').length > 4000) {
      chunks.push(current);
      current = lines[i] + '\n';
    } else {
      current += lines[i] + '\n';
    }
  }
  if (current) chunks.push(current);
  for (let j = 0; j < chunks.length; j++) {
    await ctx.reply(chunks[j], opts);
  }
}

const mainMenu = Markup.keyboard([
  ['📊 Статус', '🧠 База знаний'],
  ['✅ Задача', '📋 Задачи'],
  ['🔑 Ключи', '🤖 Агенты'],
  ['🌳 Дерево', '📚 Знания'],
  ['❓ Помощь']
]).resize();

// ===== СТАРТ =====
bot.start((ctx) => {
  if (!isAdmin(ctx)) return ctx.reply('⛔ Access denied');
  conversationHistory[ctx.from.id] = [];
  ctx.reply(
    '🤖 *SUS ONLINE v6.1*\n\n' +
    'Архитектор, жду команд.\n' +
    '🧠 Мозг: Claude Sonnet 4.5\n' +
    '💾 Память: история + Supabase + автосохранение\n' +
    '🎭 Режим: Авто-определение\n' +
    '🔍 Поиск: /search [запрос]\n' +
    '📄 Документы: /analyze\n' +
    '💡 Идеи: /idea [тема]\n' +
    '📅 Отчёты: /summary /weekly\n\n' +
    '💬 Напиши что угодно — помогу!',
    { parse_mode: 'Markdown', ...mainMenu }
  );
});

// ===== СТАТУС =====
bot.hears('📊 Статус', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const { data } = await supabase.from('ecosystem_status').select('*').order('updated_at', { ascending: false });
  const items = data && data.length > 0 ? data : [
    { component: 'Aureon Network', progress: 33 },
    { component: 'VERITAS', progress: 25 },
    { component: 'Veritas Studio', progress: 30 },
    { component: 'AI SUS', progress: 98 },
    { component: 'NFT система', progress: 35 },
    { component: 'Digital Court', progress: 10 }
  ];
  let msg = '🌳 *LIBERTAS ECOSYSTEM:*\n\n';
  items.forEach(function(item) {
    const filled = Math.floor(item.progress / 10);
    const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
    msg += '*' + item.component + '*\n' + bar + ' ' + item.progress + '%\n\n';
  });
  const total = Math.round(items.reduce(function(s, i) { return s + i.progress; }, 0) / items.length);
  msg += '━━━━━━━━━━\n🌍 *ОБЩАЯ: ' + total + '%*';
  ctx.reply(msg, { parse_mode: 'Markdown' });
});

bot.hears('🧠 База знаний', (ctx) => {
  if (!isAdmin(ctx)) return;
  ctx.reply(
    '*LIBERTAS KNOWLEDGE BASE:*\n\n' +
    '🪙 AURA SPL токен Solana, эмиссия 1 млрд\n' +
    '🏆 NFT: Explorer $5 → Sovereign $1500\n' +
    '💰 Реферал: 4 уровня 10/5/2/1%\n' +
    '🏛 Биржи: Труда, Активов, Реального сектора, Рекламы, P2P\n' +
    '🤖 Агенты: Claude, DeepSeek, Perplexity, Grok, Mistral, Gemini',
    { parse_mode: 'Markdown' }
  );
});

bot.hears('🌳 Дерево', (ctx) => {
  if (!isAdmin(ctx)) return;
  ctx.reply(
    '*🌱 КОРНИ:* Aureon Network L3 ZK-Rollup Solana\n\n' +
    '*🪵 СТВОЛ:* VERITAS + Veritum Passport биометрия\n\n' +
    '*🌿 ВЕТВЬ #1:* Veritas Studio — AI агентская студия\n\n' +
    '*🌿 ВЕТВЬ #2:* AI SUS — ассистент Архитектора\n\n' +
    '*🍃 ЛИСТЬЯ:* Digital Court Libertas',
    { parse_mode: 'Markdown' }
  );
});

bot.hears('🤖 Агенты', (ctx) => {
  if (!isAdmin(ctx)) return;
  const cur = userAgent[ctx.from.id] || 'auto';
  ctx.reply(
    '*🤖 АГЕНТЫ SUS:*\n\n' +
    '• /agent sonnet — Claude Sonnet (умный)\n' +
    '• /agent haiku — Claude Haiku (быстрый)\n' +
    '• /agent gpt4o — GPT-4o (универсальный)\n' +
    '• /agent deepseek — DeepSeek (технический)\n' +
    '• /agent grok — Grok (стратегия)\n' +
    '• /agent auto — автовыбор\n\n' +
    'Текущий: *' + cur + '*\n\n' +
    'Прямой вопрос к модели: /ask [модель] [вопрос]',
    { parse_mode: 'Markdown' }
  );
});

bot.hears('🔑 Ключи', (ctx) => {
  if (!isAdmin(ctx)) return;
  const mode = userMode[ctx.from.id] || 'auto';
  const agent = userAgent[ctx.from.id] || 'auto';
  ctx.reply(
    '🔑 *СТАТУС СИСТЕМЫ:*\n\n' +
    'Supabase: ' + (process.env.SUPABASE_URL ? '✅' : '❌') + '\n' +
    'OpenRouter: ' + (process.env.OPENROUTER_API_KEY ? '✅' : '❌') + '\n' +
    'Helius: ' + (process.env.HELIUS_API_KEY ? '✅' : '❌') + '\n' +
    'Whisper: ' + (process.env.OPENAI_API_KEY ? '✅' : '❌') + '\n' +
    'Tavily поиск: ' + (process.env.TAVILY_API_KEY ? '✅' : '❌') + '\n' +
    'Webhook: ' + (WEBHOOK_URL ? '✅' : '⚠️ polling') + '\n\n' +
    'Режим: *' + mode + '*\n' +
    'Агент: *' + agent + '*\n' +
    'Сообщений: ' + stats.messages + '\n' +
    'Голосовых: ' + stats.voice + '\n' +
    'Фото: ' + stats.photos + '\n' +
    'Поисков: ' + stats.searches + '\n' +
    'Аптайм: ' + Math.floor((Date.now() - stats.start_time) / 3600000) + ' ч.',
    { parse_mode: 'Markdown' }
  );
});

// ===== ЗАДАЧИ =====
bot.hears('✅ Задача', (ctx) => {
  if (!isAdmin(ctx)) return;
  ctx.reply('Напиши: /task текст задачи');
});

bot.command('task', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const task = ctx.message.text.replace('/task', '').trim();
  if (!task) return ctx.reply('Напиши: /task описание задачи');
  await supabase.from('tasks').insert({ description: task, status: 'pending', created_at: new Date().toISOString() });
  ctx.reply('✅ *Задача сохранена:*\n"' + task + '"', { parse_mode: 'Markdown' });
});

bot.hears('📋 Задачи', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const { data } = await supabase.from('tasks').select('*').order('created_at', { ascending: false }).limit(15);
  let msg = '📋 *ЗАДАЧИ:*\n\n';
  if (!data || !data.length) {
    msg += '⏳ Generate Domain Railway\n⏳ Helius API ключ\n⏳ Phantom wallet devnet\n⏳ Юрисдикция компании\n⏳ UptimeRobot\n⏳ Tavily API ключ\n⏳ Whisper голосовые';
  } else {
    data.forEach(function(t) {
      const e = t.status === 'done' ? '✅' : t.status === 'in_progress' ? '🔄' : '⏳';
      msg += e + ' ' + t.description + '\n';
    });
  }
  ctx.reply(msg, { parse_mode: 'Markdown' });
});

bot.command('done', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const text = ctx.message.text.replace('/done', '').trim();
  if (!text) return ctx.reply('Напиши: /done текст задачи');
  const { data } = await supabase.from('tasks').select('id, description').limit(20);
  const task = data && data.find(function(t) {
    return t.description.toLowerCase().includes(text.toLowerCase());
  });
  if (!task) return ctx.reply('❌ Задача не найдена: "' + text + '"');
  await supabase.from('tasks').update({ status: 'done' }).eq('id', task.id);
  ctx.reply('✅ Выполнено: "' + task.description + '"');
});

// ===== ПАМЯТЬ =====
bot.command('learn', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const knowledge = ctx.message.text.replace('/learn', '').trim();
  if (!knowledge) return ctx.reply('Формат: /learn тема: содержание');
  const { error } = await supabase.from('knowledge').insert({
    content: knowledge, source: 'architect', created_at: new Date().toISOString()
  });
  if (error) return ctx.reply('❌ Ошибка: ' + error.message);
  ctx.reply('🧠 *Знание сохранено!*\n\n"' + knowledge.substring(0, 200) + '"', { parse_mode: 'Markdown' });
});

bot.command('recall', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const query = ctx.message.text.replace('/recall', '').trim();
  if (!query) return ctx.reply('Формат: /recall ключевое слово');
  const { data, error } = await supabase
    .from('knowledge').select('*').ilike('content', '%' + query + '%')
    .order('created_at', { ascending: false }).limit(5);
  if (error) return ctx.reply('❌ Ошибка: ' + error.message);
  if (!data || !data.length) return ctx.reply('❌ Не найдено: "' + query + '"');
  let msg = '🔍 *Найдено по "' + query + '":*\n\n';
  data.forEach(function(k, i) { msg += (i + 1) + '. ' + k.content.substring(0, 200) + '\n\n'; });
  ctx.reply(msg, { parse_mode: 'Markdown' });
});

bot.command('forget', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const query = ctx.message.text.replace('/forget', '').trim();
  if (!query) return ctx.reply('Формат: /forget ключевое слово');
  const { data } = await supabase.from('knowledge').select('id, content').ilike('content', '%' + query + '%').limit(1);
  if (!data || !data.length) return ctx.reply('❌ Не найдено: "' + query + '"');
  await supabase.from('knowledge').delete().eq('id', data[0].id);
  ctx.reply('🗑 *Удалено:*\n"' + data[0].content.substring(0, 100) + '"', { parse_mode: 'Markdown' });
});

bot.command('export', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const { data } = await supabase.from('knowledge').select('*').order('created_at', { ascending: false });
  if (!data || !data.length) return ctx.reply('База знаний пуста');
  let msg = '📤 *БАЗА ЗНАНИЙ (' + data.length + ' записей):*\n\n';
  data.forEach(function(k, i) { msg += (i + 1) + '. [' + (k.source || 'architect') + '] ' + k.content.substring(0, 150) + '\n\n'; });
  await sendLong(ctx, msg, { parse_mode: 'Markdown' });
});

bot.hears('📚 Знания', (ctx) => {
  if (!isAdmin(ctx)) return;
  ctx.reply(
    '📚 *ПАМЯТЬ SUS:*\n\n' +
    '/learn тема: текст — сохранить\n' +
    '/recall слово — найти\n' +
    '/forget слово — удалить\n' +
    '/export — выгрузить всё\n' +
    '/clear — очистить историю чата',
    { parse_mode: 'Markdown' }
  );
});

bot.command('clear', (ctx) => {
  if (!isAdmin(ctx)) return;
  conversationHistory[ctx.from.id] = [];
  ctx.reply('🗑 История разговора очищена. Начинаем с чистого листа.');
});

// ===== АГЕНТ =====
bot.command('agent', (ctx) => {
  if (!isAdmin(ctx)) return;
  const agent = ctx.message.text.replace('/agent', '').trim().toLowerCase();
  if (!agent) return ctx.reply('Напиши /agent [имя]: sonnet, haiku, gpt4o, deepseek, grok, auto');
  if (agent === 'auto') {
    delete userAgent[ctx.from.id];
    return ctx.reply('🔄 Агент: автовыбор (Claude Sonnet)');
  }
  if (!ALL_MODELS[agent]) return ctx.reply('❌ Доступны: sonnet, haiku, gpt4o, deepseek, grok, auto');
  userAgent[ctx.from.id] = agent;
  ctx.reply('✅ Агент переключён: *' + agent + '*', { parse_mode: 'Markdown' });
});

// ===== ПРЯМОЙ ВОПРОС К МОДЕЛИ =====
bot.command('ask', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const args = ctx.message.text.replace('/ask', '').trim();
  if (!args) return ctx.reply('Формат: /ask [модель] [вопрос]\nПример: /ask deepseek напиши Rust функцию');
  const parts = args.split(' ');
  const modelName = parts[0].toLowerCase();
  const question = parts.slice(1).join(' ');
  if (!question) return ctx.reply('Укажи вопрос после названия модели');
  if (!ALL_MODELS[modelName]) return ctx.reply('❌ Доступны: sonnet, haiku, gpt4o, gpt, deepseek, grok, mistral');
  await ctx.reply('🤖 Спрашиваю *' + modelName + '*...', { parse_mode: 'Markdown' });
  const result = await callAI(
    [{ role: 'system', content: BASE_PROMPT }, { role: 'user', content: question }],
    [ALL_MODELS[modelName]]
  );
  if (result) {
    await sendLong(ctx, result.text + '\n\n_(' + result.model + ')_', { parse_mode: 'Markdown' });
  } else {
    ctx.reply('❌ Модель ' + modelName + ' не ответила');
  }
});

// ===== РЕЖИМ =====
bot.command('mode', (ctx) => {
  if (!isAdmin(ctx)) return;
  const mode = ctx.message.text.replace('/mode', '').trim().toLowerCase();
  if (!mode) {
    const cur = userMode[ctx.from.id] || 'auto';
    let msg = '🎭 *Режимы SUS:*\n\n';
    Object.keys(MODES).forEach(function(m) {
      msg += (m === cur ? '✅ ' : '') + '/mode ' + m + '\n' + MODES[m] + '\n\n';
    });
    return ctx.reply(msg, { parse_mode: 'Markdown' });
  }
  if (!MODES[mode]) return ctx.reply('❌ Доступны: auto, assistant, critic, coder, strategist, writer, analyst');
  userMode[ctx.from.id] = mode;
  conversationHistory[ctx.from.id] = [];
  ctx.reply('✅ Режим: *' + mode + '*\n' + MODES[mode] + '\n\nИстория очищена.', { parse_mode: 'Markdown' });
});

// ===== НАПОМИНАНИЯ =====
bot.command('remind', (ctx) => {
  if (!isAdmin(ctx)) return;
  const text = ctx.message.text.replace('/remind', '').trim();
  if (!text) return ctx.reply('Форматы:\n/remind 30m текст\n/remind 2h текст\n/remind 1d текст');
  const parts = text.split(' ');
  const timeStr = parts[0].toLowerCase();
  const reminder = parts.slice(1).join(' ');
  if (!reminder) return ctx.reply('Укажи текст напоминания после времени');
  let ms = 0;
  if (timeStr.endsWith('m')) ms = parseInt(timeStr) * 60 * 1000;
  else if (timeStr.endsWith('h')) ms = parseInt(timeStr) * 60 * 60 * 1000;
  else if (timeStr.endsWith('d')) ms = parseInt(timeStr) * 24 * 60 * 60 * 1000;
  else return ctx.reply('❌ Формат: 30m, 2h, 1d');
  if (isNaN(ms) || ms <= 0) return ctx.reply('❌ Некорректное время');
  reminders.push({ userId: ctx.from.id, text: reminder, time: Date.now() + ms });
  const when = new Date(Date.now() + ms).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  ctx.reply('⏰ Напомню около ' + when + ':\n"' + reminder + '"');
});

bot.command('reminders', (ctx) => {
  if (!isAdmin(ctx)) return;
  const myReminders = reminders.filter(function(r) { return String(r.userId) === String(ctx.from.id); });
  if (!myReminders.length) return ctx.reply('Нет активных напоминаний');
  let msg = '⏰ *Активные напоминания:*\n\n';
  myReminders.forEach(function(r, i) {
    const when = new Date(r.time).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    msg += (i + 1) + '. ' + when + ' — ' + r.text + '\n';
  });
  ctx.reply(msg, { parse_mode: 'Markdown' });
});

// ===== ВЕБ-ПОИСК =====
bot.command('search', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const query = ctx.message.text.replace('/search', '').trim();
  if (!query) return ctx.reply('Формат: /search твой запрос');
  if (!process.env.TAVILY_API_KEY) {
    return ctx.reply('❌ Требуется TAVILY_API_KEY\ntavily.com — 1000 запросов бесплатно\nДобавь в Railway Variables.');
  }
  stats.searches++;
  await ctx.reply('🔍 Ищу: "' + query + '"...');
  const results = await webSearch(query);
  if (!results) return ctx.reply('❌ Поиск не дал результатов');
  const result = await callAI([
    { role: 'system', content: 'Кратко изложи ключевые факты из поисковых результатов. Отвечай на языке запроса.' },
    { role: 'user', content: 'Запрос: ' + query + '\n\nРезультаты поиска:\n' + results }
  ], DEFAULT_MODELS);
  if (result) {
    await sendLong(ctx, '🔍 *"' + query + '":*\n\n' + result.text, { parse_mode: 'Markdown' });
  } else {
    await sendLong(ctx, '📋 *Найдено:*\n\n' + results, { parse_mode: 'Markdown' });
  }
});

// ===== АНАЛИЗ ДОКУМЕНТОВ =====
bot.command('analyze', async (ctx) => {
  if (!isAdmin(ctx)) return;
  ctx.reply(
    '📄 *Анализ документов:*\n\n' +
    'Отправь файл или текст с командой /analyze в подписи.\n\n' +
    'Также можешь:\n' +
    '1. Скопировать текст и написать мне прямо\n' +
    '2. Отправить фото документа\n' +
    '3. Написать /analyze и вставить текст ниже\n\n' +
    '*Пример:* /analyze Проанализируй этот договор:\n[текст договора...]',
    { parse_mode: 'Markdown' }
  );
  const textAfterCmd = ctx.message.text.replace('/analyze', '').trim();
  if (textAfterCmd.length > 50) {
    await ctx.reply('📄 Анализирую...');
    const result = await callAI([
      { role: 'system', content: BASE_PROMPT + '\nПроанализируй документ детально. Выдели ключевые пункты, риски, рекомендации.' },
      { role: 'user', content: textAfterCmd }
    ], DEFAULT_MODELS);
    if (result) {
      await sendLong(ctx, result.text + '\n\n_(' + result.model + ')_', { parse_mode: 'Markdown' });
    }
  }
});

// ===== ОБРАБОТКА ДОКУМЕНТОВ/ФАЙЛОВ =====
bot.on('document', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const doc = ctx.message.document;
  const caption = ctx.message.caption || '';
  if (doc.mime_type === 'text/plain' || doc.file_name.endsWith('.txt') || doc.file_name.endsWith('.md')) {
    await ctx.reply('📄 Читаю файл: ' + doc.file_name);
    try {
      const fileLink = await ctx.telegram.getFileLink(doc.file_id);
      const response = await fetch(fileLink.href);
      const text = await response.text();
      const truncated = text.substring(0, 4000);
      const prompt = caption || 'Проанализируй этот документ. Выдели главное, риски, выводы.';
      const result = await callAI([
        { role: 'system', content: BASE_PROMPT },
        { role: 'user', content: prompt + '\n\nСодержимое файла "' + doc.file_name + '":\n\n' + truncated }
      ], DEFAULT_MODELS);
      if (result) {
        await sendLong(ctx, '📄 *Анализ "' + doc.file_name + '":*\n\n' + result.text + '\n\n_(' + result.model + ')_', { parse_mode: 'Markdown' });
      }
    } catch (e) {
      ctx.reply('❌ Ошибка чтения файла: ' + e.message);
    }
  } else {
    ctx.reply('📎 Файл получен: *' + doc.file_name + '*\nПоддерживаются .txt и .md файлы для анализа.', { parse_mode: 'Markdown' });
  }
});

// ===== ИДЕИ =====
bot.command('idea', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const topic = ctx.message.text.replace('/idea', '').trim();
  if (!topic) return ctx.reply('Формат: /idea тема\nПример: /idea монетизация Veritas Studio');
  await ctx.reply('💡 Генерирую идеи: "' + topic + '"...');
  const result = await callAI([
    {
      role: 'system',
      content: BASE_PROMPT + '\nСгенерируй ровно 5 конкретных идей. Каждая: заголовок, описание 2-3 предложения, оценка потенциала (🔴 низкий / 🟡 средний / 🟢 высокий).'
    },
    { role: 'user', content: 'Придумай 5 идей для: ' + topic }
  ], DEFAULT_MODELS);
  if (result) {
    await sendLong(ctx, '💡 *Идеи: "' + topic + '":*\n\n' + result.text + '\n\n_(' + result.model + ')_', { parse_mode: 'Markdown' });
    await supabase.from('knowledge').insert({
      content: 'Идеи по теме "' + topic + '": ' + result.text.substring(0, 300),
      source: 'idea_generation',
      created_at: new Date().toISOString()
    });
  } else {
    ctx.reply('❌ Не удалось сгенерировать идеи');
  }
});

// ===== ИТОГ ДНЯ =====
bot.command('summary', async (ctx) => {
  if (!isAdmin(ctx)) return;
  await ctx.reply('📋 Составляю итог...');
  const { data: tasks } = await supabase.from('tasks').select('*').order('created_at', { ascending: false }).limit(10);
  const { data: knowledge } = await supabase.from('knowledge').select('content, source').order('created_at', { ascending: false }).limit(8);
  const done = tasks ? tasks.filter(function(t) { return t.status === 'done'; }) : [];
  const pending = tasks ? tasks.filter(function(t) { return t.status === 'pending'; }) : [];

  let msg = '📊 *ИТОГ ДНЯ — SUS v6.1*\n\n';
  msg += '✅ *Выполнено (' + done.length + '):*\n';
  if (done.length) { done.slice(0, 5).forEach(function(t) { msg += '• ' + t.description + '\n'; }); }
  else { msg += '• Нет\n'; }
  msg += '\n⏳ *В очереди (' + pending.length + '):*\n';
  if (pending.length) { pending.slice(0, 5).forEach(function(t) { msg += '• ' + t.description + '\n'; }); }
  else { msg += '• Очередь пуста\n'; }
  msg += '\n🧠 *Последние знания:*\n';
  if (knowledge && knowledge.length) {
    knowledge.slice(0, 4).forEach(function(k) {
      msg += '• [' + (k.source || 'arch') + '] ' + k.content.substring(0, 80) + '\n';
    });
  }
  msg += '\n📈 *Статистика сессии:*\n';
  msg += '• Сообщений: ' + stats.messages + '\n';
  msg += '• Голосовых: ' + stats.voice + '\n';
  msg += '• Поисков: ' + stats.searches + '\n';
  msg += '• Аптайм: ' + Math.floor((Date.now() - stats.start_time) / 3600000) + ' ч.';
  await sendLong(ctx, msg, { parse_mode: 'Markdown' });
});

// ===== ЕЖЕНЕДЕЛЬНЫЙ ОТЧЁТ (вручную) =====
bot.command('weekly', async (ctx) => {
  if (!isAdmin(ctx)) return;
  await ctx.reply('📅 Составляю недельный отчёт...');
  const { data: tasks } = await supabase.from('tasks').select('*').order('created_at', { ascending: false }).limit(30);
  const done = tasks ? tasks.filter(function(t) { return t.status === 'done'; }) : [];
  const pending = tasks ? tasks.filter(function(t) { return t.status === 'pending'; }) : [];
  const { data: eco } = await supabase.from('ecosystem_status').select('*');

  const ecoItems = eco && eco.length > 0 ? eco : [
    { component: 'Aureon Network', progress: 33 }, { component: 'VERITAS', progress: 25 },
    { component: 'Veritas Studio', progress: 30 }, { component: 'AI SUS', progress: 98 },
    { component: 'NFT система', progress: 35 }, { component: 'Digital Court', progress: 10 }
  ];
  const totalProgress = Math.round(ecoItems.reduce(function(s, i) { return s + i.progress; }, 0) / ecoItems.length);

  const result = await callAI([
    { role: 'system', content: BASE_PROMPT + '\nТы составляешь еженедельный стратегический отчёт. Будь конкретным и честным.' },
    {
      role: 'user',
      content: 'Составь недельный отчёт LIBERTAS.\n\n' +
        'Выполнено задач: ' + done.length + '\n' +
        'Ожидает: ' + pending.length + '\n' +
        'Общий прогресс экосистемы: ' + totalProgress + '%\n\n' +
        'Задачи в очереди:\n' + pending.slice(0, 5).map(function(t) { return '- ' + t.description; }).join('\n') + '\n\n' +
        'Дай: 1) оценку прогресса 2) топ-3 приоритета на следующую неделю 3) главный риск 4) рекомендацию'
    }
  ], DEFAULT_MODELS);

  let msg = '📅 *ЕЖЕНЕДЕЛЬНЫЙ ОТЧЁТ LIBERTAS*\n\n';
  msg += '📊 Прогресс экосистемы: *' + totalProgress + '%*\n';
  msg += '✅ Выполнено задач: ' + done.length + '\n';
  msg += '⏳ В очереди: ' + pending.length + '\n\n';
  if (result) msg += result.text;
  await sendLong(ctx, msg, { parse_mode: 'Markdown' });
});

// ===== ПРОГРЕСС =====
bot.command('progress', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const args = ctx.message.text.replace('/progress', '').trim();
  if (!args) return ctx.reply('Формат: /progress Компонент: 75\nПример: /progress AI SUS: 98');
  const parts = args.split(':');
  if (parts.length < 2) return ctx.reply('Формат: /progress Компонент: число');
  const component = parts[0].trim();
  const progress = parseInt(parts[1].trim());
  if (isNaN(progress) || progress < 0 || progress > 100) return ctx.reply('❌ Число от 0 до 100');
  const { data: existing } = await supabase.from('ecosystem_status').select('id').ilike('component', component).limit(1);
  if (existing && existing.length > 0) {
    await supabase.from('ecosystem_status').update({ progress: progress, updated_at: new Date().toISOString() }).eq('id', existing[0].id);
  } else {
    await supabase.from('ecosystem_status').insert({ component: component, progress: progress, updated_at: new Date().toISOString() });
  }
  ctx.reply('📊 *Обновлено:*\n' + component + ' → ' + progress + '%', { parse_mode: 'Markdown' });
});

// ===== БЮДЖЕТ =====
bot.command('budget', async (ctx) => {
  if (!isAdmin(ctx)) return;
  try {
    const response = await fetch('https://openrouter.ai/api/v1/auth/key', {
      headers: { 'Authorization': 'Bearer ' + process.env.OPENROUTER_API_KEY }
    });
    const data = await response.json();
    const used = data.data && data.data.usage ? Number(data.data.usage).toFixed(4) : '0.0000';
    const limit = data.data && data.data.limit;
    ctx.reply(
      '💰 *БЮДЖЕТ OPENROUTER:*\n\n' +
      'Потрачено: $' + used + '\n' +
      'Лимит: ' + (limit === null || limit === undefined ? 'unlimited' : '$' + limit) + '\n\n' +
      '📊 *СТАТИСТИКА SUS:*\n' +
      'Сообщений: ' + stats.messages + '\n' +
      'Голосовых: ' + stats.voice + '\n' +
      'Поисков: ' + stats.searches + '\n' +
      'Напоминаний: ' + reminders.length + '\n' +
      'Аптайм: ' + Math.floor((Date.now() - stats.start_time) / 3600000) + ' ч.',
      { parse_mode: 'Markdown' }
    );
  } catch (e) { ctx.reply('❌ Ошибка: ' + e.message); }
});

// ===== ТЕСТ AI =====
bot.command('aitest', async (ctx) => {
  if (!isAdmin(ctx)) return;
  await ctx.reply('🔍 Тестирую все модели...');
  const testModels = ['sonnet', 'haiku', 'gpt', 'deepseek', 'mistral'];
  const results = [];
  for (let j = 0; j < testModels.length; j++) {
    const name = testModels[j];
    try {
      const start = Date.now();
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + process.env.OPENROUTER_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: ALL_MODELS[name], messages: [{ role: 'user', content: 'hi' }], max_tokens: 10 })
      });
      const data = await response.json();
      const ok = data.choices && data.choices[0] && data.choices[0].message;
      const ms = Date.now() - start;
      results.push((ok ? '✅' : '❌') + ' ' + name + ' (' + ms + 'ms)');
    } catch (e) {
      results.push('❌ ' + name + ': ' + e.message.substring(0, 25));
    }
  }
  ctx.reply('📊 *Статус моделей:*\n\n' + results.join('\n'), { parse_mode: 'Markdown' });
});

// ===== ПОМОЩЬ =====
bot.hears('❓ Помощь', (ctx) => {
  if (!isAdmin(ctx)) return;
  ctx.reply(
    '📖 *SUS v6.1 — ВСЕ КОМАНДЫ:*\n\n' +
    '*🧠 ПАМЯТЬ:*\n' +
    '/learn [тема: текст]\n' +
    '/recall [слово]\n' +
    '/forget [слово]\n' +
    '/export — вся база\n' +
    '/clear — очистить чат\n\n' +
    '*📝 ЗАДАЧИ:*\n' +
    '/task [текст]\n' +
    '/done [текст]\n\n' +
    '*🎭 НАСТРОЙКА:*\n' +
    '/mode — сменить режим\n' +
    '/agent — сменить модель\n' +
    '/ask [модель] [вопрос]\n\n' +
    '*🛠 ИНСТРУМЕНТЫ:*\n' +
    '/search [запрос] — веб\n' +
    '/analyze [текст] — документ\n' +
    '/idea [тема] — идеи\n' +
    '/remind [30m/2h/1d] [текст]\n' +
    '/reminders — список\n' +
    '/progress [Компонент: %]\n\n' +
    '*📊 ОТЧЁТЫ:*\n' +
    '/summary — итог дня\n' +
    '/weekly — недельный отчёт\n' +
    '/budget — расходы\n' +
    '/aitest — тест моделей\n\n' +
    '📎 Отправь .txt/.md файл → анализ\n' +
    '🖼 Отправь фото → анализ\n' +
    '🎤 Голосовое → транскрипция + ответ\n\n' +
    '💬 Любой текст → Claude Sonnet 4.5!',
    { parse_mode: 'Markdown' }
  );
});

// ===== ГОЛОСОВЫЕ =====
bot.on('voice', async (ctx) => {
  if (!isAdmin(ctx)) return;
  if (!process.env.OPENAI_API_KEY) {
    return ctx.reply('❌ Голосовые требуют OPENAI_API_KEY (Whisper API).\nДобавь в Railway Variables.');
  }
  stats.voice++;
  await ctx.reply('🎤 Распознаю речь...');
  try {
    const fileLink = await ctx.telegram.getFileLink(ctx.message.voice.file_id);
    const audioResponse = await fetch(fileLink.href);
    const audioBuffer = await audioResponse.arrayBuffer();
    const formData = new FormData();
    formData.append('file', new Blob([audioBuffer], { type: 'audio/ogg' }), 'voice.ogg');
    formData.append('model', 'whisper-1');
    const whisperResp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + process.env.OPENAI_API_KEY },
      body: formData
    });
    const whisperData = await whisperResp.json();
    const transcribed = whisperData.text;
    if (!transcribed) return ctx.reply('❌ Не удалось распознать речь');
    await ctx.reply('🎤 *Распознано:* ' + transcribed, { parse_mode: 'Markdown' });
    await processAIMessage(ctx, transcribed);
  } catch (e) {
    ctx.reply('❌ Ошибка голосового: ' + e.message);
  }
});

// ===== ФОТО =====
bot.on('photo', async (ctx) => {
  if (!isAdmin(ctx)) return;
  stats.photos++;
  await ctx.reply('🖼 Анализирую изображение...');
  try {
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    const fileLink = await ctx.telegram.getFileLink(photo.file_id);
    const caption = ctx.message.caption || 'Что на изображении? Опиши подробно и дай оценку/рекомендации если уместно.';
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + process.env.OPENROUTER_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ALL_MODELS.haiku,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: caption },
            { type: 'image_url', image_url: { url: fileLink.href } }
          ]
        }]
      })
    });
    const data = await response.json();
    const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (text) {
      await sendLong(ctx, text, { parse_mode: 'Markdown' });
    } else {
      ctx.reply('❌ Не удалось проанализировать изображение');
    }
  } catch (e) {
    ctx.reply('❌ Ошибка анализа: ' + e.message);
  }
});

// ===== ОСНОВНАЯ AI ФУНКЦИЯ =====
async function processAIMessage(ctx, messageText) {
  const userId = ctx.from.id;

  // Rate limiting
  const now = Date.now();
  if (lastMessage[userId] && (now - lastMessage[userId]) < RATE_LIMIT_MS) {
    return;
  }
  lastMessage[userId] = now;

  stats.messages++;
  addToHistory(userId, 'user', messageText);

  const { data: memories } = await supabase.from('knowledge').select('content').limit(15);
  let memoryContext = '';
  if (memories && memories.length) {
    memoryContext = '\n\nБаза знаний Архитектора:\n' +
      memories.map(function(m) { return '- ' + m.content; }).join('\n');
  }

  const currentMode = userMode[userId] || 'auto';
  const autoMode = currentMode === 'auto' ? detectMode(messageText) : currentMode;
  const systemPrompt = getSystemPrompt(userId, autoMode) + memoryContext;

  const history = getHistory(userId);
  const models = getModels(userId);

  const messages = [{ role: 'system', content: systemPrompt }]
    .concat(history.slice(0, -1))
    .concat([{ role: 'user', content: messageText }]);

  const result = await callAI(messages, models);

  if (result) {
    addToHistory(userId, 'assistant', result.text);
    await autoSaveConversation(userId, messageText, result.text);
    const modeLabel = currentMode === 'auto' ? autoMode + ' (авто)' : currentMode;
    const footer = '\n\n_(' + result.model + ' | ' + modeLabel + ')_';
    await sendLong(ctx, result.text + footer, { parse_mode: 'Markdown' });
  } else {
    ctx.reply('❌ AI недоступен. Попробуй /aitest');
  }
}

// ===== ТЕКСТ =====
bot.on('text', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply('⛔ Access denied');
  try {
    await processAIMessage(ctx, ctx.message.text);
  } catch (e) {
    ctx.reply('❌ Ошибка: ' + e.message);
  }
});

// ===== ЗАПУСК =====
const server = http.createServer(function(req, res) {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok', version: '6.1',
      uptime: Math.floor((Date.now() - stats.start_time) / 1000),
      messages: stats.messages, reminders: reminders.length
    }));
    return;
  }
  if (WEBHOOK_URL) {
    bot.webhookCallback('/webhook')(req, res);
  } else {
    res.writeHead(404); res.end();
  }
});
server.listen(PORT, () => { console.log('SUS v6.1 server port ' + PORT); });

if (WEBHOOK_URL) {
  bot.telegram.setWebhook(WEBHOOK_URL + '/webhook');
  console.log('SUS v6.1 WEBHOOK mode');
} else {
  bot.launch({ dropPendingUpdates: true });
  console.log('SUS v6.1 ONLINE — Claude Sonnet + Все функции активны');
}

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
