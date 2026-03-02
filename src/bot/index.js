require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const ADMIN_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;
const isAdmin = (ctx) => String(ctx.from.id) === String(ADMIN_ID);

const LIBERTAS_KB = {
  tree: {
    roots: 'Aureon Network — L3 ZK-Rollup на Solana. Токен AURA.',
    trunk: 'VERITAS — Метавселенная. Biometric Veritum Passport.',
    branch1: 'Veritas Studio — AI Multi-Agent Debate Engine.',
    branch2: 'AI SUS — Голос, Infinite Ear, мост Архитектора и Кода.',
    leaves: 'Digital Court (Libertas) — станет веткой при юридическом признании.'
  },
  tokens: {
    name: 'AURA',
    chain: 'Solana SPL',
    nft_tiers: 'Explorer $5 → Pioneer $25 → Builder $75 → Visionary $250 → Sovereign $1500',
    referral: '4 уровня: 10% / 5% / 2% / 1%'
  },
  exchanges: ['Труда', 'Активов', 'Реального сектора', 'Рекламы', 'P2P'],
  status: { roots: 33, trunk: 25, studio: 25, sus: 78, nft: 35, court: 10 },
  agents: [
    'Claude — Архитектор (стратегия, этика)',
    'DeepSeek — Tech (Rust/Anchor контракты)',
    'Perplexity — Аналитик (рынок, конкуренты)',
    'Grok — Рыночная стратегия',
    'Mistral — Маркетинг',
    'Gemini — Тяжёлые документы'
  ],
  todo: [
    'OpenRouter API ключ → AI мозг SUS',
    'RLS политики Supabase',
    'Helius API ключ',
    'Phantom wallet devnet',
    'Юрисдикция компании',
    'Таблица knowledge в Supabase',
    'Мониторинг UptimeRobot'
  ]
};

const mainMenu = Markup.keyboard([
  ['📊 Статус', '🧠 База знаний'],
  ['✅ Задача', '📋 Задачи'],
  ['🔑 Ключи', '🤖 Агенты'],
  ['🌳 Дерево', '📚 Знания'],
  ['❓ Помощь']
]).resize();

// ===== START =====
bot.start((ctx) => {
  if (!isAdmin(ctx)) return ctx.reply('⛔ Доступ запрещён');
  ctx.reply(
    `🤖 *SUS ONLINE v2.1*\n\nАрхитектор, жду команд.\nЭкосистема LIBERTAS активна.\n\n` +
    `Готовность: 🌱${LIBERTAS_KB.status.roots}% | 🪵${LIBERTAS_KB.status.trunk}% | 🌿${LIBERTAS_KB.status.sus}%`,
    { parse_mode: 'Markdown', ...mainMenu }
  );
});

// ===== СТАТУС =====
bot.hears('📊 Статус', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const { data } = await supabase
    .from('ecosystem_status').select('*')
    .order('updated_at', { ascending: false });

  let msg = '🌳 *LIBERTAS ECOSYSTEM:*\n\n';
  const items = data?.length > 0 ? data : [
    { component: 'Aureon Network', progress: LIBERTAS_KB.status.roots },
    { component: 'VERITAS', progress: LIBERTAS_KB.status.trunk },
    { component: 'Veritas Studio', progress: LIBERTAS_KB.status.studio },
    { component: 'AI SUS', progress: LIBERTAS_KB.status.sus },
    { component: 'NFT система', progress: LIBERTAS_KB.status.nft },
    { component: 'Digital Court', progress: LIBERTAS_KB.status.court }
  ];
  items.forEach(item => {
    const bar = '█'.repeat(Math.floor(item.progress / 10)) +
      '░'.repeat(10 - Math.floor(item.progress / 10));
    msg += `*${item.component}*\n${bar} ${item.progress}%\n\n`;
  });
  const total = Math.round(items.reduce((s, i) => s + i.progress, 0) / items.length);
  msg += `━━━━━━━━━━\n🌍 *ОБЩАЯ: ${total}%*`;
  ctx.reply(msg, { parse_mode: 'Markdown' });
});

// ===== БАЗА ЗНАНИЙ =====
bot.hears('🧠 База знаний', (ctx) => {
  if (!isAdmin(ctx)) return;
  ctx.reply(
    '*LIBERTAS KNOWLEDGE BASE:*\n\n' +
    `🪙 *Токен:* ${LIBERTAS_KB.tokens.name} (${LIBERTAS_KB.tokens.chain})\n` +
    `🏆 *NFT тиры:* ${LIBERTAS_KB.tokens.nft_tiers}\n` +
    `💰 *Реферал:* ${LIBERTAS_KB.tokens.referral}\n\n` +
    `*Биржи:* ${LIBERTAS_KB.exchanges.join(', ')}\n\n` +
    `*Агенты:*\n${LIBERTAS_KB.agents.map(a => `• ${a}`).join('\n')}`,
    { parse_mode: 'Markdown' }
  );
});

// ===== ДЕРЕВО =====
bot.hears('🌳 Дерево', (ctx) => {
  if (!isAdmin(ctx)) return;
  const t = LIBERTAS_KB.tree;
  ctx.reply(
    '*🌱 КОРНИ:* ' + t.roots + '\n\n' +
    '*🪵 СТВОЛ:* ' + t.trunk + '\n\n' +
    '*🌿 ВЕТВЬ #1:* ' + t.branch1 + '\n\n' +
    '*🌿 ВЕТВЬ #2:* ' + t.branch2 + '\n\n' +
    '*🍃 ЛИСТЬЯ:* ' + t.leaves,
    { parse_mode: 'Markdown' }
  );
});

// ===== АГЕНТЫ =====
bot.hears('🤖 Агенты', (ctx) => {
  if (!isAdmin(ctx)) return;
  ctx.reply(
    '*🤖 ОРКЕСТР АГЕНТОВ:*\n\n' +
    LIBERTAS_KB.agents.map(a => `• ${a}`).join('\n') + '\n\n' +
    '*Внешние репо:*\n• patchy631/ai-engineering-hub (27.3k ⭐)\n• CodeRabbit ✅ активен',
    { parse_mode: 'Markdown' }
  );
});

// ===== ДОБАВИТЬ ЗАДАЧУ =====
bot.command('task', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const task = ctx.message.text.replace('/task', '').trim();
  if (!task) return ctx.reply('Напиши: /task описание задачи');
  await supabase.from('tasks').insert({
    description: task,
    status: 'pending',
    created_at: new Date().toISOString()
  });
  ctx.reply(`✅ *Задача сохранена:*\n"${task}"`, { parse_mode: 'Markdown' });
});

bot.hears('✅ Задача', (ctx) => {
  if (!isAdmin(ctx)) return;
  ctx.reply(
    '✅ *Добавить задачу:*\n\n`/task текст задачи`\n\nПример:\n`/task Зарегистрировать OpenRouter`',
    { parse_mode: 'Markdown' }
  );
});

// ===== СПИСОК ЗАДАЧ =====
bot.hears('📋 Задачи', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const { data } = await supabase
    .from('tasks').select('*')
    .order('created_at', { ascending: false }).limit(15);

  let msg = '📋 *ЗАДАЧИ:*\n\n';
  if (!data?.length) {
    msg += '*Нерешённые (из базы):*\n';
    msg += LIBERTAS_KB.todo.map((t, i) => `${i + 1}. ⏳ ${t}`).join('\n');
  } else {
    data.forEach(t => {
      const e = t.status === 'done' ? '✅' : t.status === 'in_progress' ? '🔄' : '⏳';
      msg += `${e} ${t.description}\n`;
    });
  }
  ctx.reply(msg, { parse_mode: 'Markdown' });
});

// ===== ЗАВЕРШИТЬ ЗАДАЧУ =====
bot.command('done', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const text = ctx.message.text.replace('/done', '').trim();
  if (!text) return ctx.reply('Напиши: /done текст задачи');
  const { data } = await supabase.from('tasks').select('id, description').limit(20);
  const task = data?.find(t => t.description.toLowerCase().includes(text.toLowerCase()));
  if (!task) return ctx.reply(`❌ Задача не найдена: "${text}"`);
  await supabase.from('tasks').update({ status: 'done' }).eq('id', task.id);
  ctx.reply(`✅ Выполнено: "${task.description}"`);
});

// ===== КЛЮЧИ =====
bot.hears('🔑 Ключи', (ctx) => {
  if (!isAdmin(ctx)) return;
  ctx.reply(
    '🔑 *СТАТУС КЛЮЧЕЙ:*\n\n' +
    `Supabase: ${process.env.SUPABASE_URL ? '✅ подключён' : '❌ нет'}\n` +
    `Telegram Bot: ✅ активен\n` +
    `OpenRouter: ${process.env.OPENROUTER_API_KEY ? '✅' : '❌ нужно создать'}\n` +
    `Helius: ${process.env.HELIUS_API_KEY ? '✅' : '❌ нужно создать'}\n\n` +
    `*Ключи храни:* Railway Variables\n` +
    `*НЕ В GitHub!*`,
    { parse_mode: 'Markdown' }
  );
});

// ===== 🧠 ОБУЧЕНИЕ SUS =====
bot.command('learn', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const knowledge = ctx.message.text.replace('/learn', '').trim();
  if (!knowledge) return ctx.reply(
    '📚 *Как передать знание SUS:*\n\n`/learn тема: содержание`\n\n*Примеры:*\n`/learn токеномика: AURA 1млрд эмиссия`\n`/learn roadmap: Q2 2026 запуск NFT`\n`/learn партнёр: компания X договорились о коллаборации`',
    { parse_mode: 'Markdown' }
  );

  const { error } = await supabase.from('knowledge').insert({
    content: knowledge,
    source: 'architect',
    created_at: new Date().toISOString()
  });

  if (error) {
    return ctx.reply(
      `❌ Ошибка: ${error.message}\n\nСоздай таблицу knowledge в Supabase!`,
      { parse_mode: 'Markdown' }
    );
  }

  ctx.reply(
    `🧠 *Знание сохранено!*\n\n"${knowledge.substring(0, 200)}${knowledge.length > 200 ? '...' : ''}"`,
    { parse_mode: 'Markdown' }
  );
});

// ===== 🔍 ПОИСК В ЗНАНИЯХ =====
bot.command('recall', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const query = ctx.message.text.replace('/recall', '').trim();
  if (!query) return ctx.reply('Формат: /recall ключевое слово');

  const { data, error } = await supabase
    .from('knowledge')
    .select('*')
    .ilike('content', `%${query}%`)
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) return ctx.reply(`❌ Таблица knowledge не создана ещё`);
  if (!data?.length) return ctx.reply(`❌ По запросу *"${query}"* ничего не найдено`, { parse_mode: 'Markdown' });

  let msg = `🔍 *Найдено по "${query}":*\n\n`;
  data.forEach((k, i) => {
    msg += `${i + 1}. ${k.content.substring(0, 200)}\n\n`;
  });
  ctx.reply(msg, { parse_mode: 'Markdown' });
});

// ===== 📚 КНОПКА ЗНАНИЯ =====
bot.hears('📚 Знания', (ctx) => {
  if (!isAdmin(ctx)) return;
  ctx.reply(
    '📚 *ПАМЯТЬ SUS:*\n\n' +
    '*Добавить знание:*\n`/learn тема: текст`\n\n' +
    '*Найти знание:*\n`/recall ключевое слово`\n\n' +
    '*Примеры:*\n' +
    '`/learn архитектура: VERITAS метавселенная 5 бирж`\n' +
    '`/learn контакт: Иван Иванов партнёр +7...`\n' +
    '`/learn идея: NFT даёт доступ к голосованию`\n\n' +
    '⚠️ Сначала создай таблицу *knowledge* в Supabase!',
    { parse_mode: 'Markdown' }
  );
});

// ===== ПОМОЩЬ =====
bot.hears('❓ Помощь', (ctx) => {
  if (!isAdmin(ctx)) return;
  ctx.reply(
    '📖 *SUS v2.1 КОМАНДЫ:*\n\n' +
    '📊 Статус — готовность экосистемы\n' +
    '🧠 База знаний — проект LIBERTAS\n' +
    '🌳 Дерево — структура экосистемы\n' +
    '🤖 Агенты — оркестр ИИ\n' +
    '✅ Задача — добавить задачу\n' +
    '📋 Задачи — список задач\n' +
    '🔑 Ключи — статус API ключей\n' +
    '📚 Знания — память SUS\n\n' +
    '*/task [текст]* — добавить задачу\n' +
    '*/done [текст]* — завершить задачу\n' +
    '*/learn [тема: текст]* — обучить SUS\n' +
    '*/recall [слово]* — найти в памяти\n\n' +
    '🤖 *SUS v2.1* · LIBERTAS Ecosystem · 02.03.2026',
    { parse_mode: 'Markdown' }
  );
});

// ===== ЛЮБОЙ ТЕКСТ =====
bot.on('text', (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply('⛔ Нет доступа');
  ctx.reply(
    '🤖 Используй кнопки меню.\n\n*Команды:*\n/task [задача]\n/done [задача]\n/learn [знание]\n/recall [поиск]',
    { parse_mode: 'Markdown' }
  );
});

bot.launch({ dropPendingUpdates: true });
console.log('🤖 SUS v2.1 запущен · LIBERTAS ONLINE · 02.03.2026');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
