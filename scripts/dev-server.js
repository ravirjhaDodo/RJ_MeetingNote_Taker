/**
 * Zero-dependency static dev server for public/.
 * Serves the site exactly like production (real Firebase + real /api/rj via CORS),
 * no emulators/Java required. Usage: npm run dev  (override port with PORT env).
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "public");
const PORT = Number(process.env.PORT || 4175);
const HOST = process.env.HOST || "127.0.0.1";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
};

async function resolveFile(pathname) {
  const safePath = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  let filePath = join(ROOT, safePath);
  if (!filePath.startsWith(ROOT)) return null;
  try {
    const info = await stat(filePath);
    if (info.isDirectory()) filePath = join(filePath, "index.html");
    await stat(filePath);
    return filePath;
  } catch {
    return null;
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let filePath = await resolveFile(url.pathname === "/" ? "/index.html" : url.pathname);

  // SPA-style fallback: extensionless route -> try .html, else index.html.
  if (!filePath && !extname(url.pathname)) {
    filePath = (await resolveFile(`${url.pathname}.html`)) || (await resolveFile("/index.html"));
  }

  if (!filePath) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("404 Not Found");
    return;
  }

  try {
    const body = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": MIME[extname(filePath).toLowerCase()] || "application/octet-stream",
      // Never cache during local dev so config/JS changes are always picked up
      // (avoids stale firebase-config.local.js silently using emulator mode).
      "Cache-Control": "no-store, max-age=0",
    });
    res.end(body);
  } catch {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("500 Internal Server Error");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Local dev (prod-like) serving public/ at http://${HOST}:${PORT}`);
  console.log("Uses real Firebase Auth + deployed /api/rj — no emulators needed.");
});
