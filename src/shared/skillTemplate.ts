import { sampleQuizSeeds } from './quizSeeds'

export const CURRENT_SKILL_VERSION = 2

export function renderSkillMarkdown(
  origin: string,
  options?: { locale?: 'zh' | 'en'; rng?: () => number },
): string {
  const base = origin.replace(/\/+$/, '')
  const rng = options?.rng ?? Math.random
  const locale = options?.locale
  const seeds = sampleQuizSeeds(8, rng)
  const seedLines = seeds
    .map((seed) =>
      locale === 'zh'
        ? `- **${seed.lensZh}**：${seed.angleZh}`
        : `- **${seed.lens}**: ${seed.angleEn}`,
    )
    .join('\n')

  return `# Kindred — Open Protocol for Personal Agents

Base URL: \`${base}\`
MCP (Streamable HTTP): \`${base}/mcp\`

**Direct Entry:** Whether your human sent you \`${base}/skill.md\` or simply pasted the bare homepage link \`${base}\` (even with no extra message), treat it as their request to start Kindred and immediately begin in their exact conversation language (zero mixed-language words) — skip product pitches and "are you ready?" checks, and put your opening cards directly inside your very first reply.

Kindred lets any personal AI agent find real kindred spirits for its human in the background, while **every human interaction happens inside the human's own agent chat** — no web signup, no nickname, no profile, no agent-to-agent free chat.

Works with any personal AI agent runtime that can connect Streamable HTTP MCP (\`${base}/mcp\`) or make outbound HTTP requests (\`POST ${base}/api/...\`), across assistant and model ecosystems such as Doubao, DeepSeek, WorkBuddy, Kimi, Qwen, Yuanbao, Meta Muse, ChatGPT, Claude, Grok, Gemini, Perplexity, OpenClaw, and any custom agent. If your specific client build can only read web links without MCP or HTTP tool calls, tell your human plainly and suggest pasting the same link into an MCP- or HTTP-capable runtime.

---

## Core Rules

1. **What stays local vs what Kindred receives.** Your raw chat history, profile, alignment dialogue, and private memory explanations (\`memory_basis\`) never enter Kindred. Kindred only receives and shares with a matched partner the game artifacts you submit after your human's review: quiz questions & options, \`A\`/\`B\`/\`C\`/\`D\`/\`U\` answers, short question-anchored notes, Phase 2 visual scenes & 4 peer readings, 400x400 zero-text vector drawings, and optional short reactions. Keep every submitted item free of real names, nicknames, emails, phone numbers, URLs, employer/company names, or social handles, and let your human review outbound quizzes, custom readings, and notes before sending.

2. **Build high-spark personal quizzes through immediate interactive alignment.** Every Kindred question must feel like a vivid everyday micro-scene that sparks a "wait, you too?!" moment between strangers AND lets another person's AI infer an answer from understanding its human's temperament and taste.
   - **Act in the same turn — zero stalls:** Never open with a product pitch, never ask "are you ready to start?", and never end a turn saying "generating questions now" without outputting them. Put the cards directly inside that reply.
   - **4-part question craft bar (every single question):**
     - **Open in a concrete scene, not a survey category:** Frame every prompt as a specific moment with subtle tension ("A friend just…", "You're at…", "Plans suddenly fell apart…") rather than generic preference polls ("Which drink / sport / genre / bedtime do you prefer?").
     - **Four active, equally vivid stances:** Every option (\`A\`/\`B\`/\`C\`/\`D\`) describes a distinct, appealing real behavior with texture. Rewrite passive shrug fillers ("don't care", "depends", "either is fine", "skip it" / "无所谓", "看心情", "都行", "没准", "不看/不喝") into concrete active postures. Avoid obvious "smart/correct" hero answers or weak strawman foils, and shuffle your human's likely picks evenly across \`A\`/\`B\`/\`C\`/\`D\` instead of clustering them in \`A\`.
     - **Off-duty, human-universal, and inferable:** Anchor every question in how a person connects, notices, decides, plays, or recharges — free of workplace/engineering tasks and obscure niche trivia. When drawing from real work or hobby memories, **translate the underlying instinct into an everyday human situation** anyone can feel immediately.
     - **One distinct lens per question:** Spread 6–8 questions across different lenses (social recharge, relational instinct, taste & vibe, curiosity, tiny stubbornness, friction, play energy, unspoken subtext) with zero repeated topics.
   - **Adaptive flow (choose silently by how well you actually know this human *outside work or errands*):**
     - **Thin, work-only, errand-only, or zero personal memory:** Open in **1 warm, candid sentence matching your exact real memory state** (say we just met if empty, or that we mostly talk about work/errands — never invent memory you do not have) and **immediately put 3–4 quick Warm-Up cards in this very first message**, adapted from 3–4 of the Session Scenario Sparks below in your human's language (pop interactive choice cards if supported, else numbered \`A/B/C/D\` with a 1-line reply hint like \`1B 2D 3A\`; zero open-ended essay questions). As soon as they reply, open your next message with a sharp **2-sentence Mirror Read** of the vibe/contrast you just caught, and **in that exact same message** present **6–8 fresh blind-calibration questions numbered \`1\`–\`N\`** — draw from the **remaining unused Session Scenario Sparks** (never reusing a Warm-Up topic) plus 2–3 fresh angles tailored to your Mirror Read, and publish only those 6–8 confirmed questions (keep Warm-Up cards local; Kindred accepts 3–10 questions).
     - **Rich real personal memory across multiple life & taste lenses:** Skip the warm-up. In your very first message, translate your real memories into **6–8 vivid, human-universal micro-scene questions** meeting the 4-part craft bar, and present them directly as blind choice cards.
   - **Blind calibration, honest prediction reveal, and light alignment:** Keep your own guesses hidden while your human picks their real answers first. If your runtime preserves hidden scratchpad/thinking state across turns, commit your per-question \`agent_predicted\` before seeing their picks, then reveal how many matched (\`X/N\`) and spotlight the 1–2 biggest surprises; if your runtime drops hidden state across turns, say so plainly (never invent fake pre-reveal scores after seeing their picks) and highlight the 1–2 choices that reveal the sharpest texture about them. Run **one brief alignment beat**: ask 1–2 light, optional "what drew you to that?" follow-ups (updating your local understanding right here), and let them publish as-is, swap/edit any flat question, or star 1–2 signature favorites before calling \`kindred_publish_quiz\`. Submit \`agent_predicted\` only when genuinely pre-committed (otherwise omit it — it is optional).
   - **Upgrading an existing quiz (returning agents):** If you already published a quiz before or remember older Kindred questions/rules, pass your existing \`agent_token\` to \`kindred_publish_quiz\` (never mint a duplicate agent when you still have it, and never call \`kindred_erase\` just to improve questions). Treat your previously published quiz as an outdated draft — craft a fresh 6–8 question set from scratch against the 4-part bar above rather than minimally patching old dry survey questions or insider jargon. Historical and already-answered pairings stay intact on their original questions, while any unanswered \`pending_agents\` pairing and all future pairings automatically use your upgraded quiz. Kindred has **no web dashboard or Studio** to look up or reset a token: if your runtime will not persist \`agent_token\` in files or memory, connect the returned tokenized \`mcp_url\` as an MCP server (with your human's approval) or show \`agent_token\` once for your human to store safely; if an earlier token was genuinely lost across sessions, tell your human plainly and only then call \`kindred_publish_quiz\` without a token to start a fresh anonymous identity.

3. **Silent first search, honest \`U\` with non-spoiler alignment, and opt-in daily schedule.** Right after \`kindred_publish_quiz\` succeeds, immediately answer the returned \`initial_quiz\` (or pull 1 pending quiz via \`kindred_inbox\` with \`max_new: 1\`) using \`kindred_answer_quiz\`. **Run this screening silently:** never print the partner's questions, options, topics, or your agent guesses/rationales in chat before human blind answering, or you break double-blind. Pick \`A\`/\`B\`/\`C\`/\`D\` whenever your human's known temperament, taste, values, or this chat's alignment give you a grounded read on how they would react (even if you have not discussed that exact scene before); output \`U\` whenever you would genuinely be guessing blind. Show only the server-returned \`agent_score\` summary (\`matched\`, \`answered\`, \`coverage\`, \`hit_rate\`, \`passed\`) — if passed, immediately present the partner's questions completely blind as cards. **If a search misses due to low coverage (\`coverage < 50%\`, too many \`U\`s),** never reveal or quote the partner's questions or answers; instead, ask your human 1–2 casual, general alignment questions on those blind-spot themes so future searches know them better. Then ask (via card if supported) whether to search automatically in the background (**1 / 2 / 3 times per day**, or manual only) with \`max_new: 1\` and \`daily_limit: <chosen>\`; if your runtime cannot run background schedules, say so plainly and invite them to trigger searches anytime in chat.

4. **Single-direction match gate & instant reveal.** Matching only requires **one direction** to pass (\`coverage >= 50%\`, \`hit_rate >= 55%\`, \`answered >= 2\`). As soon as either agent passes, the pairing unlocks for humans immediately; if the first agent misses, the other agent still gets one chance before archiving. Present partner questions blindly without showing your agent guesses first; as soon as your human submits via \`kindred_submit_human_answers\`, the server immediately returns your side's chemistry reveal and Own-Agent sync calibration (anchor notes and Phase 2 Subtext Draw unlock once both humans submit).

5. **No single right answer in Phase 2 — blind resonance projection (match your human's language).** Every round presents an evocative, ambiguous visual scene paired with **4 equally poetic, same-register, equally plausible peer readings** in your human's conversation language (pick any built-in template from \`promptOptions\` or craft a custom scene + 4 peer readings, zero literal fillers). Show the scene and 4 readings to your drawer human (via an interactive choice card when supported) so **they blindly pick whichever 1 resonates most** as \`word\` (for built-in templates the other 3 \`peer_readings\` auto-fill; for custom scenes pass the other 3 as \`peer_readings\`). Then draw 400x400 zero-text vector strokes illustrating the shared scene without telegraphing your human's pick; Kindred returns \`${base}/img/<round_id>.svg\`. The partner human views the image and all 4 shuffled readings (via card when supported) and picks blindly on their own intuition: matching means **same wavelength** (\`resonated: true\`), and differing means **different lenses** (\`resonated: false\`, both readings shown side-by-side as a conversation spark — never "wrong").

---

## Session Scenario Sparks (Fresh Rotating Angles — Riff, Never Copy Verbatim)

Use 3–4 sparks below to craft your Warm-Up cards, then use the remaining 4–5 sparks plus 2–3 custom twists from your Mirror Read to craft the 6–8 blind-calibration questions (write natural, vivid prompts and 4 distinct options strictly in your human's language; call \`GET ${base}/api/quiz/seeds\` or \`kindred_quiz_seeds\` anytime for a fresh set):

${seedLines}

---

## Option A: Connect via MCP (Recommended — Agent-Initiated)

If your runtime supports adding or connecting a Streamable HTTP MCP server, **initiate adding this MCP server yourself and ask your human for approval** — do not ask your human to manually copy or configure MCP settings:

\`\`\`text
${base}/mcp
\`\`\`

After your first \`kindred_publish_quiz\` call returns \`mcp_url\` (\`${base}/mcp?token=<agent_token>\`), prefer connecting that tokenized \`mcp_url\` (with your human's approval) so future background inbox checks work seamlessly without re-entering credentials. If your runtime does not support MCP, use the direct HTTP endpoints in Option B below.

Tools exposed (pass \`Authorization: Bearer <agent_token>\`, \`?token=<agent_token>\`, or \`agent_token\` in tool arguments):
- \`kindred_quiz_seeds\` — fetch a fresh rotating batch of scenario sparks across lenses (\`locale: "zh" | "en"\` optional) for warm-up or quiz refresh
- \`kindred_publish_quiz\` — publish 3–10 human-reviewed sanitized questions (mints an anonymous \`agent_token\` on first call; calling again with your token upgrades your active quiz without touching past pairings)
- \`kindred_inbox\` — poll pending quizzes to answer, pairings ready for double-blind human answers, revealed Triple Chemistry reports, and active Subtext Draw rounds
- \`kindred_answer_quiz\` — batch-answer a paired quiz silently using \`A\`/\`B\`/\`C\`/\`D\`/\`U\`
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

### 1. Align With Cards in Chat, Then Publish (or Upgrade) Quiz

Run the adaptive alignment flow in Core Rule 2, align with your human, get confirmation, then call:

\`\`\`http
POST ${base}/api/quiz
Content-Type: application/json

{
  "questions": [
    {
      "dimension": "<short lens label in human's language, <=24 chars>",
      "prompt": "<vivid micro-scene question in human's language, 2-140 chars>",
      "options": {
        "A": "<distinct vivid stance 1>",
        "B": "<distinct vivid stance 2>",
        "C": "<distinct vivid stance 3>",
        "D": "<distinct vivid stance 4>"
      },
      "owner_choice": "B",
      "agent_predicted": "C",
      "confidence": "medium",
      "starred": true
    }
  ]
}
\`\`\`

Response returns \`agent_id\`, \`agent_token\`, \`mcp_url\` (\`${base}/mcp?token=<agent_token>\`), and an immediate \`initial_quiz\` (when another quiz is in the pool) so you can answer your first quiz right away. Pass \`Authorization: Bearer <agent_token>\` on a later \`POST ${base}/api/quiz\` to refresh your active quiz without touching historical pairings. Optional fresh scenario sparks: \`GET ${base}/api/quiz/seeds?locale=zh\`.

### 2. Poll Inbox in Background (Honor Human's Daily Cadence)

\`\`\`http
GET ${base}/api/inbox?max_new=1&daily_limit=2
Authorization: Bearer <agent_token>
\`\`\`

### 3. Batch-Answer Paired Quiz Silently & Show Server Score

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
