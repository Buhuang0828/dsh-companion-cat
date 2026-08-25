/**
 * companion-pet, browser half — 第三批纯函数补测（client-more）。
 *
 * 被测对象：lib/client.js 新增发布的纯函数
 *   - packMemory（记忆打包：首遇/里程碑/近况统计/sessions/notes 注入规则）
 *   - bumpMood / bumpWeekActivity（情绪与互动计数，7 天滚动清理）
 *   - pickGreeting / pickLateBubble / pickAngryBubble（问候与安抚文案规则）
 *   - migrateDaily / resetToday / pruneDaily（daily 迁移/重置/裁剪）
 *   - buildTimelineRows / sessionCost / actionsFor（时间线/计费/动作目录）
 *   - menuItemsForCat / ambientPool（按 currentCat.acts 过滤）
 *   - writeConfig（配置往返；defaultConfig/readConfig 已在第一批覆盖，这里补往返）
 *
 * 加载方式与第一批一致：挂 window.__ModuleLoader__ mock 让 client.js 的
 * factory 在 Node 里执行并捕获 module.exports，再经 __runTestHarness()
 * 触发 createPet 首行发布。注意与 client-pure.test.js 共用同一进程
 * （--test-isolation=none）：node 按文件名排序执行，两个文件的模块级
 * mock 会互相覆盖、beforeEach 钩子对所有测试都会触发。因此本文件
 * 不依赖模块级 Date 常驻：storage 一律清"当前生效的"localStorage；
 * 需要特定时刻的断言用 withClock() 在测试体内临时换装本文件的
 * FakeDate（同步执行，天然原子，不影响其他文件）。
 *
 * currentCat 是 createPet 内的 mid-body var，测试通过先 seed config 再
 * 重跑 __runTestHarness() 来驱动（发布块内按 readConfig() 重初始化）。
 *
 * 运行：node --test --test-isolation=none test/client-more.test.js
 */
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";

/* ------------------------- 加载浏览器闭包（全新实例） ------------------------- */

const captured = { exports: null };
globalThis.window = {
  __ModuleLoader__: {
    load(entry) {
      captured.exports = entry.factory(() => {
        throw new Error("factory must not call require() at load time");
      });
    },
  },
};

/* fake localStorage：client.js 闭包内引用全局 localStorage，调用时才解析 */
const lsStore = new Map();
globalThis.localStorage = {
  getItem: (k) => (lsStore.has(k) ? lsStore.get(k) : null),
  setItem: (k, v) => {
    lsStore.set(k, String(v));
  },
  removeItem: (k) => {
    lsStore.delete(k);
  },
  clear: () => {
    lsStore.clear();
  },
  key: (i) => [...lsStore.keys()][i] ?? null,
  get length() {
    return lsStore.size;
  },
};

/* fake Date：控制“今天”与当前时刻 */
const RealDate = globalThis.Date;
let nowMs = RealDate.parse("2026-08-24T10:00:00");
class FakeDate extends RealDate {
  constructor(...args) {
    if (args.length === 0) super(nowMs);
    else super(...args);
  }
  static now() {
    return nowMs;
  }
}
globalThis.Date = FakeDate;

/* 与 client-pure.test.js 同进程共存时绕开 ESM 缓存，强制重新求值 */
const freshUrl =
  new URL("../lib/client.js?t=" + Date.now() + "-" + Math.random().toString(36).slice(2), import.meta.url).href;
await import(freshUrl);

const exportsObj = captured.exports;
assert.equal(typeof exportsObj.apply, "function", "module.exports.apply 必须保留");
const harness = exportsObj.__runTestHarness();
assert.equal(harness.published, true, "createPet 首行应发布 __test");
const T = exportsObj.__test;
assert.ok(T && typeof T === "object", "__test 必须存在");

/* localStorage 键（与 lib/client.js 内 KEYS 保持一致） */
const K = {
  cfg: "companion-pet:config:v3",
  profile: "dsh-companion-cat:profile",
  memory: "dsh-companion-cat:memory",
  daily: "dsh-companion-cat:daily",
  stats: "dsh-companion-cat:stats",
  statsLast: "dsh-companion-cat:stats-last",
  dailyMigrated: "dsh-companion-cat:daily-migrated",
  dailyReset: "dsh-companion-cat:daily-reset-v2",
};

/* 测试小工具 */
function setClock(iso) {
  nowMs = RealDate.parse(iso);
}
function seed(key, value) {
  globalThis.localStorage.setItem(key, JSON.stringify(value));
}
/** 清空"当前生效的" localStorage（共享进程里可能是 client-pure 的实例）。 */
function resetStorage() {
  globalThis.localStorage.clear();
}
/** 在指定时刻下执行 fn：共享进程里全局 Date 可能被其他文件覆盖，
    这里在测试体内临时换装本文件的 FakeDate，同步执行完立即恢复。 */
function withClock(iso, fn) {
  const prev = globalThis.Date;
  globalThis.Date = FakeDate;
  nowMs = RealDate.parse(iso);
  try {
    return fn();
  } finally {
    globalThis.Date = prev;
  }
}
/** 通过 config 驱动闭包内 currentCat（发布块按 readConfig() 重初始化）。 */
function setCat(key) {
  seed(K.cfg, { cat: key });
  exportsObj.__runTestHarness();
}
/** 构造最小 memory（firstMet 必填，readMem 要求）。 */
function mkMem(over = {}) {
  return Object.assign(
    {
      firstMet: { cat: "orange", date: "2026-08-01" },
      milestones: [],
      sessions: [],
      notes: [],
    },
    over
  );
}

beforeEach(() => {
  resetStorage();
  setClock("2026-08-24T10:00:00");
  /* 重跑发布块：重置 currentCat（默认橘橘）等闭包状态 */
  exportsObj.__runTestHarness();
});

after(() => {
  globalThis.Date = RealDate;
  delete globalThis.window;
  delete globalThis.localStorage;
});

/* ------------------------------------------------------------------ *
 * 加载自检：第三批函数全部发布
 * ------------------------------------------------------------------ */

test("加载：第三批纯函数已发布到 __test", () => {
  const expectKeys = [
    "packMemory", "bumpMood", "bumpWeekActivity", "pickGreeting", "pickLateBubble",
    "pickAngryBubble", "migrateDaily", "resetToday", "pruneDaily", "buildTimelineRows",
    "sessionCost", "actionsFor", "menuItemsForCat", "ambientPool", "writeConfig",
  ];
  for (const k of expectKeys) {
    assert.equal(typeof T[k], "function", `__test.${k} 必须是函数`);
  }
});

/* ------------------------------------------------------------------ *
 * packMemory — 记忆打包注入规则
 * ------------------------------------------------------------------ */

test("packMemory：无记忆时返回回退文案", () => {
  assert.equal(T.packMemory("你好呀"), "（暂无记忆，但我们刚刚开始）");
  assert.equal(T.packMemory(""), "（暂无记忆，但我们刚刚开始）");
});

test("packMemory：首行含第一次相遇日期与认识天数", () => {
  seed(K.memory, mkMem());
  const out = T.packMemory("随便聊聊");
  assert.ok(out.includes("第一次相遇（2026-08-01）"), "应含第一次相遇日期");
  assert.ok(out.includes("我们认识 23 天了"), "2026-08-01 距 08-24 应为 23 天");
});

test("packMemory：问'最深刻'给全部里程碑，普通问题只给最新 5 条", () => {
  const mem = mkMem({
    milestones: [
      { date: "2026-08-05", text: "m1" },
      { date: "2026-08-10", text: "m2" },
      { date: "2026-08-12", text: "m3" },
      { date: "2026-08-15", text: "m4" },
      { date: "2026-08-18", text: "m5" },
      { date: "2026-08-20", text: "m6" },
    ],
  });
  seed(K.memory, mem);
  const all = T.packMemory("最深刻的瞬间是什么");
  ["m1", "m2", "m3", "m4", "m5", "m6"].forEach((t) => {
    assert.ok(all.includes(t), "最深刻应包含全部里程碑：" + t);
  });
  const few = T.packMemory("随便聊聊");
  ["m2", "m3", "m4", "m5", "m6"].forEach((t) => {
    assert.ok(few.includes(t), "普通问题应包含最新里程碑：" + t);
  });
  assert.ok(!few.includes("m1"), "普通问题不应包含最早的 m1");
});

test("packMemory：空问题注入近况统计（在线/连续/晚睡/情绪/时段/互动）", () => {
  seed(K.daily, { "2026-08-20": { s: 7200 }, "2026-08-24": { s: 3600 } });
  seed(K.profile, {
    lastSeen: "2026-08-23",
    streak: 5,
    lateStreak: 2,
    mood: { "2026-08-20": { a: 3, h: 1 } },
    activeHours: { "10": 5, "14": 3 },
    week: { "2026-08-20": { c: 12, a: 2 } },
  });
  const out = T.packMemory("");
  assert.ok(out.includes("最近一周在线约 3 小时"), "10800s → 3 小时");
  assert.ok(out.includes("主人已经连续 5 天来看我了"));
  assert.ok(out.includes("最近连续 2 天晚睡"));
  assert.ok(out.includes("最近一周主人情绪激动 3 次"));
  assert.ok(out.includes("最近一周主人开心 1 次"));
  assert.ok(out.includes("主人常在这个时段出现：10 点、14 点"));
  assert.ok(out.includes("这周主人摸了我 12 次"));
  assert.ok(out.includes("这周主人问了我 2 个问题"));
});

test("packMemory：问'最近怎么样'也注入近况统计", () => {
  seed(K.daily, { "2026-08-24": { s: 3600 } });
  seed(K.profile, { lastSeen: "2026-08-23", streak: 3 });
  const out = T.packMemory("最近怎么样");
  assert.ok(out.includes("最近一周在线约 1 小时"));
  assert.ok(out.includes("主人已经连续 3 天来看我了"));
});

test("packMemory：问'一年前'不注入近况统计", () => {
  seed(K.memory, mkMem());
  seed(K.daily, { "2026-08-24": { s: 3600 } });
  seed(K.profile, { lastSeen: "2026-08-23", streak: 9 });
  const out = T.packMemory("一年前我们在干嘛");
  assert.ok(out.includes("我们认识 23 天了"), "记忆行仍应存在");
  assert.ok(!out.includes("最近一周在线"), "不应注入在线时长");
  assert.ok(!out.includes("连续"), "不应注入连续天数");
});

test("packMemory：sessions 只注入最新 5 条标题", () => {
  const sessions = Array.from({ length: 7 }, (_, i) => ({ title: "会话" + (i + 1) }));
  seed(K.memory, mkMem({ sessions }));
  const out = T.packMemory("最近怎么样");
  assert.ok(
    out.includes("最近的工作记录：会话3、会话4、会话5、会话6、会话7"),
    "slice(-5) 只取最新 5 条"
  );
});

test("packMemory：问'最深刻'注入最新 40 + 最早 10 条笔记", () => {
  const notes = Array.from({ length: 50 }, (_, i) => ({
    date: "2026-08-01",
    text: "n" + String(i + 1).padStart(2, "0"),
  }));
  seed(K.memory, mkMem({ notes }));
  const out = T.packMemory("最深刻的瞬间是什么");
  const line = out.split("\n").find((l) => l.startsWith("我记得的一些事："));
  assert.ok(line, "应注入笔记行");
  assert.ok(line.includes("n50"), "应含最新笔记");
  assert.ok(line.includes("n01"), "应含最早笔记");
  assert.ok(line.endsWith("2026-08-01 n10"), "顺序：最新 40 在前、最早 10 在后");
});

test("packMemory：问'最近'只注入近 7 天笔记", () => {
  const notes = [
    { date: "2026-08-10", text: "old" },
    { date: "2026-08-17", text: "edge" },
    { date: "2026-08-20", text: "mid" },
    { date: "2026-08-24", text: "today" },
  ];
  seed(K.memory, mkMem({ notes }));
  const out = T.packMemory("最近怎么样");
  const line = out.split("\n").find((l) => l.startsWith("我记得的一些事："));
  assert.ok(line, "应注入笔记行");
  assert.ok(line.includes("edge") && line.includes("mid") && line.includes("today"));
  assert.ok(!line.includes("old"), "8 月 10 日早于 7 天窗口，不应注入");
});

/* ------------------------------------------------------------------ *
 * bumpMood / bumpWeekActivity — 7 天滚动计数
 * ------------------------------------------------------------------ */

test("bumpMood：今日情绪计数累加（a/h 分开）", () => {
  seed(K.profile, { lastSeen: "2026-08-23" }); // readProfile 要求 lastSeen 非空
  T.bumpMood("a");
  T.bumpMood("a");
  T.bumpMood("h");
  const p = T.readProfile();
  assert.deepEqual(p.mood["2026-08-24"], { a: 2, h: 1 });
});

test("bumpMood：超过 7 天的情绪日期被清理", () => {
  seed(K.profile, {
    lastSeen: "2026-08-23",
    mood: {
      "2026-08-10": { a: 9, h: 0 }, // 早于 cutoff 2026-08-17
      "2026-08-20": { a: 1, h: 0 },
    },
  });
  T.bumpMood("a");
  const p = T.readProfile();
  assert.deepEqual(Object.keys(p.mood).sort(), ["2026-08-20", "2026-08-24"]);
  assert.equal(p.mood["2026-08-24"].a, 1);
});

test("bumpWeekActivity：click/ask 分桶累加", () => {
  seed(K.profile, { lastSeen: "2026-08-23" });
  T.bumpWeekActivity("click");
  T.bumpWeekActivity("click");
  T.bumpWeekActivity("ask");
  const p = T.readProfile();
  assert.deepEqual(p.week["2026-08-24"], { c: 2, a: 1 });
});

test("bumpWeekActivity：超过 7 天的日期被清理", () => {
  seed(K.profile, {
    lastSeen: "2026-08-23",
    week: { "2026-08-10": { c: 5, a: 5 }, "2026-08-20": { c: 1, a: 0 } },
  });
  T.bumpWeekActivity("click");
  const p = T.readProfile();
  assert.deepEqual(Object.keys(p.week).sort(), ["2026-08-20", "2026-08-24"]);
});

/* ------------------------------------------------------------------ *
 * pickGreeting — 问候文案规则（FakeDate 控时）
 * ------------------------------------------------------------------ */

test("pickGreeting：smartCompanion 关闭时返回随机池文案", () => {
  seed(K.cfg, { smartCompanion: false });
  for (let i = 0; i < 20; i++) {
    assert.ok(["喵！我来了~", "小猫就位，随时陪你~"].includes(T.pickGreeting()));
  }
});

test("pickGreeting：间隔 >=3 天说'想我了吗'", () => {
  seed(K.profile, { lastSeen: "2026-08-20" }); // 距 08-24 = 4 天
  assert.equal(T.pickGreeting(), "你都 4 天没来看我啦，想我了吗喵~");
});

test("pickGreeting：间隔 1-2 天说'好久不见'", () => {
  seed(K.profile, { lastSeen: "2026-08-22" }); // 距 08-24 = 2 天
  assert.equal(T.pickGreeting(), "好久不见！今天也要加油喵~");
});

test("pickGreeting：连续 7 天以上夸夸", () => {
  seed(K.profile, { lastSeen: "2026-08-24", streak: 7 });
  assert.equal(T.pickGreeting(), "已经连续 7 天见到你啦，好幸福喵~");
});

test("pickGreeting：深夜（23 点后）提醒休息", () => {
  seed(K.profile, { lastSeen: "2026-08-24" });
  withClock("2026-08-24T23:30:00", () => {
    assert.equal(T.pickGreeting(), "这么晚还没睡呀，注意休息喵");
  });
});

test("pickGreeting：按时段选择早安/午安/晚上好/凌晨", () => {
  seed(K.profile, { lastSeen: "2026-08-24" });
  withClock("2026-08-24T08:00:00", () => {
    assert.equal(T.pickGreeting(), "早安喵~今天也要元气满满！");
  });
  withClock("2026-08-24T14:00:00", () => {
    assert.equal(T.pickGreeting(), "午安喵，在忙什么呀？");
  });
  withClock("2026-08-24T20:00:00", () => {
    assert.equal(T.pickGreeting(), "晚上好喵~");
  });
  withClock("2026-08-24T05:30:00", () => {
    assert.equal(T.pickGreeting(), "夜深了……猫猫陪你");
  });
});

/* ------------------------------------------------------------------ *
 * pickLateBubble / pickAngryBubble
 * ------------------------------------------------------------------ */

test("pickLateBubble：lateStreak>=2 且智能陪伴时固定提醒", () => {
  seed(K.profile, { lastSeen: "2026-08-23", lateStreak: 2 });
  assert.equal(T.pickLateBubble(), "你最近都熬到这么晚，今晚早点休息好不好喵~");
});

test("pickLateBubble：否则返回随机池文案", () => {
  const pool = [
    "都这么晚啦，早点休息喵~",
    "夜深了，猫猫也要打盹了，你也睡吧~",
    "这么晚了还在忙呀，注意身体喵",
  ];
  for (let i = 0; i < 20; i++) {
    assert.ok(pool.includes(T.pickLateBubble()), "应落在 LATE_BUBBLES 池内");
  }
  seed(K.profile, { lastSeen: "2026-08-23", lateStreak: 1 });
  for (let i = 0; i < 20; i++) {
    assert.ok(pool.includes(T.pickLateBubble()), "lateStreak=1 仍走随机池");
  }
});

test("pickAngryBubble：周情绪激动 >=3 次时固定安抚", () => {
  seed(K.profile, { lastSeen: "2026-08-23", mood: { "2026-08-20": { a: 3, h: 0 } } });
  assert.equal(T.pickAngryBubble(), "最近好像不太顺心呀……摸摸猫猫，气就消一半啦！");
});

test("pickAngryBubble：否则返回随机池文案", () => {
  const pool = [
    "别生气啦，摸摸猫猫消消气~",
    "喵呜……不气不气，我跳个舞给你看！",
    "生气会变丑的喵，我陪你缓缓~",
  ];
  for (let i = 0; i < 20; i++) {
    assert.ok(pool.includes(T.pickAngryBubble()), "应落在 ANGRY_BUBBLES 池内");
  }
});

/* ------------------------------------------------------------------ *
 * migrateDaily / resetToday / pruneDaily
 * ------------------------------------------------------------------ */

test("migrateDaily：一次性合并 legacy stats（v2 才带 turns）", () => {
  seed(K.stats, { date: "2026-08-20", seconds: 500, turns: 10, v: 2 });
  seed(K.statsLast, { date: "2026-08-23", seconds: 300, turns: 7 }); // 无 v → v1 语义
  T.migrateDaily();
  const d = JSON.parse(localStorage.getItem(K.daily));
  assert.deepEqual(d["2026-08-20"], { s: 500, t: 10, k: 0 }, "v2 应携带 turns");
  assert.deepEqual(d["2026-08-23"], { s: 300, t: 0, k: 0 }, "v1 不带 turns");
  assert.equal(localStorage.getItem(K.dailyMigrated), "1");
});

test("migrateDaily：标记置位后二次调用幂等，不再合并", () => {
  seed(K.stats, { date: "2026-08-20", seconds: 500, turns: 10, v: 2 });
  T.migrateDaily();
  seed(K.stats, { date: "2026-08-24", seconds: 999, turns: 99, v: 2 }); // 改动 legacy
  T.migrateDaily();
  const d = JSON.parse(localStorage.getItem(K.daily));
  assert.ok(!d["2026-08-24"], "标记已置位，不应再次合并");
  assert.equal(d["2026-08-20"].s, 500);
});

test("migrateDaily：legacy 日期超过 30 天被清理", () => {
  seed(K.stats, { date: "2026-06-01", seconds: 100, turns: 1, v: 2 });
  T.migrateDaily();
  const d = JSON.parse(localStorage.getItem(K.daily));
  assert.deepEqual(d, {});
});

test("resetToday：只清零今日 s/k/i/o/r/w，他日与 turns 不动", () => {
  seed(K.daily, {
    "2026-08-24": { s: 100, k: 200, i: 1, o: 2, r: 3, w: 4, t: 99 },
    "2026-08-23": { s: 50, t: 5, k: 10 },
  });
  T.resetToday();
  const d = JSON.parse(localStorage.getItem(K.daily));
  assert.deepEqual(d["2026-08-24"], { s: 0, k: 0, i: 0, o: 0, r: 0, w: 0, t: 99 });
  assert.deepEqual(d["2026-08-23"], { s: 50, t: 5, k: 10 });
  assert.equal(localStorage.getItem(K.dailyReset), "1");
});

test("resetToday：标记置位后二次调用幂等", () => {
  seed(K.daily, { "2026-08-24": { s: 100, t: 1 } });
  T.resetToday();
  seed(K.daily, { "2026-08-24": { s: 777, t: 1 } }); // 模拟期间新增秒数
  T.resetToday();
  const d = JSON.parse(localStorage.getItem(K.daily));
  assert.equal(d["2026-08-24"].s, 777, "标记已置位，不应再次清零");
});

test("pruneDaily：30 天前的日期被删除，cutoff 当日与今天保留", () => {
  const d = {
    "2026-06-01": { s: 1 }, // 早于 cutoff → 删
    "2026-07-25": { s: 2 }, // cutoff 当日 → 留
    "2026-08-24": { s: 3 }, // 今天 → 留
  };
  T.pruneDaily(d);
  assert.deepEqual(Object.keys(d).sort(), ["2026-07-25", "2026-08-24"]);
});

/* ------------------------------------------------------------------ *
 * buildTimelineRows — 时光线
 * ------------------------------------------------------------------ */

test("buildTimelineRows：null 返回空数组，无里程碑只含首遇", () => {
  assert.deepEqual(T.buildTimelineRows(null), []);
  const rows = T.buildTimelineRows({ firstMet: { date: "2026-08-01", cat: "orange" } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, "第一次相遇");
  assert.equal(rows[0].icon, "🌱");
});

test("buildTimelineRows：按日期降序，里程碑默认 ⭐、可自定义", () => {
  const rows = T.buildTimelineRows({
    firstMet: { date: "2026-08-01", cat: "orange" },
    milestones: [
      { date: "2026-08-10", text: "里程碑A" },
      { date: "2026-08-05", text: "里程碑B", icon: "🌟" },
    ],
  });
  assert.deepEqual(rows.map((r) => r.date), ["2026-08-10", "2026-08-05", "2026-08-01"]);
  assert.equal(rows[0].icon, "⭐", "未指定 icon 的里程碑默认 ⭐");
  assert.equal(rows[0].title, "里程碑A");
  assert.equal(rows[1].icon, "🌟", "指定 icon 的里程碑保留");
  assert.equal(rows[2].title, "第一次相遇");
});

/* ------------------------------------------------------------------ *
 * sessionCost — 会话四桶计费（¥/M）
 * ------------------------------------------------------------------ */

test("sessionCost：四桶按单价求和（input 2 / cacheRead 0.5 / cacheWrite 2 / output 8）", () => {
  assert.equal(
    T.sessionCost({ input: 1000000, cacheRead: 1000000, cacheWrite: 1000000, output: 1000000 }),
    12.5
  );
  assert.equal(T.sessionCost({ input: 500000, output: 250000 }), 3); // 1 + 2
  assert.equal(T.sessionCost({ output: 125000 }), 1); // 0.125M * 8
});

test("sessionCost：缺桶按 0 计", () => {
  assert.equal(T.sessionCost({}), 0);
  assert.equal(T.sessionCost({ cacheRead: 1000000 }), 0.5);
  assert.equal(T.sessionCost({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }), 0);
});

/* ------------------------------------------------------------------ *
 * actionsFor — 动作目录（工厂级，直接传 cat）
 * ------------------------------------------------------------------ */

test("actionsFor：idle 恒在，click 按 hasClick", () => {
  const out = T.actionsFor({ dir: "/cats/x", acts: [], hasClick: true });
  assert.deepEqual(Object.keys(out), ["idle", "click"]);
  assert.deepEqual(out.idle, { url: "/cats/x/idle.gif", h: 203, dur: 8700, aScale: 1 });
  assert.deepEqual(out.click, { url: "/cats/x/click.gif", h: 269, dur: 8700, aScale: 1 });
});

test("actionsFor：只生成 acts 里的动作，未知动作跳过", () => {
  const out = T.actionsFor({ dir: "/cats/x", acts: ["happy", "walk", "bogus"] });
  assert.deepEqual(Object.keys(out).sort(), ["happy", "idle", "walk"]);
  assert.equal(out.happy.url, "/cats/x/happy.gif");
  assert.equal(out.happy.h, 259);
  assert.equal(out.happy.dur, 9300); // 无真实 cat 引用 → 按 fold 时长表 (fold:happy=8700)+600
  assert.equal(out.walk.h, 261);
});

test("actionsFor：actScale 覆盖默认缩放，未覆盖用默认", () => {
  const out = T.actionsFor({ dir: "/cats/x", acts: ["happy", "stretch"], actScale: { happy: 2.5 } });
  assert.equal(out.happy.aScale, 2.5);
  assert.equal(out.stretch.aScale, 1);
});

/* ------------------------------------------------------------------ *
 * menuItemsForCat / ambientPool — 按 currentCat.acts 过滤
 * ------------------------------------------------------------------ */

test("menuItemsForCat：按当前品种的 acts 过滤菜单（奶白）", () => {
  setCat("white"); // 奶白：happy/celebrate/think/sad/sleep
  const keys = T.menuItemsForCat().map((it) => it[0]);
  assert.deepEqual(keys, ["happy", "celebrate", "think", "sad", "sleep"]);
  assert.ok(!keys.includes("walk"), "奶白没有 walk");
  assert.ok(!keys.includes("stretch"), "奶白没有 stretch");
});

test("menuItemsForCat：完整动作品种包含全部菜单项（橘橘）", () => {
  setCat("orange"); // 橘橘：8 个动作全覆盖
  const keys = T.menuItemsForCat().map((it) => it[0]);
  assert.deepEqual(keys, ["happy", "stretch", "celebrate", "think", "walk", "scare", "sad", "sleep"]);
});

test("ambientPool：只取当前品种与固定池的交集", () => {
  setCat("white"); // 池：stretch/think/walk/happy/celebrate/sleep
  assert.deepEqual(T.ambientPool(), ["think", "happy", "celebrate", "sleep"]);
  setCat("dark"); // 乌乌：happy/scare/stretch/sleep/chase
  assert.deepEqual(T.ambientPool(), ["stretch", "happy", "sleep"]);
});

/* ------------------------------------------------------------------ *
 * defaultConfig / readConfig / writeConfig（工厂级）
 * ------------------------------------------------------------------ */

test("defaultConfig：返回完整默认值", () => {
  const c = T.defaultConfig();
  assert.equal(c.cat, "orange");
  assert.equal(c.veil, 85);
  assert.equal(c.petSize, 140);
  assert.equal(c.smartCompanion, true);
  assert.equal(c.deepCompanion, false);
  assert.ok(Array.isArray(c.alarms));
});

test("readConfig：旧配置缺字段用默认补齐", () => {
  seed(K.cfg, { cat: "white", veil: 30 });
  const c = T.readConfig();
  assert.equal(c.cat, "white");
  assert.equal(c.veil, 30);
  assert.equal(c.bg, true);
  assert.equal(c.smartCompanion, true);
  assert.equal(c.deepCompanion, false);
});

test("readConfig：损坏 JSON 回退默认", () => {
  localStorage.setItem(K.cfg, "{{{");
  assert.deepEqual(T.readConfig(), T.defaultConfig());
});

test("writeConfig 往返：部分配置写入可被 readConfig 读回并合并默认", () => {
  T.writeConfig({ cat: "white", veil: 30 });
  assert.equal(localStorage.getItem(K.cfg), JSON.stringify({ cat: "white", veil: 30 }));
  const c = T.readConfig();
  assert.equal(c.cat, "white");
  assert.equal(c.veil, 30);
  assert.equal(c.bg, true);
  assert.equal(c.smartCompanion, true);
});

test("writeConfig 往返：默认配置全量写入后读回一致", () => {
  T.writeConfig(T.defaultConfig());
  assert.deepEqual(T.readConfig(), T.defaultConfig());
});
