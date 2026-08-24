/**
 * companion-pet, node half — 核心纯逻辑测试。
 *
 * 被测对象：lib/index.js（ESM）。
 * 零依赖：仅 node:test + node:assert/strict（Node 24 内置）。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  gateMemoryQuestion,
  buildHintPrompt,
  parseHintReply,
  makeUserMessage,
} from "../lib/index.js";

/* ------------------------------------------------------------------ *
 * gateMemoryQuestion — 记忆问题的规则闸门（零 token）
 * ------------------------------------------------------------------ */

test("gateMemoryQuestion 拦截数学/计算类问题", () => {
  assert.equal(gateMemoryQuestion("2+3等于多少").ok, false);
  assert.equal(gateMemoryQuestion("帮我算一下 15*4").ok, false);
  assert.equal(gateMemoryQuestion("计算 100-30").ok, false);
  assert.equal(gateMemoryQuestion("几加几等于几").ok, false);
  assert.equal(gateMemoryQuestion("解一道方程").ok, false);
  assert.equal(gateMemoryQuestion("求导数").ok, false);
});

test("gateMemoryQuestion 拦截代码/技术/翻译/通用知识类问题", () => {
  assert.equal(gateMemoryQuestion("帮我写一个排序函数").ok, false);
  assert.equal(gateMemoryQuestion("这段代码报错了怎么办").ok, false);
  assert.equal(gateMemoryQuestion("什么是大语言模型").ok, false);
  assert.equal(gateMemoryQuestion("介绍一下天气预报").ok, false);
  assert.equal(gateMemoryQuestion("帮我翻译一下这段话").ok, false);
  assert.equal(gateMemoryQuestion("历史上最大的猫是什么").ok, false);
});

test("gateMemoryQuestion 拦截规则优先于记忆词（强信号先行）", () => {
  // 即使包含“我们”等记忆词，明确的计算意图仍然拦截
  assert.equal(gateMemoryQuestion("帮我算一下我们上次聊到哪了").ok, false);
  assert.equal(gateMemoryQuestion("帮我总结一下今天的工作").ok, false);
});

test("gateMemoryQuestion 放行回忆/陪伴类问题", () => {
  assert.equal(gateMemoryQuestion("还记得我们第一次见面吗").ok, true);
  assert.equal(gateMemoryQuestion("你觉得我最近怎么样").ok, true);
  assert.equal(gateMemoryQuestion("还记得上周我们聊了什么吗").ok, true);
  assert.equal(gateMemoryQuestion("我们认识多久了").ok, true);
});

test("gateMemoryQuestion 边界：'我最开心什么时候' 放行", () => {
  // 不该被“什么时候/什么”误判为通用知识
  assert.equal(gateMemoryQuestion("我最开心什么时候").ok, true);
  assert.equal(gateMemoryQuestion("你最喜欢什么").ok, true);
});

test("gateMemoryQuestion 模糊问题默认放行（交给模型兜底）", () => {
  assert.equal(gateMemoryQuestion("陪我聊聊天").ok, true);
  assert.equal(gateMemoryQuestion("你好呀").ok, true);
});

test("gateMemoryQuestion 拦截时给出温柔引导文案", () => {
  const r = gateMemoryQuestion("2+3等于多少");
  assert.equal(r.ok, false);
  assert.match(r.text, /小猫/);
  assert.match(r.text, /回忆/);
});

/* ------------------------------------------------------------------ *
 * buildHintPrompt — 情境文案组装
 * ------------------------------------------------------------------ */

test("buildHintPrompt 深夜+多日未归+长连续陪伴情境", () => {
  const out = buildHintPrompt({
    context: "late",
    hour: 23,
    gap: 2,
    streak: 5,
    lateStreak: 3,
    todaySec: 3600,
    mood: { a: 2, h: 1 },
    weekClicks: 12,
    weekAsks: 3,
  });
  assert.match(out, /^行为摘要：/);
  assert.match(out, /情境：深夜/);
  assert.match(out, /当前时间：23 点/);
  assert.match(out, /已 2 天没来/);
  assert.match(out, /连续 5 天陪伴/);
  assert.match(out, /连续 3 天晚睡/);
  assert.match(out, /今天已在用 60 分钟/);
  assert.match(out, /最近 2 次情绪激动/);
  assert.match(out, /最近 1 次很开心/);
  assert.match(out, /这周被摸了 12 次/);
  assert.match(out, /这周被问了 3 个问题/);
  assert.match(out, /请生成一句关怀。$/);
});

test("buildHintPrompt 默认/空情境只含基础行", () => {
  // profile.context 缺省 → "greet" → 情境：打开工作台
  const out = buildHintPrompt({ hour: 10 });
  assert.match(out, /情境：打开工作台/);
  assert.match(out, /当前时间：10 点/);
  assert.match(out, /今天来过/);
  assert.match(out, /作息正常/);
  assert.match(out, /今天刚开始/);
  assert.match(out, /情绪平稳/);
  assert.doesNotMatch(out, /连续/);
  assert.doesNotMatch(out, /被摸/);
  assert.doesNotMatch(out, /被问/);
});

/* ------------------------------------------------------------------ *
 * parseHintReply — 模型回复解析（JSON / 代码块 / 容错）
 * ------------------------------------------------------------------ */

test("parseHintReply 解析普通 JSON", () => {
  assert.deepEqual(parseHintReply('{"text":"早点休息喵~","action":"sleep"}'), {
    text: "早点休息喵~",
    action: "sleep",
  });
});

test("parseHintReply 剥离 JSON 代码块", () => {
  const raw = '```json\n{"text":"加油！","action":"celebrate"}\n```';
  assert.deepEqual(parseHintReply(raw), { text: "加油！", action: "celebrate" });
  const rawUpper = '```JSON\n{"text":"加油！","action":"celebrate"}\n```';
  assert.deepEqual(parseHintReply(rawUpper), { text: "加油！", action: "celebrate" });
  const rawBare = '```\n{"text":"喵~","action":"idle"}\n```';
  assert.deepEqual(parseHintReply(rawBare), { text: "喵~", action: "idle" });
});

test("parseHintReply 非法 action 清空为 ''", () => {
  assert.deepEqual(parseHintReply('{"text":"x","action":"dance"}'), { text: "x", action: "" });
  assert.deepEqual(parseHintReply('{"text":"x","action":"SLEEP"}'), { text: "x", action: "" });
});

test("parseHintReply 非 JSON 回退为纯文本", () => {
  assert.deepEqual(parseHintReply("随便说点什么"), { text: "随便说点什么", action: "" });
  assert.deepEqual(parseHintReply(""), { text: "", action: "" });
  assert.deepEqual(parseHintReply(null), { text: "", action: "" });
});

test("parseHintReply 文本截断到 60 字", () => {
  const long = "长".repeat(80);
  const r = parseHintReply(`{"text":"${long}","action":"sad"}`);
  assert.equal(r.text.length, 60);
  assert.equal(r.action, "sad");
});

/* ------------------------------------------------------------------ *
 * makeUserMessage — 用户消息结构
 * ------------------------------------------------------------------ */

test("makeUserMessage 产出冻结的 dsh-llm 用户消息结构", () => {
  const msg = makeUserMessage("你好小猫");
  assert.equal(msg.role, "user");
  assert.equal(msg.content[0].type, "text");
  assert.equal(msg.content[0].text, "你好小猫");
  assert.equal(msg.source.kind, "user");
  assert.match(msg.id, /^pet-/);
  assert.equal(Object.isFrozen(msg), true);
  assert.equal(Object.isFrozen(msg.content), true);
  assert.equal(Object.isFrozen(msg.content[0]), true);
  assert.equal(Object.isFrozen(msg.source), true);
});

test("makeUserMessage 每次调用生成不同 id", () => {
  const a = makeUserMessage("x");
  const b = makeUserMessage("x");
  assert.notEqual(a.id, b.id);
});
