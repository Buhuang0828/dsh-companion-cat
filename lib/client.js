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
    /** The idle breathing animation (transparent GIF). */
    var IDLE_GIF = ASSET_BASE + "/idle.gif";
    /** Day / night wallpapers (2048x1152), swapped by local clock. */
    var BG_DAY = ASSET_BASE + "/background-day.png";
    var BG_NIGHT = ASSET_BASE + "/background-night.png";

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
      "#companion-pet-root{position:fixed;right:24px;bottom:24px;z-index:2147483000;pointer-events:none;-webkit-user-select:none;user-select:none}" +
      "#companion-pet-root .pet-img{width:140px;height:140px;object-fit:contain;pointer-events:auto;cursor:pointer;image-rendering:auto}" +
      "#companion-pet-root .pet-bubble{position:absolute;left:50%;bottom:100%;transform:translateX(-50%);margin-bottom:8px;max-width:220px;padding:8px 12px;border-radius:14px;background:rgba(255,255,255,.95);color:#333;font-size:13px;line-height:1.5;box-shadow:0 4px 16px rgba(0,0,0,.18);white-space:normal;word-break:break-word;transition:opacity .3s ease,transform .3s ease;opacity:0;pointer-events:none}" +
      "#companion-pet-root .pet-bubble::after{content:'';position:absolute;left:50%;top:100%;transform:translateX(-50%);border:6px solid transparent;border-top-color:rgba(255,255,255,.95)}" +
      "#companion-pet-root .pet-bubble.show{opacity:1;transform:translateX(-50%) translateY(-4px)}" +
      /* settings popover */
      "#companion-pet-root .pet-panel{position:absolute;right:0;bottom:calc(100% + 12px);width:230px;padding:14px 16px;border-radius:16px;background:rgba(24,30,52,.92);color:#e8ecf6;font-size:13px;line-height:1.6;box-shadow:0 8px 32px rgba(0,0,0,.35);pointer-events:auto;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,.08)}" +
      "#companion-pet-root .pet-panel-title{font-weight:600;font-size:14px;margin-bottom:10px;color:#fff}" +
      "#companion-pet-root .pet-panel-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:5px 0;color:#cfd6e6}" +
      "#companion-pet-root .pet-panel-row select{background:#12172a;color:#e8ecf6;border:1px solid rgba(255,255,255,.14);border-radius:8px;padding:3px 6px;font-size:12px;outline:none}" +
      "#companion-pet-root .pet-panel-row input[type=checkbox]{accent-color:#6fa8ff;width:15px;height:15px}" +
      "#companion-pet-root .pet-panel-note{color:#8b94ab;font-size:11px;margin-top:10px;padding-top:8px;border-top:1px solid rgba(255,255,255,.08)}";

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
    /** v2: resets any earlier saved density so the default "medium" applies. */
    var CFG_KEY = "companion-pet:config:v2";

    /** Persistent user preferences (local, zero tokens). */
    function readConfig() {
      var def = { bg: true, autoDayNight: true, density: "medium" };
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
     * Density presets: how dark the uniform backdrop veil is. All DSH
     * surfaces stay transparent so the artwork shows through everywhere
     * (background-forward look; text is a bit lighter on the scene).
     */
    function densityAlpha(density) {
      if (density === "high") return 0.52;
      if (density === "low") return 0.3;
      return 0.42; // medium default
    }

    function wallpaperForNow() {
      var h = new Date().getHours();
      return h >= 6 && h < 19 ? BG_DAY : BG_NIGHT;
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
      var cfg = readConfig();
      var url = wallpaperForNow();
      var veil = densityAlpha(cfg.density);
      if (!cfg.bg) {
        style.textContent = "";
        return;
      }
      style.textContent =
        "html{background:#0b1020}" +
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
        /* dark theme: all surfaces transparent so the scene shows through */
        "body[data-ds-dark-theme]{" +
        "--dsw-alias-bg-base:transparent;" +
        "--dsw-alias-bg-layer-1:transparent;" +
        "--dsw-alias-bg-layer-2:rgba(255,255,255,.03);" +
        "--dsw-alias-bg-layer-3:rgba(255,255,255,.05);" +
        "--dsw-alias-bg-module:rgba(255,255,255,.04);" +
        "--dsw-alias-bg-module-hover:rgba(255,255,255,.1);" +
        "--dsw-alias-bg-elevated:rgba(255,255,255,.07);" +
        "--dsw-alias-bg-mask-1:transparent;" +
        "--dsw-alias-bg-mask-2:rgba(255,255,255,.04);" +
        "--dsw-alias-bg-mask-3:rgba(255,255,255,.06);" +
        "--dsw-alias-bg-mask-drop:rgba(0,0,0,.35);" +
        "--dsw-alias-bg-mask-photo:rgba(0,0,0,.3);" +
        "--dsw-alias-bg-overlay:rgba(0,0,0,.32);" +
        "--dsw-alias-bg-skeleton:rgba(255,255,255,.05);" +
        "--dsw-specific-sidebar-fill:transparent;" +
        "--dsw-specific-menu:rgba(22,28,50,.55);" +
        "--dsw-specific-selector:rgba(22,28,50,.55);" +
        "--dsw-specific-tip:rgba(22,28,50,.5);" +
        /* the composer input card stays solid (the one real surface) */
        "--dsw-specific-input-major:rgba(16,21,36,.88);" +
        "--dsw-specific-login-input:rgba(16,21,36,.88);" +
        /* message bubbles moderately solid for text readability */
        "--dsw-specific-bubble:rgba(18,24,42,.62);" +
        "--dsw-specific-bubble-highlight:rgba(26,34,60,.7)" +
        "}" +
        /* light theme: same story with a pale veil */
        "body:not([data-ds-dark-theme]){" +
        "--dsw-alias-bg-base:transparent;" +
        "--dsw-alias-bg-layer-1:transparent;" +
        "--dsw-alias-bg-layer-2:rgba(255,255,255,.35);" +
        "--dsw-alias-bg-layer-3:rgba(255,255,255,.4);" +
        "--dsw-alias-bg-module:rgba(255,255,255,.4);" +
        "--dsw-alias-bg-module-hover:rgba(255,255,255,.55);" +
        "--dsw-alias-bg-elevated:rgba(255,255,255,.5);" +
        "--dsw-alias-bg-mask-1:transparent;" +
        "--dsw-alias-bg-mask-2:rgba(255,255,255,.4);" +
        "--dsw-alias-bg-mask-3:rgba(255,255,255,.45);" +
        "--dsw-alias-bg-mask-drop:rgba(0,0,0,.15);" +
        "--dsw-alias-bg-mask-photo:rgba(0,0,0,.12);" +
        "--dsw-alias-bg-overlay:rgba(0,0,0,.14);" +
        "--dsw-alias-bg-skeleton:rgba(0,0,0,.05);" +
        "--dsw-specific-sidebar-fill:transparent;" +
        "--dsw-specific-menu:rgba(255,255,255,.6);" +
        "--dsw-specific-selector:rgba(255,255,255,.6);" +
        "--dsw-specific-tip:rgba(255,255,255,.55);" +
        "--dsw-specific-input-major:rgba(255,255,255,.88);" +
        "--dsw-specific-login-input:rgba(255,255,255,.88);" +
        "--dsw-specific-bubble:rgba(255,255,255,.66);" +
        "--dsw-specific-bubble-highlight:rgba(244,240,234,.75)" +
        "}" +
        /* code blocks keep a solid dark well so code stays readable */
        "body[data-ds-dark-theme]{--dsw-alias-markdown-code-block:rgba(10,14,24,.82)}" +
        "body:not([data-ds-dark-theme]){--dsw-alias-markdown-code-block:rgba(248,246,242,.85)}";
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

      var img = document.createElement("img");
      img.className = "pet-img";
      img.src = IDLE_GIF;
      img.alt = "小猫";
      img.draggable = false;

      var bubble = document.createElement("div");
      bubble.className = "pet-bubble";

      root.appendChild(bubble);
      root.appendChild(img);
      document.body.appendChild(root);

      var timers = [];
      var bubbleTimer = null;
      var greetingDone = false;

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
        if (isLateNight() && !alreadyReminded()) {
          markReminded();
          say(pick(LATE_BUBBLES));
        }
      }

      /** Click reaction. */
      function onClick() {
        say(pick(CLICK_BUBBLES));
      }

      /**
       * Settings popover: dbl-click the kitten to open it. Lets the user
       * tune wallpaper on/off, center translucency, and day/night auto-swap.
       * Pure DOM + localStorage — zero tokens.
       */
      var panel = null;
      function openPanel() {
        if (panel) {
          panel.remove();
          panel = null;
          return;
        }
        var cfg = readConfig();
        panel = document.createElement("div");
        panel.className = "pet-panel";
        panel.setAttribute("role", "dialog");
        panel.innerHTML =
          '<div class="pet-panel-title">小猫设置</div>' +
          row("背景壁纸", "onoff", "bg", cfg.bg) +
          row("幕布强度", "density", "density", cfg.density) +
          row("昼夜自动切换", "onoff", "autoDayNight", cfg.autoDayNight) +
          '<div class="pet-panel-note">双击小猫开关面板 · 设置自动保存</div>';
        root.appendChild(panel);
        panel.querySelectorAll("[data-key]").forEach(function (el) {
          el.addEventListener("change", function () {
            var key = el.dataset.key;
            if (key === "bg" || key === "autoDayNight") {
              cfg[key] = el.checked;
            } else if (key === "density") {
              cfg[key] = el.value;
            }
            writeConfig(cfg);
            applyWallpaper();
            say(key === "bg" && !cfg.bg ? "背景关掉啦~" : "好哒，已经调好啦~");
          });
        });
      }
      function row(label, kind, key, value) {
        if (kind === "density") {
          return (
            '<label class="pet-panel-row"><span>' +
            label +
            '</span><select data-key="' +
            key +
            '">' +
            '<option value="low"' +
            (value === "low" ? " selected" : "") +
            '>更通透</option>' +
            '<option value="medium"' +
            (value === "medium" ? " selected" : "") +
            '>适中</option>' +
            '<option value="high"' +
            (value === "high" ? " selected" : "") +
            '>更清晰</option>' +
            "</select></label>"
          );
        }
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

      img.addEventListener("click", onClick);
      img.addEventListener("dblclick", openPanel);
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
        if (ANGRY_RE.test(text)) {
          lastMoodAt = now;
          say(pick(ANGRY_BUBBLES));
        } else if (HAPPY_RE.test(text)) {
          lastMoodAt = now;
          say(pick(HAPPY_BUBBLES));
        }
      }

      img.addEventListener("click", onClick);
      document.addEventListener("input", onInput, true);
      timers.push(setInterval(checkLateNight, 60 * 1000));

      // Greet once shortly after mount.
      timers.push(
        setTimeout(function () {
          if (!greetingDone) {
            greetingDone = true;
            say(pick(GREET_BUBBLES));
          }
        }, 1200)
      );

      // Immediate late-night check on mount.
      checkLateNight();

      return function dispose() {
        img.removeEventListener("click", onClick);
        img.removeEventListener("dblclick", openPanel);
        document.removeEventListener("input", onInput, true);
        timers.forEach(function (t) {
          clearInterval(t);
        });
        if (bubbleTimer !== null) clearTimeout(bubbleTimer);
        if (panel) {
          panel.remove();
          panel = null;
        }
        if (root.parentNode) root.parentNode.removeChild(root);
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
    return module.exports;
  },
});
