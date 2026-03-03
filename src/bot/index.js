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
  haiku:    'anthropic/claude-haiku-4-5',
  gpt:      'openai/gpt-4o-mini',
  deepseek: 'deepseek/deepseek-chat',
  grok:     'x-ai/grok-2-1212',
  mistral:  'mistralai/mistral-small-3.1-24b-instruct:free',
  llama:    'meta-llama/llama-3.2-3b-instruct:free'
};

const DEFAULT_MODELS = [
  ALL_MODELS.haiku,
  ALL_MODELS.gpt,
  ALL_MODELS.mistral,
  ALL_MODELS.llama
];

// ===== СОСТОЯНИЕ =====
// Память разговоров (последние 20 сообщений на сессию)
const conversationHistory = {};
// Текущий агент пользователя
const userAgent = {};
// Текущий режим пользователя
const userMode = {};
// Напоминания
const reminders = [];

// ===== РЕЖИМЫ =====
const MODES = {
  assistant: 'Универсальный ассистент — помогаю с любой задачей',
  critic:    'Критик — анализирую риски, нахожу слабые места, говорю правду',
  coder:     'Разработчик — пишу код, отлаживаю, архитектурю системы',
  strategist:'Стратег — думаю о долгосрочных целях, рынке, позиционировании',
  writer:    'Автор — пишу тексты, посты, документацию, питчи',
  analyst:   'Аналитик — работаю с данными, строю модели, нахожу паттерны'
};

const MODE_PROMPTS = {
  assistant:  'Ты универсальный ассистент. Помогаешь с любой задачей кратко и по делу.',
  critic:     'Ты жёсткий критик. Твоя задача — найти все слабые места, риски и проблемы. Не льсти. Говори прямо что не так.',
  coder:      'Ты senior разработчик. Пишешь чистый код, объясняешь архитектурные решения, находишь баги.',
  strategist: 'Ты стратег. Думаешь системно, видишь картину целиком, даёшь конкретные рекомендации с обоснованием.',
  writer:     'Ты профессиональный автор. Пишешь убедительно, структурированно, адаптируешь стиль под задачу.',
  analyst:    'Ты аналитик данных. Работаешь с цифрами, строишь логические цепочки, делаешь выводы на основе фактов.'
};

// ===== СИСТЕМНЫЙ ПРОМПТ =====
const BASE_SYSTEM_PROMPT = 'Ты SUS (Strategic Universal System) — персональный AI ассистент Архитектора.\n\n' +
'ЛИЧНОСТЬ:\n' +
'- Умный, честный, прямой советник и партнёр\n' +
'- Критически мыслишь, не боишься указывать на риски\n' +
'- Помогаешь с ЛЮБОЙ задачей — не только с LIBERTAS\n' +
'- Не тяни каждый ответ к LIBERTAS если вопрос не об этом\n\n' +
'ЯЗЫК:\n' +
'- ВАЖНО: Отвечай на том же языке на котором написал пользователь\n' +
'- Русский вопрос — русский ответ\n' +
'- English question — English answer\n' +
'- Будь краток и по делу, без лишней воды\n\n' +
'КОНТЕКСТ О ВЛАДЕЛЬЦЕ:\n' +
'- Строит экосистему LIBERTAS — Web3 проект на Solana\n' +
'- VERITAS метавселенная, токен AURA SPL (1 млрд эмиссия)\n' +
'- NFT тиры: Explorer $5, Pioneer $25, Builder $75, Visionary $250, Sovereign $1500\n' +
'- 5 бирж: Труда, Активов, Реального сектора, Рекламы, P2P\n' +
'- Реферал: 4 уровня 10/5/2/1%\n' +
'- Veritas Studio — AI агентская студия для людей и бизнеса\n' +
'- Digital Court — система цифрового правосудия\n' +
'- Veritum Passport — биометрическая идентификация\n' +
'- AI оркестр: Claude, DeepSeek, Perplexity, Grok, Mistral, Gemini\n' +
'- Roadmap: Q1 2026 SUS, Q2 NFT, Q3 Aureon devnet, Q4 mainnet\n' +
'- Проект для людей, не только для себя\n\n' +
'ВОЗМОЖНОСТИ:\n' +
'- Анализ, стратегия, бизнес-консультации\n' +
'- Написание кода, текстов, документов\n' +
'- Исследования и аналитика\n' +
'- Личные задачи и планирование\n' +
'- Работа с любыми темами\n\n' +
'ПАМЯТЬ:\n' +
'- У тебя есть история разговора — используй её для контекста\n' +
'- Есть база знаний Архитектора — учитывай её в ответах';

function getSystemPrompt(userId) {
  const mode = userMode[userId] || 'assistant';
  const modeExtra = mode !== 'assistant' ? '\n\nТЕКУЩИЙ РЕЖИМ: ' + MODE_PROMPTS[mode] : '';
  return BASE_SYSTEM_PROMPT + modeExtra;
}

function getModels(userId) {
  const agent = userAgent[userId];
  if (agent && ALL_MODELS[agent]) {
    return [ALL_MODELS[agent], ALL_MODELS.haiku, ALL_MODELS.gpt];
  }
  return DEFAULT_MODELS;
}

function addToHistory(userId, role, content) {
  if (!conversationHistory[userId]) conversationHistory[userId] = [];
  conversationHistory[userId].push({ role: role, content: content });
  if (conversationHistory[userId].length > 20) {
    conversationHistory[userId] = conversationHistory[userId].slice(-20);
  }
}

function getHistory(userId) {
  return conversationHistory[userId] || [];
}

// ===== НАПОМИНАНИЯ — проверка каждую минуту =====
setInterval(async function() {
  const now = Date.now();
  for (let i = reminders.length - 1; i >= 0; i--) {
    if (now >= reminders[i].time) {
      try {
        await bot.telegram.sendMessage(reminders[i].userId, '⏰ *Напоминание:*\n' + reminders[i].text, { parse_mode: 'Markdown' });
      } catch (e) {
        console.log('Ошибка напоминания:', e.message);
      }
      reminders.splice(i, 1);
    }
  }
}, 60000);

// ===== СТАТИСТИКА =====
const stats = { messages: 0, tokens_approx: 0, start_time: Date.now() };

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
    '🤖 *SUS ONLINE v5.0*\n\n' +
    'Архитектор, жду команд.\n' +
    'AI: Claude Haiku + GPT-4o-mini\n' +
    'Память: ✅ история разговора\n' +
    'Режим: Универсальный ассистент\n\n' +
    '💬 Напиши что угодно — отвечу на любом языке!',
    { parse_mode: 'Markdown', ...mainMenu }
  );
});

// ===== СТАТУС ЭКОСИСТЕМЫ =====
bot.hears('📊 Статус', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const { data } = await supabase
    .from('ecosystem_status')
    .select('*')
    .order('updated_at', { ascending: false });

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

// ===== БАЗА ЗНАНИЙ =====
bot.hears('🧠 База знаний', (ctx) => {
  if (!isAdmin(ctx)) return;
  ctx.reply(
    '*LIBERTAS KNOWLEDGE BASE:*\n\n' +
    '🪙 AURA SPL токен Solana, эмиссия 1 млрд\n' +
    '🏆 NFT: Explorer $5 / Pioneer $25 / Builder $75 / Visionary $250 / Sovereign $1500\n' +
    '💰 Реферал: 4 уровня 10/5/2/1%\n\n' +
    '🏛 Биржи: Труда, Активов, Реального сектора, Рекламы, P2P\n\n' +
    '🤖 Агенты: Claude, DeepSeek, Perplexity, Grok, Mistral, Gemini',
    { parse_mode: 'Markdown' }
  );
});

bot.hears('🌳 Дерево', (ctx) => {
  if (!isAdmin(ctx)) return;
  ctx.reply(
    '*🌱 КОРНИ:* Aureon Network L3 ZK-Rollup Solana\n\n' +
    '*🪵 СТВОЛ:* VERITAS Метавселенная + Veritum Passport\n\n' +
    '*🌿 ВЕТВЬ #1:* Veritas Studio — AI агентская студия\n\n' +
    '*🌿 ВЕТВЬ #2:* AI SUS — ассистент Архитектора\n\n' +
    '*🍃 ЛИСТЬЯ:* Digital Court Libertas',
    { parse_mode: 'Markdown' }
  );
});

bot.hears('🤖 Агенты', (ctx) => {
  if (!isAdmin(ctx)) return;
  ctx.reply(
    '*🤖 ОРКЕСТР АГЕНТОВ:*\n\n' +
    '• Claude-Архитектор\n• DeepSeek-Tech\n• Perplexity-Аналитик\n' +
    '• Grok-Стратегия\n• Mistral-Маркетинг\n• Gemini-Документы\n\n' +
    '*Переключить агента:* /agent [имя]\n' +
    'haiku, gpt, deepseek, grok, mistral',
    { parse_mode: 'Markdown' }
  );
});

bot.hears('🔑 Ключи', (ctx) => {
  if (!isAdmin(ctx)) return;
  const mode = userMode[ctx.from.id] || 'assistant';
  const agent = userAgent[ctx.from.id] || 'auto';
  ctx.reply(
    '🔑 *СТАТУС СИСТЕМЫ:*\n\n' +
    'Supabase: ' + (process.env.SUPABASE_URL ? '✅' : '❌') + '\n' +
    'Telegram: ✅\n' +
    'OpenRouter: ' + (process.env.OPENROUTER_API_KEY ? '✅' : '❌') + '\n' +
    'Helius: ' + (process.env.HELIUS_API_KEY ? '✅' : '❌') + '\n' +
    'Webhook: ' + (WEBHOOK_URL ? '✅' : '⚠️ polling') + '\n\n' +
    'Режим: ' + mode + '\n' +
    'Агент: ' + agent + '\n' +
    'Сообщений: ' + stats.messages,
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
  await supabase.from('tasks').insert({
    description: task,
    status: 'pending',
    created_at: new Date().toISOString()
  });
  ctx.reply('✅ *Задача сохранена:*\n"' + task + '"', { parse_mode: 'Markdown' });
});

bot.hears('📋 Задачи', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const { data } = await supabase
    .from('tasks')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(15);

  let msg = '📋 *ЗАДАЧИ:*\n\n';
  if (!data || !data.length) {
    msg += '⏳ Phantom wallet devnet\n⏳ Юрисдикция компании\n⏳ UptimeRobot\n⏳ Голосовые Whisper\n⏳ Generate Domain Railway';
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
    content: knowledge,
    source: 'architect',
    created_at: new Date().toISOString()
  });
  if (error) return ctx.reply('❌ Ошибка: ' + error.message);
  ctx.reply('🧠 *Знание сохранено!*\n\n"' + knowledge.substring(0, 200) + '"', { parse_mode: 'Markdown' });
});

bot.command('recall', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const query = ctx.message.text.replace('/recall', '').trim();
  if (!query) return ctx.reply('Формат: /recall ключевое слово');
  const { data, error } = await supabase
    .from('knowledge')
    .select('*')
    .ilike('content', '%' + query + '%')
    .order('created_at', { ascending: false })
    .limit(5);
  if (error) return ctx.reply('❌ Ошибка: ' + error.message);
  if (!data || !data.length) return ctx.reply('❌ По запросу "' + query + '" ничего не найдено');
  let msg = '🔍 *Найдено по "' + query + '":*\n\n';
  data.forEach(function(k, i) {
    msg += (i + 1) + '. ' + k.content.substring(0, 200) + '\n\n';
  });
  ctx.reply(msg, { parse_mode: 'Markdown' });
});

bot.hears('📚 Знания', (ctx) => {
  if (!isAdmin(ctx)) return;
  ctx.reply('📚 *ПАМЯТЬ SUS:*\n\n/learn тема: текст\n/recall ключевое слово\n/forget ключевое слово — удалить знание', { parse_mode: 'Markdown' });
});

bot.command('forget', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const query = ctx.message.text.replace('/forget', '').trim();
  if (!query) return ctx.reply('Формат: /forget ключевое слово');
  const { data } = await supabase
    .from('knowledge')
    .select('id, content')
    .ilike('content', '%' + query + '%')
    .limit(1);
  if (!data || !data.length) return ctx.reply('❌ Не найдено: "' + query + '"');
  await supabase.from('knowledge').delete().eq('id', data[0].id);
  ctx.reply('🗑 *Удалено:*\n"' + data[0].content.substring(0, 100) + '"', { parse_mode: 'Markdown' });
});

// ===== ОЧИСТКА ИСТОРИИ =====
bot.command('clear', (ctx) => {
  if (!isAdmin(ctx)) return;
  conversationHistory[ctx.from.id] = [];
  ctx.reply('🗑 История разговора очищена. Начинаем с чистого листа.');
});

// ===== СМЕНА АГЕНТА =====
bot.command('agent', (ctx) => {
  if (!isAdmin(ctx)) return;
  const agent = ctx.message.text.replace('/agent', '').trim().toLowerCase();
  if (!agent) {
    const current = userAgent[ctx.from.id] || 'auto';
    return ctx.reply(
      '🤖 *Доступные агенты:*\n\n' +
      '/agent haiku — Claude Haiku (умный, быстрый)\n' +
      '/agent gpt — GPT-4o-mini (универсальный)\n' +
      '/agent deepseek — DeepSeek (технический, код)\n' +
      '/agent grok — Grok (стратегия, тренды)\n' +
      '/agent mistral — Mistral (тексты, маркетинг)\n' +
      '/agent auto — автоматический выбор\n\n' +
      'Текущий: *' + current + '*',
      { parse_mode: 'Markdown' }
    );
  }
  if (agent === 'auto') {
    delete userAgent[ctx.from.id];
    return ctx.reply('🔄 Режим: автоматический выбор агента');
  }
  if (!ALL_MODELS[agent]) {
    return ctx.reply('❌ Неизвестный агент. Доступны: haiku, gpt, deepseek, grok, mistral, auto');
  }
  userAgent[ctx.from.id] = agent;
  ctx.reply('✅ Агент переключён на: *' + agent + '*', { parse_mode: 'Markdown' });
});

// ===== СМЕНА РЕЖИМА =====
bot.command('mode', (ctx) => {
  if (!isAdmin(ctx)) return;
  const mode = ctx.message.text.replace('/mode', '').trim().toLowerCase();
  if (!mode) {
    const current = userMode[ctx.from.id] || 'assistant';
    let msg = '🎭 *Режимы SUS:*\n\n';
    Object.keys(MODES).forEach(function(m) {
      msg += (m === current ? '✅ ' : '') + '/mode ' + m + ' — ' + MODES[m] + '\n\n';
    });
    return ctx.reply(msg, { parse_mode: 'Markdown' });
  }
  if (!MODES[mode]) {
    return ctx.reply('❌ Неизвестный режим. Доступны: assistant, critic, coder, strategist, writer, analyst');
  }
  userMode[ctx.from.id] = mode;
  conversationHistory[ctx.from.id] = [];
  ctx.reply('✅ Режим: *' + mode + '*\n' + MODES[mode] + '\n\nИстория очищена для чистого старта.', { parse_mode: 'Markdown' });
});

// ===== НАПОМИНАНИЯ =====
bot.command('remind', (ctx) => {
  if (!isAdmin(ctx)) return;
  const text = ctx.message.text.replace('/remind', '').trim();
  if (!text) return ctx.reply(
    'Форматы:\n' +
    '/remind 30m позвонить партнёру\n' +
    '/remind 2h проверить деплой\n' +
    '/remind 1d написать whitepaper'
  );

  const parts = text.split(' ');
  const timeStr = parts[0].toLowerCase();
  const reminder = parts.slice(1).join(' ');

  if (!reminder) return ctx.reply('Укажи текст напоминания после времени');

  let ms = 0;
  if (timeStr.endsWith('m')) ms = parseInt(timeStr) * 60 * 1000;
  else if (timeStr.endsWith('h')) ms = parseInt(timeStr) * 60 * 60 * 1000;
  else if (timeStr.endsWith('d')) ms = parseInt(timeStr) * 24 * 60 * 60 * 1000;
  else return ctx.reply('❌ Формат времени: 30m, 2h, 1d');

  if (isNaN(ms) || ms <= 0) return ctx.reply('❌ Некорректное время');

  reminders.push({
    userId: ctx.from.id,
    text: reminder,
    time: Date.now() + ms
  });

  const when = new Date(Date.now() + ms).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  ctx.reply('⏰ Напомню в ' + when + ':\n"' + reminder + '"');
});

// ===== ОБНОВЛЕНИЕ ПРОГРЕССА =====
bot.command('progress', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const args = ctx.message.text.replace('/progress', '').trim();
  if (!args) return ctx.reply('Формат: /progress Компонент: 75');
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
    const uptime = Math.floor((Date.now() - stats.start_time) / 3600000);
    ctx.reply(
      '💰 *БЮДЖЕТ OPENROUTER:*\n\n' +
      'Потрачено: $' + used + '\n' +
      'Лимит: ' + (limit === null || limit === undefined ? 'unlimited' : '$' + limit) + '\n\n' +
      '📊 *СТАТИСТИКА SUS:*\n' +
      'Сообщений обработано: ' + stats.messages + '\n' +
      'Аптайм: ' + uptime + ' ч.',
      { parse_mode: 'Markdown' }
    );
  } catch (e) {
    ctx.reply('❌ Ошибка: ' + e.message);
  }
});

// ===== ИТОГ ДНЯ =====
bot.command('summary', async (ctx) => {
  if (!isAdmin(ctx)) return;
  await ctx.reply('📋 Составляю итог...');

  const { data: tasks } = await supabase
    .from('tasks')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);

  const { data: knowledge } = await supabase
    .from('knowledge')
    .select('content')
    .order('created_at', { ascending: false })
    .limit(5);

  const doneTasks = tasks ? tasks.filter(function(t) { return t.status === 'done'; }) : [];
  const pendingTasks = tasks ? tasks.filter(function(t) { return t.status === 'pending'; }) : [];

  let msg = '📊 *ИТОГ ДНЯ — SUS*\n\n';
  msg += '✅ *Выполнено (' + doneTasks.length + '):*\n';
  if (doneTasks.length) {
    doneTasks.slice(0, 5).forEach(function(t) { msg += '• ' + t.description + '\n'; });
  } else {
    msg += '• Нет выполненных задач\n';
  }
  msg += '\n⏳ *В работе (' + pendingTasks.length + '):*\n';
  if (pendingTasks.length) {
    pendingTasks.slice(0, 5).forEach(function(t) { msg += '• ' + t.description + '\n'; });
  } else {
    msg += '• Очередь пуста\n';
  }
  msg += '\n🧠 *Последние знания:*\n';
  if (knowledge && knowledge.length) {
    knowledge.slice(0, 3).forEach(function(k) { msg += '• ' + k.content.substring(0, 80) + '\n'; });
  }
  msg += '\n💬 Сообщений сегодня: ' + stats.messages;

  ctx.reply(msg, { parse_mode: 'Markdown' });
});

// ===== ЭКСПОРТ ЗНАНИЙ =====
bot.command('export', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const { data } = await supabase.from('knowledge').select('*').order('created_at', { ascending: false });
  if (!data || !data.length) return ctx.reply('База знаний пуста');
  let msg = '📤 *ЭКСПОРТ БАЗЫ ЗНАНИЙ (' + data.length + ' записей):*\n\n';
  data.forEach(function(k, i) {
    msg += (i + 1) + '. ' + k.content.substring(0, 150) + '\n\n';
  });
  if (msg.length > 4000) msg = msg.substring(0, 3900) + '\n...(обрезано)';
  ctx.reply(msg, { parse_mode: 'Markdown' });
});

// ===== ДИАГНОСТИКА =====
bot.command('aitest', async (ctx) => {
  if (!isAdmin(ctx)) return;
  ctx.reply('🔍 Тестирую все модели...');
  const results = [];
  for (const name in ALL_MODELS) {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + process.env.OPENROUTER_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: ALL_MODELS[name], messages: [{ role: 'user', content: 'hi' }], max_tokens: 10 })
      });
      const data = await response.json();
      const ok = data.choices && data.choices[0] && data.choices[0].message;
      results.push((ok ? '✅' : '❌') + ' ' + name);
    } catch (e) {
      results.push('❌ ' + name + ' (' + e.message.substring(0, 30) + ')');
    }
  }
  ctx.reply('📊 *Статус моделей:*\n\n' + results.join('\n'), { parse_mode: 'Markdown' });
});

// ===== ПОМОЩЬ =====
bot.hears('❓ Помощь', (ctx) => {
  if (!isAdmin(ctx)) return;
  ctx.reply(
    '📖 *SUS v5.0 — ПОЛНЫЙ СПИСОК КОМАНД:*\n\n' +
    '*📝 ЗАДАЧИ:*\n' +
    '/task [текст] — добавить задачу\n' +
    '/done [текст] — отметить выполненной\n\n' +
    '*🧠 ПАМЯТЬ:*\n' +
    '/learn [тема: текст] — обучить\n' +
    '/recall [слово] — найти\n' +
    '/forget [слово] — удалить\n' +
    '/export — выгрузить всю базу\n\n' +
    '*🤖 АГЕНТЫ:*\n' +
    '/agent [имя] — сменить агента\n' +
    '/mode [режим] — сменить режим\n\n' +
    '*⚙️ УПРАВЛЕНИЕ:*\n' +
    '/clear — очистить историю чата\n' +
    '/progress [Компонент: %] — обновить прогресс\n' +
    '/remind [30m/2h/1d] [текст] — напоминание\n\n' +
    '*📊 АНАЛИТИКА:*\n' +
    '/summary — итог дня\n' +
    '/budget — бюджет и статистика\n' +
    '/aitest — проверить все модели\n\n' +
    '💬 Любой текст → AI ответ с памятью!',
    { parse_mode: 'Markdown' }
  );
});

// ===== ГОЛОСОВЫЕ СООБЩЕНИЯ =====
bot.on('voice', async (ctx) => {
  if (!isAdmin(ctx)) return;
  if (!process.env.OPENAI_API_KEY) {
    return ctx.reply('❌ Голосовые сообщения требуют OPENAI_API_KEY для Whisper.\nДобавь в Railway Variables.');
  }
  await ctx.reply('🎤 Распознаю речь...');
  try {
    const fileId = ctx.message.voice.file_id;
    const fileLink = await ctx.telegram.getFileLink(fileId);
    const audioResponse = await fetch(fileLink.href);
    const audioBuffer = await audioResponse.arrayBuffer();
    const formData = new FormData();
    const blob = new Blob([audioBuffer], { type: 'audio/ogg' });
    formData.append('file', blob, 'voice.ogg');
    formData.append('model', 'whisper-1');
    formData.append('language', 'ru');
    const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + process.env.OPENAI_API_KEY },
      body: formData
    });
    const whisperData = await whisperResponse.json();
    const transcribed = whisperData.text;
    if (!transcribed) return ctx.reply('❌ Не удалось распознать речь');
    await ctx.reply('🎤 *Распознано:* ' + transcribed, { parse_mode: 'Markdown' });
    ctx.message.text = transcribed;
    await processAIMessage(ctx, transcribed);
  } catch (e) {
    ctx.reply('❌ Ошибка голосового: ' + e.message);
  }
});

// ===== ФОТО — АНАЛИЗ ИЗОБРАЖЕНИЙ =====
bot.on('photo', async (ctx) => {
  if (!isAdmin(ctx)) return;
  await ctx.reply('🖼 Анализирую изображение...');
  try {
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    const fileLink = await ctx.telegram.getFileLink(photo.file_id);
    const caption = ctx.message.caption || 'Что на этом изображении? Опиши подробно.';
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + process.env.OPENROUTER_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'anthropic/claude-haiku-4-5',
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
    ctx.reply(text || '❌ Не удалось проанализировать изображение');
  } catch (e) {
    ctx.reply('❌ Ошибка анализа: ' + e.message);
  }
});

// ===== ОСНОВНАЯ AI ФУНКЦИЯ =====
async function processAIMessage(ctx, messageText) {
  const userId = ctx.from.id;
  stats.messages++;

  addToHistory(userId, 'user', messageText);

  const { data: memories } = await supabase.from('knowledge').select('content').limit(15);
  let memoryContext = '';
  if (memories && memories.length) {
    memoryContext = '\n\nСохранённые знания:\n' + memories.map(function(m) { return '- ' + m.content; }).join('\n');
  }

  const systemPrompt = getSystemPrompt(userId) + memoryContext;
  const history = getHistory(userId);
  const models = getModels(userId);

  const messages = [{ role: 'system', content: systemPrompt }].concat(
    history.slice(0, -1)
  ).concat([{ role: 'user', content: messageText }]);

  let reply = null;
  let usedModel = null;

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
      if (text && text.length > 0) {
        reply = text;
        usedModel = models[i].split('/')[1];
        break;
      }
    } catch (e) {
      continue;
    }
  }

  if (reply) {
    addToHistory(userId, 'assistant', reply);
    const mode = userMode[userId] || 'assistant';
    const footer = '\n\n_(' + usedModel + ' | ' + mode + ')_';
    const fullReply = reply + footer;
    if (fullReply.length > 4096) {
      await ctx.reply(reply.substring(0, 4000) + '...', { parse_mode: 'Markdown' });
    } else {
      await ctx.reply(fullReply, { parse_mode: 'Markdown' });
    }
  } else {
    ctx.reply('❌ AI недоступен. Попробуй /aitest');
  }
}

// ===== ТЕКСТОВЫЕ СООБЩЕНИЯ =====
bot.on('text', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply('⛔ Access denied');
  await ctx.reply('🤔 Думаю...');
  try {
    await processAIMessage(ctx, ctx.message.text);
  } catch (e) {
    ctx.reply('❌ Ошибка: ' + e.message);
  }
});

// ===== ЗАПУСК =====
if (WEBHOOK_URL) {
  bot.telegram.setWebhook(WEBHOOK_URL + '/webhook');
  const server = http.createServer(bot.webhookCallback('/webhook'));
  server.listen(PORT, () => { console.log('SUS v5.0 WEBHOOK port ' + PORT); });
} else {
  bot.launch({ dropPendingUpdates: true });
  console.log('SUS v5.0 ONLINE — Память + Режимы + Голос + Фото + Напоминания');
}

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
