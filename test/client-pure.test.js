/**
 * companion-pet, browser half — 纯逻辑测试（在 Node 中加载浏览器闭包）。
 *
 * 加载方式：client.js 顶层调用 window.__ModuleLoader__.load({factory})，
 * 测试先挂一个最小 mock，让 factory 在 Node 里执行并捕获 module.exports；
 * 再调用 __runTestHarness() 触发 createPet() 的首行发布（纯函数发布到
 * exports.__test），随后 DOM 代码抛错被吞掉。生产环境零行为改变：
 * DSH 只读 module.exports.apply，其余属性只是模块对象上的附加字段。
 *
 * 全局 mock（localStorage / Date / setTimeout / fetch）都在本文件内
 * 安装并在用后恢复，只影响本测试进程。
 */
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";

/* ------------------------- 加载浏览器闭包 ------------------------- */

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

/* 动态 import：必须先装好 window mock（ESM 顶层即求值） */
await import(new URL("../lib/client.js", import.meta.url).href);

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
  balSnap: "dsh-companion-cat:bal-snap",
  inputsByDay: "dsh-companion-cat:inputs-by-day",
  memClean: "dsh-companion-cat:mem-clean-v3",
};

/* 测试小工具 */
function setClock(iso) {
  nowMs = RealDate.parse(iso);
}
function seed(key, value) {
  globalThis.localStorage.setItem(key, JSON.stringify(value));
}
function resetStorage() {
  lsStore.clear();
}
/** 重跑 harness 以重基线 tickStats 的 lastStatsSave/lastActivity。 */
function rebaseline(iso) {
  setClock(iso);
  exportsObj.__runTestHarness();
}

beforeEach(() => {
  resetStorage();
  setClock("2026-08-24T10:00:00");
});

after(() => {
  globalThis.Date = RealDate;
  delete globalThis.window;
  delete globalThis.localStorage;
});

/* ------------------------------------------------------------------ *
 * 加载自检
 * ------------------------------------------------------------------ */

test("加载：闭包可加载、apply 保留、__test 发布完整", () => {
  assert.equal(typeof exportsObj.apply, "function");
  const expectKeys = [
    "defaultConfig", "readConfig", "veilAlpha", "backingFactor", "wallpaperForNow", "isLateNight",
    "pick", "todayStr", "festivalOf", "yesterdayStr", "fmtDur", "fmtK", "fmtH",
    "estCost", "dayCost", "bucketCost", "fmtCost", "dateStrOf", "dateOffsetStr",
    "pickNotesForQuestion", "notesNear", "dateShift", "daysSince", "weekAgoStr",
    "isWorthRemembering", "readDaily", "writeDaily", "readProfile", "writeProfile",
    "readMem", "writeMem", "readInputsByDay", "writeInputsByDay", "recordBalanceCost",
    "cleanTrivialMemories", "maybeAutoExtract", "updateProfile", "weekMood", "weekActivity",
  ];
  for (const k of expectKeys) {
    assert.equal(typeof T[k], "function", `__test.${k} 必须是函数`);
  }
});

/* ------------------------------------------------------------------ *
 * defaultConfig / readConfig
 * ------------------------------------------------------------------ */

test("defaultConfig 返回完整默认配置", () => {
  const c = T.defaultConfig();
  assert.equal(c.bg, true);
  assert.equal(c.mode, "auto");
  assert.equal(c.bgSet, "mushroom");
  assert.equal(c.veil, 85);
  assert.equal(c.petSize, 140);
  assert.equal(c.cat, "orange");
  assert.equal(c.lateRemind, true);
  assert.equal(c.smartCompanion, true);
  assert.equal(c.deepCompanion, false);
  assert.ok(Array.isArray(c.alarms));
});

test("defaultConfig 每次返回新对象（互不共享引用）", () => {
  const a = T.defaultConfig();
  const b = T.defaultConfig();
  assert.notEqual(a, b);
  a.veil = 0;
  assert.equal(b.veil, 85);
});

test("readConfig 无存储/损坏存储时回退默认", () => {
  assert.deepEqual(T.readConfig(), T.defaultConfig());
  // 直接写入非法 JSON（不能用 seed()，它会 JSON.stringify 成合法字符串）
  localStorage.setItem(K.cfg, "{{{ 坏 JSON");
  assert.deepEqual(T.readConfig(), T.defaultConfig());
});

test("readConfig 与存储中的自定义字段合并", () => {
  seed(K.cfg, { veil: 50, cat: "white" });
  const c = T.readConfig();
  assert.equal(c.veil, 50);
  assert.equal(c.cat, "white");
  assert.equal(c.bg, true); // 其余保持默认
});

/* ------------------------------------------------------------------ *
 * veilAlpha / backingFactor
 * ------------------------------------------------------------------ */

test("veilAlpha：透明度 0..100 → 0.9..0", () => {
  assert.equal(T.veilAlpha(0), 0.9);
  assert.equal(T.veilAlpha(50), 0.45);
  assert.equal(T.veilAlpha(100), 0);
  assert.equal(T.veilAlpha(-10), 0.9); // 越界钳制
  assert.equal(T.veilAlpha(150), 0);
});

test("backingFactor：衬底系数 0..100 → 1..0", () => {
  assert.equal(T.backingFactor(0), 1);
  assert.equal(T.backingFactor(50), 0.5);
  assert.equal(T.backingFactor(100), 0);
});

/* ------------------------------------------------------------------ *
 * wallpaperForNow
 * ------------------------------------------------------------------ */

test("wallpaperForNow 显式 day/night 模式", () => {
  assert.equal(T.wallpaperForNow("day", "mushroom"), "/companion-pet/assets/background-day.jpg");
  assert.equal(T.wallpaperForNow("night", "mushroom"), "/companion-pet/assets/background-night.jpg");
  assert.equal(T.wallpaperForNow("day", "cathouse"), "/companion-pet/assets/background-cathouse-day.png");
  assert.equal(T.wallpaperForNow("night", "cathouse"), "/companion-pet/assets/background-cathouse-night.png");
  assert.equal(T.wallpaperForNow("day", "skyhouse"), "/companion-pet/assets/background-skyhouse-day.png");
  assert.equal(T.wallpaperForNow("night", "skyhouse"), "/companion-pet/assets/background-skyhouse-night.png");
  assert.equal(T.wallpaperForNow("day", "cabin"), "/companion-pet/assets/background-cabin-day.png");
  assert.equal(T.wallpaperForNow("night", "cabin"), "/companion-pet/assets/background-cabin-night.png");
});

test("wallpaperForNow 未知背景回退蘑菇屋", () => {
  assert.equal(T.wallpaperForNow("day", "nope"), "/companion-pet/assets/background-day.jpg");
});

test("wallpaperForNow auto 模式按时钟选图（6:00–18:59 为白天）", () => {
  setClock("2026-08-24T10:00:00");
  assert.equal(T.wallpaperForNow("auto", "mushroom"), "/companion-pet/assets/background-day.jpg");
  setClock("2026-08-24T23:30:00");
  assert.equal(T.wallpaperForNow("auto", "mushroom"), "/companion-pet/assets/background-night.jpg");
  setClock("2026-08-24T05:59:00");
  assert.equal(T.wallpaperForNow("auto", "mushroom"), "/companion-pet/assets/background-night.jpg");
  setClock("2026-08-24T06:00:00");
  assert.equal(T.wallpaperForNow("auto", "mushroom"), "/companion-pet/assets/background-day.jpg");
  setClock("2026-08-24T18:59:00");
  assert.equal(T.wallpaperForNow("auto", "mushroom"), "/companion-pet/assets/background-day.jpg");
  setClock("2026-08-24T19:00:00");
  assert.equal(T.wallpaperForNow("auto", "mushroom"), "/companion-pet/assets/background-night.jpg");
});

/* ------------------------------------------------------------------ *
 * isLateNight / 日期工具
 * ------------------------------------------------------------------ */

test("isLateNight：23:00–4:59 为深夜", () => {
  setClock("2026-08-24T10:00:00");
  assert.equal(T.isLateNight(), false);
  setClock("2026-08-24T22:59:00");
  assert.equal(T.isLateNight(), false);
  setClock("2026-08-24T23:00:00");
  assert.equal(T.isLateNight(), true);
  setClock("2026-08-24T04:59:00");
  assert.equal(T.isLateNight(), true);
  setClock("2026-08-24T05:00:00");
  assert.equal(T.isLateNight(), false);
});

test("todayStr/yesterdayStr/weekAgoStr/dateOffsetStr 相对今天（固定时钟 2026-08-24）", () => {
  assert.equal(T.todayStr(), "2026-08-24");
  assert.equal(T.yesterdayStr(), "2026-08-23");
  assert.equal(T.weekAgoStr(), "2026-08-17");
  assert.equal(T.dateOffsetStr(0), "2026-08-24");
  assert.equal(T.dateOffsetStr(7), "2026-08-17");
  assert.equal(T.dateOffsetStr(365), "2025-08-24");
  assert.equal(T.dateOffsetStr(-1), "2026-08-25");
});

test("dateStrOf：时间戳 → 本地日期串（跨月/跨年）", () => {
  const local = (y, mo, d, h) => new RealDate(y, mo - 1, d, h ?? 12, 0, 0).getTime();
  assert.equal(T.dateStrOf(local(2026, 8, 24)), "2026-08-24");
  assert.equal(T.dateStrOf(local(2026, 1, 1)), "2026-01-01");
  assert.equal(T.dateStrOf(local(2025, 12, 31, 23)), "2025-12-31");
});

test("dateShift：按天平移日期串（跨月/跨年/闰年）", () => {
  assert.equal(T.dateShift("2026-08-24", 7), "2026-08-31");
  assert.equal(T.dateShift("2026-08-31", 1), "2026-09-01");
  assert.equal(T.dateShift("2026-01-01", -1), "2025-12-31");
  assert.equal(T.dateShift("2024-02-28", 1), "2024-02-29"); // 闰年
  assert.equal(T.dateShift("2025-02-28", 1), "2025-03-01");
  assert.equal(T.dateShift("2026-08-24", -7), "2026-08-17");
});

test("daysSince：距今天的天数（钳制非负）", () => {
  assert.equal(T.daysSince("2026-08-20"), 4);
  assert.equal(T.daysSince("2026-08-24"), 0);
  assert.equal(T.daysSince("2026-08-25"), 0); // 未来 → 0
});

test("daysSince：坏输入返回 NaN（现有实现行为，catch 只捕异常不捕 NaN）", () => {
  assert.equal(Number.isNaN(T.daysSince("不是日期")), true);
});

/* ------------------------------------------------------------------ *
 * festivalOf
 * ------------------------------------------------------------------ */

test("festivalOf：阳历节日（元旦/国庆/圣诞）", () => {
  setClock("2026-01-01T10:00:00");
  assert.equal(T.festivalOf().name, "元旦");
  setClock("2026-10-01T10:00:00");
  assert.equal(T.festivalOf().name, "国庆节");
  setClock("2026-12-25T10:00:00");
  assert.equal(T.festivalOf().name, "圣诞节");
});

test("festivalOf：农历表路径（按内置 2026 表）", () => {
  // 表内：2026 春节=1/17、端午=5/19、中秋=8/15（以代码内置表为准）
  setClock("2026-01-17T10:00:00");
  assert.equal(T.festivalOf().name, "春节");
  setClock("2026-05-19T10:00:00");
  assert.equal(T.festivalOf().name, "端午节");
  setClock("2026-08-15T10:00:00");
  assert.equal(T.festivalOf().name, "中秋节");
});

test("festivalOf：非节日返回 null，且农历表不串年", () => {
  setClock("2026-08-24T10:00:00");
  assert.equal(T.festivalOf(), null);
  setClock("2027-01-17T10:00:00"); // 2026 的春节表不适用于 2027
  assert.equal(T.festivalOf(), null);
});

/* ------------------------------------------------------------------ *
 * 格式化：fmtDur / fmtK / fmtH / fmtCost / estCost / bucketCost / dayCost
 * ------------------------------------------------------------------ */

test("fmtDur：秒 → 中文时长", () => {
  assert.equal(T.fmtDur(0), "不到 1 分钟");
  assert.equal(T.fmtDur(59), "不到 1 分钟");
  assert.equal(T.fmtDur(60), "1 分钟");
  assert.equal(T.fmtDur(119), "1 分钟");
  assert.equal(T.fmtDur(120), "2 分钟");
  assert.equal(T.fmtDur(3600), "1 小时 0 分");
  assert.equal(T.fmtDur(3661), "1 小时 1 分");
  assert.equal(T.fmtDur(7200), "2 小时 0 分");
  assert.equal(T.fmtDur(-5), "不到 1 分钟");
  assert.equal(T.fmtDur(undefined), "不到 1 分钟");
});

test("fmtK：千/百万缩写", () => {
  assert.equal(T.fmtK(0), "0");
  assert.equal(T.fmtK(999), "999");
  assert.equal(T.fmtK(1000), "1.0K");
  assert.equal(T.fmtK(1234), "1.2K");
  assert.equal(T.fmtK(99999), "100.0K");
  assert.equal(T.fmtK(1000000), "1.00M");
  assert.equal(T.fmtK(1234567), "1.23M");
  assert.equal(T.fmtK(2500000), "2.50M");
});

test("fmtH：秒 → 小时（0.1h 精度，不足 0.1h 记 0h）", () => {
  assert.equal(T.fmtH(0), "0h");
  assert.equal(T.fmtH(60), "0h");
  assert.equal(T.fmtH(359), "0h");
  assert.equal(T.fmtH(360), "0.1h");
  assert.equal(T.fmtH(3599), "1h");
  assert.equal(T.fmtH(3600), "1h");
  assert.equal(T.fmtH(5400), "1.5h");
});

test("fmtCost：金额显示（≥100 取整，否则两位小数）", () => {
  assert.equal(T.fmtCost(0), "¥0");
  assert.equal(T.fmtCost(1.5), "¥1.5");
  assert.equal(T.fmtCost(1.55), "¥1.55");
  assert.equal(T.fmtCost(99.999), "¥100");
  assert.equal(T.fmtCost(100), "¥100");
  assert.equal(T.fmtCost(123.45), "¥123");
  assert.equal(T.fmtCost(123.6), "¥124");
});

test("estCost：token → 估算元（¥4/M）", () => {
  assert.equal(T.estCost(0), 0);
  assert.equal(T.estCost(250000), 1);
  assert.equal(T.estCost(1000000), 4);
  assert.equal(T.estCost(undefined), 0);
});

test("bucketCost：明细桶计价（input 2 / cacheRead 0.5 / cacheWrite 2 / output 8 ¥/M）", () => {
  assert.equal(T.bucketCost({}), 0);
  assert.equal(T.bucketCost({ k: 1000000 }), 4); // 无 i/o 明细 → 按总 token 估算
  assert.equal(T.bucketCost({ k: 250000 }), 1);
  assert.equal(T.bucketCost({ i: 500000 }), 1); // 0.5M * 2
  assert.equal(T.bucketCost({ o: 125000 }), 1); // 0.125M * 8
  assert.equal(T.bucketCost({ i: 0, r: 1000000 }), 0.5); // 1M * 0.5（有 i 明细走单价路径）
  assert.equal(T.bucketCost({ i: 1000000, o: 1000000, r: 1000000, w: 1000000 }), 12.5);
});

test("dayCost：优先官方余额差值，否则 token 估算", () => {
  assert.equal(T.dayCost({ bcost: 1.5 }), 1.5);
  assert.equal(T.dayCost({ bcost: 1.5, k: 99999999 }), 1.5);
  assert.equal(T.dayCost({ k: 1000000 }), 4);
  assert.equal(T.dayCost({}), 0);
});

/* ------------------------------------------------------------------ *
 * notesNear / pickNotesForQuestion
 * ------------------------------------------------------------------ */

test("notesNear：目标日期 ±7 天窗口内", () => {
  const notes = [
    { date: "2026-08-10", text: "a" },
    { date: "2026-08-17", text: "b" },
    { date: "2026-08-24", text: "c" },
    { date: "2026-08-31", text: "d" },
    { date: "2026-09-05", text: "e" },
  ];
  const got = T.notesNear(notes, "2026-08-24");
  assert.deepEqual(got.map((n) => n.text), ["b", "c", "d"]);
  assert.deepEqual(T.notesNear([], "2026-08-24"), []);
});

test("pickNotesForQuestion：'最…/印象深刻' 取全部日记", () => {
  const notes = mkNotes();
  assert.deepEqual(T.pickNotesForQuestion("你最难忘的是什么", notes), notes);
  assert.deepEqual(T.pickNotesForQuestion("印象深刻的瞬间", notes), notes);
});

test("pickNotesForQuestion：具体日期取临近条目", () => {
  const notes = mkNotes();
  assert.deepEqual(T.pickNotesForQuestion("2026-08-24发生了什么", notes).map((n) => n.date), [
    "2026-08-20", "2026-08-24", "2026-08-28",
  ]);
  // 8月24日（补年份）
  assert.deepEqual(T.pickNotesForQuestion("8月24日那天怎样", notes).map((n) => n.date), [
    "2026-08-20", "2026-08-24", "2026-08-28",
  ]);
});

test("pickNotesForQuestion：相对时间（最近/上周/前天）", () => {
  const notes = mkNotes();
  // 最近/上周 → 近 7 天（>= 2026-08-17）
  assert.deepEqual(T.pickNotesForQuestion("最近怎么样", notes).map((n) => n.date), [
    "2026-08-20", "2026-08-24", "2026-08-28", "2026-09-05",
  ]);
  // 前天 → 2026-08-22 ±7
  assert.deepEqual(T.pickNotesForQuestion("前天我们做了什么", notes).map((n) => n.date), [
    "2026-08-20", "2026-08-24", "2026-08-28",
  ]);
  // 一年前 → 2025-08-24 ±7，无条目
  assert.deepEqual(T.pickNotesForQuestion("一年前我们在干嘛", notes), []);
});

test("pickNotesForQuestion：首次/刚认识取最早，其余取最新 4 条", () => {
  const notes = mkNotes();
  assert.deepEqual(T.pickNotesForQuestion("我们第一次见面", notes).map((n) => n.date), [
    "2026-08-10", "2026-08-20", "2026-08-24", "2026-08-28",
  ]);
  assert.deepEqual(T.pickNotesForQuestion("你好呀", notes).map((n) => n.date), [
    "2026-08-20", "2026-08-24", "2026-08-28", "2026-09-05",
  ]);
  assert.deepEqual(T.pickNotesForQuestion("随便问问", []), []);
});

function mkNotes() {
  return [
    { date: "2026-08-10", text: "old" },
    { date: "2026-08-20", text: "m1" },
    { date: "2026-08-24", text: "today" },
    { date: "2026-08-28", text: "m2" },
    { date: "2026-09-05", text: "new" },
  ];
}

/* ------------------------------------------------------------------ *
 * isWorthRemembering
 * ------------------------------------------------------------------ */

test("isWorthRemembering：过短/过长/代码密集内容不记", () => {
  assert.equal(T.isWorthRemembering("你好"), false); // <10 字
  assert.equal(T.isWorthRemembering("十个字符以上的记忆内容"), true); // 边界 10 字
  assert.equal(T.isWorthRemembering("x".repeat(600)), false); // >500 字
  const code = "const a = 1; const b = 2; function f() { return a; }";
  assert.equal(T.isWorthRemembering(code), false); // 代码标记过密
});

test("isWorthRemembering：正常叙述值得记", () => {
  const prose = "今天完成了登录模块的重构，解决了历史遗留的问题，很有成就感喵";
  assert.equal(T.isWorthRemembering(prose), true);
});

/* ------------------------------------------------------------------ *
 * pick
 * ------------------------------------------------------------------ */

test("pick：返回数组内元素", () => {
  assert.equal(T.pick([42]), 42);
  for (let i = 0; i < 100; i++) {
    assert.ok(["a", "b", "c"].includes(T.pick(["a", "b", "c"])));
  }
  assert.equal(T.pick([]), undefined);
});

/* ------------------------------------------------------------------ *
 * readInputsByDay / writeInputsByDay（localStorage 往返）
 * ------------------------------------------------------------------ */

test("readInputsByDay/writeInputsByDay 往返一致", () => {
  assert.deepEqual(T.readInputsByDay(), {});
  T.writeInputsByDay({ "2026-08-20": ["第一条", "第二条"] });
  assert.deepEqual(T.readInputsByDay(), { "2026-08-20": ["第一条", "第二条"] });
  T.writeInputsByDay({});
  assert.deepEqual(T.readInputsByDay(), {});
});

test("readInputsByDay 存储损坏时回退空对象", () => {
  localStorage.setItem(K.inputsByDay, "{{{");
  assert.deepEqual(T.readInputsByDay(), {});
});

/* ------------------------------------------------------------------ *
 * recordBalanceCost — 官方余额差值记账
 * ------------------------------------------------------------------ */

test("recordBalanceCost：跨日余额下降记为昨日花费", () => {
  seed(K.balSnap, { date: "2026-08-23", total: 100 });
  T.recordBalanceCost(80);
  const daily = JSON.parse(localStorage.getItem(K.daily));
  assert.equal(daily["2026-08-23"].bcost, 20);
  // 快照已更新到今日
  assert.deepEqual(JSON.parse(localStorage.getItem(K.balSnap)), {
    date: "2026-08-24",
    total: 80,
  });
});

test("recordBalanceCost：同日再次查询只更新快照，不重复记账", () => {
  seed(K.balSnap, { date: "2026-08-24", total: 100 });
  T.recordBalanceCost(80);
  assert.equal(localStorage.getItem(K.daily), null); // 无任何记账
  assert.deepEqual(JSON.parse(localStorage.getItem(K.balSnap)), {
    date: "2026-08-24",
    total: 80,
  });
});

test("recordBalanceCost：余额回升（diff 非正）不记账", () => {
  seed(K.balSnap, { date: "2026-08-23", total: 50 });
  T.recordBalanceCost(80);
  assert.equal(localStorage.getItem(K.daily), null);
});

test("recordBalanceCost：无历史快照时静默建立快照", () => {
  T.recordBalanceCost(42);
  assert.deepEqual(JSON.parse(localStorage.getItem(K.balSnap)), {
    date: "2026-08-24",
    total: 42,
  });
  assert.equal(localStorage.getItem(K.daily), null);
});

/* ------------------------------------------------------------------ *
 * cleanTrivialMemories — 清理琐碎记忆
 * ------------------------------------------------------------------ */

test("cleanTrivialMemories：过滤 💡/问句/想法碎片", () => {
  seed(K.memory, {
    firstMet: { cat: "orange", date: "2026-08-01" },
    notes: [
      { icon: "💡", text: "建议加个按钮" },
      { title: "正常记忆", text: "完成了登录模块重构" },
      { text: "能不能加个按钮?" },
      { text: "担心上线出问题" },
      { text: "想加一个快捷键" },
      { text: "今天好开心" },
    ],
  });
  T.cleanTrivialMemories();
  const m = JSON.parse(localStorage.getItem(K.memory));
  assert.deepEqual(m.notes.map((n) => n.text), ["完成了登录模块重构", "今天好开心"]);
  assert.equal(localStorage.getItem(K.memClean), "1");
});

test("cleanTrivialMemories：无变化时不写完成标记（幂等）", () => {
  seed(K.memory, {
    firstMet: { cat: "orange", date: "2026-08-01" },
    notes: [{ text: "完成了登录模块重构" }],
  });
  T.cleanTrivialMemories();
  assert.equal(localStorage.getItem(K.memClean), null);
});

test("cleanTrivialMemories：无记忆/已完成时静默跳过", () => {
  T.cleanTrivialMemories(); // 无 memory
  assert.equal(localStorage.getItem(K.memClean), null);
  localStorage.setItem(K.memClean, "1");
  seed(K.memory, { firstMet: { cat: "x", date: "d" }, notes: [{ icon: "💡", text: "x" }] });
  T.cleanTrivialMemories(); // 已清理过 → 直接返回
  assert.deepEqual(JSON.parse(localStorage.getItem(K.memory)).notes, [{ icon: "💡", text: "x" }]);
});

/* ------------------------------------------------------------------ *
 * updateProfile — 连续陪伴天数 / 晚睡 / 活跃时段
 * ------------------------------------------------------------------ */

test("updateProfile：昨天来过则连续天数 +1，白天不算晚睡", () => {
  seed(K.profile, { lastSeen: "2026-08-23", streak: 3, lateStreak: 1 });
  T.updateProfile();
  const p = T.readProfile();
  assert.equal(p.streak, 4);
  assert.equal(p.lateStreak, 0); // 10:00 非深夜
  assert.equal(p.lastSeen, "2026-08-24");
  assert.equal(p.activeHours["10"], 1);
});

test("updateProfile：深夜打开记晚睡连续", () => {
  setClock("2026-08-24T23:30:00");
  seed(K.profile, { lastSeen: "2026-08-23", streak: 1 });
  T.updateProfile();
  const p = T.readProfile();
  assert.equal(p.lateStreak, 1);
  assert.equal(p.streak, 2);
});

test("updateProfile：中断天数后连续陪伴重置为 1", () => {
  seed(K.profile, { lastSeen: "2026-08-20", streak: 9, lateStreak: 2 });
  T.updateProfile();
  const p = T.readProfile();
  assert.equal(p.streak, 1);
  assert.equal(p.lateStreak, 0);
});

test("updateProfile：每 7 天滚动减半活跃小时数", () => {
  seed(K.profile, {
    lastSeen: "2026-08-23",
    streak: 1,
    activeHours: { "10": 10 },
    histDate: "2026-08-16",
    histDecay: 7, // 下一次 decay = 8 → 8 % 7 === 1 → 触发减半
  });
  T.updateProfile();
  const p = T.readProfile();
  assert.equal(p.histDecay, 8);
  assert.equal(p.histDate, "2026-08-24");
  assert.equal(p.activeHours["10"], 6); // (10+1) 减半向上取整
});

/* ------------------------------------------------------------------ *
 * weekMood / weekActivity — 近 7 天汇总
 * ------------------------------------------------------------------ */

test("weekMood：只统计近 7 天情绪", () => {
  seed(K.profile, {
    lastSeen: "2026-08-23",
    mood: { "2026-08-20": { a: 2, h: 1 }, "2026-08-10": { a: 5, h: 0 } },
  });
  assert.deepEqual(T.weekMood(), { a: 2, h: 1 });
});

test("weekMood：无情绪时返回零", () => {
  assert.deepEqual(T.weekMood(), { a: 0, h: 0 });
});

test("weekActivity：只统计近 7 天互动", () => {
  seed(K.profile, {
    lastSeen: "2026-08-23",
    week: { "2026-08-20": { c: 3, a: 1 }, "2026-08-10": { c: 9, a: 9 } },
  });
  assert.deepEqual(T.weekActivity(), { c: 3, a: 1 });
});

/* ------------------------------------------------------------------ *
 * maybeAutoExtract — 下次打开总结"上一次使用那天"（今天之前最近一天）
 * ------------------------------------------------------------------ */

test("maybeAutoExtract：未开启深度陪伴时直接返回", () => {
  const sched = captureSetTimeout();
  try {
    T.maybeAutoExtract();
    assert.equal(sched.calls, 0);
  } finally {
    restoreSetTimeout();
  }
});

test("maybeAutoExtract：无候选日（今天之前）不调度", () => {
  seed(K.cfg, { deepCompanion: true });
  T.writeInputsByDay({ "2026-08-24": ["x"] }); // 只有今天 → 无候选
  const sched = captureSetTimeout();
  try {
    T.maybeAutoExtract();
    assert.equal(sched.calls, 0);
  } finally {
    restoreSetTimeout();
  }
});

test("maybeAutoExtract：选择最近一次使用日并调度提炼（12000ms）", async () => {
  seed(K.cfg, { deepCompanion: true });
  T.writeInputsByDay({
    "2026-08-21": ["j1", "j2", "j3", "j4", "j5"],
    "2026-08-20": ["i1", "i2", "i3", "i4", "i5"],
  });
  const sched = captureSetTimeout();
  const fetches = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    fetches.push({ url, opts });
    return { json: async () => ({ ok: false }) };
  };
  try {
    T.maybeAutoExtract();
    assert.equal(sched.calls, 1);
    assert.equal(sched.ms, 12000);
    await sched.fn(); // 触发提炼回调
    assert.equal(fetches.length, 1);
    assert.equal(fetches[0].url, "/companion-pet/api/extract-memory");
    const body = JSON.parse(fetches[0].opts.body);
    assert.deepEqual(body.inputs, ["j1", "j2", "j3", "j4", "j5"]); // 最近的 2026-08-21
    assert.match(body.timeSpan, /2026-08-21/);
  } finally {
    restoreSetTimeout();
    globalThis.fetch = realFetch;
  }
});

test("maybeAutoExtract：提炼空结果时删除该天输入桶，下次轮到更早一天", async () => {
  seed(K.cfg, { deepCompanion: true });
  T.writeInputsByDay({
    "2026-08-21": ["j1", "j2", "j3", "j4", "j5"],
    "2026-08-20": ["i1", "i2", "i3", "i4", "i5"],
  });
  const sched = captureSetTimeout();
  const fetches = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetches.push(1);
    return { json: async () => ({ ok: false, error: "empty" }) }; // 空结果
  };
  try {
    T.maybeAutoExtract();
    await sched.fn();
    for (let i = 0; i < 6; i++) await Promise.resolve(); // 等 fetch 的 .then 链跑完
    assert.equal(fetches.length, 1);
    const map = JSON.parse(localStorage.getItem(K.inputsByDay));
    assert.equal(map["2026-08-21"], undefined); // 最近一天已删除
    assert.ok(map["2026-08-20"]); // 更早的一天保留，下次打开轮到它
  } finally {
    restoreSetTimeout();
    globalThis.fetch = realFetch;
  }
});

test("maybeAutoExtract：提炼失败（非 empty）时保留该天输入桶，下次重试", async () => {
  seed(K.cfg, { deepCompanion: true });
  T.writeInputsByDay({ "2026-08-21": ["j1", "j2", "j3", "j4", "j5"] });
  const sched = captureSetTimeout();
  const fetches = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetches.push(1);
    return { json: async () => ({ ok: false, error: "extract-failed" }) }; // 失败
  };
  try {
    T.maybeAutoExtract();
    await sched.fn();
    for (let i = 0; i < 6; i++) await Promise.resolve();
    assert.equal(fetches.length, 1);
    const map = JSON.parse(localStorage.getItem(K.inputsByDay));
    assert.ok(map["2026-08-21"]); // 保留，下次打开再试，不丢数据
  } finally {
    restoreSetTimeout();
    globalThis.fetch = realFetch;
  }
});

/* 捕获 setTimeout 的辅助 */
let realSetTimeout = null;
function captureSetTimeout() {
  const sched = { calls: 0, ms: null, fn: null };
  realSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn, ms) => {
    sched.calls++;
    sched.ms = ms;
    sched.fn = fn;
    return 0;
  };
  return sched;
}
function restoreSetTimeout() {
  if (realSetTimeout) {
    globalThis.setTimeout = realSetTimeout;
    realSetTimeout = null;
  }
}

/* ------------------------------------------------------------------ *
 * tickStats — 活跃时长累计（含跨午夜拆分）
 * ------------------------------------------------------------------ */

test("tickStats：同一天累计活跃秒数", () => {
  rebaseline("2026-08-24T10:00:00");
  setClock("2026-08-24T10:00:05");
  T.tickStats();
  let d = JSON.parse(localStorage.getItem(K.daily));
  assert.equal(d["2026-08-24"].s, 5);
  setClock("2026-08-24T10:01:05");
  T.tickStats();
  d = JSON.parse(localStorage.getItem(K.daily));
  assert.equal(d["2026-08-24"].s, 65);
});

test("tickStats：跨午夜拆分——午前归昨日、午后归今日", () => {
  rebaseline("2026-08-23T23:59:00");
  setClock("2026-08-24T00:00:30");
  T.tickStats();
  const d = JSON.parse(localStorage.getItem(K.daily));
  assert.equal(d["2026-08-23"].s, 60); // 23:59:00 → 00:00:00
  assert.equal(d["2026-08-24"].s, 30); // 00:00:00 → 00:00:30
});

test("tickStats：闲置超过 2 分钟不累计", () => {
  rebaseline("2026-08-24T10:00:00");
  setClock("2026-08-24T10:02:30"); // 150s > 120s
  T.tickStats();
  assert.equal(localStorage.getItem(K.daily), null);
});

test("tickStats：delta 为 0 时不写入", () => {
  rebaseline("2026-08-24T10:00:00");
  T.tickStats(); // 时钟未前进
  assert.equal(localStorage.getItem(K.daily), null);
});
