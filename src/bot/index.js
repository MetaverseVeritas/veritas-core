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

const MODELS = [
  'anthropic/claude-haiku-4-5',
  'openai/gpt-4o-mini',
  'meta-llama/llama-3.2-3b-instruct:free',
  'mistralai/mistral-7b-instruct:free'
];

const SYSTEM_PROMPT = `Ты SUS (Strategic Universal System) — персональный AI ассистент Архитектора.

ЛИЧНОСТЬ:
- Ты умный, честный, прямой советник и помощник
- Ты не корпоративный бот — ты думающий партнёр
- Ты критически мыслишь и не боишься указывать на риски
- Ты помогаешь с ЛЮБОЙ задачей — не только с LIBERTAS

ЯЗЫК:
- Отвечай на том же языке, на котором пишет пользователь
- Если по-русски — отвечай по-русски
- Если по-английски — отвечай по-английски
- Будь краток и по делу, без лишней воды

КОНТЕКСТ О ВЛАДЕЛЬЦЕ (Архитекторе):
- Строит экосистему LIBERTAS — амбициозный Web3 проект
- VERITAS — метавселенная на Solana L3
- Токен AURA SPL, эмиссия 1 млрд
- NFT тиры: Explorer $5, Pioneer $25, Builder $75, Visionary $250, Sovereign $1500
- 5 бирж: Труда, Активов, Реального сектора, Рекламы, P2P
- Реферальная система: 4 уровня 10/5/2/1%
- AI оркестр: Claude-Архитектор, DeepSeek-Tech, Perplexity-Аналитик, Grok-Стратегия, Mistral-Маркетинг, Gemini-Документы
- Roadmap: Q1 2026 SUS готов, Q2 NFT, Q3 Aureon devnet, Q4 mainnet
- Veritas Studio — AI агентская студия для людей и бизнеса
- Digital Court Libertas — система цифрового правосудия
- Veritum Passport — биометрическая идентификация
- Проект создаётся НЕ только для личного использования — для людей

ПРАВИЛА ПОВЕДЕНИЯ:
- НЕ тяни каждый ответ к LIBERTAS если вопрос не об этом
- Если спросили про погоду — отвечай про погоду
- Если спросили про бизнес — помогай с бизнесом
- Если спросили про код — пиши код
- Упоминай LIBERTAS только когда это реально уместно и полезно
- Давай честную критику, не только позитив
- Если видишь риск — говори прямо

ВОЗМОЖНОСТИ:
- Анализ и стратегия
- Написание текстов, кода, документов
- Исследования и аналитика
- Бизнес-консультации
- Техническая помощь
- Личные задачи и планирование
- Работа с любыми темами

ПАМЯТЬ:
- У тебя есть база знаний — используй её для контекста
- Архитектор может добавлять знания через /learn
- Всегда учитывай сохранённый контекст в ответах`;

const KB = {
  roots: 'Aureon Network — L3 ZK-Rollup на Solana. Токен AURA.',
  trunk: 'VERITAS — Метавселенная. Biometric Veritum Passport.',
  branch1: 'Veritas Studio — AI Multi-Agent агентская студия для людей и бизнеса.',
  branch2: 'AI SUS — персональный ассистент Архитектора.',
  leaves: 'Digital Court (Libertas) — система цифрового правосудия.',
  token: 'AURA SPL токен Solana, эмиссия 1 млрд',
  nft: 'Explorer $5 / Pioneer $25 / Builder $75 / Visionary $250 / Sovereign $1500',
  referral: '4 уровня: 10% / 5% / 2% / 1%',
  exchanges: 'Труда, Активов, Реального сектора, Рекламы, P2P',
  agents: 'Claude-Архитектор, DeepSeek-Tech, Perplexity-Аналитик, Grok-Стратегия, Mistral-Маркетинг, Gemini-Документы',
  todo: [
    'Phantom wallet devnet',
    'Юрисдикция компании',
    'Мониторинг UptimeRobot',
    'Голосовые сообщения Whisper',
    'Generate Domain Railway'
  ]
};

const mainMenu = Markup.keyboard([
  ['📊 Статус', '🧠 База знаний'],
  ['✅ Задача', '📋 Задачи'],
  ['🔑 Ключи', '🤖 Агенты'],
  ['🌳 Дерево', '📚 Знания'],
  ['❓ Помощь']
]).resize();

bot.start((ctx) => {
  if (!isAdmin(ctx)) return ctx.reply('⛔ Access denied / Доступ запрещён');
  ctx.reply(
    '🤖 *SUS ONLINE v4.1*\n\nАрхитектор, жду команд.\nAI: Claude Haiku + GPT-4o-mini\nРежим: Универсальный ассистент\n\n💬 Напиши что угодно — помогу!',
    { parse_mode: 'Markdown', ...mainMenu }
  );
});

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
    { component: 'AI SUS', progress: 95 },
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
    '🪙 *Токен:* ' + KB.token + '\n' +
    '🏆 *NFT тиры:* ' + KB.nft + '\n' +
    '💰 *Реферал:* ' + KB.referral + '\n\n' +
    '*Биржи:* ' + KB.exchanges + '\n\n' +
    '*Агенты:* ' + KB.agents,
    { parse_mode: 'Markdown' }
  );
});

bot.hears('🌳 Дерево', (ctx) => {
  if (!isAdmin(ctx)) return;
  ctx.reply(
    '*🌱 КОРНИ:* ' + KB.roots + '\n\n' +
    '*🪵 СТВОЛ:* ' + KB.trunk + '\n\n' +
    '*🌿 ВЕТВЬ #1:* ' + KB.branch1 + '\n\n' +
    '*🌿 ВЕТВЬ #2:* ' + KB.branch2 + '\n\n' +
    '*🍃 ЛИСТЬЯ:* ' + KB.leaves,
    { parse_mode: 'Markdown' }
  );
});

bot.hears('🤖 Агенты', (ctx) => {
  if (!isAdmin(ctx)) return;
  ctx.reply(
    '*🤖 ОРКЕСТР АГЕНТОВ:*\n\n' +
    KB.agents.split(', ').map(function(a) { return '• ' + a; }).join('\n'),
    { parse_mode: 'Markdown' }
  );
});

bot.hears('🔑 Ключи', (ctx) => {
  if (!isAdmin(ctx)) return;
  ctx.reply(
    '🔑 *СТАТУС КЛЮЧЕЙ:*\n\n' +
    'Supabase: ' + (process.env.SUPABASE_URL ? '✅' : '❌') + '\n' +
    'Telegram: ✅\n' +
    'OpenRouter: ' + (process.env.OPENROUTER_API_KEY ? '✅' : '❌') + '\n' +
    'Helius: ' + (process.env.HELIUS_API_KEY ? '✅' : '❌') + '\n' +
    'Webhook: ' + (WEBHOOK_URL ? '✅' : '⚠️ polling') + '\n\n' +
    '*Храни в Railway Variables!*',
    { parse_mode: 'Markdown' }
  );
});

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
    msg += KB.todo.map(function(t, i) { return (i + 1) + '. ⏳ ' + t; }).join('\n');
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

bot.command('progress', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const args = ctx.message.text.replace('/progress', '').trim();
  if (!args) return ctx.reply('Формат: /progress Компонент: 75\nПример: /progress AI SUS: 95');
  const parts = args.split(':');
  if (parts.length < 2) return ctx.reply('Формат: /progress Компонент: число');
  const component = parts[0].trim();
  const progress = parseInt(parts[1].trim());
  if (isNaN(progress) || progress < 0 || progress > 100) {
    return ctx.reply('❌ Прогресс должен быть числом от 0 до 100');
  }
  const { data: existing } = await supabase
    .from('ecosystem_status')
    .select('id')
    .ilike('component', component)
    .limit(1);
  if (existing && existing.length > 0) {
    await supabase
      .from('ecosystem_status')
      .update({ progress: progress, updated_at: new Date().toISOString() })
      .eq('id', existing[0].id);
  } else {
    await supabase
      .from('ecosystem_status')
      .insert({ component: component, progress: progress, updated_at: new Date().toISOString() });
  }
  ctx.reply('📊 *Обновлено:*\n' + component + ' → ' + progress + '%', { parse_mode: 'Markdown' });
});

bot.command('budget', async (ctx) => {
  if (!isAdmin(ctx)) return;
  try {
    const response = await fetch('https://openrouter.ai/api/v1/auth/key', {
      headers: { 'Authorization': 'Bearer ' + process.env.OPENROUTER_API_KEY }
    });
    const data = await response.json();
    const used = data.data && data.data.usage ? data.data.usage : 0;
    const limit = data.data && data.data.limit ? data.data.limit : null;
    ctx.reply(
      '💰 *БЮДЖЕТ OPENROUTER:*\n\n' +
      'Потрачено: $' + Number(used).toFixed(4) + '\n' +
      'Лимит: ' + (limit === null ? 'unlimited' : '$' + limit) + '\n' +
      'Остаток: ' + (limit === null ? '∞' : '$' + (limit - used).toFixed(4)),
      { parse_mode: 'Markdown' }
    );
  } catch (e) {
    ctx.reply('❌ Ошибка получения баланса: ' + e.message);
  }
});

bot.hears('📚 Знания', (ctx) => {
  if (!isAdmin(ctx)) return;
  ctx.reply('📚 *ПАМЯТЬ SUS:*\n\n/learn тема: текст\n/recall ключевое слово', { parse_mode: 'Markdown' });
});

bot.hears('❓ Помощь', (ctx) => {
  if (!isAdmin(ctx)) return;
  ctx.reply(
    '📖 *SUS v4.1 КОМАНДЫ:*\n\n' +
    '/task [текст] — задача\n' +
    '/done [текст] — выполнено\n' +
    '/learn [тема: текст] — обучить\n' +
    '/recall [слово] — найти в памяти\n' +
    '/progress [Компонент: %] — обновить прогресс\n' +
    '/budget — баланс OpenRouter\n' +
    '/aitest — тест AI\n\n' +
    '💬 Напиши что угодно — отвечу на любом языке!',
    { parse_mode: 'Markdown' }
  );
});

bot.command('aitest', async (ctx) => {
  if (!isAdmin(ctx)) return;
  ctx.reply('🔍 Тестирую...');
  try {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) return ctx.reply('❌ OPENROUTER_API_KEY не найден!');
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'anthropic/claude-haiku-4-5',
        messages: [{ role: 'user', content: 'скажи привет кратко' }]
      })
    });
    const text = await response.text();
    ctx.reply('📡 Ответ: ' + text.substring(0, 500));
  } catch (e) {
    ctx.reply('❌ Ошибка: ' + e.message);
  }
});

bot.on('text', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply('⛔ Access denied');

  const userMessage = ctx.message.text;
  await ctx.reply('🤔 Думаю...');

  try {
    const { data: memories } = await supabase
      .from('knowledge')
      .select('content')
      .limit(15);

    let memoryContext = '';
    if (memories && memories.length) {
      memoryContext = '\n\nСохранённые знания Архитектора:\n' + memories.map(function(m) { return '- ' + m.content; }).join('\n');
    }

    const fullPrompt = SYSTEM_PROMPT + memoryContext;

    let reply = null;
    let usedModel = null;

    for (let i = 0; i < MODELS.length; i++) {
      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + process.env.OPENROUTER_API_KEY,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: MODELS[i],
            messages: [
              { role: 'system', content: fullPrompt },
              { role: 'user', content: userMessage }
            ]
          })
        });

        const data = await response.json();
        const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;

        if (text && text.length > 0) {
          reply = text;
          usedModel = MODELS[i].split('/')[1];
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (reply) {
      ctx.reply(reply + '\n\n_(' + usedModel + ')_', { parse_mode: 'Markdown' });
    } else {
      ctx.reply('❌ AI недоступен. Попробуй /aitest');
    }

  } catch (e) {
    ctx.reply('❌ Ошибка: ' + e.message);
  }
});

if (WEBHOOK_URL) {
  bot.telegram.setWebhook(WEBHOOK_URL + '/webhook');
  const server = http.createServer(bot.webhookCallback('/webhook'));
  server.listen(PORT, () => {
    console.log('SUS v4.1 WEBHOOK на порту ' + PORT);
  });
} else {
  bot.launch({ dropPendingUpdates: true });
  console.log('SUS v4.1 POLLING - Универсальный ассистент ONLINE');
}

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
