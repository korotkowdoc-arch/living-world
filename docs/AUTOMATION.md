# LIVING WORLD automatic AI (server-side)

## Status and architecture

The Cloudflare Pages frontend calls `/api/ai/status` and `/api/ai/generate` on the **existing** private Cloudflare Worker `living-world-bridge-mcp`. The worker verifies the owner's Supabase JWT against Supabase Auth, reads the actual current world, the active branch, character profiles and up to 200 causal scenes via RLS, and calls the OpenAI Responses API with `reasoning.effort: high`.

For **scene** and **simulation** requests, the worker validates the result and atomically appends the scene and continuity delta using `lw_append_scene`. The client reloads the current branch without copy/paste. Parallel edits cannot silently overwrite the branch head. For **genesis**, the worker saves the draft and waits for explicit approval by the user before adding characters.

The API key is **never sent to the PWA**. The `BRIDGE_WRITES_ENABLED` switch for MCP is unrelated and can remain `false`; automatic scene saves use the owner's own authenticated Supabase RPC.

## One-time activation (owner only)

1. Sign in at https://platform.openai.com/ and choose an API organization and project. You may need to set up API billing or claim eligible included credits. Open https://platform.openai.com/api-keys to create a project key. **Do not paste the key into ChatGPT, GitHub, Supabase public variables, or the LIVING WORLD site.**
2. Open https://dash.cloudflare.com/ → **Workers & Pages** → Worker **living-world-bridge-mcp** → **Settings** → **Variables and Secrets**.
3. Add a new binding named `OPENAI_API_KEY`, with type **Secret**. Paste the API key **only in that protected Cloudflare field**, and save/deploy.
4. Recommended: set spending limits and billing alerts for the API project, especially when using GPT-6 Astra with long outputs. The optional Worker variable `AI_TOKEN_CAP` can set an output-token ceiling (e.g. 12000 for early tests), but it is not a money-based budget.
5. Reload LIVING WORLD → **Настройки** → **Проверить AI-подключение**. It should say **Подключён**. Automatic buttons are disabled until the worker reports `enabled:true`.

The Worker itself must contain the latest `bridge/index.js` and `bridge/ai.js`; the two files are required for the endpoint. GitHub's tests alone do not deploy the Worker. Confirm live status through `/api/ai/status` with the allowed origin; it is a boolean state endpoint and never returns the secret.

## Behavior

* **Genезис:** after quick-start choices, click **Создать персонажей автоматически**, review the draft and approve. The server chooses an allowlisted model (currently GPT-6.1 Sol, high).
* **История:** choose **GPT-6** or **GPT-5.6** and a scene length, then **Продолжить историю автоматически**. The worker maps the story preference `gpt-6` to the API identifier `gpt-6-astra` and the relationship preference `gpt-5.6` to `gpt-5.6`, both with high reasoning.
* **Ускорение / детство:** click **Автоматически продвинуть время**, select an option when the model offers a decision, then advance again. The user can switch to ordinary literary scenes at any confirmed point. Continuous multi-interval autoplay and background processing have **not** been implemented.
* **No key:** manual copy/paste remains as a fallback, but the interface explicitly shows that AI automation is disconnected.

## Current limitations

The first automatic generation can be slow, especially on high reasoning with big scenes. Client/Worker timeouts and incomplete model output cause a visible error, not a false success. Validate the last saved scene before retrying after network errors; a result may have been committed before its success response was lost.

AI can still create continuity mistakes. The system stores structured effects but currently summarizes only the 200 most recent active branch scenes; archival snapshots, cross-branch NPC profile creation, full Project Document import, unlimited autonomous fast-forward, and deeper causal validation are separate required milestones. Do not advertise full durable world memory until those are implemented.

Current model costs and availability: https://developers.openai.com/api/docs/models and https://developers.openai.com/api/docs/guides/chatgpt-api-credits . API usage can be billed separately from ChatGPT. Eligible **Pro or Business** subscriptions may claim API credits after explicitly linking their API organization; Plus/Free/Go do not automatically receive the credit benefit.
