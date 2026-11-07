# LIVING WORLD — open-source PWA (v0.5)

Mobile-first interactive fiction world simulator. Create worlds on iPhone, define their rules and an alternate protagonist backstory, maintain autonomous NPC profiles, branch scenes with **«На это:»**, and preserve story state in an owner-scoped Supabase database.

**Status:** early prototype. The app does **not** automatically call a language model. It offers manually copied prompts and validates imported JSON. Demo generation is marked as demo. A ChatGPT Plus subscription is **not automatically reusable** from a Cloudflare-hosted open-source PWA.

## Features

- World builder on iPhone, character genesis, NPC editor.
- Story scenes and branching history with revision points.
- Structured event/knowledge continuity from up to 200 recent scenes on the active branch.
- Supabase email/password sign-in, RLS and backup export.
- PWA interface deployable as static files; **no Mac server** is needed after deployment.

## Repository layout

- `public/` — Cloudflare Pages static website; publish this directory.
- `supabase/schema.sql` — SQL schema, RLS policies and transaction functions. Review before running in your own Supabase project.
- `test/` — Node.js tests for genesis and continuity.
- `docs/DEPLOY.md` — deployment and safety instructions.

## Test

```bash
npm test
npm run check
```

## Deploy with GitHub + Cloudflare Pages

Create a **new** Cloudflare Pages project with **Connect to Git** and select this repository. Build command: **none**. Build output directory: `public`. Production branch: `main`. Each commit to `main` can then trigger deployment automatically.

If you already have a Cloudflare Pages project created through **Direct Upload**, Cloudflare does not let it switch to Git integration; create a separate Git-connected project and keep the old site intact until you verify the new one.

See [deployment instructions](docs/DEPLOY.md).

## Private data and security

Only application source is public. **Never commit** `.env` files, passwords, access/refresh tokens, Supabase `service_role`/`sb_secret_*` keys, screenshots with private information, backups or world data. The Supabase *Project URL* and **publishable** key are entered in the web app after deployment, not checked into Git. Authentication and Row Level Security (RLS) determine access to private worlds.

Publishing source code is **not** the same as publishing your story. Nonetheless, security depends on proper Supabase configuration. This is an early prototype, not a security audit.

## ChatGPT plan integration

OpenAI's open-source sign-in guidance is primarily for locally run tools/personal projects. A remotely hosted Cloudflare Pages PWA does not receive subscription-backed model access just because its code is public. Check the current developer terms and obtain any required access before implementing plan sharing. This app does not include OAuth tokens or paid OpenAI API calls.

## License

MIT (see `LICENSE`).
