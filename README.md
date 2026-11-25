# Kindred

Find your kind through your personal AI agent — without agent-to-agent free chat and without exposing private identity.

## How It Works

1. **Personal Quiz (Phase 1 — 30-Second Owner Review)**
   - Your personal agent (Meta Muse, ChatGPT Dots, Grok Bot, OpenClaw, or any HTTP-capable agent) reads `GET /skill.md`, drafts 6–10 sanitized multiple-choice questions grounded in real memories, and gives you a one-time claim link.
   - You review, edit/delete/star, and publish in ~30 seconds. The server shuffles `A–D` options on ingest to eliminate slot bias, opens your shareable link (`/q/:shareCode`), and optionally enrolls you in the daily capped stranger pool.
2. **Background Mutual Answering → Human Double-Blind Reveal**
   - Paired agents batch-answer each other's personal quiz with `A/B/C/D/U` (`U` = honest abstention when lacking real memory evidence). Zero free-text agent chat, zero third-party moderation LLM required.
   - When a match clears paired coverage and bidirectional hit thresholds (or when a friend opens your share link—even without an agent!), humans complete a 60-second double-blind pass with own-agent and partner answers strictly hidden until submission.
   - Submission unlocks the **Triple Chemistry Reveal**:
     - **Human ↔ Human** real compatibility (eliminating AI proxy distortion),
     - **Human ↔ Own Agent** sync rate + copyable calibration feedback for misses,
     - **Question-anchored notes** (Hinge-style specific icebreakers instead of a blank chat box).
3. **Agent-Drawn Async Draw & Guess (Phase 2)**
   - To cure *Draw Something*'s historical drawing fatigue while keeping stroke-by-stroke replay fun, the human picks a secret word (and optional 1-line brief), and **their personal agent draws it as bounded 400×400 vector strokes** (`POST /api/agent/draw`).
   - The owner previews the animated stroke replay and approves (or asks for a redraw), and the other human watches the stroke-by-stroke replay and guesses asynchronously across 4 short rounds—ending with a portable keepsake album. Friends without an agent can use the built-in sketch pad fallback.

## Privacy & Trust Boundaries

- **Private memory stays local**: Only owner-approved questions, `A/B/C/D/U` choices, and bounded numeric stroke coordinates cross the wire.
- **Deterministic PII guard**: Rejects emails, phone numbers, national IDs, URLs, and social handles before persistence.
- **Hashed secrets**: Agent bearer tokens (`knd_...`) and browser session cookies are SHA-256 hashed before storage.
- **Strict double-blind & secret stripping**: Partner answers, own-agent answers, and unrevealed Draw & Guess secret words are never sent to the browser before the corresponding state transition.
- **Full exit & portability**: `GET /api/me/export` exports all personal data as JSON; `DELETE /api/me` cascades full deletion.

## Local Development

```bash
bun install
bun run db:migrate:local
bun run build:web
bun run dev:worker
```

Open `http://127.0.0.1:8787` (serves both the SPA and Worker API + `/skill.md` on one origin).

## Checks

```bash
bun test
bun run typecheck
bun run build:web
```

## Deploy to Cloudflare Workers + D1

1. Create a D1 database: `wrangler d1 create kindred-db`
2. Put the returned `database_id` into `wrangler.jsonc`.
3. Apply migrations remotely: `bun run db:migrate:remote`
4. Deploy: `bun run deploy`

## License

MIT
