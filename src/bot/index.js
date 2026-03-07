/**
 * VERITAS LIBERTAS — SUS Bot v3.0 AUTONOMOUS
 * Node.js · grammy + node-cron + OpenRouter + Supabase
 * Autonomous jobs: morning/evening posts, weekly report, health check
 */

const { Bot, InlineKeyboard } = require("grammy");
const { createClient } = require("@supabase/supabase-js");
const cron = require("node-cron");
const fetch = require("node-fetch");
const dotenv = require("dotenv");
dotenv.config();

// ═══ CONFIG ════════════════════════════════════════════════════════
const TG_TOKEN  = process.env.TELEGRAM_TOKEN || "";
const TG_CH_RU  = process.env.TELEGRAM_CHANNEL_RU || "";
const TG_CH_US  = process.env.TELEGRAM_CHANNEL_US || "";
const ADMIN_ID  = parseInt(process.env.ADMIN_CHAT_ID || "0");
const OR_KEY    = process.env.OPENROUTER_API_KEY || "";
const SUPA_URL  = process.env.SUPABASE_URL || "";
const SUPA_KEY  = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || "";
const EL_KEY    = process.env.ELEVENLABS_API_KEY || "";
const LATE_KEY  = process.env.LATE_API_KEY || "";
const SITE      = "https://veritas-libertas.netlify.app";

const MODELS = [
  "anthropic/claude-sonnet-4-5",
  "x-ai/grok-3",
  "google/gemini-2.0-flash-001",
  "deepseek/deepseek-chat-v3-0324",
  "meta-llama/llama-3.3-70b-instruct:free",
];
const FAST  = "anthropic/claude-haiku-4-5";
const SMART = "anthropic/claude-sonnet-4-5";

const SYSTEM = `Ты SUS — ИИ-интерфейс VERITAS LIBERTAS. Архитектор: Sergo.
Помогаешь с: Genesis NFT ($30, Solana), AURA Token, SPARK, Studio, Aureon L3 ZK-Rollup.
Стиль: умный, конкретный, ≤150 слов. Studio → ${SITE}. Не выдумывай если не знаешь.`;

// ═══ ECOSYSTEM STATUS ══════════════════════════════════════════════
const ECO = {
  "🪨 ГРУНТ · OÜ":           20,
  "🌱 КОРНИ · Aureon":        47,
  "🪵 СТВОЛ · Metaverse":     36,
  "🌿 ВЕТВЬ1 · Studio":       74,
  "🌿 ВЕТВЬ2 · SUS Bot":      90,
  "🌸 ПОЧКИ · NFT+Shadow":    58,
  "📺 TG · Каналы":           95,
  "🍃 ЛИСТЬЯ · DigitalCourt": 18,
};

function ecoStatus() {
  const lines = Object.entries(ECO).map(([k, v]) => {
    const filled = Math.round(v / 10);
    const bar = "█".repeat(filled) + "░".repeat(10 - filled);
    return `${k}\n${bar} ${v}%`;
  });
  const total = Math.round(Object.values(ECO).reduce((a, b) => a + b, 0) / Object.keys(ECO).length);
  return lines.join("\n\n") + `\n\n━━━━━━━━━━\n🌍 ОБЩАЯ: ${total}%`;
}

// ═══ SUPABASE ══════════════════════════════════════════════════════
const supa = SUPA_URL && SUPA_KEY ? createClient(SUPA_URL, SUPA_KEY) : null;

async function sbPost(table, data) {
  if (!supa) return false;
  try {
    const { error } = await supa.from(table).insert(data);
    return !error;
  } catch { return false; }
}

async function sbGet(table, query = "") {
  if (!supa) return [];
  try {
    let q = supa.from(table).select("*");
    const { data } = await q;
    return data || [];
  } catch { return []; }
}

// ═══ AI ENGINE ═════════════════════════════════════════════════════
async function ai(messages, model = null, maxTokens = 600) {
  const tryModels = model ? [model, ...MODELS] : MODELS;
  for (const m of tryModels) {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OR_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": SITE,
          "X-Title": "VERITAS SUS",
        },
        body: JSON.stringify({ model: m, max_tokens: maxTokens, messages }),
      });
      const d = await res.json();
      if (d.choices?.[0]?.message?.content) {
        console.log(`[AI] ✓ ${m}`);
        return d.choices[0].message.content.trim();
      }
    } catch (e) {
      console.warn(`[AI] ${m}: ${e.message}`);
    }
  }
  return "⚠️ AI недоступен. Попробуй позже.";
}

const history = {};

async function chat(uid, text) {
  if (!history[uid]) history[uid] = [];
  history[uid].push({ role: "user", content: text });
  const msgs = [{ role: "system", content: SYSTEM }, ...history[uid].slice(-10)];
  const reply = await ai(msgs);
  history[uid].push({ role: "assistant", content: reply });
  return reply;
}

async function genPost(topic, lang = "ru") {
  const prompt = `Создай Telegram-пост. Тема: "${topic}". Язык: ${lang}.
Хук первой строкой. 3-4 тезиса ценности. CTA: ${SITE}/genesis.html. 5-7 хэштегов.
JSON только: {"caption":"...","hashtags":["..."]}`;
  const raw = await ai([{ role: "user", content: prompt }], FAST, 700);
  try {
    return JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch {
    return { caption: raw, hashtags: ["#VERITAS", "#AI", "#Web3"] };
  }
}

async function genScript(topic, lang = "ru") {
  const langs = { ru: "русском", en: "English", es: "español" };
  return ai([{ role: "user", content:
    `YouTube сценарий на ${langs[lang] || "русском"}: "${topic}". ~8 минут.
Структура: ХOOK(30сек) → ОБЕЩАНИЕ(30сек) → 5 БЛОКОВ → [PP-ВСТАВКА: VERITAS органично 45сек] → CTA(30сек: ${SITE}/genesis.html).
Добавляй [ПАУЗА] между блоками.`
  }], SMART, 2500);
}

async function trending(lang = "ru") {
  return ai([{ role: "user", content:
    `Дай ОДНУ горячую тему AI+крипто+tech которая получит максимум просмотров сегодня. Аудитория: ${lang}. Только тема, одна строка.`
  }], FAST, 60);
}

// ═══ POSTING ═══════════════════════════════════════════════════════
async function tgPost(ch, text) {
  if (!ch || !TG_TOKEN) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: ch, text, parse_mode: "Markdown" }),
    });
    return res.ok;
  } catch (e) {
    console.error(`[TG] ${e.message}`);
    return false;
  }
}

// ═══ AUTONOMOUS JOBS ═══════════════════════════════════════════════
async function jobMorning() {
  console.log("[JOB] Morning post");
  try {
    const topic = await trending("ru");
    const post  = await genPost(topic, "ru");
    const tags  = (post.hashtags || []).slice(0, 7).map(t => `#${t.replace(/[# ]/g, "")}`).join(" ");
    const ok    = await tgPost(TG_CH_RU, `${post.caption}\n\n${tags}`);
    await sbPost("events", { type: "auto_morning", payload: JSON.stringify({ topic, ok }), created_at: new Date().toISOString() });
    console.log(`[JOB] Morning: ${ok ? "✓" : "✗"} — ${topic.slice(0, 40)}`);
  } catch (e) { console.error(`[JOB] Morning error: ${e.message}`); }
}

async function jobEvening() {
  console.log("[JOB] Evening post");
  try {
    const topic   = await trending("en");
    const postEn  = await genPost(topic, "en");
    const postRu  = await genPost(topic, "ru");
    const tagsEn  = (postEn.hashtags || []).slice(0, 6).map(t => `#${t.replace(/[# ]/g, "")}`).join(" ");
    const okUs    = await tgPost(TG_CH_US, `${postEn.caption}\n\n${tagsEn}\n\n🔮 ${SITE}/genesis.html`);
    const okRu    = await tgPost(TG_CH_RU, `${postRu.caption}\n\n🔮 ${SITE}/genesis.html`);
    await sbPost("veritas_tv_queue", { topic_ru: topic, topic_es: topic, priority: 7, status: "pending", created_at: new Date().toISOString() });
    console.log(`[JOB] Evening: RU=${okRu ? "✓" : "✗"} US=${okUs ? "✓" : "✗"}`);
  } catch (e) { console.error(`[JOB] Evening error: ${e.message}`); }
}

async function jobWeekly() {
  console.log("[JOB] Weekly report");
  try {
    const wl  = await sbGet("waitlist");
    const nft = await sbGet("nft_holdings");
    const founders = wl.filter(w => w.tier === "founder").length;
    const report = `📊 *ЕЖЕНЕДЕЛЬНЫЙ ОТЧЁТ VERITAS*\n\`${new Date().toLocaleDateString("ru")}\`\n\n` +
      `👥 Waitlist: *${wl.length}* (${founders} founders)\n` +
      `🪙 Genesis NFT: *${nft.length}*/10,000\n\n` +
      `🌳 Ecosystem:\n${ecoStatus()}\n\n` +
      `⚡ ${SITE}`;
    if (ADMIN_ID) await bot.api.sendMessage(ADMIN_ID, report, { parse_mode: "Markdown" });
    if (TG_CH_RU) await tgPost(TG_CH_RU, report);
  } catch (e) { console.error(`[JOB] Weekly error: ${e.message}`); }
}

async function jobHealth() {
  const checks = {
    "Supabase": SUPA_URL + "/rest/v1/",
    "OpenRouter": "https://openrouter.ai/api/v1/models",
  };
  const issues = [];
  for (const [name, url] of Object.entries(checks)) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (r.status >= 500) issues.push(`${name}: HTTP ${r.status}`);
    } catch { issues.push(`${name}: unreachable`); }
  }
  if (issues.length && ADMIN_ID) {
    await bot.api.sendMessage(ADMIN_ID, `⚠️ *SUS Health Alert:*\n${issues.join("\n")}`, { parse_mode: "Markdown" });
  }
}

// ═══ BOT SETUP ═════════════════════════════════════════════════════
const bot = new Bot(TG_TOKEN);

const isAdmin = (id) => ADMIN_ID === 0 || id === ADMIN_ID;

bot.command("start", async (ctx) => {
  const kb = new InlineKeyboard()
    .url("🪙 Genesis NFT $30", `${SITE}/genesis.html`)
    .url("⚡ Studio", `${SITE}/studio.html`).row()
    .url("🏆 V-Score", `${SITE}/vscore.html`)
    .url("📊 Dashboard", `${SITE}/dashboard.html`).row()
    .url("📺 VERITAS TV", `${SITE}/veritas-tv.html`)
    .url("🌐 Ecosystem", SITE);
  await ctx.reply(
    `🔮 *VERITAS LIBERTAS — SUS v3.0*\n\nАвтономный ИИ-интерфейс экосистемы.\n\n${ecoStatus()}`,
    { parse_mode: "Markdown", reply_markup: kb }
  );
});

bot.command("eco", async (ctx) => {
  await ctx.reply(`🌳 *ECOSYSTEM STATUS*\n\n${ecoStatus()}`, { parse_mode: "Markdown" });
});

bot.command("stats", async (ctx) => {
  const wl  = await sbGet("waitlist");
  const nft = await sbGet("nft_holdings");
  const founders = wl.filter(w => w.tier === "founder").length;
  await ctx.reply(
    `📊 *VERITAS LIVE*\n\n👥 Waitlist: \`${wl.length}\` (${founders} founders)\n🪙 Genesis NFT: \`${nft.length}\`/10,000\n\n🌐 ${SITE}`,
    { parse_mode: "Markdown" }
  );
});

bot.command("post", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const args = ctx.message.text.split(" ").slice(1).join(" ");
  const topic = args === "auto" || !args ? await trending("ru") : args;
  await ctx.reply(`✍️ Генерирую: *${topic}*`, { parse_mode: "Markdown" });
  const post = await genPost(topic, "ru");
  const tags = (post.hashtags || []).slice(0, 7).map(t => `#${t.replace(/[# ]/g, "")}`).join(" ");
  const full = `${post.caption}\n\n${tags}`;
  const okRu = TG_CH_RU ? await tgPost(TG_CH_RU, full) : false;
  const okUs = TG_CH_US ? await tgPost(TG_CH_US, `📌 ${topic}\n\n🔮 ${SITE}/genesis.html`) : false;
  await sbPost("veritas_tv_queue", { topic_ru: topic, priority: 8, status: "pending", created_at: new Date().toISOString() });
  await ctx.reply(`✅ RU: ${okRu ? "✓" : "⛔"} · US: ${okUs ? "✓" : "⛔"} · YT: в очереди\n\`${topic.slice(0, 50)}\``, { parse_mode: "Markdown" });
});

bot.command("script", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const parts = ctx.message.text.split(" ");
  const topic = parts[1] || "AI замена профессий 2026";
  const lang  = parts[2] || "ru";
  await ctx.reply(`📝 Пишу сценарий (${lang}): *${topic}*`, { parse_mode: "Markdown" });
  const script = await genScript(topic, lang);
  if (script.length > 3800) {
    await ctx.reply("```\n" + script.slice(0, 3800) + "\n```\n_(продолжение — скажи /script снова)_", { parse_mode: "Markdown" });
  } else {
    await ctx.reply("```\n" + script + "\n```", { parse_mode: "Markdown" });
  }
});

bot.command("announce", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const text = ctx.message.text.replace("/announce", "").trim();
  if (!text) return ctx.reply("Usage: /announce [text]");
  const results = [];
  if (TG_CH_RU) results.push(`${await tgPost(TG_CH_RU, text) ? "✓" : "✗"} RU`);
  if (TG_CH_US) results.push(`${await tgPost(TG_CH_US, text) ? "✓" : "✗"} US`);
  await ctx.reply("📢 " + (results.join(" · ") || "⛔ Нет каналов"));
});

bot.command("queue", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const pending = await sbGet("veritas_tv_queue");
  const lines = ["📺 *TV Queue*\n"];
  if (pending.length) {
    lines.push(`⏳ Pending (${pending.length}):`);
    pending.slice(0, 5).forEach(q => lines.push(`  • \`${(q.topic_ru || "?").slice(0, 40)}\``));
  } else {
    lines.push("Очередь пуста");
  }
  await ctx.reply(lines.join("\n"), { parse_mode: "Markdown" });
});

bot.command("morning", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  await ctx.reply("🌅 Запускаю утренний пост...");
  await jobMorning();
  await ctx.reply("✅ Готово");
});

bot.command("evening", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  await ctx.reply("🌆 Запускаю вечерний пост...");
  await jobEvening();
  await ctx.reply("✅ Готово");
});

bot.command("help", async (ctx) => {
  const admin = isAdmin(ctx.from.id);
  let text = `*SUS Bot v3.0 AUTONOMOUS*\n\n/start — главное меню\n/eco — статус экосистемы\n/stats — статистика\n/help — справка`;
  if (admin) text += `\n\n*Admin:*\n/post [topic|auto]\n/script [topic] [lang]\n/announce [text]\n/queue\n/morning — тест утренний пост\n/evening — тест вечерний пост`;
  await ctx.reply(text, { parse_mode: "Markdown" });
});

bot.on("message:text", async (ctx) => {
  if (ctx.message.text.startsWith("/")) return;
  if (ctx.chat.type !== "private") {
    const me = await bot.api.getMe();
    if (!ctx.message.text.includes(`@${me.username}`)) return;
  }
  await ctx.replyWithChatAction("typing");
  const reply = await chat(ctx.from.id, ctx.message.text);
  await ctx.reply(reply, { parse_mode: "Markdown" }).catch(() => ctx.reply(reply));
  await sbPost("messages", {
    user_id: String(ctx.from.id),
    content: ctx.message.text.slice(0, 500),
    role: "user",
    created_at: new Date().toISOString(),
  });
});

// ═══ STARTUP ═══════════════════════════════════════════════════════
async function main() {
  console.log("=== SUS v3.0 AUTONOMOUS starting ===");

  if (!TG_TOKEN) { console.error("MISSING: TELEGRAM_TOKEN"); process.exit(1); }
  if (!OR_KEY)   console.warn("WARNING: OPENROUTER_API_KEY not set");

  // Autonomous jobs schedule
  // 09:00 UTC daily — morning post RU
  cron.schedule("0 9 * * *",   jobMorning, { timezone: "UTC" });
  // 18:00 UTC daily — evening post RU+US
  cron.schedule("0 18 * * *",  jobEvening, { timezone: "UTC" });
  // Monday 08:00 UTC — weekly report
  cron.schedule("0 8 * * 1",   jobWeekly,  { timezone: "UTC" });
  // Every 30min — health check
  cron.schedule("*/30 * * * *", jobHealth);

  console.log("[CRON] 4 jobs scheduled: morning·evening·weekly·health");

  // Notify admin on startup
  if (ADMIN_ID && TG_TOKEN) {
    try {
      const status =
        `✅ *SUS v3.0 AUTONOMOUS запущен*\n\n` +
        `⚙️ Jobs: morning(09:00)·evening(18:00)·weekly(Mon 08:00)·health(30min)\n` +
        `🤖 AI: Claude→Grok→Gemini→DeepSeek→Llama\n` +
        `🗄 Supabase: ${supa ? "✓" : "⚠️"}\n` +
        `📺 Late API: ${LATE_KEY ? "✓" : "⚠️ set LATE_API_KEY"}\n\n` +
        `📊 Ecosystem:\n${ecoStatus()}\n\n` +
        `🌐 ${SITE}`;
      await bot.api.sendMessage(ADMIN_ID, status, { parse_mode: "Markdown" });
    } catch (e) { console.warn(`Startup notify: ${e.message}`); }
  }

  await bot.start();
}

main().catch(console.error);
