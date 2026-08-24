/**
 * companion-pet, node half.
 *
 * Host-side behavior for the companion pet plugin: registers a static route
 * that serves the pet's transparent-GIF animation assets to the browser.
 * All pet behavior (idle loop, click reactions, late-night reminders,
 * input-mood detection) lives in the browser half (`lib/client.js`) and runs
 * locally with zero token consumption.
 *
 * Zero-dependency by design: no schemastery Config (the plugin takes no
 * configuration), so the package resolves anywhere the loader places it.
 */
import { createReadStream } from "node:fs";
import { statSync } from "node:fs";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

/** Cordis plugin name. */
const name = "companion-pet";

/**
 * Required services. Cordis forbids touching a service that is not declared
 * here ("cannot get property X without inject"), so every service we use at
 * runtime must be injected. All of these ship in dsh-base.
 */
const inject = [
  "webServer",
  "credentials",
  "sessions",
  "tokenMeter",
  "sessionTitle",
  "llm",
];

/** Route prefix serving the pet assets; no trailing slash. */
const PREFIX = "/companion-pet/assets";

/** Route prefix for the tiny JSON API the browser half consumes. */
const API_PREFIX = "/companion-pet/api";

/** Credential reference for the DeepSeek API key (default provider ref). */
const KEY_REF = "DEEPSEEK_API_KEY";

/** DeepSeek balance endpoint (public API). */
const BALANCE_URL = "https://api.deepseek.com/user/balance";

/** Cache the balance answer briefly so clicks never hammer the API. */
let balanceCache = { at: 0, data: null };
const BALANCE_TTL_MS = 30_000;

/** Cache the total-token answer briefly (tokens change per request). */
let tokensCache = { at: 0, data: null };
const TOKENS_TTL_MS = 5_000;

/** Daily budget tracker for the deep-companion agent (cheap, but capped). */
let hintBudget = { date: "", count: 0 };

/** Daily budget for the "💌 ask the cat" memory chat. */
let memChatBudget = { date: "", count: 0 };
const MEM_CHAT_DAILY = 10;

/** Daily budget for "🧠 memory extraction" (summarizes user inputs). */
let extractBudget = { date: "", count: 0 };
const EXTRACT_DAILY = 10;

/** Cache the per-session token ranking briefly. */
let sessionsCache = { at: 0, data: null };
const SESSIONS_TTL_MS = 10_000;

/** Collect a request body as UTF-8 text. */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/** MIME lookup for the small asset set we ship. */
const MIME = {
  ".gif": "image/gif",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".svg": "image/svg+xml",
};

/**
 * Resolve the DeepSeek API key through the credentials seam and ask the
 * official /user/balance endpoint. The key never leaves the host.
 */
async function fetchBalance(ctx) {
  try {
    const cred = await ctx.credentials.resolve(KEY_REF);
    if (!cred?.value) return { ok: false, error: "no-key" };
    const res = await fetch(BALANCE_URL, {
      headers: {
        authorization: `Bearer ${cred.value}`,
        accept: "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { ok: false, error: `http-${res.status}` };
    const json = await res.json();
    const infos = Array.isArray(json.balance_infos) ? json.balance_infos : [];
    const info = infos.find((b) => b?.currency === "CNY") ?? infos[0];
    return {
      ok: true,
      isAvailable: !!json.is_available,
      currency: info?.currency ?? null,
      total: info?.total_balance ?? null,
      granted: info?.granted_balance ?? null,
      toppedUp: info?.topped_up_balance ?? null,
    };
  } catch (error) {
    ctx.logger.warn(`companion-pet: balance query failed: ${error?.message ?? error}`);
    return { ok: false, error: "fetch-failed" };
  }
}

/** Read a session's REAL accumulated usage buckets via the tokenUsage
 * projection (folded from every assistant usage event — unlike
 * tokenMeter.measure, which is only the current context surface). */
function sessionUsage(session, projections) {
  const zero = { uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  if (!projections) return zero;
  try {
    const snap = projections.snapshot(session);
    const v = snap && snap.values && snap.values["tokenUsage"];
    if (!v) return zero;
    return {
      uncachedInputTokens: v.uncachedInputTokens || 0,
      outputTokens: v.outputTokens || 0,
      cacheReadTokens: v.cacheReadTokens || 0,
      cacheWriteTokens: v.cacheWriteTokens || 0,
    };
  } catch {
    return zero;
  }
}
function usageTotal(u) {
  return u.uncachedInputTokens + u.outputTokens + u.cacheReadTokens + u.cacheWriteTokens;
}

/**
 * Sum real accumulated usage across all live sessions (projection-based).
 */
async function fetchTotalTokens(ctx) {
  try {
    /* ctx.get() = strict GLOBAL read. The ctx.sessions property proxy is
       caller-scope bound and would see an empty store from a plugin. */
    const sessionsStore = ctx.get("sessions");
    const projections = ctx.get("sessionProjections");
    if (!sessionsStore) return { ok: false, error: "unavailable" };
    const totals = { uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
    for (const session of sessionsStore.list()) {
      try {
        const u = sessionUsage(session, projections);
        totals.uncachedInputTokens += u.uncachedInputTokens;
        totals.outputTokens += u.outputTokens;
        totals.cacheReadTokens += u.cacheReadTokens;
        totals.cacheWriteTokens += u.cacheWriteTokens;
      } catch {
        /* one session failing must not kill the total */
      }
    }
    return { ok: true, tokens: usageTotal(totals), buckets: totals };
  } catch (error) {
    ctx.logger.warn(`companion-pet: token total failed: ${error?.message ?? error}`);
    return { ok: false, error: "fetch-failed", detail: String(error?.message ?? error) };
  }
}

/**
 * Per-session real-usage ranking: every live session's accumulated tokens
 * (projection), titles when available, plus diagnostics when a session
 * fails so an empty list is never silently accepted.
 */
async function fetchSessionsRanking(ctx) {
  try {
    const sessionsStore = ctx.get("sessions");
    const projections = ctx.get("sessionProjections");
    const titleService = ctx.get("sessionTitle");
    if (!sessionsStore) return { ok: false, error: "unavailable" };
    const rows = [];
    let failed = 0;
    for (const session of sessionsStore.list()) {
      try {
        const u = sessionUsage(session, projections);
        let title = "";
        try {
          const t = titleService ? titleService.get(session) : "";
          title =
            typeof t === "string"
              ? t
              : t && typeof t.title === "string"
                ? t.title
                : "";
        } catch {
          title = "";
        }
        rows.push({
          id: String(session?.id ?? "").slice(0, 12),
          title: String(title || "").slice(0, 30),
          tokens: usageTotal(u),
          input: u.uncachedInputTokens,
          output: u.outputTokens,
          cacheRead: u.cacheReadTokens,
          cacheWrite: u.cacheWriteTokens,
        });
      } catch {
        failed++;
      }
    }
    rows.sort((a, b) => b.tokens - a.tokens);
    return { ok: true, sessions: rows, failed };
  } catch (error) {
    ctx.logger.warn(`companion-pet: session ranking failed: ${error?.message ?? error}`);
    return { ok: false, error: "fetch-failed", detail: String(error?.message ?? error) };
  }
}

/* ------------------------------------------------------------------ *
 * 🧠 Memory extraction: summarize the USER's own recent inputs into
 * memorable events. Only user-typed text is sent — never assistant
 * replies — so it stays on the privacy-safe side.
 * ------------------------------------------------------------------ */
async function extractMemory(ctx, payload) {
  try {
    const llm = ctx.get("llm");
    if (!llm) return { ok: false, error: "no-llm" };
    const inputs = Array.isArray(payload?.inputs)
      ? payload.inputs
          .map((t) => String(t || "").trim())
          .filter(Boolean)
          .slice(0, 20)
      : [];
    if (!inputs.length) return { ok: false, error: "no-inputs" };
    const system = [
      "【角色】你是陪伴小猫的记忆助手。",
      "【任务】把用户最近一天内的所有输入文本，总结成几条值得日后回忆、有意义的记忆。",
      "【只记什么】只记录【已经发生的事情】：实质进展、完成的事、做出的决定、项目阶段、重要情绪、值得日后回味的时刻。",
      "【不记什么】坚决不记录【想法 / 建议 / 疑问 / 担忧 / 待办】——例如\"建议改成X\"\"能不能加个Y\"\"担心Z不行\"\"想自动做某事\"\"希望加个按钮\"，这些都是还没发生的思考过程，即使输入里反复出现也一律忽略。",
      "【概括重点】优先概括：1. 今天主要在做什么项目 / 功能（概括性主题，不记零散小事）；2. 完成了什么、做成了什么；3. 工作到几点、是否深夜还在忙；4. 过程中的真实情绪转折（开心 / 烦躁 / 成就感）。",
      "【合并要求】同一件事只记一条：多段输入若都在说同一个主题，合并成一条，绝不拆开记。",
      "【条目格式】每条记忆就是一句话细节，≤ 30 字，一句话讲清楚：含主题（做了什么 / 关于什么）、含结果或时间（完成 / 卡住 / 做到几点）。例如\"凌晨在做奶白的记忆和token逻辑\"\"完成了登录模块重构\"。",
      "【输出格式】输出 JSON 数组，最多 4 条：[{\"text\":\"一句话细节\"}]。除此之外不要输出任何内容、任何说明文字。",
      "【宁缺毋滥】没有重要主题就输出空数组 []，不要凑数、不要为了填满而编造。",
    ].join(" ");
    const timeSpan = String(payload?.timeSpan || "");
    const userText =
      (timeSpan ? timeSpan + "\n" : "") +
      "用户最近的输入：\n" +
      inputs.map((t, i) => `${i + 1}. ${t}`).join("\n");
    const stream = llm.stream({
      provider: HINT_PROVIDER,
      model: HINT_MODEL,
      system,
      messages: [makeUserMessage(userText)],
    });
    let out = "";
    for await (const chunk of stream) {
      if (chunk.type === "text-delta") out += chunk.text;
      if (chunk.type === "finish" && chunk.reason && chunk.reason.kind !== "stop") {
        break;
      }
    }
    let json = String(out || "")
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
    let events = [];
    try {
      const parsed = JSON.parse(json);
      if (Array.isArray(parsed)) events = parsed;
    } catch {
      events = [];
    }
    events = events
      .filter((e) => e && String(e.text || "").trim())
      .slice(0, 4)
      .map((e) => ({
        text: String(e.text || e.title || "").trim().slice(0, 60),
      }));
    if (!events.length) return { ok: false, error: "empty" };
    return { ok: true, events };
  } catch (error) {
    ctx.logger.warn(`companion-pet: memory extraction failed: ${error?.message ?? error}`);
    return { ok: false, error: "extract-failed", detail: String(error?.message ?? error) };
  }
}

/* ------------------------------------------------------------------ *
 * 💌 Memory chat: the browser sends REAL memory fragments; the model
 * only answers from them (anti-hallucination). persona shapes the tone.
 * ------------------------------------------------------------------ */

/**
 * Rule gate for memory questions (zero tokens). Decides whether the user's
 * question is about shared memories / companionship — if it's clearly not
 * (math, coding, translation, general knowledge, instructions, etc.) we
 * redirect instead of burning an LLM call on something the cat can't know.
 */
function gateMemoryQuestion(q) {
  /* Strong "not about us" signals first — these win even if the question
     also contains memory-ish words (e.g. "帮我算一下我们上次…") */
  const notMemory =
    /(^|[^记])(算一下|计算|等于多少|几加几|几乘几|\d+\s*[+\-*/×÷]\s*\d+|\d+加\d+|\d+减\d+|\d+乘\d+|\d+除\d+|解(方程|一)道|求(导|积分)|数学|物理|化学|生物题|语法|英语|英文|翻译|帮我(写|做|改|编|算|翻译|总结|整理)|写一段|写个|写一个|代码|编程|报错|error|bug|如何(实现|修复|安装)|怎么(实现|修复|安装|配置)|科普|天气预报|新闻|股票|房价|世界上|历史上|为什么(太阳|月亮|地球)|帮我翻译|请翻译|把.*翻译成|什么是|啥是|是什么|是什么意思|什么意思|介绍一下|讲讲(这个|这个题|这段))/;
  if (notMemory.test(q)) {
    return {
      ok: false,
      text: "喵~ 我是只记着我们俩回忆的小猫，这个我不会啦。你可以问问我：还记得我们第一次见面吗？你觉得我最近怎么样？",
    };
  }
  /* Memory / companionship keywords — clearly in scope */
  const isMemory =
    /(记得|回忆|还记得|第一次|相遇|我们|认识|刚来|当初|以前|之前|那天|那天起|最近|今天|昨天|上周|开心|难过|生气|感动|喜欢|讨厌|怀念|陪伴|时光|故事|经历|印象|一路|点点滴滴|你(觉得|记得|喜欢|最|能|会)|我(们)?(的)?(事|时光|故事))/;
  if (isMemory.test(q)) {
    return { ok: true };
  }
  /* Ambiguous short questions — allow the model to answer (or say it can't) */
  return { ok: true };
}

async function memoryChat(ctx, payload) {
  try {
    const llm = ctx.get("llm");
    if (!llm) return { ok: false, error: "no-llm" };
    const question = String(payload?.question || "").trim().slice(0, 60);
    const memory = String(payload?.memory || "").slice(0, 4000);
    if (!question) return { ok: false, error: "no-question" };
    /* Rule gate: the cat only talks about YOUR shared memories. Questions
       that are clearly NOT about the past/companionship (math, coding,
       translation, general knowledge, commands…) get a gentle redirect —
       zero tokens, no LLM call. */
    const gate = gateMemoryQuestion(question);
    if (!gate.ok) {
      return { ok: false, gate: "redirect", text: gate.text };
    }
    const catName = String(payload?.catName || "小猫").slice(0, 12);
    const persona = String(payload?.persona || "温暖可爱").slice(0, 60);
    const system = [
      `你是一只陪伴用户的小猫，名字叫${catName}。`,
      `性格：${persona}。`,
      "以下是主人与你的真实记忆片段（日期、事件），只能基于它们回答。",
      "先判断主人问的是不是'关于你们俩的回忆/陪伴'的问题。如果不是（比如数学题、代码、翻译、通用知识问答、让你做事），直接说'这个我不太会，问问我们之间的事吧~'，再补一句你们之间的记忆类问题示例（如'还记得我们第一次见面吗'），不要尝试解答，也不要假装记不清。",
      "记忆片段可能包含很多条：如果问题问'最深刻/最难忘'，就从片段里挑最合适的1-2件事讲；如果问特定时间（如'一年前''某月某日'），就找对应日期的记忆。",
      "如果问题涉及的记忆不在片段里，就温柔地说'我有点记不清了'，绝对不要编造日期或事件。",
      "回答要口语化、有回忆感、不超过 120 字，直接输出回答，不要输出任何标记。",
    ].join(" ");
    const userText = "主人的问题：" + question + "\n\n记忆片段：\n" + memory;
    const stream = llm.stream({
      provider: HINT_PROVIDER,
      model: HINT_MODEL,
      system,
      messages: [makeUserMessage(userText)],
    });
    let out = "";
    for await (const chunk of stream) {
      if (chunk.type === "text-delta") out += chunk.text;
      if (chunk.type === "finish" && chunk.reason && chunk.reason.kind !== "stop") {
        break;
      }
    }
    const text = String(out || "").trim().slice(0, 300);
    if (!text) return { ok: false, error: "empty" };
    return { ok: true, text };
  } catch (error) {
    ctx.logger.warn(`companion-pet: memory chat failed: ${error?.message ?? error}`);
    return { ok: false, error: "chat-failed", detail: String(error?.message ?? error) };
  }
}

/* ------------------------------------------------------------------ *
 * Deep companion agent: turns a small behavioral profile into a warm
 * personalized line via ctx.llm (DeepSeek). Costs a few hundred tokens
 * per call, so it is rate-limited daily and always degrades to the
 * browser's zero-token rules on any failure.
 * ------------------------------------------------------------------ */

/* Build a user-role message by hand (frozen, matching the dsh-llm Message
   shape). We cannot import @deepseek-ai/dsh-llm from a profile plugin —
   it lives in the DSH install, outside this package's resolution chain. */
function makeUserMessage(text) {
  return Object.freeze({
    id: "pet-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    role: "user",
    content: Object.freeze([Object.freeze({ type: "text", text })]) ,
    source: Object.freeze({ kind: "user" }),
  });
}

const HINT_PROVIDER = "deepseek-official";
const HINT_MODEL = "deepseek-v4-flash";
const HINT_DAILY_LIMIT = 5;

const HINT_SYSTEM = [
  "你是一只住在用户工作台里的陪伴小猫，温柔、幽默、不说教。",
  "你了解主人的使用习惯（活跃时段、晚睡情况、情绪状态），每次基于给出的情境生成一句中文关怀。",
  "要求：一句话，不超过 45 字；不空洞、不说教、不问候天气；贴合给出的情境和习惯。",
  "输出必须是 JSON：{\"text\":\"文案\",\"action\":\"sleep|stretch|celebrate|think|sad|idle\"}，不要输出其它内容。",
].join(" ");

function buildHintPrompt(profile) {
  const ctx2 = profile.context || "greet";
  const hour = typeof profile.hour === "number" ? profile.hour : new Date().getHours();
  const lines = [
    `情境：${ctx2 === "late" ? "深夜" : ctx2 === "angry" ? "主人情绪不好" : ctx2 === "greet" ? "打开工作台" : "日常"}`,
    `当前时间：${hour} 点`,
    profile.gap > 0 ? `已 ${profile.gap} 天没来` : "今天来过",
    profile.streak >= 3 ? `连续 ${profile.streak} 天陪伴` : "",
    profile.lateStreak >= 2 ? `连续 ${profile.lateStreak} 天晚睡` : "作息正常",
    typeof profile.todaySec === "number" && profile.todaySec > 0
      ? `今天已在用 ${Math.round(profile.todaySec / 60)} 分钟`
      : "今天刚开始",
    profile.mood && profile.mood.a > 0 ? `最近 ${profile.mood.a} 次情绪激动` : "情绪平稳",
    profile.mood && profile.mood.h > 0 ? `最近 ${profile.mood.h} 次很开心` : "",
    profile.weekClicks > 10 ? `这周被摸了 ${profile.weekClicks} 次` : "",
    profile.weekAsks > 0 ? `这周被问了 ${profile.weekAsks} 个问题` : "",
  ].filter(Boolean);
  return "行为摘要：\n" + lines.join("\n") + "\n请生成一句关怀。";
}

/** Parse the model's reply: strip code fences, then try JSON; else raw text. */
function parseHintReply(raw) {
  const text = String(raw || "").trim();
  let json = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  try {
    const obj = JSON.parse(json);
    return {
      text: String(obj.text || "").slice(0, 60),
      action: /^(sleep|stretch|celebrate|think|sad|idle)$/.test(String(obj.action || ""))
        ? String(obj.action)
        : "",
    };
  } catch {
    return { text: text.slice(0, 60), action: "" };
  }
}

/** Generate one personalized hint. Rate-limited; degrades to ok:false. */
async function generateHint(ctx, profile) {
  try {
    const llm = ctx.get("llm");
    if (!llm) return { ok: false, error: "no-llm" };
    const stream = llm.stream({
      provider: HINT_PROVIDER,
      model: HINT_MODEL,
      system: HINT_SYSTEM,
      messages: [makeUserMessage(buildHintPrompt(profile))],
    });
    let out = "";
    for await (const chunk of stream) {
      if (chunk.type === "text-delta") out += chunk.text;
      if (chunk.type === "finish" && chunk.reason && chunk.reason.kind !== "stop") {
        break;
      }
    }
    const parsed = parseHintReply(out);
    if (!parsed.text) return { ok: false, error: "empty" };
    return { ok: true, text: parsed.text, action: parsed.action };
  } catch (error) {
    ctx.logger.warn(`companion-pet: hint failed: ${error?.message ?? error}`);
    return { ok: false, error: "hint-failed" };
  }
}

/**
 * Mount the static asset route. The assets live beside this file, so the
 * route root is stable regardless of where the profile installs the package.
 */
function apply(ctx) {
  const root = normalize(dirname(fileURLToPath(import.meta.url)) + "/../assets");
  const disposeAssets = ctx.webServer.register({
    kind: "prefix",
    path: PREFIX,
    handler: (req, res) => {
      try {
        const url = new URL(req.url ?? "/", "http://localhost");
        const rel = decodeURIComponent(url.pathname.slice(PREFIX.length)).replace(/^[/\\]+/, "");
        const file = normalize(join(root, rel));
        if (file !== root && !file.startsWith(root + "\\") && !file.startsWith(root + "/")) {
          res.statusCode = 403;
          res.end("forbidden");
          return;
        }
        let stat;
        try {
          stat = statSync(file);
        } catch {
          res.statusCode = 404;
          res.end("not found");
          return;
        }
        if (!stat.isFile()) {
          res.statusCode = 404;
          res.end("not found");
          return;
        }
        const ext = extname(file).toLowerCase();
        res.statusCode = 200;
        res.setHeader("Content-Type", MIME[ext] ?? "application/octet-stream");
        res.setHeader("Content-Length", stat.size);
        res.setHeader("Cache-Control", "no-cache");
        const stream = createReadStream(file);
        stream.on("error", () => res.destroy());
        stream.pipe(res);
      } catch (error) {
        ctx.logger.warn(error);
        res.statusCode = 500;
        res.end("internal error");
      }
    },
  });

  /** Tiny JSON API: GET /companion-pet/api/balance | /companion-pet/api/tokens */
  const disposeApi = ctx.webServer.register({
    kind: "prefix",
    path: API_PREFIX,
    handler: async (req, res) => {
      try {
        const url = new URL(req.url ?? "/", "http://localhost");
        if (url.pathname === `${API_PREFIX}/balance`) {
          let data = balanceCache.data;
          if (!data || Date.now() - balanceCache.at > BALANCE_TTL_MS) {
            data = await fetchBalance(ctx);
            balanceCache = { at: Date.now(), data };
          }
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.setHeader("Cache-Control", "no-store");
          res.end(JSON.stringify(data));
          return;
        }
        if (url.pathname === `${API_PREFIX}/tokens`) {
          let data = tokensCache.data;
          if (!data || Date.now() - tokensCache.at > TOKENS_TTL_MS) {
            data = await fetchTotalTokens(ctx);
            tokensCache = { at: Date.now(), data };
          }
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.setHeader("Cache-Control", "no-store");
          res.end(JSON.stringify(data));
          return;
        }
        if (url.pathname === `${API_PREFIX}/sessions`) {
          let data = sessionsCache.data;
          if (!data || Date.now() - sessionsCache.at > SESSIONS_TTL_MS) {
            data = await fetchSessionsRanking(ctx);
            sessionsCache = { at: Date.now(), data };
          }
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.setHeader("Cache-Control", "no-store");
          res.end(JSON.stringify(data));
          return;
        }
        if (url.pathname === `${API_PREFIX}/companion-hint` && req.method === "POST") {
          /* daily budget: a handful of calls keeps the cost trivial */
          const today = new Date().toISOString().slice(0, 10);
          if (hintBudget.date !== today) hintBudget = { date: today, count: 0 };
          if (hintBudget.count >= HINT_DAILY_LIMIT) {
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ ok: false, error: "budget" }));
            return;
          }
          let body = {};
          try {
            body = JSON.parse(await readBody(req));
          } catch {
            body = {};
          }
          hintBudget.count++;
          const data = await generateHint(ctx, body.profile || {});
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.setHeader("Cache-Control", "no-store");
          res.end(JSON.stringify(data));
          return;
        }
        if (url.pathname === `${API_PREFIX}/memory-chat` && req.method === "POST") {
          const today = new Date().toISOString().slice(0, 10);
          if (memChatBudget.date !== today) memChatBudget = { date: today, count: 0 };
          if (memChatBudget.count >= MEM_CHAT_DAILY) {
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ ok: false, error: "budget" }));
            return;
          }
          let body = {};
          try {
            body = JSON.parse(await readBody(req));
          } catch {
            body = {};
          }
          memChatBudget.count++;
          const data = await memoryChat(ctx, body);
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.setHeader("Cache-Control", "no-store");
          res.end(JSON.stringify(data));
          return;
        }
        if (url.pathname === `${API_PREFIX}/extract-memory` && req.method === "POST") {
          const today = new Date().toISOString().slice(0, 10);
          if (extractBudget.date !== today) extractBudget = { date: today, count: 0 };
          if (extractBudget.count >= EXTRACT_DAILY) {
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ ok: false, error: "budget" }));
            return;
          }
          let body = {};
          try {
            body = JSON.parse(await readBody(req));
          } catch {
            body = {};
          }
          extractBudget.count++;
          const data = await extractMemory(ctx, body);
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.setHeader("Cache-Control", "no-store");
          res.end(JSON.stringify(data));
          return;
        }
        res.statusCode = 404;
        res.end("not found");
      } catch (error) {
        ctx.logger.warn(error);
        res.statusCode = 500;
        res.end(JSON.stringify({ ok: false, error: "internal" }));
      }
    },
  });
  return () => {
    disposeAssets();
    disposeApi();
  };
}

export { apply, inject, name };
