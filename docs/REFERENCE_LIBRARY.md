# LIVING WORLD v1.0 — Private source-document library and scene preflight

This is the authoritative *document storage mechanism*, not a model's memory feature. It is designed for the ChatGPT-first project in which the user plays in a ChatGPT conversation, the owner-scoped Supabase database stores facts, and the OAuth Worker serves read / approved write actions.

## Install the database extension once

Open Supabase > project `bcwzlsljcxubqtvzsucz` > **SQL Editor** and run the full content of [supabase/reference_docs.sql](../supabase/reference_docs.sql). The migration **does not overwrite** any existing world, scene, character or branch. The `lw_reference_docs` table is read/insert-only under per-user RLS. New source versions are appended, never overwritten.

If you do not run the migration, the site's **Документы** page shows a deliberate error and the MCP preflight reports `installed:false`. It is NOT correct to claim the library has been activated merely because code tests passed.

## Importing the sources

Open LIVING WORLD > select a world > **Документы**. Upload up to 12 `.docx`, `.txt`, `.md` files at once; filenames help assign categories. Important sources for "Прогон 7":

| File | Category | Purpose |
| --- | --- | --- |
| PROJECT_CORE_RULES_V1_7.docx | core_rules | Global causal and project constraints |
| PROJECT_ROSMAN_GLOSSARY_V2_1.docx | glossary | Names/terminology ONLY, not story facts |
| HARRY_POTTER_START_MODEL_V2_0_LIA_ALIVE.docx | character_start | Starting character state; played change has priority |
| PROJECT_CHARACTER_BASELINES_Y1_V1_0.docx | character_baseline | Initial NPC calibration |
| PROJECT_YEAR_ANCHORS_Y1_Y7_V2_1.docx | year_anchors | Possible causal/calendar nodes, NOT fixed outcomes |
| YEAR_DOCUMENT_Y1_1998-1999_V1_0.docx | year_document | Finished Y1 facts and ending checkpoint |
| пример_v2_цельная_сцена.docx | style_example | Example of narrative pacing, continuity and completeness; NOT events or required practices |

Documents are imported as **extracted text**, with table cells retained as lines separated by `|`, and accompanied by filename, SHA-256 content digest and immutable revision number. The current first release does not preserve the binary DOCX file inside Supabase. Complex floating layouts, annotations or embedded images might not survive extraction; inspect the preview for critical documents and prefer TXT export if needed.

For a project source with explicitly configured relevance (e.g. sensitive stylistic examples), use the category `style_example`. It is an example of expression, not a source of factual or character actions, and should be retrieved only when needed.

Optional: **Разрешить импорт документов** enables owner-authenticated `save_reference_document` through ChatGPT, once that tool is visible to the connected OAuth app. Each tool call remains per-world and RLS-scoped; no user tokens or model API key are needed. The app can instead bulk import directly in the browser.

## Before a new scene

1. Call `get_story_context(world_id)` to read the active branch head, current period, memory coverage, characters, inventory and accounts. It includes the source index and obligatory excerpts if the documents table exists.
2. Call `get_scene_preflight(world_id, scene_intent, actor_names)`. The result lists mandatory rules, lexical excerpts from relevant full documents, their immutable keys/revisions, and warnings about incomplete history or ledgers.
3. Where the preflight reports `complete:false` for any important source, call `get_reference_document(world_id, doc_key, revision, offset, limit)` repeatedly until `next_offset:null`, or otherwise explicitly avoid unsupported claims. Each chunk is up to 25,000 characters.
4. Prepare the scene in ChatGPT. Character knowledge must be channel-grounded. No property or funds appear without a source. New events and character changes are structured.
5. Before saving the played scene, the OAuth Worker checks that the branch head is current, time does not move backward without revision, and proposed transactions are consistent with the actual branch ledger. `save_scene_auto` requires world-level opt-in; `save_scene_package` has a review/approval flow.

### Authority and conflicts

- PROJECT CORE RULES govern global constraints.
- Valid played scenes and active branch ancestry determine what **actually happened**.
- Current checkpoint determines ongoing state; completed Year Documents establish finished years.
- Start models/baselines are *initial* only.
- Year Anchors are expectations, not outcome locks.
- ROSMAN Glossary controls terminology, not relationships or deaths.
- Style examples govern form only, not story events.

Retrieval uses exact names and lexical excerpts, **not a semantic theorem prover**. Missing excerpts do not prove an event never happened. The model must fetch the complete cited source when factual conclusions depend on it. The system cannot prevent all factual contradictions, subtle character misreadings or stale memories without a more advanced audit.

## Honest limits

- New document table must be installed manually with SQL Editor; GitHub/Cloudflare deploy alone does not change Supabase.
- The screenshot's older **LIVING WORLD Bridge v5** connection is a *ChatGPT application entry* in development mode. The working owner-authenticated path is **LIVING WORLD Bridge OAuth**; the old v5 app may be stale or fail even if the Worker at the same URL runs successfully.
- ChatGPT can cache the list of MCP tools. New tools may not become usable until the OAuth app connection is refreshed or reconnected. Do not remove an older connection until the refreshed OAuth path is verified.
- The current short scene memory has a 200-scene bound; archival source documents are NOT a replacement for a full causal checkpoint. Long-duration snapshot/retrieval and semantic consistency audits remain separate development work.
- The new source documents table stores extracted plain text. ZIP, PDF, and non-DOCX Word files are not directly supported in v1.0.
