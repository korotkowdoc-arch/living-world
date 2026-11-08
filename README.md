# LIVING WORLD — open-source PWA (v0.9)

Mobile-first interactive fiction world simulator. Create worlds on iPhone, define their rules and an alternate protagonist backstory, maintain autonomous NPC profiles, branch scenes with **«На это:»**, and preserve story state in an owner-scoped Supabase database.

**Status:** early prototype. Automatic AI generation is available only when the owner deploys the private AI gateway and sets OPENAI_API_KEY as a Cloudflare Worker secret; otherwise the manual prompt fallback remains. Quick start prepares a prompt, opens ChatGPT through a user action, and validates the JSON pasted or read from clipboard (when supported). Demo generation is marked as demo. A ChatGPT Plus subscription is **not automatically reusable** from a Cloudflare-hosted open-source PWA.

## Features

- Life simulation, story fast-forward and an explicit stop/"start playing here" action. Each interval is one reviewed JSON package; continuous automatic simulation requires future direct AI access.
- Scene length presets: 1500–3000, 3000–5000 and 5000–8000 words as **suggested targets**, not output guarantees.
- Four-decision quick start: choose how the hero reacts, then copy an AI genesis prompt that requests independently motivated NPCs. Review and import the generated JSON before approving the world.
- Original-world / existing-AU choice, optional NPC names and single-sentence world premise; advanced settings remain available.
- Two one-tap story prompt modes: GPT-6 · Высокое for plotting, GPT-5.6 · Высокое for relationships. Their selection changes prompt content and is remembered per world, **but cannot programmatically change the actual ChatGPT model**.
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

## Creating a new world quickly

1. In **Миры**, tap **Новая вселенная**. Four interactive decisions profile the hero; they are not recorded as literal past events.
2. Enter a hero name, optional world setting/NPC hints, choose existing AU or original setting and a start time.
3. Tap **Скопировать запрос для ИИ**, then **Открыть ChatGPT**. Select an available model there and paste the prompt. The model returns full JSON character biographies.
4. Copy the JSON, return to **Генезис**, choose **Вставить ответ из буфера** when clipboard permissions permit (or paste manually), inspect the characters and approve. No individual character biography needs to be typed.
5. During play, use **GPT-6 · Высокое** or **GPT-5.6 · Высокое** cards to prepare different prompts against the same world state. Change actual model/effort from the ChatGPT selector manually.

**Limitations:** There is no built-in paid AI generation or automatic model switching; neither ChatGPT subscriptions nor the OAuth MCP bridge make model-selection controls available to an external website. Manual copy/paste is still needed. The active-branch causal memory spans at most the last 200 scenes; archival snapshots and full source-document storage are future work. Do not mistake the model-mode buttons for API calls.

## Automatic AI mode

Read [docs/AUTOMATION.md](docs/AUTOMATION.md). The private Worker generates and atomically saves a single scene or simulated time interval directly in Supabase; rapid character genesis is generated and offered for approval. This feature requires a configured OpenAI API account and server-side key. No credentials are embedded in public Pages code.

## Primary mode — ChatGPT + companion state

Long-form scenes are authored in ChatGPT on the user's subscription. **LIVING WORLD is the archive and causal ledger**, not a requirement to manually copy the text. The OAuth MCP bridge now exposes read tools for world state, active-branch history and `get_companion_state`, and a user-approved `save_scene_package` write tool. The live Worker must advertise `writes_enabled:true`; the separate OpenAI API gateway remains strictly optional and is not the primary user journey.

The **Активы** companion screen replays scene-embedded structured events across the complete known lineage: money accounts, ownership and current holders of property, and introduced independent NPCs. All ledger events cite a source in their scene. If any amount is unknown, the display remains explicitly unknown; alternative branches never contaminate one another. Full scene history is required to calculate correct balances; if the scene window exceeds the cap, the screen reports the limitation instead of inventing numbers.
