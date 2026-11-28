# Kindred

Pure Remote-MCP personal-agent encounter & async chemistry service built on **Cloudflare Workers + D1**, exposing:

- **Streamable HTTP MCP (`POST /mcp`)** secured by **zero-registration, one-click anonymous OAuth 2.1** (RFC 9728 Protected Resource Metadata, RFC 8414 Authorization Server Metadata, RFC 7591 Dynamic Client Registration, RFC 8707 Resource Indicators, RFC 7009 Revocation, PKCE `S256`, and Client ID Metadata Documents).
- **SEP-2640 Skills over MCP (`io.modelcontextprotocol/skills`)**: `initialize.capabilities.extensions["io.modelcontextprotocol/skills"]`, `skills/list`, `skills/get`, and deterministic `resources/read` for `skill://kindred/SKILL.md` (with verified SHA-256 `digest` and UTF-8 `size`) and `skill://index.json`, alongside `instructions`, `prompts` (`start_kindred`, `upgrade_kindred`), `kindred_guide`, and `kindred_quiz_seeds` for non-SEP-2640 MCP clients.
- **Discovery Manifest (`/.well-known/mcp.json`)**.

No web accounts, no nicknames, no profiles, no agent-to-agent free chat. Add `https://kindred.byheaven0912.workers.dev/mcp` to any remote-MCP personal AI (Meta Muse, Claude, ChatGPT, OpenClaw, WorkBuddy, Perplexity, Grok, or any custom MCP client), approve anonymously in one click, and play right inside your own chat:

1. **Ultra-short 2–4 option blind quiz & in-place updates**: Your AI runs local alignment with crisp, short **2–4 option questions** across 4 archetypes (sharp 2-choice splits, no-escape 2-choice dilemmas, instant 3-choice sensory projections, and wavelength/raw-truth calls), then publishes via `kindred_publish_quiz`. Returning users can inspect or update their quiz anytime via `kindred_inbox(max_new: 0)` (`my_quiz`) + `kindred_publish_quiz` without touching past pairings.
2. **Silent screening, chance-adjusted gate & quiet 1–2x/day check-in**: Your agent silently answers paired quizzes via valid option keys or `U` (`kindred_answer_quiz`), reports only server-scored `agent_score`, casually aligns 1–2 blind-spot themes on low coverage, and offers a quiet background check-in (default **once or twice per day**, or manual only) powered by `kindred_inbox` (`pool_status`, chronological `partner_updates`, `recent_draw_reveals`, and `protocol_update`) under a chance-adjusted single-direction match gate (`coverage >= 50%`, normalized lift `>= 40%` — `55%` on 4-choice, `60%` on 3-choice, `70%` on 2-choice).
3. **Blind answering & instant reveal**: As soon as either agent passes, matched humans answer partner questions blindly in their own chat (`kindred_submit_human_answers`), unlocking immediate side-by-side chemistry + Own-Agent sync calibration (`partial_reveal`), and opening anchor notes plus Phase 2 once both humans submit.
4. **Subtext Draw (No Right Answer — Blind Resonance)**: Each round pairs an evocative, ambiguous visual metaphor with 4 equally poetic, same-register peer readings (server-shuffled into `A`/`B`/`C`/`D`). Both humans blindly pick whichever reading resonates most with them; matching celebrates **same wavelength**, while differing reveals two genuine lenses to spark conversation.

## Local Development

```bash
bun install
bun run db:migrate:local
bun run dev
```

## Deploy to Cloudflare Workers

```bash
bunx wrangler d1 create kindred-db
# Set database_id in wrangler.jsonc (or a gitignored wrangler.deploy.jsonc)
bun run db:migrate:remote
bun run deploy
# When using a local gitignored wrangler.deploy.jsonc instead of wrangler.jsonc:
# bunx wrangler d1 migrations apply kindred-db --remote --config wrangler.deploy.jsonc -y
# bun run build:web && bunx wrangler deploy --config wrangler.deploy.jsonc
```

## Verification

```bash
bun test
bun run typecheck
bun run build:web
```
