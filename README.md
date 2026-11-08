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

## Document authority and character knowledge

The private document library is defined in `supabase/reference_docs.sql`; apply it in the Supabase SQL editor **once**. Then import full DOCX/TXT/Markdown source files under **Документы**. The app stores text, immutable revisions, SHA-256 and type-specific precedence. Missing schema is reported explicitly; a working UI does not imply documents are installed.

The MCP gateway exposes `get_reference_catalog`, `get_reference_document` (chunked full text), `get_scene_preflight`, and `get_character_memory`. `get_story_context` includes a source manifest, selected rules and a branch-derived character summary. The **Герои** screen distinguishes facts personally learned (with channels and source scenes) from subjective beliefs. The **Активы** home screen shows readiness of source documents and causal memory before play.

No model can guarantee every psychological reaction is right. Strict factual ledger validation checks impossible purchases, ownership and known chronology, while source and character checks supply evidence for model reasoning; automated semantic auditing and durable year-spanning snapshots remain future work.

## v1.2 first-step world setup and contextual delete

The **New World** wizard offers copying a selected allowlist of source documents **before Genesis or life simulation**. Old played history, money, character sheets and checkpoints are never copied automatically. On the **Миры** page, a normal tap/click opens the world; long-press on mobile or right-click on desktop opens its contextual menu. **Удалить → Да** deletes only the chosen owner's world and cascades through its history and documents; **Нет** cancels. No typing the world name or permanently visible delete button. The actions remain protected by Supabase owner RLS.

## v1.3 reliable scene receipts and complete backups

ChatGPT stories are saved through the owner-authenticated Cloudflare OAuth MCP connector after its tool list is refreshed. The live server exposes an opt-in \`save_scene_auto\` and \`get_scene_receipt\` to verify exact writes. The scene \`request_id\` maps to the immutable DB scene primary key. Retrying the **same** ID + text + time + source changes returns \`already_saved:true\` and never charges resources twice; reusing an ID with a different payload is rejected. Network errors after a commit trigger receipt reconciliation. Never switch a new ID after an uncertain outcome.

The companion Assets screen displays active branch head, last saved scene and whether its structured consequences can be read. Reloading Assets re-reads Supabase before replaying resources.

Full backups use \`living-world-cloud-v1.0\` (legacy v0.3 still imports). They contain every branch, scene, character and all revisions of source documents; a SHA-256 integrity seal verifies the whole archive. A failed restore deletes only its incomplete copy, **not** the original world; a completed restore survives dashboard/UI refresh errors. Imported copies reset automatic-write permissions.

The source-document library is already installed, but the current ChatGPT OAuth connector's cached schema may still expose **read-only** actions. Updating the Worker is not enough to grant this chat write tools. Refresh/reconnect that connector and confirm \`save_scene_auto\` is discoverable before claiming automated writing works. The legacy developer bridge is demo-only and must never be used as a substitute for live saves.

Remaining blockers: one real persisted scene from the refreshed OAuth client, semantic review of literary scenes, durable checkpoints beyond 200 narrative scenes and full reversible revision deltas for «На это:».

## v1.4 durable causal replay

The current branch's facts, opened/resolved threads and offscreen events are now replayed from confirmed scene ancestry rather than the prior 200-scene preview. Each event has the original scene ID and recorded world time, and can be searched or paged. The `get_world_state`, `get_story_context` and `get_scene_preflight` responses include a full-lineage causal summary and clearly distinguish incomplete history. The `get_causal_memory` OAuth tool offers older facts and source evidence on demand. The companion's Memory page searches across up to 3,000 archived world scenes instead of claiming that the most recent 200 are the whole world. A durable snapshot system for longer worlds remains to be built; beyond the current cap the app reports incomplete state rather than fabricating facts.

## v1.5 owner-only live save diagnostic

Use **Настройки → Диагностика настоящих сейвов → Проверить сейвы в реальной базе** while signed in. The site sends the owner's current Supabase access token only to the existing Cloudflare Worker over HTTPS. The diagnostic API validates the authenticated owner and exact deployed Pages origin, creates a temporary world, invokes the exact `save_scene_auto` server command, retries with the same UUID, reads the branch head, money and item ledger, then deletes that temporary world. It never edits existing worlds, genres, histories, documents or characters. The UI reports the temporary world ID if cleanup fails so the owner can delete it.

This proves the live Cloudflare/Supabase save path, **not the ChatGPT OAuth plugin tool refresh**. The active OAuth connector in this chat may still expose only three read actions; disconnecting/reconnecting it is a separate user account action. Do not claim automatic saves from the chat until `save_scene_auto` is visible to this ChatGPT session and a true scene package has been persisted and reread.

Smoke failures and incomplete cleanup are displayed explicitly; the test is never silently marked successful.

## v1.5.1 first_scene / database RPC troubleshooting

A diagnostic failure at \`first_scene\` means the server got as far as attempting the first write, not that a scene reached Supabase. The worker previously reduced all non-auth database errors to a generic message. The diagnostic now reports safe allowlisted PostgREST error codes in Settings. \`PGRST202\` or \`42883\` means the owner should run \`supabase/bridge_save.sql\` in Supabase SQL Editor; \`42501\` means permission error, and \`LW409\` means branch-head drift. This script defines the exact atomic seven-argument \`lw_bridge_v2_append\` SQL RPC expected by Cloudflare and grants only authenticated owners execution; it does not reset any world or played scene. Once installed, rerun the temporary-world diagnostic and verify full round trip. Do not call the save path proven until that owner-session round trip passes.

## v1.5.2 in-app autosave consent

In some mobile in-app browsers JavaScript's native `confirm()` may be suppressed; previously tapping **Разрешить автосохранение сцен** could silently do nothing. The Settings toggle now opens an in-app **Да, разрешить / Нет** confirmation. Only the positive action updates `genesis_choices.auto_save_enabled` for the current authenticated owner's selected world. The client then performs a fresh read from Supabase and reports success only when the new value is persisted. Other Genesis settings are preserved; turning off auto-save remains possible at any time. The UI always reflects the setting rather than assuming permission from a tap. Tests protect the confirmation and readback flow.

## v1.5.3 per-world autosave in the library

The **Миры** page shows a dedicated **Автосейв сцен** on/off switch directly below each world card. Each switch is independent and can update that world without opening it; the card itself still opens normally and supports long-press/right-click deletion. Enabling autosave on one world never toggles other worlds. The authenticated client updates only that world's `genesis_choices.auto_save_enabled`, preserving existing Genesis choices, then re-reads Supabase before showing the new state. While saving, the switch is disabled and displays verification progress; failures re-fetch the library and report an error without optimistic success. Global Settings now takes the user to these visible switches. v1.5.3 refreshes the PWA shell so mobile browsers receive the new UI.
