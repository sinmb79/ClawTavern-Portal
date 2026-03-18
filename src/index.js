const SECURITY_HEADERS = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "X-XSS-Protection": "1; mode=block",
  "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://base-rpc.publicnode.com https://mainnet.base.org https://basescan.org; img-src 'self' data: blob: https:; frame-ancestors 'none'; base-uri 'self'"
};

function applySecurityHeaders(response, pathname) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(key, value);
  }

  if (pathname === "/admin" || pathname === "/admin/" || pathname.startsWith("/admin/")) {
    headers.set("X-Robots-Tag", "noindex, nofollow");
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function buildRedirect(url, pathname, status = 301) {
  const next = new URL(url.toString());
  next.pathname = pathname;
  return Response.redirect(next.toString(), status);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.hostname === "clawtavern.quest") {
      const canonical = new URL(url.toString());
      canonical.hostname = "www.clawtavern.quest";
      return Response.redirect(canonical.toString(), 301);
    }

    if (url.pathname === "/nft") {
      return buildRedirect(url, "/nft/metadata/1.json", 302);
    }

    const assetUrl = new URL(url.toString());
    if (assetUrl.pathname === "/app") {
      assetUrl.pathname = "/app/index.html";
    } else if (assetUrl.pathname === "/admin") {
      assetUrl.pathname = "/admin/index.html";
    } else if (assetUrl.pathname === "/game" || assetUrl.pathname === "/game/") {
      assetUrl.pathname = "/game/index.html";
    }

    const assetRequest = assetUrl.toString() === url.toString()
      ? request
      : new Request(assetUrl.toString(), request);

    const response = await env.ASSETS.fetch(assetRequest);
    return applySecurityHeaders(response, url.pathname);
  }
};
