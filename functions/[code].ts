// Cloudflare Pages Function — file-based dynamic route.
// A file named `[code].ts` under /functions matches exactly one path
// segment (e.g. /Ab3xK9pQ7z), NOT deeper paths — confirmed against
// Cloudflare's current Pages Functions routing docs before writing this
// (developers.cloudflare.com/pages/functions/routing/). The captured
// segment is exposed as context.params.code.
//
// Looks up the code in SoloWorks' `payment_links` table (Supabase) and
// 302-redirects to the real, long, signed Stripe Checkout URL stored
// there. See the main SoloWorks app repo's CLAUDE.md ("Payment Links"
// section) for why this exists: Stripe Checkout URLs are too long/signed
// for an SMS message, and this is a lightweight self-hosted shortener
// rather than a third-party link service, to avoid an external
// dependency/cost at single-trader scale.

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

// Not typed against @cloudflare/workers-types' `PagesFunction` — this repo
// deliberately has no package.json/npm dependencies (see README), and
// Cloudflare's Functions build step transpiles TS via esbuild without a
// full type-check pass, so an untyped `context` doesn't block deploys.
export const onRequest = async (context: {
  request: Request;
  params: Record<string, string | string[]>;
}) => {
  const code = context.params.code as string;

  if (!code) {
    return Response.redirect(new URL("/invalid.html", context.request.url).toString(), 302);
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
  // an invalid code, not an expiry state to distinguish from anything
  // else. Redirect to a plain static page rather than a raw REST error.
  return Response.redirect(new URL("/invalid.html", context.request.url).toString(), 302);
};
