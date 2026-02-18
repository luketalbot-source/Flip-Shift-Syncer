// ============================================================
// Cloudflare Worker — CORS Proxy for Flip Shift Sync
// ============================================================
//
// This worker acts as a CORS proxy, forwarding requests from the
// GitHub Pages–hosted Excel Add-in to the Flip API.
//
// How it works:
//   1. The add-in sends a request to this worker with an
//      "X-Proxy-Target" header containing the Flip base URL.
//   2. The worker strips the header, builds the target URL,
//      forwards the request, and returns the response with
//      CORS headers so the browser allows it.
//
// Deploy:
//   npx wrangler deploy
//
// ============================================================

/** Only allow proxying to these domains (prevents open-proxy abuse) */
const ALLOWED_TARGETS = [".flip-app.com", ".getflip.com"];

function isAllowedTarget(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return ALLOWED_TARGETS.some((suffix) => hostname.endsWith(suffix));
  } catch {
    return false;
  }
}

/** CORS headers to attach to every response */
function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Proxy-Target",
    "Access-Control-Max-Age": "86400",
  };
}

export default {
  async fetch(request: Request): Promise<Response> {
    const origin = request.headers.get("Origin") || "*";

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(origin),
      });
    }

    // Read the target base URL from the X-Proxy-Target header
    const targetBase = request.headers.get("X-Proxy-Target");
    if (!targetBase) {
      return new Response(
        JSON.stringify({ error: "Missing X-Proxy-Target header" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
        }
      );
    }

    // Validate the target is an allowed Flip domain
    if (!isAllowedTarget(targetBase)) {
      return new Response(
        JSON.stringify({ error: "Target domain not allowed. Only *.flip-app.com and *.getflip.com are permitted." }),
        {
          status: 403,
          headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
        }
      );
    }

    // Build the target URL: targetBase + request path (strip any worker-specific prefix)
    const requestUrl = new URL(request.url);
    const targetUrl = `${targetBase.replace(/\/+$/, "")}${requestUrl.pathname}${requestUrl.search}`;

    // Forward the request, stripping browser-specific headers
    const forwardHeaders = new Headers(request.headers);
    forwardHeaders.delete("X-Proxy-Target");
    forwardHeaders.delete("Origin");
    forwardHeaders.delete("Referer");
    forwardHeaders.set("Host", new URL(targetBase).hostname);

    try {
      const upstreamResponse = await fetch(targetUrl, {
        method: request.method,
        headers: forwardHeaders,
        body: request.method !== "GET" && request.method !== "HEAD" ? request.body : undefined,
      });

      // Return the upstream response with CORS headers added
      const responseHeaders = new Headers(upstreamResponse.headers);
      for (const [key, value] of Object.entries(corsHeaders(origin))) {
        responseHeaders.set(key, value);
      }

      return new Response(upstreamResponse.body, {
        status: upstreamResponse.status,
        statusText: upstreamResponse.statusText,
        headers: responseHeaders,
      });
    } catch (err) {
      return new Response(
        JSON.stringify({
          error: "Proxy request failed",
          detail: err instanceof Error ? err.message : String(err),
        }),
        {
          status: 502,
          headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
        }
      );
    }
  },
};
