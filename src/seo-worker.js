// Fronts the static site so URL-normalization redirects are 301 (permanent)
// instead of the 307 that Workers static assets emit for html_handling.
// Search Console HTML verification files are served at their exact paths.

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (/^\/google[0-9a-f]+\.html$/i.test(pathname)) {
      const assetUrl = new URL(request.url);
      assetUrl.pathname = pathname.replace(/\.html$/i, "");
      const asset = await env.ASSETS.fetch(new Request(assetUrl, request));
      const body = await asset.arrayBuffer();
      const headers = new Headers(asset.headers);
      headers.set("content-type", "text/html; charset=utf-8");
      return new Response(body, { status: 200, headers });
    }

    if (pathname.length > 1 && pathname.endsWith("/")) {
      url.pathname = pathname.replace(/\/+$/, "");
      return Response.redirect(url.toString(), 301);
    }

    if (pathname.endsWith(".html")) {
      url.pathname = pathname.slice(0, -5);
      return Response.redirect(url.toString(), 301);
    }

    return env.ASSETS.fetch(request);
  },
};
