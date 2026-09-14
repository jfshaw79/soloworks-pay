// Cloudflare Worker — plain fetch handler, no framework.
//
// Converted from a Cloudflare Pages Function (functions/[code].ts) because
// Pages proved unreliable to provision on this account (persistent Pages-API
// auth errors despite full admin rights and correctly-scoped tokens) and is
// in maintenance mode per Cloudflare's own current documentation — Workers
// is the actively supported path, confirmed before making this switch.
//
// Looks up a short code (the request path, leading slash stripped) in
// SoloWorks' `payment_links` table (Supabase) and 302-redirects to the
// real, long, signed Stripe Checkout URL stored there. See the main
// SoloWorks app repo's CLAUDE.md ("Payment Links" section) for why this
// exists: Stripe Checkout URLs are too long/signed for an SMS message, and
// this is a lightweight self-hosted shortener rather than a third-party
// link service, to avoid an external dependency/cost at single-trader
// scale.

interface PaymentLinkRow {
  target_url: string;
}

// Supabase project ref gkxvgfcumqhoyhworsfd (SoloWorks' `tradeflow`
// project). The publishable key below is safe to commit — it's designed
// to be public, is already shipped inside the SoloWorks mobile app, and
// can only do what RLS allows: for `payment_links`, that's read-only
// lookup by exact code (see schema_v10.sql's "payment_links_public_read"
// policy — no insert/update/delete policy exists for this key at all).
const SUPABASE_URL = "https://gkxvgfcumqhoyhworsfd.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_4USZ3wa8ypxxqjboty46nw_SQ9Q_FRH";

// Same copy as the old invalid.html, inlined directly rather than kept as a
// separate static file — a plain Worker has no static-asset hosting, and a
// single fallback page doesn't warrant adding one (e.g. Workers Sites/
// Assets) just to serve it.
const INVALID_LINK_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Link not valid</title>
<style>
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #F7F7F5;
    color: #1A1A1A;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    margin: 0;
    padding: 24px;
    text-align: center;
  }
  .icon {
    width: 56px; height: 56px;
    border-radius: 50%;
    background: rgba(107,114,128,0.12);
    color: #6B7280;
    font-size: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 20px;
  }
  h1 { font-size: 18px; font-weight: 700; margin: 0 0 8px; }
  p { font-size: 14px; color: #6B7280; margin: 0; }
</style>
</head>
<body>
  <div class="icon">✕</div>
  <h1>This payment link isn't valid</h1>
  <p>Please contact the business that sent it to you for a new one.</p>
</body>
</html>
`;

function invalidLinkResponse(): Response {
  return new Response(INVALID_LINK_HTML, {
    status: 404,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

// Not typed against @cloudflare/workers-types — this repo deliberately has
// no bindings/env vars (the Supabase key is a hardcoded constant above, see
// its comment for why that's safe), and the Worker runtime's global
// `Request`/`Response` types (from the TS DOM lib) are enough to cover
// everything this handler actually touches.
export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const code = url.pathname.replace(/^\//, "");

    if (!code) {
      return invalidLinkResponse();
    }

    const lookupUrl =
      `${SUPABASE_URL}/rest/v1/payment_links` +
      `?code=eq.${encodeURIComponent(code)}` +
      `&select=target_url`;

    const res = await fetch(lookupUrl, {
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      },
    });

    if (res.ok) {
      const rows = (await res.json()) as PaymentLinkRow[];
      if (rows.length > 0 && rows[0].target_url) {
        return Response.redirect(rows[0].target_url, 302);
      }
    }

    // Not found (bad/typo'd/never-existed code) — a payment link is never
    // deleted once created (see CLAUDE.md), so "not found" here just means
    // an invalid code, not an expiry state to distinguish from anything else.
    return invalidLinkResponse();
  },
};
