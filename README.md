# soloworks-pay

Short-link redirector for [SoloWorks](https://github.com/jfshaw79) payment links.

Stripe Checkout URLs are long and cryptographically signed — not something
you can put in an SMS. This repo maps a short, random code
(`/{code}`) to the real Checkout URL and 302-redirects to it. Codes are
minted server-side by the main app's `create-checkout-session` Supabase Edge
Function and stored in a Supabase table (`payment_links`); see that repo's
`CLAUDE.md` ("Payment Links" section) for the full design — including why
this is a small self-hosted shortener rather than a third-party link
service.

## How it works

A plain Cloudflare Worker, not Cloudflare Pages — this was originally built
on Pages Functions, then converted because Pages proved unreliable to
provision on this account (persistent Pages-API auth errors despite full
admin rights and correctly-scoped tokens) and is in maintenance mode per
Cloudflare's own current documentation; Workers is the actively supported
path.

- `src/index.ts` — the Worker's entry point (`wrangler.jsonc`'s `main`), a
  standard module-syntax `fetch` handler. Reads the requested path directly
  off the incoming `Request`'s URL, strips the leading slash to get the
  code, looks it up in `payment_links` via Supabase's REST API (anon/
  publishable key — safe to commit, read-only by RLS), and 302-redirects to
  `target_url` if found.
- No separate static fallback page — the "this payment link isn't valid"
  HTML (shown for a bad/typo'd/never-existed code) is inlined directly in
  `src/index.ts` (`INVALID_LINK_HTML`) rather than kept as its own file,
  since a plain Worker has no static-asset hosting and a single fallback
  page doesn't warrant adding one just to serve it.
- `wrangler.jsonc` — Worker config (`name`, `main`, `compatibility_date`).
  Workers require this; Pages Functions didn't.
- `package.json` — `wrangler` as a devDependency only, so `npx wrangler
  deploy` (Cloudflare Workers Builds' default deploy command) resolves a
  pinned version. No other dependencies.

## Deploy

No framework, no build step beyond `npm install` — just `wrangler` itself.
Intended to be connected to Cloudflare Workers Builds for auto-deploy on
push to `main` (replacing the old Pages git integration); can also be
deployed manually with `npm run deploy`.

**Short-link base URL**: the main app's `create-checkout-session` Edge
Function currently hardcodes `https://soloworks-pay.pages.dev` as the short
link base — that was this repo's old Pages URL and needs updating to
whatever this Worker's real URL ends up being (a `*.workers.dev` subdomain,
or a custom domain) once it's deployed and connected. Not yet done as part
of this conversion — see the main app repo's `CLAUDE.md`.
