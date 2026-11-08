# LIVING WORLD OAuth consent on the existing Pages project

The registered **public** OAuth client is `f08a0ef2-bdfc-4d0d-b9ab-ce900c85e0d6`. Its only redirect URI is `https://chatgpt.com/connector/oauth/3f5za3GcoasC`; `token_endpoint_auth_method` is `none`. Supabase OAuth Server's Site URL remains `https://living-world-a3c.pages.dev` and Authorization Path remains `/oauth/consent`.

The consent page uses Supabase's `getAuthorizationDetails`, `approveAuthorization`, and `denyAuthorization` API. A valid `authorization_id` arrives from Supabase. The screen checks the signed-in owner, client ID and exact redirect URI before enabling approval. The static owner check is user experience, **not** a security boundary: the Worker must independently verify the bearer token and owner ID. No `service_role`, client secret or paid AI API is used.

## Build a complete deployment

1. In Supabase Authentication > Users, verify the account that owns the worlds and its UUID. Supply that UUID to `BRIDGE_OWNER_USER_ID` in the build environment; do not commit it to the public repository. The build injects it into a public static asset, so treat the identifier as publicly observable.
2. Confirm that this branch's `public/` matches every file in the **current production deployment**, not just GitHub `main`. The existing Pages project was deployed manually; any production-only changes must be copied into this branch before replacing it. In the November 2026 inspection, `app.js` had a production-only Supabase link, which was synchronized here.
3. Run `BRIDGE_OWNER_USER_ID=<verified-uuid> npm run build:consent`, then `npm run check && npm test`. Deploy the **entire** `dist-pages/` directory, never `public/oauth/` by itself.
4. In Cloudflare dashboard > Workers & Pages > the existing Pages project > Deployments, record the current production deployment ID and confirm **Rollback to this deployment** is available. Do not create a replacement project or change its domain.
5. Upload `dist-pages/` as a **preview deployment** first. On its preview URL, check `/`, `/oauth/consent`, `/oauth/consent?authorization_id=invalid-test`, `/style.css`, `/app.js`, `/logic.mjs`, `/continuity.mjs`, `/sw.js`, manifest and icons. The clean consent route must have title `LIVING WORLD · разрешить доступ`, not the PWA title. An invented authorization ID must fail closed without attempting approval.
6. Deploy the same complete directory to **production** in that existing Pages project. Verify `https://living-world-a3c.pages.dev/oauth/consent` is the consent screen and `/` is still the PWA. If either fails, use the recorded deployment's three-dot menu > Rollback to this deployment.

Cloudflare Pages serves a matching `oauth/consent.html` at the extensionless `/oauth/consent`. The PWA service worker only handles a fixed shell file list and does not intercept `/oauth/consent`. Existing Supabase URL configuration, SQL, worlds and the Bridge Worker are outside this deployment.

The page cannot complete a real OAuth grant from a made-up `authorization_id`. A real consent flow should only be started after the page is deployed and the separate server and database restrictions are reviewed. Scene writes remain disabled.
