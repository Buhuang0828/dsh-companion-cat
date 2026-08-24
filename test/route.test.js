/**
 * companion-pet, node half — 路由层集成测试（测试覆盖缺口分析后的第一批补测）。
 *
 * 被测对象：lib/index.js 的 apply(ctx) 注册的两条路由：
 *   - API 前缀  /companion-pet/api  （/balance /tokens /sessions GET + /companion-hint
 *     /memory-chat /extract-memory POST，含日预算、TTL 缓存、404/500）
 *   - assets 前缀 /companion-pet/assets（静态文件：MIME、Content-Length、no-cache、
 *     路径穿越 403、缺失/目录 404、未知扩展名 octet-stream）
 *
 * 关键机制（与生产行为一致，零依赖，仅 node:test + node:assert/strict）：
 *   - 模块级状态（budget 计数器、balanceCache/tokensCache/sessionsCache）用 ESM
 *     query 缓存击穿隔离：`await import("../lib/index.js?t=" + Date.now() + ...)`
 *     每次得到全新模块实例，budget 从 0 开始。
 *   - ctx.webServer.register 被 mock 捕获两个 handler（API 与 assets），测试直接
 *     以真实 req.url / req.method 驱动 handler（模拟框架的 prefix 路由分派）。
 *   - 全局 fetch 用 stub 计数；llm 用可计数的假流；res 用记录型假对象。
 *
 * 运行：node --test --test-isolation=none test/route.test.js
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter, once } from "node:events";
import { Writable } from "node:stream";
import { statSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const API_PREFIX = "/companion-pet/api";
const ASSET_PREFIX = "/companion-pet/assets";
const ASSETS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "assets");
const REAL_FETCH = globalThis.fetch;

/* ------------------------------------------------------------------ *
 * 基础设施 helper
 * ------------------------------------------------------------------ */

/** 全新模块实例 + 完整 mock 上下文。opts 可覆盖：apiKey / llmChunks /
 * llmThrow / sessions / usageBySession / titles。 */
async function freshApp(opts = {}) {
  const mod = await import(
    "../lib/index.js?t=" + Date.now() + "-" + Math.random().toString(36).slice(2)
  );
  const apiHandlers = [];
  const assetHandlers = [];
  const logs = [];
  const getCalls = {};
  const llm = makeLlm(opts);
  const sessionsRows = opts.sessions ?? [{ id: "alpha" }, { id: "beta" }];
  const usageBySession = opts.usageBySession ?? {
    alpha: { uncachedInputTokens: 100, outputTokens: 20, cacheReadTokens: 10, cacheWriteTokens: 5 },
    beta: { uncachedInputTokens: 5, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
  };
  const titles = opts.titles ?? { alpha: "Alpha Chat", beta: "Beta Chat" };
  const ctx = {
    logger: { warn: (...a) => logs.push(a) },
    credentials: {
      resolve: async () => ({ value: opts.apiKey !== undefined ? opts.apiKey : "sk-test" }),
    },
    webServer: {
      register(entry) {
        const list = entry.path.startsWith("/companion-pet/api") ? apiHandlers : assetHandlers;
        list.push(entry.handler);
        return () => ctx.disposed.push(entry.path);
      },
    },
    get(name) {
      getCalls[name] = (getCalls[name] ?? 0) + 1;
      if (name === "llm") return llm;
      if (name === "sessions") return { list: () => sessionsRows };
      if (name === "sessionProjections")
        return { snapshot: (s) => ({ values: { tokenUsage: usageBySession[s.id] } }) };
      if (name === "sessionTitle") return { get: (s) => titles[s.id] ?? "" };
      return undefined;
    },
    disposed: [],
  };
  const disposer = mod.apply(ctx);
  return {
    mod,
    ctx,
    apiHandler: apiHandlers[0],
    assetHandler: assetHandlers[0],
    llm,
    logs,
    getCalls,
    disposer,
  };
}

/** 假 llm：可计数的 stream()，默认产出 hint JSON，可覆盖产出 chunk 或同步抛错。 */
function makeLlm(opts = {}) {
  const llm = { streamCalls: 0, streamArgs: [] };
  llm.stream = (args) => {
    llm.streamCalls++;
    llm.streamArgs.push(args);
    if (opts.llmThrow) throw new Error("llm down");
    const chunks = opts.llmChunks ?? ['{"text":"早点休息喵~","action":"sleep"}'];
    return (async function* () {
      for (const c of chunks) yield { type: "text-delta", text: c };
      yield { type: "finish", reason: { kind: "stop" } };
    })();
  };
  return llm;
}

/** 假 req：EventEmitter，带 url/method；flush() 按序发 data/error/end。 */
function makeReq({ url, method = "GET", chunks = null, error = null }) {
  const req = new EventEmitter();
  req.url = url;
  req.method = method;
  req.flush = () => {
    if (chunks) for (const c of chunks) req.emit("data", Buffer.from(c));
    if (error) req.emit("error", error);
    req.emit("end");
  };
  return req;
}

/** 把 body 字符串切成若干 chunk（默认 4 片），模拟分片到达。 */
function splitChunks(str, n = 4) {
  const step = Math.max(1, Math.ceil(str.length / n));
  const parts = [];
  for (let i = 0; i < str.length; i += step) parts.push(str.slice(i, i + step));
  return parts;
}

/** 记录型假 res（API 用）：statusCode / setHeader / end 收集 body。 */
function makeApiRes({ throwOnFirstEnd = false } = {}) {
  const res = {
    statusCode: 0,
    headers: {},
    setHeader(k, v) {
      res.headers[k] = v;
    },
    end(data) {
      res.body = data;
    },
  };
  if (throwOnFirstEnd) {
    let n = 0;
    res.end = (data) => {
      n++;
      if (n === 1) throw new Error("boom");
      res.body = data;
    };
  }
  return res;
}

/** 真可写流假 res（assets 用）：pipe 能落盘，同时记录 statusCode/headers。 */
function makeAssetRes() {
  const chunks = [];
  const res = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(Buffer.from(chunk));
      cb();
    },
  });
  res.statusCode = 0;
  res.headers = {};
  res.setHeader = (k, v) => {
    res.headers[k] = v;
  };
  res.collect = () => Buffer.concat(chunks);
  return res;
}

/** 驱动 API handler：先同步调用（readBody 的监听器在首个 await 前已挂上），再 flush body。 */
async function apiCall(app, { url, method = "GET", body, chunks, error }) {
  const req = makeReq({
    url,
    method,
    chunks: chunks ?? (body !== undefined ? splitChunks(body) : null),
    error,
  });
  const res = makeApiRes();
  const p = app.apiHandler(req, res);
  req.flush();
  await p;
  let json = null;
  try {
    json = JSON.parse(res.body);
  } catch {
    json = null;
  }
  return { statusCode: res.statusCode, headers: res.headers, body: res.body, json };
}

/** 驱动 assets handler（同步 handler + pipe），等 finish 收尾。 */
async function assetCall(app, url) {
  const req = makeReq({ url, method: "GET" });
  const res = makeAssetRes();
  app.assetHandler(req, res);
  req.flush();
  await once(res, "finish");
  return {
    statusCode: res.statusCode,
    headers: res.headers,
    text: res.collect().toString("utf8"),
    bytes: res.collect(),
  };
}

/** 全局 fetch stub：计数每次调用，finally 恢复真实 fetch。 */
function stubFetch(impl) {
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, opts });
    return impl(url, opts);
  };
  return { calls, restore: () => (globalThis.fetch = REAL_FETCH) };
}
async function withFetch(impl, fn) {
  const stub = stubFetch(impl);
  try {
    return await fn(stub);
  } finally {
    stub.restore();
  }
}

const BALANCE_BODY = {
  is_available: true,
  balance_infos: [
    { currency: "CNY", total_balance: "100.50", granted_balance: "40.00", topped_up_balance: "60.50" },
  ],
};
const okFetch = () => ({ ok: true, status: 200, json: async () => BALANCE_BODY });

/* ------------------------------------------------------------------ *
 * readBody（模块内部函数，经 POST 路由间接验证）
 * ------------------------------------------------------------------ */

test("readBody：多 chunk 拼接——chunk 切在字符串 token 中间仍能完整解析", async () => {
  const app = await freshApp({ llmChunks: ["喵~ 我记得那次见面！"] });
  // 若只取了第一片，JSON.parse 必然失败 → body={} → no-question
  const r = await apiCall(app, {
    url: `${API_PREFIX}/memory-chat`,
    method: "POST",
    chunks: ['{"question":"还记得我们第一', '次见面吗","memory":"2024年1月1日 我们第一次见面"}'],
  });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.json, { ok: true, text: "喵~ 我记得那次见面！" });
  assert.equal(app.llm.streamCalls, 1);
});

test("readBody：error 事件 → reject，路由吞掉后 body 退化为 {}", async () => {
  const app = await freshApp();
  const r = await apiCall(app, {
    url: `${API_PREFIX}/memory-chat`,
    method: "POST",
    chunks: ['{"question":"还记得我们'],
    error: new Error("socket hang up"),
  });
  // readBody reject → JSON.parse 抛错 → body={} → question 为空 → no-question，且 llm 未被调用
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.json, { ok: false, error: "no-question" });
  assert.equal(app.llm.streamCalls, 0);
});

/* ------------------------------------------------------------------ *
 * /balance — GET + TTL 缓存 + key/网络错误
 * ------------------------------------------------------------------ */

test("/balance GET → 200 + JSON + Cache-Control:no-store，fetch 携带 Bearer key", async () => {
  const app = await freshApp();
  await withFetch(okFetch, async (f) => {
    const r = await apiCall(app, { url: `${API_PREFIX}/balance` });
    assert.equal(r.statusCode, 200);
    assert.equal(r.headers["Content-Type"], "application/json; charset=utf-8");
    assert.equal(r.headers["Cache-Control"], "no-store");
    assert.deepEqual(r.json, {
      ok: true,
      isAvailable: true,
      currency: "CNY",
      total: "100.50",
      granted: "40.00",
      toppedUp: "60.50",
    });
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].url, "https://api.deepseek.com/user/balance");
    assert.equal(f.calls[0].opts.headers.authorization, "Bearer sk-test");
    assert.equal(f.calls[0].opts.headers.accept, "application/json");
  });
});

test("/balance TTL 缓存：30s 内第二次请求不再调 fetch", async () => {
  const app = await freshApp();
  await withFetch(okFetch, async (f) => {
    const a = await apiCall(app, { url: `${API_PREFIX}/balance` });
    const b = await apiCall(app, { url: `${API_PREFIX}/balance` });
    assert.equal(a.statusCode, 200);
    assert.deepEqual(a.json, b.json);
    assert.equal(f.calls.length, 1);
  });
});

test("/balance 无 API key → {ok:false,error:'no-key'} 且不调 fetch", async () => {
  const app = await freshApp({ apiKey: "" });
  await withFetch(
    async () => {
      throw new Error("must not be called");
    },
    async (f) => {
      const r = await apiCall(app, { url: `${API_PREFIX}/balance` });
      assert.equal(r.statusCode, 200);
      assert.deepEqual(r.json, { ok: false, error: "no-key" });
      assert.equal(f.calls.length, 0);
    },
  );
});

test("/balance fetch 抛错 → {ok:false,error:'fetch-failed'}，logger.warn 被调用", async () => {
  const app = await freshApp();
  await withFetch(
    async () => {
      throw new Error("network down");
    },
    async () => {
      const r = await apiCall(app, { url: `${API_PREFIX}/balance` });
      assert.equal(r.statusCode, 200);
      assert.deepEqual(r.json, { ok: false, error: "fetch-failed" });
      assert.equal(app.logs.length, 1);
    },
  );
});

test("/balance fetch 返回非 2xx → {ok:false,error:'http-<status>'}", async () => {
  const app = await freshApp();
  await withFetch(
    async () => ({ ok: false, status: 401, json: async () => ({}) }),
    async () => {
      const r = await apiCall(app, { url: `${API_PREFIX}/balance` });
      assert.deepEqual(r.json, { ok: false, error: "http-401" });
    },
  );
});

/* ------------------------------------------------------------------ *
 * /tokens 与 /sessions — 聚合 + 排序 + TTL
 * ------------------------------------------------------------------ */

test("/tokens GET → 200 + 聚合 token 总量与分桶", async () => {
  const app = await freshApp();
  const r = await apiCall(app, { url: `${API_PREFIX}/tokens` });
  assert.equal(r.statusCode, 200);
  assert.equal(r.headers["Cache-Control"], "no-store");
  assert.deepEqual(r.json, {
    ok: true,
    tokens: 145, // 105 + 25 + 10 + 5
    buckets: { uncachedInputTokens: 105, outputTokens: 25, cacheReadTokens: 10, cacheWriteTokens: 5 },
  });
});

test("/tokens TTL 缓存：5s 内第二次不重算（ctx.get('sessions') 只调一次）", async () => {
  const app = await freshApp();
  await apiCall(app, { url: `${API_PREFIX}/tokens` });
  await apiCall(app, { url: `${API_PREFIX}/tokens` });
  assert.equal(app.getCalls.sessions, 1);
});

test("/sessions GET → 200 + 按 token 降序排序 + title/分桶字段", async () => {
  const app = await freshApp();
  const r = await apiCall(app, { url: `${API_PREFIX}/sessions` });
  assert.equal(r.statusCode, 200);
  assert.equal(r.json.ok, true);
  assert.deepEqual(
    r.json.sessions.map((s) => s.id),
    ["alpha", "beta"],
  );
  assert.equal(r.json.sessions[0].tokens, 135);
  assert.equal(r.json.sessions[0].title, "Alpha Chat");
  assert.equal(r.json.sessions[0].input, 100);
  assert.equal(r.json.sessions[1].tokens, 10);
  assert.equal(r.json.failed, 0);
});

/* ------------------------------------------------------------------ *
 * /companion-hint — POST + 5 次/天预算
 * ------------------------------------------------------------------ */

test("/companion-hint POST 正常 → llm.stream 被调 + text/action", async () => {
  const app = await freshApp();
  const r = await apiCall(app, {
    url: `${API_PREFIX}/companion-hint`,
    method: "POST",
    body: JSON.stringify({ profile: { context: "late", hour: 23, gap: 2 } }),
  });
  assert.equal(r.statusCode, 200);
  assert.equal(r.headers["Cache-Control"], "no-store");
  assert.deepEqual(r.json, { ok: true, text: "早点休息喵~", action: "sleep" });
  assert.equal(app.llm.streamCalls, 1);
  const args = app.llm.streamArgs[0];
  assert.equal(args.provider, "deepseek-official");
  assert.equal(args.model, "deepseek-v4-flash");
  assert.equal(args.messages[0].role, "user");
  assert.match(args.messages[0].content[0].text, /^行为摘要：/);
});

test("/companion-hint 第 6 次超 5 次/天预算 → {ok:false,error:'budget'} 且不再调 llm", async () => {
  const app = await freshApp();
  for (let i = 1; i <= 5; i++) {
    const r = await apiCall(app, { url: `${API_PREFIX}/companion-hint`, method: "POST", body: "{}" });
    assert.equal(r.json.ok, true, `第 ${i} 次应成功`);
  }
  const r6 = await apiCall(app, { url: `${API_PREFIX}/companion-hint`, method: "POST", body: "{}" });
  assert.equal(r6.statusCode, 200);
  assert.deepEqual(r6.json, { ok: false, error: "budget" });
  assert.equal(app.llm.streamCalls, 5);
});

/* ------------------------------------------------------------------ *
 * /memory-chat — POST + 10 次/天预算 + 规则闸门
 * ------------------------------------------------------------------ */

test("/memory-chat POST 正常 → llm 被调 + 返回文本", async () => {
  const app = await freshApp({ llmChunks: ["喵~ 我记得那次见面！"] });
  const r = await apiCall(app, {
    url: `${API_PREFIX}/memory-chat`,
    method: "POST",
    body: JSON.stringify({
      question: "还记得我们第一次见面吗",
      memory: "2024年1月1日 我们第一次见面",
      catName: "奶白",
    }),
  });
  assert.equal(r.statusCode, 200);
  assert.equal(r.headers["Cache-Control"], "no-store");
  assert.deepEqual(r.json, { ok: true, text: "喵~ 我记得那次见面！" });
  assert.equal(app.llm.streamCalls, 1);
});

test("/memory-chat 第 11 次超 10 次/天预算 → budget 且不调 llm", async () => {
  const app = await freshApp({ llmChunks: ["喵"] });
  for (let i = 1; i <= 10; i++) {
    const r = await apiCall(app, {
      url: `${API_PREFIX}/memory-chat`,
      method: "POST",
      body: JSON.stringify({ question: "还记得我们第一次见面吗" }),
    });
    assert.equal(r.json.ok, true, `第 ${i} 次应成功`);
  }
  const r11 = await apiCall(app, {
    url: `${API_PREFIX}/memory-chat`,
    method: "POST",
    body: JSON.stringify({ question: "还记得我们第一次见面吗" }),
  });
  assert.deepEqual(r11.json, { ok: false, error: "budget" });
  assert.equal(app.llm.streamCalls, 10);
});

test("/memory-chat 规则闸门（数学题）→ gate redirect 且 llm 零调用；闸门命中同样消耗预算", async () => {
  const app = await freshApp();
  const q = JSON.stringify({ question: "2+3等于多少", memory: "x" });
  for (let i = 1; i <= 10; i++) {
    const r = await apiCall(app, { url: `${API_PREFIX}/memory-chat`, method: "POST", body: q });
    assert.equal(r.statusCode, 200);
    assert.equal(r.json.ok, false);
    assert.equal(r.json.gate, "redirect");
    assert.match(r.json.text, /小猫/);
  }
  assert.equal(app.llm.streamCalls, 0);
  // 10 次闸门重定向已耗尽当日预算 → 第 11 次直接 budget（无 llm）
  const r11 = await apiCall(app, { url: `${API_PREFIX}/memory-chat`, method: "POST", body: q });
  assert.deepEqual(r11.json, { ok: false, error: "budget" });
  assert.equal(app.llm.streamCalls, 0);
});

/* ------------------------------------------------------------------ *
 * /extract-memory — POST + 10 次/天预算 + 空输入
 * ------------------------------------------------------------------ */

test("/extract-memory POST 正常 → llm 被调 + 返回 events", async () => {
  const app = await freshApp({ llmChunks: ['[{"text":"完成了登录模块重构"}]'] });
  const r = await apiCall(app, {
    url: `${API_PREFIX}/extract-memory`,
    method: "POST",
    body: JSON.stringify({
      timeSpan: "2026-08-24",
      inputs: ["完成了登录模块重构", "   ", "还在调 token 逻辑"],
    }),
  });
  assert.equal(r.statusCode, 200);
  assert.equal(r.headers["Cache-Control"], "no-store");
  assert.deepEqual(r.json, { ok: true, events: [{ text: "完成了登录模块重构" }] });
  assert.equal(app.llm.streamCalls, 1);
  assert.equal(app.llm.streamArgs[0].provider, "deepseek-official");
});

test("/extract-memory 第 11 次超 10 次/天预算 → budget", async () => {
  const app = await freshApp({ llmChunks: ['[{"text":"记忆一"}]'] });
  for (let i = 1; i <= 10; i++) {
    const r = await apiCall(app, {
      url: `${API_PREFIX}/extract-memory`,
      method: "POST",
      body: JSON.stringify({ inputs: ["做了点事"] }),
    });
    assert.equal(r.json.ok, true, `第 ${i} 次应成功`);
  }
  const r11 = await apiCall(app, {
    url: `${API_PREFIX}/extract-memory`,
    method: "POST",
    body: JSON.stringify({ inputs: ["做了点事"] }),
  });
  assert.deepEqual(r11.json, { ok: false, error: "budget" });
  assert.equal(app.llm.streamCalls, 10);
});

test("/extract-memory 空 inputs → {ok:false,error:'no-inputs'}，llm 零调用", async () => {
  const app = await freshApp();
  const r = await apiCall(app, {
    url: `${API_PREFIX}/extract-memory`,
    method: "POST",
    body: JSON.stringify({ inputs: ["  ", "", null] }),
  });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.json, { ok: false, error: "no-inputs" });
  assert.equal(app.llm.streamCalls, 0);
});

/* ------------------------------------------------------------------ *
 * 方法与 404 语义
 * ------------------------------------------------------------------ */

test("POST 路由用 GET 访问 → 404（method 检查在 pathname 之后）", async () => {
  const app = await freshApp();
  for (const p of ["companion-hint", "memory-chat", "extract-memory"]) {
    const r = await apiCall(app, { url: `${API_PREFIX}/${p}`, method: "GET" });
    assert.equal(r.statusCode, 404, p);
    assert.equal(r.body, "not found", p);
  }
  assert.equal(app.llm.streamCalls, 0);
});

test("GET 路由用 POST 访问 → 仍返回数据（现状行为：GET 路由无 method 检查）", async () => {
  const app = await freshApp();
  await withFetch(okFetch, async (f) => {
    const r = await apiCall(app, { url: `${API_PREFIX}/balance`, method: "POST" });
    assert.equal(r.statusCode, 200);
    assert.equal(r.json.ok, true);
    assert.equal(f.calls.length, 1);
    const r2 = await apiCall(app, { url: `${API_PREFIX}/sessions`, method: "POST" });
    assert.equal(r2.json.ok, true);
  });
});

test("未知路径 → 404", async () => {
  const app = await freshApp();
  const r = await apiCall(app, { url: `${API_PREFIX}/nope` });
  assert.equal(r.statusCode, 404);
  assert.equal(r.body, "not found");
  const r2 = await apiCall(app, { url: `${API_PREFIX}/balance/extra` });
  assert.equal(r2.statusCode, 404);
  // 前缀分派：/companion-pet/other 落到 assets handler → 目录 → 404
  const r3 = await apiCall(app, { url: "/companion-pet/other" });
  assert.equal(r3.statusCode, 404);
});

/* ------------------------------------------------------------------ *
 * 错误处理：500
 * ------------------------------------------------------------------ */

test("API handler 抛错 → 500 {ok:false,error:'internal'}，logger.warn 记录原始错误", async () => {
  const app = await freshApp();
  const req = makeReq({ url: `${API_PREFIX}/balance`, method: "GET" });
  const res = makeApiRes({ throwOnFirstEnd: true });
  const p = app.apiHandler(req, res);
  req.flush();
  await p;
  assert.equal(res.statusCode, 500);
  assert.deepEqual(JSON.parse(res.body), { ok: false, error: "internal" });
  assert.equal(app.logs.length, 1);
});

test("llm.stream 同步抛错 → 200 {ok:false,error:'hint-failed'}（内部降级而非 500）", async () => {
  const app = await freshApp({ llmThrow: true });
  const r = await apiCall(app, { url: `${API_PREFIX}/companion-hint`, method: "POST", body: "{}" });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.json, { ok: false, error: "hint-failed" });
  assert.equal(app.llm.streamCalls, 1);
  assert.equal(app.logs.length, 1);
});

/* ------------------------------------------------------------------ *
 * assets 路由 — MIME / Content-Length / no-cache / 403 / 404 / octet-stream
 * ------------------------------------------------------------------ */

test("assets 正常文件 → 200 + 正确 MIME + Content-Length + Cache-Control:no-cache，字节被真实 pipe", async () => {
  const app = await freshApp();
  const real = statSync(join(ASSETS_DIR, "cats/white/idle.gif"));
  const r = await assetCall(app, `${ASSET_PREFIX}/cats/white/idle.gif`);
  assert.equal(r.statusCode, 200);
  assert.equal(r.headers["Content-Type"], "image/gif");
  assert.equal(r.headers["Content-Length"], real.size);
  assert.equal(r.headers["Cache-Control"], "no-cache");
  assert.equal(r.bytes.length, real.size);

  const r2 = await assetCall(app, `${ASSET_PREFIX}/background-day.png`);
  assert.equal(r2.statusCode, 200);
  assert.equal(r2.headers["Content-Type"], "image/png");
});

test("assets 路径穿越（%2e%2e 编码点段）→ 403", async () => {
  const app = await freshApp();
  const r = await assetCall(app, `${ASSET_PREFIX}/%2e%2e%2fsecret.txt`);
  assert.equal(r.statusCode, 403);
  assert.equal(r.text, "forbidden");
  const r2 = await assetCall(app, `${ASSET_PREFIX}/cats/%2e%2e%2f%2e%2e%2fpackage.json`);
  assert.equal(r2.statusCode, 403);
});

test("assets 不存在文件 → 404", async () => {
  const app = await freshApp();
  const r = await assetCall(app, `${ASSET_PREFIX}/no-such-file.gif`);
  assert.equal(r.statusCode, 404);
  assert.equal(r.text, "not found");
});

test("assets 目录 → 404", async () => {
  const app = await freshApp();
  const r = await assetCall(app, `${ASSET_PREFIX}/cats`);
  assert.equal(r.statusCode, 404);
});

test("assets 未知扩展名 → application/octet-stream", async (t) => {
  const tmp = join(ASSETS_DIR, `route-test-${Date.now()}-${Math.random().toString(36).slice(2)}.zzz`);
  writeFileSync(tmp, "hello-route");
  t.after(() => {
    try {
      rmSync(tmp);
    } catch {
      /* 清理失败不致命 */
    }
  });
  const app = await freshApp();
  const r = await assetCall(app, `${ASSET_PREFIX}/${tmp.split(/[\\/]/).pop()}`);
  assert.equal(r.statusCode, 200);
  assert.equal(r.headers["Content-Type"], "application/octet-stream");
  assert.equal(r.headers["Content-Length"], "hello-route".length);
  assert.equal(r.text, "hello-route");
});

test("assets 非法百分号编码（截断 UTF-8）→ decodeURIComponent 抛错 → 500 'internal error'", async () => {
  const app = await freshApp();
  const r = await assetCall(app, `${ASSET_PREFIX}/%E0%A4%A`);
  assert.equal(r.statusCode, 500);
  assert.equal(r.text, "internal error");
  assert.equal(app.logs.length, 1);
});

test("assets 原始 ../ 被 URL 规范化 → 404 而非 403（现状行为）", async () => {
  const app = await freshApp();
  // new URL 已把 /../ 归一化 → rel 为空 → 命中 assets 根目录 → 404
  const r = await assetCall(app, `${ASSET_PREFIX}/../../etc/passwd`);
  assert.equal(r.statusCode, 404);
});

/* ------------------------------------------------------------------ *
 * apply() 契约与 budget 隔离
 * ------------------------------------------------------------------ */

test("apply() 返回的 disposer 会调用两个 register 的 disposer（assets 与 api）", async () => {
  const app = await freshApp();
  assert.equal(app.ctx.disposed.length, 0);
  app.disposer();
  assert.deepEqual(app.ctx.disposed, [ASSET_PREFIX, API_PREFIX]);
});

test("budget 隔离：每个 ?t= 新模块实例的预算从 0 开始", async () => {
  const a = await freshApp();
  const b = await freshApp();
  for (let i = 0; i < 6; i++) {
    await apiCall(a, { url: `${API_PREFIX}/companion-hint`, method: "POST", body: "{}" });
  }
  // a 已超预算
  const ra = await apiCall(a, { url: `${API_PREFIX}/companion-hint`, method: "POST", body: "{}" });
  assert.deepEqual(ra.json, { ok: false, error: "budget" });
  // b 是全新模块实例 → 预算为 0 → 第一次即成功
  const rb = await apiCall(b, { url: `${API_PREFIX}/companion-hint`, method: "POST", body: "{}" });
  assert.equal(rb.json.ok, true);
  assert.equal(b.llm.streamCalls, 1);
});
