"""
VERITAS LIBERTAS — SUS Bot v3.0 AUTONOMOUS
Railway Deploy-Ready · aiogram3 + OpenRouter + Supabase + APScheduler
Autonomous jobs: morning/evening posts, weekly report, health check, easter egg
"""
import asyncio, json, logging, os, random, tempfile
from datetime import datetime, timezone, timedelta
from typing import Optional
import httpx
from aiogram import Bot, Dispatcher, F, Router
from aiogram.filters import Command, CommandStart
from aiogram.types import Message, InlineKeyboardMarkup, InlineKeyboardButton, BotCommand
from aiogram.enums import ParseMode
from aiogram.client.default import DefaultBotProperties
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from dotenv import load_dotenv
try:
    from supabase import create_client
    SUPA_OK = True
except:
    SUPA_OK = False

load_dotenv()

# ═══ CONFIG ════════════════════════════════════════════════════════
TG_TOKEN   = os.getenv("TELEGRAM_TOKEN","")
TG_CH_RU   = os.getenv("TELEGRAM_CHANNEL_RU","")
TG_CH_US   = os.getenv("TELEGRAM_CHANNEL_US","")
ADMIN_ID   = int(os.getenv("ADMIN_CHAT_ID","0"))
OR_KEY     = os.getenv("OPENROUTER_API_KEY","")
SUPA_URL   = os.getenv("SUPABASE_URL","")
SUPA_KEY   = os.getenv("SUPABASE_SERVICE_KEY","") or os.getenv("SUPABASE_KEY","")
EL_KEY     = os.getenv("ELEVENLABS_API_KEY","")
HEDRA_KEY  = os.getenv("HEDRA_API_KEY","")
LATE_KEY   = os.getenv("LATE_API_KEY","")
YT_RU      = os.getenv("YOUTUBE_TOKEN_RU","")
YT_US      = os.getenv("YOUTUBE_TOKEN_US","")
SPARK_SEC  = os.getenv("SPARK_INTERNAL_SECRET","")
SITE       = "https://veritas-libertas.netlify.app"

MODELS = [
    "anthropic/claude-sonnet-4-5",
    "x-ai/grok-3",
    "google/gemini-2.0-flash-001",
    "deepseek/deepseek-chat-v3-0324",
    "meta-llama/llama-3.3-70b-instruct:free",
]
FAST  = "anthropic/claude-haiku-4-5"
SMART = "anthropic/claude-sonnet-4-5"

SYSTEM = f"""Ты SUS — ИИ-интерфейс VERITAS LIBERTAS. Архитектор: Sergo.
Помогаешь с: Genesis NFT ($30, Solana), AURA Token, SPARK, Studio, Aureon L3 ZK-Rollup.
Стиль: умный, конкретный, ≤150 слов. Studio → {SITE}. Не выдумывай если не знаешь."""

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s — %(message)s")
log = logging.getLogger("sus")

bot       = Bot(token=TG_TOKEN, default=DefaultBotProperties(parse_mode=ParseMode.MARKDOWN))
dp        = Dispatcher()
sched     = AsyncIOScheduler(timezone="UTC")
supa      = create_client(SUPA_URL, SUPA_KEY) if (SUPA_OK and SUPA_URL and SUPA_KEY) else None
history: dict[int,list] = {}

# ═══ SUPABASE ══════════════════════════════════════════════════════
async def sb(method:str, path:str, data:dict=None) -> list|bool:
    if not SUPA_URL: return [] if method=="GET" else False
    try:
        headers = {"apikey":SUPA_KEY,"Authorization":f"Bearer {SUPA_KEY}","Content-Type":"application/json","Prefer":"return=minimal"}
        async with httpx.AsyncClient(timeout=10) as c:
            if method=="GET":
                r = await c.get(f"{SUPA_URL}/rest/v1/{path}", headers=headers)
                return r.json() if r.status_code==200 else []
            elif method=="POST":
                r = await c.post(f"{SUPA_URL}/rest/v1/{path}", headers=headers, json=data)
                return r.status_code < 300
            elif method=="PATCH":
                table,qry = path.split("?",1)
                r = await c.patch(f"{SUPA_URL}/rest/v1/{table}?{qry}", headers=headers, json=data)
                return r.status_code < 300
    except Exception as e:
        log.debug(f"[SB] {e}")
        return [] if method=="GET" else False

# ═══ AI ENGINE ═════════════════════════════════════════════════════
async def ai(msgs:list, model:str=None, max_t:int=600) -> str:
    for m in ([model]+MODELS if model else MODELS):
        if not m: continue
        try:
            async with httpx.AsyncClient(timeout=45) as c:
                r = await c.post("https://openrouter.ai/api/v1/chat/completions",
                    headers={"Authorization":f"Bearer {OR_KEY}","HTTP-Referer":SITE,"X-Title":"VERITAS SUS"},
                    json={"model":m,"max_tokens":max_t,"messages":msgs})
                d = r.json()
                if "choices" in d:
                    log.info(f"[AI] ✓ {m}")
                    return d["choices"][0]["message"]["content"].strip()
        except Exception as e:
            log.warning(f"[AI] {m}: {e}")
    return "⚠️ AI недоступен. Попробуй позже."

async def chat(uid:int, text:str) -> str:
    history.setdefault(uid,[])
    history[uid].append({"role":"user","content":text})
    msgs = [{"role":"system","content":SYSTEM}] + history[uid][-10:]
    reply = await ai(msgs)
    history[uid].append({"role":"assistant","content":reply})
    return reply

async def gen_post(topic:str, lang:str="ru") -> dict:
    p = f"""Создай Telegram-пост. Тема: "{topic}". Язык: {lang}.
Хук первой строкой. 3-4 тезиса ценности. CTA: {SITE}/genesis.html. 5-7 хэштегов.
JSON только: {{"caption":"...","hashtags":["..."]}}"""
    raw = await ai([{"role":"user","content":p}], model=FAST, max_t=700)
    try: return json.loads(raw.replace("```json","").replace("```","").strip())
    except: return {"caption":raw,"hashtags":["#VERITAS","#AI","#Web3"]}

async def gen_script(topic:str, lang:str="ru") -> str:
    langs = {"ru":"русском","en":"English","es":"español"}
    return await ai([{"role":"user","content":
        f"""YouTube сценарий на {langs.get(lang,'русском')}: "{topic}". ~8 минут.
Структура: ХOOK(30сек) → ОБЕЩАНИЕ(30сек) → 5 БЛОКОВ → [PP-ВСТАВКА: упомяни VERITAS органично 45сек] → CTA(30сек: {SITE}/genesis.html).
Добавляй [ПАУЗА] между блоками."""}], model=SMART, max_t=2500)

async def gen_meta(topic:str, lang:str="en") -> dict:
    raw = await ai([{"role":"user","content":
        f"""YouTube SEO. Topic: "{topic}". Lang: {lang}.
JSON only: {{"title":"60-70 chars","description":"300 chars + CTA {SITE}/genesis.html","tags":["...×15"],"thumbnail_text":"4-6 words"}}"""}],
        model=FAST, max_t=500)
    try: return json.loads(raw.replace("```json","").replace("```","").strip())
    except: return {"title":topic[:70],"description":f"{topic}\n\n🔮 {SITE}/genesis.html","tags":["AI","VERITAS","Web3"],"thumbnail_text":"VERITAS 2026"}

async def trending(lang:str="ru") -> str:
    return await ai([{"role":"user","content":
        f"Дай ОДНУ горячую тему AI+крипто+tech которая получит максимум просмотров сегодня. Аудитория: {lang}. Только тема, одна строка."}],
        model=FAST, max_t=60)

# ═══ POSTING ═══════════════════════════════════════════════════════
async def tg_post(ch:str, text:str) -> bool:
    if not ch or not TG_TOKEN: return False
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.post(f"https://api.telegram.org/bot{TG_TOKEN}/sendMessage",
                json={"chat_id":ch,"text":text,"parse_mode":"Markdown"})
            return r.status_code==200
    except Exception as e:
        log.error(f"[TG] {e}"); return False

async def late_post(video_url:str, caption:str, platforms:list) -> bool:
    if not LATE_KEY or not video_url: return False
    try:
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.post("https://api.getlate.dev/v1/posts",
                headers={"Authorization":f"Bearer {LATE_KEY}","Content-Type":"application/json"},
                json={"platforms":platforms,"media_url":video_url,"caption":caption})
            ok = r.status_code < 300
            log.info(f"[Late] {'✓' if ok else '✗'} {platforms}")
            return ok
    except Exception as e:
        log.error(f"[Late] {e}"); return False

# ═══ AUTONOMOUS JOBS ═══════════════════════════════════════════════
async def job_morning():
    """09:00 UTC — auto post RU + add to YT queue"""
    log.info("[JOB] Morning post")
    try:
        topic = await trending("ru")
        post  = await gen_post(topic,"ru")
        cap   = post.get("caption","")
        tags  = " ".join(f"#{t.replace(' ','')}" for t in post.get("hashtags",[])[:7])
        ok    = await tg_post(TG_CH_RU, f"{cap}\n\n{tags}")
        await sb("POST","events",{"type":"auto_morning","payload":json.dumps({"topic":topic,"ok":ok}),"created_at":datetime.now(timezone.utc).isoformat()})
        log.info(f"[JOB] Morning: {'✓' if ok else '✗'} — {topic[:40]}")
    except Exception as e: log.error(f"[JOB] Morning error: {e}")

async def job_evening():
    """18:00 UTC — auto post EN/US + queue YouTube"""
    log.info("[JOB] Evening post")
    try:
        topic = await trending("en")
        post  = await gen_post(topic,"en")
        cap   = post.get("caption","")
        tags  = " ".join(f"#{t.replace(' ','')}" for t in post.get("hashtags",[])[:6])
        txt   = f"{cap}\n\n{tags}\n\n🔮 {SITE}/genesis.html"
        ok_us = await tg_post(TG_CH_US, txt)
        # Also post RU version
        post_ru = await gen_post(topic,"ru")
        ok_ru   = await tg_post(TG_CH_RU, post_ru.get("caption","") + f"\n\n🔮 {SITE}/genesis.html")
        # Queue for YouTube
        await sb("POST","veritas_tv_queue",{"topic_ru":topic,"topic_es":topic,"priority":7,"status":"pending","created_at":datetime.now(timezone.utc).isoformat()})
        log.info(f"[JOB] Evening: RU={'✓' if ok_ru else '✗'} US={'✓' if ok_us else '✗'}")
    except Exception as e: log.error(f"[JOB] Evening error: {e}")

async def job_weekly():
    """Mon 08:00 UTC — ecosystem report to admin"""
    log.info("[JOB] Weekly report")
    try:
        wl  = await sb("GET","waitlist?select=id,tier") or []
        nft = await sb("GET","nft_holdings?nft_tier=eq.genesis&select=id") or []
        vid = await sb("GET","veritas_tv_videos?select=id&created_at=gte." +
                       (datetime.now(timezone.utc)-timedelta(days=7)).isoformat()) or []
        founders = sum(1 for w in wl if isinstance(w,dict) and w.get("tier")=="founder")
        report = (
            f"📊 *ЕЖЕНЕДЕЛЬНЫЙ ОТЧЁТ VERITAS*\n`{datetime.now(timezone.utc).strftime('%d.%m.%Y')}`\n\n"
            f"👥 Waitlist: *{len(wl)}* ({founders} founders)\n"
            f"🪙 Genesis NFT: *{len(nft)}*/10,000\n"
            f"🎬 Видео за неделю: *{len(vid)}*\n\n"
            f"🌳 Ecosystem:\n• Studio: 72% • SUS: 75%\n• NFT+Shadow: 58% • TV: 60%\n• TOTAL: ~56%\n\n"
            f"🔴 Блокеры: OÜ registration → 1office.eu\n⚡ {SITE}"
        )
        if ADMIN_ID: await bot.send_message(ADMIN_ID, report)
        if TG_CH_RU: await tg_post(TG_CH_RU, report)
        await sb("POST","daily_reports",{"report_date":datetime.now(timezone.utc).date().isoformat(),"channel":"weekly_admin","summary":json.dumps({"wl":len(wl),"nfts":len(nft),"vids":len(vid)}),"created_at":datetime.now(timezone.utc).isoformat()})
    except Exception as e: log.error(f"[JOB] Weekly error: {e}")

async def job_easter():
    """Every 6h — post easter egg hint if new video"""
    try:
        vids = await sb("GET","veritas_tv_videos?order=created_at.desc&limit=1&status=eq.published") or []
        if vids and isinstance(vids,list) and random.random()<0.15:
            yt = vids[0].get("youtube_id_ru") or vids[0].get("youtube_id_us")
            if yt and TG_CH_RU:
                await tg_post(TG_CH_RU,
                    f"🥚 *EASTER EGG*\n\nВ новом видео спрятано золотое дерево VERITAS.\nПервый кто найдёт и напишет тайм-код в Telegram — получает *50 SPARK*!\n\n🎬 https://youtu.be/{yt}")
    except Exception as e: log.debug(f"[JOB] Easter: {e}")

async def job_health():
    """Every 30min — check services, alert admin"""
    issues = []
    checks = {"Supabase": SUPA_URL+"/rest/v1/", "OpenRouter":"https://openrouter.ai/api/v1/models"}
    for name,url in checks.items():
        try:
            async with httpx.AsyncClient(timeout=5) as c:
                r = await c.get(url)
                if r.status_code >= 500: issues.append(f"{name}: HTTP {r.status_code}")
        except: issues.append(f"{name}: unreachable")
    if issues and ADMIN_ID:
        await bot.send_message(ADMIN_ID, "⚠️ *SUS Health Alert:*\n" + "\n".join(issues))

# ═══ BOT HANDLERS ══════════════════════════════════════════════════
r = Router(name="main")

def is_admin(uid:int) -> bool:
    return ADMIN_ID==0 or uid==ADMIN_ID

@r.message(CommandStart())
async def start(msg:Message):
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🪙 Genesis NFT $30", url=f"{SITE}/genesis.html"),
         InlineKeyboardButton(text="⚡ Studio",          url=f"{SITE}/studio.html")],
        [InlineKeyboardButton(text="🏆 V-Score",         url=f"{SITE}/vscore.html"),
         InlineKeyboardButton(text="📊 Dashboard",       url=f"{SITE}/dashboard.html")],
        [InlineKeyboardButton(text="📺 VERITAS TV",      url=f"{SITE}/veritas-tv.html"),
         InlineKeyboardButton(text="🌐 Ecosystem",       url=SITE)],
    ])
    await msg.answer(
        f"🔮 *VERITAS LIBERTAS*\n\nЯ SUS — автономный ИИ экосистемы.\n\n"
        f"Задай любой вопрос или выбери раздел ниже 👇",
        reply_markup=kb)

@r.message(Command("post"))
async def cmd_post(msg:Message):
    if not is_admin(msg.from_user.id): return
    args = msg.text.split(maxsplit=1)
    topic = (await trending("ru")) if len(args)<2 or args[1]=="auto" else args[1]
    await msg.answer(f"✍️ Генерирую: *{topic}*")
    post = await gen_post(topic,"ru")
    cap  = post.get("caption","")
    tags = " ".join(f"#{t.replace(' ','')}" for t in post.get("hashtags",[])[:7])
    full = f"{cap}\n\n{tags}"
    ok_ru = await tg_post(TG_CH_RU, full) if TG_CH_RU else False
    ok_us = await tg_post(TG_CH_US, f"📌 {topic}\n\n🔮 {SITE}/genesis.html") if TG_CH_US else False
    await sb("POST","veritas_tv_queue",{"topic_ru":topic,"topic_es":topic,"priority":8,"status":"pending","created_at":datetime.now(timezone.utc).isoformat()})
    await msg.answer(f"✅ RU: {'✓' if ok_ru else '⛔'} · US: {'✓' if ok_us else '⛔'} · YT: в очереди\n`{topic[:50]}`")

@r.message(Command("script"))
async def cmd_script(msg:Message):
    if not is_admin(msg.from_user.id): return
    parts = msg.text.split(maxsplit=2)
    topic = parts[1] if len(parts)>1 else "AI замена профессий 2026"
    lang  = parts[2] if len(parts)>2 else "ru"
    await msg.answer(f"📝 Пишу сценарий ({lang}): *{topic}*\n_(20-30 сек)_")
    script = await gen_script(topic, lang)
    if len(script) > 3800:
        import os as _os
        with tempfile.NamedTemporaryFile(mode='w',suffix='.txt',delete=False,encoding='utf-8') as f:
            f.write(script); tmp=f.name
        await bot.send_document(msg.chat.id, open(tmp,'rb'), caption=f"📝 Сценарий: {topic}")
        _os.unlink(tmp)
    else:
        await msg.answer(f"```\n{script[:3800]}\n```")

@r.message(Command("optimize"))
async def cmd_optimize(msg:Message):
    if not is_admin(msg.from_user.id): return
    parts = msg.text.split(maxsplit=2)
    topic = parts[1] if len(parts)>1 else "AI 2026"
    lang  = parts[2] if len(parts)>2 else "en"
    meta  = await gen_meta(topic, lang)
    await msg.answer(
        f"✅ *YouTube Meta ({lang})*\n\n"
        f"📌 `{meta.get('title','')}`\n\n"
        f"📝 {meta.get('description','')[:250]}\n\n"
        f"🏷 {', '.join(meta.get('tags',[])[:8])}\n"
        f"🖼 `{meta.get('thumbnail_text','')}`")

@r.message(Command("queue"))
async def cmd_queue(msg:Message):
    if not is_admin(msg.from_user.id): return
    pending = await sb("GET","veritas_tv_queue?status=eq.pending&order=priority.desc&limit=5") or []
    pub     = await sb("GET","veritas_tv_videos?order=created_at.desc&limit=5") or []
    lines   = ["📺 *TV Queue*\n"]
    if pending:
        lines.append(f"⏳ Pending ({len(pending)}):")
        for q in pending[:3]: lines.append(f"  • `{q.get('topic_ru','?')[:40]}`")
    if pub:
        lines.append(f"\n📊 Published ({len(pub)} recent):")
        for v in pub[:3]:
            yt = v.get('youtube_id_ru') or '—'
            lines.append(f"  • {v.get('topic_ru','?')[:30]}" + (f"\n    youtu.be/{yt}" if yt!='—' else ''))
    await msg.answer("\n".join(lines))

@r.message(Command("stats"))
async def cmd_stats(msg:Message):
    wl  = await sb("GET","waitlist?select=id,tier") or []
    nft = await sb("GET","nft_holdings?nft_tier=eq.genesis&select=id") or []
    founders = sum(1 for w in wl if isinstance(w,dict) and w.get("tier")=="founder")
    await msg.answer(
        f"📊 *VERITAS LIVE*\n\n"
        f"👥 Waitlist: `{len(wl)}` ({founders} founders)\n"
        f"🪙 Genesis NFT: `{len(nft)}`/10,000\n"
        f"🌐 {SITE}")

@r.message(Command("announce"))
async def cmd_announce(msg:Message):
    if not is_admin(msg.from_user.id): return
    text = msg.text.replace("/announce","",1).strip()
    if not text: return await msg.answer("Usage: /announce [text]")
    results = []
    for name,ch in [("RU",TG_CH_RU),("US",TG_CH_US)]:
        if ch: results.append(f"{'✓' if await tg_post(ch,text) else '✗'} {name}")
    await msg.answer("📢 " + " · ".join(results) if results else "⛔ Нет каналов")

@r.message(Command("spark"))
async def cmd_spark(msg:Message):
    if not is_admin(msg.from_user.id): return
    parts = msg.text.split()
    if len(parts)<3: return await msg.answer("Usage: /spark [user_id] [amount]")
    uid,amount = parts[1],int(parts[2])
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.post(f"{SITE}/api/spark",
                headers={"Content-Type":"application/json","x-spark-secret":SPARK_SEC},
                json={"action":"credit","user_id":uid,"amount":amount,"reason":"admin_manual"})
            d = r.json()
        await msg.answer(f"⚡ {amount} SPARK → `{uid[:12]}...`\nБаланс: {d.get('balance','?')}" if d.get('ok') else f"✗ {d.get('error','unknown')}")
    except Exception as e: await msg.answer(f"✗ {e}")

@r.message(Command("us_channel"))
async def cmd_us(msg:Message):
    await msg.answer(
        f"🇺🇸 *US CHANNEL SETUP*\n\n"
        f"1⃣ Dolphin Anty: dolphin.ru.com (free)\n"
        f"2⃣ US ISP Proxy: netnut.io ($10/mo)\n"
        f"3⃣ Google аккаунт: smspva.com (~$3)\n"
        f"4⃣ Канал: *Veritas AI Daily*, US timezone\n"
        f"5⃣ OAuth2: console.cloud.google.com\n"
        f"   → YouTube Data API v3 → Credentials\n"
        f"6⃣ Env: `YOUTUBE_TOKEN_US` + `YOUTUBE_CHANNEL_US`\n\n"
        f"📋 {SITE}/us-channel.html")

@r.message(Command("help"))
async def cmd_help(msg:Message):
    admin = is_admin(msg.from_user.id)
    base = "*SUS Bot v3.0*\n\n/start /stats /help\n"
    adm  = "\n*Admin:*\n/post [topic|auto]\n/script [topic] [lang]\n/optimize [topic] [lang]\n/queue\n/announce [text]\n/spark [uid] [amount]\n/us_channel" if admin else ""
    await msg.answer(base + adm)

@r.message(F.text)
async def handle(msg:Message):
    if msg.text and msg.text.startswith("/"): return
    if msg.chat.type != "private":
        me = await bot.get_me()
        if f"@{me.username}" not in (msg.text or ""): return
    await bot.send_chat_action(msg.chat.id,"typing")
    reply = await chat(msg.from_user.id, msg.text or "")
    await msg.answer(reply)
    asyncio.create_task(sb("POST","messages",{"user_id":str(msg.from_user.id),"content":(msg.text or "")[:500],"role":"user","created_at":datetime.now(timezone.utc).isoformat()}))

# ═══ STARTUP ═══════════════════════════════════════════════════════
async def on_startup():
    log.info("=== SUS v3.0 AUTONOMOUS starting ===")
    missing = [v for v in ["TELEGRAM_TOKEN","OPENROUTER_API_KEY"] if not os.getenv(v)]
    if missing: log.error(f"MISSING: {missing}")

    await bot.set_my_commands([
        BotCommand(command="start",    description="Главное меню"),
        BotCommand(command="stats",    description="Статистика экосистемы"),
        BotCommand(command="post",     description="[Admin] Создать пост"),
        BotCommand(command="script",   description="[Admin] Сценарий видео"),
        BotCommand(command="optimize", description="[Admin] YouTube метаданные"),
        BotCommand(command="queue",    description="[Admin] Очередь контента"),
        BotCommand(command="announce", description="[Admin] Анонс в каналы"),
        BotCommand(command="spark",    description="[Admin] Выдать SPARK"),
        BotCommand(command="help",     description="Справка"),
    ])

    sched.add_job(job_morning, CronTrigger(hour=9,  minute=0),  id="morning", replace_existing=True)
    sched.add_job(job_evening, CronTrigger(hour=18, minute=0),  id="evening", replace_existing=True)
    sched.add_job(job_weekly,  CronTrigger(day_of_week="mon", hour=8, minute=0), id="weekly", replace_existing=True)
    sched.add_job(job_easter,  CronTrigger(hour="*/6", minute=30), id="easter", replace_existing=True)
    sched.add_job(job_health,  CronTrigger(minute="*/30"), id="health", replace_existing=True)
    sched.start()
    log.info(f"Scheduler: {len(sched.get_jobs())} jobs active")

    if ADMIN_ID:
        status = (
            f"✅ *SUS v3.0 AUTONOMOUS запущен*\n\n"
            f"⚙️ Jobs: morning·evening·weekly·easter·health\n"
            f"🤖 Models: Claude→Grok→Gemini→DeepSeek→Llama\n"
            f"🗄 Supabase: {'✓' if supa else '⚠️'}\n"
            f"📺 Late API: {'✓' if LATE_KEY else '⚠️ set LATE_API_KEY'}\n"
            f"▶️ YouTube RU: {'✓' if YT_RU else '⚠️ set YOUTUBE_TOKEN_RU'}\n"
            f"🇺🇸 YouTube US: {'✓' if YT_US else '⚠️ set YOUTUBE_TOKEN_US'}\n\n"
            f"🌐 {SITE}"
        )
        try: await bot.send_message(ADMIN_ID, status)
        except Exception as e: log.warning(f"Startup notify: {e}")

async def main():
    dp.include_router(r)
    dp.startup.register(on_startup)
    await dp.start_polling(bot, allowed_updates=["message","callback_query"])

if __name__ == "__main__":
    asyncio.run(main())
