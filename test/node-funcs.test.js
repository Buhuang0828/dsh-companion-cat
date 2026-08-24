/**
 * companion-pet, node half — 函数级测试（第二批补测）。
 *
 * 被测对象：lib/index.js 的 8 个新增 test-only 导出（生产行为零改变，
 * 仅导出行增加函数名）：
 *   - sessionUsage / usageTotal         纯函数（projection 快照 → 四桶）
 *   - extractMemory / memoryChat / generateHint   llm.stream 假流驱动
 *   - fetchTotalTokens / fetchSessionsRanking     ctx.get 服务聚合
 *   - fetchBalance                      全局 fetch stub（用后恢复）
 *
 * 零依赖：仅 node:test + node:assert/strict。
 * 运行：node --test --test-isolation=none test/node-funcs.test.js
 *
 * 与真实代码的对照要点（先读代码确认后的行为）：
 *   - fetchBalance 走 ctx.credentials.resolve(KEY_REF)，不是 ctx.get("credentials")。
 *   - extractMemory 过滤条件为 (e.text || e.title)，title 回退可达（已修复死代码）。
 *   - memoryChat 先截断 question 到 60 字再走规则闸门；闸门 redirect 时
 *     llm.stream 零调用。
 *   - generateHint 出错返回 {ok:false,error:"hint-failed"}，无 detail 字段。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sessionUsage,
  usageTotal,
  fetchTotalTokens,
  fetchSessionsRanking,
  fetchBalance,
  extractMemory,
  memoryChat,
  generateHint,
} from "../lib/index.js";

const REAL_FETCH = globalThis.fetch;

const ZERO = { uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

/* ------------------------------------------------------------------ *
 * 基础设施 helper
 * ------------------------------------------------------------------ */

/** 假 llm：可计数 stream()。chunks 为完整 chunk 对象（{type,text} /
 * {type:"finish",reason}）；throwOnCall 同步抛错；streamFactory 自定义流。 */
function fakeLLM({ chunks = [], throwOnCall = false, streamFactory } = {}) {
  const llm = { streamCalls: 0, streamArgs: [] };
  llm.stream = (args) => {
    llm.streamCalls++;
    llm.streamArgs.push(args);
    if (throwOnCall) throw new Error("llm down");
    if (streamFactory) return streamFactory(args);
    return (async function* () {
      for (const c of chunks) yield c;
    })();
  };
  return llm;
}

/** 假 ctx：get(k) 从 store 取服务；credentials 默认有 key；logger 记 warn。 */
function fakeCtx({ store = {}, get, credentials } = {}) {
  const warns = [];
  const ctx = {
    logger: { warn: (...a) => warns.push(a) },
    get: get ?? ((k) => store[k]),
    credentials: credentials ?? { resolve: async () => ({ value: "sk-test" }) },
  };
  ctx.warns = warns;
  return ctx;
}

/** text-delta chunk 快捷构造。 */
function td(text) {
  return { type: "text-delta", text };
}

/** finish chunk 快捷构造（默认 reason.kind = "stop"）。 */
function fin(kind = "stop") {
  return { type: "finish", reason: { kind } };
}

/** 可计数的假流：记录被 for-await 消费的 chunk 数，用于断言提前 break。 */
function countedChunks(chunks) {
  const state = { consumed: 0 };
  const gen = (async function* () {
    for (const c of chunks) {
      state.consumed++;
      yield c;
    }
  })();
  return { gen, state };
}

/** 全局 fetch stub：计数每次调用，finally 恢复真实 fetch（同 route.test.js 风格）。 */
async function withFetch(impl, fn) {
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, opts });
    return impl(url, opts);
  };
  try {
    return await fn(calls);
  } finally {
    globalThis.fetch = REAL_FETCH;
  }
}

/** sessions store 快捷构造。 */
function sessionsStore(rows) {
  return { list: () => rows };
}

/** projections 快捷构造：按 session.id 查 usage 桶。 */
function projectionsBy(usageBySession) {
  return {
    snapshot: (s) => ({ values: { tokenUsage: usageBySession[s.id] } }),
  };
}

/* ------------------------------------------------------------------ *
 * sessionUsage — projection 快照 → 四桶（纯函数）
 * ------------------------------------------------------------------ */

test("sessionUsage：projections 为 null/undefined → 全零", () => {
  assert.deepEqual(sessionUsage({ id: "s1" }, null), ZERO);
  assert.deepEqual(sessionUsage({ id: "s1" }, undefined), ZERO);
});

test("sessionUsage：snapshot 返回完整 tokenUsage → 四桶正确", () => {
  const projections = {
    snapshot: () => ({
      values: {
        tokenUsage: { uncachedInputTokens: 105, outputTokens: 25, cacheReadTokens: 10, cacheWriteTokens: 5 },
      },
    }),
  };
  assert.deepEqual(sessionUsage({ id: "s1" }, projections), {
    uncachedInputTokens: 105,
    outputTokens: 25,
    cacheReadTokens: 10,
    cacheWriteTokens: 5,
  });
});

test("sessionUsage：snapshot 抛错 → 全零（不向外抛）", () => {
  const projections = {
    snapshot: () => {
      throw new Error("boom");
    },
  };
  assert.deepEqual(sessionUsage({ id: "s1" }, projections), ZERO);
});

test("sessionUsage：字段缺失（undefined）→ ||0 归一为 0", () => {
  const projections = {
    snapshot: () => ({
      values: { tokenUsage: { uncachedInputTokens: undefined, outputTokens: 7 } },
    }),
  };
  assert.deepEqual(sessionUsage({}, projections), {
    uncachedInputTokens: 0,
    outputTokens: 7,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  });
});

test("sessionUsage：snapshot 返回 null / 缺少 tokenUsage → 全零", () => {
  assert.deepEqual(sessionUsage({}, { snapshot: () => null }), ZERO);
  assert.deepEqual(sessionUsage({}, { snapshot: () => ({ values: {} }) }), ZERO);
  assert.deepEqual(sessionUsage({}, { snapshot: () => undefined }), ZERO);
});

test("usageTotal：四桶求和", () => {
  assert.equal(
    usageTotal({ uncachedInputTokens: 105, outputTokens: 25, cacheReadTokens: 10, cacheWriteTokens: 5 }),
    145,
  );
  assert.equal(usageTotal(ZERO), 0);
});

/* ------------------------------------------------------------------ *
 * extractMemory — llm.stream 假流 → events（JSON 围栏/过滤/截断/break）
 * ------------------------------------------------------------------ */

test("extractMemory：ctx.get('llm') 返回 null/undefined → {ok:false,error:'no-llm'}", async () => {
  const ctx = fakeCtx({ store: {} });
  assert.deepEqual(await extractMemory(ctx, { inputs: ["x"] }), { ok: false, error: "no-llm" });
});

test("extractMemory：inputs 空数组 / 全空白 / 非数组 / 缺 payload → no-inputs，llm 零调用", async () => {
  const llm = fakeLLM();
  const ctx = fakeCtx({ store: { llm } });
  assert.deepEqual(await extractMemory(ctx, { inputs: [] }), { ok: false, error: "no-inputs" });
  assert.deepEqual(await extractMemory(ctx, { inputs: ["  ", "", null] }), { ok: false, error: "no-inputs" });
  assert.deepEqual(await extractMemory(ctx, { inputs: "不是数组" }), { ok: false, error: "no-inputs" });
  assert.deepEqual(await extractMemory(ctx, undefined), { ok: false, error: "no-inputs" });
  assert.equal(llm.streamCalls, 0);
});

test("extractMemory：超过 20 条输入 → 只处理前 20（第 21 条不参与）", async () => {
  const llm = fakeLLM({ chunks: [td('[{"text":"记忆"}]')] });
  const ctx = fakeCtx({ store: { llm } });
  const inputs = Array.from({ length: 25 }, (_, i) => `输入${i + 1}`);
  const r = await extractMemory(ctx, { inputs });
  assert.equal(r.ok, true);
  const userText = llm.streamArgs[0].messages[0].content[0].text;
  assert.match(userText, /20\. 输入20/);
  assert.doesNotMatch(userText, /21\. 输入21/);
});

test("extractMemory：stream 输出带 ```json 围栏 → 解析成功", async () => {
  const llm = fakeLLM({ chunks: [td('```json\n[{"text":"完成了登录模块重构"}]\n```')] });
  const ctx = fakeCtx({ store: { llm } });
  const r = await extractMemory(ctx, { inputs: ["完成了登录模块重构"] });
  assert.deepEqual(r, { ok: true, events: [{ text: "完成了登录模块重构" }] });
});

test("extractMemory：stream 输出非法 JSON → {ok:false,error:'empty'}", async () => {
  const llm = fakeLLM({ chunks: [td("这不是 JSON")] });
  const ctx = fakeCtx({ store: { llm } });
  const r = await extractMemory(ctx, { inputs: ["x"] });
  assert.deepEqual(r, { ok: false, error: "empty" });
});

test("extractMemory：空 text 的条目被过滤（含 null / 纯空白）", async () => {
  const llm = fakeLLM({
    chunks: [td('[{"text":"有效记忆"},{"text":""},{"text":"   "},null,{"text":"另一条"}]')],
  });
  const ctx = fakeCtx({ store: { llm } });
  const r = await extractMemory(ctx, { inputs: ["x"] });
  assert.deepEqual(r, { ok: true, events: [{ text: "有效记忆" }, { text: "另一条" }] });
});

test("extractMemory：只有 title 无 text 的事件 → title 回退生效，返回 title 文本", async () => {
  // 修复后 filter 条件为 (e.text || e.title)，title 回退可达。
  const llm = fakeLLM({ chunks: [td('[{"title":"只有标题"}]')] });
  const ctx = fakeCtx({ store: { llm } });
  const r = await extractMemory(ctx, { inputs: ["x"] });
  assert.equal(r.ok, true);
  assert.equal(r.events[0].text, "只有标题");
});

test("extractMemory：text 截断到 60 字", async () => {
  const long = "记".repeat(80);
  const llm = fakeLLM({ chunks: [td(`[{"text":"${long}"}]`)] });
  const ctx = fakeCtx({ store: { llm } });
  const r = await extractMemory(ctx, { inputs: ["x"] });
  assert.equal(r.ok, true);
  assert.equal(r.events[0].text.length, 60);
});

test("extractMemory：输出条数上限 4（slice(0,4)）", async () => {
  const items = Array.from({ length: 6 }, (_, i) => `{"text":"记忆${i + 1}"}`);
  const llm = fakeLLM({ chunks: [td(`[${items.join(",")}]`)] });
  const ctx = fakeCtx({ store: { llm } });
  const r = await extractMemory(ctx, { inputs: ["x"] });
  assert.equal(r.ok, true);
  assert.equal(r.events.length, 4);
  assert.deepEqual(r.events.map((e) => e.text), ["记忆1", "记忆2", "记忆3", "记忆4"]);
});

test("extractMemory：finish(reason.kind!=='stop') 先到 → 提前 break，后续 text 被忽略", async () => {
  const { gen, state } = countedChunks([fin("length"), td('[{"text":"应被忽略"}]')]);
  const llm = fakeLLM({ streamFactory: () => gen });
  const ctx = fakeCtx({ store: { llm } });
  const r = await extractMemory(ctx, { inputs: ["x"] });
  assert.deepEqual(r, { ok: false, error: "empty" });
  assert.equal(state.consumed, 1, "finish 后应 break，text chunk 不应被消费");
});

test("extractMemory：finish 在文本中途到达 → 只保留 finish 前的文本", async () => {
  const { gen, state } = countedChunks([
    td('[{"text":"第一段"}]'),
    fin("length"),
    td('[{"text":"第二段"}]'),
  ]);
  const llm = fakeLLM({ streamFactory: () => gen });
  const ctx = fakeCtx({ store: { llm } });
  const r = await extractMemory(ctx, { inputs: ["x"] });
  assert.deepEqual(r, { ok: true, events: [{ text: "第一段" }] });
  assert.equal(state.consumed, 2, "finish 后的第二段不应被消费");
});

test("extractMemory：stream 抛错 → {ok:false,error:'extract-failed'} + logger.warn 被调", async () => {
  const llm = fakeLLM({
    streamFactory: () => {
      throw new Error("boom");
    },
  });
  const ctx = fakeCtx({ store: { llm } });
  const r = await extractMemory(ctx, { inputs: ["x"] });
  assert.equal(r.ok, false);
  assert.equal(r.error, "extract-failed");
  assert.equal(r.detail, "boom");
  assert.equal(ctx.warns.length, 1);
});

/* ------------------------------------------------------------------ *
 * memoryChat — 规则闸门短路 + 各字段截断 + llm 假流
 * ------------------------------------------------------------------ */

test("memoryChat：无 llm → {ok:false,error:'no-llm'}", async () => {
  const r = await memoryChat(fakeCtx({ store: {} }), { question: "还记得我们第一次见面吗" });
  assert.deepEqual(r, { ok: false, error: "no-llm" });
});

test("memoryChat：question 为空 → no-question，llm 零调用", async () => {
  const llm = fakeLLM();
  const ctx = fakeCtx({ store: { llm } });
  assert.deepEqual(await memoryChat(ctx, { question: "   " }), { ok: false, error: "no-question" });
  assert.deepEqual(await memoryChat(ctx, { memory: "x" }), { ok: false, error: "no-question" });
  assert.equal(llm.streamCalls, 0);
});

test("memoryChat：规则闸门命中（'2+3等于多少'）→ gate redirect 且 llm.stream 零调用", async () => {
  const llm = fakeLLM({ chunks: [td("不应被调用")] });
  const ctx = fakeCtx({ store: { llm } });
  const r = await memoryChat(ctx, { question: "2+3等于多少", memory: "随便" });
  assert.equal(r.ok, false);
  assert.equal(r.gate, "redirect");
  assert.match(r.text, /小猫/);
  assert.equal(llm.streamCalls, 0, "闸门短路必须零 token");
});

test("memoryChat：question 超过 60 字 → 截断后送入模型", async () => {
  const llm = fakeLLM({ chunks: [td("喵~")] });
  const ctx = fakeCtx({ store: { llm } });
  const long = "还记得" + "记".repeat(100); // 103 字，截断后 60 字
  const r = await memoryChat(ctx, { question: long, memory: "m" });
  assert.equal(r.ok, true);
  const userText = llm.streamArgs[0].messages[0].content[0].text;
  const expected = long.slice(0, 60);
  assert.ok(userText.includes("主人的问题：" + expected));
  assert.ok(!userText.includes("记".repeat(61)), "第 61 字不应出现在模型输入中");
});

test("memoryChat：memory 截断到 4000 字", async () => {
  const llm = fakeLLM({ chunks: [td("喵~")] });
  const ctx = fakeCtx({ store: { llm } });
  const longMem = "m".repeat(5000);
  const r = await memoryChat(ctx, { question: "还记得我们第一次见面吗", memory: longMem });
  assert.equal(r.ok, true);
  const userText = llm.streamArgs[0].messages[0].content[0].text;
  assert.ok(userText.includes("m".repeat(4000)));
  assert.ok(!userText.includes("m".repeat(4001)), "第 4001 个 m 不应出现");
});

test("memoryChat：catName 截 12 / persona 截 60，默认值兜底", async () => {
  const llm = fakeLLM({ chunks: [td("喵~")] });
  const ctx = fakeCtx({ store: { llm } });
  const r = await memoryChat(ctx, {
    question: "还记得我们第一次见面吗",
    catName: "猫".repeat(20),
    persona: "温".repeat(80),
  });
  assert.equal(r.ok, true);
  const system = llm.streamArgs[0].system;
  assert.ok(system.includes("名字叫" + "猫".repeat(12)));
  assert.ok(!system.includes("猫".repeat(13)), "catName 应截断到 12 字");
  assert.ok(system.includes("性格：" + "温".repeat(60) + "。"));
  assert.ok(!system.includes("温".repeat(61)), "persona 应截断到 60 字");
  // 缺省 catName/persona → 默认"小猫"/"温暖可爱"
  const r2 = await memoryChat(fakeCtx({ store: { llm } }), { question: "还记得我们第一次见面吗" });
  assert.equal(r2.ok, true);
  assert.match(llm.streamArgs[1].system, /名字叫小猫/);
  assert.match(llm.streamArgs[1].system, /性格：温暖可爱/);
});

test("memoryChat：正常 → {ok:true,text}，system 含记忆约束，provider/model 正确", async () => {
  const llm = fakeLLM({ chunks: [td("喵~ 我记得那次见面！")] });
  const ctx = fakeCtx({ store: { llm } });
  const r = await memoryChat(ctx, {
    question: "还记得我们第一次见面吗",
    memory: "2024年1月1日 我们第一次见面",
  });
  assert.deepEqual(r, { ok: true, text: "喵~ 我记得那次见面！" });
  assert.equal(llm.streamArgs[0].provider, "deepseek-official");
  assert.equal(llm.streamArgs[0].model, "deepseek-v4-flash");
  assert.match(llm.streamArgs[0].system, /只能基于它们回答/);
});

test("memoryChat：空输出 → {ok:false,error:'empty'}", async () => {
  const llm = fakeLLM({ chunks: [] });
  const ctx = fakeCtx({ store: { llm } });
  const r = await memoryChat(ctx, { question: "还记得我们第一次见面吗", memory: "m" });
  assert.deepEqual(r, { ok: false, error: "empty" });
});

test("memoryChat：抛错 → {ok:false,error:'chat-failed'} + detail + logger.warn", async () => {
  const llm = fakeLLM({ throwOnCall: true });
  const ctx = fakeCtx({ store: { llm } });
  const r = await memoryChat(ctx, { question: "还记得我们第一次见面吗" });
  assert.equal(r.ok, false);
  assert.equal(r.error, "chat-failed");
  assert.equal(r.detail, "llm down");
  assert.equal(ctx.warns.length, 1);
});

/* ------------------------------------------------------------------ *
 * fetchTotalTokens — ctx.get('sessions') + sessionProjections 聚合
 * ------------------------------------------------------------------ */

test("fetchTotalTokens：无 sessions store → {ok:false,error:'unavailable'}", async () => {
  const r = await fetchTotalTokens(fakeCtx({ store: {} }));
  assert.deepEqual(r, { ok: false, error: "unavailable" });
});

test("fetchTotalTokens：多会话聚合 → 四桶分别求和", async () => {
  const store = {
    sessions: sessionsStore([{ id: "alpha" }, { id: "beta" }]),
    sessionProjections: projectionsBy({
      alpha: { uncachedInputTokens: 100, outputTokens: 20, cacheReadTokens: 10, cacheWriteTokens: 5 },
      beta: { uncachedInputTokens: 5, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
    }),
  };
  const r = await fetchTotalTokens(fakeCtx({ store }));
  assert.deepEqual(r, {
    ok: true,
    tokens: 145,
    buckets: { uncachedInputTokens: 105, outputTokens: 25, cacheReadTokens: 10, cacheWriteTokens: 5 },
  });
});

test("fetchTotalTokens：单会话 snapshot 抛错 → 该会话算零，其他会话继续，总账不失败", async () => {
  const store = {
    sessions: sessionsStore([{ id: "bad" }, { id: "good" }]),
    sessionProjections: {
      snapshot: (s) => {
        if (s.id === "bad") throw new Error("boom");
        return { values: { tokenUsage: { uncachedInputTokens: 30, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0 } } };
      },
    },
  };
  const r = await fetchTotalTokens(fakeCtx({ store }));
  assert.equal(r.ok, true);
  assert.equal(r.tokens, 40);
  assert.equal(r.buckets.uncachedInputTokens, 30);
  assert.equal(r.buckets.outputTokens, 10);
});

test("fetchTotalTokens：ctx.get 抛错 → {ok:false,error:'fetch-failed'} + detail + logger.warn", async () => {
  const ctx = fakeCtx({
    get: () => {
      throw new Error("store down");
    },
  });
  const r = await fetchTotalTokens(ctx);
  assert.equal(r.ok, false);
  assert.equal(r.error, "fetch-failed");
  assert.equal(r.detail, "store down");
  assert.equal(ctx.warns.length, 1);
});

/* ------------------------------------------------------------------ *
 * fetchSessionsRanking — 排序 + 截断 + title 容错 + failed 计数
 * ------------------------------------------------------------------ */

test("fetchSessionsRanking：tokens 降序排序", async () => {
  const store = {
    sessions: sessionsStore([{ id: "a" }, { id: "b" }, { id: "c" }]),
    sessionProjections: projectionsBy({
      a: { uncachedInputTokens: 10, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      b: { uncachedInputTokens: 100, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      c: { uncachedInputTokens: 50, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    }),
    sessionTitle: { get: (s) => `标题${s.id}` },
  };
  const r = await fetchSessionsRanking(fakeCtx({ store }));
  assert.deepEqual(r.sessions.map((s) => s.id), ["b", "c", "a"]);
  assert.deepEqual(r.sessions.map((s) => s.tokens), [100, 50, 10]);
});

test("fetchSessionsRanking：id 截 12、title 截 30（string 与 {title} 对象两种形态）", async () => {
  const longId = "very-long-session-id-123456";
  const store = {
    sessions: sessionsStore([{ id: longId }, { id: "short" }]),
    sessionProjections: projectionsBy({
      [longId]: { uncachedInputTokens: 5, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      short: { uncachedInputTokens: 5, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    }),
    sessionTitle: {
      get: (s) => (s.id === "short" ? { title: "对".repeat(40) } : "串".repeat(40)),
    },
  };
  const r = await fetchSessionsRanking(fakeCtx({ store }));
  const byId = Object.fromEntries(r.sessions.map((s) => [s.id, s]));
  assert.equal(byId[longId.slice(0, 12)].id, longId.slice(0, 12));
  assert.equal(byId[longId.slice(0, 12)].title.length, 30);
  assert.equal(byId.short.title, "对".repeat(30));
  assert.equal(byId.short.title.length, 30);
});

test("fetchSessionsRanking：sessionTitle.get 抛错 → title 为空串，行不失败，failed 不增", async () => {
  const store = {
    sessions: sessionsStore([{ id: "a" }]),
    sessionProjections: projectionsBy({ a: { uncachedInputTokens: 5, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 } }),
    sessionTitle: {
      get: () => {
        throw new Error("title boom");
      },
    },
  };
  const r = await fetchSessionsRanking(fakeCtx({ store }));
  assert.equal(r.ok, true);
  assert.equal(r.sessions.length, 1);
  assert.equal(r.sessions[0].title, "");
  assert.equal(r.failed, 0);
});

test("fetchSessionsRanking：无 sessionTitle 服务 → title 为空串", async () => {
  const store = {
    sessions: sessionsStore([{ id: "a" }]),
    sessionProjections: projectionsBy({ a: { uncachedInputTokens: 1, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 } }),
  };
  const r = await fetchSessionsRanking(fakeCtx({ store }));
  assert.equal(r.ok, true);
  assert.equal(r.sessions[0].title, "");
});

test("fetchSessionsRanking：无 sessions store → {ok:false,error:'unavailable'}", async () => {
  const r = await fetchSessionsRanking(fakeCtx({ store: {} }));
  assert.deepEqual(r, { ok: false, error: "unavailable" });
});

test("fetchSessionsRanking：空列表 → ok:true, sessions:[]", async () => {
  const r = await fetchSessionsRanking(fakeCtx({ store: { sessions: sessionsStore([]) } }));
  assert.deepEqual(r, { ok: true, sessions: [], failed: 0 });
});

test("fetchSessionsRanking：session 读取抛错 → failed 计数 +1，其余行不受影响", async () => {
  const bad = {};
  Object.defineProperty(bad, "id", {
    get() {
      throw new Error("boom");
    },
  });
  const store = {
    sessions: sessionsStore([{ id: "good" }, bad]),
    sessionProjections: projectionsBy({ good: { uncachedInputTokens: 5, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 } }),
    sessionTitle: { get: () => "" },
  };
  const r = await fetchSessionsRanking(fakeCtx({ store }));
  assert.equal(r.ok, true);
  assert.equal(r.sessions.length, 1);
  assert.equal(r.sessions[0].id, "good");
  assert.equal(r.failed, 1);
});

/* ------------------------------------------------------------------ *
 * fetchBalance — ctx.credentials.resolve + 全局 fetch（用后恢复）
 * ------------------------------------------------------------------ */

test("fetchBalance：credentials 无 value → {ok:false,error:'no-key'} 且不调 fetch", async () => {
  await withFetch(
    async () => {
      throw new Error("must not be called");
    },
    async (calls) => {
      const r1 = await fetchBalance(fakeCtx({ credentials: { resolve: async () => ({}) } }));
      const r2 = await fetchBalance(fakeCtx({ credentials: { resolve: async () => ({ value: "" }) } }));
      assert.deepEqual(r1, { ok: false, error: "no-key" });
      assert.deepEqual(r2, { ok: false, error: "no-key" });
      assert.equal(calls.length, 0);
    },
  );
});

test("fetchBalance：fetch 返回非 2xx → {ok:false,error:'http-<status>'}", async () => {
  await withFetch(
    async () => ({ ok: false, status: 401 }),
    async () => {
      const r = await fetchBalance(fakeCtx());
      assert.deepEqual(r, { ok: false, error: "http-401" });
    },
  );
});

test("fetchBalance：balance_infos 含 CNY 和 USD → 选 CNY，Bearer key 正确", async () => {
  await withFetch(
    async () => ({
      ok: true,
      json: async () => ({
        is_available: true,
        balance_infos: [
          { currency: "USD", total_balance: "9.99", granted_balance: "1.00", topped_up_balance: "8.99" },
          { currency: "CNY", total_balance: "100.50", granted_balance: "40.00", topped_up_balance: "60.50" },
        ],
      }),
    }),
    async (calls) => {
      const r = await fetchBalance(fakeCtx());
      assert.equal(r.ok, true);
      assert.equal(r.isAvailable, true);
      assert.equal(r.currency, "CNY");
      assert.equal(r.total, "100.50");
      assert.equal(r.granted, "40.00");
      assert.equal(r.toppedUp, "60.50");
      assert.equal(calls.length, 1);
      assert.equal(calls[0].opts.headers.authorization, "Bearer sk-test");
      assert.equal(calls[0].opts.headers.accept, "application/json");
    },
  );
});

test("fetchBalance：balance_infos 只有 USD → 取第一个", async () => {
  await withFetch(
    async () => ({
      ok: true,
      json: async () => ({ is_available: false, balance_infos: [{ currency: "USD", total_balance: "5.00" }] }),
    }),
    async () => {
      const r = await fetchBalance(fakeCtx());
      assert.equal(r.ok, true);
      assert.equal(r.isAvailable, false);
      assert.equal(r.currency, "USD");
      assert.equal(r.total, "5.00");
    },
  );
});

test("fetchBalance：balance_infos 非数组 → 空数组兜底（金额字段为 null）", async () => {
  await withFetch(
    async () => ({
      ok: true,
      json: async () => ({ is_available: true, balance_infos: "nope" }),
    }),
    async () => {
      const r = await fetchBalance(fakeCtx());
      assert.equal(r.ok, true);
      assert.equal(r.isAvailable, true);
      assert.equal(r.currency, null);
      assert.equal(r.total, null);
      assert.equal(r.granted, null);
      assert.equal(r.toppedUp, null);
    },
  );
});

test("fetchBalance：fetch 抛错 → {ok:false,error:'fetch-failed'} + logger.warn", async () => {
  await withFetch(
    async () => {
      throw new Error("network down");
    },
    async () => {
      const ctx = fakeCtx();
      const r = await fetchBalance(ctx);
      assert.deepEqual(r, { ok: false, error: "fetch-failed" });
      assert.equal(ctx.warns.length, 1);
    },
  );
});

test("fetchBalance：credentials.resolve 抛错 → fetch-failed，不调 fetch", async () => {
  await withFetch(
    async () => {
      throw new Error("must not be called");
    },
    async (calls) => {
      const ctx = fakeCtx({
        credentials: {
          resolve: async () => {
            throw new Error("cred down");
          },
        },
      });
      const r = await fetchBalance(ctx);
      assert.deepEqual(r, { ok: false, error: "fetch-failed" });
      assert.equal(ctx.warns.length, 1);
      assert.equal(calls.length, 0);
    },
  );
});

/* ------------------------------------------------------------------ *
 * generateHint — 假 llm 流 → {ok,text,action}，出错无 detail
 * ------------------------------------------------------------------ */

test("generateHint：无 llm → {ok:false,error:'no-llm'}", async () => {
  const r = await generateHint(fakeCtx({ store: {} }), { context: "late" });
  assert.deepEqual(r, { ok: false, error: "no-llm" });
});

test("generateHint：stream 正常 → {ok:true,text,action}，provider/model 正确", async () => {
  const llm = fakeLLM({ chunks: [td('{"text":"早点休息喵~","action":"sleep"}')] });
  const ctx = fakeCtx({ store: { llm } });
  const r = await generateHint(ctx, { context: "late", hour: 23 });
  assert.deepEqual(r, { ok: true, text: "早点休息喵~", action: "sleep" });
  assert.equal(llm.streamArgs[0].provider, "deepseek-official");
  assert.equal(llm.streamArgs[0].model, "deepseek-v4-flash");
  assert.match(llm.streamArgs[0].system, /输出必须是 JSON/);
});

test("generateHint：空 text → {ok:false,error:'empty'}", async () => {
  const llm = fakeLLM({ chunks: [td("")] });
  const ctx = fakeCtx({ store: { llm } });
  const r1 = await generateHint(ctx, {});
  assert.deepEqual(r1, { ok: false, error: "empty" });
  const llm2 = fakeLLM({ chunks: [] });
  const r2 = await generateHint(fakeCtx({ store: { llm: llm2 } }), {});
  assert.deepEqual(r2, { ok: false, error: "empty" });
});

test("generateHint：抛错 → {ok:false,error:'hint-failed'}（无 detail 字段）+ logger.warn", async () => {
  const llm = fakeLLM({ throwOnCall: true });
  const ctx = fakeCtx({ store: { llm } });
  const r = await generateHint(ctx, {});
  assert.equal(r.ok, false);
  assert.equal(r.error, "hint-failed");
  assert.equal("detail" in r, false);
  assert.equal(ctx.warns.length, 1);
});
