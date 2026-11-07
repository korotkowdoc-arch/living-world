# OAuth consent route for LIVING WORLD Bridge

This branch adds `/oauth/consent` to the existing Cloudflare Pages PWA. It is not merged or deployed.

Before a test deployment:
1. Register a dedicated public OAuth client in a separate Supabase test project, using the exact callback URI shown by ChatGPT connector setup.
2. Fill `BRIDGE_OAUTH_CLIENT_ID` and `BRIDGE_OWNER_USER_ID` in `public/oauth/bridge-config.js` with public identifiers from that test project.
3. Deploy this branch to a test Pages URL. Set the **test project's** OAuth Server Site URL to the preview origin and Authorization Path to `/oauth/consent`.
4. Confirm that the clean URL resolves to `consent.html`, carries `authorization_id` intact, and that approve and deny work with an invented world.
5. Do not merge or change the production Supabase Site URL until the full OAuth path and owner checks pass.

The page reuses the PWA's local Supabase configuration when available, requests a publishable key otherwise, validates the signed-in user through `getUser()`, and shows the client, redirect, scopes and account before consent. No service_role or client secret is put into browser code.
