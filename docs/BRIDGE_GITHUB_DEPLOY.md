# LIVING WORLD Bridge — GitHub/Cloudflare release

Source: `bridge/index.js` (Bridge v8). The read-only Supabase migrations were
applied separately; do not re-run database migrations for this MCP fix.

## Why v8

The OAuth login can succeed while ChatGPT fails MCP action discovery.
Version 2026-07-28 requires `resultType: "complete"` in discovery/list results.
`server/discover`, `initialize` and `tools/list` serve **metadata only**
without requiring a Bearer token; **every real `tools/call` in live mode**
still verifies the owner, OAuth client, audience, token freshness and session.
This is intentional: the names/schemas of tools are not user data.

## Connect the existing Worker to GitHub (one-time, in Cloudflare)

1. Open `living-world-bridge-mcp` > **Settings > Builds > Connect**.
2. Select GitHub repo `korotkowdoc-arch/living-world` and production branch `main`.
3. Set **Root directory:** `bridge`.
4. Leave **Build command** empty. Use **Deploy command:** `npx wrangler deploy`.
5. Confirm existing Worker name `living-world-bridge-mcp` and save connection.
6. Trigger a new commit after connecting (or use the available build/deploy
   control if Cloudflare provides one) and check active deployment.

`bridge/wrangler.jsonc` contains `keep_vars:true` to preserve existing
dashboard variables (including `BRIDGE_MODE=live`, Supabase URL, public key and
owner ID). The `BRIDGE_SEAL_KEY` remains a **Cloudflare Secret** and is NOT
stored in this public GitHub repository. Do not add `BRIDGE_WRITES_ENABLED`.
Do not paste access tokens/passwords/API secrets into GitHub.

## Pages distinction

The main PWA (`livingworld-35q.pages.dev`) uses GitHub `main` /
`public`. The OAuth consent site (`living-world-a3c.pages.dev`) was
published with **Direct Upload** and is NOT linked to this repository.
Its current `/oauth/consent` and `/oauth/bridge-config.js` were separately
deployed and are mirrored under `public/oauth` here. GitHub updates will **not**
automatically redeploy the old Direct Upload site.

The OAuth callback pinned in the consent config is
`https://chatgpt.com/connector/oauth/HxIGFsGIWFrG`. If a **new** ChatGPT
plugin is created and has a different callback, update its Supabase OAuth
application registration and consent config together.

## First post-connection deployment

After linking the existing Cloudflare Worker to repository `korotkowdoc-arch/living-world`
with branch `main` and root directory `bridge`, this Git commit triggers the
first Workers Builds deployment. Verify build status under **Settings > Builds**
and that the live Worker answers MCP discovery before reconnecting ChatGPT.
Do not change `BRIDGE_MODE=live` or enable scene writes to troubleshoot discovery.

## Validate

- `npm test` (includes Bridge no-token-discovery and read-only enforcement)
- In Cloudflare verify `BRIDGE_MODE=live`, `BRIDGE_WRITES_ENABLED` absent.
- In ChatGPT plugin refresh/reconnect and verify `list_worlds` returns
  `{"mode":"live","worlds":[]}` before creating a world.
- If OAuth still fails, inspect Cloudflare Worker logs and JWT hook claims;
  do not disable validation to make the tests pass.
