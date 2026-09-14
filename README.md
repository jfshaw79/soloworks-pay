# soloworks-pay

Short-link redirector for [SoloWorks](https://github.com/jfshaw79) payment links.

Stripe Checkout URLs are long and cryptographically signed — not something
you can put in an SMS. This repo maps a short, random code
(`soloworks-pay.pages.dev/{code}`) to the real Checkout URL and 302-redirects
to it. Codes are minted server-side by the main app's `create-checkout-session`
Supabase Edge Function and stored in a Supabase table (`payment_links`); see
that repo's `CLAUDE.md` ("Payment Links" section) for the full design —
including why this is a small self-hosted shortener rather than a
third-party link service.

## How it works

- `functions/[code].ts` — a Cloudflare Pages Function. The `[code]` filename
  is Cloudflare's file-based routing convention for capturing a single URL
  segment (`/Ab3xK9pQ7z` → `context.params.code`), confirmed against
  Cloudflare's current Pages Functions docs. It looks the code up in
  `payment_links` via Supabase's REST API (anon/publishable key — safe to
  commit, read-only by RLS) and redirects to `target_url` if found.
- `invalid.html` — plain static fallback page shown when a code isn't found
  (typo'd, malformed, or otherwise doesn't exist).

## Deploy

No framework, no build step, no npm dependencies — plain static files plus
one Pages Function. Connected to Cloudflare Pages for auto-deploy on push to
`main`.
