/* eslint-disable no-undef */
// Production server for Coolify / Docker deployment.
// Serves the static webpack build from dist/ and provides
// a /proxy endpoint that forwards requests to the Flip API
// (replacing the need for the Cloudflare Worker or webpack dev proxy).

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = parseInt(process.env.PORT, 10) || 3000;
const DIST_DIR = path.join(__dirname, "dist");

// Allowed proxy targets (prevent open-proxy abuse)
const ALLOWED_TARGETS = [".flip-app.com", ".getflip.com"];

function isAllowedTarget(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return ALLOWED_TARGETS.some((suffix) => hostname.endsWith(suffix));
  } catch {
    return false;
  }
}

// MIME types for static file serving
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".xml": "application/xml",
  ".map": "application/json",
};

function serveStatic(req, res) {
  let urlPath = req.url.split("?")[0];
  if (urlPath === "/") urlPath = "/taskpane.html";

  const filePath = path.join(DIST_DIR, urlPath);

  // Prevent directory traversal
  if (!filePath.startsWith(DIST_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === "ENOENT") {
        // SPA fallback: serve taskpane.html for unknown routes
        fs.readFile(path.join(DIST_DIR, "taskpane.html"), (err2, data2) => {
          if (err2) {
            res.writeHead(404);
            res.end("Not Found");
          } else {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(data2);
          }
        });
      } else {
        res.writeHead(500);
        res.end("Internal Server Error");
      }
    } else {
      res.writeHead(200, { "Content-Type": contentType });
      res.end(data);
    }
  });
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Proxy-Target",
    "Access-Control-Max-Age": "86400",
  };
}

function handleProxy(req, res) {
  const origin = req.headers["origin"] || "*";
  const cors = corsHeaders(origin);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, cors);
    res.end();
    return;
  }

  const target = req.headers["x-proxy-target"];
  if (!target) {
    res.writeHead(400, { "Content-Type": "application/json", ...cors });
    res.end(JSON.stringify({ error: "Missing X-Proxy-Target header" }));
    return;
  }

  if (!isAllowedTarget(target)) {
    res.writeHead(403, { "Content-Type": "application/json", ...cors });
    res.end(
      JSON.stringify({
        error: "Target domain not allowed. Only *.flip-app.com and *.getflip.com are permitted.",
      })
    );
    return;
  }

  // Collect request body
  const bodyChunks = [];
  req.on("data", (chunk) => bodyChunks.push(chunk));
  req.on("end", () => {
    try {
      const bodyBuffer = Buffer.concat(bodyChunks);
      // Strip /proxy prefix from the URL
      const proxyPath = req.url.replace(/^\/proxy/, "") || "/";
      const targetUrl = new URL(proxyPath, target);
      const transport = targetUrl.protocol === "https:" ? https : http;

      const outHeaders = { ...req.headers };
      delete outHeaders["x-proxy-target"];
      delete outHeaders["host"];
      delete outHeaders["origin"];
      delete outHeaders["referer"];
      delete outHeaders["connection"];
      outHeaders["host"] = targetUrl.host;
      if (bodyBuffer.length > 0) {
        outHeaders["content-length"] = String(bodyBuffer.length);
      } else {
        delete outHeaders["content-length"];
      }

      console.log(`[proxy] -> ${req.method} ${targetUrl.href}`);

      const proxyReq = transport.request(
        targetUrl.href,
        { method: req.method, headers: outHeaders },
        (proxyRes) => {
          // Merge CORS headers into the upstream response
          const responseHeaders = { ...proxyRes.headers, ...cors };
          res.writeHead(proxyRes.statusCode, responseHeaders);
          proxyRes.pipe(res, { end: true });
        }
      );

      proxyReq.on("error", (err) => {
        console.error("[proxy] error:", err.message);
        if (!res.headersSent) {
          res.writeHead(502, { "Content-Type": "application/json", ...cors });
          res.end(JSON.stringify({ error: `Proxy error: ${err.message}` }));
        }
      });

      if (bodyBuffer.length > 0) {
        proxyReq.write(bodyBuffer);
      }
      proxyReq.end();
    } catch (err) {
      console.error("[proxy] URL error:", err.message);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json", ...cors });
        res.end(JSON.stringify({ error: `Proxy URL error: ${err.message}` }));
      }
    }
  });
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith("/proxy")) {
    handleProxy(req, res);
  } else {
    serveStatic(req, res);
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Flip Shift Sync server listening on http://0.0.0.0:${PORT}`);
  console.log(`Static files: ${DIST_DIR}`);
  console.log(`Proxy endpoint: /proxy`);
});
