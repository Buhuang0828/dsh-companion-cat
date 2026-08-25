/**
 * companion-pet, browser half.
 *
 * The pet itself: a transparent-GIF kitten rendered in a fixed overlay on the
 * DSH web page. Every behavior is a local browser rule — no LLM calls, zero
 * token consumption:
 *
 *   - idle: loop the transparent breathing GIF
 *   - click: react with a bubble
 *   - late night (23:00–5:00): remind once per calendar day to rest
 *   - input mood: regex-sniff the active composer for frustration words
 *     and comfort; happy words get a happy bubble
 *
 * The node half serves the GIF at /companion-pet/assets/idle.gif.
 */
window.__ModuleLoader__.load({
  id: "dsh-companion-cat",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    /** Asset route registered by the node half. */
    var ASSET_BASE = "/companion-pet/assets";
    /** Wallpaper sets: each background ships a day + night image, swapped by
        the mode/clock. The carousel shows the DAY image as its preview. */
    var BACKGROUNDS = {
      mushroom: {
        name: "蘑菇屋",
        day: ASSET_BASE + "/background-day.jpg",
        night: ASSET_BASE + "/background-night.jpg",
      },
      cathouse: {
        name: "猫猫屋",
        day: ASSET_BASE + "/background-cathouse-day.png",
        night: ASSET_BASE + "/background-cathouse-night.png",
      },
      skyhouse: {
        name: "天空屋",
        day: ASSET_BASE + "/background-skyhouse-day.png",
        night: ASSET_BASE + "/background-skyhouse-night.png",
      },
      cabin: {
        name: "小木屋",
        day: ASSET_BASE + "/background-cabin-day.png",
        night: ASSET_BASE + "/background-cabin-night.png",
      },
    };

    /**
     * Cat roster: each breed lives in its own folder under assets/cats/.
     * A cat's actions map to files in that folder; missing files fall back
     * to idle. Colors drive the bubble styling per cat.
     */
    var CATS = {
      /* display order (left → right in the carousel): fold, mianmian, gray,
         orange, white, dark, tiaotiao, black — orange & white sit at the
         center, gray & dark beside them, mianmian & tiaotiao next, fold &
         black at the outer ends */
      fold: {
        name: "折折",
        dir: ASSET_BASE + "/cats/fold",
        bubble: "rgba(240,244,252,.96)",
        bubbleBorder: "rgba(150,175,215,.55)",
        bubbleText: "#3a4a62",
        desc: "乖巧",
        persona: "憨憨的，有点笨拙可爱",
        scale: 1.22,
        /* 折折 has happy / sad / scare / roll(打滚卖萌) / lick(舔爪) /
           sleep(趴睡) / nuzzle(蹭手) + idle (per its gif folder) */
        acts: ["happy", "sad", "scare", "roll", "lick", "sleep", "nuzzle"],
      },
      mianmian: {
        name: "绵绵",
        dir: ASSET_BASE + "/cats/mianmian",
        bubble: "rgba(244,240,252,.96)",
        bubbleBorder: "rgba(170,150,205,.55)",
        bubbleText: "#4a3f5e",
        desc: "软萌",
        persona: "软软的，爱蹭人撒娇",
        scale: 1.17,
        hasClick: true,
        /* 绵绵 has click / happy / stretch / think / walk / scare / sleep */
        acts: ["happy", "stretch", "think", "walk", "scare", "sleep"],
      },
      gray: {
        name: "灰灰",
        dir: ASSET_BASE + "/cats/gray",
        bubble: "rgba(242,240,244,.96)",
        bubbleBorder: "rgba(160,150,170,.55)",
        bubbleText: "#4a4452",
        desc: "调皮",
        persona: "调皮、慢悠悠的",
        scale: 1.04,
        /* 灰灰 has the FULL action set incl. click (its gif folder is complete) */
        acts: ["happy", "stretch", "celebrate", "think", "walk", "scare", "sad", "sleep"],
        hasClick: true,
        /* stretch draws extra tall (bbox 301 vs ~261) — shrink it to match */
        actScale: { stretch: 0.85 },
      },
      orange: {
        name: "橘橘",
        dir: ASSET_BASE + "/cats/orange",
        bubble: "rgba(252,243,230,.96)",
        bubbleBorder: "rgba(214,166,105,.55)",
        bubbleText: "#5a4632",
        desc: "元气",
        persona: "活泼元气，有点话多",
        scale: 1,
        acts: ["happy", "stretch", "celebrate", "think", "walk", "scare", "sad", "sleep"],
      },
      white: {
        name: "奶白",
        dir: ASSET_BASE + "/cats/white",
        bubble: "rgba(244,248,252,.96)",
        bubbleBorder: "rgba(150,180,210,.55)",
        bubbleText: "#3a4a5a",
        desc: "温柔",
        persona: "温柔体贴",
        scale: 0.93,
        /* 奶白 has happy / celebrate / think / sad / sleep + idle */
        acts: ["happy", "celebrate", "think", "sad", "sleep"],
      },
      dark: {
        name: "乌乌",
        dir: ASSET_BASE + "/cats/dark",
        bubble: "rgba(238,234,248,.96)",
        bubbleBorder: "rgba(140,120,180,.55)",
        bubbleText: "#3d3750",
        desc: "神秘",
        persona: "神秘安静",
        scale: 1,
        /* 乌乌 has happy / scare / stretch / sleep(趴睡) / chase(追尾巴) + idle */
        acts: ["happy", "scare", "stretch", "sleep", "chase"],
        /* scare draws small (bbox 233 vs 269) — enlarge it a touch;
           sleep/chase draw at 237 vs 269 — bump them too */
        actScale: { scare: 1.15, sleep: 1.14, chase: 1.14 },
      },
      tiaotiao: {
        name: "跳跳",
        dir: ASSET_BASE + "/cats/tiaotiao",
        bubble: "rgba(252,244,238,.96)",
        bubbleBorder: "rgba(215,160,120,.55)",
        bubbleText: "#5a4638",
        desc: "活泼",
        persona: "蹦蹦跳跳的，精力旺盛",
        scale: 1.11,
        /* 跳跳 has happy / stretch + special nuzzle (蹭手) / lick (舔爪) */
        acts: ["happy", "stretch", "nuzzle", "lick"],
        /* lick/nuzzle draw slightly smaller than idle (bbox 237/233 vs 241) */
        actScale: { nuzzle: 1.03, lick: 1.02 },
      },
      black: {
        name: "墨墨",
        dir: ASSET_BASE + "/cats/black",
        bubble: "rgba(245,243,238,.96)",
        bubbleBorder: "rgba(165,158,146,.55)",
        bubbleText: "#4a4438",
        desc: "安静",
        persona: "安静温柔",
        scale: 1.05,
        hasClick: true,
        /* 墨墨 has happy / stretch / celebrate / think / walk / sad / sleep
           (+ click reaction) but no scare */
        acts: ["happy", "stretch", "celebrate", "think", "walk", "sad", "sleep"],
        /* happy/walk/celebrate draw small (bbox ~217 vs 257) — bump them */
        actScale: { happy: 1.17, walk: 1.17, celebrate: 1.15 },
      },
    };

    /**
     * Animation catalog for a cat. Every gif is a FULL loop (sit -> action
     * -> recover to sit). Built from the cat's acts list so a breed only
     * lists animations it actually ships; missing files fall back to idle.
     */
    function actionsFor(cat) {
      var dir = cat.dir;
      var def = { url: dir + "/idle.gif", h: 203, dur: 8100, aScale: 1 };
      var out = { idle: def };
      if (cat.hasClick)
        out.click = { url: dir + "/click.gif", h: 269, dur: 8100, aScale: 1 };
      /* [file, refH, aScale] — aScale normalizes the gif's drawn size so
         every action reads the same height (measured via first-frame bbox) */
      var specs = {
        stretch: ["stretch.gif", 267, 1],
        walk: ["walk.gif", 261, 1],
        sad: ["sad.gif", 269, 1],
        celebrate: ["celebrate.gif", 253, 1],
        happy: ["happy.gif", 259, 1],
        think: ["think.gif", 263, 1],
        scare: ["scare.gif", 269, 1],
        sleep: ["sleep.gif", 269, 1],
        chase: ["chase.gif", 269, 1],
        nuzzle: ["nuzzle.gif", 269, 1],
        lick: ["lick.gif", 269, 1],
        roll: ["roll.gif", 269, 1],
      };
      (cat.acts || []).forEach(function (k) {
        var sp = specs[k];
        if (sp) {
          var aScale = (cat.actScale && cat.actScale[k]) || sp[2];
          out[k] = { url: dir + "/" + sp[0], h: sp[1], dur: 8100, aScale: aScale };
        }
      });
      return out;
    }
    /** Resolve the selected cat object from config. */
    function selectedCat(cfg) {
      return CATS[cfg.cat] || CATS.orange;
    }

    /** Custom names per breed, stored locally (key: companion-pet:name:<catKey>). */
    function catDisplayName(key) {
      var c = CATS[key];
      if (!c) return "小猫";
      try {
        var custom = localStorage.getItem(KEYS.namePrefix + key);
        if (custom && custom.trim()) return custom.trim();
      } catch (_) {}
      return c.name;
    }
    function setCatName(key, name) {
      try {
        localStorage.setItem(KEYS.namePrefix + key, String(name).trim());
      } catch (_) {}
    }
    /** Reference cat height after normalization (documented for future tuning). */
    var REF_HEIGHT = 269;
    /** Logical display box size (px); CSS sizes the canvas from petSize. */
    var PET_BOX = 240;

    /** Bubble copy pools (short, warm, cat-flavored). */
    var CLICK_BUBBLES = ["喵~", "摸摸我嘛~", "喵呜！", "（蹭蹭）", "陪着你呢~"];
    var LATE_BUBBLES = [
      "都这么晚啦，早点休息喵~",
      "夜深了，猫猫也要打盹了，你也睡吧~",
      "这么晚了还在忙呀，注意身体喵",
    ];
    var ANGRY_BUBBLES = [
      "别生气啦，摸摸猫猫消消气~",
      "喵呜……不气不气，我跳个舞给你看！",
      "生气会变丑的喵，我陪你缓缓~",
    ];
    var HAPPY_BUBBLES = ["喵呜~你开心我也开心！", "尾巴都翘起来啦！", "和你一起高兴喵~"];
    var GREET_BUBBLES = ["喵！我来了~", "小猫就位，随时陪你~"];

    /** Frustration / happiness keyword matchers (local regex, zero tokens). */
    var ANGRY_RE = /(烦|生气|气死|恼火|暴躁|愤怒|艹|靠|妈的|fuck|shit|崩溃|抓狂|火大|无语|讨厌|恶心|郁闷|mmp|tmd|md|尼玛|受不了|想骂人|干什么|你干嘛|搞什么|什么鬼|神经|有病|疯了|离谱|滚|垃圾|废物|混蛋|可恶|气人|烦死|烂|差劲|不行了|要死了|咋回事|什么玩意|你行不行|滚蛋|白痴|傻瓜|脑子有|整得|搞成这样|改成什么)/i;
    var HAPPY_RE = /(开心|高兴|哈哈|太好了|太棒|谢谢|爱你|nice|awesome|完美|搞定|成功|耶|哇|好耶|真棒)/i;

    /** All localStorage keys, centralized. Values must stay stable — they
        are the persisted data keys (changing one loses user data). */
    var KEYS = {
      pos: "companion-pet:pos",
      namePrefix: "companion-pet:name:", /* dynamic: companion-pet:name:<catKey> */
      reminderDay: "companion-pet:reminder-day",
      cfg: "companion-pet:config:v3",
      catNameMigrated: "companion-pet:config:v3:catname-migrated", /* one-time cat7/cat8 → mianmian/tiaotiao flag */
      balwarn: "dsh-companion-cat:balwarn",
      balwarnAt: "dsh-companion-cat:balwarn-at",
      balSnap: "dsh-companion-cat:bal-snap",
      ring: "dsh-companion-cat:ring",
      daily: "dsh-companion-cat:daily",
      stats: "dsh-companion-cat:stats", /* legacy, migrated */
      statsLast: "dsh-companion-cat:stats-last", /* legacy */
      statsReported: "dsh-companion-cat:stats-reported",
      dailyToken: "dsh-companion-cat:daily-token-v1",
      dailyReset: "dsh-companion-cat:daily-reset-v2",
      statsSnapshot: "dsh-companion-cat:stats-snapshot",
      statsSeeded: "dsh-companion-cat:stats-seeded",
      profile: "dsh-companion-cat:profile",
      memory: "dsh-companion-cat:memory",
      extracted: "dsh-companion-cat:extracted",
      lastSessionStart: "dsh-companion-cat:last-session-start",
      inputsByDay: "dsh-companion-cat:inputs-by-day",
      memClean: "dsh-companion-cat:mem-clean-v3",
    };

    /** Per-plugin CSS injected once. */
    var CSS =
      "#companion-pet-root{position:fixed;right:24px;bottom:24px;z-index:2147483002;pointer-events:none;-webkit-user-select:none;user-select:none}" +
      "#companion-pet-root .pet-canvas{position:relative;width:140px;height:140px;pointer-events:auto;cursor:grab;overflow:hidden}" +
      "#companion-pet-root .pet-canvas.dragging{cursor:grabbing}" +
      /* cat name label under the kitten (display-only); flips above when
         the kitten sits too low on screen */
      "#companion-pet-root .pet-name{position:absolute;left:50%;top:100%;transform:translateX(-50%);margin-top:1px;max-width:150px;padding:2px 12px;border-radius:999px;background:rgba(10,20,14,.5);border:1px solid rgba(140,205,115,.28);color:#eaf6dc;font-size:12px;font-weight:600;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);z-index:3;transition:top .15s,bottom .15s}" +
      "#companion-pet-root .pet-name.above{top:auto;bottom:100%;margin-top:0;margin-bottom:1px}" +
      "#companion-pet-root .pet-img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;image-rendering:auto;pointer-events:none}" +
      "#companion-pet-root .pet-bubble{position:absolute;left:50%;bottom:100%;transform:translateX(-50%);margin-bottom:10px;max-width:260px;min-width:120px;padding:9px 14px;border-radius:16px;background:rgba(252,243,230,.96);color:#5a4632;font-size:13px;line-height:1.55;box-shadow:0 4px 18px rgba(0,0,0,.2);border:1px solid rgba(214,166,105,.5);white-space:normal;word-break:break-word;text-align:center;transition:opacity .3s ease,transform .3s ease;opacity:0;pointer-events:none}" +
      "#companion-pet-root .pet-bubble::after{content:'';position:absolute;left:50%;top:100%;transform:translateX(-50%);border:7px solid transparent;border-top-color:rgba(252,243,230,.96)}" +
      "#companion-pet-root .pet-bubble::before{content:'';position:absolute;left:50%;top:100%;transform:translateX(-50%);border:8px solid transparent;border-top-color:rgba(214,166,105,.5)}" +
      "#companion-pet-root .pet-bubble.show{opacity:1;transform:translateX(-50%) translateY(-4px)}" +
      /* daily report / greeting bubble: fresh mint gradient, calmer than warn */
      "#companion-pet-root .pet-bubble.greet{background:linear-gradient(180deg,#cdeed0,#9fd3a8);color:#2d4a2e;border-color:rgba(120,190,130,.6);box-shadow:0 0 0 2px rgba(255,255,255,.7),0 6px 20px rgba(60,140,80,.3);font-size:13.5px}" +
      "#companion-pet-root .pet-bubble.greet::after{border-top-color:#9fd3a8}" +
      "#companion-pet-root .pet-bubble.greet::before{border-top-color:rgba(120,190,130,.6)}" +
      /* festival bubble: warm festive red-gold, soft glow */
      "#companion-pet-root .pet-bubble.festival{background:linear-gradient(180deg,#ffd9a0,#f2a65a);color:#6b3410;border-color:rgba(220,150,60,.7);box-shadow:0 0 0 2px rgba(255,255,255,.8),0 0 22px rgba(240,160,60,.5),0 6px 20px rgba(180,110,30,.35);font-size:14.5px;font-weight:700}" +
      "#companion-pet-root .pet-bubble.festival::after{border-top-color:#f2a65a}" +
      "#companion-pet-root .pet-bubble.festival::before{border-top-color:rgba(220,150,60,.7)}" +
      "@keyframes petFestivalPop{0%,100%{transform:translateX(-50%) translateY(-4px) scale(1)}40%{transform:translateX(-50%) translateY(-7px) scale(1.06)}}" +
      "#companion-pet-root .pet-bubble.festival.show{animation:petFestivalPop 2s ease-in-out infinite}" +
      /* balance warning bubble: loud gradient, pulsing, lingers, tappable */
      "#companion-pet-root .pet-bubble.warn{background:linear-gradient(180deg,#ff8f6b,#e8603c);color:#fff;font-size:15px;font-weight:800;border-color:rgba(255,255,255,.6);box-shadow:0 0 0 3px rgba(255,255,255,.8),0 6px 26px rgba(200,70,30,.55);pointer-events:auto;cursor:pointer;animation:petWarnPulse 1.5s ease-in-out infinite}" +
      "#companion-pet-root .pet-bubble.warn::after{border-top-color:#e8603c}" +
      "#companion-pet-root .pet-bubble.warn::before{border-top-color:rgba(255,255,255,.6)}" +
      /* top-up link inside the balance bubble: gold pill, opens the official
         DeepSeek top-up page in a new tab; clickable even when the bubble
         itself is pointer-events:none */
      "#companion-pet-root .pet-bubble-topup{display:inline-block;margin-top:8px;padding:4px 16px;border-radius:999px;background:linear-gradient(180deg,#f7c948,#e0a52f);color:#5a3d00;font-size:12px;font-weight:800;line-height:1.4;text-decoration:none;box-shadow:0 2px 10px rgba(200,150,50,.45);pointer-events:auto;cursor:pointer;transition:filter .15s}" +
      "#companion-pet-root .pet-bubble-topup:hover{filter:brightness(1.08)}" +
      "#companion-pet-root .pet-bubble.warn .pet-bubble-topup{background:#fff;color:#e8603c;box-shadow:0 2px 10px rgba(255,255,255,.35)}" +
      "@keyframes petWarnPulse{0%,100%{transform:translateX(-50%) translateY(-4px) scale(1)}50%{transform:translateX(-50%) translateY(-6px) scale(1.06)}}" +
      /* action picker menu — same frosted backing as the toolbar/settings */
      "#companion-pet-root .pet-menu{position:absolute;left:50%;bottom:calc(100% + 10px);transform:translateX(-50%) scale(.92);transform-origin:bottom center;width:176px;padding:8px;border-radius:16px 12px 18px 10px / 12px 16px 10px 18px;background:var(--dsw-specific-input-major, rgba(16,21,36,.6));border:1px solid var(--dsw-alias-border-l2-darkmode-thin, rgba(255,255,255,.1));box-shadow:0 12px 36px rgba(0,0,0,.45);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);pointer-events:auto;opacity:0;visibility:hidden;transition:opacity .18s ease,transform .18s ease,visibility .18s;z-index:5}" +
      "#companion-pet-root .pet-menu.open{opacity:1;visibility:visible;transform:translateX(-50%) scale(1)}" +
      "#companion-pet-root .pet-menu-title{font-size:11px;font-weight:700;letter-spacing:.05em;color:var(--dsw-alias-state-business-primary, #6fa8ff);margin:2px 4px 6px;text-transform:uppercase;text-shadow:0 1px 2px rgba(0,0,0,.3)}" +
      "#companion-pet-root .pet-menu-item{display:flex;align-items:center;gap:8px;width:100%;border:none;background:transparent;color:var(--dsw-alias-label-primary, #e6f0da);font-size:12.5px;line-height:1.4;text-align:left;padding:7px 8px;border-radius:10px;cursor:pointer;transition:background .12s}" +
      "#companion-pet-root .pet-menu-item:hover{background:rgba(125,201,104,.18)}" +
      "#companion-pet-root .pet-menu-item .mi-ico{font-size:15px;flex:none;width:20px;text-align:center}" +
      /* skill badge (top-left, only while idle): plain star, no pill */
      "#companion-pet-root .pet-skill-btn{position:absolute;left:2px;top:2px;width:32px;height:32px;border:none;background:rgba(30,38,28,.62);color:rgba(255,225,140,.98);font-size:20px;line-height:1;display:flex;align-items:center;justify-content:center;cursor:pointer;pointer-events:auto;text-shadow:0 1px 4px rgba(0,0,0,.7);box-shadow:0 0 0 2px rgba(255,255,255,.4),0 2px 8px rgba(0,0,0,.35);border-radius:50%;transition:transform .15s,opacity .25s,background .15s;opacity:0;z-index:6}" +
      "#companion-pet-root .pet-skill-btn:hover{transform:scale(1.15) rotate(15deg);background:rgba(44,54,38,.8)}" +
      "#companion-pet-root .pet-skill-btn.show{opacity:1}" +
      /* settings popover — warm cream backing like the kitten's speech
         bubble (JS sets the exact cat-tinted background on open) */
      "#companion-pet-root .pet-panel{width:264px;padding:18px 16px 14px;border-radius:16px 12px 18px 10px / 12px 16px 10px 18px;background:rgba(252,243,230,.97);color:#5a4632;font-size:13px;line-height:1.7;box-shadow:0 12px 40px rgba(0,0,0,.5);pointer-events:auto;backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid rgba(214,166,105,.5);max-height:80vh;overflow-y:auto;z-index:2147483003}" +
      "#companion-pet-root .pet-panel-title{font-weight:700;font-size:14px;margin:0 0 10px;color:#5a4632;display:flex;align-items:center;justify-content:space-between;gap:6px}" +
      "#companion-pet-root .pet-panel-close{width:22px;height:22px;border:none;background:rgba(120,90,50,.16);color:#6a5538;border-radius:50%;cursor:pointer;font-size:12px;line-height:1;display:flex;align-items:center;justify-content:center;flex:none;transition:background .15s}" +
      "#companion-pet-root .pet-panel-close:hover{background:rgba(200,80,60,.28);color:#fff}" +
      "#companion-pet-root .pet-panel-group{font-size:11px;font-weight:700;letter-spacing:.05em;color:#a08040;margin:12px 0 3px;text-transform:uppercase;display:flex;align-items:center;justify-content:space-between}" +
      "#companion-pet-root .pet-panel-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:6px 0;color:#5a4632}" +
      "#companion-pet-root .pet-panel-row select{background:rgba(255,255,255,.6);color:#5a4632;border:1px solid rgba(120,100,60,.35);border-radius:8px;padding:3px 6px;font-size:12px;outline:none}" +
      "#companion-pet-root .pet-panel-row input[type=checkbox]{accent-color:#c2b280;width:15px;height:15px}" +
      "#companion-pet-root .pet-panel-range{display:flex;align-items:center;gap:8px}" +
      "#companion-pet-root .pet-panel-range input[type=range]{width:110px;accent-color:#c2b280;height:4px;cursor:pointer}" +
      "#companion-pet-root .pet-panel-range b{min-width:36px;text-align:right;font-weight:500;color:#5a4632;font-size:12px}" +
      "#companion-pet-root .pet-panel-note{color:#8a7448;font-size:11px;margin-top:12px;padding-top:9px;border-top:1px solid rgba(120,100,60,.18)}" +
      /* alarm manager inside the settings panel */
      "#companion-pet-root .pet-alarm-list{display:flex;flex-direction:column;gap:4px;margin:2px 0}" +
      "#companion-pet-root .pet-alarm-item{display:flex;align-items:center;gap:8px;padding:5px 8px;border-radius:10px;background:rgba(255,255,255,.55);border:1px solid rgba(120,100,60,.25);font-size:12px}" +
      "#companion-pet-root .pet-alarm-item .pa-t{font-weight:700;color:#5a4632;min-width:44px}" +
      "#companion-pet-root .pet-alarm-item .pa-n{flex:1;color:#6a5538;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
      "#companion-pet-root .pet-alarm-item input[type=checkbox]{accent-color:#c2b280;width:14px;height:14px}" +
      "#companion-pet-root .pet-alarm-item .pa-del{border:none;background:transparent;color:rgba(200,80,60,.85);cursor:pointer;font-size:11px;line-height:1;padding:2px 4px}" +
      "#companion-pet-root .pet-alarm-add{display:flex;align-items:center;gap:6px;margin-top:6px}" +
      "#companion-pet-root .pet-alarm-add input[type=time]{background:rgba(255,255,255,.65);color:#5a4632;border:1px solid rgba(120,100,60,.35);border-radius:8px;padding:3px 6px;font-size:12px;outline:none;color-scheme:light}" +
      "body[data-ds-dark-theme] #companion-pet-root .pet-alarm-add input[type=time]{color-scheme:dark}" +
      "#companion-pet-root .pet-alarm-add input[type=text]{flex:1;background:rgba(255,255,255,.65);color:#5a4632;border:1px solid rgba(120,100,60,.35);border-radius:8px;padding:3px 6px;font-size:12px;outline:none;min-width:0}" +
      "#companion-pet-root .pet-alarm-add button{border:none;background:#c2b280;color:#fff;border-radius:8px;padding:3px 12px;font-size:12px;cursor:pointer}" +
      /* daily stats line inside the settings panel */
      "#companion-pet-root .pet-panel-stats{display:flex;align-items:center;gap:6px;font-size:12px;color:#6a5538;padding:6px 0;flex-wrap:nowrap}" +
      "#companion-pet-root .pet-panel-stats b{color:#a08040;font-weight:700}" +
      "#companion-pet-root .pet-panel-stats .ps-last{color:#8a7448;font-size:11px;margin-left:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
      "#companion-pet-root .pet-panel-group .ps-days-btn{margin-left:auto;border:1px solid rgba(255,255,255,.5);background:linear-gradient(180deg,#f2c462,#d9a33a);color:#fff;border-radius:999px;padding:3px 13px;font-size:11px;font-weight:700;letter-spacing:.05em;cursor:pointer;box-shadow:0 2px 7px rgba(180,130,50,.35),inset 0 1px 0 rgba(255,255,255,.55);transition:transform .15s,box-shadow .15s,filter .15s}" +
      "#companion-pet-root .pet-panel-group .ps-days-btn:hover{transform:translateY(-1px);filter:brightness(1.07);box-shadow:0 4px 12px rgba(180,130,50,.45),inset 0 1px 0 rgba(255,255,255,.6)}" +
      "#companion-pet-root .pet-panel-group .ps-days-btn:active{transform:translateY(0);filter:brightness(.96)}" +
      "#companion-pet-root .pet-panel-group .ps-days-btn:disabled{background:linear-gradient(180deg,#c8c4ba,#a8a49a);color:#f0efe9;cursor:not-allowed;box-shadow:none;border-color:rgba(160,156,148,.5)}" +
      "#companion-pet-root .pet-panel-group .ps-days-btn:disabled:hover{transform:none;filter:none;box-shadow:none}" +
      /* 7-day stats panel — wide & short (landscape), two charts per row */
      ".pet-stats-panel{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:2147483998;width:min(94vw,800px);padding:14px 18px 12px;border-radius:22px;background:rgba(252,243,230,.98);color:#5a4632;font-size:13px;line-height:1.5;box-shadow:0 20px 60px rgba(0,0,0,.4);pointer-events:auto;border:1px solid rgba(214,166,105,.5);animation:petCurtainIn .28s cubic-bezier(.2,.9,.3,1.1)}" +
      ".pet-stats-panel .sp-title{display:flex;align-items:center;gap:10px;font-weight:800;font-size:15px;letter-spacing:.05em;margin-bottom:10px}" +
      ".pet-stats-panel .sp-close{width:24px;height:24px;border:none;background:rgba(120,90,50,.16);color:#6a5538;border-radius:50%;cursor:pointer;font-size:12px;line-height:1;display:flex;align-items:center;justify-content:center;transition:background .15s;flex:none}" +
      ".pet-stats-panel .sp-close:hover{background:rgba(200,80,60,.28);color:#fff}" +
      /* inline mini KPIs in the title row */
      ".pet-stats-panel .sp-kpis{display:flex;align-items:center;gap:10px;margin-left:auto;font-size:11px;color:#8a7448;white-space:nowrap}" +
      ".pet-stats-panel .sp-kpis i{display:flex;align-items:baseline;gap:4px}" +
      ".pet-stats-panel .sp-kpis b{color:#a08040;font-size:14px}" +
      /* chart grid: two per row */
      ".pet-stats-panel .sp-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}" +
      ".pet-stats-panel .sp-card{background:rgba(255,255,255,.45);border:1px solid rgba(194,178,128,.3);border-radius:14px;padding:8px 12px 6px}" +
      ".pet-stats-panel .sp-chart-title{font-size:11px;font-weight:700;color:#a08040;letter-spacing:.05em;margin-bottom:4px}" +
      ".pet-stats-panel table{width:100%;border-collapse:collapse}" +
      ".pet-stats-panel th{font-size:11px;color:#a08040;text-transform:uppercase;letter-spacing:.05em;padding:5px 8px;text-align:right;border-bottom:1px solid rgba(120,100,60,.25)}" +
      ".pet-stats-panel th:first-child,.pet-stats-panel td:first-child{text-align:left}" +
      ".pet-stats-panel td{padding:6px 8px;text-align:right;border-bottom:1px solid rgba(120,100,60,.12)}" +
      ".pet-stats-panel tr.sp-total td{font-weight:800;color:#a08040;border-bottom:none;padding-top:9px}" +
      ".pet-stats-panel .sp-note{color:#8a7448;font-size:11px;margin-top:8px;padding-top:8px;border-top:1px dashed rgba(120,100,60,.25)}" +
      /* hand-drawn charts (CSS/SVG only, zero dependencies) */
      ".pet-stats-panel .sp-bars{display:flex;align-items:stretch;gap:4px;height:104px;padding:0 2px;border-bottom:1px solid rgba(120,100,60,.2)}" +
      ".pet-stats-panel .sp-bar-col{flex:1;display:flex;flex-direction:column;align-items:center;min-width:0}" +
      ".pet-stats-panel .sp-bar-val{font-size:11px;font-weight:700;color:#8a7448;white-space:nowrap;line-height:1.2;height:15px}" +
      ".pet-stats-panel .sp-bar-track{flex:1;width:100%;display:flex;align-items:flex-end;justify-content:center}" +
      ".pet-stats-panel .sp-bar{width:100%;max-width:24px;border-radius:4px 4px 2px 2px;background:linear-gradient(180deg,#e8b45a,#c98a3a);box-shadow:0 1px 4px rgba(120,90,50,.3)}" +
      ".pet-stats-panel .sp-bar-label{font-size:11px;color:#a08a60;white-space:nowrap;height:15px;line-height:15px}" +
      ".pet-stats-panel .sp-line-wrap{position:relative;width:100%;height:92px}" +
      ".pet-stats-panel .sp-line{width:100%;height:92px;display:block}" +
      ".pet-stats-panel .sp-line-val{position:absolute;transform:translateX(-50%);font-size:10.5px;font-weight:600;color:#8a7448;white-space:nowrap;pointer-events:none;background:rgba(252,243,230,.92);padding:0 4px;border-radius:4px}" +
      ".pet-stats-panel .sp-pie-row{display:flex;align-items:center;gap:16px;padding:4px 0}" +
      ".pet-stats-panel .sp-pie{width:96px;height:96px;border-radius:50%;flex:none;box-shadow:0 2px 10px rgba(120,90,50,.3)}" +
      ".pet-stats-panel .sp-pie-legend{display:flex;flex-direction:column;gap:4px;font-size:11px;color:#6a5538}" +
      ".pet-stats-panel .sp-legend-item{display:flex;align-items:center;gap:6px;white-space:nowrap}" +
      ".pet-stats-panel .sp-legend-item i{width:10px;height:10px;border-radius:3px;flex:none;display:inline-block}" +
      ".pet-stats-panel .sp-empty{color:#a08a60;font-size:12px;padding:14px 0;text-align:center}" +
      /* per-session spend ranking */
      ".pet-stats-panel .sp-sessions{grid-column:1 / -1}" +
      ".pet-stats-panel .sp-session-list{display:flex;flex-direction:column;gap:3px}" +
      ".pet-stats-panel .sp-session-item{display:flex;align-items:center;gap:10px;font-size:11.5px;color:#6a5538;padding:3px 2px;border-bottom:1px dashed rgba(120,100,60,.15)}" +
      ".pet-stats-panel .sp-session-item:last-of-type{border-bottom:none}" +
      ".pet-stats-panel .ss-name{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600}" +
      ".pet-stats-panel .ss-tok{color:#8a7448;min-width:52px;text-align:right}" +
      ".pet-stats-panel .ss-cost{color:#a08040;font-weight:700;min-width:52px;text-align:right}" +
      ".pet-stats-panel .sp-session-more{font-size:11px;color:#a08a60;padding:3px 2px 0}" +
      /* storybook + memory buttons right below the toolbar, same style */
      "#companion-pet-mem-bar{display:flex;gap:6px}" +
      "#companion-pet-mem-bar .pt-cap{border:1px solid rgba(194,178,128,.4);background:rgba(250,240,215,.5);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);color:#8a7448;font-size:15px;line-height:1;width:30px;height:30px;display:flex;align-items:center;justify-content:center;cursor:pointer;border-radius:50%;box-shadow:0 4px 12px rgba(0,0,0,.22);transition:background .15s,transform .15s}" +
      "#companion-pet-mem-bar .pt-cap:hover{background:rgba(240,226,190,.65);transform:translateY(-1px)}" +
      /* "our time" storybook panel */
      ".pet-memory-panel{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:2147483998;width:min(92vw,420px);max-height:78vh;overflow-y:auto;padding:16px 20px;border-radius:24px;background:rgba(252,243,230,.98);color:#5a4632;font-size:13px;line-height:1.6;box-shadow:0 20px 60px rgba(0,0,0,.4);pointer-events:auto;border:1px solid rgba(214,166,105,.5);animation:petCurtainIn .28s cubic-bezier(.2,.9,.3,1.1)}" +
      ".pet-memory-panel .mp-title-bar{display:flex;align-items:center;justify-content:space-between;font-weight:800;font-size:16px;letter-spacing:.06em;margin-bottom:12px}" +
      ".pet-memory-panel .mp-title-right{display:flex;align-items:center;gap:6px}" +
      ".pet-memory-panel .mp-notes-btn{border:1px solid rgba(255,255,255,.5);background:linear-gradient(180deg,#f2c462,#d9a33a);color:#fff;border-radius:999px;padding:4px 13px;font-size:12px;font-weight:700;letter-spacing:.03em;cursor:pointer;box-shadow:0 2px 6px rgba(180,130,50,.35),inset 0 1px 0 rgba(255,255,255,.5);transition:filter .15s,transform .15s}" +
      ".pet-memory-panel .mp-notes-btn:hover{filter:brightness(1.07);transform:translateY(-1px)}" +
      ".pet-memory-panel .mp-close{width:24px;height:24px;border:none;background:rgba(120,90,50,.16);color:#6a5538;border-radius:50%;cursor:pointer;font-size:12px;line-height:1;display:flex;align-items:center;justify-content:center;transition:background .15s}" +
      ".pet-memory-panel .mp-close:hover{background:rgba(200,80,60,.28);color:#fff}" +
      ".pet-memory-panel .mp-list{display:flex;flex-direction:column;gap:10px}" +
      ".pet-memory-panel .mp-tabs{display:flex;gap:6px;margin-bottom:10px}" +
      ".pet-memory-panel .mp-tab{border:1px solid rgba(194,178,128,.45);background:rgba(255,253,246,.6);color:#8a7448;border-radius:999px;padding:4px 14px;font-size:12px;font-weight:700;cursor:pointer;transition:background .15s,color .15s}" +
      ".pet-memory-panel .mp-tab.on{background:#c2b280;color:#fff;border-color:#c2b280}" +
      ".pet-memory-panel .mp-item{display:flex;gap:12px;align-items:flex-start;background:rgba(255,255,255,.5);border:1px solid rgba(194,178,128,.35);border-radius:14px;padding:10px 12px}" +
      ".pet-memory-panel .mp-icon{font-size:20px;flex:none;line-height:1.3}" +
      ".pet-memory-panel .mp-date{font-size:11px;color:#a08a60;letter-spacing:.04em}" +
      ".pet-memory-panel .mp-title{font-size:13px;font-weight:700;color:#5a4632}" +
      ".pet-memory-panel .mp-text{font-size:12px;color:#8a7448;margin-top:2px}" +
      ".pet-memory-panel .mp-footer{color:#a08a60;font-size:12px;text-align:center;margin-top:14px;padding-top:10px;border-top:1px dashed rgba(120,100,60,.25)}" +
      ".pet-memory-panel .mp-empty{color:#a08a60;font-size:12px;text-align:center;padding:18px 0}" +
      /* kraft-paper journal — the panel IS the paper: a transparent PNG of
         the owner-drawn sheet (paper-kraft.png) fills the whole panel, so
         the torn paper edge forms the dialog's outline (no box, no border,
         no frame). Notes scroll INSIDE the sheet; paper stays put. */
      ".pet-memory-panel.journal{background:url('" +
        ASSET_BASE +
        "/paper-kraft.png') center center / 100% 100% no-repeat!important;" +
        "width:min(94vw,640px)!important;" +
        "left:50%!important;top:1vh!important;bottom:0!important;transform:translateX(-50%)!important;height:auto!important;max-height:none!important;" +
        "border:none!important;box-shadow:none!important;" +
        "filter:drop-shadow(0 22px 45px rgba(40,25,8,.45))!important;" +
        "border-radius:0!important;background-color:transparent!important;color:#4c381f!important;padding:0!important;display:flex!important;flex-direction:column!important;overflow:hidden!important}" +
      ".pet-memory-panel.journal .j-viewport{flex:1;min-height:0;position:relative;display:block}" +
      /* scroll layer is EXACTLY the content frame (absolute, same insets) —
         scrollbar hugs its right edge and text is clipped inside it */
      ".pet-memory-panel.journal .j-scroll{position:absolute;top:40px;left:84px;right:92px;bottom:calc(120px + 12vh);overflow-y:auto;overflow-x:hidden;padding-right:8px;scrollbar-width:thin;scrollbar-color:rgba(140,95,40,.45) transparent}" +
      ".pet-memory-panel.journal .j-scroll::after{content:'';display:block;height:40px}" +
      ".pet-memory-panel.journal .j-head{position:relative;flex:none;padding:88px 92px 24px;color:#6b4a22;font-weight:800;font-size:18px;display:flex;align-items:center;justify-content:center;background:transparent}" +
      ".pet-memory-panel.journal .j-head .mp-close{position:absolute;top:76px;right:70px}" +
      ".pet-memory-panel.journal .j-body{flex:1;min-height:0;display:flex;flex-direction:column;padding:0}" +
      ".pet-memory-panel.journal .mp-close{width:30px;height:30px;font-size:14px;background:linear-gradient(180deg,#f2c462,#d9a33a);color:#fff;border:1px solid rgba(255,255,255,.6);box-shadow:0 2px 8px rgba(180,130,50,.4),inset 0 1px 0 rgba(255,255,255,.5);transition:background .15s,transform .15s}" +
      ".pet-memory-panel.journal .mp-close:hover{background:linear-gradient(180deg,#e8603c,#c94a2a);color:#fff;transform:scale(1.08)}" +
      ".pet-memory-panel.journal .np-list{margin:0;display:flex;flex-direction:column;gap:18px;padding:0;width:100%;max-width:100%;box-sizing:border-box;overflow:hidden}" +
      ".pet-memory-panel.journal .np-day{display:flex;flex-direction:column;width:100%;box-sizing:border-box}" +
      ".pet-memory-panel.journal .np-day-title{font-size:14px;font-weight:700;color:#7a4a20;letter-spacing:.05em;margin:0 0 6px;display:flex;align-items:baseline;gap:8px;width:100%;box-sizing:border-box}" +
      ".pet-memory-panel.journal .np-day-title::after{content:'';flex:1;height:1px;background:linear-gradient(90deg,rgba(140,95,40,.4),transparent)}" +
      ".pet-memory-panel.journal .np-row{display:flex;gap:8px;font-size:14px;line-height:1.7;padding:4px 0;color:#4c381f;width:100%;box-sizing:border-box}" +
      ".pet-memory-panel.journal .np-row .np-num{flex:none;min-width:24px;text-align:right;color:#a0703a;font-weight:700;font-size:13px}" +
      ".pet-memory-panel.journal .np-row .np-body{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
      ".pet-memory-panel.journal .np-row:nth-child(odd){background:rgba(120,90,40,.05);border-radius:8px;padding:4px 6px;margin:0 -6px}" +
      ".pet-memory-panel.journal .np-row:hover{background:rgba(150,110,50,.12);border-radius:8px}" +
      ".pet-memory-panel.journal .mp-empty{color:#8a6a3a}" +
      /* ask-the-cat: a lighter cream card sitting ON the paper */
      ".pet-memory-panel.journal .mp-ask{margin-top:18px;padding:14px 16px;border-radius:18px 10px 20px 12px / 10px 18px 12px 20px;background:rgba(255,251,240,.85);border:1px solid rgba(160,120,60,.45);display:flex;flex-direction:column;gap:7px;box-shadow:0 3px 12px rgba(100,70,25,.18)}" +
      ".pet-memory-panel.journal .mp-ask-title{font-size:13.5px;font-weight:800;color:#7a4a20;margin-bottom:2px;display:flex;align-items:center;gap:6px}" +
      ".pet-memory-panel.journal .mp-ask-title::after{content:'';flex:1;height:1px;background:repeating-linear-gradient(90deg,rgba(150,110,50,.4) 0 6px,transparent 6px 12px)}" +
      ".pet-memory-panel.journal .mp-q{border:1px solid rgba(160,120,60,.5);background:rgba(255,252,240,.85);color:#5a4526;border-radius:999px;padding:6px 13px;font-size:12px;text-align:left;cursor:pointer;transition:background .15s,transform .15s}" +
      ".pet-memory-panel.journal .mp-q:hover{background:rgba(226,196,120,.3);transform:translateX(2px)}" +
      ".pet-memory-panel.journal .mp-q:disabled{opacity:.45;cursor:not-allowed;transform:none}" +
      ".pet-memory-panel.journal .mp-q:disabled:hover{background:rgba(255,252,240,.85)}" +
      ".pet-memory-panel.journal .mp-answer{margin-top:6px;font-size:12.5px;color:#5a4526;background:rgba(243,232,205,.8);border:1px solid rgba(180,150,90,.5);border-radius:12px;padding:10px 13px;min-height:20px;line-height:1.65}" +
      ".pet-memory-panel.journal .mp-answer.loading{color:#8a6a3a;font-style:italic}" +
      /* ask-the-cat section BELOW the journal — a soft cream card that
         contrasts with the kraft notepad above it */
      ".pet-memory-panel .mp-ask{margin-top:16px;padding:14px 16px;border-radius:16px 10px 18px 12px / 10px 16px 12px 18px;background:rgba(255,251,240,.92);border:1px solid rgba(194,178,128,.5);display:flex;flex-direction:column;gap:7px;box-shadow:0 2px 10px rgba(120,90,50,.12)}" +
      ".pet-memory-panel .mp-ask-title{font-size:13.5px;font-weight:800;color:#8a5a20;margin-bottom:2px;display:flex;align-items:center;gap:6px}" +
      ".pet-memory-panel .mp-ask-title::after{content:'';flex:1;height:1px;background:repeating-linear-gradient(90deg,rgba(150,110,50,.35) 0 6px,transparent 6px 12px)}" +
      ".pet-memory-panel .mp-q{border:1px solid rgba(194,178,128,.5);background:rgba(255,253,246,.8);color:#5a4526;border-radius:999px;padding:6px 13px;font-size:12px;text-align:left;cursor:pointer;transition:background .15s,transform .15s}" +
      ".pet-memory-panel .mp-q:hover{background:rgba(226,196,120,.28);transform:translateX(2px)}" +
      ".pet-memory-panel .mp-q:disabled{opacity:.45;cursor:not-allowed;transform:none}" +
      ".pet-memory-panel .mp-q:disabled:hover{background:rgba(255,253,246,.8)}" +
      ".pet-memory-panel .mp-answer{margin-top:8px;max-height:180px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;padding:6px 2px;scrollbar-width:thin;scrollbar-color:rgba(180,150,90,.5) transparent}" +
      ".pet-memory-panel .mp-pair{display:flex;flex-direction:column;gap:4px}" +
      ".pet-memory-panel .mp-qrow{font-size:12px;color:#7a5a2c;font-weight:600;background:rgba(194,178,128,.16);border-radius:10px;padding:5px 10px;align-self:flex-end;max-width:88%;text-align:right}" +
      ".pet-memory-panel .mp-arow{font-size:12.5px;color:#5a4526;background:rgba(243,232,205,.8);border:1px solid rgba(180,150,90,.45);border-radius:10px;padding:7px 11px;line-height:1.6;align-self:flex-start;max-width:92%}" +
      ".pet-memory-panel .mp-arow.loading{color:#a08a60;font-style:italic}" +
      /* question danmaku: chips drift right→left across 3 lanes like
         barrage comments; the stage is a fixed-height overlay */
      ".pet-memory-panel .mp-danmaku{position:relative;overflow:hidden;margin:2px -16px;height:114px;border-radius:10px}" +
      ".pet-memory-panel .mp-q{white-space:nowrap;border:1px solid rgba(194,178,128,.5);background:rgba(255,253,246,.88);color:#5a4526;border-radius:999px;padding:5px 14px;font-size:12px;cursor:pointer;box-shadow:0 1px 4px rgba(120,90,50,.15);transition:background .15s,box-shadow .15s}" +
      ".pet-memory-panel .mp-q:hover{background:rgba(226,196,120,.35);box-shadow:0 2px 10px rgba(120,90,50,.28)}" +
      ".pet-memory-panel .mp-q:disabled{opacity:.45;cursor:not-allowed}" +
      ".pet-memory-panel .mp-q:disabled:hover{background:rgba(255,253,246,.88);box-shadow:none}" +
      /* custom question input row */
      ".pet-memory-panel .mp-ask-input{display:flex;gap:6px;margin-top:2px;align-items:center}" +
      ".pet-memory-panel .mp-ask-input input{flex:1;min-width:0;border:1px solid rgba(194,178,128,.55);background:rgba(255,253,246,.85);color:#5a4526;border-radius:999px;padding:6px 13px;font-size:12px;outline:none;font-family:inherit}" +
      ".pet-memory-panel .mp-ask-input input:focus{border-color:#c2b280}" +
      ".pet-memory-panel .mp-ask-input .mp-count{flex:none;font-size:10.5px;color:#a08a60;min-width:30px;text-align:center}" +
      ".pet-memory-panel .mp-ask-input button{border:none;background:linear-gradient(180deg,#f7c948,#e0a52f);color:#fff;border-radius:999px;padding:6px 16px;font-size:12px;font-weight:700;cursor:pointer;box-shadow:0 2px 6px rgba(180,130,50,.35);transition:filter .15s}" +
      ".pet-memory-panel .mp-ask-input button:hover{filter:brightness(1.07)}" +
      ".pet-memory-panel .mp-ask-input button:disabled{opacity:.5;cursor:not-allowed}" +
      ".pet-memory-panel .mp-ask-input input:disabled{opacity:.5}" +
      /* cat switch row button */
      "#companion-pet-root .pet-cat-switch-row{width:100%;display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:14px;border:1px solid rgba(120,100,60,.35);background:rgba(120,100,60,.12);cursor:pointer;transition:border-color .15s,background .15s;color:#5a4632;font-size:13px;text-align:left}" +
      "#companion-pet-root .pet-cat-switch-row img{width:44px;height:44px;object-fit:contain;border-radius:10px;background:rgba(255,255,255,.5);flex:none}" +
      "#companion-pet-root .pet-cat-switch-row span{flex:1}" +
      "#companion-pet-root .pet-cat-switch-row em{font-style:normal;color:#a08040;font-size:12px;border:1px solid rgba(120,100,60,.4);border-radius:999px;padding:3px 10px;flex:none}" +
      "#companion-pet-root .pet-cat-switch-row:hover{border-color:rgba(120,100,60,.6);background:rgba(120,100,60,.2)}" +
      /* cat picker — 3D curved carousel: cats sit on a radial arc that bulges
         toward the viewer; the centered cat is largest, front-most, haloed.
         Mouse movement rotates the arc (with inertia); the nearest cat snaps
         to center and becomes the selection. Warm fairy-tale + faint tech. */
      "@keyframes petCurtainIn{from{opacity:0;transform:translate(-50%,-50%) scale(.88) translateY(12px)}to{opacity:1;transform:translate(-50%,-50%) scale(1) translateY(0)}}" +
      "#companion-pet-root .pet-curtain{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:2147483998;width:min(94vw,1060px);padding:24px 26px 20px;border-radius:34px;background:linear-gradient(180deg,rgba(253,250,240,.95),rgba(247,240,222,.93) 55%,rgba(243,234,214,.93));box-shadow:0 30px 80px rgba(60,40,20,.35),inset 0 1px 0 rgba(255,255,255,.75);pointer-events:auto;display:flex;flex-direction:column;align-items:center;gap:12px;animation:petCurtainIn .38s cubic-bezier(.2,.9,.3,1.15)}" +
      /* soft halo + faint warm pools behind the panel (fairy-tale air) */
      "#companion-pet-root .pet-curtain::before{content:'';position:absolute;inset:-32px;border-radius:64px;pointer-events:none;background:radial-gradient(ellipse 46% 42% at 50% 46%,rgba(255,244,214,.5),rgba(255,244,214,.14) 55%,transparent 78%);z-index:-1;filter:blur(2px)}" +
      "#companion-pet-root .pet-curtain::after{content:'';position:absolute;inset:0;border-radius:inherit;pointer-events:none;background:radial-gradient(ellipse 40% 34% at 50% 0%,rgba(255,255,255,.5),transparent 62%),radial-gradient(ellipse 30% 26% at 10% 100%,rgba(232,216,178,.3),transparent 65%),radial-gradient(ellipse 30% 26% at 90% 100%,rgba(232,216,178,.3),transparent 65%)}" +
      "#companion-pet-root .pet-curtain-title{font-size:23px;font-weight:800;color:#5a4632;text-shadow:0 1px 0 rgba(255,255,255,.6);position:relative;z-index:1;display:flex;align-items:center;width:100%;height:40px}" +
      /* title text is truly centered; the random button floats right of it */
      "#companion-pet-root .pet-curtain-title span{position:absolute;left:50%;transform:translateX(-50%);text-align:center;letter-spacing:.14em;white-space:nowrap}" +
      "#companion-pet-root .pet-curtain-random{position:absolute;right:58px;top:50%;transform:translateY(-50%);border:1px solid rgba(255,255,255,.5);background:linear-gradient(180deg,#f2c462,#d9a33a);color:#fff;border-radius:999px;padding:5px 18px;font-size:13px;font-weight:800;letter-spacing:.04em;cursor:pointer;white-space:nowrap;box-shadow:0 2px 7px rgba(180,130,50,.35),inset 0 1px 0 rgba(255,255,255,.55);transition:filter .15s}" +
      "#companion-pet-root .pet-curtain-random:hover{filter:brightness(1.07);animation:petLeverPop .35s ease}" +
      "#companion-pet-root .pet-curtain-random:active{filter:brightness(.96)}" +
      /* pop up slightly on hover; keeps the translateY(-50%) centering so the
         button never appears to slide down */
      "@keyframes petLeverPop{0%,100%{transform:translateY(-50%) scale(1)}40%{transform:translateY(calc(-50% - 4px)) scale(1.06)}}" +
      /* confetti burst behind the randomly picked cat */
      "#companion-pet-root .pet-confetti{position:absolute;left:50%;top:38%;width:0;height:0;pointer-events:none;z-index:9}" +
      "#companion-pet-root .pet-confetti i{position:absolute;width:7px;height:11px;border-radius:2px;opacity:0;animation:cfFly 1.4s ease-out forwards}" +
      "@keyframes cfFly{0%{opacity:1;transform:translate(0,0) rotate(0) scale(1)}100%{opacity:0;transform:translate(var(--dx),var(--dy)) rotate(var(--rot)) scale(.85)}}" +
      /* 3D stage: one flex row — [◀] cats arc [▶] on the SAME line, arrows
         sit at the row's two ends, no absolute guessing */
      "#companion-pet-root .pet-stage{position:relative;width:100%;height:336px;perspective:1500px;perspective-origin:50% 45%;overflow:visible;z-index:1;display:flex;align-items:center;justify-content:space-between;padding:0 6px}" +
      /* soft haze on the stage edges: the rectangle fades into the panel
         (left/right 12%, bottom 15%) so it feels airy, not a hard box */
      "#companion-pet-root .pet-stage::before{content:'';position:absolute;inset:0;pointer-events:none;z-index:5;background:linear-gradient(90deg,rgba(249,243,227,.92) 0%,rgba(249,243,227,0) 13%,rgba(249,243,227,0) 87%,rgba(249,243,227,.92) 100%)}" +
      "#companion-pet-root .pet-stage::after{content:'';position:absolute;inset:0;pointer-events:none;z-index:5;background:linear-gradient(180deg,rgba(249,243,227,0) 0%,rgba(249,243,227,0) 84%,rgba(249,243,227,.93) 100%)}" +
      "#companion-pet-root .pet-track{position:relative;transform-style:preserve-3d;margin-top:12px}" +
      /* soft light curtain the cats stand in front of */
      "#companion-pet-root .pet-beam{position:absolute;left:50%;top:56%;width:320px;height:320px;transform:translate(-50%,-58%);background:radial-gradient(ellipse 50% 50%,rgba(255,232,190,.62),rgba(255,232,190,.2) 55%,transparent 76%);filter:blur(3px);pointer-events:none}" +
      /* pod: NO card frame — just the kitten, warm under-glow, perspective tilt */
      "#companion-pet-root .pet-pod{position:absolute;left:-86px;top:-122px;width:172px;height:236px;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:6px;will-change:transform;cursor:pointer}" +
      "#companion-pet-root .pet-pod img{width:158px;height:158px;object-fit:contain;filter:drop-shadow(0 10px 14px rgba(130,95,50,.14));pointer-events:none}" +
      "#companion-pet-root .pet-pod-name{font-size:13px;font-weight:700;color:#8a744f;letter-spacing:.06em;text-shadow:0 1px 0 rgba(255,255,255,.7)}" +
      /* "already chosen" check badge — centered ABOVE the kitten's head,
         bright gold with a white ring (persistent while browsing: previews
         never change the confirmed cat; only the "选它" button does) */
      "#companion-pet-root .pet-pod-badge{position:absolute;left:50%;top:30px;transform:translateX(-50%);width:34px;height:34px;border-radius:50%;background:linear-gradient(180deg,#f7c948,#e0a52f);color:#fff;font-size:18px;font-weight:900;line-height:1;display:none;align-items:center;justify-content:center;box-shadow:0 0 0 3px rgba(255,255,255,.95),0 4px 12px rgba(200,150,50,.55),inset 0 1px 0 rgba(255,255,255,.45);z-index:6;text-shadow:0 1px 2px rgba(140,90,10,.4)}" +
      /* confirm-selection button in the caption */
      "#companion-pet-root .pet-caption .pc-confirm{border:none;background:linear-gradient(180deg,#f7c948,#e0a52f);color:#fff;font-size:13px;font-weight:800;letter-spacing:.04em;border-radius:999px;padding:7px 18px;cursor:pointer;box-shadow:0 0 0 2px rgba(255,255,255,.85),0 3px 10px rgba(200,150,50,.4);transition:transform .15s,opacity .15s}" +
      "#companion-pet-root .pet-caption .pc-confirm:hover:not(:disabled){transform:scale(1.06)}" +
      "#companion-pet-root .pet-caption .pc-confirm:active:not(:disabled){transform:scale(.95)}" +
      "#companion-pet-root .pet-caption .pc-confirm:disabled{opacity:.55;cursor:default}" +
      /* centered cat: soft warm halo + gentle float (kept subtle so the glow
         never bleeds onto the neighboring cats = no ghosting) */
      "#companion-pet-root .pet-pod.sel img{filter:drop-shadow(0 0 10px rgba(255,205,120,.5));animation:petFloat 3.4s ease-in-out infinite}" +
      "@keyframes petFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-9px)}}" +
      "#companion-pet-root .pet-pod.sel .pet-pod-name{color:#6b4f24;font-size:14px}" +
      /* caption: selected cat's name (editable) + personality tag */
      "#companion-pet-root .pet-caption{display:flex;align-items:center;gap:10px;min-height:46px;position:relative;z-index:1}" +
      "#companion-pet-root .pet-caption .pc-name{font-size:19px;font-weight:800;color:#5a4632;letter-spacing:.12em;display:flex;align-items:center;gap:6px}" +
      "#companion-pet-root .pet-caption .pc-edit{border:none;background:rgba(194,178,128,.25);color:#8a7448;width:22px;height:22px;border-radius:50%;cursor:pointer;font-size:11px;line-height:1;display:flex;align-items:center;justify-content:center;transition:background .15s}" +
      "#companion-pet-root .pet-caption .pc-edit:hover{background:#c2b280;color:#fff}" +
      "#companion-pet-root .pet-caption .pc-desc{font-size:13px;color:#a08a60;padding:3px 12px;border-radius:999px;background:rgba(255,253,246,.7);border:1px solid rgba(194,178,128,.35);letter-spacing:.08em}" +
      /* inline rename row */
      "#companion-pet-root .pet-rename{display:flex;align-items:center;gap:8px;padding:7px 12px;border-radius:999px;background:rgba(255,253,246,.95);border:1px solid rgba(194,178,128,.45);box-shadow:0 4px 16px rgba(120,90,50,.14);position:relative;z-index:2}" +
      "#companion-pet-root .pet-rename input{width:120px;border:1px solid rgba(194,178,128,.5);border-radius:999px;padding:4px 10px;font-size:13px;color:#5a4632;background:#fff;outline:none}" +
      "#companion-pet-root .pet-rename button{border:none;background:#c2b280;color:#fff;border-radius:999px;padding:5px 16px;font-size:13px;font-weight:700;cursor:pointer}" +
      "#companion-pet-root .pet-rename button:hover{background:#ac9a68}" +
      "#companion-pet-root .pet-curtain-close{position:absolute;top:14px;right:14px;width:32px;height:32px;border:none;background:rgba(194,178,128,.22);color:#8a7448;border-radius:50%;cursor:pointer;font-size:15px;line-height:1;display:flex;align-items:center;justify-content:center;transition:background .15s;z-index:3}" +
      "#companion-pet-root .pet-curtain-close:hover{background:rgba(200,90,60,.28);color:#8a2a1a}" +
      /* left/right step buttons — same flex row as the cats, at the ends */
      "#companion-pet-root .pet-arrow{position:relative;flex:none;width:42px;height:42px;border:none;border-radius:50%;background:rgba(194,178,128,.4);color:#6b5530;font-size:15px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:200;box-shadow:0 4px 14px rgba(120,90,50,.2);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);transition:background .15s,opacity .15s,transform .15s}" +
      "#companion-pet-root .pet-arrow:hover:not(:disabled){background:#c2b280;color:#fff;transform:scale(1.08)}" +
      "#companion-pet-root .pet-arrow:active:not(:disabled){transform:scale(.95)}" +
      "#companion-pet-root .pet-arrow:disabled{opacity:.28;cursor:default}" +
      /* background picker — same 3D carousel, but each pod is a framed
         wallpaper card showing the DAY image as its preview */
      "#companion-pet-root .pet-bgpod{position:absolute;left:-150px;top:-96px;width:300px;height:176px;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:8px;will-change:transform;cursor:pointer}" +
      "#companion-pet-root .pet-bgpod .bg-thumb{width:280px;height:150px;object-fit:cover;border-radius:16px;box-shadow:0 12px 26px rgba(60,40,20,.35),inset 0 0 0 1px rgba(255,255,255,.35);pointer-events:none;background:rgba(120,100,60,.15)}" +
      "#companion-pet-root .pet-bgpod-name{font-size:14px;font-weight:800;color:#8a744f;letter-spacing:.1em;text-shadow:0 1px 0 rgba(255,255,255,.75);background:rgba(255,253,246,.65);padding:2px 12px;border-radius:999px}" +
      "#companion-pet-root .pet-bgpod.sel .bg-thumb{box-shadow:0 0 0 3px rgba(255,255,255,.95),0 0 22px rgba(255,205,120,.6);animation:petFloat 3.4s ease-in-out infinite}" +
      "#companion-pet-root .pet-bgpod.sel .pet-bgpod-name{color:#6b4f24}" +
      "#companion-pet-root .pet-bgpod .pet-pod-badge{top:auto;bottom:28px}" +
      "#companion-pet-root .pet-stage.bg-stage{height:300px}" +
      "#companion-pet-root .pet-stage.bg-stage::before{background:linear-gradient(90deg,rgba(249,243,227,.9) 0%,rgba(249,243,227,0) 18%,rgba(249,243,227,0) 82%,rgba(249,243,227,.9) 100%)}" +
      "#companion-pet-root .pet-caption .pc-bg-desc{font-size:12px;color:#a08a60;letter-spacing:.06em;background:rgba(255,253,246,.7);border:1px solid rgba(194,178,128,.35);border-radius:999px;padding:3px 12px}" +
      /* composer toolbar: matches the input card's translucent frosted style */
      "#companion-pet-toolbar{position:fixed;left:320px;bottom:60px;z-index:2147483001;display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:999px;background:rgba(250,240,215,.5);border:1px solid rgba(194,178,128,.4);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:0 8px 28px rgba(0,0,0,.25);pointer-events:auto;-webkit-user-select:none;user-select:none;white-space:nowrap}" +
      "#companion-pet-toolbar .pt-modes{display:flex;align-items:center;gap:2px;background:rgba(120,100,60,.1);border-radius:999px;padding:2px}" +
      "#companion-pet-toolbar .pt-mode{border:none;background:transparent;color:#8a7448;cursor:pointer;font-size:13px;line-height:1;width:28px;height:28px;border-radius:999px;transition:background .15s,color .15s;display:flex;align-items:center;justify-content:center}" +
      "#companion-pet-toolbar .pt-mode:hover{color:#5a4a28;background:rgba(194,178,128,.25)}" +
      "#companion-pet-toolbar .pt-mode.on{background:#c2b280;color:#fff}" +
      "#companion-pet-toolbar .pt-custom{border:1px solid rgba(194,178,128,.5);background:rgba(120,100,60,.08);color:#8a7448;cursor:pointer;font-size:13px;line-height:1;width:28px;height:28px;border-radius:999px;transition:background .15s;display:flex;align-items:center;justify-content:center}" +
      "#companion-pet-toolbar .pt-custom:hover{background:rgba(194,178,128,.35);color:#5a4a28}";

    /**
     * Whole-page wallpaper layer. Paints the user's backdrop behind the DSH
     * shell and makes the app's own surfaces translucent so the artwork shows
     * through, deep-whale style. The day/night image follows the local clock
     * (6:00–18:59 day, else night). All pure CSS/DOM — zero tokens.
     *
     * Design goals from user feedback:
     *   - sidebar (workspace/session list) stays airy & translucent
     *   - conversation center is a bit more solid so message text is readable
     *   - no bottom fade strip over the session list
     */
    var BG_CSS_ID = "companion-pet/bg";
    /** Fixed full-screen backdrop element that holds the wallpaper artwork. */
    var BG_LAYER_ID = "companion-pet/bg-layer";

    /**
     * Persistent user preferences (local, zero tokens).
     *   bg         - wallpaper on/off
     *   mode       - 'auto' | 'day' | 'night'
     *   veil       - 0..100 uniform backdrop darkening strength
     *   petSize    - 0..200 px rendered kitten size
     *   cat        - selected breed key ('orange' | 'white' | ...)
     *   lateRemind - late-night reminder on/off
     *   mood       - input-mood bubbles on/off
     *   bubbles    - click bubbles on/off
     */
    function defaultConfig() {
      return {
        bg: true,
        mode: "auto",
        bgSet: "mushroom",
        veil: 85,
        petSize: 140,
        cat: "orange",
        lateRemind: true,
        mood: true,
        bubbles: true,
        restRemind: true,
        restInterval: 45,
        alarms: [],
        smartCompanion: true,
        deepCompanion: false,
      };
    }
    /* One-time cat-key migration: old builds persisted the placeholder
       keys "cat7"/"cat8" in cfg.cat and under the per-cat custom-name keys
       (companion-pet:name:cat7/cat8). Rewrite them once to the semantic
       names mianmian/tiaotiao so returning users keep their pick. Guarded
       by a flag key so it runs once per browser; never throws. */
    function migrateCatKeys() {
      try {
        if (localStorage.getItem(KEYS.catNameMigrated)) return;
        var raw = localStorage.getItem(KEYS.cfg);
        if (raw) {
          var next = raw;
          if (next.indexOf('"cat7"') >= 0)
            next = next.split('"cat7"').join('"mianmian"');
          if (next.indexOf('"cat8"') >= 0)
            next = next.split('"cat8"').join('"tiaotiao"');
          if (next !== raw) localStorage.setItem(KEYS.cfg, next);
        }
        /* carry over custom names saved under the old keys, if any */
        var n7 = localStorage.getItem(KEYS.namePrefix + "cat7");
        if (n7 !== null) {
          if (localStorage.getItem(KEYS.namePrefix + "mianmian") === null)
            localStorage.setItem(KEYS.namePrefix + "mianmian", n7);
          localStorage.removeItem(KEYS.namePrefix + "cat7");
        }
        var n8 = localStorage.getItem(KEYS.namePrefix + "cat8");
        if (n8 !== null) {
          if (localStorage.getItem(KEYS.namePrefix + "tiaotiao") === null)
            localStorage.setItem(KEYS.namePrefix + "tiaotiao", n8);
          localStorage.removeItem(KEYS.namePrefix + "cat8");
        }
        localStorage.setItem(KEYS.catNameMigrated, "1");
      } catch (_) {}
    }
    function readConfig() {
      var def = defaultConfig();
      try {
        migrateCatKeys();
        var raw = localStorage.getItem(KEYS.cfg);
        if (raw) return Object.assign(def, JSON.parse(raw));
      } catch (_) {}
      return def;
    }
    function writeConfig(cfg) {
      try {
        localStorage.setItem(KEYS.cfg, JSON.stringify(cfg));
      } catch (_) {}
    }

    /**
     * Transparency slider (0..100): HIGHER = MORE transparent (raw artwork
     * at 100, zero veil); LOWER = stronger backing behind text.
     * Returns the veil alpha over the artwork.
     */
    function veilAlpha(veil) {
      var t = Math.max(0, Math.min(1, veil / 100)); // 0..1 transparency
      return 0.9 - t * 0.9; // t=0 -> .90 (strong veil), t=1 -> 0 (raw artwork)
    }

    /** Surface backing factor (0..1): 1 = solid text backing, 0 = transparent. */
    function backingFactor(veil) {
      var t = Math.max(0, Math.min(1, veil / 100));
      return 1 - t; // most transparent -> 0 backing
    }

    /** Which wallpaper image to use for the current set + mode + clock. */
    function wallpaperForNow(mode, bgSet) {
      var set = BACKGROUNDS[bgSet] || BACKGROUNDS.mushroom;
      var m = mode || "auto";
      if (m === "day") return set.day;
      if (m === "night") return set.night;
      var h = new Date().getHours();
      return h >= 6 && h < 19 ? set.day : set.night;
    }

    /**
     * (Re)apply the wallpaper. Design: ONE uniform translucent veil on a
     * fixed full-screen layer behind everything; every DSH surface becomes
     * truly transparent so the scene shows through everywhere (sidebar,
     * center, composer seat), and only the composer input card + code blocks
     * keep a solid local background for readability. The artwork lives on its
     * own position:fixed element (not body), so scrolling / DSH transforms
     * can never make the underlying page show through.
     */
    function applyWallpaper() {
      var style = document.getElementById(BG_CSS_ID);
      if (!style) {
        style = document.createElement("style");
        style.id = BG_CSS_ID;
        document.head.appendChild(style);
      }
      /* keep our stylesheet LAST in <head> so !important rules win over
         DSH's CSS-in-JS which appends later */
      if (style.parentNode === document.head) {
        document.head.appendChild(style);
      }
      /* skin scope attribute: raises our selector specificity above DSH's
         CSS-in-JS (same trick as dsh-deep-whale's data-dsh-maid-atelier) */
      if (typeof document !== "undefined" && document.body) {
        document.body.setAttribute("data-pet-skin", "");
      }
      var cfg = readConfig();
      var url = wallpaperForNow(cfg.mode, cfg.bgSet);
      var veil = veilAlpha(cfg.veil); // veil alpha over artwork (higher = less transparent)
      var b = backingFactor(cfg.veil); // 0..1 surface backing (0 = fully transparent)
      /* fixed full-screen backdrop layer: pinned to the viewport behind
         everything, so scroll/transform can never reveal the page beneath */
      var layer = document.getElementById(BG_LAYER_ID);
      if (!layer) {
        layer = document.createElement("div");
        layer.id = BG_LAYER_ID;
        layer.style.cssText =
          "position:fixed;inset:0;width:100vw;height:100vh;z-index:-1;pointer-events:none;background-size:cover;background-position:center;background-repeat:no-repeat;transform:none!important";
        document.body.appendChild(layer);
      }
      if (!cfg.bg) {
        layer.style.backgroundImage = "none";
        style.textContent = "";
        return;
      }
      /* surface backing: proportional to backingFactor so text never melts
         into the artwork, but fully transparent at the max slider end */
      var sBase = Math.max(0, b * 0.9);
      var sLayer = Math.max(0, b * 0.78);
      var sMod = Math.max(0, b * 0.84);
      /* message bubbles follow backing */
      var sBubble = Math.max(0, Math.min(0.85, b * 0.95 + 0.08));
      var sInput = Math.max(0, Math.min(0.92, b * 0.92));
      var sSide = Math.max(0, b * 0.62);
      /* light theme surfaces use pale fills with the same proportional backing */
      var lBase = Math.min(0.92, b * 0.92);
      var lLayer = Math.min(0.88, b * 0.85);
      var lMod = Math.min(0.9, b * 0.88);
      var lBubble = Math.min(0.92, Math.max(0, b * 0.92 + 0.05));
      var lSide = Math.min(0.85, b * 0.8);
      /* veil + wallpaper on the backdrop layer: gradient over the artwork */
      layer.style.backgroundImage =
        "linear-gradient(rgba(8,11,20," + veil + "),rgba(8,11,20," + veil + ")),url('" + url + "')";
      style.textContent =
        /* html stays neutral; the artwork lives on the fixed backdrop layer */
        "html{background:transparent!important}" +
        "body{background:transparent!important}" +
        "#root{background:transparent!important}" +
        /* remove every surface seam: session-list fade + composer seat gradient */
        ".qDHVXG_fade{background:transparent!important}" +
        ".wSkVaW_composerSeat{background:transparent!important}" +
        /* AI reply body: DSH exposes [data-chat-flow-kind='assistant-step']
           per assistant step and its markdown container carries the text.
           Wood-tone backing via the same data-attrs dsh-deep-whale uses —
           pure CSS, zero runtime cost. */
        "body[data-pet-skin] [data-chat-flow-kind='assistant-step'] div[class*='markdown']{background:rgba(24,30,44," +
        Math.max(0.72, b * 0.9) +
        ")!important;border:1px solid rgba(140,105,70,.35)!important;border-radius:14px!important;padding:10px 14px!important}" +
        "body[data-pet-skin]:not([data-ds-dark-theme]) [data-chat-flow-kind='assistant-step'] div[class*='markdown']{background:rgba(250,246,238," +
        Math.max(0.8, Math.min(0.95, b * 0.9 + 0.55)) +
        ")!important;border:1px solid rgba(140,105,70,.3)!important}" +
        /* reasoning/think section: [data-variant='think'] is the native
           ReasoningRow root wrapping the disclosure title + body */
        "body[data-pet-skin] [data-variant='think']{background:rgba(24,30,44," +
        Math.max(0.72, b * 0.9) +
        ")!important;border:1px solid rgba(140,105,70,.35)!important;border-radius:12px!important;padding:2px 12px!important}" +
        "body[data-pet-skin]:not([data-ds-dark-theme]) [data-variant='think']{background:rgba(250,246,238," +
        Math.max(0.8, Math.min(0.95, b * 0.9 + 0.55)) +
        ")!important;border:1px solid rgba(140,105,70,.3)!important}" +
        /* tool/command cards (Edit, bash, …): ToolRow carries data-tool; the
           generic command card uses data-variant='others' — cover both */
        "body[data-pet-skin] [data-tool],body[data-pet-skin] [data-variant='others']{background:rgba(24,30,44," +
        Math.max(0.72, b * 0.9) +
        ")!important;border:1px solid rgba(140,105,70,.35)!important;border-radius:12px!important;padding:2px 12px!important}" +
        "body[data-pet-skin]:not([data-ds-dark-theme]) [data-tool],body[data-pet-skin]:not([data-ds-dark-theme]) [data-variant='others']{background:rgba(250,246,238," +
        Math.max(0.8, Math.min(0.95, b * 0.9 + 0.55)) +
        ")!important;border:1px solid rgba(140,105,70,.3)!important;padding:2px 12px!important}" +
        /* message turn tail: time line + copy/branch/feedback buttons */
        "body[data-pet-skin] [data-turn-tail]{background:rgba(24,30,44," +
        Math.max(0.45, b * 0.85) +
        ")!important;border-radius:10px!important;padding:2px 8px!important}" +
        "body[data-pet-skin]:not([data-ds-dark-theme]) [data-turn-tail]{background:rgba(250,246,238," +
        Math.max(0.6, Math.min(0.85, b * 0.85 + 0.45)) +
        ")!important;border-radius:10px!important;padding:2px 8px!important}" +
        /* message feedback buttons (like/dislike) get a frosted backing */
        "body[data-pet-skin] button[aria-label='好的回答'],body[data-pet-skin] button[aria-label='有问题的回答']{background:rgba(24,30,44,.45)!important;border-radius:28px!important}" +
        "body[data-pet-skin]:not([data-ds-dark-theme]) button[aria-label='好的回答'],body[data-pet-skin]:not([data-ds-dark-theme]) button[aria-label='有问题的回答']{background:rgba(250,246,238,.5)!important;border-radius:28px!important}" +
        /* DSH full-screen modals (overall settings, attachment viewer) mount
           role=dialog aria-modal=true; their panel + mask read
           --dsw-alias-bg-layer-2 / --dsw-alias-bg-mask-1 which we make
           transparent with the veil, so pin a SOLID backing here plus
           overrides for the surface variables inside the dialog */
        "body[data-pet-skin] [role='dialog'][aria-modal='true']{background:rgba(13,18,32,.96)!important;border:1px solid rgba(140,105,70,.35)!important;--dsw-alias-bg-layer-1:rgba(14,19,32,.95)!important;--dsw-alias-bg-layer-2:rgba(13,18,32,.96)!important;--dsw-alias-bg-layer-3:rgba(18,23,40,.95)!important;--dsw-alias-bg-module:rgba(18,23,42,.93)!important;--dsw-alias-bg-module-hover:rgba(26,32,52,.95)!important;--dsw-alias-bg-elevated:rgba(20,26,46,.95)!important;--dsw-alias-bg-mask-1:rgba(10,14,24,.72)!important}" +
        "body[data-pet-skin]:not([data-ds-dark-theme]) [role='dialog'][aria-modal='true']{background:rgba(254,252,248,.97)!important;border:1px solid rgba(140,105,70,.3)!important;--dsw-alias-bg-layer-1:rgba(252,250,246,.97)!important;--dsw-alias-bg-layer-2:rgba(254,252,248,.97)!important;--dsw-alias-bg-layer-3:rgba(255,253,250,.97)!important;--dsw-alias-bg-module:rgba(252,250,246,.96)!important;--dsw-alias-bg-module-hover:rgba(244,240,234,.97)!important;--dsw-alias-bg-elevated:rgba(254,252,248,.97)!important;--dsw-alias-bg-mask-1:rgba(250,248,243,.78)!important}" +
        /* DSH modals mount at z-index 1000 while our UI sits at 2147483001+;
           sink the whole companion UI under the modal mask so the settings
           panel (and its veil) always covers it */
        "body[data-pet-skin]:has([role='dialog'][aria-modal='true']) #companion-pet-root," +
        "body[data-pet-skin]:has([role='dialog'][aria-modal='true']) #companion-pet-toolbar," +
        "body[data-pet-skin]:has([role='dialog'][aria-modal='true']) #companion-pet-mem-bar," +
        "body[data-pet-skin]:has([role='dialog'][aria-modal='true']) .pet-stats-panel," +
        "body[data-pet-skin]:has([role='dialog'][aria-modal='true']) .pet-memory-panel," +
        "body[data-pet-skin]:has([role='dialog'][aria-modal='true']) .pet-curtain{z-index:998!important}" +
        /* composer stats line (turns · steps · LLM time · tokens) below the
           input card — StatsLine root (CSS-module hash of this DSH build) */
        "body[data-pet-skin] [class*='FJxK0a_root']{background:rgba(24,30,44," +
        Math.max(0.55, b * 0.9) +
        ")!important;border-radius:10px!important;margin-top:6px!important}" +
        "body[data-pet-skin]:not([data-ds-dark-theme]) [class*='FJxK0a_root']{background:rgba(250,246,238," +
        Math.max(0.7, Math.min(0.9, b * 0.9 + 0.5)) +
        ")!important;border-radius:10px!important;margin-top:6px!important}" +
        /* user messages: whale's own selector for the user bubble */
        "body[data-pet-skin] [class*='userRow'] [class*='bubble']{background:rgba(24,30,44," +
        Math.max(0.72, b * 0.9) +
        ")!important;border:1px solid rgba(140,105,70,.35)!important}" +
        "body[data-pet-skin]:not([data-ds-dark-theme]) [class*='userRow'] [class*='bubble']{background:rgba(250,246,238," +
        Math.max(0.8, Math.min(0.95, b * 0.9 + 0.55)) +
        ")!important;border:1px solid rgba(140,105,70,.3)!important}" +
        /* composer input card: solid backing + simple trim, same tone as
           the AI bubbles (no moss texture) */
        "body[data-pet-skin] [data-composer-card]{position:relative!important;background:rgba(24,30,44," +
        Math.max(0.78, b * 0.9) +
        ")!important;border:1px solid rgba(140,105,70,.45)!important;border-radius:20px!important;box-shadow:0 10px 30px rgba(0,0,0,.3),inset 0 1px 0 rgba(255,220,170,.08)!important}" +
        "body[data-pet-skin]:not([data-ds-dark-theme]) [data-composer-card]{background:rgba(250,246,238," +
        Math.max(0.85, Math.min(0.95, b * 0.9 + 0.6)) +
        ")!important;border:1px solid rgba(140,105,70,.4)!important}" +
        "body[data-pet-skin] [data-composer-card]::after{content:''!important;position:absolute!important;inset:-3px!important;border-radius:24px!important;border:2px solid rgba(160,120,80,.5)!important;pointer-events:none!important}" +
        "body[data-pet-skin] [data-composer-card] > *{position:relative!important;z-index:1!important}" +
        /* in-progress goal BAR (dock > bar): target the inner bar, NOT the
           full-width dock wrapper, so only the pill gets the wood backing */
        "body[data-pet-skin] [data-goal-bar] > div{background:rgba(24,30,44," +
        Math.max(0.75, b * 0.9) +
        ")!important;border:1px solid rgba(140,105,70,.4)!important}" +
        "body[data-pet-skin]:not([data-ds-dark-theme]) [data-goal-bar] > div{background:rgba(250,246,238," +
        Math.max(0.82, Math.min(0.95, b * 0.9 + 0.58)) +
        ")!important;border:1px solid rgba(140,105,70,.35)!important}" +
        /* dark theme: every surface alpha scales with backing b (0 at max) */
        "body[data-ds-dark-theme]{" +
        "--dsw-alias-bg-base:rgba(10,14,24," + sBase + ");" +
        "--dsw-alias-bg-layer-1:rgba(11,16,28," + sLayer + ");" +
        "--dsw-alias-bg-layer-2:rgba(13,18,32," + sLayer + ");" +
        "--dsw-alias-bg-layer-3:rgba(15,21,36," + sLayer + ");" +
        "--dsw-alias-bg-module:rgba(13,18,32," + sMod + ");" +
        "--dsw-alias-bg-module-hover:rgba(22,29,50," + Math.min(0.95, sMod + 0.12) + ");" +
        "--dsw-alias-bg-elevated:rgba(16,22,38," + Math.min(0.95, sMod + 0.08) + ");" +
        "--dsw-alias-bg-mask-1:rgba(10,14,24," + sLayer + ");" +
        "--dsw-alias-bg-mask-2:rgba(12,17,30," + sLayer + ");" +
        "--dsw-alias-bg-mask-3:rgba(15,21,36," + sLayer + ");" +
        "--dsw-alias-bg-mask-drop:rgba(8,11,20," + sLayer + ");" +
        "--dsw-alias-bg-mask-photo:rgba(8,11,20," + sLayer + ");" +
        "--dsw-alias-bg-overlay:rgba(8,11,20," + sLayer + ");" +
        "--dsw-alias-bg-skeleton:rgba(255,255,255," + Math.max(0, b * 0.06) + ");" +
        "--dsw-specific-sidebar-fill:rgba(10,14,24," + sSide + ");" +
        /* menus / selectors / tooltips keep a SOLID backing so buttons and
           dropdowns always read (not tied to the transparency slider) */
        "--dsw-specific-menu:rgba(18,23,42,.88);" +
        "--dsw-specific-selector:rgba(18,23,42,.88);" +
        "--dsw-specific-tip:rgba(18,23,42,.85);" +
        /* composer input card + approval cards share this variable: keep it
           solid so text/buttons always read */
        "--dsw-specific-input-major:rgba(14,19,34,.82);" +
        "--dsw-specific-login-input:rgba(14,19,34,.82);" +
        /* message bubbles follow backing */
        "--dsw-specific-bubble:rgba(16,22,38," + sBubble + ");" +
        "--dsw-specific-bubble-highlight:rgba(24,32,56," + Math.min(0.95, sBubble + 0.08) + ")" +
        "}" +
        /* light theme: pale backing, every alpha scales with b */
        "body:not([data-ds-dark-theme]){" +
        "--dsw-alias-bg-base:rgba(250,248,243," + lBase + ");" +
        "--dsw-alias-bg-layer-1:rgba(252,250,246," + lLayer + ");" +
        "--dsw-alias-bg-layer-2:rgba(254,252,248," + lLayer + ");" +
        "--dsw-alias-bg-layer-3:rgba(255,253,250," + lLayer + ");" +
        "--dsw-alias-bg-module:rgba(252,250,246," + lMod + ");" +
        "--dsw-alias-bg-module-hover:rgba(244,240,234," + Math.min(0.95, lMod + 0.1) + ");" +
        "--dsw-alias-bg-elevated:rgba(254,252,248," + Math.min(0.95, lMod + 0.08) + ");" +
        "--dsw-alias-bg-mask-1:rgba(250,248,243," + lLayer + ");" +
        "--dsw-alias-bg-mask-2:rgba(252,250,246," + lLayer + ");" +
        "--dsw-alias-bg-mask-3:rgba(254,252,248," + lLayer + ");" +
        "--dsw-alias-bg-mask-drop:rgba(250,248,243," + lLayer + ");" +
        "--dsw-alias-bg-mask-photo:rgba(250,248,243," + lLayer + ");" +
        "--dsw-alias-bg-overlay:rgba(250,248,243," + lLayer + ");" +
        "--dsw-alias-bg-skeleton:rgba(0,0,0," + Math.max(0, b * 0.06) + ");" +
        "--dsw-specific-sidebar-fill:rgba(250,248,243," + lSide + ");" +
        "--dsw-specific-menu:rgba(252,250,246,.9);" +
        "--dsw-specific-selector:rgba(252,250,246,.9);" +
        "--dsw-specific-tip:rgba(252,250,246,.88);" +
        "--dsw-specific-input-major:rgba(255,255,255,.9);" +
        "--dsw-specific-login-input:rgba(255,255,255,.9);" +
        "--dsw-specific-bubble:rgba(255,255,255," + lBubble + ");" +
        "--dsw-specific-bubble-highlight:rgba(244,240,234," + Math.min(0.95, lBubble + 0.08) + ")" +
        "}" +
        /* code blocks scale with backing too (transparent at max) */
        "body[data-ds-dark-theme]{--dsw-alias-markdown-code-block:rgba(8,12,22," + Math.max(0.15, b * 0.9) + ")}" +
        "body:not([data-ds-dark-theme]){--dsw-alias-markdown-code-block:rgba(248,246,242," + Math.max(0.15, b * 0.92) + ")}";
    }

    /** Inject the stylesheet (idempotent). */
    function ensureCss() {
      var tagId = "companion-pet/css";
      if (typeof document !== "undefined" && document.querySelector('style[data-plugin-css="' + tagId + '"]') === null) {
        var tag = document.createElement("style");
        tag.dataset.plugin = "companion-pet";
        tag.dataset.pluginCss = tagId;
        tag.textContent = CSS;
        document.head.appendChild(tag);
      }
    }

    /** Read / write the reminder marker. */
    function todayKey() {
      var d = new Date();
      return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
    }
    function alreadyReminded() {
      try {
        return localStorage.getItem(KEYS.reminderDay) === todayKey();
      } catch (_) {
        return true;
      }
    }
    function markReminded() {
      try {
        localStorage.setItem(KEYS.reminderDay, todayKey());
      } catch (_) {
        /* storage may be unavailable; skip */
      }
    }

    /** Is the local clock inside the late-night window? */
    function isLateNight() {
      var h = new Date().getHours();
      return h >= 23 || h < 5;
    }

    /**
     * Build the pet DOM tree. Returns a disposer that removes everything.
     * All timers are owned by this instance so HMR/unload cleans up cleanly.
     */
    function createPet() {
      /* test-only: publish the pure helpers that live in this scope (they
         are unreachable from the factory top level) before any DOM work.
         Harmless in prod: DSH only ever reads module.exports.apply. */
      if (typeof exports !== "undefined") {
        /* PRICE / tickStats state are `var`s initialized mid-body; the test
           harness only runs createPet's first statement, so (re)initialize
           them here with their declared values. Prod is unaffected: the real
           assignment lines run later in createPet's body and re-assign the
           same values. Keep in sync with the originals. */
        PRICE = { input: 2, cacheRead: 0.5, cacheWrite: 2, output: 8 };
        statsRunning = true;
        lastActivity = Date.now();
        lastStatsSave = Date.now();
        IDLE_TIMEOUT = 2 * 60 * 1000;
        /* currentCat is also a mid-body var (initialized later in createPet);
           tests drive it through readConfig() so menuItemsForCat/ambientPool
           are reachable. Keep in sync with the original. */
        currentCat = selectedCat(readConfig());
        /* MENU_ITEMS is a mid-body var too; menuItemsForCat reads it.
           Keep in sync with the original literal. */
        MENU_ITEMS = [
          ["happy", "🎉", "开心跳"],
          ["stretch", "🙆", "伸懒腰"],
          ["celebrate", "🙌", "庆祝举手"],
          ["think", "🤔", "歪头思考"],
          ["walk", "🚶", "原地踏步"],
          ["scare", "😱", "惊吓"],
          ["sad", "😿", "失落低头"],
          ["sleep", "😴", "打盹"],
          ["chase", "🌀", "追尾巴"],
          ["nuzzle", "🐾", "蹭手"],
          ["lick", "😋", "舔爪爪"],
        ];
        exports.__test = Object.assign(exports.__test || {}, {
          pick: pick,
          todayStr: todayStr,
          festivalOf: festivalOf,
          yesterdayStr: yesterdayStr,
          fmtDur: fmtDur,
          fmtK: fmtK,
          fmtH: fmtH,
          tickStats: tickStats,
          estCost: estCost,
          dayCost: dayCost,
          bucketCost: bucketCost,
          fmtCost: fmtCost,
          dateStrOf: dateStrOf,
          dateOffsetStr: dateOffsetStr,
          pickNotesForQuestion: pickNotesForQuestion,
          notesNear: notesNear,
          dateShift: dateShift,
          daysSince: daysSince,
          weekAgoStr: weekAgoStr,
          isWorthRemembering: isWorthRemembering,
          readDaily: readDaily,
          writeDaily: writeDaily,
          readProfile: readProfile,
          writeProfile: writeProfile,
          readMem: readMem,
          writeMem: writeMem,
          readInputsByDay: readInputsByDay,
          writeInputsByDay: writeInputsByDay,
          recordBalanceCost: recordBalanceCost,
          cleanTrivialMemories: cleanTrivialMemories,
          maybeAutoExtract: maybeAutoExtract,
          updateProfile: updateProfile,
          weekMood: weekMood,
          weekActivity: weekActivity,
          packMemory: packMemory,
          bumpMood: bumpMood,
          bumpWeekActivity: bumpWeekActivity,
          pickGreeting: pickGreeting,
          pickLateBubble: pickLateBubble,
          pickAngryBubble: pickAngryBubble,
          migrateDaily: migrateDaily,
          resetToday: resetToday,
          pruneDaily: pruneDaily,
          buildTimelineRows: buildTimelineRows,
          sessionCost: sessionCost,
          menuItemsForCat: menuItemsForCat,
          ambientPool: ambientPool,
        });
      }
      var root = document.createElement("div");
      root.id = "companion-pet-root";
      root.setAttribute("aria-label", "陪伴小猫");

      /* fixed-size canvas: every action is scaled/centered inside so the
         kitten never jumps in size when the animation changes */
      var canvas = document.createElement("div");
      canvas.className = "pet-canvas";

      var img = document.createElement("img");
      img.className = "pet-img";
      img.alt = "小猫";
      img.draggable = false;

      var bubble = document.createElement("div");
      bubble.className = "pet-bubble";

      /* skill badge: top-left sparkle, only visible while idle */
      var skillBtn = document.createElement("button");
      skillBtn.type = "button";
      skillBtn.className = "pet-skill-btn";
      skillBtn.title = "小猫技能";
      skillBtn.textContent = "✦";

      /* name label under the kitten; click to rename */
      var nameEl = document.createElement("div");
      nameEl.className = "pet-name";
      nameEl.title = "点击改名";

      canvas.appendChild(skillBtn);
      canvas.appendChild(img);
      root.appendChild(bubble);
      root.appendChild(canvas);
      root.appendChild(nameEl);
      document.body.appendChild(root);

      var timers = [];
      var bubbleTimer = null;
      var greetingDone = false;

      /** Current breed + its action table (rebuilt on cat switch). */
      var currentCat = selectedCat(readConfig());
      var actions = actionsFor(currentCat);

      /** Switch breed: rebuild actions, reset to idle, restyle bubble. */
      function applyCat(catKey) {
        var c = CATS[catKey] || CATS.orange;
        /* favorite-cat tally (rolling: keep a capped counter per breed) */
        try {
          var p = readProfile();
          p.favCats = p.favCats || {};
          p.favCats[catKey] = (p.favCats[catKey] || 0) + 1;
          /* cap at 999 so the counter never grows unbounded */
          if (p.favCats[catKey] > 999) p.favCats[catKey] = 999;
          writeProfile(p);
        } catch (_) {}
        currentCat = c;
        actions = actionsFor(c);
        currentAction = null;
        playAction("idle");
        bubble.style.background = c.bubble;
        bubble.style.borderColor = c.bubbleBorder;
        bubble.style.color = c.bubbleText;
        /* restyle the little tail arrow to match */
        var tip = bubble.querySelector(".pet-bubble-tip") || bubble;
        if (tip) {
          /* tail handled via ::after border-top-color below */
        }
        var after = getComputedStyle(bubble, "::after");
        if (after) {
          /* keep default; color set by CSS var approach is simpler:
             we re-inject via style attr using CSS custom props */
        }
        bubble.style.setProperty("--pet-bubble-bg", c.bubble);
        bubble.style.setProperty("--pet-bubble-border", c.bubbleBorder);
        bubble.style.setProperty("--pet-bubble-text", c.bubbleText);
        nameEl.textContent = catDisplayName(catKey);
      }

      /**
       * Play one action. object-fit: contain inside the FIXED canvas keeps
       * each gif frame-filling; per-cat scale normalizes visual size so all
       * breeds look the same (they occupy different % of their gifs).
       */
      var currentAction = null;
      function playAction(name) {
        var a = actions[name] || actions.idle;
        if (currentAction === name && img.src.indexOf(a.url) >= 0) return;
        currentAction = name;
        img.src = a.url;
        var s = (currentCat.scale || 1) * (a.aScale || 1);
        img.style.transform = "scale(" + s + ")";
        /* skill badge only while idle */
        if (name === "idle") skillBtn.classList.add("show");
        else skillBtn.classList.remove("show");
        if (menuOpen && name !== "idle") closeMenu();
      }

      /* if a breed lacks an action file (e.g. white cat only has idle),
         fall back to its idle so the kitten never shows a broken image */
      img.addEventListener("error", function () {
        if (currentAction && currentAction !== "idle") {
          var idle = actions.idle;
          if (img.src.indexOf(idle.url) < 0) {
            currentAction = "idle";
            img.src = idle.url;
          }
        }
      });

      /** Idle loop after any transient action. */
      function goIdle() {
        playAction("idle");
      }

      /**
       * Play a transient action, then return to idle after that action's
       * dur (each action's full performance). User-picked actions set a
       * priority flag so ambient randomness never cuts them short.
       */
      var actionTimer = null;
      var userActionActive = false;
      function transientAction(name, opts) {
        var o = opts || {};
        if (o.user) userActionActive = true;
        playAction(name);
        if (actionTimer !== null) clearTimeout(actionTimer);
        actionTimer = setTimeout(function () {
          goIdle();
          userActionActive = false;
        }, (actions[name] && actions[name].dur) || 4000);
      }

      /** Show a bubble for ~5s; replaces any pending bubble.
          type: "normal" | "greet" | "festival" — different visual styles. */
      function say(text, type) {
        bubble.textContent = text;
        bubble.classList.remove("greet", "festival");
        if (type === "greet") bubble.classList.add("greet");
        else if (type === "festival") bubble.classList.add("festival");
        bubble.classList.add("show");
        if (bubbleTimer !== null) clearTimeout(bubbleTimer);
        bubbleTimer = setTimeout(function () {
          bubble.classList.remove("show", "greet", "festival");
          /* clear the text so nothing flashes through after hiding */
          bubble.textContent = "";
          bubbleTimer = null;
        }, type === "festival" ? 8000 : 5000);
      }

      /**
       * Balance display: normal shows for 12s, warnings for 30s and can be
       * tapped away. Warnings are loud (pulsing gradient) so they are hard
       * to miss. When topup=true a small "去充值" link is appended that opens
       * the official DeepSeek top-up page in a new tab (free, zero tokens).
       */
      function showBalanceBubble(text, warn, topup) {
        bubble.classList.remove("greet", "festival");
        bubble.textContent = "";
        var span = document.createElement("span");
        span.textContent = text;
        bubble.appendChild(span);
        if (topup) {
          var link = document.createElement("a");
          link.className = "pet-bubble-topup";
          link.href = TOPUP_URL;
          link.target = "_blank";
          link.rel = "noopener";
          link.textContent = "去充值 ↗";
          /* don't let the click bubble up to the bubble's tap-to-dismiss */
          link.addEventListener("click", function (ev) {
            ev.stopPropagation();
          });
          bubble.appendChild(link);
        }
        bubble.classList.toggle("warn", !!warn);
        bubble.classList.add("show");
        if (bubbleTimer !== null) clearTimeout(bubbleTimer);
        bubbleTimer = setTimeout(function () {
          bubble.classList.remove("show");
          bubble.classList.remove("warn");
          bubbleTimer = null;
        }, warn ? 30000 : 12000);
      }

      /* tap the warning bubble to dismiss it early */
      bubble.addEventListener("click", function () {
        if (bubble.classList.contains("warn")) {
          bubble.classList.remove("show");
          bubble.classList.remove("warn");
          if (bubbleTimer !== null) {
            clearTimeout(bubbleTimer);
            bubbleTimer = null;
          }
        }
      });

      /** Ask the node half for the balance (it holds the key). */
      function fetchBalance(cb) {
        fetch("/companion-pet/api/balance")
          .then(function (r) {
            return r.json();
          })
          .then(function (d) {
            cb(d);
          })
          .catch(function () {
            cb(null);
          });
      }

      /**
       * Check the balance. With auto=true (periodic) a healthy balance stays
       * silent; only a drop into a lower warning tier (<5, <3, <1) alerts.
       * After a top-up above 5 the tier resets so the next drop warns again.
       *
       * Polling is balance-adaptive: the balance API is free (zero tokens),
       * so we simply check more often when the balance is low — 30 min when
       * healthy, 5 min under 5, every minute under 1.
       */
      /* official DeepSeek open-platform top-up page (opens in a new tab) */
      var TOPUP_URL = "https://platform.deepseek.com/top_up";
      var BAL_INTERVAL_OK = 30 * 60 * 1000; /* >= 20 元 */
      var BAL_INTERVAL_MID = 15 * 60 * 1000; /* 5 ~ 20 元 */
      var BAL_INTERVAL_LOW = 3 * 60 * 1000; /* 1 ~ 5 元 */
      var BAL_INTERVAL_CRIT = 45 * 1000; /* < 1 元 */
      var BAL_INTERVAL_ERR = 10 * 60 * 1000; /* 查询失败 */
      /* how often to RE-alert while stuck in a low tier */
      var BAL_REPEAT_5 = 15 * 60 * 1000; /* <5 元: 每 15 分钟再提醒 */
      var BAL_REPEAT_3 = 20 * 60 * 1000; /* <3 元: 每 20 分钟 */
      var BAL_REPEAT_1 = 10 * 60 * 1000; /* <1 元: 每 10 分钟 */
      var balCheckTimer = null;

      function balWarnLevel() {
        var v = parseFloat(localStorage.getItem(KEYS.balwarn));
        /* default 6 = "never warned": lets the <5 tier fire the first time */
        return isNaN(v) ? 6 : v;
      }
      function setBalWarnLevel(v) {
        try {
          localStorage.setItem(KEYS.balwarn, String(v));
        } catch (_) {}
      }
      function balWarnAt() {
        var v = parseInt(localStorage.getItem(KEYS.balwarnAt), 10);
        return isNaN(v) ? 0 : v;
      }
      function setBalWarnAt(t) {
        try {
          localStorage.setItem(KEYS.balwarnAt, String(t));
        } catch (_) {}
      }
      function scheduleNextBalance(ms) {
        if (balCheckTimer !== null) clearTimeout(balCheckTimer);
        balCheckTimer = setTimeout(function () {
          checkBalance(true, scheduleNextBalance);
        }, ms);
      }
      /**
       * Official spend bookkeeping: each successful balance read snapshots
       * {date, total}; the drop since the last snapshot on a previous day is
       * the real spend for that day (DeepSeek's own accounting).
       */
      function recordBalanceCost(total) {
        try {
          var today = todayStr();
          var snap = JSON.parse(localStorage.getItem(KEYS.balSnap) || "null");
          if (snap && snap.date && snap.date !== today && typeof snap.total === "number") {
            var diff = snap.total - total;
            if (diff > 0.001) {
              var d = readDaily();
              d[snap.date] = d[snap.date] || { s: 0, t: 0, k: 0 };
              d[snap.date].bcost = Math.round(diff * 100) / 100;
              writeDaily(d);
            }
          }
          localStorage.setItem(KEYS.balSnap, JSON.stringify({ date: today, total: total }));
        } catch (_) {}
      }
      function checkBalance(auto, after) {
        var next = BAL_INTERVAL_ERR;
        fetchBalance(function (d) {
          if (!d || !d.ok) {
            if (!auto) showBalanceBubble("💰 余额查询失败，稍后再试", false);
          } else {
            var t = parseFloat(d.total);
            var txt = "💰 余额 ¥" + d.total + (d.currency ? " " + d.currency : "");
            /* official-cost bookkeeping: the balance drop since the last
               snapshot IS the real spend (DeepSeek's own accounting) */
            if (!isNaN(t)) recordBalanceCost(t);
            if (isNaN(t)) {
              if (!auto) showBalanceBubble(txt, false);
            } else {
              next =
                t >= 20
                  ? BAL_INTERVAL_OK
                  : t >= 5
                    ? BAL_INTERVAL_MID
                    : t < 1
                      ? BAL_INTERVAL_CRIT
                      : BAL_INTERVAL_LOW;
              var last = balWarnLevel();
              if (t >= 5) {
                setBalWarnLevel(6);
                setBalWarnAt(0);
                if (!auto) showBalanceBubble(txt, false, true);
              } else {
                var tier = t < 1 ? 1 : t < 3 ? 3 : 5;
                var now = Date.now();
                var repeatMs = tier === 1 ? BAL_REPEAT_1 : tier === 3 ? BAL_REPEAT_3 : BAL_REPEAT_5;
                /* alert on a fresh drop into the tier, then RE-alert at the
                   tier's repeat interval while the balance stays low */
                if (last > tier || now - balWarnAt() > repeatMs) {
                  setBalWarnLevel(tier);
                  setBalWarnAt(now);
                  var msg =
                    tier === 1
                      ? "⚠️ 余额只剩 ¥" + d.total + "，快给小猫加餐啦！"
                      : tier === 3
                        ? "⚠️ 余额只剩 ¥" + d.total + "，要留意哦！"
                        : "⚠️ 余额只剩 ¥" + d.total + "，有点紧张啦！";
                  showBalanceBubble(msg, true, true);
                  transientAction("sad");
                } else if (!auto) {
                  showBalanceBubble(txt, false, true);
                }
              }
            }
          }
          if (after) after(next);
        });
      }

      /** Pick a random entry from an array. */
      function pick(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
      }

      /**
       * Tiny alarm chime generated with Web Audio — two soft "ding-dong"
       * notes, no audio files, no network, zero tokens. Browsers require a
       * user gesture before audio; we resume the context lazily on ring.
       */
      var chimeCtx = null;
      function playChime() {
        try {
          var AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return;
          if (!chimeCtx) chimeCtx = new AC();
          if (chimeCtx.state === "suspended") chimeCtx.resume();
          var t0 = chimeCtx.currentTime;
          /* three "ding-dong" pairs — an alarm should be heard, not missed */
          var seq = [
            { f: 880, at: 0, dur: 0.18 },
            { f: 660, at: 0.2, dur: 0.3 },
            { f: 880, at: 0.62, dur: 0.18 },
            { f: 660, at: 0.82, dur: 0.3 },
            { f: 880, at: 1.24, dur: 0.18 },
            { f: 660, at: 1.44, dur: 0.42 },
          ];
          seq.forEach(function (n) {
            var osc = chimeCtx.createOscillator();
            var gain = chimeCtx.createGain();
            osc.type = "sine";
            osc.frequency.value = n.f;
            gain.gain.setValueAtTime(0.0001, t0 + n.at);
            gain.gain.exponentialRampToValueAtTime(0.25, t0 + n.at + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, t0 + n.at + n.dur);
            osc.connect(gain);
            gain.connect(chimeCtx.destination);
            osc.start(t0 + n.at);
            osc.stop(t0 + n.at + n.dur + 0.05);
          });
        } catch (_) {}
      }

      /** Late-night reminder, at most once per calendar day. */
      function checkLateNight() {
        if (readConfig().lateRemind && isLateNight() && !alreadyReminded()) {
          markReminded();
          say(pickLateBubble());
          transientAction("sleep");
          maybeAgent("late");
        }
      }

      /* ---- alarms + sit-break reminders (all local, zero tokens) ---- */
      var pageStart = Date.now();
      function pad2(n) {
        return n < 10 ? "0" + n : "" + n;
      }
      function todayStr() {
        var d = new Date();
        return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
      }
      /**
       * Festival detection: returns {name, wish} when today is a holiday.
       * Fixed solar dates (元旦/劳动/国庆) are computed; lunar festivals
       * (春节/端午/中秋/重阳…) use a small per-year table — add new years
       * here or extend the fallback wish.
       */
      function festivalOf() {
        var d = new Date();
        var mo = d.getMonth() + 1;
        var da = d.getDate();
        var md = mo * 100 + da;
        /* solar festivals */
        var solar = {
          101: { name: "元旦", wish: "新年快乐！新一年也要元气满满呀~" },
          214: { name: "情人节", wish: "今天有喜欢的人陪着吗？喵喵陪你~" },
          301: { name: "国际海豹日", wish: "今天是小海豹日，喵也来蹭蹭你~" },
          312: { name: "植树节", wish: "植树节快乐，记得给生活浇点水呀~" },
          501: { name: "劳动节", wish: "劳动节快乐！今天辛苦啦，喵摸摸头~" },
          601: { name: "儿童节", wish: "儿童节快乐！不管多大都要开开心心~" },
          1001: { name: "国庆节", wish: "国庆节快乐！和小猫一起为祖国庆生🎉" },
          1225: { name: "圣诞节", wish: "圣诞快乐！喵给你准备了小鱼干~" },
          1231: { name: "跨年夜", wish: "今年最后一天啦，和小猫一起跨年吧~" },
        };
        if (solar[md]) return solar[md];
        /* lunar festivals: date table per festival (lunar month/day) */
        var lunar = {
          /* 春节: 正月初一 */
          "2026-spring": { mo: 1, da: 17, name: "春节", wish: "春节快乐！喵喵给你拜年啦🧧" },
          /* 端午: 五月初五 */
          "2026-dragon": { mo: 5, da: 19, name: "端午节", wish: "端午安康！喵帮你吃掉了粽子~" },
          /* 中秋: 八月十五 */
          "2026-midautumn": { mo: 8, da: 15, name: "中秋节", wish: "中秋快乐！月亮圆圆，喵也想你~" },
        };
        var y = d.getFullYear();
        for (var k in lunar) {
          var lf = lunar[k];
          if (k.indexOf(y) === 0 && lf.mo === mo && lf.da === da) {
            return { name: lf.name, wish: lf.wish };
          }
        }
        return null;
      }
      function readRing() {
        try {
          var r = JSON.parse(localStorage.getItem(KEYS.ring) || "null");
          if (r && r.date) return r;
        } catch (_) {}
        return { date: "", alarms: {}, rest: "" };
      }
      function writeRing(r) {
        try {
          localStorage.setItem(KEYS.ring, JSON.stringify(r));
        } catch (_) {}
      }
      /** Once per minute: ring due alarms, nudge after sitting too long. */
      function checkAlarms() {
        try {
          var cfg = readConfig();
          var now = new Date();
          var hm = pad2(now.getHours()) + ":" + pad2(now.getMinutes());
          var day = todayStr();
          var ring = readRing();
          if (ring.date !== day) ring = { date: day, alarms: {}, rest: "" };
          (cfg.alarms || []).forEach(function (a) {
            if (!a.on || !a.time) return;
            if (a.time === hm && !ring.alarms[a.id]) {
              ring.alarms[a.id] = true;
              say("⏰ " + a.time + " " + (a.name || "闹钟") + "！");
              transientAction("celebrate");
              playChime();
            }
          });
          /* sit-break: based on TODAY's accumulated online time (survives
             refreshes) and repeats each time a full interval passes */
          if (cfg.restRemind) {
            var todaySecs = (readDaily()[todayStr()] || {}).s || 0;
            var iv = (cfg.restInterval || 45) * 60;
            var mark = Math.floor(todaySecs / iv);
            var lastMark = ring.rest === "" ? -1 : parseInt(ring.rest, 10);
            if (isNaN(lastMark)) lastMark = -1;
            if (mark >= 1 && mark > lastMark) {
              ring.rest = String(mark);
              say("坐了好一会儿啦，起来伸个懒腰吧~ 🧘");
              transientAction("stretch");
            }
          }
          writeRing(ring);
        } catch (_) {}
      }

      /* ---- daily stats: online time + chat turns + tokens ----
         Stored per calendar day in `dsh-companion-cat:daily` so the 7-day
         panel can be rendered. Legacy single-day keys are migrated once. */
      var lastStatsSave = Date.now();
      var lastTokenBuckets = null;
      /* turn counting uses SNAPSHOT PEAKS, not per-row events: DSH rebuilds
         and edits message rows (pending → done), so any event-based counter
         double-counts. We instead track the peak number of user rows seen
         today — rebuilds/edits/refreshes can never inflate it. */
      var turnPeak = null;
      function readDaily() {
        try {
          var d = JSON.parse(localStorage.getItem(KEYS.daily) || "null");
          if (d && typeof d === "object") return d;
        } catch (_) {}
        return {};
      }
      function writeDaily(d) {
        try {
          localStorage.setItem(KEYS.daily, JSON.stringify(d));
        } catch (_) {}
      }
      function pruneDaily(d) {
        var cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 30);
        var c =
          cutoff.getFullYear() +
          "-" +
          pad2(cutoff.getMonth() + 1) +
          "-" +
          pad2(cutoff.getDate());
        Object.keys(d).forEach(function (k) {
          if (k < c) delete d[k];
        });
      }
      function yesterdayStr() {
        var d = new Date();
        d.setDate(d.getDate() - 1);
        return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
      }
      /** One-time migration from the old single-day keys into daily. */
      function migrateDaily() {
        try {
          if (localStorage.getItem(KEYS.daily + "-migrated")) return;
          var d = readDaily();
          var s = JSON.parse(localStorage.getItem(KEYS.stats) || "null");
          var y = JSON.parse(localStorage.getItem(KEYS.statsLast) || "null");
          [s, y].forEach(function (src) {
            if (src && src.date) {
              d[src.date] = d[src.date] || { s: 0, t: 0, k: 0 };
              d[src.date].s += src.seconds || 0;
              /* only carry turns counted with dedupe (v2+) */
              if (src.v === 2) d[src.date].t += src.turns || 0;
            }
          });
          pruneDaily(d);
          writeDaily(d);
          localStorage.setItem(KEYS.daily + "-migrated", "1");
        } catch (_) {}
      }
      function readStats() {
        migrateDaily();
        var d = readDaily();
        var t = todayStr();
        /* display-time safety: today's active time can never exceed the
           seconds elapsed since 0:00 (guards against legacy pollution or a
           broken midnight split that already landed in storage) */
        var r = d[t] || { s: 0, t: 0, k: 0 };
        if (r.s) {
          var dayStart = new Date();
          dayStart.setHours(0, 0, 0, 0);
          var maxToday = Math.floor((Date.now() - dayStart.getTime()) / 1000);
          if (r.s > maxToday) {
            r.s = maxToday;
            d[t].s = maxToday;
            writeDaily(d);
          }
        }
        return { date: t, seconds: r.s, turns: r.t, tokens: r.k };
      }
      function writeStats(s) {
        var d = readDaily();
        var t = todayStr();
        var cur = d[t] || { s: 0, t: 0, k: 0, i: 0, o: 0, r: 0, w: 0 };
        d[t] = {
          s: s && typeof s.seconds === "number" ? s.seconds : cur.s,
          t: s && typeof s.turns === "number" ? s.turns : cur.t,
          k: cur.k || 0,
          i: cur.i || 0,
          o: cur.o || 0,
          r: cur.r || 0,
          w: cur.w || 0,
        };
        pruneDaily(d);
        writeDaily(d);
      }
      function fmtDur(sec) {
        sec = Math.max(0, Math.floor(sec || 0));
        if (sec < 60) return "不到 1 分钟";
        var h = Math.floor(sec / 3600);
        var m = Math.floor((sec % 3600) / 60);
        return h > 0 ? h + " 小时 " + m + " 分" : m + " 分钟";
      }
      function fmtK(n) {
        n = Math.max(0, Math.floor(n || 0));
        if (n >= 1000000) return (n / 1000000).toFixed(2) + "M";
        if (n >= 1000) return (n / 1000).toFixed(1) + "K";
        return String(n);
      }
      /** Greet with yesterday's summary, once per day (on open). */
      function todayStats() {
        migrateDaily();
        try {
          if (localStorage.getItem(KEYS.statsReported) !== todayStr()) {
            localStorage.setItem(KEYS.statsReported, todayStr());
            var r = readDaily()[yesterdayStr()] || null;
            if (r && (r.s > 0 || r.t > 0)) {
              say("昨天陪你 " + fmtDur(r.s) + "，聊了 " + r.t + " 轮喵~", "greet");
            }
          }
        } catch (_) {}
        return readStats();
      }
      /* "online time" = ACTIVE time: the tab must be in the foreground AND
         you must be interacting (mouse/key/touch/scroll). Idle for 2 minutes
         pauses the clock; browsing other windows never counts. */
      var statsRunning = true;
      var lastActivity = Date.now();
      var IDLE_TIMEOUT = 2 * 60 * 1000;
      function pokeActivity() {
        lastActivity = Date.now();
      }
      try {
        document.addEventListener("mousemove", pokeActivity, { passive: true });
        document.addEventListener("mousedown", pokeActivity, { passive: true });
        document.addEventListener("keydown", pokeActivity, { passive: true });
        document.addEventListener("scroll", pokeActivity, { passive: true });
        document.addEventListener("touchstart", pokeActivity, { passive: true });
      } catch (_) {}
      /** Silent accumulation of active time (heartbeat + page hide).
       * Midnights are split: time before 00:00 goes to yesterday, the rest
       * to today, so an overnight tab never bleeds into "today".
       * The today portion is CLAMPED to delta — a stale prev (long idle /
       * frozen tab) can never dump hours into today in one shot. */
      function tickStats() {
        try {
          if (!statsRunning) return;
          var now = Date.now();
          var prev = lastStatsSave;
          var delta = Math.max(0, Math.floor((now - prev) / 1000));
          lastStatsSave = now;
          if (delta <= 0) return;
          /* idle too long? this whole stretch is not "usage" — drop it */
          if (now - lastActivity > IDLE_TIMEOUT) return;
          var d = readDaily();
          var today = todayStr();
          var dayStart = new Date();
          dayStart.setHours(0, 0, 0, 0);
          var startDay = dateStrOf(prev);
          if (startDay !== today && startDay) {
            /* part before midnight belongs to yesterday */
            var nightSec = Math.max(0, Math.min(delta, Math.floor((dayStart.getTime() - prev) / 1000)));
            if (nightSec > 0) {
              d[startDay] = d[startDay] || { s: 0, t: 0, k: 0 };
              d[startDay].s += nightSec;
            }
            /* the rest (after midnight) belongs to today — NEVER more than
               the total delta */
            var daySec = Math.max(0, delta - nightSec);
            d[today] = d[today] || { s: 0, t: 0, k: 0 };
            d[today].s += daySec;
          } else {
            d[today] = d[today] || { s: 0, t: 0, k: 0 };
            d[today].s += delta;
          }
          /* HARD CEILING: today's active time can never exceed the seconds
             that have actually elapsed today (0:00 → now). Any overflow is
             legacy pollution / a broken midnight split — clamp it away so
             the panel can never show "6 hours at 1:30 AM". */
          var nowSec = Math.floor((now - dayStart.getTime()) / 1000);
          if (d[today].s > nowSec) d[today].s = nowSec;
          pruneDaily(d);
          writeDaily(d);
        } catch (_) {}
      }
      function dateStrOf(ts) {
        var dt = new Date(ts);
        return dt.getFullYear() + "-" + pad2(dt.getMonth() + 1) + "-" + pad2(dt.getDate());
      }
      try {
        document.addEventListener("visibilitychange", function () {
          if (document.hidden) {
            /* going to background: bank the elapsed time, pause the clock */
            tickStats();
            statsRunning = false;
          } else {
            /* back in the foreground: resume from now */
            lastStatsSave = Date.now();
            pokeActivity();
            statsRunning = true;
          }
        });
      } catch (_) {}
      /**
       * Token totals come from the node half (real accumulated usage across
       * live sessions, projection-based). We poll and bank only the increase
       * per bucket into today's record; closing/switching sessions shows a
       * drop which is ignored.
       */
      /* a projection cell builds lazily: the first snapshots can read 0 and
         later "catch up" by the session's full history. Any single poll jump
         above this is treated as that catch-up (re-baseline, don't bank). */
      var TOKEN_JUMP_GUARD = 50 * 1000000;
      function bucketZero(b) {
        return !(
          b.uncachedInputTokens ||
          b.outputTokens ||
          b.cacheReadTokens ||
          b.cacheWriteTokens
        );
      }
      function pollTokens() {
        try {
          fetch("/companion-pet/api/tokens")
            .then(function (r) {
              return r.json();
            })
            .then(function (d) {
              if (!d || !d.ok || !d.buckets) return;
              var b = d.buckets;
              if (lastTokenBuckets === null) {
                /* baseline must wait until the projection has materialized:
                   the first reads can be all-zero (lazy cell), and banking
                   the later catch-up is what created the phantom spend */
                if (bucketZero(b)) return;
                lastTokenBuckets = b;
                return;
              }
              var diff = {
                i: Math.max(0, b.uncachedInputTokens - lastTokenBuckets.uncachedInputTokens),
                o: Math.max(0, b.outputTokens - lastTokenBuckets.outputTokens),
                r: Math.max(0, b.cacheReadTokens - lastTokenBuckets.cacheReadTokens),
                w: Math.max(0, b.cacheWriteTokens - lastTokenBuckets.cacheWriteTokens),
              };
              if (diff.i + diff.o + diff.r + diff.w > TOKEN_JUMP_GUARD) {
                /* projection catch-up, not real usage — re-baseline */
                lastTokenBuckets = b;
                return;
              }
              if (diff.i + diff.o + diff.r + diff.w > 0) {
                var dd = readDaily();
                var t = todayStr();
                dd[t] = dd[t] || { s: 0, t: 0, k: 0, i: 0, o: 0, r: 0, w: 0 };
                dd[t].i = (dd[t].i || 0) + diff.i;
                dd[t].o = (dd[t].o || 0) + diff.o;
                dd[t].r = (dd[t].r || 0) + diff.r;
                dd[t].w = (dd[t].w || 0) + diff.w;
                dd[t].k = (dd[t].k || 0) + diff.i + diff.o + diff.r + diff.w;
                pruneDaily(dd);
                writeDaily(dd);
              }
              lastTokenBuckets = b;
            })
            .catch(function () {});
        } catch (_) {}
      }
      /**
       * One-time cleanup of token buckets polluted by the lazy-projection
       * catch-up bug (e.g. a phantom 634M on one day). Time & turns are
       * accurate and stay; only token buckets are wiped, once.
       */
      function resetTokenHistory() {
        try {
          var key = KEYS.dailyToken;
          if (localStorage.getItem(key)) return;
          localStorage.setItem(key, "1");
          var d = readDaily();
          Object.keys(d).forEach(function (k) {
            if (d[k] && typeof d[k] === "object") {
              d[k].k = 0;
              d[k].i = 0;
              d[k].o = 0;
              d[k].r = 0;
              d[k].w = 0;
            }
          });
          writeDaily(d);
        } catch (_) {}
      }
      /**
       * One-time reset of TODAY's stats: the time-tracking and token fixes
       * landed mid-day, so today's number still carries phantom foreground
       * time and phantom spend from the old logic. Clear them once.
       */
      function resetToday() {
        try {
          var key = KEYS.dailyReset;
          if (localStorage.getItem(key)) return;
          localStorage.setItem(key, "1");
          var d = readDaily();
          var t = todayStr();
          if (d[t]) {
            d[t].s = 0;
            d[t].k = 0;
            d[t].i = 0;
            d[t].o = 0;
            d[t].r = 0;
            d[t].w = 0;
          }
          writeDaily(d);
        } catch (_) {}
      }
      /** Count newly added user message rows, deduped by content fingerprint. */
      /** Snapshot counting: keep today's turns at the peak user-row count. */
      function snapshotTurns() {
        try {
          /* while the user types, bucket any new inputs under today */
          collectUserInputs();
          var s = readStats();
          if (s.date !== todayStr()) return;
          var count = document.querySelectorAll('[class*="userRow"]').length;
          if (count <= 0) return;
          if (turnPeak === null) turnPeak = s.turns;
          if (count > turnPeak) {
            turnPeak = count;
            s.turns = count;
            writeStats(s);
          }
        } catch (_) {}
      }
      /**
       * One-time seed for the day: base today's turns on the rows already on
       * screen, once per day (marker key), so refreshes never double-count.
       */
      function seedTurns() {
        try {
          /* first run of the snapshot method: reset today's count that the
             old per-event counter polluted (e.g. 700+ phantom turns) */
          var snapKey = KEYS.statsSnapshot;
          if (!localStorage.getItem(snapKey)) {
            localStorage.setItem(snapKey, "1");
            var s0 = readStats();
            if (s0.date === todayStr()) {
              s0.turns = document.querySelectorAll('[class*="userRow"]').length;
              writeStats(s0);
            }
          }
          var seedKey = KEYS.statsSeeded;
          if (localStorage.getItem(seedKey) === todayStr()) return;
          localStorage.setItem(seedKey, todayStr());
          var s = readStats();
          if (s.date !== todayStr()) return;
          var count = document.querySelectorAll('[class*="userRow"]').length;
          if (count > s.turns) {
            s.turns = count;
            writeStats(s);
          }
          turnPeak = s.turns;
        } catch (_) {}
      }

      /* ---- 7-day stats panel: opened from the settings' 今日统计 row,
         closes on outside click like the settings panel ---- */
      var statsPanel = null;
      var statsPanelHandler = null;
      function closeStatsPanel() {
        if (statsPanelHandler) {
          document.removeEventListener("mousedown", statsPanelHandler, true);
          statsPanelHandler = null;
        }
        if (statsPanel) {
          statsPanel.remove();
          statsPanel = null;
        }
      }
      function fmtH(sec) {
        sec = Math.max(0, Math.floor(sec || 0));
        var h = sec / 3600;
        if (h < 0.1) return "0h";
        return (Math.round(h * 10) / 10) + "h";
      }
      /* rough spend from token buckets at DeepSeek list prices (¥/M):
         input 2, cache-read 0.5, cache-write 2, output 8 — labeled as an
         estimate since DeepSeek uses dynamic peak/off-peak pricing */
      var PRICE = { input: 2, cacheRead: 0.5, cacheWrite: 2, output: 8 };
      function estCost(tokens) {
        return ((tokens || 0) * 4) / 1000000;
      }
      function dayCost(x) {
        /* official balance-delta when known, else token estimate */
        return typeof x.bcost === "number" ? x.bcost : bucketCost(x);
      }
      function bucketCost(b) {
        b = b || {};
        if (b.i === undefined && b.o === undefined) return estCost(b.k || 0);
        return (
          ((b.i || 0) * PRICE.input +
            (b.r || 0) * PRICE.cacheRead +
            (b.w || 0) * PRICE.cacheWrite +
            (b.o || 0) * PRICE.output) /
          1000000
        );
      }
      function sessionCost(s) {
        return (
          ((s.input || 0) * PRICE.input +
            (s.cacheRead || 0) * PRICE.cacheRead +
            (s.cacheWrite || 0) * PRICE.cacheWrite +
            (s.output || 0) * PRICE.output) /
          1000000
        );
      }
      function fmtCost(y) {
        return y >= 100 ? "¥" + Math.round(y) : "¥" + (Math.round(y * 100) / 100);
      }

      /* ---- "our time" storybook panel: a dated timeline of milestones ---- */
      var memPanel = null;
      var memPanelHandler = null;
      function closeMemoryPanel() {
        if (memPanelHandler) {
          document.removeEventListener("mousedown", memPanelHandler, true);
          memPanelHandler = null;
        }
        if (memPanel) {
          memPanel.remove();
          memPanel = null;
        }
      }
      function mpRowHtml(it) {
        return (
          '<div class="mp-item"><span class="mp-icon">' +
          it.icon +
          '</span><div class="mp-body"><div class="mp-date">' +
          it.date +
          '</div><div class="mp-title">' +
          it.title +
          (it.text ? '<div class="mp-text">' + it.text + "</div>" : "") +
          "</div></div></div>"
        );
      }
      function mpListHtml(rows, emptyText) {
        return rows.length === 0
          ? '<div class="mp-empty">' + emptyText + "</div>"
          : rows.map(mpRowHtml).join("");
      }
      /** Timeline view: first-meeting + milestones + work sessions only. */
      function buildTimelineRows(m) {
        var items = [];
        if (m) {
          items.push({
            date: m.firstMet.date,
            icon: "🌱",
            title: "第一次相遇",
            text: "那天你挑选了很久，最后把我选中了。从那天起，我就陪你一起工作啦。",
          });
          (m.milestones || []).forEach(function (x) {
            items.push({ date: x.date, icon: x.icon || "⭐", title: x.text, text: "" });
          });
          items.sort(function (a, b) {
            return a.date < b.date ? 1 : -1;
          });
        }
        return items;
      }
      function openMemoryPanel() {
        if (memPanel) {
          closeMemoryPanel();
          return;
        }
        closePanel();
        closeStatsPanel();
        closeNotesPanel();
        var m = readMem();
        var timelineRows = buildTimelineRows(m);
        var catNow = CATS[readConfig().cat] || CATS.orange;
        memPanel = document.createElement("div");
        memPanel.className = "pet-memory-panel";
        memPanel.innerHTML =
          '<div class="mp-title-bar"><span>📖 我们的时光</span><span class="mp-title-right">' +
          '<button type="button" class="mp-notes-btn" title="查看记忆">记忆</button>' +
          '<button type="button" class="mp-close" title="关闭">✕</button></span></div>' +
          '<div class="mp-list">' +
          mpListHtml(timelineRows, "还没有故事……选一只小猫，故事就开始了。") +
          "</div>" +
          /* ask-the-cat lives HERE, below the timeline — the paper journal
             upstairs stays purely a record. Questions drift like danmaku
             (barrage) across a few lanes, or type your own below. */
          '<div class="mp-ask"><div class="mp-ask-title">💌 问问' +
          catNow.name +
          "</div>" +
          '<div class="mp-danmaku">' +
          '<button type="button" class="mp-q" data-q="还记得我们第一次见面吗？">还记得我们第一次见面吗？</button>' +
          '<button type="button" class="mp-q" data-q="你觉得我最近怎么样？">你觉得我最近怎么样？</button>' +
          '<button type="button" class="mp-q" data-q="我们一起经历过什么？">我们一起经历过什么？</button>' +
          '<button type="button" class="mp-q" data-q="你最喜欢陪我做什么？">你最喜欢陪我做什么？</button>' +
          '<button type="button" class="mp-q" data-q="如果能对刚遇见你的我说一句话，你会说什么？">如果能对刚遇见你的我说一句话？</button>' +
          '<button type="button" class="mp-q" data-q="你记得我最开心的一天吗？">你记得我最开心的一天吗？</button>' +
          "</div>" +
          '<div class="mp-ask-input"><input type="text" maxlength="60" placeholder="输入你想问的问题…"><span class="mp-count">0/60</span><button type="button">问问它</button></div>' +
          '<div class="mp-answer"></div></div>' +
          '<div class="mp-footer">还有很多故事，等我们慢慢写下去…</div>';
        document.body.appendChild(memPanel);
        memPanel.querySelector(".mp-close").addEventListener("click", closeMemoryPanel);
        memPanel.querySelector(".mp-notes-btn").addEventListener("click", function () {
          closeMemoryPanel();
          openNotesPanel();
        });
        memPanel.querySelectorAll(".mp-q").forEach(function (btn) {
          btn.addEventListener("click", function () {
            askMemoryChat(btn.dataset.q);
          });
        });
        /* custom question input: ask anything you like (≤60 chars) */
        var askInput = memPanel.querySelector(".mp-ask-input input");
        var askBtn = memPanel.querySelector(".mp-ask-input button");
        var askCount = memPanel.querySelector(".mp-count");
        var doAsk = function () {
          var v = askInput && askInput.value.trim();
          if (!v) return;
          askInput.value = "";
          if (askCount) askCount.textContent = "0/60";
          askMemoryChat(v);
        };
        if (askBtn) askBtn.addEventListener("click", doAsk);
        if (askInput) {
          askInput.addEventListener("input", function () {
            if (askCount) askCount.textContent = askInput.value.length + "/60";
          });
          askInput.addEventListener("keydown", function (e) {
            if (e.key === "Enter") doAsk();
          });
        }
        /* static question chips: scattered across 3 lanes, never
           overlapping — each lane is split into segments, one chip per
           segment so same-lane chips can't collide */
        (function () {
          try {
            var stage = memPanel.querySelector(".mp-danmaku");
            if (!stage) return;
            var chips = Array.prototype.slice.call(stage.querySelectorAll(".mp-q"));
            if (!chips.length) return;
            var lanes = 3;
            var laneH = 38;
            stage.style.height = lanes * laneH + "px";
            var groups = [[], [], []];
            chips.forEach(function (chip, i) {
              groups[i % lanes].push(chip);
            });
            var width = stage.offsetWidth || 360;
            groups.forEach(function (group, lane) {
              var n = group.length || 1;
              /* divide the lane into n equal slots; one chip per slot */
              var slot = width / n;
              group.forEach(function (chip, j) {
                chip.style.position = "absolute";
                chip.style.margin = "0";
                chip.style.top = lane * laneH + "px";
                chip.style.left = "auto";
                chip.style.right = "auto";
                var cw = chip.offsetWidth || 160;
                var pad = 8;
                var slotW = slot - cw - pad;
                if (slotW > 0) {
                  chip.style.left = Math.floor(j * slot + pad + Math.random() * slotW) + "px";
                } else {
                  chip.style.left = Math.floor(j * slot + pad) + "px";
                }
              });
            });
          } catch (_) {}
        })();
        var answerEl = memPanel.querySelector(".mp-answer");
        if (!readConfig().deepCompanion) {
          memPanel.querySelectorAll(".mp-q").forEach(function (btn) {
            btn.disabled = true;
          });
          var askInp = memPanel.querySelector(".mp-ask-input input");
          var askBtnEl = memPanel.querySelector(".mp-ask-input button");
          if (askInp) askInp.disabled = true;
          if (askBtnEl) askBtnEl.disabled = true;
          if (answerEl) {
            answerEl.textContent = "打开设置里的「深度陪伴」后，就可以让我回答你啦~";
          }
        }
        memPanelHandler = function (e) {
          if (!memPanel) return;
          if (!e.target || typeof e.target.closest !== "function") return;
          if (e.target.closest(".pet-memory-panel")) return;
          closeMemoryPanel();
        };
        document.addEventListener("mousedown", memPanelHandler, true);
      }

      /* ---- memory envelope: extraction + ask-the-cat + daily memory ---- */
      var notesPanel = null;
      var notesPanelHandler = null;
      function closeNotesPanel() {
        if (notesPanelHandler) {
          document.removeEventListener("mousedown", notesPanelHandler, true);
          notesPanelHandler = null;
        }
        if (notesPanel) {
          notesPanel.remove();
          notesPanel = null;
        }
      }
      function npRowHtml(n, idx) {
        /* one line per memory: "1. 一句话细节". Old entries may carry a
           title — fall back to it, otherwise show the text as-is. */
        var body = n.text || n.title || "";
        return (
          '<div class="np-row" title="' +
          body +
          '"><span class="np-num">' +
          idx +
          '.</span><span class="np-body">' +
          body +
          "</span></div>"
        );
      }
      function openNotesPanel() {
        if (notesPanel) {
          closeNotesPanel();
          return;
        }
        closePanel();
        closeStatsPanel();
        closeMemoryPanel();
        var m = readMem();
        var catNow = CATS[readConfig().cat] || CATS.orange;
        /* group memories by day, compact rows (no icons — plain journal) */
        var groups = {};
        (m ? m.notes || [] : []).forEach(function (n) {
          (groups[n.date] = groups[n.date] || []).push({
            text: n.text || n.title || "",
          });
        });
        var dates = Object.keys(groups).sort().reverse();
        var listHtml =
          dates.length === 0
            ? '<div class="mp-empty" style="position:relative;z-index:1;padding:20px 0">还没有记忆，多聊聊天，猫猫会把值得记住的事记在这里。</div>'
            : dates
                .map(function (d) {
                  var rows = groups[d];
                  return (
                    '<div class="np-day"><div class="np-day-title">' +
                    d +
                    "</div>" +
                    rows
                      .map(function (n, i) {
                        return npRowHtml(n, i + 1);
                      })
                      .join("") +
                    "</div>"
                  );
                })
                .join("");
        notesPanel = document.createElement("div");
        notesPanel.className = "pet-memory-panel journal";
        notesPanel.innerHTML =
          '<div class="j-head"><span>猫猫的记忆</span><button type="button" class="mp-close" title="关闭">✕</button></div>' +
          '<div class="j-viewport"><div class="j-scroll">' +
          /* the kraft-paper journal holds ONLY the memory records */
          '<div class="np-list">' +
          listHtml +
          "</div>" +
          "</div></div>";
        document.body.appendChild(notesPanel);
        notesPanel.querySelector(".mp-close").addEventListener("click", closeNotesPanel);
        notesPanelHandler = function (e) {
          if (!notesPanel) return;
          if (!e.target || typeof e.target.closest !== "function") return;
          if (e.target.closest(".pet-memory-panel")) return;
          closeNotesPanel();
        };
        document.addEventListener("mousedown", notesPanelHandler, true);
      }

      /** Date string N days before today (e.g. dateOffsetStr(365) = 去年同天). */
      function dateOffsetStr(days) {
        var d = new Date();
        d.setDate(d.getDate() - days);
        return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
      }
      /**
       * Pick which memory notes fit the question, so the cat can actually
       * answer time-scoped or "most memorable" questions instead of only
       * ever seeing the newest 4:
       *   - recent keywords  → last 7 days
       *   - first/early      → oldest notes
       *   - "最…/印象/深刻"   → ALL notes (chronological)
       *   - concrete date    → notes near that date
       *   - relative time    → notes near that offset (去年/上个月/前天…)
       *   - otherwise        → newest 4 (current behavior)
       */
      function pickNotesForQuestion(q, notes) {
        if (!notes || !notes.length) return [];
        q = String(q || "");
        if (/最深刻|最难忘|最开心|最难过|最生气|最感动|最喜欢|最讨厌|最怀念|最在意|印象深刻|高光|低谷|一路走来|一路|点点滴滴/.test(q)) {
          return notes; /* whole journal — let the cat pick the highlight */
        }
        var m;
        /* concrete date: 2026-08-24 or 8月24日 */
        if ((m = q.match(/(\d{4})-(\d{1,2})-(\d{1,2})/))) {
          return notesNear(notes, m[1] + "-" + m[2] + "-" + m[3]);
        }
        if ((m = q.match(/(\d{1,2})月(\d{1,2})日/))) {
          var y = new Date().getFullYear();
          return notesNear(notes, y + "-" + m[1] + "-" + m[2]);
        }
        /* relative time: 一年前/去年/上个月/前天/前几天/三个月前… */
        if (/一年前|去年|一周年/.test(q)) return notesNear(notes, dateOffsetStr(365));
        if (/上个月/.test(q)) return notesNear(notes, dateOffsetStr(30));
        if (/前天/.test(q)) return notesNear(notes, dateOffsetStr(2));
        if (/前几天|前几天|这阵子/.test(q)) return notesNear(notes, dateOffsetStr(3));
        if (/最近|今天|昨天|这几天|这周|上周|刚才|刚刚|现在/.test(q)) {
          var week = dateOffsetStr(7);
          return notes.filter(function (n) {
            return n.date >= week;
          });
        }
        if (/第一次|刚认识|当初|一开始|最开始|刚来|初遇|初次/.test(q)) {
          return notes.slice(0, 4); /* oldest notes */
        }
        return notes.slice(-4); /* newest 4 (default) */
      }
      function notesNear(notes, dateStr) {
        /* the target day ± 7 days (memories aren't daily — give slack) */
        var before = dateShift(dateStr, -7);
        var after = dateShift(dateStr, 7);
        return notes.filter(function (n) {
          return n.date >= before && n.date <= after;
        });
      }
      function dateShift(dateStr, days) {
        var p = String(dateStr).split("-");
        var d = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
        d.setDate(d.getDate() + days);
        return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
      }
      /** Bundle the storybook + recent behavior into REAL memory fragments. */
      function packMemory(question) {
        var lines = [];
        var m = readMem();
        if (m) {
          var c = CATS[m.firstMet.cat] || CATS.orange;
          lines.push(
            "第一次相遇（" +
              m.firstMet.date +
              "）：那天主人挑选了很久，最后把我选中了，从那天起我就陪在主人身边一起工作"
          );
          lines.push("我们认识 " + daysSince(m.firstMet.date) + " 天了");
          /* whole-journal questions get ALL milestones, others the latest 5 */
          var wantAll = /最深刻|最难忘|最开心|最难过|最生气|最感动|最喜欢|最讨厌|最怀念|最在意|印象深刻|一路走来|点点滴滴/.test(
            String(question || "")
          );
          var ms = (m.milestones || []).slice();
          if (!wantAll) ms = ms.slice(-5);
          ms.forEach(function (x) {
            lines.push(x.date + "：" + x.text);
          });
        }
        /* recent stats only make sense for recent-ish questions */
        var qRecent = /最近|今天|昨天|这几天|这周|上周|刚才|刚刚|现在|最近怎么样/.test(
          String(question || "")
        );
        if (!question || qRecent) {
          var sec7 = 0;
          var d = readDaily();
          var cutoff = weekAgoStr();
          Object.keys(d).forEach(function (k) {
            if (k >= cutoff) sec7 += (d[k] && d[k].s) || 0;
          });
          if (sec7 > 0) lines.push("最近一周在线约 " + Math.round(sec7 / 3600) + " 小时");
          var p = readProfile();
          if (p.streak >= 3) lines.push("主人已经连续 " + p.streak + " 天来看我了");
          if (p.lateStreak >= 2) lines.push("最近连续 " + p.lateStreak + " 天晚睡");
          var wm = weekMood();
          if (wm.a > 0) lines.push("最近一周主人情绪激动 " + wm.a + " 次");
          if (wm.h > 0) lines.push("最近一周主人开心 " + wm.h + " 次");
          /* active hours: the top 2 hours we've seen the owner this week */
          var ah = p.activeHours || {};
          var topH = Object.keys(ah)
            .map(function (k) {
              return { h: parseInt(k, 10), n: ah[k] };
            })
            .sort(function (a, b) {
              return b.n - a.n;
            })
            .slice(0, 2);
          if (topH.length) {
            lines.push(
              "主人常在这个时段出现：" +
                topH
                  .map(function (x) {
                    return x.h + " 点";
                  })
                  .join("、")
            );
          }
          var wa = weekActivity();
          if (wa.c > 10) lines.push("这周主人摸了我 " + wa.c + " 次");
          if (wa.a > 0) lines.push("这周主人问了我 " + wa.a + " 个问题");
        }
        if (m) {
          var sess = m.sessions || [];
          if (sess.length) {
            lines.push(
              "最近的工作记录：" +
                sess
                  .slice(-5)
                  .map(function (s) {
                    return s.title;
                  })
                  .join("、")
            );
          }
          var notes = m.notes || [];
          var picked = pickNotesForQuestion(question, notes);
          if (picked.length) {
            /* keep the injected bundle small: whole-journal questions get
               the newest 40 + oldest 10 (≈50 entries, well under the node
               side's 4000-char budget); time-scoped picks are already few */
            var whole = /最深刻|最难忘|最开心|最难过|最生气|最感动|最喜欢|最讨厌|最怀念|最在意|印象深刻|一路走来|点点滴滴/.test(
              String(question || "")
            );
            var shown = whole ? picked.slice(-40).concat(picked.slice(0, 10)) : picked;
            lines.push(
              "我记得的一些事：" +
                shown
                  .map(function (n) {
                    return (n.date ? n.date + " " : "") + (n.text || n.title || "");
                  })
                  .join("、")
            );
          }
        }
        return lines.join("\n") || "（暂无记忆，但我们刚刚开始）";
      }
      /** Ask the cat a memory question through the node-half Agent.
          Each Q&A pair is APPENDED to the answer area so you can scroll
          back through the conversation. */
      function askMemoryChat(question) {
        var panel = notesPanel || memPanel;
        var answerEl = panel && panel.querySelector(".mp-answer");
        if (!answerEl) return;
        bumpWeekActivity("ask");
        var key = readConfig().cat;
        var c = CATS[key] || CATS.orange;
        /* the question you just asked, pinned above the pending answer */
        var pair = document.createElement("div");
        pair.className = "mp-pair";
        var qRow = document.createElement("div");
        qRow.className = "mp-qrow";
        qRow.textContent = "你问：" + question;
        pair.appendChild(qRow);
        var aRow = document.createElement("div");
        aRow.className = "mp-arow";
        aRow.textContent = "它想了想……";
        aRow.classList.add("loading");
        pair.appendChild(aRow);
        answerEl.appendChild(pair);
        /* keep the newest at the bottom, scroll into view */
        answerEl.scrollTop = answerEl.scrollHeight;
        fetch("/companion-pet/api/memory-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question: question,
            memory: packMemory(question),
            catName: c.name,
            persona: c.persona || "温暖可爱",
          }),
        })
          .then(function (r) {
            return r.json();
          })
          .then(function (d) {
            aRow.classList.remove("loading");
            if (d && d.ok && d.text) {
              aRow.textContent = "🐾 " + d.text;
            } else if (d && d.gate === "redirect" && d.text) {
              aRow.textContent = "🐾 " + d.text;
            } else if (d && d.error === "budget") {
              aRow.textContent = "它今天说了太多话，明天再问它吧~";
            } else {
              aRow.textContent =
                "它有点走神了，再试一次吧~" +
                (d && (d.detail || d.error) ? "（" + (d.detail || d.error) + "）" : "");
            }
            answerEl.scrollTop = answerEl.scrollHeight;
          })
          .catch(function () {
            aRow.classList.remove("loading");
            aRow.textContent = "它有点走神了，再试一次吧~";
            answerEl.scrollTop = answerEl.scrollHeight;
          });
      }

      function openStatsPanel() {
        if (statsPanel) {
          closeStatsPanel();
          return;
        }
        closePanel();
        var d = readDaily();
        var days = [];
        for (var i = 6; i >= 0; i--) {
          var dt = new Date();
          dt.setDate(dt.getDate() - i);
          var key =
            dt.getFullYear() + "-" + pad2(dt.getMonth() + 1) + "-" + pad2(dt.getDate());
          var r = d[key] || { s: 0, t: 0, k: 0 };
          var label =
            i === 0 ? "今天" : i === 1 ? "昨天" : dt.getMonth() + 1 + "/" + dt.getDate();
          days.push({ label: label, s: r.s, t: r.t, k: r.k });
        }
        var tot = { s: 0, t: 0, k: 0 };
        days.forEach(function (x) {
          tot.s += x.s;
          tot.t += x.t;
          tot.k += x.k;
        });
        var totCost = 0;
        days.forEach(function (x) {
          totCost += dayCost(x);
        });
        /* --- bar chart with value labels (value / bar track / date) --- */
        function barChart(vals, fmt) {
          var maxV = 1;
          vals.forEach(function (x) {
            if (x > maxV) maxV = x;
          });
          var any = vals.some(function (x) {
            return x > 0;
          });
          if (!any) return '<div class="sp-empty">暂无数据</div>';
          return (
            '<div class="sp-bars">' +
            vals
              .map(function (v, idx) {
                var h = Math.round((v / maxV) * 100);
                return (
                  '<div class="sp-bar-col" title="' +
                  days[idx].label +
                  " " +
                  fmt(v) +
                  '"><div class="sp-bar-val">' +
                  (v > 0 ? fmt(v) : "") +
                  '</div><div class="sp-bar-track"><div class="sp-bar" style="height:' +
                  h +
                  '%"></div></div><div class="sp-bar-label">' +
                  days[idx].label +
                  "</div></div>"
                );
              })
              .join("") +
            "</div>"
          );
        }
        /* --- line chart with HTML value overlays (never stretched) --- */
        function lineChart(vals, fmt) {
          var maxV = 1;
          vals.forEach(function (x) {
            if (x > maxV) maxV = x;
          });
          var any = vals.some(function (x) {
            return x > 0;
          });
          if (!any) return '<div class="sp-empty">暂无数据</div>';
          var pts = vals
            .map(function (v, idx) {
              return idx * 46 + 8 + "," + (82 - Math.round((v / maxV) * 60));
            })
            .join(" ");
          var marks = vals
            .map(function (v, idx) {
              var xp = ((idx * 46 + 8) / 300) * 100;
              var yp = ((82 - Math.round((v / maxV) * 60)) / 96) * 100;
              return (
                '<span class="sp-line-val" style="left:' +
                xp.toFixed(2) +
                "%;top:" +
                (yp - 10).toFixed(2) +
                '%">' +
                (v > 0 ? fmt(v) : "") +
                "</span>"
              );
            })
            .join("");
          return (
            '<div class="sp-line-wrap">' +
            '<svg class="sp-line" viewBox="0 0 300 96" preserveAspectRatio="none">' +
            '<polyline points="' +
            pts +
            '" fill="none" stroke="#e0a52f" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>' +
            vals
              .map(function (v, idx) {
                return (
                  '<circle cx="' +
                  (idx * 46 + 8) +
                  '" cy="' +
                  (82 - Math.round((v / maxV) * 60)) +
                  '" r="3" fill="#c2b280"/>'
                );
              })
              .join("") +
            "</svg>" +
            marks +
            "</div>"
          );
        }
        /* daily arrays: cost, tokens, seconds, turns */
        var costArr = days.map(function (x) {
          return Math.round(dayCost(x) * 100) / 100;
        });
        var tokenArr = days.map(function (x) {
          return x.k;
        });
        var secArr = days.map(function (x) {
          return x.s;
        });
        var turnArr = days.map(function (x) {
          return x.t;
        });
        statsPanel = document.createElement("div");
        statsPanel.className = "pet-stats-panel";
        statsPanel.innerHTML =
          '<div class="sp-title"><span>📈 近 7 天统计</span>' +
          '<span class="sp-kpis"><i>总时长 <b>' +
          fmtH(tot.s) +
          "</b></i><i>总轮数 <b>" +
          tot.t +
          "</b></i><i>总Token <b>" +
          fmtK(tot.k) +
          "</b></i><i>总花费 <b>" +
          fmtCost(totCost) +
          "</b></i></span>" +
          '<button type="button" class="sp-close" title="关闭">✕</button></div>' +
          '<div class="sp-grid">' +
          '<div class="sp-card"><div class="sp-chart-title">💰 每日花费（估算）</div>' +
          barChart(costArr, fmtCost) +
          "</div>" +
          '<div class="sp-card"><div class="sp-chart-title">🎫 每日 Token</div>' +
          lineChart(tokenArr, fmtK) +
          "</div>" +
          '<div class="sp-card"><div class="sp-chart-title">🕐 每日时长</div>' +
          barChart(secArr, function (v) {
            return fmtH(v);
          }) +
          "</div>" +
          '<div class="sp-card"><div class="sp-chart-title">💬 每日轮数</div>' +
          lineChart(turnArr, function (v) {
            return String(v);
          }) +
          "</div></div>" +
          '<div class="sp-card sp-sessions"><div class="sp-chart-title">💰 会话花费排行</div>' +
          '<div class="sp-session-list">加载中…</div></div>' +
          '<div class="sp-note">花费按 token × ¥4/百万估算，实际随 DeepSeek 峰谷/周末定价浮动 · Token 需重启 web 后生效</div>';
        document.body.appendChild(statsPanel);
        statsPanel.querySelector(".sp-close").addEventListener("click", closeStatsPanel);
        /* load the per-session spend ranking */
        (function loadSessions() {
          var list = statsPanel.querySelector(".sp-session-list");
          if (!list) return;
          fetch("/companion-pet/api/sessions")
            .then(function (r) {
              return r.json();
            })
            .then(function (d) {
              if (!d || !d.ok || !Array.isArray(d.sessions)) {
                list.textContent =
                  d && d.detail
                    ? "会话数据不可用：" + d.detail
                    : "暂无数据（需重启 web 后生效）";
                return;
              }
              var rows = d.sessions.slice(0, 6);
              if (rows.length === 0) {
                list.textContent =
                  d.failed > 0
                    ? "统计失败 " + d.failed + " 个会话"
                    : "暂无会话";
                return;
              }
              var html = rows
                .map(function (s) {
                  var name = s.title || s.id || "会话";
                  var detail =
                    "输入 " +
                    fmtK(s.input) +
                    " · 输出 " +
                    fmtK(s.output) +
                    " · 缓存读 " +
                    fmtK(s.cacheRead) +
                    " · 缓存写 " +
                    fmtK(s.cacheWrite);
                  return (
                    '<div class="sp-session-item" title="' +
                    name +
                    "（" +
                    detail +
                    ')"><span class="ss-name">' +
                    name +
                    '</span><span class="ss-tok">' +
                    fmtK(s.tokens) +
                    '</span><span class="ss-cost">' +
                    fmtCost(sessionCost(s)) +
                    "</span></div>"
                  );
                })
                .join("");
              if (d.sessions.length > rows.length) {
                html +=
                  '<div class="sp-session-more">…共 ' +
                  d.sessions.length +
                  " 个会话</div>";
              }
              list.innerHTML = html;
            })
            .catch(function () {
              list.textContent = "加载失败";
            });
        })();
        statsPanelHandler = function (e) {
          if (!statsPanel) return;
          if (!e.target || typeof e.target.closest !== "function") return;
          if (e.target.closest(".pet-stats-panel")) return;
          closeStatsPanel();
        };
        document.addEventListener("mousedown", statsPanelHandler, true);
      }

      /* ---- local memory: a tiny behavioral profile (zero tokens) ----
         We only record statistics — last seen date, late-night streak,
         mood counts per day — never message contents. Rules turn the
         profile into personalized replies when 智能陪伴 is on. */
      function readProfile() {
        try {
          var p = JSON.parse(localStorage.getItem(KEYS.profile) || "null");
          if (p && p.lastSeen) return p;
        } catch (_) {}
        return { lastSeen: "", lateStreak: 0, mood: {} };
      }
      function writeProfile(p) {
        try {
          localStorage.setItem(KEYS.profile, JSON.stringify(p));
        } catch (_) {}
      }
      function daysSince(dateStr) {
        try {
          var t = new Date(dateStr + "T00:00:00");
          var n = new Date(todayStr() + "T00:00:00");
          return Math.max(0, Math.round((n - t) / 86400000));
        } catch (_) {
          return 0;
        }
      }
      function weekAgoStr() {
        var d = new Date();
        d.setDate(d.getDate() - 7);
        return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
      }

      /* ---- "our time" memory: a tiny storybook (zero tokens) ----
         Facts live in localStorage; the Agent only ever reads injected
         fragments, so it can never invent dates/events. */
      function readMem() {
        try {
          var m = JSON.parse(localStorage.getItem(KEYS.memory) || "null");
          if (m && m.firstMet) return m;
        } catch (_) {}
        return null;
      }
      function writeMem(m) {
        try {
          localStorage.setItem(KEYS.memory, JSON.stringify(m));
        } catch (_) {}
      }
      /** First time a cat is confirmed: record the 🌱 first-meeting event. */
      function recordFirstMet(catKey) {
        try {
          if (readMem()) return;
          var m = {
            firstMet: { date: todayStr(), cat: catKey },
            milestones: [],
            sessions: [],
            recorded: {},
          };
          writeMem(m);
          var c = CATS[catKey] || CATS.orange;
          say("你好呀，我是" + c.name + "，以后陪你一起工作~");
        } catch (_) {}
      }
      /**
       * Sync DSH session titles into the memory as "work sessions" — the
       * title is the AI's own summary of what you worked on (zero tokens,
       * no message contents). Deduped by session id, newest 20 kept.
       */
      function syncSessionsToMemory() {
        try {
          fetch("/companion-pet/api/sessions")
            .then(function (r) {
              return r.json();
            })
            .then(function (d) {
              if (!d || !d.ok || !Array.isArray(d.sessions)) return;
              var m = readMem();
              if (!m) return;
              m.sessions = m.sessions || [];
              var known = {};
              m.sessions.forEach(function (s) {
                known[s.id] = true;
              });
              var today = todayStr();
              d.sessions.forEach(function (s) {
                if (!s.title || known[s.id]) return;
                known[s.id] = true;
                m.sessions.push({ id: s.id, title: s.title.slice(0, 30), date: today });
              });
              m.sessions = m.sessions.slice(-20);
              writeMem(m);
            })
            .catch(function () {});
        } catch (_) {}
      }
      /**
       * 🧠 Memory extraction: collect the user's own inputs that are worth
       * remembering, filtering out code dumps / chatter to save tokens and
       * keep the memories meaningful. Already-extracted inputs are skipped.
       */
      /* inputs bucketed BY DAY: { "2026-08-23": [text…], … } so the next
         open can compress a WHOLE day's input once, dated that day */
      var lastSessionStart = 0; /* when the PREVIOUS session began */
      function readInputsByDay() {
        try {
          return JSON.parse(localStorage.getItem(KEYS.inputsByDay) || "{}") || {};
        } catch (_) {
          return {};
        }
      }
      function writeInputsByDay(map) {
        try {
          localStorage.setItem(KEYS.inputsByDay, JSON.stringify(map));
        } catch (_) {}
      }
      /**
       * Baseline: mark every message already on screen at load as "already
       * seen", so the first collection pass only buckets NEW input (typed
       * this session) — old history from earlier sessions never leaks into
       * today's bucket and gets mis-dated.
       */
      function updateLastBaseline() {
        try {
          var seen = [];
          try {
            seen = JSON.parse(localStorage.getItem(KEYS.extracted) || "[]");
          } catch (_) {}
          var have = {};
          seen.forEach(function (h) {
            have[h] = true;
          });
          document.querySelectorAll('[class*="userRow"]').forEach(function (r) {
            var t = (r.textContent || "").trim().slice(0, 500);
            if (!t) return;
            var h = t.length + ":" + t.slice(0, 40);
            if (!have[h]) {
              have[h] = true;
              seen.push(h);
            }
          });
          localStorage.setItem(KEYS.extracted, JSON.stringify(seen.slice(-500)));
        } catch (_) {}
      }
      function isWorthRemembering(t) {
        if (t.length < 10 || t.length > 500) return false;
        /* code-ish content: fence/braces/declarations too dense → skip */
        var marks =
          (t.match(/```|=>|==|\{|\}|;|function |const |let |import |def |return /g) || [])
            .length;
        if (marks > Math.max(4, Math.round(t.length / 25))) return false;
        return true;
      }
      /**
       * Collect the user's inputs that aren't yet in any day-bucket, and
       * bucket them under today's date. Dedup via a global fingerprint list
       * so the same message is never collected twice (across sessions).
       * Runs on the 30s stats tick (snapshotTurns) while the user types.
       */
      function collectUserInputs() {
        var seen = [];
        try {
          seen = JSON.parse(localStorage.getItem(KEYS.extracted) || "[]");
        } catch (_) {}
        var skip = {};
        seen.forEach(function (h) {
          skip[h] = true;
        });
        /* also skip anything already in today's bucket */
        var map = readInputsByDay();
        var today = todayStr();
        var inToday = {};
        (map[today] || []).forEach(function (t) {
          inToday[t.length + ":" + t.slice(0, 40)] = true;
        });
        var out = [];
        document.querySelectorAll('[class*="userRow"]').forEach(function (r) {
          var t = (r.textContent || "").trim().slice(0, 500);
          if (!isWorthRemembering(t)) return;
          var h = t.length + ":" + t.slice(0, 40);
          if (skip[h] || inToday[h]) return;
          skip[h] = true;
          seen.push(h);
          out.push(t);
        });
        try {
          localStorage.setItem(KEYS.extracted, JSON.stringify(seen.slice(-500)));
        } catch (_) {}
        if (out.length) {
          map[today] = (map[today] || []).concat(out).slice(-60);
          var keys = Object.keys(map).sort();
          while (keys.length > 14) {
            delete map[keys.shift()];
          }
          writeInputsByDay(map);
        }
        return out;
      }
      /**
       * 把某一天的所有输入提炼成记忆（"后一天总结前一天"）。
       * dayStr 是被提炼的那天；提炼出的笔记都标上那天的日期。
       * 提炼完（无论有没有值得记的）就删掉那天的输入桶，所以不会
       * 重复提炼，下次打开自然轮到更早的一天。
       */
      function extractMemoryNow(dayStr, silent) {
        var map = readInputsByDay();
        var target = dayStr || todayStr();
        var inputs = (map[target] || []).slice(0, 60);
        if (!inputs.length) return;
        var timeSpan = "（" + target + " 一整天）";
        fetch("/companion-pet/api/extract-memory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ inputs: inputs, timeSpan: timeSpan }),
        })
          .then(function (r) {
            return r.json();
          })
          .then(function (d) {
            if (d && d.ok && Array.isArray(d.events) && d.events.length) {
              var m = readMem();
              if (!m) return;
              m.notes = m.notes || [];
              /* date the memories with the day they ACTUALLY happened */
              d.events.forEach(function (e) {
                m.notes.push({
                  date: target,
                  text: e.text || "",
                });
              });
              m.notes = m.notes.slice(-500);
              /* 保持旧→新的日期顺序：提炼是从最近一天往回做的，直接 push
                 会变成新→旧，而 pickNotesForQuestion / packMemory 都依赖
                 旧→新（slice(0,4)=最早、"最新 40 + 最早 10"） */
              m.notes.sort(function (a, b) {
                var da = a.date || "";
                var db = b.date || "";
                return da < db ? -1 : da > db ? 1 : 0;
              });
              writeMem(m);
              /* drop the consumed bucket */
              var map2 = readInputsByDay();
              delete map2[target];
              writeInputsByDay(map2);
              say(
                "我都记下来啦：" +
                  d.events
                    .map(function (e) {
                      return e.text;
                    })
                    .join("、")
              );
            } else if (d && d.error === "budget") {
              if (!silent) say("今天提炼得够多啦，明天再记吧~");
            } else if (d && d.error === "empty") {
              /* 模型判定这天没有值得记的事：算处理过了，删掉输入桶，
                 下次打开轮到更早的一天，不会卡住 */
              if (!silent) say("这天没有值得记的事，就不记啦~");
              var map3 = readInputsByDay();
              delete map3[target];
              writeInputsByDay(map3);
            } else if (!silent) {
              /* 提炼失败（网络/模型暂不可用）：保留输入桶，下次打开再试，
                 不丢数据 */
              say("提炼失败了，下次打开再试吧~");
            }
          })
          .catch(function () {
            if (!silent) say("提炼失败了，再试一次吧~");
          });
      }
      /**
       * 自动提炼（下次打开总结上一次使用那天）：深度陪伴开启时，每次
       * 打开页面提炼"今天之前最近一次有输入"的那天，提炼完当天输入桶
       * 即被删掉，所以下次打开自然轮到更早的一天，不会重复也不会卡住。
       */
      function maybeAutoExtract() {
        try {
          if (!readConfig().deepCompanion) return;
          /* 简单的规则：后一天总结前一天。每次打开页面，把"上一次使用
             那天"（今天之前、最晚还有输入的那天）提炼成记忆；提炼完
             那天的输入桶就被清掉了，所以不会重复记。离开几天没开的话，
             就每次打开补提炼一天，直到补完。 */
          var map = readInputsByDay();
          var candidates = Object.keys(map)
            .filter(function (d) {
              return d < todayStr();
            })
            .sort();
          if (!candidates.length) return;
          /* 取最近一次使用的那天（不是最旧的那天） */
          var target = candidates[candidates.length - 1];
          setTimeout(function () {
            extractMemoryNow(target, true);
          }, 12000);
        } catch (_) {}
      }
      /** Check day-count & cumulative-hour milestones once per open. */
      /* one-time cleanup: drop stale trivial memories that the old extractor
         recorded (idea/request fragments like 💡"建议…""想…""担心…"). They
         are thought-process noise, not real memories — keep the journal clean. */
      function cleanTrivialMemories() {
        try {
          if (localStorage.getItem(KEYS.memClean)) return;
          var m = readMem();
          if (!m || !Array.isArray(m.notes)) return;
          var before = m.notes.length;
          m.notes = m.notes.filter(function (n) {
            if (n && n.icon === "💡") return false; /* idea/request category */
            var t = ((n.title || "") + " " + (n.text || "")).trim();
            /* question / doubt / wish fragments — never real memories */
            if (/[？?]/.test(t)) return false; /* ends with a question mark */
            if (/^(建议|能不能|可否|希望|担心|要不要|想把|想加|想弄|想从|觉得|是不是|是否要|该不该)/.test(t)) {
              return false;
            }
            return true;
          });
          if (m.notes.length !== before) {
            writeMem(m);
            localStorage.setItem(KEYS.memClean, "1");
          }
        } catch (_) {}
      }
      function initMemory() {
        try {
          var m = readMem();
          if (!m) {
            /* existing users: seed the first-meeting from today so the
               storybook has a beginning */
            recordFirstMet(readConfig().cat || "orange");
            return;
          }
          cleanTrivialMemories();
          /* 一次性排序安全网：旧版本可能留下倒序 notes（当时从最旧往回
             提炼），而 pickNotesForQuestion / packMemory 依赖旧→新顺序 */
          if (m.notes && m.notes.length > 1) {
            var sorted = m.notes.slice().sort(function (a, b) {
              var da = a.date || "";
              var db = b.date || "";
              return da < db ? -1 : da > db ? 1 : 0;
            });
            if (sorted.some(function (n, i) { return n !== m.notes[i]; })) {
              m.notes = sorted;
              writeMem(m);
            }
          }
          syncSessionsToMemory();
          /* previous session's start time (for the summary's time span);
             then stamp THIS session as the next "previous" */
          lastSessionStart = parseInt(localStorage.getItem(KEYS.lastSessionStart) || "0", 10) || 0;
          localStorage.setItem(KEYS.lastSessionStart, String(Date.now()));
          var today = todayStr();
          var dk = daysSince(m.firstMet.date);
          var told = [];
          var dayThresholds = [
            { days: 7, icon: "🌱", txt: "我们认识 7 天啦" },
            { days: 30, icon: "🌙", txt: "我们认识 30 天啦" },
            { days: 100, icon: "⭐", txt: "我们认识 100 天啦" },
            { days: 365, icon: "🎂", txt: "我们认识一周年啦" },
          ];
          dayThresholds.forEach(function (t) {
            if (dk >= t.days && !m.recorded["d" + t.days]) {
              m.recorded["d" + t.days] = true;
              m.milestones.push({ date: today, icon: t.icon, text: t.txt });
              told.push(t.txt);
            }
          });
          var totalSec = 0;
          var d = readDaily();
          Object.keys(d).forEach(function (k) {
            totalSec += (d[k] && d[k].s) || 0;
          });
          var hours = Math.floor(totalSec / 3600);
          [100, 1000].forEach(function (h) {
            if (hours >= h && !m.recorded["h" + h]) {
              m.recorded["h" + h] = true;
              m.milestones.push({ date: today, icon: "⭐", text: "累计陪伴 " + h + " 小时啦" });
              told.push("累计陪伴 " + h + " 小时啦");
            }
          });
          if (told.length) {
            writeMem(m);
            say(pick(told) + "！" + pick(["喵~", "✨", "和你一起真好"]));
          }
          maybeAutoExtract();
        } catch (_) {}
      }
      /** Call once per page load: track last-seen, late-night streak,
          active-hour histogram, and consecutive-day streak. */
      function updateProfile() {
        var p = readProfile();
        var today = todayStr();
        /* active-hour histogram: cumulative opens per hour, 7-day rolling */
        p.activeHours = p.activeHours || {};
        var hKey = String(new Date().getHours());
        p.activeHours[hKey] = (p.activeHours[hKey] || 0) + 1;
        var cutoff = weekAgoStr();
        /* keep the histogram fresh: decay counts by subtracting the daily
           bucket once a day (simple rolling window) */
        if (p.histDate !== today) {
          p.histDate = today;
          var decay = (p.histDecay || 0) + 1;
          p.histDecay = decay;
          /* every 7 days, halve old counts to keep the window rolling */
          if (decay % 7 === 1) {
            Object.keys(p.activeHours).forEach(function (k) {
              p.activeHours[k] = Math.ceil((p.activeHours[k] || 0) / 2);
            });
          }
        }
        if (p.lastSeen !== today) {
          /* first open of the day: consecutive-day streak (only if we were
             here yesterday too), late-night streak */
          var yday = dateOffsetStr(1);
          p.streak = p.lastSeen === yday ? (p.streak || 0) + 1 : 1;
          p.lateStreak = isLateNight() ? (p.lateStreak || 0) + 1 : 0;
          p.lastSeen = today;
        }
        writeProfile(p);
      }
      /** Record a mood event ("a" angry / "h" happy), keep 7 days. */
      function bumpMood(kind) {
        var p = readProfile();
        p.mood = p.mood || {};
        var d = p.mood[todayStr()] || { a: 0, h: 0 };
        d[kind] = (d[kind] || 0) + 1;
        p.mood[todayStr()] = d;
        var cutoff = weekAgoStr();
        Object.keys(p.mood).forEach(function (k) {
          if (k < cutoff) delete p.mood[k];
        });
        writeProfile(p);
      }
      /** Sum mood counts over the last 7 days. */
      function weekMood() {
        var p = readProfile();
        var cutoff = weekAgoStr();
        var a = 0;
        var h = 0;
        var m = p.mood || {};
        Object.keys(m).forEach(function (k) {
          if (k >= cutoff) {
            a += m[k].a || 0;
            h += m[k].h || 0;
          }
        });
        return { a: a, h: h };
      }
      /** Bump a weekly interaction counter (clicks / memory asks), rolling 7d. */
      function bumpWeekActivity(kind) {
        var p = readProfile();
        p.week = p.week || {};
        var today = todayStr();
        p.week[today] = p.week[today] || { c: 0, a: 0 };
        if (kind === "ask") p.week[today].a = (p.week[today].a || 0) + 1;
        else p.week[today].c = (p.week[today].c || 0) + 1;
        var cutoff = weekAgoStr();
        Object.keys(p.week).forEach(function (k) {
          if (k < cutoff) delete p.week[k];
        });
        writeProfile(p);
      }
      /** Sum weekly clicks / asks over the last 7 days. */
      function weekActivity() {
        var p = readProfile();
        var cutoff = weekAgoStr();
        var c = 0;
        var a = 0;
        var w = p.week || {};
        Object.keys(w).forEach(function (k) {
          if (k >= cutoff) {
            c += w[k].c || 0;
            a += w[k].a || 0;
          }
        });
        return { c: c, a: a };
      }
      function pickGreeting() {
        if (!readConfig().smartCompanion) return pick(GREET_BUBBLES);
        try {
          var p = readProfile();
          var gap = daysSince(p.lastSeen);
          var h = new Date().getHours();
          if (gap >= 3) return "你都 " + gap + " 天没来看我啦，想我了吗喵~";
          if (gap >= 1) return "好久不见！今天也要加油喵~";
          if ((p.streak || 0) >= 7) return "已经连续 " + p.streak + " 天见到你啦，好幸福喵~";
          if (isLateNight()) return "这么晚还没睡呀，注意休息喵";
          if (h < 6) return "夜深了……猫猫陪你";
          if (h < 11) return "早安喵~今天也要元气满满！";
          if (h < 18) return "午安喵，在忙什么呀？";
          return "晚上好喵~";
        } catch (_) {
          return pick(GREET_BUBBLES);
        }
      }
      function pickLateBubble() {
        if (readConfig().smartCompanion && (readProfile().lateStreak || 0) >= 2) {
          return "你最近都熬到这么晚，今晚早点休息好不好喵~";
        }
        return pick(LATE_BUBBLES);
      }
      function pickAngryBubble() {
        if (readConfig().smartCompanion && weekMood().a >= 3) {
          return "最近好像不太顺心呀……摸摸猫猫，气就消一半啦！";
        }
        return pick(ANGRY_BUBBLES);
      }

      /* ---- deep companion agent: ask the node half to generate a
         personalized line via LLM (small token cost, daily-capped).
         Local rules always render first; the AI line upgrades the bubble
         when it arrives. Off unless the user enables 深度陪伴. ---- */
      function askAgent(context) {
        try {
          if (!readConfig().deepCompanion) return Promise.resolve(null);
          var p = readProfile();
          var wa = weekActivity();
          var profile = {
            context: context,
            hour: new Date().getHours(),
            gap: daysSince(p.lastSeen || todayStr()),
            lateStreak: p.lateStreak || 0,
            streak: p.streak || 0,
            mood: weekMood(),
            todaySec: (readDaily()[todayStr()] || {}).s || 0,
            weekClicks: wa.c || 0,
            weekAsks: wa.a || 0,
          };
          var ctrl = new AbortController();
          var timer = setTimeout(function () {
            ctrl.abort();
          }, 6000);
          return fetch("/companion-pet/api/companion-hint", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ profile: profile }),
            signal: ctrl.signal,
          })
            .then(function (r) {
              return r.json();
            })
            .then(function (d) {
              clearTimeout(timer);
              if (d && d.ok && d.text) return { text: d.text, action: d.action || "" };
              return null;
            })
            .catch(function () {
              clearTimeout(timer);
              return null;
            });
        } catch (_) {
          return Promise.resolve(null);
        }
      }
      function maybeAgent(context, opts) {
        opts = opts || {};
        if (!readConfig().deepCompanion) return;
        askAgent(context).then(function (r) {
          if (!r || !r.text) return;
          if (r.action && opts.action !== false) transientAction(r.action);
          say(r.text);
        });
      }

      /**
       * Action picker: single click opens a menu above the kitten so the
       * user can choose which animation to play. Only the current cat's
       * available actions (its gif folder) are listed.
       */
      var MENU_ITEMS = [
        ["happy", "🎉", "开心跳"],
        ["stretch", "🙆", "伸懒腰"],
        ["celebrate", "🙌", "庆祝举手"],
        ["think", "🤔", "歪头思考"],
        ["walk", "🚶", "原地踏步"],
        ["scare", "😱", "惊吓"],
        ["sad", "😿", "失落低头"],
        ["sleep", "😴", "打盹"],
        ["chase", "🌀", "追尾巴"],
        ["nuzzle", "🐾", "蹭手"],
        ["lick", "😋", "舔爪爪"],
        ["roll", "🔄", "打滚卖萌"],
      ];
      function menuItemsForCat() {
        var acts = currentCat.acts || [];
        return MENU_ITEMS.filter(function (it) {
          return acts.indexOf(it[0]) >= 0;
        });
      }
      var menu = null;
      var menuOpen = false;

      function closeMenu() {
        if (!menu) return;
        menu.classList.remove("open");
        menuOpen = false;
      }
      function toggleMenu() {
        if (menuOpen) {
          closeMenu();
          return;
        }
        var items = menuItemsForCat();
        if (!items.length) {
          say("喵~ 我只会发呆啦！");
          return;
        }
        if (!menu) {
          menu = document.createElement("div");
          menu.className = "pet-menu";
          menu.addEventListener("click", function (e) {
            var btn = e.target.closest(".pet-menu-item");
            if (!btn) return;
            transientAction(btn.dataset.action, { user: true });
            if (readConfig().bubbles) say("喵~ 给你表演一个！");
            closeMenu();
          });
          root.appendChild(menu);
        }
        /* rebuild items to match the CURRENT cat's action set */
        menu.innerHTML =
          '<div class="pet-menu-title">✦ 小猫技能</div>' +
          items
            .map(function (it) {
              return (
                '<button type="button" class="pet-menu-item" data-action="' +
                it[0] +
                '"><span class="mi-ico">' +
                it[1] +
                "</span>" +
                it[2] +
                "</button>"
              );
            })
            .join("");
        menu.classList.add("open");
        menuOpen = true;
      }

      /** Click: play the cat's click reaction (if any), else a random skill. */
      function onClick() {
        if (menuOpen) {
          closeMenu();
          return;
        }
        bumpWeekActivity("click");
        var c = CATS[currentCatKey()] || CATS.orange;
        if (c.hasClick) {
          transientAction("click", { user: true });
          if (readConfig().bubbles) say("喵~ 戳我干嘛！");
          return;
        }
        var items = menuItemsForCat();
        var chosen = items.length ? pick(items)[0] : "idle";
        transientAction(chosen, { user: true });
        if (readConfig().bubbles) say(pick(["喵~ 接招！", "看我的技能！", "喵喵拳！", "给你露一手~"]));
      }

      /**
       * Settings popover: opens above the toolbar's ⚙ button. Lets the user
       * tune wallpaper mode (day/night/auto), veil strength, kitten size,
       * and feature toggles. Pure DOM + localStorage — zero tokens.
       */
      var panel = null;
      var panelCloseHandler = null;
      function closePanel() {
        if (panelCloseHandler) {
          document.removeEventListener("mousedown", panelCloseHandler, true);
          panelCloseHandler = null;
        }
        if (panel) {
          panel.remove();
          panel = null;
        }
      }

      /**
       * Cat picker — 3D curved carousel.
       * Cats sit on a radial arc that bulges toward the viewer. Moving the
       * mouse rotates the whole arc (with inertia); the cat nearest the
       * center snaps into place and becomes the selection. The centered cat
       * is largest, haloed, gently floating — like a small VR showcase.
       */
      var wheel = null;
      var wheelMask = null;
      var wheelRaf = null;
      var carousel = null;
      function closeCatWheel() {
        if (wheelRaf) cancelAnimationFrame(wheelRaf);
        wheelRaf = null;
        if (carousel) {
          carousel.stop();
          carousel = null;
        }
        if (wheelMask) {
          wheelMask.remove();
          wheelMask = null;
        }
        if (wheel) {
          wheel.remove();
          wheel = null;
        }
      }

      /* ---- background picker: the same 3D curved carousel, one card per
         wallpaper set (preview = its DAY image). Selection persists in
         config.bgSet; the day/night swap keeps working via wallpaperForNow. */
      var bgWheel = null;
      var bgRaf = null;
      var bgCarousel = null;
      function closeBgWheel() {
        if (bgRaf) cancelAnimationFrame(bgRaf);
        bgRaf = null;
        if (bgCarousel) {
          bgCarousel.stop();
          bgCarousel = null;
        }
        if (bgWheel) {
          bgWheel.remove();
          bgWheel = null;
        }
      }
      function openBgWheel() {
        try {
          if (bgWheel) {
            closeBgWheel();
            return;
          }
          var keys = Object.keys(BACKGROUNDS);
          var startIdx = Math.floor(keys.length / 2);
          bgWheel = document.createElement("div");
          bgWheel.className = "pet-curtain";
          bgWheel.innerHTML =
            '<div class="pet-curtain-title"><span>🏡 选一个背景吧</span>' +
            '<button type="button" class="pet-curtain-random" title="没主意？随机选一个">🎲 随机</button></div>' +
            '<div class="pet-stage bg-stage"><div class="pet-beam"></div>' +
            '<button type="button" class="pet-arrow pet-arrow-l" title="上一个">◀</button>' +
            '<div class="pet-track"></div>' +
            '<button type="button" class="pet-arrow pet-arrow-r" title="下一个">▶</button></div>' +
            '<div class="pet-caption"></div>';
          var track = bgWheel.querySelector(".pet-track");
          if (!track) throw new Error("track missing");
          var pods = [];
          keys.forEach(function (k) {
            var b = BACKGROUNDS[k];
            var pod = document.createElement("div");
            pod.className = "pet-bgpod";
            pod.dataset.bg = k;
            pod.innerHTML =
              '<img class="bg-thumb" src="' +
              b.day +
              '" alt="' +
              b.name +
              '"><div class="pet-bgpod-name">' +
              b.name +
              '</div><span class="pet-pod-badge" title="当前背景">✓</span>';
            track.appendChild(pod);
            pods.push({ key: k, el: pod });
          });
          var STEP = 0.62;
          var SPAN = 340;
          var DEPTH = 170;
          var n = keys.length;
          var selectedKey = readConfig().bgSet || "mushroom";
          if (keys.indexOf(selectedKey) < 0) selectedKey = keys[0];
          var ang = startIdx;
          var target = startIdx;
          var vx = 0;
          var lastMove = Date.now();
          var sel = startIdx;
          var lastSel = -1;
          var running = true;
          var spinActive = false;
          var spinPath = [];
          var spinIdx = 0;
          var spinTo = -1;
          function currentSel() {
            return Math.max(0, Math.min(n - 1, Math.round(ang)));
          }
          function render() {
            for (var i = 0; i < n; i++) {
              var a = (i - ang) * STEP;
              var ca = Math.max(0, Math.cos(a));
              var x = Math.sin(a) * SPAN;
              var z = DEPTH * (1 - ca);
              var sc = (0.7 + 0.3 * Math.pow(ca, 1.15)).toFixed(3);
              if (i === sel) sc = (parseFloat(sc) * 1.15).toFixed(3);
              var op = (0.5 + 0.5 * Math.pow(ca, 1.5)).toFixed(3);
              var pod = pods[i];
              pod.el.style.transform =
                "translateX(" +
                x.toFixed(1) +
                "px) translateZ(" +
                -z.toFixed(1) +
                "px) scale(" +
                sc +
                ")";
              pod.el.style.opacity = op;
              pod.el.classList.toggle("sel", i === sel);
            }
          }
          function tick() {
            if (!running) return;
            vx *= 0.85;
            if (Math.abs(vx) > 0.0002) {
              target += vx;
              if (!spinActive) {
                if (target < 0) {
                  target = 0;
                  vx = 0;
                } else if (target > n - 1) {
                  target = n - 1;
                  vx = 0;
                }
              }
            }
            if (!spinActive && Date.now() - lastMove > 300) {
              var r = Math.round(ang);
              var d = r - ang;
              if (Math.abs(d) > 0.002) target = ang + d * 0.07;
              else target = r;
            }
            if (spinActive) {
              var dd = target - ang;
              if (dd > 0) ang += Math.min(dd, 0.08);
              else ang += Math.max(dd, -0.08);
              if (Math.abs(target - ang) < 0.05) {
                spinIdx++;
                if (spinIdx >= spinPath.length) {
                  spinActive = false;
                  target = spinTo;
                  lastMove = Date.now();
                  applySelection(keys[spinTo]);
                  say("就它啦~ 换成" + BACKGROUNDS[keys[spinTo]].name + "！");
                } else {
                  target = spinPath[spinIdx];
                }
              }
            } else {
              ang += (target - ang) * 0.14;
            }
            if (Math.abs(target - ang) < 0.0008) ang = target;
            sel = currentSel();
            if (sel !== lastSel) {
              lastSel = sel;
              onSelect(sel);
            }
            render();
            bgRaf = requestAnimationFrame(tick);
          }
          function onSelect(idx) {
            var key = keys[idx];
            var cap = bgWheel.querySelector(".pet-caption");
            if (!cap) return;
            cap.innerHTML =
              '<div class="pc-name">' +
              BACKGROUNDS[key].name +
              '</div><div class="pc-bg-desc">白天自动换夜晚</div>' +
              '<button type="button" class="pc-confirm" title="用这个背景">' +
              (key === selectedKey ? "已选 ✓" : "✓ 用它") +
              "</button>";
            var confirm = cap.querySelector(".pc-confirm");
            if (confirm) {
              confirm.disabled = key === selectedKey;
              confirm.addEventListener("click", function () {
                applySelection(key);
              });
            }
            syncArrows();
          }
          function updateBadges() {
            pods.forEach(function (p) {
              var b = p.el.querySelector(".pet-pod-badge");
              if (b) b.style.display = p.key === selectedKey ? "flex" : "none";
            });
          }
          function applySelection(key) {
            if (key === selectedKey) return;
            selectedKey = key;
            var cfg = readConfig();
            cfg.bgSet = key;
            writeConfig(cfg);
            applyWallpaper();
            updateBadges();
            onSelect(keys.indexOf(key));
            say("背景换好啦~ 🏡");
          }
          var arrowL = bgWheel.querySelector(".pet-arrow-l");
          var arrowR = bgWheel.querySelector(".pet-arrow-r");
          function syncArrows() {
            if (arrowL) arrowL.disabled = sel <= 0;
            if (arrowR) arrowR.disabled = sel >= n - 1;
          }
          function stepBy(dir) {
            var next = Math.max(0, Math.min(n - 1, sel + dir));
            if (next === sel) return;
            target = next;
            lastMove = Date.now();
            syncArrows();
          }
          if (arrowL) arrowL.addEventListener("click", function () { stepBy(-1); });
          if (arrowR) arrowR.addEventListener("click", function () { stepBy(1); });
          pods.forEach(function (p) {
            p.el.addEventListener("click", function () {
              var i = keys.indexOf(p.key);
              if (i >= 0) {
                target = i;
                lastMove = Date.now();
              }
            });
          });
          var randBtn = bgWheel.querySelector(".pet-curtain-random");
          if (randBtn) {
            randBtn.addEventListener("click", function () {
              var to = Math.floor(Math.random() * keys.length);
              var path = [];
              [sel, 0, n - 1, 0, to].forEach(function (p) {
                if (path.length === 0 || path[path.length - 1] !== p) path.push(p);
              });
              spinPath = path;
              spinIdx = 0;
              spinActive = path.length > 1;
              spinTo = to;
              target = path[0];
              lastMove = Date.now();
              syncArrows();
            });
          }
          var closeBtn = document.createElement("button");
          closeBtn.type = "button";
          closeBtn.className = "pet-curtain-close";
          closeBtn.title = "关闭";
          closeBtn.textContent = "✕";
          closeBtn.addEventListener("click", function (e) {
            e.stopPropagation();
            closeBgWheel();
          });
          bgWheel.appendChild(closeBtn);
          render();
          root.appendChild(bgWheel);
          bgCarousel = {
            stop: function () {
              running = false;
            },
          };
          onSelect(startIdx);
          updateBadges();
          render();
          bgRaf = requestAnimationFrame(tick);
          console.log("[companion-pet] background carousel mounted, sets=" + pods.length);
        } catch (err) {
          console.error("[companion-pet] openBgWheel failed:", err);
        }
      }
      function openCatWheel() {
        try {
          if (wheel) {
            closeCatWheel();
            return;
          }
          var keys = Object.keys(CATS);
          /* open on a FIXED middle slot every time — the centered cat is not
             necessarily the chosen one; the ✓ badge marks the chosen cat.
             Never inherits the last browsing position */
          var startIdx = Math.floor(keys.length / 2);

          /* build the curtain: title + 3D stage + caption + hint */
          wheel = document.createElement("div");
          wheel.className = "pet-curtain";
          wheel.innerHTML =
            '<div class="pet-curtain-title"><span>✨ 请选择你的小猫 ✨</span>' +
            '<button type="button" class="pet-curtain-random" title="没主意？随机选一只">🎲 随机选一只</button></div>' +
            '<div class="pet-stage"><div class="pet-beam"></div>' +
            '<button type="button" class="pet-arrow pet-arrow-l" title="上一只">◀</button>' +
            '<div class="pet-track"></div>' +
            '<button type="button" class="pet-arrow pet-arrow-r" title="下一只">▶</button></div>' +
            '<div class="pet-caption"></div>';
          var track = wheel.querySelector(".pet-track");
          if (!track) throw new Error("track missing");

          var pods = [];
          keys.forEach(function (k) {
            var c = CATS[k];
            var pod = document.createElement("div");
            pod.className = "pet-pod";
            pod.dataset.cat = k;
            /* same per-cat scale as the live kitten, so every breed reads
               the same size in the carousel too */
            var podScale = c.scale || 1;
            pod.innerHTML =
              '<img src="' +
              c.dir +
              '/idle.gif" alt="' +
              c.name +
              '" style="transform:scale(' +
              podScale +
              ')"><div class="pet-pod-name">' +
              c.name +
              '</div><span class="pet-pod-badge" title="已选择">✓</span>';
            track.appendChild(pod);
            pods.push({ key: k, el: pod });
          });

          /* confetti burst behind a pod (pure CSS, auto-cleans) */
          function burstConfetti(podEl) {
            try {
              if (!podEl) return;
              var colors = ["#f2714f", "#f7c948", "#7ac47a", "#6fa8ff", "#e0a52f", "#c98ae0"];
              var wrap = document.createElement("div");
              wrap.className = "pet-confetti";
              var count = 14;
              for (var i = 0; i < count; i++) {
                var c = document.createElement("i");
                c.style.background = colors[i % colors.length];
                /* fan upward: angles span the upper half (no falling down) */
                var a = Math.PI * (1.1 + (0.8 * i) / (count - 1));
                var dist = 48 + Math.random() * 42;
                c.style.setProperty("--dx", (Math.cos(a) * dist).toFixed(1) + "px");
                c.style.setProperty("--dy", (Math.sin(a) * dist).toFixed(1) + "px");
                c.style.setProperty("--rot", (Math.random() * 360).toFixed(0) + "deg");
                c.style.animationDelay = (Math.random() * 0.15).toFixed(2) + "s";
                wrap.appendChild(c);
              }
              podEl.appendChild(wrap);
              setTimeout(function () {
                if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
              }, 1800);
            } catch (_) {}
          }

          /* arc geometry — a shallow curved row: cats keep EQUAL horizontal
             spacing (linear x) so the outer cats never pile up, while depth
             still follows a cos curve so the row reads as a gentle arc.
             sin-projection was the ghosting culprit: at the arc ends the sin
             slope → 0, so the two outermost cats collapsed into one "echo". */
          var STEP = 0.4; /* radians between neighbors (depth curve only) */
          var XSTEP = 134; /* horizontal px per neighbor (equal spacing) */
          var DEPTH = 200; /* arc depth in px (still flat, faces forward) */
          var TILT = 0; /* rotateY: none — cats stay flat, facing forward */
          /* stage edge math for the edge-fade: half the visible row width
             and half a pod, so pods slip out of view right at the panel
             border instead of flying past it */
          var STAGE_HALF = 430; /* half the usable stage width in px */
          var POD_HALF = 90; /* half a pod (172px wide) + a little margin */
          var n = keys.length; /* cat count (bounds for the carousel) */
          /* the cat the user has actually confirmed; shown with a ✓ badge.
             Browsing (◀ ▶) only previews — selection changes on click. */
          var selectedKey = readConfig().cat || keys[0];
          if (keys.indexOf(selectedKey) < 0) selectedKey = keys[0];
          var ang = startIdx; /* rendered position (float cat index) */
          var target = startIdx; /* goal position, clamped to [0, n-1] */
          var vx = 0; /* inertia velocity */
          var lastMove = Date.now();
          var sel = startIdx;
          var lastSel = -1;
          var running = true;
          /* random-pick celebration: serpentine sweep — left to the first
             cat, right to the last, then left again onto the picked cat */
          var spinActive = false;
          var spinPath = [];
          var spinIdx = 0;
          var spinTo = -1;

          function currentSel() {
            var n2 = keys.length;
            return Math.max(0, Math.min(n2 - 1, Math.round(ang)));
          }

          /* place every pod along the shallow arc for the current angle */
          function render() {
            var n = keys.length;
            for (var i = 0; i < n; i++) {
              var a = (i - ang) * STEP;
              /* clamp cos to ≥0: pow() with a fractional exponent on a
                 negative base is NaN, and a NaN transform makes the pod
                 fall back to its untranslated position (center of stage) —
                 that ghost is what the user saw as "折折的重影" */
              var ca = Math.max(0, Math.cos(a));
              /* linear x keeps equal spacing even at the row's ends — no
                 end-of-arc pile-up / ghosting */
              var x = (i - ang) * XSTEP;
              var z = DEPTH * (1 - ca);
              var sc = (0.66 + 0.34 * Math.pow(ca, 1.15)).toFixed(3);
              /* the centered cat gets an extra pop so selection reads clearly */
              if (i === sel) sc = (parseFloat(sc) * 1.18).toFixed(3);
              var op = (0.45 + 0.55 * Math.pow(Math.max(0, ca), 1.5)).toFixed(3);
              /* fade pods that leave the stage: with a linear row the outer
                 cats would otherwise fly PAST the curtain edge (visible
                 ghost outside the panel). Fade them out near the edge so
                 the row always lives inside the stage. */
              var fade = 1 - Math.max(0, Math.abs(x) - STAGE_HALF + POD_HALF) / POD_HALF;
              fade = Math.max(0, Math.min(1, fade));
              op = (parseFloat(op) * fade).toFixed(3);
              var ry = (-a * 57.2958 * TILT).toFixed(2);
              var pod = pods[i];
              pod.el.style.transform =
                "translateX(" +
                x.toFixed(1) +
                "px) translateZ(" +
                -z.toFixed(1) +
                "px) rotateY(" +
                ry +
                "deg) scale(" +
                sc +
                ")";
              pod.el.style.opacity = op;
              pod.el.style.pointerEvents = fade <= 0 ? "none" : "";
              pod.el.classList.toggle("sel", i === sel);
            }
          }

          /* main loop: inertia, snap-to-center, ease, render */
          function tick() {
            if (!running) return;
            vx *= 0.85;
            if (Math.abs(vx) > 0.0002) {
              target += vx;
              /* hard bounds: first cat left, last cat right — no looping.
                 Skipped while a celebration spin is running. */
              if (!spinActive) {
                if (target < 0) {
                  target = 0;
                  vx = 0;
                } else if (target > n - 1) {
                  target = n - 1;
                  vx = 0;
                }
              }
            }
            /* idle for a while? gently pull the goal onto the nearest cat */
            if (!spinActive && Date.now() - lastMove > 300) {
              var r = Math.round(ang);
              var d = r - ang;
              if (Math.abs(d) > 0.002) target = ang + d * 0.07;
              else target = r;
            }
            /* spin: constant-speed sweep through the path, then ease */
            if (spinActive) {
              var d = target - ang;
              if (d > 0) ang += Math.min(d, 0.08);
              else ang += Math.max(d, -0.08);
              if (Math.abs(target - ang) < 0.05) {
                spinIdx++;
                if (spinIdx >= spinPath.length) {
                  spinActive = false;
                  target = spinTo;
                  lastMove = Date.now();
                  /* celebrate only after the sweep lands: confetti + ✓
                     badge handled inside applySelection (same as manual) */
                  var picked = keys[spinTo];
                  applySelection(picked, "🎲 就它啦，我是" + catDisplayName(picked) + "~");
                } else {
                  target = spinPath[spinIdx];
                }
              }
            } else {
              ang += (target - ang) * 0.14;
            }
            if (Math.abs(target - ang) < 0.0008) ang = target;
            sel = currentSel();
            if (sel !== lastSel) {
              lastSel = sel;
              onSelect(sel);
            }
            render();
            wheelRaf = requestAnimationFrame(tick);
          }

          /* a cat reached center: PREVIEW only — show name + personality.
             The persistent selection only changes via the explicit "选它"
             button, so browsing (◀ ▶ or clicking a cat) never alters it */
          function onSelect(idx) {
            var key = keys[idx];
            var c = CATS[key];
            var cap = wheel.querySelector(".pet-caption");
            if (!cap) return;
            cap.innerHTML =
              '<div class="pc-name">' +
              catDisplayName(key) +
              '<button type="button" class="pc-edit" title="改名">✎</button></div>' +
              '<div class="pc-desc">' +
              (c.desc || "") +
              '</div><button type="button" class="pc-confirm" title="选择这只小猫">' +
              (key === selectedKey ? "已选 ✓" : "✓ 选它") +
              "</button>";
            var edit = cap.querySelector(".pc-edit");
            if (edit) {
              edit.addEventListener("click", function (e) {
                e.stopPropagation();
                showRename(key);
              });
            }
            var confirm = cap.querySelector(".pc-confirm");
            if (confirm) {
              confirm.disabled = key === selectedKey;
              confirm.addEventListener("click", function () {
                applySelection(key, "就选它啦，我是" + catDisplayName(key) + "~");
              });
            }
            syncArrows();
          }

          /* inline rename row (pencil button in the caption) */
          function showRename(key) {
            var old = wheel.querySelector(".pet-rename");
            if (old) old.remove();
            var row = document.createElement("div");
            row.className = "pet-rename";
            row.innerHTML =
              '<input type="text" maxlength="12" value="' +
              catDisplayName(key) +
              '"><button type="button">确定</button>';
            wheel.appendChild(row);
            var inp = row.querySelector("input");
            inp.focus();
            inp.select();
            var done = function () {
              var v = inp.value.trim();
              if (v) setCatName(key, v);
              row.remove();
              var ci = keys.indexOf(key);
              if (ci >= 0) onSelect(ci);
              say("好的，我叫" + catDisplayName(key) + "~");
            };
            row.querySelector("button").addEventListener("click", done);
            inp.addEventListener("keydown", function (e) {
              if (e.key === "Enter") done();
              if (e.key === "Escape") row.remove();
            });
          }

          /* click a cat: spin it to center for a closer look — preview ONLY,
             never changes the confirmed selection */
          pods.forEach(function (p) {
            p.el.addEventListener("click", function () {
              var i = keys.indexOf(p.key);
              if (i >= 0) {
                target = i;
                lastMove = Date.now();
              }
            });
          });
          /* the ✓ badge follows the confirmed cat; the selection only
             changes through the explicit "选它" confirm button */
          function updateBadges() {
            pods.forEach(function (p) {
              var b = p.el.querySelector(".pet-pod-badge");
              if (b) b.style.display = p.key === selectedKey ? "flex" : "none";
            });
          }
          function applySelection(key, msg) {
            var isNew = key !== selectedKey;
            if (isNew) {
              selectedKey = key;
              var cfg = readConfig();
              cfg.cat = key;
              writeConfig(cfg);
              applyCat(key);
              updateBadges();
              recordFirstMet(key);
              onSelect(keys.indexOf(key));
            }
            /* confetti behind the chosen cat — every confirm celebrates,
               even when the random wheel re-picks the same breed */
            var idx = keys.indexOf(key);
            burstConfetti(pods[idx] && pods[idx].el);
            if (msg) say(msg);
          }
          /* left/right step buttons — precise, bounded switching */
          var arrowL = wheel.querySelector(".pet-arrow-l");
          var arrowR = wheel.querySelector(".pet-arrow-r");
          function syncArrows() {
            if (arrowL) arrowL.disabled = sel <= 0;
            if (arrowR) arrowR.disabled = sel >= n - 1;
          }
          function stepBy(dir) {
            var next = Math.max(0, Math.min(n - 1, sel + dir));
            if (next === sel) return;
            target = next;
            lastMove = Date.now();
            syncArrows();
          }
          if (arrowL) arrowL.addEventListener("click", function () { stepBy(-1); });
          if (arrowR) arrowR.addEventListener("click", function () { stepBy(1); });
          /* random pick: serpentine sweep across all cats, settle on the
             pick, confirm it, and burst confetti behind it */
          var randBtn = wheel.querySelector(".pet-curtain-random");
          if (randBtn) {
            randBtn.addEventListener("click", function () {
              var to = Math.floor(Math.random() * keys.length);
              /* path: current → far-left → far-right → far-left → picked
                 (two full sweeps, then settle onto the pick) */
              var path = [];
              [sel, 0, n - 1, 0, to].forEach(function (p) {
                if (path.length === 0 || path[path.length - 1] !== p) path.push(p);
              });
              spinPath = path;
              spinIdx = 0;
              spinActive = path.length > 1;
              spinTo = to;
              target = path[0];
              lastMove = Date.now();
              syncArrows();
              /* selection + badge happen at the end of the sweep (surprise) */
            });
          }
          /* no auto-close: the curtain stays until the user presses ✕ */
          var closeBtn = document.createElement("button");
          closeBtn.type = "button";
          closeBtn.className = "pet-curtain-close";
          closeBtn.title = "关闭";
          closeBtn.textContent = "✕";
          closeBtn.addEventListener("click", function (e) {
            e.stopPropagation();
            closeCatWheel();
          });
          wheel.appendChild(closeBtn);

          if (!document.body) throw new Error("no body");
          /* set final transforms BEFORE the first paint so the cats never
             flash stacked at the origin (that looked like ghosting) */
          render();
          root.appendChild(wheel);
          carousel = {
            stop: function () {
              running = false;
            },
          };
          onSelect(startIdx);
          updateBadges();
          render();
          wheelRaf = requestAnimationFrame(tick);
          console.log("[companion-pet] 3D carousel mounted, cats=" + pods.length);
        } catch (err) {
          console.error("[companion-pet] openCatWheel failed:", err);
          showFatal("carousel: " + err.message);
        }
      }
      function openPanel() {
        if (panel) {
          closePanel();
          return;
        }
        var cfg = readConfig();
        panel = document.createElement("div");
        panel.className = "pet-panel";
        panel.setAttribute("role", "dialog");
        /* warm cream backing in the current kitten's speech-bubble color */
        var pc = CATS[cfg.cat] || CATS.orange;
        panel.style.background = pc.bubble;
        panel.style.color = pc.bubbleText;
        panel.style.borderColor = pc.bubbleBorder;
        panel.innerHTML =
          '<div class="pet-panel-title"><span>🐱 小猫设置</span><button type="button" class="pet-panel-close" title="关闭">✕</button></div>' +
          '<div class="pet-panel-group">📊 今日统计<button type="button" class="ps-days-btn" title="近 7 天统计">📈 近7天</button></div>' +
          '<div class="pet-panel-stats">在线 <b id="ps-dur">—</b> · 对话 <b id="ps-turns">—</b> 轮<span class="ps-last"></span></div>' +
          '<div class="pet-panel-group">请选择你的小猫</div>' +
          catSwitchRow(cfg.cat) +
          '<div class="pet-panel-group">背景壁纸</div>' +
          bgSwitchRow(cfg.bgSet) +
          row("启用背景", "onoff", "bg", cfg.bg) +
          '<div class="pet-panel-group">主题模式</div>' +
          modeRow(cfg.mode) +
          '<div class="pet-panel-group">背景</div>' +
          rangeRow("透明度", "veil", cfg.veil, 0, 100, "%") +
          '<div class="pet-panel-group">小猫</div>' +
          rangeRow("小猫大小", "petSize", cfg.petSize, 80, 220, "px") +
          row("点击气泡", "onoff", "bubbles", cfg.bubbles) +
          '<div class="pet-panel-group">陪伴提醒</div>' +
          row("深夜休息提醒", "onoff", "lateRemind", cfg.lateRemind) +
          row("输入情绪反应", "onoff", "mood", cfg.mood) +
          row("久坐休息提醒", "onoff", "restRemind", cfg.restRemind) +
          rangeRow("休息间隔", "restInterval", cfg.restInterval, 10, 120, "分钟") +
          row("智能陪伴", "onoff", "smartCompanion", cfg.smartCompanion) +
          row("深度陪伴(AI)", "onoff", "deepCompanion", cfg.deepCompanion) +
          '<div class="pet-panel-group">⏰ 闹钟</div>' +
          '<div class="pet-alarm-list"></div>' +
          '<div class="pet-alarm-add"><input type="time" class="pa-time" title="时间"><input type="text" class="pa-name" maxlength="12" placeholder="名称(可选)"><button type="button">添加</button></div>' +
          '<div class="pet-panel-note">设置自动保存</div>';
        /* anchor the panel above the toolbar via fixed positioning, but keep
           it as a child of #companion-pet-root for styling simplicity.
           Measure AFTER mounting (offsetHeight is 0 before render). */
        root.appendChild(panel);
        panel.style.position = "fixed";
        var tb = toolbar;
        if (tb) {
          var tr = tb.getBoundingClientRect();
          panel.style.left = Math.max(8, tr.left + tr.width - 264) + "px";
          panel.style.bottom = "auto";
          panel.style.right = "auto";
          /* defer the top calc one frame so the panel has real height */
          var posTimer = setTimeout(function () {
            var ph = panel.offsetHeight || 360;
            var top = tr.top - ph - 12;
            panel.style.top = Math.max(8, top) + "px";
          }, 0);
          timers.push(posTimer);
        } else {
          panel.style.left = "auto";
          panel.style.right = "16px";
          panel.style.bottom = "110px";
          panel.style.top = "auto";
        }
        panel.querySelector(".pet-panel-close").addEventListener("click", closePanel);
        panel.querySelectorAll("[data-key]").forEach(function (el) {
          el.addEventListener("change", function () {
            var key = el.dataset.key;
            if (key === "bg" || key === "bubbles" || key === "lateRemind" || key === "mood" || key === "restRemind" || key === "smartCompanion" || key === "deepCompanion") {
              cfg[key] = el.checked;
            } else if (key === "veil" || key === "petSize" || key === "restInterval") {
              cfg[key] = parseInt(el.value, 10);
              var out = panel.querySelector('[data-out="' + key + '"]');
              if (out) out.textContent = cfg[key] + (key === "veil" ? "%" : key === "petSize" ? "px" : "分钟");
            } else if (key === "mode") {
              cfg[key] = el.value;
            }
            writeConfig(cfg);
            applyWallpaper();
            if (key === "petSize") applyPetSize(cfg.petSize);
            say("好哒，已经调好啦~");
          });
        });
        /* "请选择你的小猫": open the cat wheel */
        var switchBtns = panel.querySelectorAll(".pet-cat-switch-row");
        if (switchBtns.length) {
          /* first row = cat picker, second row = background picker */
          var catBtn = switchBtns[0];
          catBtn.addEventListener("click", function () {
            closePanel();
            openCatWheel();
          });
          if (switchBtns.length > 1) {
            switchBtns[1].addEventListener("click", function () {
              closePanel();
              openBgWheel();
            });
          }
        }

        /* alarm manager: list + add/toggle/remove, all in localStorage */
        function renderAlarms() {
          var box = panel.querySelector(".pet-alarm-list");
          if (!box) return;
          box.innerHTML = "";
          (cfg.alarms || []).forEach(function (a, i) {
            var item = document.createElement("div");
            item.className = "pet-alarm-item";
            item.innerHTML =
              '<label class="pa-on"><input type="checkbox" data-i="' +
              i +
              '"' +
              (a.on ? " checked" : "") +
              '></label><span class="pa-t">' +
              a.time +
              '</span><span class="pa-n">' +
              (a.name || "") +
              '</span><button type="button" class="pa-del" data-i="' +
              i +
              '" title="删除">✕</button>';
            box.appendChild(item);
          });
          box.querySelectorAll(".pa-on input").forEach(function (cb) {
            cb.addEventListener("change", function () {
              var ai = parseInt(cb.dataset.i, 10);
              var arr = cfg.alarms || [];
              if (arr[ai]) arr[ai].on = cb.checked;
              writeConfig(cfg);
            });
          });
          box.querySelectorAll(".pa-del").forEach(function (btn) {
            btn.addEventListener("click", function () {
              var ai = parseInt(btn.dataset.i, 10);
              cfg.alarms.splice(ai, 1);
              writeConfig(cfg);
              renderAlarms();
            });
          });
        }
        var addAlarmBtn = panel.querySelector(".pet-alarm-add button");
        if (addAlarmBtn) {
          addAlarmBtn.addEventListener("click", function () {
            var t = panel.querySelector(".pa-time").value;
            var n = panel.querySelector(".pa-name").value.trim();
            if (!t) {
              say("先选一个闹钟时间哦~");
              return;
            }
            cfg.alarms = cfg.alarms || [];
            cfg.alarms.push({ id: "a" + Date.now(), time: t, name: n, on: true });
            writeConfig(cfg);
            renderAlarms();
            panel.querySelector(".pa-name").value = "";
            say("闹钟 " + t + (n ? " " + n : "") + " 已设置~");
          });
        }
        renderAlarms();
        /* fill the daily-stats line (today + yesterday archive) */
        (function fillStats() {
          var s = readStats();
          if (s.date !== todayStr()) s = todayStats();
          var dur = panel.querySelector("#ps-dur");
          var turns = panel.querySelector("#ps-turns");
          var last = panel.querySelector(".ps-last");
          if (dur) dur.textContent = fmtDur(s.seconds);
          if (turns) turns.textContent = String(s.turns);
          if (last) {
            try {
              var y = JSON.parse(localStorage.getItem(KEYS.statsLast) || "null");
              if (y && (y.seconds > 0 || y.turns > 0)) {
                last.textContent = "昨日 " + fmtDur(y.seconds);
              }
            } catch (_) {}
          }
        })();
        var daysBtn = panel.querySelector(".ps-days-btn");
        if (daysBtn) {
          /* 近 7 天统计暂不可用（图表数据待修复），先禁用置灰 */
          daysBtn.disabled = true;
          daysBtn.title = "近 7 天统计正在修复中，敬请期待~";
          daysBtn.addEventListener("click", function () {
            say("近 7 天统计正在修复中，敬请期待~");
          });
        }
        /* click outside the panel closes it (the panel is long now and the
           ✕ button scrolls out of view). The ⚙ toggle itself is excluded so
           it can still flip the panel open/closed normally. */
        panelCloseHandler = function (e) {
          if (!panel) return;
          if (!e.target || typeof e.target.closest !== "function") return;
          if (e.target.closest(".pet-panel")) return;
          if (e.target.closest('.pt-custom[title="更多设置"]')) return;
          closePanel();
        };
        document.addEventListener("mousedown", panelCloseHandler, true);
      }
      /** "请选择你的小猫" button row: shows current cat, opens the wheel. */
      function catSwitchRow(activeKey) {
        var c = CATS[activeKey] || CATS.orange;
        return (
          '<button type="button" class="pet-cat-switch-row" title="点击轮转选择小猫">' +
          '<img src="' +
          c.dir +
          '/idle.gif" alt="' +
          c.name +
          '"><span>当前：' +
          c.name +
          '</span><em>🎰 换一只</em></button>'
        );
      }
      function bgSwitchRow(activeKey) {
        var b = BACKGROUNDS[activeKey] || BACKGROUNDS.mushroom;
        return (
          '<button type="button" class="pet-cat-switch-row" title="点击轮转选择背景">' +
          '<img src="' +
          b.day +
          '" alt="' +
          b.name +
          '"><span>当前：' +
          b.name +
          '</span><em>🏡 换背景</em></button>'
        );
      }

      function row(label, kind, key, value) {
        return (
          '<label class="pet-panel-row"><span>' +
          label +
          '</span><input type="checkbox" data-key="' +
          key +
          '"' +
          (value ? " checked" : "") +
          "></label>"
        );
      }
      function modeRow(mode) {
        var opts = [
          ["auto", "自适应"],
          ["day", "白天"],
          ["night", "黑夜"],
        ];
        var html = '<label class="pet-panel-row"><span>背景模式</span><select data-key="mode">';
        opts.forEach(function (o) {
          html +=
            '<option value="' +
            o[0] +
            '"' +
            (mode === o[0] ? " selected" : "") +
            ">" +
            o[1] +
            "</option>";
        });
        return html + "</select></label>";
      }
      function rangeRow(label, key, value, min, max, unit) {
        return (
          '<label class="pet-panel-row"><span>' +
          label +
          '</span><span class="pet-panel-range"><input type="range" data-key="' +
          key +
          '" min="' +
          min +
          '" max="' +
          max +
          '" value="' +
          value +
          '"><b data-out="' +
          key +
          '">' +
          value +
          unit +
          "</b></span></label>"
        );
      }

      /** Resize the whole pet canvas per config (px box, default 140). */
      function applyPetSize(px) {
        canvas.style.width = px + "px";
        canvas.style.height = px + "px";
      }

      /** Apply the current config's pet size on mount. */
      function applyPetFromConfig() {
        var cfg = readConfig();
        applyPetSize(cfg.petSize);
      }

      /**
       * Composer-left toolbar: wallpaper on/off + veil slider, always
       * visible next to the input card. Finds the composer card via the
       * textarea and mounts the toolbar into the same row.
       */
      var toolbar = null;
      var toolbarObserver = null;
      var toolbarAnchor = null;

      function syncToolbar(cfg) {
        if (!toolbar) return;
        toolbar.querySelectorAll(".pt-mode").forEach(function (m) {
          m.classList.toggle("on", m.dataset.mode === cfg.mode);
        });
      }

      function buildToolbar() {
        var cfg = readConfig();
        toolbar = document.createElement("div");
        toolbar.id = "companion-pet-toolbar";
        var modes = [
          ["day", "☀️", "白天背景"],
          ["night", "🌙", "黑夜背景"],
          ["auto", "🔄", "自适应"],
        ];
        var modeHtml = "";
        modes.forEach(function (m) {
          modeHtml +=
            '<button type="button" class="pt-mode' +
            (cfg.mode === m[0] ? " on" : "") +
            '" data-mode="' +
            m[0] +
            '" title="' +
            m[2] +
            '">' +
            m[1] +
            "</button>";
        });
        toolbar.innerHTML =
          '<div class="pt-modes">' +
          modeHtml +
          "</div>" +
          '<button type="button" class="pt-custom" title="查询余额">💰</button>' +
          '<button type="button" class="pt-custom" title="更多设置">⚙️</button>';
        toolbar.querySelectorAll(".pt-mode").forEach(function (m) {
          m.addEventListener("click", function () {
            var c = readConfig();
            c.mode = m.dataset.mode;
            writeConfig(c);
            syncToolbar(c);
            applyWallpaper();
            say("背景模式切换好啦~");
          });
        });
        /* balance: ask the node half (it holds the key, browser never sees
           it) — DeepSeek /user/balance through a cached route */
        var balBtn = toolbar.querySelector('.pt-custom[title="查询余额"]');
        if (balBtn) {
          balBtn.addEventListener("click", function () {
            balBtn.textContent = "…";
            checkBalance(false);
            setTimeout(function () {
              balBtn.textContent = "💰";
            }, 1200);
          });
        }
        toolbar.querySelector(".pt-custom[title='更多设置']").addEventListener("click", function () {
          openPanel();
        });
        toolbar.style.display = "none";
        document.body.appendChild(toolbar);
      }

      /**
       * The toolbar is fixed-positioned and ANCHORED to the composer card's
       * left edge, so when the sidebar resizes (and the composer moves with
       * it) the toolbar follows. Polled cheaply every 500ms; no-op when the
       * position hasn't changed.
       */
      var lastToolbarLeft = -1;
      var toolbarW = 0; /* cached width — avoids forced reflow each frame */
      var memBar = null; /* storybook + memory buttons below the toolbar */
      var lastMemBarLeft = -1;
      function anchorToolbar() {
        try {
          if (!toolbarAnchor || !toolbar) return;
          /* while an approval card is pending the composer is hidden/replaced
             and its rect collapses to ~0 — that would yank the toolbar to the
             far left. Freeze it in place until the approval resolves. */
          if (document.querySelector("[data-approval-key]")) return;
          var card = document.querySelector("[data-composer-card]");
          var target;
          if (card) {
            var r = card.getBoundingClientRect();
            /* the toolbar sits entirely LEFT of the composer: its right edge
               touches the composer's left edge (minus a small gap) */
            if (toolbarW <= 0) toolbarW = toolbar.offsetWidth || 170;
            target = Math.max(8, Math.round(r.left) - toolbarW - 8);
          } else {
            target = 320;
          }
          if (target !== lastToolbarLeft) {
            lastToolbarLeft = target;
            toolbar.style.left = target + "px";
          }
          /* mem button: horizontally centered under the AUTO mode button
             (the 🔄 自适应 key), so the storybook lives right beneath it */
          if (memBar) {
            var autoMode = toolbar.querySelector('.pt-mode[data-mode="auto"]');
            var anchor = autoMode || toolbar.querySelector(".pt-modes");
            if (anchor) {
              var ar = anchor.getBoundingClientRect();
              var bw = memBar.offsetWidth || 120;
              var bc = Math.max(8, Math.round(ar.left + ar.width / 2 - bw / 2));
              if (bc !== lastMemBarLeft) {
                lastMemBarLeft = bc;
                memBar.style.left = bc + "px";
              }
            } else {
              memBar.style.left = target + "px";
            }
          }
        } catch (_) {}
      }
      /**
       * Smooth anchoring: a ResizeObserver on the composer card fires on
       * every layout frame while the sidebar drags (so the toolbar follows
       * fluidly, no 500ms jumps); a slow poll is kept only to (re)attach the
       * observer when the card appears or RO is unavailable.
       */
      var toolbarRO = null;
      function attachToolbarObserver() {
        try {
          if (toolbarRO) return;
          var card = document.querySelector("[data-composer-card]");
          if (!card || !window.ResizeObserver) return;
          toolbarRO = new ResizeObserver(function () {
            anchorToolbar();
          });
          toolbarRO.observe(card);
        } catch (_) {}
      }
      function startToolbarWatch() {
        attachToolbarObserver();
        timers.push(
          setInterval(function () {
            attachToolbarObserver();
            anchorToolbar();
          }, 150)
        );
      }
      function showToolbar() {
        if (toolbarAnchor) return;
        toolbarAnchor = document.body;
        toolbar.style.position = "fixed";
        toolbar.style.left = "320px";
        toolbar.style.bottom = "60px";
        toolbar.style.right = "auto";
        toolbar.style.top = "auto";
        toolbar.style.display = "flex";
        document.body.appendChild(toolbar);
        syncToolbar(readConfig());
        /* storybook + memory buttons right below the toolbar (same style) */
        if (!memBar) {
          memBar = document.createElement("div");
          memBar.id = "companion-pet-mem-bar";
          memBar.style.position = "fixed";
          memBar.style.bottom = "112px";
          memBar.style.left = "320px";
          memBar.style.zIndex = "2147483001";
          memBar.innerHTML =
            '<button type="button" class="pt-cap" id="companion-pet-memory-btn" title="我们的时光">📖</button>';
          document.body.appendChild(memBar);
          memBar
            .querySelector("#companion-pet-memory-btn")
            .addEventListener("click", openMemoryPanel);
        }
        anchorToolbar();
        startToolbarWatch();
      }
      function watchComposer() {
        if (document.body) {
          showToolbar();
          return;
        }
        toolbarObserver = new MutationObserver(function () {
          if (document.body) {
            showToolbar();
            toolbarObserver.disconnect();
          }
        });
        toolbarObserver.observe(document.documentElement, { childList: true, subtree: true });
        timers.push(
          setTimeout(function () {
            if (!toolbarAnchor) showToolbar();
          }, 2000)
        );
      }

      /**
       * Drag support: mousedown on the canvas moves the fixed pet root.
       * Click (no drag) still triggers the click reaction.
       */
      var dragging = false;
      var dragMoved = false;
      var dragStart = null;
      function onMouseDown(e) {
        if (e.button !== 0) return;
        dragging = true;
        dragMoved = false;
        dragStart = { x: e.clientX, y: e.clientY, rx: root.offsetLeft, ry: root.offsetTop };
        canvas.classList.add("dragging");
        e.preventDefault();
      }
      function onMouseMove(e) {
        if (!dragging || !dragStart) return;
        var dx = e.clientX - dragStart.x;
        var dy = e.clientY - dragStart.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) dragMoved = true;
        /* clamp to viewport on ALL four sides, keeping the kitten fully
           visible; leave ~30px at the bottom so the name label never
           falls off screen */
        var w = root.offsetWidth || 140;
        var h = root.offsetHeight || 140;
        var maxLeft = Math.max(0, window.innerWidth - w);
        var maxTop = Math.max(0, window.innerHeight - h - 30);
        root.style.right = "auto";
        root.style.bottom = "auto";
        root.style.left = Math.max(0, Math.min(maxLeft, dragStart.rx + dx)) + "px";
        root.style.top = Math.max(0, Math.min(maxTop, dragStart.ry + dy)) + "px";
      }
      function onMouseUp() {
        if (!dragging) return;
        dragging = false;
        canvas.classList.remove("dragging");
        if (dragMoved) {
          // persist position
          try {
            localStorage.setItem(KEYS.pos, JSON.stringify({ left: root.style.left, top: root.style.top }));
          } catch (_) {}
        }
        dragStart = null;
      }

      // Restore saved drag position if any (clamped to the current viewport,
      // leaving room at the bottom for the name label).
      try {
        var savedPos = JSON.parse(localStorage.getItem(KEYS.pos) || "null");
        if (savedPos && savedPos.left && savedPos.top) {
          var w = root.offsetWidth || 140;
          var h = root.offsetHeight || 140;
          var maxL = Math.max(0, window.innerWidth - w);
          var maxT = Math.max(0, window.innerHeight - h - 30);
          var l = parseInt(savedPos.left, 10) || 0;
          var t = parseInt(savedPos.top, 10) || 0;
          root.style.right = "auto";
          root.style.bottom = "auto";
          root.style.left = Math.max(0, Math.min(maxL, l)) + "px";
          root.style.top = Math.max(0, Math.min(maxT, t)) + "px";
        }
      } catch (_) {}

      canvas.addEventListener("mousedown", onMouseDown);
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
      canvas.addEventListener("click", function () {
        if (dragMoved) return;
        onClick();
      });
      canvas.addEventListener("dblclick", openPanel);
      /* skill badge: open the picker (stop propagation so the canvas
         random-skill handler does not also fire) */
      skillBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        toggleMenu();
      });
      /* name label is display-only (renaming happens in the picker) */
      nameEl.style.cursor = "default";
      function currentCatKey() {
        var cfg = readConfig();
        return cfg.cat || "orange";
      }
      /* close the action menu when clicking anywhere else */
      document.addEventListener(
        "mousedown",
        function (e) {
          if (menuOpen && !e.target.closest("#companion-pet-root")) closeMenu();
        },
        true
      );
      document.addEventListener("input", onInput, true);
      timers.push(setInterval(checkLateNight, 60 * 1000));
      timers.push(setInterval(checkAlarms, 30 * 1000));
      /* balance polling: first silent check after 30s, then the interval
         adapts to the balance (30min healthy / 5min low / 1min critical) */
      timers.push(setTimeout(function () { scheduleNextBalance(30 * 1000); }, 30 * 1000));

      /**
       * Mood detection: watch the active input/composer. The DSH composer is
       * a textarea/contenteditable; listen on document (capture) so we catch
       * whichever element is live. Debounced + throttled per pet instance.
       */
      var lastMoodAt = 0;
      var lastText = "";
      function onInput(e) {
        var el = e.target;
        if (!el) return;
        var isComposer =
          el.tagName === "TEXTAREA" ||
          (el.tagName === "INPUT" && el.type === "text") ||
          el.isContentEditable;
        if (!isComposer) return;
        var text = (el.value || el.textContent || "").trim();
        if (!text || text === lastText) return;
        lastText = text;
        var now = Date.now();
        if (now - lastMoodAt < 8000) return; // cool-down between mood bubbles
        if (!readConfig().mood) return;
        var angry = ANGRY_RE.test(text);
        /* exclamation burst boosts the signal: an angry-ish phrase with
           "!!" still counts even without a dictionary hit */
        if (!angry && /!{2,}/.test(text) && /(怎么|为什么|干嘛|什么|搞|改|弄|生气|气|烦|恼|火|你|我)/.test(text)) {
          angry = true;
        }
        if (angry) {
          lastMoodAt = now;
          bumpMood("a");
          say(pickAngryBubble());
          maybeAgent("angry", { action: false });
          /* scare full loop, then comfort bounce — chained, not cut short */
          playAction("scare");
          if (actionTimer !== null) clearTimeout(actionTimer);
          actionTimer = setTimeout(function () {
            transientAction("celebrate", { user: true });
          }, 8100);
        } else if (HAPPY_RE.test(text)) {
          lastMoodAt = now;
          bumpMood("h");
          say(pick(HAPPY_BUBBLES));
          transientAction("happy");
        }
      }

      // Apply saved kitten size on mount.
      applyPetFromConfig();
      // show the current cat's name label
      nameEl.textContent = catDisplayName(currentCatKey());

      // Composer-left toolbar (wallpaper toggle + veil slider).
      buildToolbar();
      watchComposer();

      // Daily stats: archive yesterday + greet on first open of the day,
      // count chat turns live, accumulate online time every minute and on
      // page hide (survives refreshes — today's totals keep adding up).
      todayStats();
      seedTurns();
      /* 基线必须先于首次采集：把页面上已有的历史消息标记为"已见过"，
         否则首次打开会把旧会话全收进今天的桶 */
      updateLastBaseline();
      snapshotTurns();
      timers.push(setInterval(snapshotTurns, 30 * 1000));
      updateProfile();
      initMemory();
      /* token polling: clear polluted history + today's phantom stats,
         baseline only once the projection materializes, then bank deltas */
      resetTokenHistory();
      resetToday();
      pollTokens();
      timers.push(setInterval(pollTokens, 60 * 1000));
      /* auto memory extraction: re-check every 30min so a tab left open
         across midnight still summarizes the new day's inputs once */
      timers.push(setInterval(maybeAutoExtract, 30 * 60 * 1000));
      timers.push(setInterval(tickStats, 60 * 1000));
      window.addEventListener("pagehide", function () {
        tickStats();
      });

      // Rare ambient skills: cast one full skill every 10-15 minutes so the
      // kitten mostly stays calm/idle, with a slow life rhythm. Only the
      // current cat's own animations are eligible (its gif folder).
      function ambientPool() {
        var acts = currentCat.acts || [];
        return ["stretch", "think", "walk", "happy", "celebrate", "sleep"].filter(
          function (k) {
            return acts.indexOf(k) >= 0;
          }
        );
      }
      function scheduleAmbient() {
        var t = setTimeout(function () {
          if (!dragging && !userActionActive) {
            var pool = ambientPool();
            if (pool.length) transientAction(pick(pool));
          }
          scheduleAmbient();
        }, 600000 + Math.random() * 300000);
        timers.push(t);
      }
      scheduleAmbient();

      // Greet once shortly after mount. Festivals get their own festive
      // bubble + a little celebration (and skip the AI greeting so it can't
      // overwrite the festival wish); otherwise a normal greeting bubble.
      timers.push(
        setTimeout(function () {
          if (!greetingDone) {
            greetingDone = true;
            var fest = festivalOf();
            if (readConfig().bubbles) {
              if (fest) {
                say("🎉 " + fest.name + "快乐！" + fest.wish, "festival");
                transientAction("celebrate");
              } else {
                say(pickGreeting(), "greet");
                transientAction("stretch");
              }
            }
            if (!fest) maybeAgent("greet");
          }
        }, 1200)
      );

      // Immediate late-night check on mount.
      checkLateNight();

      return function dispose() {
        canvas.removeEventListener("mousedown", onMouseDown);
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.removeEventListener("input", onInput, true);
        timers.forEach(function (t) {
          clearInterval(t);
          clearTimeout(t);
        });
        if (balCheckTimer !== null) clearTimeout(balCheckTimer);
        if (actionTimer !== null) clearTimeout(actionTimer);
        if (bubbleTimer !== null) clearTimeout(bubbleTimer);
        closeCatWheel();
        closeStatsPanel();
        closeMemoryPanel();
        closeNotesPanel();
        if (memBar && memBar.parentNode) memBar.parentNode.removeChild(memBar);
        if (panel) {
          panel.remove();
          panel = null;
        }
        if (menu) {
          menu.remove();
          menu = null;
        }
        if (toolbarObserver) toolbarObserver.disconnect();
        if (toolbar && toolbar.parentNode) toolbar.parentNode.removeChild(toolbar);
        if (root.parentNode) root.parentNode.removeChild(root);
        var bgLayer = document.getElementById(BG_LAYER_ID);
        if (bgLayer && bgLayer.parentNode) bgLayer.parentNode.removeChild(bgLayer);
      };
    }

    /** Cordis plugin entry: mount the pet + wallpaper, dispose on teardown. */
    function apply(ctx) {
      ensureCss();
      applyWallpaper();
      var swapTimer = setInterval(applyWallpaper, 60 * 1000);
      if (typeof document === "undefined" || !document.body) {
        // Defer until the body exists (very early mount safety).
        return ctx.effect(function () {
          var disposer = null;
          var started = false;
          var tick = setInterval(function () {
            if (!started && document.body) {
              started = true;
              clearInterval(tick);
              disposer = createPet();
            }
          }, 100);
          return function () {
            clearInterval(tick);
            clearInterval(swapTimer);
            if (disposer) disposer();
          };
        });
      }
      return ctx.effect(function () {
        var disposer = createPet();
        return function () {
          clearInterval(swapTimer);
          disposer();
        };
      });
    }

    exports.apply = apply;

    /* ---- test-only harness (harmless in prod) ----
       The pure helpers inside createPet()'s scope are published to
       exports.__test as createPet's FIRST statement. Unit tests invoke
       createPet through __runTestHarness with no DOM present: the publish
       runs, then the DOM code throws, and the error is swallowed. */
    function __runTestHarness() {
      try {
        createPet();
      } catch (error) {
        return { published: !!exports.__test, error: String((error && error.message) || error) };
      }
      return { published: !!exports.__test, error: null };
    }
    exports.__runTestHarness = __runTestHarness;

    /* test-only exports (harmless in prod; DSH only reads .apply) */
    if (typeof exports !== "undefined" && typeof module !== "undefined") {
      exports.__test = {
        defaultConfig: defaultConfig,
        readConfig: readConfig,
        writeConfig: writeConfig,
        actionsFor: actionsFor,
        veilAlpha: veilAlpha,
        backingFactor: backingFactor,
        wallpaperForNow: wallpaperForNow,
        isLateNight: isLateNight,
      };
    }
    return module.exports;
  },
});
