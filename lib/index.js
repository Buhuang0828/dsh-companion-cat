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
 * Deep companion agent: turns a small behavioral profile into a warm
 * personalized line via ctx.llm (DeepSeek). Costs a few hundred tokens
 * per call, so it is rate-limited daily and always degrades to the
 * browser's zero-token rules on any failure.
 * ------------------------------------------------------------------ */

let llmHelpers = null;
async function ensureLlmHelpers() {
  if (llmHelpers) return llmHelpers;
  try {
    const mod = await import("@deepseek-ai/dsh-llm");
    llmHelpers = { createUserMessage: mod.createUserMessage };
  } catch {
    llmHelpers = null;
  }
  return llmHelpers;
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
    profile.lateStreak >= 2 ? `连续 ${profile.lateStreak} 天晚睡` : "作息正常",
    typeof profile.todaySec === "number" && profile.todaySec > 0
      ? `今天已在用 ${Math.round(profile.todaySec / 60)} 分钟`
      : "今天刚开始",
    profile.mood && profile.mood.a > 0 ? `最近 ${profile.mood.a} 次情绪激动` : "情绪平稳",
    profile.mood && profile.mood.h > 0 ? `最近 ${profile.mood.h} 次很开心` : "",
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
    const helpers = await ensureLlmHelpers();
    if (!helpers) return { ok: false, error: "no-llm-module" };
    const stream = llm.stream({
      provider: HINT_PROVIDER,
      model: HINT_MODEL,
      system: HINT_SYSTEM,
      messages: [
        helpers.createUserMessage({
          content: [{ type: "text", text: buildHintPrompt(profile) }],
          source: { kind: "user" },
        }),
      ],
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
