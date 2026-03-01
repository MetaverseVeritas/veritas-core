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

bot.start((ctx) => {
  if (!isAdmin(ctx)) return ctx.reply('⛔ Доступ запрещён');
  ctx.reply(
    `🤖 *SUS онлайн. Архитектор, жду команд.*`,
    {
      parse_mode: 'Markdown',
      ...Markup.keyboard([
        ['📊 Статус', '🧠 Память'],
        ['✅ Задача', '🔑 Ключи'],
        ['📋 Помощь']
      ]).resize()
    }
  );
});

bot.hears('📊 Статус', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const { data } = await supabase
    .from('ecosystem_status')
    .select('*')
    .order('updated_at', { ascending: false });
  let msg = '🌳 *СТАТУС LIBERTAS:*\n\n';
  if (data && data.length > 0) {
    data.forEach(item => {
      const bar = '█'.repeat(Math.floor(item.progress/10)) + 
                  '░'.repeat(10 - Math.floor(item.progress/10));
      msg += `*${item.component}*\n${bar} ${item.progress}%\n\n`;
    });
  } else {
    msg += '🌱 Aureon: 31%\n🪵 VERITAS: 23%\n🌿 SUS: 38%\n🌸 NFT: 40%';
  }
  ctx.reply(msg, { parse_mode: 'Markdown' });
});

bot.hears('🧠 Память', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const { data } = await supabase
    .from('tasks').select('*')
    .order('created_at', { ascending: false }).limit(10);
  if (!data || !data.length) return ctx.reply('Память пуста');
  let msg = '🧠 *Последние задачи:*\n\n';
  data.forEach(t => {
    const e = t.status==='done'?'✅':t.status==='in_progress'?'🔄':'⏳';
    msg += `${e} ${t.description}\n`;
  });
  ctx.reply(msg, { parse_mode: 'Markdown' });
});

bot.command('task', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const task = ctx.message.text.replace('/task','').trim();
  if (!task) return ctx.reply('Напиши: /task описание задачи');
  await supabase.from('tasks').insert({
    description: task, status: 'pending',
    created_at: new Date().toISOString()
  });
  ctx.reply(`✅ Задача сохранена:\n"${task}"`);
});

bot.hears('✅ Задача', (ctx) => {
  if (!isAdmin(ctx)) return;
  ctx.reply('Напиши: `/task что нужно сделать`', {parse_mode:'Markdown'});
});

bot.hears('🔑 Ключи', (ctx) => {
  if (!isAdmin(ctx)) return;
  ctx.reply(
    '🔑 *Статус ключей:*\n\n' +
    `Supabase: ${process.env.SUPABASE_URL?'✅':'❌'}\n` +
    `Telegram: ✅\n` +
    `OpenRouter: ${process.env.OPENROUTER_API_KEY?'✅':'❌'}\n` +
    `Helius: ${process.env.HELIUS_API_KEY?'✅':'❌'}`,
    {parse_mode:'Markdown'}
  );
});

bot.hears('📋 Помощь', (ctx) => {
  if (!isAdmin(ctx)) return;
  ctx.reply(
    '📋 *Команды SUS:*\n\n/task [текст] — задача\n📊 Статус\n🧠 Память\n🔑 Ключи\n\n🤖 SUS v1.0',
    {parse_mode:'Markdown'}
  );
});

bot.on('text', (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply('⛔ Нет доступа');
  ctx.reply('Используй кнопки или /task');
});

bot.launch();
console.log('🤖 SUS запущен');
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
