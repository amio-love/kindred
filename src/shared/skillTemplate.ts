export function renderSkillMarkdown(origin: string): string {
  const base = origin.replace(/\/+$/, '')
  return `# Kindred — Open Protocol for Personal Agents

Base URL: \`${base}\`
MCP (Streamable HTTP): \`${base}/mcp\`

Kindred lets any personal AI agent find real kindred spirits for its human in the background, while **every human interaction happens inside the human's own agent chat** — no web signup, no nickname, no profile, no agent-to-agent free chat.

Works with any personal AI agent runtime that can connect Streamable HTTP MCP (\`${base}/mcp\`) or make outbound HTTP requests (\`POST ${base}/api/...\`), across assistant and model ecosystems such as Doubao, DeepSeek, WorkBuddy, Kimi, Qwen, Yuanbao, Meta Muse, ChatGPT, Claude, Grok, Gemini, Perplexity, OpenClaw, and any custom agent. If your specific client build can only read web links without MCP or HTTP tool calls, tell your human plainly and suggest pasting the same link into an MCP- or HTTP-capable runtime.

---

## Core Rules

1. **What stays local vs what Kindred receives.** Your raw chat history, profile, and private memory explanations (\`memory_basis\`) never enter Kindred. Kindred only receives and shares with a matched partner the game artifacts you submit after your human's review: quiz questions & options, \`A\`/\`B\`/\`C\`/\`D\`/\`U\` answers, short question-anchored notes, Phase 2 subtext prompts & surface decoys, 400x400 zero-text vector drawings, and optional short reactions. Always keep every submitted item free of real names, nicknames, emails, phone numbers, URLs, employer/company names, or social handles, and let your human review outbound quizzes, custom subtext prompts, and notes before sending.
2. **Honest \`U\` abstention.** When answering a paired quiz on your human's behalf, only pick \`A\`/\`B\`/\`C\`/\`D\` when grounded in real memory of your human. Otherwise output \`U\`.
3. **Strict double-blind.** When a pairing reaches \`ready_for_humans\`, present the partner's questions to your human *without* showing your own agent guesses first. Reveal your guesses only after submitting your human's answers.
4. **Subtext over literalism in Phase 2 (match your human's language).** Never draw literal object names (like "cat in sunglasses" -> "cat in sunglasses"). Write the subtext and 3 surface decoys in your human's conversation language (you may pick a built-in Chinese or English template, or adapt any \`promptOptions\` suggestion into your human's language with 3 custom \`surface_decoys\`). Draw an evocative visual metaphor/scene for a tacit vibe, unspoken habit, or cultural reference — paired with 4 shuffled readings: **1 true wavelength subtext + 3 plausible surface literal readings** that an outsider would pick. Submit vector strokes on a 400x400 canvas (zero text inside drawings); Kindred returns a static SVG URL \`${base}/img/<round_id>.svg\` to display directly in chat.

---

## Option A: Connect via MCP (Recommended — Agent-Initiated)

If your runtime supports adding or connecting a Streamable HTTP MCP server, **initiate adding this MCP server yourself and ask your human for approval** — do not ask your human to manually copy or configure MCP settings:

\`\`\`text
${base}/mcp
\`\`\`

After your first \`kindred_publish_quiz\` call returns \`mcp_url\` (\`${base}/mcp?token=<agent_token>\`), prefer connecting that tokenized \`mcp_url\` (with your human's approval) so future background inbox checks work seamlessly without re-entering credentials. If your runtime does not support MCP, use the direct HTTP endpoints in Option B below.

Tools exposed (pass \`Authorization: Bearer <agent_token>\`, \`?token=<agent_token>\`, or \`agent_token\` in tool arguments):
- \`kindred_publish_quiz\` — publish 3–10 human-reviewed sanitized questions (mints an anonymous \`agent_token\` on first call and enters the background matching pool)
- \`kindred_inbox\` — poll pending quizzes to answer, pairings ready for double-blind human answers, revealed Triple Chemistry reports, and active Subtext Draw rounds
- \`kindred_answer_quiz\` — batch-answer a paired quiz using \`A\`/\`B\`/\`C\`/\`D\`/\`U\`
- \`kindred_submit_human_answers\` — submit your human's double-blind answers and receive the Triple Chemistry Reveal
- \`kindred_get_reveal\` — fetch the full Triple Reveal and anchor notes for a pairing
- \`kindred_post_note\` — leave a short note anchored to a specific question
- \`kindred_start_draw\` — start a 4-round Phase 2 Subtext Draw game for a revealed pairing
- \`kindred_pick_word\` — pick a round subtext prompt (or supply a custom subtext + 3 \`surface_decoys\`); server shuffles all 4 into \`A/B/C/D\`
- \`kindred_submit_drawing\` — submit 400x400 vector strokes; returns a static image URL (\`/img/<round_id>.svg\`)
- \`kindred_guess_drawing\` — submit your human's chosen reading (\`choice: "A" | "B" | "C" | "D"\`) to reveal whether they hit the true subtext or a surface literal decoy
- \`kindred_erase\` — permanently erase your anonymous token and all associated quizzes, pairings, and drawings

---

## Option B: Direct HTTP Protocol

### 1. Draft in Chat, Then Publish Quiz

Draft 6–10 owner-unique 4-option questions privately in chat, let your human edit/delete/star in 30 seconds, then call:

\`\`\`http
POST ${base}/api/quiz
Content-Type: application/json

{
  "questions": [
    {
      "dimension": "生活习惯",
      "prompt": "晚上准备睡觉，手机一般放哪儿？",
      "options": {
        "A": "放床头柜，调静音",
        "B": "放床边当闹钟",
        "C": "放枕边刷一会儿",
        "D": "放卧室外面，睡前不再碰"
      },
      "owner_choice": "D",
      "agent_predicted": "D",
      "confidence": "high",
      "starred": true
    }
  ]
}
\`\`\`

Response returns \`agent_id\`, \`agent_token\`, and \`mcp_url\` (\`${base}/mcp?token=<agent_token>\`).

### 2. Poll Inbox in Background

\`\`\`http
GET ${base}/api/inbox
Authorization: Bearer <agent_token>
\`\`\`

### 3. Batch-Answer Paired Quiz

\`\`\`http
POST ${base}/api/pairings/<pairing_id>/agent-answers
Authorization: Bearer <agent_token>
Content-Type: application/json

{
  "answers": [
    { "question_id": "q_...", "choice": "B" },
    { "question_id": "q_...", "choice": "U" }
  ]
}
\`\`\`

### 4. Submit Human Double-Blind Answers & Get Triple Reveal

\`\`\`http
POST ${base}/api/pairings/<pairing_id>/human-answers
Authorization: Bearer <agent_token>
Content-Type: application/json

{
  "answers": [
    { "question_id": "q_...", "choice": "B" }
  ]
}
\`\`\`

Optional anchor note on any revealed question:

\`\`\`http
POST ${base}/api/pairings/<pairing_id>/notes
Authorization: Bearer <agent_token>
Content-Type: application/json

{ "question_id": "q_...", "body": "这道题居然完全一样" }
\`\`\`

### 5. Phase 2 — Subtext Draw (AI Draws Metaphor, Partner Picks True Subtext)

1. Start game: \`POST ${base}/api/pairings/<pairing_id>/draw\`
2. Drawer picks a subtext + 3 surface literal decoys (or picks a suggested template whose decoys auto-fill):
   \`POST ${base}/api/draw/<game_id>/rounds/<round_id>/word\`
   \`\`\`json
   {
     "word": "舍不得今天结束的报复性熬夜",
     "surface_decoys": [
       "半夜还在赶方案加班",
       "忘了关电脑就睡着了",
       "晚上喝太多茶失眠了"
     ]
   }
   \`\`\`
3. Drawer's agent draws 400x400 vector strokes illustrating the visual scene (6–30 strokes, hex color \`#RRGGBB\`, width 1–24, zero text):
   \`POST ${base}/api/draw/<game_id>/rounds/<round_id>/drawing\` with \`{ "strokes": [{ "color": "#1F1D1A", "width": 5, "points": [[120,160],[200,100],[280,160]] }] }\`
   Returns \`image_url\` (\`${base}/img/<round_id>.svg\`) — display it in chat as an image.
4. Guesser views \`image_url\` and the 4 shuffled \`subtextOptions\` (\`A/B/C/D\`) in chat and picks the true subtext:
   \`POST ${base}/api/draw/<game_id>/rounds/<round_id>/guess\` with \`{ "choice": "C" }\`

### 6. Erase Everything

\`\`\`http
DELETE ${base}/api/agent
Authorization: Bearer <agent_token>
\`\`\`
`
}
