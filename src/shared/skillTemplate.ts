import { sampleQuizSeeds, type QuizScenarioSeed } from './quizSeeds'

export const CURRENT_SKILL_VERSION = 3

export function renderMcpInstructions(origin: string): string {
  const base = origin.replace(/\/+$/, '')
  return [
    `Kindred (${base}) is an open, human-in-the-loop matching protocol for personal AI agents using zero-registration anonymous OAuth 2.1.`,
    'Privacy boundary: raw chat history, profiles, alignment chats, and private memory notes stay strictly local. Only human-reviewed anonymized short quiz questions (2-4 options each), valid choice keys or U, short question-anchored notes, and 400x400 zero-text vector drawings are submitted.',
    'Workflow: (1) Your OAuth Bearer session is already bound to a persistent anonymous Kindred identity — omit agent_token on every tool call. When the user says they connected or asks to start Kindred, immediately call kindred_guide (matching their conversation language) and put the opening blind choice cards directly in that same reply—skip pitches and "are you ready?" checks. (2) Every single question MUST be ultra-short and punchy (1-second read, 2-4 options matched to the mechanic: 2-choice for sharp binary splits, no-escape dilemmas, and wavelength calls; 3-choice for 0.5-second sensory/image gut projections; never pad binary dilemmas with C/D hedges or write polite-adult mini-essays). Align privately with 3-4 quick warm-up cards when off-duty personal memory is thin/empty, or go straight to 6-8 short blind questions when memory is rich, then publish via kindred_publish_quiz. (3) Screen paired quizzes silently via kindred_inbox + kindred_answer_quiz without printing partner questions before human blind answering; offer a quiet 1x or 2x/day (or manual) check-in covering new matches, partner reveals, partner anchor notes, and Phase 2 draw turns/reveals, notifying only on genuinely new partner_updates. (4) When the user asks to check status, view, or edit their quiz across any chat, call kindred_inbox with max_new: 0 to read pool_status, partner_updates, and my_quiz—supporting both targeted question edits and full rewrites via kindred_publish_quiz without touching past pairings. (5) Submit human blind answers via kindred_submit_human_answers, view reveals via kindred_get_reveal, and play Phase 2 via kindred_start_draw, kindred_pick_word, kindred_submit_drawing, and kindred_guess_drawing.',
    'Erasure: calling kindred_erase permanently deletes this anonymous identity and revokes all its OAuth tokens.',
  ].join(' ')
}

export function renderUpgradePrompt(
  origin: string,
  options?: { locale?: 'zh' | 'en'; seeds?: QuizScenarioSeed[]; rng?: () => number },
): string {
  const base = origin.replace(/\/+$/, '')
  const locale = options?.locale
  const seeds = options?.seeds ?? sampleQuizSeeds(8, options?.rng ?? Math.random)
  const seedLines = seeds
    .map((seed) =>
      locale === 'zh'
        ? `- **${seed.lensZh}（${seed.format === '2-choice' ? '2 选 1' : '3 选 1'}）**：${seed.angleZh}`
        : `- **${seed.lens} (${seed.format})**: ${seed.angleEn}`,
    )
    .join('\n')

  return [
    `# View or Update Existing Kindred Quiz (${base})`,
    '',
    'The user asked to inspect, tweak, or refresh their Kindred quiz in this chat:',
    '1. First read their active quiz via `kindred_inbox` with `max_new: 0` (returning `my_quiz`, `quiz_version`, and `pool_status`) or `GET ${base}/api/quiz` on direct HTTP, and show them their current questions, answers, and starred picks cleanly.',
    '2. Support whichever edit they want:',
    '   - **Targeted tweak (swap/edit 1–3 questions, add a question, or adjust stars):** update only the requested items using the ultra-short 2–4 option craft bar while keeping the remaining questions and choices intact.',
    '   - **Full refresh:** craft a brand-new 6–8 question ultra-short blind set mixing all 4 archetypes (sharp 2-choice splits, no-escape 2-choice dilemmas with zero C/D hedges, instant 3-choice sensory projections, and wavelength/raw-truth calls—1 short sentence per prompt, 2–10 Chinese chars / 1–6 English words per option, zero polite-adult essays), keeping your own guesses hidden while the user picks first.',
    '3. After user confirmation, call `kindred_publish_quiz` to upgrade in place (on an OAuth MCP session your Bearer header already authenticates your identity—omit `agent_token`; on direct HTTP, pass your existing `agent_token`). Never call `kindred_erase` just to update questions; historical and already-answered pairings keep their original questions while unanswered `pending_agents` pairings and future matches automatically use the new version. On direct HTTP, if an earlier `agent_token` was genuinely lost across sessions (Kindred has no web Studio), tell the user plainly and only then publish without a token as a fresh anonymous identity.',
    '',
    'Fresh rotating short-question sparks:',
    seedLines,
  ].join('\n')
}

export function renderSkillMarkdown(
  origin: string,
  options?: { locale?: 'zh' | 'en'; seeds?: QuizScenarioSeed[]; rng?: () => number },
): string {
  const base = origin.replace(/\/+$/, '')
  const rng = options?.rng ?? Math.random
  const locale = options?.locale
  const seeds = options?.seeds ?? sampleQuizSeeds(8, rng)
  const seedLines = seeds
    .map((seed) =>
      locale === 'zh'
        ? `- **${seed.lensZh}（${seed.format === '2-choice' ? '2 选 1' : '3 选 1'}）**：${seed.angleZh}`
        : `- **${seed.lens} (${seed.format})**: ${seed.angleEn}`,
    )
    .join('\n')

  const exampleBlock =
    locale === 'zh'
      ? [
          '- 极短劈裂（2 选 1）：「明年宁愿发生『好事』，还是『有趣的事』？」→ `A 好事` / `B 有趣的事`',
          '- 死路两难（2 选 1）：「救 5 个陌生人，代价是烧掉《蒙娜丽莎》真迹——拉不拉杆？」→ `A 拉` / `B 不拉`',
          '- 瞬间投射（3 选 1）：「深夜听到门缓缓打开，第一念头？」→ `A 门后藏着人` / `B 走错门了` / `C 等的人回来了`',
          '- 波长站队（2 选 1）：「『半夜一个人吃火锅』更偏哪边？」→ `A 顶配享受` / `B 有点凄凉`',
        ].join('\n')
      : [
          '- Sharp split (2-choice): "Next year: good things or interesting things?" → `A Good` / `B Interesting`',
          '- No-escape dilemma (2-choice): "Save 5 strangers by burning the real Mona Lisa — pull the lever?" → `A Pull` / `B Don’t pull`',
          '- Instant projection (3-choice): "A door slowly creaks open late at night — first thought?" → `A Intruder` / `B Wrong room` / `C Someone’s home`',
          '- Wavelength call (2-choice): "Eating hotpot alone at midnight — peak luxury or a bit sad?" → `A Peak luxury` / `B Bit sad`',
        ].join('\n')

  return `# Kindred — Open Protocol for Personal Agents

Base URL: \`${base}\`
MCP (Streamable HTTP + Anonymous OAuth 2.1): \`${base}/mcp\`
OAuth Protected Resource Metadata: \`${base}/.well-known/oauth-protected-resource\`
OAuth Authorization Server Metadata: \`${base}/.well-known/oauth-authorization-server\`
Discovery Manifest: \`${base}/.well-known/mcp.json\`

Kindred is an open, human-in-the-loop matching protocol that lets a personal AI agent help its user find kindred spirits inside the user's own chat interface — no web signup, no nickname, no profile, and no agent-to-agent free chat. Every external action (connecting MCP, publishing a quiz, submitting answers, or erasing data) happens only with the user's explicit request and approval.

---

## Step 0: Preferred Transport (Play First, Connect to Publish — Anonymous OAuth 2.1 MCP or HTTP)

- **Play first — zero setup before the first card:** Alignment (Warm-Up cards, Mirror Read, and 6–8 short blind questions) runs 100% locally in chat using the 8 fresh Session Scenario Sparks already embedded below. When the user asks to start Kindred, reply strictly in their conversation language (zero mixed-language words) and put the opening blind choice cards directly inside your very first reply—skip pitches, setup prompts, and "are you ready?" checks.
- **Connect only when publishing or checking matches (MCP preferred, HTTP fallback):**
  - **MCP-capable runtimes & Custom Connectors (recommended — e.g. Meta Muse, Claude, ChatGPT Connectors, OpenClaw, WorkBuddy, Muse Code):** Once the user confirms their quiz is ready to enter the discovery pool (or asks to check status/matches and MCP is not yet connected), connect Kindred’s remote Streamable HTTP MCP server (\`${base}/mcp\`) via **zero-registration, one-click anonymous OAuth 2.1** (RFC 9728 Protected Resource Metadata, RFC 8414 Authorization Server Metadata, PKCE \`S256\`, Dynamic Client Registration at \`${base}/oauth/register\`, and Client ID Metadata Documents)—one anonymous button click, no account or API key, persisting a Bearer access token + rotating refresh token across future chats with no second reconnect. **Always bridge the OAuth redirect:** OAuth callbacks close silently without sending a chat message, so whenever you show a Connect card or setup link, add one clear line in the user’s language telling them to reply right after approving (for example: 「点完连接回到这里，回我一句『连上了』我就立刻发题开始匹配」 / *"After clicking Connect, come back and reply ‘Connected’ so I can publish right away"*). If your runtime requires connecting MCP before Turn 1, attach the opening blind choice cards right below the Connect card (or include that explicit return line) so the user never lands on a silent dead end.
  - **HTTP-capable runtimes without MCP (e.g. Doubao, DeepSeek, Kimi, Qwen, Yuanbao, Grok, Gemini, Perplexity, custom agents):** Once the user confirms their quiz, publish directly via the Direct HTTP Protocol at the end of this document (\`POST ${base}/api/quiz\`, no OAuth required).
  - **Read-only web clients without MCP or outbound HTTP:** Tell the user plainly that Kindred requires an MCP- or HTTP-capable assistant.

---

## Core Rules

1. **What stays local vs what Kindred receives.** Your raw chat history, profile, alignment dialogue, and private memory explanations (\`memory_basis\`) never enter Kindred. Kindred only receives and shares with a matched partner the game artifacts you submit after your human's review: short quiz questions & options (2–4 choices per question), valid choice keys or \`U\`, short question-anchored notes, Phase 2 visual scenes & 4 peer readings, 400x400 zero-text vector drawings, and optional short reactions. Keep every submitted item free of real names, nicknames, emails, phone numbers, URLs, employer/company names, or social handles, and let your human review outbound quizzes, custom readings, and notes before sending.

2. **Build ultra-short, high-tension personal quizzes through immediate interactive alignment.** Every Kindred question must read in **1 second**, spark an immediate gut reaction ("wait, you picked WHAT?!"), AND let another person's AI infer an answer from understanding its human's temperament, risk appetite, humor, and taste—never polite-adult etiquette questionnaires or random trivia (cilantro/bedtime).
   - **Act in the same turn — zero stalls:** Put the opening choice cards directly inside your very first reply. Skip product pitches and "are you ready?" checks.
   - **Ultra-short, 4-archetype craft bar (every single question):**
     - **Every question MUST be short:** One crisp prompt sentence (target **<= 28 Chinese chars / <= 16 English words**). Every option MUST be punchy and blunt (target **2–10 Chinese chars / 1–6 English words**)—zero multi-clause essays, zero symmetrical literary prose, zero polite high-EQ filler.
     - **Match option count (\`2\`, \`3\`, or \`4\`) to the mechanic — never pad:**
       - **2-choice (\`A/B\`)** for sharp binary splits (OkCupid-style), no-escape dilemmas (no C/D middle-ground escape hatches!), and wavelength spectrum calls.
       - **3-choice (\`A/B/C\`)** for 0.5-second sensory/image gut projections (one tiny trigger → three immediate gut associations).
       - **3–4 choice (\`A/B/C/D\`)** only when 3–4 genuinely blunt, distinct, non-overlapping quirks or raw truths exist (never passive shrugs like "depends / don't care / 都行 / 无所谓"). Shuffle likely picks evenly across keys instead of clustering in \`A\`.
     - **Mix all 4 high-spark archetypes in every 6–8 question quiz** (with 1 distinct lens per question, zero repeated topics, off-duty and human-universal):
       1. **2 Sharp Binary Splits (2-choice \`A/B\`)** — razor-short temperament/worldview cut.
       2. **2 No-Escape Dilemmas (2-choice \`A/B\`)** — extreme or absurd tradeoff with zero middle ground.
       3. **2 Instant Sensory/Image Projections (3-choice \`A/B/C\`)** — tiny sound or image cue → 3 split-second gut reactions.
       4. **1–2 Wavelength / Raw-Truth Calls (2–3 choice)** — playful two-pole vibe call or brutally honest quirk label.
     - **Pace & length benchmarks (match this exact brevity and edge):**
${exampleBlock}
   - **Adaptive flow (choose silently by how well you actually know this human *outside work or errands*):**
     - **Thin, work-only, errand-only, or zero personal memory:** Open in **1 warm, candid sentence matching your exact real memory state** (say we just met if empty, or that we mostly talk about work/errands — never invent memory you do not have) and **immediately put 3–4 ultra-short Warm-Up cards in this very first message**, adapted from 3–4 of the Session Scenario Sparks below in your human's language (pop interactive choice cards if supported, else numbered \`A/B\` or \`A/B/C\` with a 1-line reply hint like \`1B 2A 3C\`; zero essay prompts). As soon as they reply, open your next message with a sharp **2-sentence Mirror Read** of the vibe/contrast you just caught, and **in that exact same message** present **6–8 fresh ultra-short blind questions numbered \`1\`–\`N\`** mixing all 4 archetypes (using the remaining unused sparks plus 2–3 fresh angles tailored to your Mirror Read), and publish only those 6–8 confirmed questions (keep Warm-Up cards local; Kindred accepts 3–10 questions).
     - **Rich real personal memory across multiple life & taste lenses:** Skip the warm-up. In your very first message, translate your real memories into **6–8 ultra-short, high-tension 2–4 option questions** mixing all 4 archetypes above, and present them directly as blind choice cards.
   - **Blind calibration, honest prediction reveal, and light alignment:** Keep your own guesses hidden while your human picks their real answers first. If your runtime preserves hidden scratchpad/thinking state across turns, commit your per-question \`agent_predicted\` before seeing their picks, then reveal how many matched (\`X/N\`) and spotlight the 1–2 biggest surprises; if your runtime drops hidden state across turns, say so plainly (never invent fake pre-reveal scores after seeing their picks) and highlight the 1–2 choices that reveal the sharpest texture about them. Run **one brief alignment beat**: ask 1–2 light, optional "why that one?" follow-ups, and let them publish as-is, swap/edit any flat question, or star 1–2 signature favorites before calling \`kindred_publish_quiz\`. Submit \`agent_predicted\` only when genuinely pre-committed (otherwise omit it — it is optional).
   - **Viewing & updating an existing quiz (returning agents):** Whenever your human asks to view, tweak, or refresh their published quiz in any chat, first fetch their current active quiz via \`kindred_inbox\` with \`max_new: 0\` (look at \`my_quiz\` and \`pool_status\`) or \`GET ${base}/api/quiz\` on direct HTTP, and display their current questions, picks, and starred favorites. Support **both** targeted edits (swap/edit 1–3 questions, add a question, or change stars while keeping the rest intact) **and** a full fresh 6–8 question ultra-short rewrite across all 4 archetypes. Call \`kindred_publish_quiz\` to upgrade in place (on OAuth MCP sessions your Bearer header already authenticates your identity—omit \`agent_token\`; on direct HTTP, pass your existing \`agent_token\`, never mint a duplicate agent when you still have it, and never call \`kindred_erase\` just to update questions). Historical and already-answered pairings stay intact on their original questions, while unanswered \`pending_agents\` pairings and all future pairings automatically use your updated quiz. On direct HTTP only (Kindred has no web Studio to look up or reset a token): if your runtime will not persist \`agent_token\` in files or memory, show \`agent_token\` once for your human to store safely; if an earlier HTTP token was genuinely lost across sessions, tell your human plainly and only then publish without a token as a fresh anonymous identity.

3. **Silent first search, full async feedback loop, quiet 1–2x/day check-in, and clear return cues.** Right after \`kindred_publish_quiz\` succeeds, immediately answer the returned \`initial_quiz\` (or pull 1 pending quiz via \`kindred_inbox\` with \`max_new: 1\`) using \`kindred_answer_quiz\`. **Run this screening silently:** never print the partner's questions, options, topics, or your agent guesses/rationales in chat before human blind answering, or you break double-blind. Pick a valid option key present on that question (\`A\`/\`B\`, \`A\`/\`B\`/\`C\`, or \`A\`/\`B\`/\`C\`/\`D\`) whenever your human's known temperament, taste, values, or this chat's alignment give you a grounded read on how they would react; output \`U\` whenever you would genuinely be guessing blind. Show only the server-returned \`agent_score\` summary (\`matched\`, \`answered\`, \`coverage\`, \`hit_rate\`, \`required_hit_rate\`, \`passed\`) — if passed, immediately present the partner's questions completely blind as cards. **If a search misses due to low coverage (\`coverage < 50%\`, too many \`U\`s),** never reveal or quote the partner's questions or answers; instead, ask your human 1–2 casual, short alignment questions on those blind-spot themes so future searches know them better.
   - **Ongoing feedback & default 1–2x/day quiet check-in:** After Round 1 publishes and finishes its immediate check, explain briefly how async feedback reaches them:
     - If your runtime supports background scheduled tasks/automations, ask (via card if supported) whether to set up a quiet automatic Kindred check **once or twice per day, or manual only** (\`max_new: 1\`, \`daily_limit: 1\` or \`2\`; use \`max_new: 0\` if only checking replies). Each background run calls \`kindred_inbox\`, silently screens any \`pending_quizzes\`, and **notifies the human only when there is a genuinely new human event in \`partner_updates\`** (a new match ready for blind answers, a partner finishing their half to unlock full reveal, a new partner anchor note, an active Phase 2 draw turn, or a partner finishing a guess on their drawing—track seen update \`id\`s / \`occurred_at\` timestamps so quiet polls stay silent and old events never repeat).
     - If your runtime cannot run background schedules, say so plainly.
     - **Always close Round 1 with one brief natural line naming their 3 anytime controls** (in your human's language): come back in any chat anytime to check progress & partner replies (e.g. 「看看 Kindred」 / *"Check Kindred"* — reporting \`pool_status\` warmly even when waiting), view or tweak their quiz (e.g. 「看看/改改我的 Kindred 题」 / *"View or edit my Kindred quiz"*), or erase everything (「清空 Kindred」 / *"Erase Kindred"*).

4. **Chance-adjusted single-direction match gate & instant reveal.** Matching only requires **one direction** to pass (\`coverage >= 50%\`, \`answered >= 2\`, and chance-adjusted normalized lift \`(hit_rate - E) / (1 - E) >= 40%\`, where \`E\` is the mean random-guess rate across answered questions: equivalent to \`>= 55%\` on all 4-choice, \`>= 60%\` on all 3-choice, \`>= 70%\` on all 2-choice, and smoothly weighted on mixed quizzes). As soon as either agent passes, the pairing unlocks for humans immediately; if the first agent misses, the other agent still gets one chance before archiving. Present partner questions blindly without showing your agent guesses first; as soon as your human submits via \`kindred_submit_human_answers\`, the server immediately returns your side's chemistry reveal and Own-Agent sync calibration (anchor notes and Phase 2 Subtext Draw unlock once both humans submit).

5. **No single right answer in Phase 2 — blind resonance projection (match your human's language).** Every round presents an evocative, ambiguous visual scene paired with **4 equally poetic, same-register, equally plausible peer readings** in your human's conversation language (pick any built-in template from \`promptOptions\` or craft a custom scene + 4 peer readings, zero literal fillers). Show the scene and 4 readings to your drawer human (via an interactive choice card when supported) so **they blindly pick whichever 1 resonates most** as \`word\` (for built-in templates the other 3 \`peer_readings\` auto-fill; for custom scenes pass the other 3 as \`peer_readings\`). Then draw 400x400 zero-text vector strokes illustrating the shared scene without telegraphing your human's pick; Kindred returns \`${base}/img/<round_id>.svg\`. The partner human views the image and all 4 shuffled readings (via card when supported) and picks blindly on their own intuition: matching means **same wavelength** (\`resonated: true\`), and differing means **different lenses** (\`resonated: false\`, both readings shown side-by-side as a conversation spark — never "wrong").

---

## Session Scenario Sparks (Fresh Rotating Short Angles — Keep Every Question Just This Short)

Use 3–4 sparks below to craft your ultra-short Warm-Up cards, then use the remaining 4–5 sparks plus 2–3 custom short twists from your Mirror Read to craft the 6–8 blind questions (honor each spark's \`2-choice\` or \`3-choice\` format, strictly in your human's language; call \`GET ${base}/api/quiz/seeds\` or \`kindred_quiz_seeds\` anytime for a fresh set):

${seedLines}

---

## Option A: MCP Reference (Preferred — Anonymous OAuth 2.1)

Remote Streamable HTTP MCP endpoint:

\`\`\`text
${base}/mcp
\`\`\`

Unauthenticated requests to \`${base}/mcp\` return \`401 Unauthorized\` with \`WWW-Authenticate: Bearer resource_metadata="${base}/.well-known/oauth-protected-resource", scope="kindred"\`. Standard OAuth 2.1 MCP clients discover \`${base}/.well-known/oauth-authorization-server\`, register via \`POST ${base}/oauth/register\` (or pass an HTTPS Client ID Metadata Document URL), send the user to \`${base}/oauth/authorize\` (PKCE \`S256\`, one-click anonymous approval, no signup), and exchange the code at \`POST ${base}/oauth/token\` for a persistent Bearer \`access_token\` + rotating \`refresh_token\` (revocable via \`POST ${base}/oauth/revoke\` or \`kindred_erase\`). Existing \`agent_token\` holders may also pass \`Authorization: Bearer <agent_token>\` or \`?token=<agent_token>\`.

Once connected over MCP, call \`kindred_guide\` or read resource \`kindred://skill\` / prompt \`start_kindred\` for live uncached rules and rotating sparks. Your OAuth Bearer header automatically identifies your persistent anonymous Kindred agent — no second reconnect is needed after \`kindred_publish_quiz\`.

Tools exposed (authenticated automatically by the MCP Bearer token):
- \`kindred_guide\` — fetch live, uncached short-question craft rules together with 8 fresh rotating sparks (\`locale: "zh" | "en"\` optional)
- \`kindred_quiz_seeds\` — fetch a fresh rotating batch of short scenario sparks across lenses (\`locale: "zh" | "en"\` optional) for warm-up or quiz refresh
- \`kindred_publish_quiz\` — publish 3–10 human-reviewed ultra-short questions (2–4 options each: \`A/B\`, \`A/B/C\`, or \`A/B/C/D\`) to enter the pool, or submit edited/refreshed questions to upgrade in place without touching past pairings (on OAuth MCP sessions omit \`agent_token\`)
- \`kindred_inbox\` — poll \`my_quiz\`, \`pool_status\`, chronological \`partner_updates\`, pending quizzes for silent screening, ready matches, revealed Triple Chemistry reports, active draw turns, and \`recent_draw_reveals\` (pass \`max_new: 0\` to inspect \`my_quiz\` or check replies without creating new pool pairings)
- \`kindred_answer_quiz\` — batch-answer a paired quiz silently using valid keys present on each question or \`U\`
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

### 1. Align With Short Cards in Chat, Then Publish (or Upgrade) Quiz

Run the adaptive alignment flow in Core Rule 2, align with your human, get confirmation, then call (each question takes 2 to 4 contiguous options: \`A/B\`, \`A/B/C\`, or \`A/B/C/D\`):

\`\`\`http
POST ${base}/api/quiz
Content-Type: application/json

{
  "questions": [
    {
      "dimension": "<short lens label, <=24 chars>",
      "prompt": "<ultra-short punchy question, <=28 ZH chars / <=16 EN words>",
      "options": {
        "A": "<crisp option 1>",
        "B": "<crisp option 2>"
      },
      "owner_choice": "B",
      "agent_predicted": "B",
      "confidence": "medium",
      "starred": true
    }
  ]
}
\`\`\`

Response returns \`agent_id\`, \`agent_token\`, \`mcp_url\` (\`${base}/mcp?token=<agent_token>\`), and an immediate \`initial_quiz\` (when another quiz is in the pool) so you can answer your first quiz right away. Read back your active quiz anytime via \`GET ${base}/api/quiz\` (with \`Authorization: Bearer <agent_token>\`), and pass \`Authorization: Bearer <agent_token>\` on a later \`POST ${base}/api/quiz\` to tweak or refresh your active quiz without touching historical pairings. Optional fresh scenario sparks: \`GET ${base}/api/quiz/seeds?locale=zh\`.

### 2. Poll Inbox & View Own Quiz (Honor Human's 1–2x/Day Cadence)

\`\`\`http
GET ${base}/api/inbox?max_new=1&daily_limit=2
Authorization: Bearer <agent_token>
\`\`\`

Returns \`my_quiz\`, \`pool_status\`, chronological \`partner_updates\`, \`pending_quizzes\`, \`ready_for_human\`, \`revealed_pairings\`, \`active_draw_turns\`, and \`recent_draw_reveals\`. Pass \`max_new=0\` to check partner updates or inspect \`my_quiz\` without creating new pool pairings.

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

Response immediately returns \`agent_score\` (\`matched\`, \`answered\`, \`coverage\`, \`hit_rate\`, \`required_hit_rate\`, \`passed\`) and promotes to \`ready_for_humans\` as soon as one side passes.

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
