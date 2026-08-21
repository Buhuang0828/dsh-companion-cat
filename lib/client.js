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
  id: "companion-pet",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    /** Asset route registered by the node half. */
    var ASSET_BASE = "/companion-pet/assets";
    /** Day / night wallpapers (2048x1152), swapped by local clock. */
    var BG_DAY = ASSET_BASE + "/background-day.png";
    var BG_NIGHT = ASSET_BASE + "/background-night.png";
    /** Live looping backdrop video used in 'auto' mode (1280x720, 8s loop). */
    var BG_LIVE = ASSET_BASE + "/background-live.mp4";
    /** Real moss strips cut from the night wallpaper's undergrowth. */
    var MOSS_TOP = ASSET_BASE + "/moss-top.png";
    var MOSS_BOTTOM = ASSET_BASE + "/moss-bottom.png";
    var MOSS_LEFT = ASSET_BASE + "/moss-left.png";
    var MOSS_RIGHT = ASSET_BASE + "/moss-right.png";

    /**
     * Animation catalog. Every gif is a FULL 8.1s loop (81 frames @10fps):
     * sit -> action -> recover to sit, per the shot spec. dur = full loop
     * time, so the action finishes, the cat returns to the sitting pose,
     * and the swap back to idle is seamless (matching sit poses).
     */
    var ACTIONS = {
      idle: { url: ASSET_BASE + "/idle.gif", h: 203 },
      stretch: { url: ASSET_BASE + "/stretch.gif", h: 267, dur: 8100 },
      walk: { url: ASSET_BASE + "/walk.gif", h: 261, dur: 8100 },
      sad: { url: ASSET_BASE + "/sad.gif", h: 269, dur: 8100 },
      celebrate: { url: ASSET_BASE + "/celebrate.gif", h: 253, dur: 8100 },
      happy: { url: ASSET_BASE + "/happy.gif", h: 259, dur: 8100 },
      think: { url: ASSET_BASE + "/think.gif", h: 263, dur: 8100 },
      scare: { url: ASSET_BASE + "/scare.gif", h: 269, dur: 8100 },
      sleep: { url: ASSET_BASE + "/sleep.gif", h: 269, dur: 8100 },
    };
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
    var ANGRY_RE = /(烦|生气|气死|恼火|暴躁|愤怒|艹|靠|妈的|fuck|shit|崩溃|抓狂|火大|无语|讨厌|恶心|郁闷|mmp|tmd|md|尼玛|受不了|想骂人)/i;
    var HAPPY_RE = /(开心|高兴|哈哈|太好了|太棒|谢谢|爱你|nice|awesome|完美|搞定|成功|耶|哇|好耶|真棒)/i;

    /** One reminder per calendar day, persisted locally. */
    var STORAGE_KEY = "companion-pet:reminder-day";

    /** Per-plugin CSS injected once. */
    var CSS =
      "#companion-pet-root{position:fixed;right:24px;bottom:24px;z-index:2147483002;pointer-events:none;-webkit-user-select:none;user-select:none}" +
      "#companion-pet-root .pet-canvas{position:relative;width:140px;height:140px;pointer-events:auto;cursor:grab;overflow:hidden}" +
      "#companion-pet-root .pet-canvas.dragging{cursor:grabbing}" +
      "#companion-pet-root .pet-img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;image-rendering:auto;pointer-events:none}" +
      "#companion-pet-root .pet-bubble{position:absolute;left:50%;bottom:100%;transform:translateX(-50%);margin-bottom:10px;max-width:260px;min-width:120px;padding:9px 14px;border-radius:16px;background:rgba(252,243,230,.96);color:#5a4632;font-size:13px;line-height:1.55;box-shadow:0 4px 18px rgba(0,0,0,.2);border:1px solid rgba(214,166,105,.5);white-space:normal;word-break:break-word;transition:opacity .3s ease,transform .3s ease;opacity:0;pointer-events:none}" +
      "#companion-pet-root .pet-bubble::after{content:'';position:absolute;left:50%;top:100%;transform:translateX(-50%);border:7px solid transparent;border-top-color:rgba(252,243,230,.96)}" +
      "#companion-pet-root .pet-bubble::before{content:'';position:absolute;left:50%;top:100%;transform:translateX(-50%);border:8px solid transparent;border-top-color:rgba(214,166,105,.5)}" +
      "#companion-pet-root .pet-bubble.show{opacity:1;transform:translateX(-50%) translateY(-4px)}" +
      /* action picker menu — same frosted backing as the toolbar/settings */
      "#companion-pet-root .pet-menu{position:absolute;left:50%;bottom:calc(100% + 10px);transform:translateX(-50%) scale(.92);transform-origin:bottom center;width:176px;padding:8px;border-radius:16px 12px 18px 10px / 12px 16px 10px 18px;background:var(--dsw-specific-input-major, rgba(16,21,36,.6));border:1px solid var(--dsw-alias-border-l2-darkmode-thin, rgba(255,255,255,.1));box-shadow:0 12px 36px rgba(0,0,0,.45);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);pointer-events:auto;opacity:0;visibility:hidden;transition:opacity .18s ease,transform .18s ease,visibility .18s;z-index:5}" +
      "#companion-pet-root .pet-menu.open{opacity:1;visibility:visible;transform:translateX(-50%) scale(1)}" +
      "#companion-pet-root .pet-menu-title{font-size:11px;font-weight:700;letter-spacing:.05em;color:var(--dsw-alias-state-business-primary, #6fa8ff);margin:2px 4px 6px;text-transform:uppercase;text-shadow:0 1px 2px rgba(0,0,0,.3)}" +
      "#companion-pet-root .pet-menu-item{display:flex;align-items:center;gap:8px;width:100%;border:none;background:transparent;color:var(--dsw-alias-label-primary, #e6f0da);font-size:12.5px;line-height:1.4;text-align:left;padding:7px 8px;border-radius:10px;cursor:pointer;transition:background .12s}" +
      "#companion-pet-root .pet-menu-item:hover{background:rgba(125,201,104,.18)}" +
      "#companion-pet-root .pet-menu-item .mi-ico{font-size:15px;flex:none;width:20px;text-align:center}" +
      /* skill badge (top-left, only while idle): plain star, no pill */
      "#companion-pet-root .pet-skill-btn{position:absolute;left:-4px;top:-4px;width:34px;height:34px;border:none;background:transparent;color:rgba(255,225,140,.95);font-size:22px;line-height:1;display:flex;align-items:center;justify-content:center;cursor:pointer;pointer-events:auto;text-shadow:0 2px 6px rgba(0,0,0,.5),0 0 2px rgba(0,0,0,.4);transition:transform .15s,opacity .25s;opacity:0;z-index:6}" +
      "#companion-pet-root .pet-skill-btn:hover{transform:scale(1.2) rotate(15deg)}" +
      "#companion-pet-root .pet-skill-btn.show{opacity:1}" +
      /* settings popover — same frosted backing as toolbar/menu, original
         spacing preserved (padding/gaps/line-height unchanged) */
      "#companion-pet-root .pet-panel{width:264px;padding:18px 16px 14px;border-radius:16px 12px 18px 10px / 12px 16px 10px 18px;background:var(--dsw-specific-input-major, rgba(16,21,36,.65));color:var(--dsw-alias-label-primary, #eef4e6);font-size:13px;line-height:1.7;box-shadow:0 12px 40px rgba(0,0,0,.5);pointer-events:auto;backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid var(--dsw-alias-border-l2-darkmode-thin, rgba(255,255,255,.1));max-height:80vh;overflow-y:auto;z-index:2147483003}" +
      "#companion-pet-root .pet-panel-title{font-weight:700;font-size:14px;margin:0 0 10px;color:var(--dsw-alias-label-primary, #f4faec);display:flex;align-items:center;justify-content:space-between;gap:6px}" +
      "#companion-pet-root .pet-panel-close{width:22px;height:22px;border:none;background:rgba(255,255,255,.08);color:var(--dsw-alias-label-secondary, #cfd6e6);border-radius:50%;cursor:pointer;font-size:12px;line-height:1;display:flex;align-items:center;justify-content:center;flex:none;transition:background .15s}" +
      "#companion-pet-root .pet-panel-close:hover{background:rgba(255,80,80,.25);color:#fff}" +
      "#companion-pet-root .pet-panel-group{font-size:11px;font-weight:700;letter-spacing:.05em;color:var(--dsw-alias-state-business-primary, #6fa8ff);margin:12px 0 3px;text-transform:uppercase}" +
      "#companion-pet-root .pet-panel-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:6px 0;color:var(--dsw-alias-label-secondary, #e6f0da)}" +
      "#companion-pet-root .pet-panel-row select{background:rgba(255,255,255,.08);color:var(--dsw-alias-label-primary, #f2f8ea);border:1px solid rgba(255,255,255,.14);border-radius:8px;padding:3px 6px;font-size:12px;outline:none}" +
      "#companion-pet-root .pet-panel-row input[type=checkbox]{accent-color:var(--dsw-alias-state-business-primary, #6fa8ff);width:15px;height:15px}" +
      "#companion-pet-root .pet-panel-range{display:flex;align-items:center;gap:8px}" +
      "#companion-pet-root .pet-panel-range input[type=range]{width:110px;accent-color:var(--dsw-alias-state-business-primary, #6fa8ff);height:4px;cursor:pointer}" +
      "#companion-pet-root .pet-panel-range b{min-width:36px;text-align:right;font-weight:500;color:var(--dsw-alias-label-primary, #f2f8ea);font-size:12px}" +
      "#companion-pet-root .pet-panel-note{color:var(--dsw-alias-label-tertiary, #b2cd9e);font-size:11px;margin-top:12px;padding-top:9px;border-top:1px solid rgba(255,255,255,.1)}" +
      /* composer toolbar: matches the input card's translucent frosted style */
      "#companion-pet-toolbar{position:fixed;left:320px;bottom:60px;z-index:2147483001;display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:999px;background:var(--dsw-specific-input-major, rgba(16,21,36,.55));border:1px solid var(--dsw-alias-border-l2-darkmode-thin, rgba(255,255,255,.1));backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:0 8px 28px rgba(0,0,0,.3);pointer-events:auto;-webkit-user-select:none;user-select:none;white-space:nowrap}" +
      "#companion-pet-toolbar .pt-modes{display:flex;align-items:center;gap:2px;background:rgba(255,255,255,.06);border-radius:999px;padding:2px}" +
      "#companion-pet-toolbar .pt-mode{border:none;background:transparent;color:var(--dsw-alias-label-tertiary, #8b94ab);cursor:pointer;font-size:13px;line-height:1;width:28px;height:28px;border-radius:999px;transition:background .15s,color .15s;display:flex;align-items:center;justify-content:center}" +
      "#companion-pet-toolbar .pt-mode:hover{color:var(--dsw-alias-label-primary, #dbe2f0);background:rgba(255,255,255,.08)}" +
      "#companion-pet-toolbar .pt-mode.on{background:var(--dsw-alias-state-business-primary, #6fa8ff);color:#0d1424}" +
      "#companion-pet-toolbar .pt-custom{border:1px solid var(--dsw-alias-border-l2, rgba(255,255,255,.14));background:rgba(255,255,255,.05);color:var(--dsw-alias-label-secondary, #cfd6e6);cursor:pointer;font-size:13px;line-height:1;width:28px;height:28px;border-radius:999px;transition:background .15s;display:flex;align-items:center;justify-content:center}" +
      "#companion-pet-toolbar .pt-custom:hover{background:rgba(111,168,255,.2);color:var(--dsw-alias-label-primary, #fff)}";

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
    /** v3: expanded preferences (mode, veil, petSize, toggles). */
    var CFG_KEY = "companion-pet:config:v3";

    /**
     * Persistent user preferences (local, zero tokens).
     *   bg         - wallpaper on/off
     *   mode       - 'auto' | 'day' | 'night'
     *   veil       - 0..100 uniform backdrop darkening strength
     *   petSize    - 0..200 px rendered kitten size
     *   lateRemind - late-night reminder on/off
     *   mood       - input-mood bubbles on/off
     *   bubbles    - click bubbles on/off
     */
    function defaultConfig() {
      return {
        bg: true,
        mode: "auto",
        veil: 85,
        petSize: 140,
        lateRemind: true,
        mood: true,
        bubbles: true,
      };
    }
    function readConfig() {
      var def = defaultConfig();
      try {
        var raw = localStorage.getItem(CFG_KEY);
        if (raw) return Object.assign(def, JSON.parse(raw));
      } catch (_) {}
      return def;
    }
    function writeConfig(cfg) {
      try {
        localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
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

    /** Which wallpaper image to use for the current mode + clock. */
    function wallpaperForNow(mode) {
      var m = mode || "auto";
      if (m === "day") return BG_DAY;
      if (m === "night") return BG_NIGHT;
      var h = new Date().getHours();
      return h >= 6 && h < 19 ? BG_DAY : BG_NIGHT;
    }

    /** Live background video layer (auto mode only). Created lazily. */
    var bgVideo = null;
    var bgVeil = null;
    /** Video length represents one full day (8s = 24h). */
    var BG_VIDEO_DURATION = 8;
    /** Re-sync the video to wall-clock time every N ms. */
    var BG_SYNC_MS = 30000;

    /** seconds-of-day 0..86400 -> video time 0..8 */
    function timeOfDayToVideo() {
      var d = new Date();
      var sec = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
      return (sec / 86400) * BG_VIDEO_DURATION;
    }

    function ensureBgVideo() {
      if (bgVideo) return;
      if (typeof document === "undefined" || !document.body) return;
      bgVideo = document.createElement("video");
      bgVideo.id = "companion-pet-bg-video";
      bgVideo.muted = true;
      bgVideo.loop = true;
      bgVideo.playsInline = true;
      bgVideo.autoplay = true;
      bgVideo.preload = "auto";
      bgVideo.src = BG_LIVE;
      /* crawl forward very slowly so the frame flows while staying near the
         wall-clock position; we re-seek every BG_SYNC_MS */
      bgVideo.playbackRate = 0.25;
      bgVideo.style.cssText =
        "position:fixed;inset:0;width:100vw;height:100vh;object-fit:cover;z-index:-2;pointer-events:none;opacity:0;transition:opacity .8s ease";
      /* veil gradient over the video, same role as the static backdrop veil */
      bgVeil = document.createElement("div");
      bgVeil.id = "companion-pet-bg-veil";
      bgVeil.style.cssText =
        "position:fixed;inset:0;z-index:-1;pointer-events:none;opacity:0;transition:opacity .8s ease;background:rgba(8,11,20," +
        veilAlpha(readConfig().veil) +
        ")";
      document.body.appendChild(bgVideo);
      document.body.appendChild(bgVeil);
      var tryPlay = function () {
        var p = bgVideo.play();
        if (p) p.catch(function () {});
      };
      if (bgVideo.readyState >= 2) tryPlay();
      else bgVideo.addEventListener("canplay", tryPlay, { once: true });
      /* start at today's position */
      bgVideo.addEventListener(
        "loadedmetadata",
        function () {
          var t = timeOfDayToVideo();
          if (isFinite(t) && bgVideo.duration > 0) bgVideo.currentTime = t;
        },
        { once: true }
      );
      /* keep time-synced */
      bgVideo._syncTimer = setInterval(function () {
        var t = timeOfDayToVideo();
        if (isFinite(t) && bgVideo.duration > 0 && Math.abs(bgVideo.currentTime - t) > 1.2) {
          bgVideo.currentTime = t;
        }
      }, BG_SYNC_MS);
    }
    /** Show/hide the live video layer based on mode. */
    function syncBgVideo(useLive, veil) {
      if (useLive) {
        ensureBgVideo();
        bgVideo.style.opacity = "1";
        bgVeil.style.background = "rgba(8,11,20," + veil + ")";
        bgVeil.style.opacity = "1";
      } else {
        if (bgVideo) bgVideo.style.opacity = "0";
        if (bgVeil) bgVeil.style.opacity = "0";
      }
    }

    /**
     * (Re)apply the wallpaper. Design: ONE uniform translucent veil on the
     * body over the artwork; every DSH surface becomes truly transparent so
     * the scene shows through everywhere (sidebar, center, composer seat),
     * and only the composer input card + code blocks keep a solid local
     * background for readability. No per-region translucency = no seams.
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
      var url = wallpaperForNow(cfg.mode);
      var veil = veilAlpha(cfg.veil); // veil alpha over artwork (higher = less transparent)
      var b = backingFactor(cfg.veil); // 0..1 surface backing (0 = fully transparent)
      if (!cfg.bg) {
        style.textContent = "";
        syncBgVideo(false, veil);
        return;
      }
      /* auto mode => live video backdrop; day/night => static image */
      var useLive = cfg.mode === "auto";
      syncBgVideo(useLive, veil);
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
      style.textContent =
        /* html backdrop follows transparency: fully transparent at max */
        "html{background:rgba(11,16,32," +
        veil +
        ")}" +
        /* one uniform veil over the artwork, then the wallpaper beneath */
        "body{background-image:linear-gradient(rgba(8,11,20," +
        veil +
        "),rgba(8,11,20," +
        veil +
        ")),url('" +
        url +
        "')!important;background-size:cover!important;background-position:center!important;background-repeat:no-repeat!important;background-attachment:fixed!important}" +
        /* remove every surface seam: session-list fade + composer seat gradient */
        ".qDHVXG_fade{background:transparent!important}" +
        ".wSkVaW_composerSeat{background:transparent!important}" +
        /* belt & braces: root + body defaults must not fight the artwork */
        "body{background-color:transparent!important}" +
        "#root{background:transparent!important}" +
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
        "--dsw-specific-menu:rgba(18,23,42," + Math.min(0.95, sMod + 0.1) + ");" +
        "--dsw-specific-selector:rgba(18,23,42," + Math.min(0.95, sMod + 0.1) + ");" +
        "--dsw-specific-tip:rgba(18,23,42," + Math.min(0.95, sMod + 0.08) + ");" +
        /* the composer input card follows backing (0 at max) */
        "--dsw-specific-input-major:rgba(14,19,34," + sInput + ");" +
        "--dsw-specific-login-input:rgba(14,19,34," + sInput + ");" +
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
        "--dsw-specific-menu:rgba(252,250,246," + lMod + ");" +
        "--dsw-specific-selector:rgba(252,250,246," + lMod + ");" +
        "--dsw-specific-tip:rgba(252,250,246," + lMod + ");" +
        "--dsw-specific-input-major:rgba(255,255,255," + Math.max(0, Math.min(0.92, b * 0.92)) + ");" +
        "--dsw-specific-login-input:rgba(255,255,255," + Math.max(0, Math.min(0.92, b * 0.92)) + ");" +
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
        return localStorage.getItem(STORAGE_KEY) === todayKey();
      } catch (_) {
        return true;
      }
    }
    function markReminded() {
      try {
        localStorage.setItem(STORAGE_KEY, todayKey());
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
      var root = document.createElement("div");
      root.id = "companion-pet-root";
      root.setAttribute("aria-label", "陪伴小猫");

      /* fixed-size canvas: every action is scaled/centered inside so the
         kitten never jumps in size when the animation changes */
      var canvas = document.createElement("div");
      canvas.className = "pet-canvas";

      var img = document.createElement("img");
      img.className = "pet-img";
      img.src = ACTIONS.idle.url;
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

      canvas.appendChild(skillBtn);
      canvas.appendChild(img);
      root.appendChild(bubble);
      root.appendChild(canvas);
      document.body.appendChild(root);

      var timers = [];
      var bubbleTimer = null;
      var greetingDone = false;

      /**
       * Play one action. Every gif is shown with object-fit: contain inside
       * the FIXED pet canvas, so all actions render the same kitten size
       * (measured: cat occupies ~84% of frame height in every gif, so
       * contain-normalization keeps size consistent within ~0.5%).
       */
      var currentAction = null;
      function playAction(name) {
        var a = ACTIONS[name] || ACTIONS.idle;
        if (currentAction === name && img.src.indexOf(a.url) >= 0) return;
        currentAction = name;
        img.src = a.url;
        /* skill badge only while idle */
        if (name === "idle") skillBtn.classList.add("show");
        else skillBtn.classList.remove("show");
        if (menuOpen && name !== "idle") closeMenu();
      }

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
        }, (ACTIONS[name] && ACTIONS[name].dur) || 4000);
      }

      /** Show a bubble for ~3.2s; replaces any pending bubble. */
      function say(text) {
        bubble.textContent = text;
        bubble.classList.add("show");
        if (bubbleTimer !== null) clearTimeout(bubbleTimer);
        bubbleTimer = setTimeout(function () {
          bubble.classList.remove("show");
          bubbleTimer = null;
        }, 3200);
      }

      /** Pick a random entry from an array. */
      function pick(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
      }

      /** Late-night reminder, at most once per calendar day. */
      function checkLateNight() {
        if (readConfig().lateRemind && isLateNight() && !alreadyReminded()) {
          markReminded();
          say(pick(LATE_BUBBLES));
          transientAction("sleep");
        }
      }

      /**
       * Action picker: single click opens a menu above the kitten so the
       * user can choose which animation to play.
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
      ];
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
        if (!menu) {
          menu = document.createElement("div");
          menu.className = "pet-menu";
          menu.innerHTML =
            '<div class="pet-menu-title">✦ 小猫技能</div>' +
            MENU_ITEMS.map(function (it) {
              return (
                '<button type="button" class="pet-menu-item" data-action="' +
                it[0] +
                '"><span class="mi-ico">' +
                it[1] +
                "</span>" +
                it[2] +
                "</button>"
              );
            }).join("");
          menu.addEventListener("click", function (e) {
            var btn = e.target.closest(".pet-menu-item");
            if (!btn) return;
            transientAction(btn.dataset.action, { user: true });
            if (readConfig().bubbles) say("喵~ 给你表演一个！");
            closeMenu();
          });
          root.appendChild(menu);
        }
        menu.classList.add("open");
        menuOpen = true;
      }

      /** Click: cast a RANDOM skill (unless it was a drag). */
      function onClick() {
        if (menuOpen) {
          closeMenu();
          return;
        }
        var names = MENU_ITEMS.map(function (it) {
          return it[0];
        });
        var chosen = pick(names);
        transientAction(chosen, { user: true });
        if (readConfig().bubbles) say(pick(["喵~ 接招！", "看我的技能！", "喵喵拳！", "给你露一手~"]));
      }

      /**
       * Settings popover: opens above the toolbar's ⚙ button. Lets the user
       * tune wallpaper mode (day/night/auto), veil strength, kitten size,
       * and feature toggles. Pure DOM + localStorage — zero tokens.
       */
      var panel = null;
      function closePanel() {
        if (panel) {
          panel.remove();
          panel = null;
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
        panel.innerHTML =
          '<div class="pet-panel-title"><span>🐱 小猫设置</span><button type="button" class="pet-panel-close" title="关闭">✕</button></div>' +
          '<div class="pet-panel-group">背景壁纸</div>' +
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
            if (key === "bg" || key === "bubbles" || key === "lateRemind" || key === "mood") {
              cfg[key] = el.checked;
            } else if (key === "veil" || key === "petSize") {
              cfg[key] = parseInt(el.value, 10);
              var out = panel.querySelector('[data-out="' + key + '"]');
              if (out) out.textContent = cfg[key] + (key === "veil" ? "%" : "px");
            } else if (key === "mode") {
              cfg[key] = el.value;
            }
            writeConfig(cfg);
            applyWallpaper();
            if (key === "petSize") applyPetSize(cfg.petSize);
            say("好哒，已经调好啦~");
          });
        });
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
        toolbar.querySelector(".pt-custom").addEventListener("click", function () {
          openPanel();
        });
        toolbar.style.display = "none";
        document.body.appendChild(toolbar);
      }

      /**
       * The toolbar is fixed-positioned (left 10cm / bottom 2.5cm), so it
       * does not need the composer card; just show it once the body exists.
       */
      function showToolbar() {
        if (toolbarAnchor) return;
        toolbarAnchor = document.body;
        toolbar.style.display = "flex";
        document.body.appendChild(toolbar);
        syncToolbar(readConfig());
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
        /* clamp to viewport on ALL four sides, keeping the kitten fully visible */
        var w = root.offsetWidth || 140;
        var h = root.offsetHeight || 140;
        var maxLeft = Math.max(0, window.innerWidth - w);
        var maxTop = Math.max(0, window.innerHeight - h);
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
            localStorage.setItem("companion-pet:pos", JSON.stringify({ left: root.style.left, top: root.style.top }));
          } catch (_) {}
        }
        dragStart = null;
      }

      // Restore saved drag position if any (clamped to the current viewport).
      try {
        var savedPos = JSON.parse(localStorage.getItem("companion-pet:pos") || "null");
        if (savedPos && savedPos.left && savedPos.top) {
          var w = root.offsetWidth || 140;
          var h = root.offsetHeight || 140;
          var maxL = Math.max(0, window.innerWidth - w);
          var maxT = Math.max(0, window.innerHeight - h);
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
        if (ANGRY_RE.test(text)) {
          lastMoodAt = now;
          say(pick(ANGRY_BUBBLES));
          /* scare full loop, then comfort bounce — chained, not cut short */
          playAction("scare");
          if (actionTimer !== null) clearTimeout(actionTimer);
          actionTimer = setTimeout(function () {
            transientAction("celebrate", { user: true });
          }, 8100);
        } else if (HAPPY_RE.test(text)) {
          lastMoodAt = now;
          say(pick(HAPPY_BUBBLES));
          transientAction("happy");
        }
      }

      // Apply saved kitten size on mount.
      applyPetFromConfig();

      // Composer-left toolbar (wallpaper toggle + veil slider).
      buildToolbar();
      watchComposer();

      // Rare ambient skills: cast one full skill every 10-15 minutes so the
      // kitten mostly stays calm/idle, with a slow life rhythm.
      var ambientActions = ["stretch", "think", "walk", "happy", "celebrate", "sleep"];
      function scheduleAmbient() {
        var t = setTimeout(function () {
          if (!dragging && !userActionActive) transientAction(pick(ambientActions));
          scheduleAmbient();
        }, 600000 + Math.random() * 300000);
        timers.push(t);
      }
      scheduleAmbient();

      // Greet once shortly after mount.
      timers.push(
        setTimeout(function () {
          if (!greetingDone) {
            greetingDone = true;
            if (readConfig().bubbles) say(pick(GREET_BUBBLES));
            transientAction("stretch");
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
        });
        if (actionTimer !== null) clearTimeout(actionTimer);
        if (bubbleTimer !== null) clearTimeout(bubbleTimer);
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
      };
    }

    /** Remove the live-video layer on teardown. */
    function disposeBgVideo() {
      if (bgVideo && bgVideo.parentNode) {
        if (bgVideo._syncTimer) clearInterval(bgVideo._syncTimer);
        bgVideo.pause();
        bgVideo.parentNode.removeChild(bgVideo);
      }
      if (bgVeil && bgVeil.parentNode) bgVeil.parentNode.removeChild(bgVeil);
      bgVideo = null;
      bgVeil = null;
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
            disposeBgVideo();
            if (disposer) disposer();
          };
        });
      }
      return ctx.effect(function () {
        var disposer = createPet();
        return function () {
          clearInterval(swapTimer);
          disposeBgVideo();
          disposer();
        };
      });
    }

    exports.apply = apply;
    return module.exports;
  },
});
