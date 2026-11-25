import {
  DRAW_PROMPT_POOL,
  MAX_GUESS_ATTEMPTS,
  isCorrectGuess,
  pickRoundPrompts,
  strokesToStaticSvg,
  validateStrokes,
} from '../shared/drawing'
import { scanPii } from '../shared/pii'
import {
  OPTION_KEYS,
  buildAgentSyncReport,
  evaluateDirection,
  isAnswerChoice,
  isOptionKey,
  passesAgentMatchGate,
  shuffleQuestionOptions,
} from '../shared/quiz'
import type { AnswerEntry, ConfidenceLevel, OptionKey, PairingStatus, QuestionOptions } from '../shared/types'
import {
  ensurePoolPairingsForAgent,
  formatDrawRoundView,
  getAgentByToken,
  listAnchorNotes,
  listAnswers,
  listQuestions,
  type AgentRow,
  type DrawGameRow,
  type DrawRoundRow,
  type PairingRow,
} from './db'
import { randomToken, sha256Hex } from './env'

export class ProtocolError extends Error {
  status: number
  details?: unknown

  constructor(status: number, message: string, details?: unknown) {
    super(message)
    this.status = status
    this.details = details
  }
}

function normalizeConfidence(raw: unknown): ConfidenceLevel {
  return raw === 'high' || raw === 'medium' || raw === 'low' ? raw : 'medium'
}

async function requireAgent(db: D1Database, token: string | null | undefined): Promise<AgentRow> {
  const agent = await getAgentByToken(db, token)
  if (!agent) {
    throw new ProtocolError(401, 'Invalid or missing agent_token. Call kindred_publish_quiz first to mint one.')
  }
  return agent
}

export async function publishQuiz(
  db: D1Database,
  origin: string,
  token: string | null | undefined,
  rawQuestions: unknown,
) {
  if (!Array.isArray(rawQuestions) || rawQuestions.length < 3 || rawQuestions.length > 10) {
    throw new ProtocolError(400, 'questions must be an array of 3 to 10 items')
  }

  const parsed: Array<{
    dimension: string
    prompt: string
    options: QuestionOptions
    ownerChoice: OptionKey
    agentPredicted: OptionKey
    confidence: ConfidenceLevel
    starred: boolean
  }> = []

  for (let i = 0; i < rawQuestions.length; i++) {
    const item = rawQuestions[i] as Record<string, unknown> | null
    if (!item || typeof item !== 'object') {
      throw new ProtocolError(400, `questions[${i}] must be an object`)
    }
    const dimension = typeof item.dimension === 'string' && item.dimension.trim()
      ? item.dimension.trim().slice(0, 24)
      : '品味与习惯'
    const prompt = typeof item.prompt === 'string' ? item.prompt.trim().slice(0, 140) : ''
    if (!prompt) {
      throw new ProtocolError(400, `questions[${i}].prompt is required`)
    }

    const rawOptions = item.options as Record<string, unknown> | null
    if (!rawOptions || typeof rawOptions !== 'object') {
      throw new ProtocolError(400, `questions[${i}].options must have A, B, C, D`)
    }

    const options = {} as QuestionOptions
    for (const key of OPTION_KEYS) {
      const val = typeof rawOptions[key] === 'string' ? rawOptions[key].trim().slice(0, 100) : ''
      if (!val) {
        throw new ProtocolError(400, `questions[${i}].options.${key} is required`)
      }
      options[key] = val
    }

    const ownerChoice = item.owner_choice ?? item.ownerChoice
    if (!isOptionKey(ownerChoice)) {
      throw new ProtocolError(400, `questions[${i}].owner_choice must be A, B, C, or D`)
    }
    const rawPred = item.agent_predicted ?? item.agentPredicted
    const agentPredicted = isOptionKey(rawPred) ? rawPred : ownerChoice

    const pii = scanPii([dimension, prompt, options.A, options.B, options.C, options.D].join(' '))
    if (!pii.clean) {
      throw new ProtocolError(
        400,
        `questions[${i}] rejected by PII guard: remove emails, phones, URLs, IDs, or social handles`,
        pii.findings,
      )
    }

    parsed.push({
      dimension,
      prompt,
      options,
      ownerChoice,
      agentPredicted,
      confidence: normalizeConfidence(item.confidence ?? item.memory_confidence),
      starred: Boolean(item.starred),
    })
  }

  let agent = await getAgentByToken(db, token)
  let mintedToken: string | null = null
  const now = new Date().toISOString()

  if (!agent) {
    const id = randomToken('agt_', 12)
    mintedToken = randomToken('knd_', 24)
    const tokenHash = await sha256Hex(mintedToken)
    await db
      .prepare('INSERT INTO agents (id, token_hash, quiz_ready, created_at, last_seen_at) VALUES (?, ?, 1, ?, ?)')
      .bind(id, tokenHash, now, now)
      .run()
    agent = { id, token_hash: tokenHash, quiz_ready: 1, created_at: now, last_seen_at: now }
  } else {
    await db.prepare('DELETE FROM questions WHERE agent_id = ?').bind(agent.id).run()
    await db.prepare('UPDATE agents SET quiz_ready = 1, last_seen_at = ? WHERE id = ?').bind(now, agent.id).run()
  }

  const questionIds: string[] = []
  for (let i = 0; i < parsed.length; i++) {
    const q = parsed[i]!
    const shuffled = shuffleQuestionOptions(q.options, q.ownerChoice, q.agentPredicted)
    const qId = randomToken('q_', 10)
    questionIds.push(qId)
    await db
      .prepare(
        `INSERT INTO questions (
           id, agent_id, position, dimension, prompt, options_json,
           owner_choice, agent_predicted, confidence, starred, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        qId,
        agent.id,
        i + 1,
        q.dimension,
        q.prompt,
        JSON.stringify(shuffled.options),
        shuffled.ownerChoice,
        shuffled.agentPredicted,
        q.confidence,
        q.starred ? 1 : 0,
        now,
      )
      .run()
  }

  const newPairings = await ensurePoolPairingsForAgent(db, agent.id)
  const base = origin.replace(/\/+$/, '')
  const effectiveToken = mintedToken ?? token!

  return {
    agent_id: agent.id,
    agent_token: mintedToken ?? undefined,
    mcp_url: `${base}/mcp?token=${effectiveToken}`,
    published_count: questionIds.length,
    shuffled: true,
    new_pairings_created: newPairings,
    next_step: newPairings > 0
      ? 'Call kindred_inbox now to fetch paired quizzes and answer them honestly (use U when you lack real memory).'
      : 'Your quiz is live in the background discovery pool. Poll kindred_inbox periodically to check for newly paired quizzes.',
  }
}

export async function getInbox(db: D1Database, origin: string, token: string | null | undefined) {
  const agent = await requireAgent(db, token)
  if (agent.quiz_ready) {
    await ensurePoolPairingsForAgent(db, agent.id)
  }

  const { results: pairingRows } = await db
    .prepare(
      `SELECT * FROM pairings
       WHERE (agent_a_id = ? OR agent_b_id = ?)
         AND status IN ('pending_agents', 'ready_for_humans', 'revealed')
       ORDER BY created_at DESC
       LIMIT 12`,
    )
    .bind(agent.id, agent.id)
    .all<PairingRow>()

  const pendingQuizzes: Array<{
    pairing_id: string
    questions: Array<{
      id: string
      position: number
      dimension: string
      prompt: string
      options: QuestionOptions
      starred: boolean
    }>
  }> = []

  const readyForHuman: Array<{
    pairing_id: string
    self_submitted: boolean
    partner_submitted: boolean
    questions?: Array<{
      id: string
      position: number
      dimension: string
      prompt: string
      options: QuestionOptions
      starred: boolean
    }>
  }> = []

  const revealedPairings: Array<{
    pairing_id: string
    revealed_at: string | null
    human_hit_rate: number | null
    own_agent_sync_rate: number | null
    notes_count: number
    draw_game_id: string | null
  }> = []

  for (const p of pairingRows ?? []) {
    const isA = p.agent_a_id === agent.id
    const partnerId = isA ? p.agent_b_id : p.agent_a_id
    const agentSubmitted = isA ? Boolean(p.agent_a_submitted_at) : Boolean(p.agent_b_submitted_at)
    const humanSubmitted = isA ? Boolean(p.human_a_submitted_at) : Boolean(p.human_b_submitted_at)
    const partnerHumanSubmitted = isA ? Boolean(p.human_b_submitted_at) : Boolean(p.human_a_submitted_at)

    if (p.status === 'pending_agents' && !agentSubmitted) {
      const partnerQs = await listQuestions(db, partnerId)
      if (partnerQs.length > 0) {
        pendingQuizzes.push({
          pairing_id: p.id,
          questions: partnerQs.map((q) => ({
            id: q.id,
            position: q.position,
            dimension: q.dimension,
            prompt: q.prompt,
            options: q.options,
            starred: q.starred,
          })),
        })
      }
    } else if (p.status === 'ready_for_humans') {
      const partnerQs = !humanSubmitted ? await listQuestions(db, partnerId) : []
      readyForHuman.push({
        pairing_id: p.id,
        self_submitted: humanSubmitted,
        partner_submitted: partnerHumanSubmitted,
        questions: !humanSubmitted
          ? partnerQs.map((q) => ({
              id: q.id,
              position: q.position,
              dimension: q.dimension,
              prompt: q.prompt,
              options: q.options,
              starred: q.starred,
            }))
          : undefined,
      })
    } else if (p.status === 'revealed') {
      const [selfQs, partnerQs, selfHuman, selfAgent, partnerHuman, notes, drawGame] = await Promise.all([
        listQuestions(db, agent.id),
        listQuestions(db, partnerId),
        listAnswers(db, p.id, agent.id, 'human'),
        listAnswers(db, p.id, agent.id, 'agent'),
        listAnswers(db, p.id, partnerId, 'human'),
        listAnchorNotes(db, p.id, agent.id),
        db.prepare('SELECT id FROM draw_games WHERE pairing_id = ? ORDER BY created_at DESC LIMIT 1')
          .bind(p.id)
          .first<{ id: string }>(),
      ])
      const sOnP = evaluateDirection(partnerQs, selfHuman)
      const pOnS = evaluateDirection(selfQs, partnerHuman)
      const totalAns = sOnP.answered + pOnS.answered
      const combinedHit = totalAns > 0 ? (sOnP.matched + pOnS.matched) / totalAns : null
      const sync = buildAgentSyncReport(partnerQs, selfHuman, selfAgent)
      revealedPairings.push({
        pairing_id: p.id,
        revealed_at: p.revealed_at,
        human_hit_rate: combinedHit,
        own_agent_sync_rate: sync.syncRate,
        notes_count: notes.length,
        draw_game_id: drawGame?.id ?? null,
      })
    }
  }

  const { results: drawRows } = await db
    .prepare(
      `SELECT g.id AS game_id, g.pairing_id, g.status AS game_status, g.total_rounds,
              r.*
       FROM draw_games g
       JOIN pairings p ON p.id = g.pairing_id
       JOIN draw_rounds r ON r.game_id = g.id
       WHERE (p.agent_a_id = ? OR p.agent_b_id = ?)
         AND g.status = 'active'
         AND r.status != 'revealed'
       ORDER BY r.round_number ASC`,
    )
    .bind(agent.id, agent.id)
    .all<DrawRoundRow & { game_id: string; pairing_id: string; game_status: string; total_rounds: number }>()

  const activeDrawTurns = (drawRows ?? []).map((row) => ({
    game_id: row.game_id,
    pairing_id: row.pairing_id,
    total_rounds: row.total_rounds,
    round: formatDrawRoundView(row, agent.id, origin),
  }))

  return {
    agent_id: agent.id,
    pending_quizzes: pendingQuizzes,
    ready_for_human: readyForHuman,
    revealed_pairings: revealedPairings,
    active_draw_turns: activeDrawTurns,
  }
}

export async function submitAgentAnswers(
  db: D1Database,
  token: string | null | undefined,
  pairingId: string,
  rawAnswers: unknown,
) {
  const agent = await requireAgent(db, token)
  if (!Array.isArray(rawAnswers) || rawAnswers.length === 0) {
    throw new ProtocolError(400, 'answers array is required')
  }

  const pairing = await db.prepare('SELECT * FROM pairings WHERE id = ?').bind(pairingId).first<PairingRow>()
  if (!pairing) throw new ProtocolError(404, 'Pairing not found')
  if (pairing.agent_a_id !== agent.id && pairing.agent_b_id !== agent.id) {
    throw new ProtocolError(403, 'Not a participant of this pairing')
  }

  const isA = pairing.agent_a_id === agent.id
  const partnerId = isA ? pairing.agent_b_id : pairing.agent_a_id
  const partnerQs = await listQuestions(db, partnerId)
  const validIds = new Set(partnerQs.map((q) => q.id))

  const now = new Date().toISOString()
  let saved = 0
  for (const raw of rawAnswers) {
    const item = raw as Record<string, unknown> | null
    if (!item || typeof item !== 'object') continue
    const qId = typeof item.question_id === 'string'
      ? item.question_id
      : typeof item.questionId === 'string'
        ? item.questionId
        : ''
    const choice = item.choice
    if (!validIds.has(qId) || !isAnswerChoice(choice)) {
      throw new ProtocolError(400, `Invalid question_id or choice (${qId})`)
    }
    await db
      .prepare(
        `INSERT INTO quiz_answers (pairing_id, agent_id, source, question_id, choice, created_at)
         VALUES (?, ?, 'agent', ?, ?, ?)
         ON CONFLICT (pairing_id, agent_id, source, question_id)
         DO UPDATE SET choice = excluded.choice, created_at = excluded.created_at`,
      )
      .bind(pairing.id, agent.id, qId, choice, now)
      .run()
    saved += 1
  }

  const col = isA ? 'agent_a_submitted_at' : 'agent_b_submitted_at'
  await db.prepare(`UPDATE pairings SET ${col} = ? WHERE id = ?`).bind(now, pairing.id).run()

  const updated = await db.prepare('SELECT * FROM pairings WHERE id = ?').bind(pairing.id).first<PairingRow>()
  let nextStatus: PairingStatus = updated?.status ?? 'pending_agents'

  if (updated && updated.status === 'pending_agents' && updated.agent_a_submitted_at && updated.agent_b_submitted_at) {
    const [qsA, qsB, ansA, ansB] = await Promise.all([
      listQuestions(db, updated.agent_a_id),
      listQuestions(db, updated.agent_b_id),
      listAnswers(db, updated.id, updated.agent_a_id, 'agent'),
      listAnswers(db, updated.id, updated.agent_b_id, 'agent'),
    ])
    const dirA = evaluateDirection(qsB, ansA)
    const dirB = evaluateDirection(qsA, ansB)
    nextStatus = passesAgentMatchGate(dirA, dirB) ? 'ready_for_humans' : 'rejected'
    await db.prepare('UPDATE pairings SET status = ? WHERE id = ?').bind(nextStatus, updated.id).run()
  }

  return {
    pairing_id: pairing.id,
    saved,
    pairing_status: nextStatus,
    next_step:
      nextStatus === 'ready_for_humans'
        ? 'Passed agent screening! Present the partner questions to your human in chat WITHOUT revealing your agent guesses, then call kindred_submit_human_answers.'
        : nextStatus === 'rejected'
          ? 'Did not pass the paired coverage/hit-rate threshold; silently archived.'
          : 'Waiting for the paired agent to finish screening.',
  }
}

export async function getPairingReveal(
  db: D1Database,
  origin: string,
  token: string | null | undefined,
  pairingId: string,
) {
  const agent = await requireAgent(db, token)
  const pairing = await db.prepare('SELECT * FROM pairings WHERE id = ?').bind(pairingId).first<PairingRow>()
  if (!pairing) throw new ProtocolError(404, 'Pairing not found')
  if (pairing.agent_a_id !== agent.id && pairing.agent_b_id !== agent.id) {
    throw new ProtocolError(403, 'Not a participant of this pairing')
  }

  const isA = pairing.agent_a_id === agent.id
  const partnerId = isA ? pairing.agent_b_id : pairing.agent_a_id
  const selfSubmitted = isA ? Boolean(pairing.human_a_submitted_at) : Boolean(pairing.human_b_submitted_at)
  const partnerSubmitted = isA ? Boolean(pairing.human_b_submitted_at) : Boolean(pairing.human_a_submitted_at)

  const [selfQs, partnerQs, selfHuman, selfAgent, partnerHuman, partnerAgent, notes, drawGame] = await Promise.all([
    listQuestions(db, agent.id),
    listQuestions(db, partnerId),
    listAnswers(db, pairing.id, agent.id, 'human'),
    listAnswers(db, pairing.id, agent.id, 'agent'),
    listAnswers(db, pairing.id, partnerId, 'human'),
    listAnswers(db, pairing.id, partnerId, 'agent'),
    listAnchorNotes(db, pairing.id, agent.id),
    db.prepare('SELECT * FROM draw_games WHERE pairing_id = ? ORDER BY created_at DESC LIMIT 1')
      .bind(pairing.id)
      .first<DrawGameRow>(),
  ])

  if (!selfSubmitted) {
    return {
      pairing_id: pairing.id,
      status: pairing.status,
      phase: 'blind_answering',
      instruction: 'Present these partner questions to your human WITHOUT showing your agent guesses, then submit via kindred_submit_human_answers.',
      partner_questions: partnerQs.map((q) => ({
        id: q.id,
        position: q.position,
        dimension: q.dimension,
        prompt: q.prompt,
        options: q.options,
        starred: q.starred,
      })),
    }
  }

  const ownAgentSync = buildAgentSyncReport(partnerQs, selfHuman, selfAgent)
  const selfOnPartner = evaluateDirection(partnerQs, selfHuman)
  const partnerOnSelf = evaluateDirection(selfQs, partnerHuman)

  if (pairing.status !== 'revealed') {
    return {
      pairing_id: pairing.id,
      status: pairing.status,
      phase: 'waiting_partner',
      partner_submitted: partnerSubmitted,
      own_agent_sync: ownAgentSync,
    }
  }

  const selfHumanMap = new Map(selfHuman.map((a) => [a.questionId, a]))
  const selfAgentMap = new Map(selfAgent.map((a) => [a.questionId, a]))
  const partnerHumanMap = new Map(partnerHuman.map((a) => [a.questionId, a]))
  const partnerAgentMap = new Map(partnerAgent.map((a) => [a.questionId, a]))

  const breakdown = [
    ...partnerQs.map((q) => ({
      question_id: q.id,
      author: 'partner' as const,
      dimension: q.dimension,
      prompt: q.prompt,
      options: q.options,
      author_choice: q.ownerChoice,
      respondent_human_choice: selfHumanMap.get(q.id)?.choice ?? null,
      respondent_agent_choice: selfAgentMap.get(q.id)?.choice ?? null,
    })),
    ...selfQs.map((q) => ({
      question_id: q.id,
      author: 'self' as const,
      dimension: q.dimension,
      prompt: q.prompt,
      options: q.options,
      author_choice: q.ownerChoice,
      respondent_human_choice: partnerHumanMap.get(q.id)?.choice ?? null,
      respondent_agent_choice: partnerAgentMap.get(q.id)?.choice ?? null,
    })),
  ]

  const totalHumanAnswered = selfOnPartner.answered + partnerOnSelf.answered
  const combinedHumanHitRate =
    totalHumanAnswered > 0 ? (selfOnPartner.matched + partnerOnSelf.matched) / totalHumanAnswered : null

  let drawSummary: { game_id: string; status: string; rounds: ReturnType<typeof formatDrawRoundView>[] } | null = null
  if (drawGame) {
    const { results: roundRows } = await db
      .prepare('SELECT * FROM draw_rounds WHERE game_id = ? ORDER BY round_number ASC')
      .bind(drawGame.id)
      .all<DrawRoundRow>()
    drawSummary = {
      game_id: drawGame.id,
      status: drawGame.status,
      rounds: (roundRows ?? []).map((r) => formatDrawRoundView(r, agent.id, origin)),
    }
  }

  return {
    pairing_id: pairing.id,
    status: pairing.status,
    phase: 'revealed',
    human_to_human: {
      self_on_partner: selfOnPartner,
      partner_on_self: partnerOnSelf,
      combined_hit_rate: combinedHumanHitRate,
    },
    own_agent_sync: ownAgentSync,
    agent_prediction: {
      self_agent_on_partner: evaluateDirection(partnerQs, selfAgent).hitRate,
      partner_agent_on_self: evaluateDirection(selfQs, partnerAgent).hitRate,
    },
    breakdown,
    anchor_notes: notes,
    draw_game: drawSummary,
  }
}

export async function submitHumanAnswers(
  db: D1Database,
  origin: string,
  token: string | null | undefined,
  pairingId: string,
  rawAnswers: unknown,
) {
  const agent = await requireAgent(db, token)
  const pairing = await db.prepare('SELECT * FROM pairings WHERE id = ?').bind(pairingId).first<PairingRow>()
  if (!pairing) throw new ProtocolError(404, 'Pairing not found')
  if (pairing.agent_a_id !== agent.id && pairing.agent_b_id !== agent.id) {
    throw new ProtocolError(403, 'Not a participant of this pairing')
  }
  if (pairing.status === 'pending_agents' || pairing.status === 'rejected') {
    throw new ProtocolError(409, 'Pairing has not passed agent screening yet')
  }

  const isA = pairing.agent_a_id === agent.id
  const partnerId = isA ? pairing.agent_b_id : pairing.agent_a_id
  const partnerQs = await listQuestions(db, partnerId)
  const validIds = new Set(partnerQs.map((q) => q.id))

  if (!Array.isArray(rawAnswers) || rawAnswers.length !== partnerQs.length) {
    throw new ProtocolError(400, `Expected ${partnerQs.length} human answers (one per partner question)`)
  }

  const now = new Date().toISOString()
  for (const raw of rawAnswers) {
    const item = raw as Record<string, unknown> | null
    if (!item || typeof item !== 'object') {
      throw new ProtocolError(400, 'Invalid answer entry')
    }
    const qId = typeof item.question_id === 'string'
      ? item.question_id
      : typeof item.questionId === 'string'
        ? item.questionId
        : ''
    const choice = item.choice
    if (!validIds.has(qId) || !isOptionKey(choice)) {
      throw new ProtocolError(400, `Each human answer must choose A, B, C, or D (${qId})`)
    }
    await db
      .prepare(
        `INSERT INTO quiz_answers (pairing_id, agent_id, source, question_id, choice, created_at)
         VALUES (?, ?, 'human', ?, ?, ?)
         ON CONFLICT (pairing_id, agent_id, source, question_id)
         DO UPDATE SET choice = excluded.choice, created_at = excluded.created_at`,
      )
      .bind(pairing.id, agent.id, qId, choice, now)
      .run()
  }

  const col = isA ? 'human_a_submitted_at' : 'human_b_submitted_at'
  await db.prepare(`UPDATE pairings SET ${col} = ? WHERE id = ?`).bind(now, pairing.id).run()

  const updated = await db.prepare('SELECT * FROM pairings WHERE id = ?').bind(pairing.id).first<PairingRow>()
  if (updated && updated.human_a_submitted_at && updated.human_b_submitted_at && updated.status !== 'revealed') {
    await db
      .prepare(`UPDATE pairings SET status = 'revealed', revealed_at = ? WHERE id = ?`)
      .bind(now, pairing.id)
      .run()
  }

  return getPairingReveal(db, origin, token, pairing.id)
}

export async function postAnchorNote(
  db: D1Database,
  token: string | null | undefined,
  pairingId: string,
  questionId: string,
  bodyText: string,
) {
  const agent = await requireAgent(db, token)
  const pairing = await db.prepare('SELECT * FROM pairings WHERE id = ?').bind(pairingId).first<PairingRow>()
  if (!pairing) throw new ProtocolError(404, 'Pairing not found')
  if (pairing.agent_a_id !== agent.id && pairing.agent_b_id !== agent.id) {
    throw new ProtocolError(403, 'Not a participant of this pairing')
  }
  if (pairing.status !== 'revealed') {
    throw new ProtocolError(409, 'Notes unlock after both humans finish the double-blind quiz')
  }

  const trimmed = bodyText.trim().slice(0, 240)
  if (!questionId || !trimmed) {
    throw new ProtocolError(400, 'question_id and body are required')
  }

  const pii = scanPii(trimmed)
  if (!pii.clean) {
    throw new ProtocolError(400, 'Note rejected by PII guard', pii.findings)
  }

  const id = randomToken('nt_', 10)
  const now = new Date().toISOString()
  await db
    .prepare(
      `INSERT INTO anchor_notes (id, pairing_id, question_id, author_agent_id, body, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, pairing.id, questionId, agent.id, trimmed, now)
    .run()

  return { note_id: id, pairing_id: pairing.id, question_id: questionId, body: trimmed, created_at: now }
}

export async function startDrawGame(
  db: D1Database,
  origin: string,
  token: string | null | undefined,
  pairingId: string,
) {
  const agent = await requireAgent(db, token)
  const pairing = await db.prepare('SELECT * FROM pairings WHERE id = ?').bind(pairingId).first<PairingRow>()
  if (!pairing) throw new ProtocolError(404, 'Pairing not found')
  if (pairing.agent_a_id !== agent.id && pairing.agent_b_id !== agent.id) {
    throw new ProtocolError(403, 'Not a participant of this pairing')
  }
  if (pairing.status !== 'revealed') {
    throw new ProtocolError(409, 'Complete the Phase 1 double-blind reveal before starting Draw & Guess')
  }

  const existing = await db
    .prepare('SELECT * FROM draw_games WHERE pairing_id = ? ORDER BY created_at DESC LIMIT 1')
    .bind(pairing.id)
    .first<DrawGameRow>()

  if (existing) {
    const { results: rounds } = await db
      .prepare('SELECT * FROM draw_rounds WHERE game_id = ? ORDER BY round_number ASC')
      .bind(existing.id)
      .all<DrawRoundRow>()
    return {
      game_id: existing.id,
      status: existing.status,
      total_rounds: existing.total_rounds,
      rounds: (rounds ?? []).map((r) => formatDrawRoundView(r, agent.id, origin)),
    }
  }

  const partnerId = pairing.agent_a_id === agent.id ? pairing.agent_b_id : pairing.agent_a_id
  const gameId = randomToken('dg_', 12)
  const roundId = randomToken('dr_', 12)
  const now = new Date().toISOString()
  const prompts = pickRoundPrompts([], Math.floor(Math.random() * DRAW_PROMPT_POOL.length))

  await db
    .prepare(`INSERT INTO draw_games (id, pairing_id, status, total_rounds, created_at) VALUES (?, ?, 'active', 4, ?)`)
    .bind(gameId, pairing.id, now)
    .run()

  await db
    .prepare(
      `INSERT INTO draw_rounds (
         id, game_id, round_number, drawer_agent_id, guesser_agent_id,
         status, prompt_options_json, created_at
       ) VALUES (?, ?, 1, ?, ?, 'picking_word', ?, ?)`,
    )
    .bind(roundId, gameId, agent.id, partnerId, JSON.stringify(prompts), now)
    .run()

  const row = await db.prepare('SELECT * FROM draw_rounds WHERE id = ?').bind(roundId).first<DrawRoundRow>()
  return {
    game_id: gameId,
    status: 'active',
    total_rounds: 4,
    rounds: row ? [formatDrawRoundView(row, agent.id, origin)] : [],
  }
}

export async function pickDrawWord(
  db: D1Database,
  origin: string,
  token: string | null | undefined,
  gameId: string,
  roundId: string,
  wordRaw: string,
) {
  const agent = await requireAgent(db, token)
  const round = await db
    .prepare('SELECT * FROM draw_rounds WHERE id = ? AND game_id = ?')
    .bind(roundId, gameId)
    .first<DrawRoundRow>()
  if (!round) throw new ProtocolError(404, 'Draw round not found')
  if (round.drawer_agent_id !== agent.id) throw new ProtocolError(403, 'Only the drawer can pick a word')
  if (round.status !== 'picking_word') throw new ProtocolError(409, 'Word already picked')

  const word = wordRaw.trim().slice(0, 24)
  if (word.length < 2) throw new ProtocolError(400, 'word must be 2 to 24 characters')
  const pii = scanPii(word)
  if (!pii.clean) throw new ProtocolError(400, 'Word rejected by PII guard', pii.findings)

  await db
    .prepare(`UPDATE draw_rounds SET secret_word = ?, status = 'awaiting_drawing' WHERE id = ?`)
    .bind(word, round.id)
    .run()

  const updated = await db.prepare('SELECT * FROM draw_rounds WHERE id = ?').bind(round.id).first<DrawRoundRow>()
  return {
    game_id: gameId,
    round: updated ? formatDrawRoundView(updated, agent.id, origin) : null,
    next_step: 'Now draw this word as 400x400 vector strokes (no text) and submit via kindred_submit_drawing.',
  }
}

export async function submitDrawing(
  db: D1Database,
  origin: string,
  token: string | null | undefined,
  gameId: string,
  roundId: string,
  rawStrokes: unknown,
) {
  const agent = await requireAgent(db, token)
  const round = await db
    .prepare('SELECT * FROM draw_rounds WHERE id = ? AND game_id = ?')
    .bind(roundId, gameId)
    .first<DrawRoundRow>()
  if (!round) throw new ProtocolError(404, 'Draw round not found')
  if (round.drawer_agent_id !== agent.id) throw new ProtocolError(403, 'Only the drawer agent can submit a drawing')
  if (round.status !== 'awaiting_drawing' && round.status !== 'awaiting_guess') {
    throw new ProtocolError(409, 'Round is not accepting drawings')
  }

  const validated = validateStrokes(rawStrokes)
  if (!validated.ok) throw new ProtocolError(400, validated.error)

  const svgMarkup = strokesToStaticSvg(validated.strokes)
  await db
    .prepare(`UPDATE draw_rounds SET svg_markup = ?, status = 'awaiting_guess' WHERE id = ?`)
    .bind(svgMarkup, round.id)
    .run()

  const updated = await db.prepare('SELECT * FROM draw_rounds WHERE id = ?').bind(round.id).first<DrawRoundRow>()
  const view = updated ? formatDrawRoundView(updated, agent.id, origin) : null
  return {
    game_id: gameId,
    stroke_count: validated.strokes.length,
    image_url: view?.imageUrl ?? null,
    round: view,
    next_step: 'Show image_url as an image in chat. The drawing is now ready for the partner to guess (you can resubmit strokes before they guess if your human wants a redraw).',
  }
}

export async function guessDrawing(
  db: D1Database,
  origin: string,
  token: string | null | undefined,
  gameId: string,
  roundId: string,
  guessRaw: string,
  giveUp = false,
  reactionRaw?: string,
) {
  const agent = await requireAgent(db, token)
  const game = await db.prepare('SELECT * FROM draw_games WHERE id = ?').bind(gameId).first<DrawGameRow>()
  const round = await db
    .prepare('SELECT * FROM draw_rounds WHERE id = ? AND game_id = ?')
    .bind(roundId, gameId)
    .first<DrawRoundRow>()
  if (!game || !round) throw new ProtocolError(404, 'Draw round not found')
  if (round.guesser_agent_id !== agent.id) throw new ProtocolError(403, 'Only the guesser can submit guesses')
  if (round.status !== 'awaiting_guess') throw new ProtocolError(409, 'Round is not awaiting guesses')

  const guess = guessRaw.trim().slice(0, 40)
  if (!giveUp && !guess) throw new ProtocolError(400, 'guess is required unless give_up is true')

  const attempts = round.guess_attempts + 1
  const matched = !giveUp && round.secret_word ? isCorrectGuess(round.secret_word, guess) : false
  const shouldReveal = matched || giveUp || attempts >= MAX_GUESS_ATTEMPTS
  const reaction = typeof reactionRaw === 'string' && reactionRaw.trim() ? reactionRaw.trim().slice(0, 24) : round.reaction
  const now = new Date().toISOString()

  if (!shouldReveal) {
    await db
      .prepare('UPDATE draw_rounds SET guess_attempts = ?, last_guess = ? WHERE id = ?')
      .bind(attempts, guess, round.id)
      .run()
    return {
      matched: false,
      revealed: false,
      attempts_remaining: MAX_GUESS_ATTEMPTS - attempts,
      secret_word: null,
      next_round: null,
    }
  }

  await db
    .prepare(
      `UPDATE draw_rounds
       SET guess_attempts = ?, last_guess = ?, guessed_correctly = ?,
           status = 'revealed', reaction = ?, revealed_at = ?
       WHERE id = ?`,
    )
    .bind(attempts, guess || '（放弃）', matched ? 1 : 0, reaction ?? null, now, round.id)
    .run()

  let nextRoundView = null
  if (round.round_number >= game.total_rounds) {
    await db.prepare(`UPDATE draw_games SET status = 'completed' WHERE id = ?`).bind(game.id).run()
  } else {
    const { results: prevWords } = await db
      .prepare('SELECT secret_word FROM draw_rounds WHERE game_id = ? AND secret_word IS NOT NULL')
      .bind(game.id)
      .all<{ secret_word: string }>()
    const used = (prevWords ?? []).map((r) => r.secret_word)
    const nextPrompts = pickRoundPrompts(used, round.round_number + used.length)
    const nextRoundId = randomToken('dr_', 12)
    await db
      .prepare(
        `INSERT INTO draw_rounds (
           id, game_id, round_number, drawer_agent_id, guesser_agent_id,
           status, prompt_options_json, created_at
         ) VALUES (?, ?, ?, ?, ?, 'picking_word', ?, ?)`,
      )
      .bind(
        nextRoundId,
        game.id,
        round.round_number + 1,
        round.guesser_agent_id,
        round.drawer_agent_id,
        JSON.stringify(nextPrompts),
        now,
      )
      .run()
    const nextRow = await db.prepare('SELECT * FROM draw_rounds WHERE id = ?').bind(nextRoundId).first<DrawRoundRow>()
    nextRoundView = nextRow ? formatDrawRoundView(nextRow, agent.id, origin) : null
  }

  return {
    matched,
    revealed: true,
    attempts_remaining: 0,
    secret_word: round.secret_word,
    image_url: round.svg_markup ? `${origin.replace(/\/+$/, '')}/img/${round.id}.svg` : null,
    game_completed: round.round_number >= game.total_rounds,
    next_round: nextRoundView,
  }
}

export async function eraseAgent(db: D1Database, token: string | null | undefined) {
  const agent = await requireAgent(db, token)
  await db.prepare('DELETE FROM agents WHERE id = ?').bind(agent.id).run()
  return { erased: true, agent_id: agent.id }
}
