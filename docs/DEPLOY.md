# Deploy to Cloudflare Pages through GitHub

1. Create a separate GitHub repository named `living-world` and upload this source tree. Keep it **public** only after checking the contents; the project is open source.
2. In Cloudflare Dashboard → Workers & Pages → Create application → **Pages** → **Connect to Git**. Choose the **new** `living-world` repository, not another existing app.
3. Set production branch `main`, framework preset `None`, **no build command**, output directory `public`. Deploy.
4. Obtain the new `https://<project>.pages.dev/` URL.
5. Supabase → Authentication → URL Configuration: update Site URL and allowed Redirect URLs to include the new Pages URL (if you use redirect-based auth). Existing Supabase database and user accounts do not need migration.
6. Open the new website on iPhone, enter your existing Supabase Project URL and **publishable** key in the first-time setup form, then use your existing email and password. This browser origin is new, so browser-local configuration and auth session will **not** be copied automatically. The underlying worlds remain in the same Supabase project.
7. Create a test world or open an existing one, reload, and verify it persists before removing any old Cloudflare Pages project.

### Future updates

When the GitHub integration is connected, commits to `main` automatically publish. For safe experiments, use a separate branch and inspect Cloudflare's preview deployment before merging.

### What does NOT migrate

The original Pages URL and its stored browser settings do not automatically become the Git-connected URL. The source code contains no personal worlds, user credentials or backups; those live in the Supabase database.

### Cost

Cloudflare Pages + Supabase each offer free tiers with limits. No paid AI API is enabled. Open-source status does not itself grant usage of the ChatGPT Plus plan in a remotely hosted app.

Official references:
- https://developers.cloudflare.com/pages/configuration/git-integration/
- https://developers.cloudflare.com/pages/get-started/direct-upload/
- https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt
