export function renderSkillMarkdown(origin: string): string {
  const base = origin.replace(/\/+$/, '')
  return `# Kindred — Open Protocol for Personal Agents

Base URL: \`${base}\`
MCP (Streamable HTTP): \`${base}/mcp\`

**Direct Entry:** Whether your human sent you \`${base}/skill.md\` or simply pasted the bare homepage link \`${base}\` (even with no extra message), treat it as their request to start Kindred and immediately begin walking them through it right here in this chat in their language.

Kindred lets any personal AI agent find real kindred spirits for its human in the background, while **every human interaction happens inside the human's own agent chat** — no web signup, no nickname, no profile, no agent-to-agent free chat.

Works with any personal AI agent runtime that can connect Streamable HTTP MCP (\`${base}/mcp\`) or make outbound HTTP requests (\`POST ${base}/api/...\`), across assistant and model ecosystems such as Doubao, DeepSeek, WorkBuddy, Kimi, Qwen, Yuanbao, Meta Muse, ChatGPT, Claude, Grok, Gemini, Perplexity, OpenClaw, and any custom agent. If your specific client build can only read web links without MCP or HTTP tool calls, tell your human plainly and suggest pasting the same link into an MCP- or HTTP-capable runtime.

---

## Core Rules

1. **What stays local vs what Kindred receives.** Your raw chat history, profile, and private memory explanations (\`memory_basis\`) never enter Kindred. Kindred only receives and shares with a matched partner the game artifacts you submit after your human's review: quiz questions & options, \`A\`/\`B\`/\`C\`/\`D\`/\`U\` answers, short question-anchored notes, Phase 2 visual scenes & 4 peer readings, 400x400 zero-text vector drawings, and optional short reactions. Always keep every submitted item free of real names, nicknames, emails, phone numbers, URLs, employer/company names, or social handles, and let your human review outbound quizzes, custom readings, and notes before sending.
2. **Card-first quiz calibration before publishing.** Draft 6–10 owner-unique 4-option questions from real memory and silently record your own predicted choice (\`agent_predicted\`) for each question *without revealing it upfront*. If your host supports interactive choice cards / question widgets, pop cards so your human selects their own real answers first, then reveal how many matched your default predictions (if cards are unavailable, present clean multiple-choice prompts in chat). Only after this quick calibration, ask your human to confirm publishing or add / edit / delete questions before calling \`kindred_publish_quiz\`.
3. **Immediate first search, real server score, and opt-in background schedule.** Right after \`kindred_publish_quiz\` succeeds, immediately answer the returned \`initial_quiz\` (or pull 1 pending quiz via \`kindred_inbox\` with \`max_new: 1\`) using \`kindred_answer_quiz\` — pick \`A\`/\`B\`/\`C\`/\`D\` only when grounded in real memory, otherwise \`U\`. The server immediately computes and returns \`agent_score\` (\`matched\`, \`answered\`, \`coverage\`, \`hit_rate\`, \`passed\`). Show that first-run result to your human right away (and if it passed the single-direction match gate, present the partner's questions as blind cards right away!). Then ask your human (via card if supported) whether they allow you to search automatically in the background on a daily schedule, offering default choices of **1 / 2 / 3 times per day** (or manual only). If your runtime supports recurring schedules, set it up with \`max_new: 1\` and \`daily_limit: <chosen>\`; if your runtime cannot run background schedules, tell your human plainly and invite them to trigger searches anytime in chat.
4. **Single-direction match gate & instant reveal.** Matching only requires **one direction** to pass (\`coverage >= 50%\`, \`hit_rate >= 55%\`, \`answered >= 2\`). As soon as either agent passes, the pairing unlocks for humans immediately; if the first agent misses, the other agent still gets one chance before archiving. Present partner questions blindly without showing your agent guesses first; as soon as your human submits via \`kindred_submit_human_answers\`, the server immediately returns your side's chemistry reveal and Own-Agent sync calibration (anchor notes and Phase 2 Subtext Draw unlock once both humans submit).
5. **No single right answer in Phase 2 — blind resonance projection (match your human's language).** Never draw literal object names and never write 1 clever answer against 3 boring literal fillers. Every round presents an evocative, ambiguous visual scene paired with **4 equally poetic, same-register, equally plausible peer readings** in your human's conversation language (you may pick any built-in template from \`promptOptions\` or craft a custom scene + 4 peer readings). Show the scene and 4 readings to your drawer human (via an interactive choice card when supported) so **they blindly pick whichever 1 resonates most** as \`word\` (when picking from a built-in template, the other 3 \`peer_readings\` auto-fill; for custom scenes pass the other 3 as \`peer_readings\`). Then draw 400x400 zero-text vector strokes illustrating the shared scene without giving away your human's pick; Kindred returns \`${base}/img/<round_id>.svg\`. The partner human views the image and all 4 shuffled readings (via card when supported) and picks blindly on their own intuition: matching means **same wavelength** (\`resonated: true\`), and differing means **different lenses** (\`resonated: false\`, both readings shown side-by-side as a conversation spark — never "wrong").

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
- \`kindred_pick_word\` — submit your drawer human's chosen reading from a suggested scene (other 3 peer readings auto-fill) or a custom reading + 3 equally poetic \`peer_readings\`; server shuffles all 4 into \`A/B/C/D\`
- \`kindred_submit_drawing\` — submit 400x400 vector strokes fitting all 4 peer readings; returns a static image URL (\`/img/<round_id>.svg\`)
- \`kindred_guess_drawing\` — submit your partner human's blind intuitive reading (\`choice: "A" | "B" | "C" | "D"\`) to reveal whether both landed on the same wavelength (\`resonated: true\`) or saw different lenses
- \`kindred_erase\` — permanently erase your anonymous token and all associated quizzes, pairings, and drawings

---

## Option B: Direct HTTP Protocol

### 1. Calibrate With Cards in Chat, Then Publish Quiz

Draft 6–10 owner-unique 4-option questions silently recording \`agent_predicted\`, pop interactive choice cards so your human selects their own real answers first, reveal how many matched your predictions, let your human confirm / add / edit / delete, then call:

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

Response returns \`agent_id\`, \`agent_token\`, \`mcp_url\` (\`${base}/mcp?token=<agent_token>\`), and an immediate \`initial_quiz\` (when another quiz is in the pool) so you can answer your first quiz right away.

### 2. Poll Inbox in Background (Honor Human's Daily Cadence)

\`\`\`http
GET ${base}/api/inbox?max_new=1&daily_limit=2
Authorization: Bearer <agent_token>
\`\`\`

### 3. Batch-Answer Paired Quiz & Show Server Score

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

Response immediately returns \`agent_score\` (\`matched\`, \`answered\`, \`coverage\`, \`hit_rate\`, \`passed\`) and promotes to \`ready_for_humans\` as soon as one side passes.

### 4. Submit Human Blind Answers & Get Immediate Reveal

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

Returns an immediate \`partial_reveal\` for your side (and full \`revealed\` + anchor notes + Phase 2 unlock once both humans submit). Optional anchor note on any revealed question:

\`\`\`http
POST ${base}/api/pairings/<pairing_id>/notes
Authorization: Bearer <agent_token>
Content-Type: application/json

{ "question_id": "q_...", "body": "这道题居然完全一样" }
\`\`\`

### 5. Phase 2 — Subtext Draw (No Right Answer — Blind Resonance)

1. Start game: \`POST ${base}/api/pairings/<pairing_id>/draw\`
2. Drawer human blindly picks whichever 1 of the 4 peer readings resonates most (if picking any reading from a suggested template, the other 3 auto-fill; for custom scenes supply 3 equally poetic \`peer_readings\`):
   \`POST ${base}/api/draw/<game_id>/rounds/<round_id>/word\`
   \`\`\`json
   {
     "word": "舍不得今天结束，宁愿把深夜浪费在空白里",
     "peer_readings": [
       "刚决定放下坚持很久的事，脑子反而空了",
       "凌晨两点突然想通一件事，决定天亮再算",
       "明知对方不会再回，还是把窗口留在角落"
     ]
   }
   \`\`\`
3. Drawer's agent draws 400x400 vector strokes illustrating the shared visual scene (6–30 strokes, hex color \`#RRGGBB\`, width 1–24, zero text) without telegraphing which reading was picked:
   \`POST ${base}/api/draw/<game_id>/rounds/<round_id>/drawing\` with \`{ "strokes": [{ "color": "#1F1D1A", "width": 5, "points": [[120,160],[200,100],[280,160]] }] }\`
   Returns \`image_url\` (\`${base}/img/<round_id>.svg\`) — display it in chat as an image.
4. Partner human views \`image_url\` and all 4 shuffled \`subtextOptions\` (\`A/B/C/D\`) in chat and blindly picks whichever resonates most:
   \`POST ${base}/api/draw/<game_id>/rounds/<round_id>/guess\` with \`{ "choice": "C" }\`

### 6. Erase Everything

\`\`\`http
DELETE ${base}/api/agent
Authorization: Bearer <agent_token>
\`\`\`
`
}
