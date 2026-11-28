import { sampleQuizSeeds, type QuizScenarioSeed } from './quizSeeds'

export const CURRENT_SKILL_VERSION = 3
export const KINDRED_SKILL_URI = 'skill://kindred/SKILL.md'
export const KINDRED_SKILL_INDEX_URI = 'skill://index.json'
export const KINDRED_SKILL_EXTENSION = 'io.modelcontextprotocol/skills'

export const KINDRED_SKILL_FRONTMATTER = {
  name: 'kindred',
  description:
    'Open personal-agent matching protocol — build ultra-short 2-4 option blind quizzes, silently screen paired quizzes, run quiet 1-2x/day check-ins, and play blind visual subtext games inside your own AI chat.',
} as const

function formatSparkLines(seeds: QuizScenarioSeed[], locale?: 'zh' | 'en'): string {
  return seeds
    .map((seed) =>
      locale === 'zh'
        ? `- **${seed.lensZh}（${seed.format === '2-choice' ? '2 选 1' : '3 选 1'}）**：${seed.angleZh}`
        : `- **${seed.lens} (${seed.format})**: ${seed.angleEn}`,
    )
    .join('\n')
}

export function renderMcpInstructions(origin: string): string {
  const base = origin.replace(/\/+$/, '')
  return [
    `Kindred (${base}/mcp) is an open, human-in-the-loop matching protocol for personal AI agents over Streamable HTTP MCP with zero-registration anonymous OAuth 2.1 and SEP-2640 skills (${KINDRED_SKILL_URI}).`,
    'Privacy boundary: raw chat history, profiles, alignment chats, and private memory notes stay strictly local. Only human-reviewed anonymized short quiz questions (2-4 options each), valid choice keys or U, short question-anchored notes, and 400x400 zero-text vector drawings are submitted.',
    'Workflow: (1) Your OAuth Bearer session is already bound to a persistent anonymous Kindred identity across chats. When the user connects or asks to start Kindred, immediately load skill://kindred/SKILL.md + kindred_quiz_seeds (or call kindred_guide matching their language) and put the opening blind choice cards directly in that same reply—skip pitches and "are you ready?" checks. (2) Every question MUST be ultra-short and punchy (1-second read, 2-4 options matched to the mechanic: 2-choice for sharp binary splits, no-escape dilemmas, and wavelength calls; 3-choice for 0.5-second sensory/image gut projections; never pad binary dilemmas with C/D hedges or write polite-adult mini-essays). Align privately with 3-4 quick warm-up cards when off-duty personal memory is thin/empty, or go straight to 6-8 short blind questions when memory is rich, then publish via kindred_publish_quiz. (3) Screen paired quizzes silently via kindred_inbox + kindred_answer_quiz without printing partner questions before human blind answering; offer a quiet 1x or 2x/day (or manual) check-in covering new matches, partner reveals, partner anchor notes, and Phase 2 draw turns/reveals, notifying only on genuinely new partner_updates. (4) When the user asks to check status, view, or edit their quiz across any chat, call kindred_inbox with max_new: 0 to read pool_status, partner_updates, and my_quiz—supporting both targeted question edits and full rewrites via kindred_publish_quiz without touching past pairings. (5) Submit human blind answers via kindred_submit_human_answers, view reveals via kindred_get_reveal, and play Phase 2 via kindred_start_draw, kindred_pick_word, kindred_submit_drawing, and kindred_guess_drawing.',
    'Erasure: calling kindred_erase permanently deletes this anonymous identity and revokes all its OAuth tokens.',
  ].join(' ')
}

export function renderMcpSkillDocument(origin: string): string {
  const base = origin.replace(/\/+$/, '')
  return `---
name: ${KINDRED_SKILL_FRONTMATTER.name}
description: ${KINDRED_SKILL_FRONTMATTER.description}
---

# Kindred — Open MCP Protocol for Personal Agents

MCP Endpoint (Streamable HTTP + Anonymous OAuth 2.1): \`${base}/mcp\`
Skill Resource: \`${KINDRED_SKILL_URI}\`
Discovery Manifest: \`${base}/.well-known/mcp.json\`

Kindred is an open, human-in-the-loop matching protocol that lets a personal AI agent help its user find kindred spirits inside the user's own chat interface — no signup, no nickname, no profile, and no agent-to-agent free chat. Every external action (publishing a quiz, submitting answers, posting a note, or erasing data) happens only with the user's explicit request and approval.

Your OAuth 2.1 Bearer token already authenticates a persistent anonymous Kindred identity across future chats.

---

## Core Rules

1. **What stays local vs what Kindred receives.** Your raw chat history, profile, alignment dialogue, and private memory explanations never enter Kindred. Kindred only receives and shares with a matched partner the game artifacts you submit after your human's review: short quiz questions & options (2–4 choices per question), valid choice keys or \`U\`, short question-anchored notes, Phase 2 visual scenes & 4 peer readings, 400x400 zero-text vector drawings, and optional short reactions. Keep every submitted item free of real names, nicknames, emails, phone numbers, URLs, employer/company names, or social handles, and let your human review outbound quizzes, custom readings, and notes before sending.

2. **Start in the same turn with fresh sparks — zero stalls.** When the user connects Kindred or asks to start, reply strictly in their conversation language (zero mixed-language words). Fetch fresh rotating short scenario angles via \`kindred_quiz_seeds\` (matching their \`locale\`: \`"zh"\` or \`"en"\`) or \`kindred_guide\` if not already provided in this turn, and put the opening blind choice cards directly inside your very first reply—skip pitches and "are you ready?" checks.

3. **Ultra-short, 4-archetype quiz craft bar (every single question).** Every Kindred question must read in **1 second**, spark an immediate gut reaction ("wait, you picked WHAT?!"), AND let another person's AI infer an answer from understanding its human's temperament, risk appetite, humor, and taste—never polite-adult etiquette questionnaires or random trivia (cilantro/bedtime).
   - **Every question MUST be short:** One crisp prompt sentence (target **<= 28 Chinese chars / <= 16 English words**). Every option MUST be punchy and blunt (target **2–10 Chinese chars / 1–6 English words**)—zero multi-clause essays, zero symmetrical literary prose, zero polite high-EQ filler.
   - **Match option count (\`2\`, \`3\`, or \`4\`) to the mechanic — never pad:**
     - **2-choice (\`A/B\`)** for sharp binary splits, no-escape dilemmas (zero C/D middle-ground escape hatches), and wavelength spectrum calls.
     - **3-choice (\`A/B/C\`)** for 0.5-second sensory/image gut projections (one tiny trigger → three immediate gut associations).
     - **3–4 choice (\`A/B/C/D\`)** only when 3–4 genuinely blunt, distinct, non-overlapping quirks or raw truths exist (never passive shrugs like "depends / don't care / 都行 / 无所谓"). Shuffle likely picks evenly across keys instead of clustering in \`A\`.
   - **Mix all 4 high-spark archetypes in every 6–8 question quiz** (1 distinct lens per question, zero repeated topics, off-duty and human-universal):
     1. **2 Sharp Binary Splits (2-choice \`A/B\`)** — razor-short temperament/worldview cut.
     2. **2 No-Escape Dilemmas (2-choice \`A/B\`)** — extreme or absurd tradeoff with zero middle ground.
     3. **2 Instant Sensory/Image Projections (3-choice \`A/B/C\`)** — tiny sound or image cue → 3 split-second gut reactions.
     4. **1–2 Wavelength / Raw-Truth Calls (2–3 choice)** — playful two-pole vibe call or brutally honest quirk label.
   - **Pace & length benchmarks (match this exact brevity and edge):**
     - Sharp split (2-choice): 「明年宁愿发生『好事』，还是『有趣的事』？」→ \`A 好事\` / \`B 有趣的事\` | "Next year: good things or interesting things?" → \`A Good\` / \`B Interesting\`
     - No-escape dilemma (2-choice): 「救 5 个陌生人，代价是烧掉《蒙娜丽莎》真迹——拉不拉杆？」→ \`A 拉\` / \`B 不拉\` | "Save 5 strangers by burning the real Mona Lisa — pull the lever?" → \`A Pull\` / \`B Don’t pull\`
     - Instant projection (3-choice): 「深夜听到门缓缓打开，第一念头？」→ \`A 门后藏着人\` / \`B 走错门了\` / \`C 等的人回来了\` | "A door slowly creaks open late at night — first thought?" → \`A Intruder\` / \`B Wrong room\` / \`C Someone’s home\`
     - Wavelength call (2-choice): 「『半夜一个人吃火锅』更偏哪边？」→ \`A 顶配享受\` / \`B 有点凄凉\` | "Eating hotpot alone at midnight — peak luxury or a bit sad?" → \`A Peak luxury\` / \`B Bit sad\`

4. **Adaptive local alignment, honest calibration, and in-place quiz updates.**
   - **Thin, work-only, errand-only, or zero personal memory:** Open in **1 warm, candid sentence matching your exact real memory state** (never invent memory you do not have) and **immediately put 3–4 ultra-short Warm-Up cards in this very first message**, adapted from 3–4 sparks from \`kindred_quiz_seeds\` (pop interactive choice cards if supported, else numbered \`A/B\` or \`A/B/C\` with a 1-line reply hint like \`1B 2A 3C\`). As soon as they reply, open your next message with a sharp **2-sentence Mirror Read** of the vibe/contrast you caught, and **in that exact same message** present **6–8 fresh ultra-short blind questions numbered \`1\`–\`N\`** mixing all 4 archetypes (using the remaining sparks plus 2–3 custom short angles from your Mirror Read), and publish only those 6–8 confirmed questions (keep Warm-Up cards local; Kindred accepts 3–10 questions).
   - **Rich real personal memory across multiple life & taste lenses:** Skip the warm-up. In your very first message, translate your real memories into **6–8 ultra-short, high-tension 2–4 option questions** mixing all 4 archetypes, and present them directly as blind choice cards.
   - **Blind calibration & light alignment:** Keep your own guesses hidden while your human picks first. Commit per-question \`agent_predicted\` before seeing their picks only if your runtime preserves hidden scratchpad/thinking state across turns, then reveal \`X/N\` and spotlight the 1–2 biggest surprises; otherwise say so plainly (never invent fake pre-reveal scores) and highlight the 1–2 sharpest choices. Run **one brief alignment beat** (1–2 optional "why that one?" follow-ups, allow swaps/edits or starring 1–2 favorites), then call \`kindred_publish_quiz\`.
   - **Viewing & updating an existing quiz:** Whenever your human asks to view, tweak, or refresh their quiz in any chat, first call \`kindred_inbox\` with \`max_new: 0\` (reading \`my_quiz\` and \`pool_status\`) and display their current questions, choices, and stars cleanly. Support **both** targeted edits (swap/edit 1–3 questions, add a question, or adjust stars) **and** a full fresh 6–8 question rewrite. Call \`kindred_publish_quiz\` to upgrade in place (never call \`kindred_erase\` just to edit); historical and already-answered pairings stay intact while unanswered \`pending_agents\` pairings and future matches automatically use the updated quiz.

5. **Silent first search, full async feedback loop, quiet 1–2x/day check-in, and anytime controls.** Right after \`kindred_publish_quiz\` succeeds, immediately answer the returned \`initial_quiz\` (or pull 1 pending quiz via \`kindred_inbox\` with \`max_new: 1\`) using \`kindred_answer_quiz\`. **Run this screening silently:** never print the partner's questions, options, topics, or your agent guesses/rationales in chat before human blind answering, or you break double-blind. Pick a valid option key present on that question (\`A\`/\`B\`, \`A\`/\`B\`/\`C\`, or \`A\`/\`B\`/\`C\`/\`D\`) whenever your human's temperament, taste, values, or this chat's alignment give you a grounded read; output \`U\` whenever you would genuinely be guessing blind. Show only the server-returned \`agent_score\` summary (\`matched\`, \`answered\`, \`coverage\`, \`hit_rate\`, \`required_hit_rate\`, \`passed\`) — if passed, immediately present the partner's questions completely blind as cards. **If a search misses due to low coverage (\`coverage < 50%\`),** never reveal or quote the partner's questions or answers; instead, ask 1–2 casual short alignment questions on those blind-spot themes.
   - **Ongoing feedback & default 1–2x/day quiet check-in:** After Round 1 publishes and finishes its immediate check, if your runtime supports background scheduled tasks/automations, ask (via card if supported) whether to set up a quiet automatic Kindred check **once or twice per day, or manual only** (\`max_new: 1\`, \`daily_limit: 1\` or \`2\`; use \`max_new: 0\` when only checking replies). Each run calls \`kindred_inbox\`, silently screens \`pending_quizzes\`, and **notifies the human only on genuinely new events in \`partner_updates\`** (a new match ready for blind answers, a partner finishing their half for full reveal, a new partner anchor note, an active Phase 2 draw turn, or a partner finishing a guess on their drawing—track seen update \`id\`s / \`occurred_at\` timestamps so quiet polls stay silent and old events never repeat). If your runtime cannot run background schedules, say so plainly.
   - **Always close Round 1 with one brief natural line naming their 3 anytime controls** in their language: check progress & partner replies anytime (「看看 Kindred」 / *"Check Kindred"* — reporting \`pool_status\` warmly even when waiting), view or edit their quiz anytime (「看看/改改我的 Kindred 题」 / *"View or edit my Kindred quiz"*), or erase everything (「清空 Kindred」 / *"Erase Kindred"*).

6. **Chance-adjusted single-direction match gate & instant reveal.** Matching only requires **one direction** to pass (\`coverage >= 50%\`, \`answered >= 2\`, and chance-adjusted normalized lift \`(hit_rate - E) / (1 - E) >= 40%\`, where \`E\` is the mean random-guess rate across answered questions: equivalent to \`>= 55%\` on all 4-choice, \`>= 60%\` on all 3-choice, \`>= 70%\` on all 2-choice, smoothly weighted on mixed quizzes). As soon as either agent passes, the pairing unlocks for humans immediately; if the first agent misses, the other agent still gets one chance before archiving. Present partner questions blindly without showing your agent guesses first; as soon as your human submits via \`kindred_submit_human_answers\`, the server immediately returns your side's chemistry reveal and Own-Agent sync calibration (anchor notes and Phase 2 Subtext Draw unlock once both humans submit).

7. **Phase 2 — Subtext Draw (no right answer, blind resonance projection).** Match your human's conversation language. Every round presents an evocative, ambiguous visual scene paired with **4 equally poetic, same-register, equally plausible peer readings** (pick any built-in template from \`promptOptions\` or craft a custom scene + 4 peer readings, zero literal fillers). Show the scene and 4 readings to your drawer human (via card when supported) so **they blindly pick whichever 1 resonates most** as \`word\` (for built-in templates the other 3 \`peer_readings\` auto-fill; for custom scenes pass the other 3 as \`peer_readings\`). Then draw 400x400 zero-text vector strokes illustrating the shared scene without telegraphing your human's pick; Kindred returns \`${base}/img/<round_id>.svg\`. The partner human views the image and all 4 shuffled readings and picks blindly on their own intuition: matching means **same wavelength** (\`resonated: true\`), and differing means **different lenses** (\`resonated: false\`, both readings shown side-by-side as a conversation spark — never "wrong").

---

## MCP Tools Reference

- \`kindred_guide\` — fetch this protocol together with 8 fresh rotating short scenario sparks (\`locale: "zh" | "en"\` optional)
- \`kindred_quiz_seeds\` — fetch a fresh rotating batch of short scenario sparks across distinct lenses (\`locale: "zh" | "en"\`, \`count: 1..8\`)
- \`kindred_publish_quiz\` — publish 3–10 human-reviewed ultra-short questions (2–4 options each: \`A/B\`, \`A/B/C\`, or \`A/B/C/D\`), or submit edited/refreshed questions to upgrade in place without touching past pairings
- \`kindred_inbox\` — read \`my_quiz\`, \`pool_status\`, chronological \`partner_updates\`, \`pending_quizzes\`, \`ready_for_human\`, \`revealed_pairings\`, \`active_draw_turns\`, \`recent_draw_reveals\`, and \`opening_sparks\` (pass \`max_new: 0\` for read-only inspection/reply checks)
- \`kindred_answer_quiz\` — silently batch-answer a paired quiz using valid option keys present on each question or \`U\`
- \`kindred_submit_human_answers\` — submit your human's double-blind answers for immediate chemistry reveal & Own-Agent sync
- \`kindred_get_reveal\` — retrieve double-blind questions, partial reveal, or full Triple Chemistry Reveal + anchor notes
- \`kindred_post_note\` — leave a short human-reviewed note anchored to one question in a revealed pairing
- \`kindred_start_draw\` — start a 4-round Phase 2 Subtext Draw game for a revealed pairing
- \`kindred_pick_word\` — submit your drawer human's blindly chosen reading (built-in template auto-fills peers; custom scene passes 3 \`peer_readings\`)
- \`kindred_submit_drawing\` — submit 400x400 zero-text vector strokes fitting all 4 readings; returns static SVG \`image_url\`
- \`kindred_guess_drawing\` — submit partner human's blind choice (\`A/B/C/D\`) to reveal wavelength resonance
- \`kindred_erase\` — permanently erase this anonymous identity, all quizzes, pairings, drawings, and OAuth tokens
`
}

export function renderGuideWithSparks(
  origin: string,
  options?: { locale?: 'zh' | 'en'; seeds?: QuizScenarioSeed[]; rng?: () => number },
): string {
  const rng = options?.rng ?? Math.random
  const locale = options?.locale
  const seeds = options?.seeds ?? sampleQuizSeeds(8, rng)
  const sparkSection = [
    '',
    '---',
    '',
    '## Session Scenario Sparks (Fresh Rotating Short Angles — Keep Every Question Just This Short)',
    '',
    'Use 3–4 sparks below for ultra-short Warm-Up cards, then use the remaining 4–5 sparks plus 2–3 custom short angles from your Mirror Read for the 6–8 blind questions (honor each spark’s `2-choice` or `3-choice` format, strictly in your human’s language; call `kindred_quiz_seeds` anytime for a fresh batch):',
    '',
    formatSparkLines(seeds, locale),
  ].join('\n')
  return `${renderMcpSkillDocument(origin)}${sparkSection}`
}

export function renderUpgradePrompt(
  origin: string,
  options?: { locale?: 'zh' | 'en'; seeds?: QuizScenarioSeed[]; rng?: () => number },
): string {
  const base = origin.replace(/\/+$/, '')
  const locale = options?.locale
  const seeds = options?.seeds ?? sampleQuizSeeds(8, options?.rng ?? Math.random)

  return [
    `# View or Update Existing Kindred Quiz (${base}/mcp)`,
    '',
    'The user asked to inspect, tweak, or refresh their Kindred quiz in this chat:',
    '1. First read their active quiz via `kindred_inbox` with `max_new: 0` (returning `my_quiz`, `quiz_version`, and `pool_status`) and show their current questions, answers, and starred picks cleanly.',
    '2. Support whichever edit they want:',
    '   - **Targeted tweak (swap/edit 1–3 questions, add a question, or adjust stars):** update only the requested items using the ultra-short 2–4 option craft bar while keeping the remaining questions and choices intact.',
    '   - **Full refresh:** craft a brand-new 6–8 question ultra-short blind set mixing all 4 archetypes (sharp 2-choice splits, no-escape 2-choice dilemmas with zero C/D hedges, instant 3-choice sensory projections, and wavelength/raw-truth calls—1 short sentence per prompt, 2–10 Chinese chars / 1–6 English words per option, zero polite-adult essays), keeping your own guesses hidden while the user picks first.',
    '3. After user confirmation, call `kindred_publish_quiz` to upgrade in place. Never call `kindred_erase` just to update questions; historical and already-answered pairings keep their original questions while unanswered `pending_agents` pairings and future matches automatically use the new version.',
    '',
    'Fresh rotating short-question sparks:',
    formatSparkLines(seeds, locale),
  ].join('\n')
}
