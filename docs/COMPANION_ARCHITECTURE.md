# LIVING WORLD — ChatGPT-first causal companion

## Primary experience (this is the user agreement)

**Narrative, dialogue and decisions happen in the user's ChatGPT conversation on their subscription.** LIVING WORLD is the persistent world-state companion, not a separate pay-per-token story-writing app. Supabase holds the world, scenes, verified transactions and branch history; the OAuth MCP bridge lets ChatGPT retrieve the actual state and save fully played scenes. GitHub holds code, Cloudflare serves the UI and the Worker. The separately billed OpenAI API feature remains optional, not required.

The user's story can be large (multi-thousand-word scenes) and span many years. Nothing in the UI should force manual copying of scenes or duplicate story generation.

## A single scene — target protocol

1. **Read**: invoke `get_story_context(world_id)` (or `get_world_state` + `get_companion_state`) to identify current branch head, time, rules, characters, knowledge boundaries, inventory and finances. If `memory_coverage.complete=false` or `companion.complete=false`, do not present the partial state as complete; load deeper sources/checkpoints.
2. **Narrate** here in ChatGPT, autonomously, causally. Time passes; actors know only what they learned; action changes resources. The model is not allowed to invent a new item, money, trust or knowledge to make an outcome convenient.
3. **Extract changes** from the played and accepted scene: text and structured causal facts; personal knowledge with its channel; offscreen events; precise money and property transactions; introduced NPCs; open/closed threads. Intentions and hypothetical plans are not transactions.
4. **Commit** with `save_scene_auto` only if the owner explicitly enabled `auto_save_enabled` for that world, otherwise `save_scene_package` with its required approval. Both writes require the current `expected_head`, an idempotent `request_id`, and an owner-authenticated OAuth token. Do not retry with a different request ID after an uncertain network result.
5. **Verify** new branch state before starting another scene. Confirmed facts in DB are authoritative; a model's uncommitted draft is not.

The bridge's public tool list can change before ChatGPT connector tool discovery refreshes. A new tool is usable only when it appears in the connected plugin's available actions. The user may need to reconnect or reload the plugin.

## Economic and inventory invariants

- Each currency is an independent account per person and currency unit; numeric amounts are nonnegative integer *minor units*, `scale` makes decimal accuracy explicit. Do not exchange currencies without an actual conversion event.
- **Unknown != zero.** A credit or debit with an unknown starting balance changes only the known delta. A later *verified* `reconcile` event sets a known current balance. `opening` is only allowed before earlier transactions on that account.
- Purchases are a `debit` and a matching item `acquire` when actually played; no automatic expense on a stated plan. Every event has a stable unique ID, clear reason and literal source in the scene.
- Items have stable IDs; owner, physical holder, location, condition and existence are different concepts. A gift transfers ownership; a loan transfers possession; destruction invalidates possession. A character cannot gift a nonexistent item or spend known unavailable money.
- New NPCs require their own goals, origin, accessible information and a reason to enter the story. Introductions belong to the branch where they occurred.
- Assets are **projections of valid scene ancestry**. An invalidated revision tail never creates extra money, items or acquaintances in the current branch. Never simply mutate a global balance that persists across alternate timelines.
- Every displayed transaction links to its source `scene_id` and actual story time.

## Current implementation (v0.9.1)

- Live owner-authenticated OAuth read bridge, `save_scene_package` with approval, owner opt-in `save_scene_auto`, `get_companion_state`, `get_story_context`.
- No database migration required for this first vertical slice: structured events live in the scene's existing `prompt_note`, atomically committed with the scene.
- The Assets page replays complete active branch ancestry from Supabase and shows known/unknown balances, item ownership/holder and introduced NPCs, together with provenance.
- `BRIDGE_WRITES_ENABLED=true` in Wrangler, and the Worker also accepts owner writes by default with emergency `false` kill switch. The app sets the world-specific `auto_save_enabled` opt-in separately.
- Test coverage for inheritance credits, unknown balance, gifts, loans, branch divergence, idempotent MCP request IDs and owner permission.

## Not finished — do not claim these exist

- End-to-end confirmed real scene write from inside ChatGPT using the *refreshed* OAuth connector. Old connector tool metadata may still show read-only functions; server publication and client discovery are separate.
- Cross-year durable snapshots, canonical document storage and semantic retrieval beyond the 200-scene short-term continuity window. Asset reconstruction currently declines to claim completeness if >3000 world scene rows have to be read.
- Fully correct **«На это:»** revision through MCP with preservation of partial-scene prefix and regenerated structured delta. The website currently has a manual branch fork; full chat-directed revision is a next milestone.
- Permanent automatic branch-specific NPC profiles merged into all ChatGPT prompts (initially introductions are visible in `get_companion_state`).
- Trustworthy semantic auditing of every character goal, relationship and knowledge channel after each scene. Current validation catches malformed events and some accounting contradictions; psychological consistency still needs model-supported verification.
- Continuous background simulation with user-controlled stopping. This requires a separately defined execution mechanism and is not silently running in ChatGPT.
- Direct Cloudflare UI administration via ChatGPT's connected tools; current edits are through GitHub, automatically deployed by the existing integration.

## Priority order

1. Verify new tools are discoverable through the OAuth plugin, enable owner world autosave, write and read a real test scene in an empty test world.
2. Add MCP-first genesis/world setup, new NPC registration and scene revision with branch-safe effects.
3. Add full-text Project Document storage and per-world immutable rules with retrievable source citations.
4. Add periodic durable snapshots and semantic relevance retrieval, preserving original scenes and proof.
5. Add rigorous invariants for relationships, money, item custody, travel times, health and knowledge.
6. Improve dashboard: character cards, money and inventory, obligations, map of relationships, timelines, searchable audit, director interventions.
