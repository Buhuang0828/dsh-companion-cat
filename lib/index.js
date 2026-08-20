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

/** Required services: the web route registry. */
const inject = ["webServer"];

/** Route prefix serving the pet assets; no trailing slash. */
const PREFIX = "/companion-pet/assets";

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
 * Mount the static asset route. The assets live beside this file, so the
 * route root is stable regardless of where the profile installs the package.
 */
function apply(ctx) {
  const root = normalize(dirname(fileURLToPath(import.meta.url)) + "/../assets");
  const dispose = ctx.webServer.register({
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
  return () => {
    dispose();
  };
}

export { apply, inject, name };
