/* eslint-disable no-undef */

const devCerts = require("office-addin-dev-certs");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const https = require("https");
const http = require("http");
const zlib = require("zlib");
const { URL } = require("url");

const urlDev = "https://localhost:3000/";
// CHANGE THIS to your GitHub Pages URL before running `npm run deploy`, e.g.:
// "https://your-username.github.io/flip-shift-sync/"
const urlProd = "https://your-username.github.io/flip-shift-sync/";

async function getHttpsOptions() {
  const httpsOptions = await devCerts.getHttpsServerOptions();
  return { ca: httpsOptions.ca, key: httpsOptions.key, cert: httpsOptions.cert };
}

module.exports = async (env, options) => {
  const dev = options.mode === "development";
  const config = {
    devtool: "source-map",
    entry: {
      polyfill: ["core-js/stable", "regenerator-runtime/runtime"],
      taskpane: ["./src/taskpane/index.tsx", "./src/taskpane/taskpane.html"],
      commands: "./src/commands/commands.ts",
    },
    output: {
      clean: true,
    },
    resolve: {
      extensions: [".ts", ".tsx", ".html", ".js"],
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          exclude: /node_modules/,
          use: {
            loader: "babel-loader",
          },
        },
        {
          test: /\.css$/,
          use: ["style-loader", "css-loader"],
        },
        {
          test: /\.html$/,
          exclude: /node_modules/,
          use: "html-loader",
        },
        {
          test: /\.(png|jpg|jpeg|gif|ico)$/,
          type: "asset/resource",
          generator: {
            filename: "assets/[name][ext][query]",
          },
        },
      ],
    },
    plugins: [
      new HtmlWebpackPlugin({
        filename: "taskpane.html",
        template: "./src/taskpane/taskpane.html",
        chunks: ["polyfill", "taskpane"],
      }),
      new CopyWebpackPlugin({
        patterns: [
          {
            from: "assets/*",
            to: "assets/[name][ext][query]",
          },
          {
            from: "manifest*.xml",
            to: "[name]" + "[ext]",
            transform(content) {
              if (dev) {
                return content;
              } else {
                return content.toString().replace(new RegExp(urlDev, "g"), urlProd);
              }
            },
          },
        ],
      }),
      new HtmlWebpackPlugin({
        filename: "commands.html",
        template: "./src/commands/commands.html",
        chunks: ["polyfill", "commands"],
      }),
    ],
    devServer: {
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
      server: {
        type: "https",
        options: env.WEBPACK_BUILD || options.https !== undefined ? options.https : await getHttpsOptions(),
      },
      port: process.env.npm_package_config_dev_server_port || 3000,

      // Dynamic reverse proxy for Flip API and auth requests.
      // Requests to /proxy/* are forwarded to the target specified in the
      // X-Proxy-Target header, with the /proxy prefix stripped.
      // This avoids CORS issues since the browser only talks to localhost.
      setupMiddlewares(middlewares, devServer) {
        // Register proxy BEFORE other middlewares so body parsers don't consume the body
        middlewares.unshift({
          name: "flip-proxy",
          path: "/proxy",
          middleware: (req, res) => {
            const target = req.headers["x-proxy-target"];
            if (!target) {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "Missing X-Proxy-Target header" }));
              return;
            }

            // Collect the request body first, since Express body parsers may
            // have already consumed it or it may still be streaming
            const bodyChunks = [];
            req.on("data", (chunk) => bodyChunks.push(chunk));
            req.on("end", () => {
              try {
                const bodyBuffer = Buffer.concat(bodyChunks);
                const targetUrl = new URL(req.url, target);
                const transport = targetUrl.protocol === "https:" ? https : http;

                // Build outgoing headers — copy from original but remove
                // proxy-specific and browser-origin headers
                const outHeaders = { ...req.headers };
                delete outHeaders["x-proxy-target"];
                delete outHeaders["host"];
                delete outHeaders["origin"];
                delete outHeaders["referer"];
                delete outHeaders["connection"];
                delete outHeaders["accept-encoding"]; // prevent gzip so we can log plaintext
                outHeaders["host"] = targetUrl.host;
                // Fix content-length to match the actual body we're sending
                if (bodyBuffer.length > 0) {
                  outHeaders["content-length"] = String(bodyBuffer.length);
                } else {
                  delete outHeaders["content-length"];
                }

                // Log outgoing request details
                console.log(`[proxy] → ${req.method} ${targetUrl.href}`);
                if (bodyBuffer.length > 0 && bodyBuffer.length < 5000) {
                  console.log(`[proxy] → body: ${bodyBuffer.toString("utf8")}`);
                } else if (bodyBuffer.length >= 5000) {
                  console.log(`[proxy] → body: (${bodyBuffer.length} bytes, too large to log)`);
                }

                const proxyReq = transport.request(
                  targetUrl.href,
                  {
                    method: req.method,
                    headers: outHeaders,
                    rejectUnauthorized: false, // allow self-signed certs on staging
                  },
                  (proxyRes) => {
                    // Collect response body for logging
                    const resChunks = [];
                    proxyRes.on("data", (chunk) => resChunks.push(chunk));
                    proxyRes.on("end", () => {
                      const rawBuf = Buffer.concat(resChunks);
                      console.log(`[proxy] ← ${proxyRes.statusCode} ${targetUrl.pathname}`);

                      // Decompress if needed for logging
                      const encoding = (proxyRes.headers["content-encoding"] || "").toLowerCase();
                      let decompress;
                      if (encoding === "gzip") decompress = zlib.gunzipSync;
                      else if (encoding === "deflate") decompress = zlib.inflateSync;
                      else if (encoding === "br") decompress = zlib.brotliDecompressSync;

                      let resBody;
                      try {
                        resBody = decompress ? decompress(rawBuf).toString("utf8") : rawBuf.toString("utf8");
                      } catch (_e) {
                        resBody = rawBuf.toString("utf8");
                      }

                      if (resBody.length > 0 && resBody.length < 2000) {
                        console.log(`[proxy] ← body: ${resBody}`);
                      } else if (resBody.length >= 2000) {
                        console.log(`[proxy] ← body: (${resBody.length} chars, truncated) ${resBody.substring(0, 500)}...`);
                      }

                      // For users endpoints, extract and log all usernames for debugging
                      if (targetUrl.pathname.includes("/users")) {
                        try {
                          const parsed = JSON.parse(resBody);
                          const userList = parsed.users || parsed.data || (Array.isArray(parsed) ? parsed : []);
                          if (Array.isArray(userList) && userList.length > 0 && userList[0].username) {
                            const names = userList.map(u => `${u.username} → ${u.id}`);
                            console.log(`[proxy] FLIP USERS (${names.length}):`);
                            names.forEach(n => console.log(`  - ${n}`));
                          }
                        } catch (_e) { /* ignore parse errors */ }
                      }
                    });
                    // Still pipe to browser response
                    res.writeHead(proxyRes.statusCode, proxyRes.headers);
                    proxyRes.pipe(res, { end: true });
                  }
                );

                proxyReq.on("error", (err) => {
                  console.error("[proxy] error:", err.message);
                  if (!res.headersSent) {
                    res.writeHead(502, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: `Proxy error: ${err.message}` }));
                  }
                });

                // Write the collected body and end the request
                if (bodyBuffer.length > 0) {
                  proxyReq.write(bodyBuffer);
                }
                proxyReq.end();
              } catch (err) {
                console.error("[proxy] URL error:", err.message);
                if (!res.headersSent) {
                  res.writeHead(500, { "Content-Type": "application/json" });
                  res.end(JSON.stringify({ error: `Proxy URL error: ${err.message}` }));
                }
              }
            });
          },
        });

        return middlewares;
      },
    },
  };

  return config;
};
