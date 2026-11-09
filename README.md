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

## v1.5.4 native autosave switch regression fix

The old v1.5.3 per-world switch was a custom **button** routed through the global click/busy gate. On certain mobile in-app browsers, or while a previous app request was pending, the click could be silently ignored. **Миры** now renders a native labeled `input type="checkbox"` for each world. Its dedicated `change` listener bypasses the generic `withBusy` click gate. The checkbox is outside the card's Open button and has a 64px touch target; each switch is independent.

The client immediately displays **Сохранение настройки в Supabase…**, preserves all Genesis fields, writes only that owner's requested world and reads back the setting before showing `Включён` or `Выключен`. If a query times out or fails, the card displays a persistent explanatory error and reloads actual state; there is no optimistic success. Revisiting the library refreshes the latest server values. The PWA shell and import URLs are versioned to v1.5.4 to avoid old cached controls. Regression tests **execute** the native change handler despite `state.busy=true`, verify exact DB updates and isolation, and test network failure visibility. No SQL migration required.


## v1.6.0 — branch-safe annual archives and birth-first Genesis

**From birth to age fifteen.** Create one world starting on the hero's actual birth month (e.g. 1980-07 for Harry born 1980-07-31), set hero age to `0`, choose "Сначала симулировать жизнь героя", and approve a Genesis that records only the circumstances known **at birth**. The generator now explicitly forbids inventing already-played childhood or fixed adult traits. Run **История → Прогон жизни** one step at a time (week/month/quarter/halfyear/year). A step may stop early at a consequential decision. After reaching the desired actual date, choose **Начать играть отсюда / Стоп**. There is no unattended automatic 15-year batch and no promise that the optional AI gateway is configured; each step must be saved and verified.

**Archive a completed period.** In **Документы → Итоговый документ года**, supply inclusive start/end months (maximum thirteen named months, e.g. `1998-09`–`1999-08`). A completed scene must already exist in or beyond the end month. Click **Сформировать годовой отчёт** to recompute the active ancestry and produce an auditable factual draft. Review the source scene IDs, facts, open/resolved promises, resources, NPCs and personal knowledge. Click **Утвердить и сохранить Year Document** to create an immutable `year_document` revision in the world's private Supabase source library. The connected OAuth bridge can read the document from any chat. The tool never alters scenes, their branches, or prior source revisions. It marks non-structured scenes as needing text review rather than guessing their outcomes.

**Fork safety.** Generated archives store their `LW_ARCHIVE_ACTIVE_HEAD`. The scene preflight filters out these archives once the source head is no longer part of the active branch after «На это:». A valid shared ancestor remains usable in descendant branches. Legacy manually imported year documents have no machine-verifiable branch marker and must be curated separately.

**ChatGPT Project is a different store.** The bridge saves annual documents to Supabase, not to ChatGPT Project attachments. Use the **Скопировать в проект ChatGPT** action and manually attach the text/file in the project's Files if you want a second Project-local copy. The full source text and current state remain available via the bridge with no duplicated attachment.

**Important limits.** The bridge and PWA replay only up to 3,000 **world-scoped** scene records including alternative branches. This is not deletion or a TTL: older scenes, transactions and items remain in Supabase, but complete resource/character replay reports incomplete once the cap is exceeded. Annual source documents provide auditability and portability; they are **not durable executable ledger snapshots** and do not remove the replay cap. Snapshots with branch-bound base state and safe rebase after forks are still required to scale past this limit.

## v1.6 — Year Documents with causal corrections

In the active world open **Документы → Итоговый документ года**, enter the played period (YYYY-MM to YYYY-MM), press **Сформировать годовой отчёт**, review the cited facts, open threads, people, possessions and chronology, then **Утвердить и сохранить Year Document**. The immutable document is stored in the world's private Supabase library, readable from another authorized ChatGPT session via the OAuth MCP bridge. It is not automatically uploaded to a ChatGPT Project or its knowledge files; **Скопировать в проект ChatGPT** copies the document for manual addition.

**«На это:» never invalidates a whole year's legitimate events.** The bridge compares archived year source IDs with the active scene ancestry. An unchanged period keeps its original source document. For an affected period it recalculates a **current-year reconstruction** from all confirmed scenes *before and after* the revision and excludes only the invalidated branch's events. The existing document revision remains in the archive as historical evidence, not active canon. `get_scene_preflight` / `get_story_context` expose the corrected summary, and `get_current_year_archive` provides its full current text by pages. A partial year is clearly marked as provisional instead of falsely finalized.

When a valid replacement scene has no structured consequences, the archive includes source text from that replacement (with length/truncation notices) and warns that its semantic details require review. It never resurrects the replaced original text. The source scene ID remains traceable. Year Documents are **human-reviewed archives, not durable 3000+-scene computation checkpoints**. Scene records and events do not disappear at 3000: the current replay engine reports incomplete coverage instead of inventing state, until a separate durable snapshot mechanism is implemented.

For life simulation from birth, choose hero age **0** with **Прогон жизни**. Genesis must not prewrite later childhood, personality or future acquaintances. Simulation still advances in confirmed steps with choices at meaningful forks, not an unattended one-click 15-year generation.

## v1.7.0 — ChatGPT-first companion synchronization

**ChatGPT is the narrative engine; the PWA is a durable companion, not a replacement model.** A ChatGPT subscription does not become a direct OpenAI API key. The OAuth MCP bridge reads/writes Supabase without OpenAI API usage.

- The *new scene mode* (story/relationships), *length* (normal/large/detailed), *life simulation mode* (life/skip/off), *simulation step* (week/month/quarter/halfyear/year), *director note*, and *next scene clock* now persist under `lw_worlds.genesis_choices.companion_preferences` (the existing JSONB column). No migration is required. Previous world choices and `auto_save_enabled` are preserved when settings change.
- A player's selected **simulation decision** is saved in that same cloud field with its **source scene ID**, and is automatically excluded from the next prompt after a branch fork or after a new scene changes the head. Avoid localStorage as the source of decisions.
- `get_world_state`, `get_story_context`, and `get_scene_preflight` return `companion_settings` and `companion_guidance`. **The ChatGPT project must call preflight before generating, then `save_scene_auto` after the completed scene, and confirm the receipt.** Cloud settings cannot override the user's selected model or thinking level inside ChatGPT itself.
- Both manual and automatic OAuth save tools can include `decisions` with the scene packet; decisions are stored in the scene's causal note, so the next choice can be selected in the PWA.
- When a **confirmed save crosses into a later calendar year**, the bridge automatically builds an immutable `year_document` from the active ancestry, with current-character, money, inventory and open-thread checkpoint in the same Supabase reference library. The archive is factual, not AI-generated prose, and warns about scenes missing structured consequences. A failure to archive is returned as `year_archive.status='needs_review'` or `'partial'`; it does not turn an already committed scene into a failed save.
- Year Documents changed by a later `На это:` are dynamically reconciled from **all valid scenes before and after** the change. Generated snapshots are only eligible for preflight when their source head remains in the active ancestry. **Snapshots are not yet a replacement for full replay**; source scenes remain the primary evidence.
- The old 3000-row replay refusal was removed; full-branch projectors now page up to **30,000 world-scene rows**. This is a performance/safety bound, not a retention policy. Very large worlds still require later scalable replay/snapshot integration. If memory is incomplete, the bridge reports it as incomplete rather than inventing balances, items or knowledge.
- These archives are stored in **Supabase**. They are not automatically attached to the ChatGPT Project file list, which is separate.

Recommended ChatGPT Project short rule: “Before every new scene read `get_world_state` and `get_scene_preflight` from LIVING WORLD Bridge OAuth, use `companion_settings`/`companion_guidance` as the selected mode and player choice, write the scene, call `save_scene_auto` with scene and structured consequences and optional decisions, verify persisted=true or `get_scene_receipt`; if saving fails, explicitly say so.”

## v1.8.0 — Single JSON request through ChatGPT for Genesis, world and characters

The PWA does **not** call the paid OpenAI API when generating these prompts. The user takes a prompt to ChatGPT under their subscription and pastes the ONE valid JSON answer back into LIVING WORLD.

**World (Мир):** fill the title, genre, dated start, and any known history/rules. Press *«Сформировать общий JSON-запрос»* to generate a prompt containing the exact 8-key schema (name, genre, premise, world_rules, history, timeline, clock_start, current_period). Or use the small **GPT: это поле** control beside premise/rules/history/timeline to request an object containing *only that field*. Paste a whole JSON object into the world import box; the importer identifies full/field responses without relying on transient UI state, validates field types and dates, and rejects changes to the pinned title, genre or dates. The original form is saved to Supabase before the GPT handoff, preventing loss on iPhone reload. Full world generation and retrospective replacement of established history are blocked after Genesis approval; individually requested nonhistorical description fields remain available. World JSON only becomes durable after explicit validation/save.

**Characters (Персонажи):** new or existing character modal offers a full 13-key profile prompt and individual request buttons beside every long text field. The assistant returns a single strict object with all keys, or a one-field object. After pasting, **«Проверить JSON и заполнить поля»** validates and populates the editable form. Nothing enters canonical character records until the user explicitly presses **«Сохранить персонажа»**. Established name and role cannot be rewritten by the import. Temporary character form drafts stay locally on the device for up to 7 days to survive a chat switch. They're deleted after a successful save.

**Genesis (Генезис):** one visible button **«Сформировать JSON-запрос и скопировать»** is placed after the quick-start parameters and expandable advanced options. Both feed the same strict `genesisPrompt` schema; quick start preserves the four selected calibration decisions, the age-0 guard and optional unique advanced details. The exact inputs are saved to Supabase **before** copy and also used to validate the returned JSON: `summary`, `opening`, string arrays for `past_changes`, `open_threads`, `uncertainties`, and `characters` with hero plus precisely the chosen NPC count. The prior duplicated generation controls are removed from the interface. The generator never changes the story canon, world date or existing source documents.

No automatic execution of ChatGPT by the PWA, no covert model switching and no OpenAI API charges.

## v1.9.0 — Reliable ChatGPT ↔ LIVING WORLD companion protocol

The LIVING WORLD PWA remains a durable Supabase memory companion. All narrative text is authored in ChatGPT under the user's subscription. No paid OpenAI API is required.

### Verified scene preflight and autosave

1. **BEFORE writing each new scene**, call OAuth `get_scene_preflight` for the current world, intent and actors. It returns the live world options, causal memory, documents, **`preflight_token`** and expiry. Read any required document pages.
2. Write a scene from that current state. Do not invent information for actors or change user-selected world history.
3. Call `save_scene_auto` with the exact `preflight_token`, current `branch_id`, `expected_head`, a unique persistent `request_id`, full scene text, actual in-world time and real structured consequences. The token is valid for two hours and cryptographically binds the account, world, branch head, current world settings and source document revision fingerprints. A changed head, settings, document revision or expired token forces a new preflight.
4. Require `persisted:true`. Verify with `get_scene_receipt`, which now supplies complete stored text length, text SHA256 fingerprint and presence of structured consequences. **On uncertain network results use the same `request_id` to query the receipt before retrying**; never create a second scene blindly. An already-committed idempotent retry is still allowed even if its preflight expires.

The website's disposable `/api/diagnostics/save-test` also uses a signed preflight for its temporary world.

### Director corrections via ChatGPT («На это:»)

- Use OAuth `get_revision_context` with the active world and the exact target scene ID. It returns the complete original text, active source branch/head, original causal delta and encrypted `revision_token`.
- Preserve only the **literal untouched prefix** and send it with the **new continuation** and new structured consequences to `commit_scene_revision`. Empty prefixes require `replace_from_start:true`; no automatically recycled invalidated facts.
- The bridge uses the owner-only **transactionally head-checked** `lw_bridge_v2_fork` RPC. It creates an entirely new branch and replacement scene; it NEVER deletes, modifies or imports the invalidated old tail. It rejects stale heads and invalid prefixes **inside the SQL transaction**. There is no unsafe fallback to the legacy non-CAS fork RPC.
- **One-time Supabase setup:** run [`supabase/bridge_revision.sql`](supabase/bridge_revision.sql) in the authenticated project's SQL Editor. This does not delete or mutate existing stories, and the original PWA «На это» UI remains usable as before. Until this migration is installed, `commit_scene_revision` reports a clear setup error without writing anything.

### Sync health and timeline journal

- In **История** or **Настройки**, select **«Проверить в Supabase»** to refresh the latest branch, saved scene bodies, structured consequences, core rules, inventory and character memory. The report shows last-12-scene metadata with actual stored body sizes and causal delta counts. It does not claim to verify the OAuth session of a particular ChatGPT chat.
- In ChatGPT call read-only `get_sync_health` to verify **that chat's** OAuth authorization and latest scene integrity. The tool never creates a scene.
- Both PWA and OAuth now paginate full replay up to **30,000 world rows**, with a detectable incomplete-memory error above the bound. Source scenes are never truncated or deleted by this boundary. The PWA also rejects a world whose head changes during pagination instead of displaying a misleading inventory.

**Project instruction update** (place in ChatGPT Project instructions, under 8000 characters):
> Before EVERY new scene call LIVING WORLD OAuth `get_world_state` and `get_scene_preflight`. Follow `companion_settings` and `companion_guidance`; pass the returned `preflight_token` unchanged to `save_scene_auto` alongside the current IDs, full scene and structured consequences. Verify `persisted:true` or `get_scene_receipt`. If the preflight expires or branch/settings/rules changed, reread and do not save stale text. For «На это:» use `get_revision_context` → `commit_scene_revision` rather than an ordinary save. Never claim a save until the bridge confirms it.

### Remaining limits

A client can still choose not to invoke tools despite project instructions. The signed preflight makes the server **reject unverifiable new autosaves**, but does not force an AI model to issue a tool call. `get_sync_health` can prove an individual call had OAuth access; it cannot guarantee future calls. Full replay is limited to 30k scene rows; annual checkpoints are auditable artifacts and are not yet an unbounded replay seed. The app has no direct view into ChatGPT conversations.
