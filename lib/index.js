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

/** Required services: the web route registry + the credential resolver. */
const inject = ["webServer", "credentials"];

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

  /** Tiny JSON API: GET /companion-pet/api/balance */
  const disposeApi = ctx.webServer.register({
    kind: "prefix",
    path: API_PREFIX,
    handler: async (req, res) => {
      try {
        const url = new URL(req.url ?? "/", "http://localhost");
        if (url.pathname !== `${API_PREFIX}/balance`) {
          res.statusCode = 404;
          res.end("not found");
          return;
        }
        let data = balanceCache.data;
        if (!data || Date.now() - balanceCache.at > BALANCE_TTL_MS) {
          data = await fetchBalance(ctx);
          balanceCache = { at: Date.now(), data };
        }
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        res.end(JSON.stringify(data));
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
