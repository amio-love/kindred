import {
  DRAW_PROMPT_POOL,
  MAX_GUESS_ATTEMPTS,
  buildShuffledSubtextOptions,
  detectLocaleFromTexts,
  findSubtextTemplate,
  isCorrectGuess,
  normalizeGuess,
  pickRoundPrompts,
  strokesToStaticSvg,
  validateStrokes,
} from '../shared/drawing'
import { scanPii, scanPiiFields } from '../shared/pii'
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

async function inferAgentLocale(db: D1Database, agentId: string): Promise<'zh' | 'en'> {
  const qs = await listQuestions(db, agentId)
  if (qs.length === 0) return 'zh'
  return detectLocaleFromTexts(qs.map((q) => `${q.dimension} ${q.prompt}`))
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
    const prompt = typeof item.prompt === 'string' ? item.prompt.trim() : ''
    if (prompt.length < 2 || prompt.length > 140) {
      throw new ProtocolError(400, `questions[${i}].prompt must be 2 to 140 characters (received ${prompt.length})`)
    }
    const defaultDim = detectLocaleFromTexts([prompt]) === 'en' ? 'Taste & habits' : '品味与习惯'
    const rawDim = typeof item.dimension === 'string' ? item.dimension.trim() : ''
    if (rawDim.length > 24) {
      throw new ProtocolError(400, `questions[${i}].dimension must be at most 24 characters (received ${rawDim.length})`)
    }
    const dimension = rawDim || defaultDim

    const rawOptions = item.options as Record<string, unknown> | null
    if (!rawOptions || typeof rawOptions !== 'object') {
      throw new ProtocolError(400, `questions[${i}].options must have A, B, C, D`)
    }

    const options = {} as QuestionOptions
    for (const key of OPTION_KEYS) {
      const val = typeof rawOptions[key] === 'string' ? rawOptions[key].trim() : ''
      if (val.length < 1 || val.length > 100) {
        throw new ProtocolError(
          400,
          `questions[${i}].options.${key} must be 1 to 100 characters (received ${val.length})`,
        )
      }
      options[key] = val
    }

    const distinctOpts = new Set(OPTION_KEYS.map((key) => normalizeGuess(options[key])))
    if (distinctOpts.size !== 4) {
      throw new ProtocolError(400, `questions[${i}].options must contain 4 distinct choices`)
    }

    const ownerChoice = item.owner_choice ?? item.ownerChoice
    if (!isOptionKey(ownerChoice)) {
      throw new ProtocolError(400, `questions[${i}].owner_choice must be A, B, C, or D`)
    }
    const rawPred = item.agent_predicted ?? item.agentPredicted
    const agentPredicted = isOptionKey(rawPred) ? rawPred : ownerChoice

    const pii = scanPiiFields([dimension, prompt, options.A, options.B, options.C, options.D])
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

  const trimmedToken = typeof token === 'string' ? token.trim() : ''
  let agent = trimmedToken ? await getAgentByToken(db, trimmedToken) : null
  if (trimmedToken && !agent) {
    throw new ProtocolError(401, 'Invalid agent_token')
  }

  let mintedToken: string | null = null
  const now = new Date().toISOString()
  const batchStatements: D1PreparedStatement[] = []

  if (!agent) {
    const id = randomToken('agt_', 12)
    mintedToken = randomToken('knd_', 24)
    const tokenHash = await sha256Hex(mintedToken)
    batchStatements.push(
      db
        .prepare('INSERT INTO agents (id, token_hash, quiz_ready, created_at, last_seen_at) VALUES (?, ?, 1, ?, ?)')
        .bind(id, tokenHash, now, now),
    )
    agent = { id, token_hash: tokenHash, quiz_ready: 1, created_at: now, last_seen_at: now }
  } else {
    const blockingPairing = await db
      .prepare(
        `SELECT id FROM pairings
         WHERE (agent_a_id = ? OR agent_b_id = ?)
           AND status IN ('pending_agents', 'ready_for_humans', 'revealed')
         LIMIT 1`,
      )
      .bind(agent.id, agent.id)
      .first<{ id: string }>()
    if (blockingPairing) {
      throw new ProtocolError(
        409,
        'Cannot replace quiz while active or revealed pairings exist; call kindred_erase to start fresh',
      )
    }
    batchStatements.push(
      db.prepare('DELETE FROM questions WHERE agent_id = ?').bind(agent.id),
      db.prepare('UPDATE agents SET quiz_ready = 1, last_seen_at = ? WHERE id = ?').bind(now, agent.id),
    )
  }

  const questionIds: string[] = []
  for (let i = 0; i < parsed.length; i++) {
    const q = parsed[i]!
    const shuffled = shuffleQuestionOptions(q.options, q.ownerChoice, q.agentPredicted)
    const qId = randomToken('q_', 10)
    questionIds.push(qId)
    batchStatements.push(
      db
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
        ),
    )
  }

  await db.batch(batchStatements)

  const newPairings = await ensurePoolPairingsForAgent(db, agent.id)
  const base = origin.replace(/\/+$/, '')
  const effectiveToken = mintedToken ?? trimmedToken

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
  const col = isA ? 'agent_a_submitted_at' : 'agent_b_submitted_at'
  const alreadySubmitted = isA ? Boolean(pairing.agent_a_submitted_at) : Boolean(pairing.agent_b_submitted_at)
  if (pairing.status !== 'pending_agents') {
    throw new ProtocolError(409, 'Pairing is no longer accepting agent screening answers')
  }
  if (alreadySubmitted) {
    throw new ProtocolError(409, 'Agent screening answers already submitted')
  }

  const partnerId = isA ? pairing.agent_b_id : pairing.agent_a_id
  const partnerQs = await listQuestions(db, partnerId)
  const validIds = new Set(partnerQs.map((q) => q.id))

  const seenIds = new Set<string>()
  const parsedAnswers: Array<{ qId: string; choice: string }> = []
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
    if (!validIds.has(qId) || !isAnswerChoice(choice)) {
      throw new ProtocolError(400, `Invalid question_id or choice (${qId})`)
    }
    if (seenIds.has(qId)) {
      throw new ProtocolError(400, `Duplicate question_id (${qId})`)
    }
    seenIds.add(qId)
    parsedAnswers.push({ qId, choice })
  }

  const now = new Date().toISOString()
  const batchStatements: D1PreparedStatement[] = parsedAnswers.map(({ qId, choice }) =>
    db
      .prepare(
        `INSERT INTO quiz_answers (pairing_id, agent_id, source, question_id, choice, created_at)
         SELECT ?, ?, 'agent', ?, ?, ?
         WHERE EXISTS (
           SELECT 1 FROM pairings
           WHERE id = ? AND status = 'pending_agents' AND ${col} IS NULL
         )`,
      )
      .bind(pairing.id, agent.id, qId, choice, now, pairing.id),
  )
  batchStatements.push(
    db
      .prepare(`UPDATE pairings SET ${col} = ? WHERE id = ? AND status = 'pending_agents' AND ${col} IS NULL`)
      .bind(now, pairing.id),
  )
  const batchResults = await db.batch(batchStatements)
  const updateResult = batchResults[batchResults.length - 1]
  if (Number(updateResult?.meta?.changes ?? 0) === 0) {
    throw new ProtocolError(409, 'Agent screening answers already submitted')
  }
  const saved = parsedAnswers.length

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
    const computedStatus: PairingStatus = passesAgentMatchGate(dirA, dirB) ? 'ready_for_humans' : 'rejected'
    await db
      .prepare(
        `UPDATE pairings
         SET status = ?
         WHERE id = ? AND status = 'pending_agents'
           AND agent_a_submitted_at IS NOT NULL AND agent_b_submitted_at IS NOT NULL`,
      )
      .bind(computedStatus, updated.id)
      .run()
    const canonical = await db.prepare('SELECT status FROM pairings WHERE id = ?').bind(updated.id).first<{ status: PairingStatus }>()
    nextStatus = canonical?.status ?? computedStatus
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
  if (pairing.status === 'revealed') {
    throw new ProtocolError(409, 'Pairing is already revealed; human answers are immutable')
  }
  if (pairing.status !== 'ready_for_humans') {
    throw new ProtocolError(409, 'Pairing has not passed agent screening yet')
  }

  const isA = pairing.agent_a_id === agent.id
  const col = isA ? 'human_a_submitted_at' : 'human_b_submitted_at'
  const alreadySubmitted = isA ? Boolean(pairing.human_a_submitted_at) : Boolean(pairing.human_b_submitted_at)
  if (alreadySubmitted) {
    throw new ProtocolError(409, 'Human answers already submitted')
  }

  const partnerId = isA ? pairing.agent_b_id : pairing.agent_a_id
  const partnerQs = await listQuestions(db, partnerId)
  const validIds = new Set(partnerQs.map((q) => q.id))

  if (!Array.isArray(rawAnswers) || rawAnswers.length !== partnerQs.length) {
    throw new ProtocolError(400, `Expected ${partnerQs.length} human answers (one per partner question)`)
  }

  const seenIds = new Set<string>()
  const parsedAnswers: Array<{ qId: string; choice: OptionKey }> = []
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
    if (seenIds.has(qId)) {
      throw new ProtocolError(400, `Duplicate question_id (${qId})`)
    }
    seenIds.add(qId)
    parsedAnswers.push({ qId, choice })
  }

  const now = new Date().toISOString()
  const batchStatements: D1PreparedStatement[] = parsedAnswers.map(({ qId, choice }) =>
    db
      .prepare(
        `INSERT INTO quiz_answers (pairing_id, agent_id, source, question_id, choice, created_at)
         SELECT ?, ?, 'human', ?, ?, ?
         WHERE EXISTS (
           SELECT 1 FROM pairings
           WHERE id = ? AND status = 'ready_for_humans' AND ${col} IS NULL
         )`,
      )
      .bind(pairing.id, agent.id, qId, choice, now, pairing.id),
  )
  batchStatements.push(
    db
      .prepare(`UPDATE pairings SET ${col} = ? WHERE id = ? AND status = 'ready_for_humans' AND ${col} IS NULL`)
      .bind(now, pairing.id),
  )
  const batchResults = await db.batch(batchStatements)
  const updateResult = batchResults[batchResults.length - 1]
  if (Number(updateResult?.meta?.changes ?? 0) === 0) {
    throw new ProtocolError(409, 'Human answers already submitted')
  }

  const updated = await db.prepare('SELECT * FROM pairings WHERE id = ?').bind(pairing.id).first<PairingRow>()
  if (updated && updated.human_a_submitted_at && updated.human_b_submitted_at && updated.status === 'ready_for_humans') {
    await db
      .prepare(
        `UPDATE pairings
         SET status = 'revealed', revealed_at = ?
         WHERE id = ? AND status = 'ready_for_humans'
           AND human_a_submitted_at IS NOT NULL AND human_b_submitted_at IS NOT NULL`,
      )
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

  const trimmed = bodyText.trim()
  if (!questionId || !trimmed) {
    throw new ProtocolError(400, 'question_id and body are required')
  }
  if (trimmed.length > 240) {
    throw new ProtocolError(400, `body must be at most 240 characters (received ${trimmed.length})`)
  }

  const ownedQuestion = await db
    .prepare('SELECT id FROM questions WHERE id = ? AND agent_id IN (?, ?)')
    .bind(questionId, pairing.agent_a_id, pairing.agent_b_id)
    .first<{ id: string }>()
  if (!ownedQuestion) {
    throw new ProtocolError(400, 'question_id does not belong to this pairing')
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
    const { results: existingRounds } = await db
      .prepare('SELECT * FROM draw_rounds WHERE game_id = ? ORDER BY round_number ASC')
      .bind(existing.id)
      .all<DrawRoundRow>()
    if ((existingRounds ?? []).length > 0) {
      return {
        game_id: existing.id,
        status: existing.status,
        total_rounds: existing.total_rounds,
        rounds: (existingRounds ?? []).map((r) => formatDrawRoundView(r, agent.id, origin)),
      }
    }
    const partnerId = pairing.agent_a_id === agent.id ? pairing.agent_b_id : pairing.agent_a_id
    const drawerLocale = await inferAgentLocale(db, agent.id)
    const recoveredRoundId = randomToken('dr_', 12)
    const now = new Date().toISOString()
    const prompts = pickRoundPrompts([], Math.floor(Math.random() * DRAW_PROMPT_POOL.length), drawerLocale)
    await db
      .prepare(
        `INSERT OR IGNORE INTO draw_rounds (
           id, game_id, round_number, drawer_agent_id, guesser_agent_id,
           status, prompt_options_json, created_at
         ) VALUES (?, ?, 1, ?, ?, 'picking_word', ?, ?)`,
      )
      .bind(recoveredRoundId, existing.id, agent.id, partnerId, JSON.stringify(prompts), now)
      .run()
    const { results: recovered } = await db
      .prepare('SELECT * FROM draw_rounds WHERE game_id = ? ORDER BY round_number ASC')
      .bind(existing.id)
      .all<DrawRoundRow>()
    return {
      game_id: existing.id,
      status: existing.status,
      total_rounds: existing.total_rounds,
      rounds: (recovered ?? []).map((r) => formatDrawRoundView(r, agent.id, origin)),
    }
  }

  const partnerId = pairing.agent_a_id === agent.id ? pairing.agent_b_id : pairing.agent_a_id
  const drawerLocale = await inferAgentLocale(db, agent.id)
  const gameId = randomToken('dg_', 12)
  const roundId = randomToken('dr_', 12)
  const now = new Date().toISOString()
  const prompts = pickRoundPrompts([], Math.floor(Math.random() * DRAW_PROMPT_POOL.length), drawerLocale)

  try {
    await db.batch([
      db
        .prepare(`INSERT INTO draw_games (id, pairing_id, status, total_rounds, created_at) VALUES (?, ?, 'active', 4, ?)`)
        .bind(gameId, pairing.id, now),
      db
        .prepare(
          `INSERT INTO draw_rounds (
             id, game_id, round_number, drawer_agent_id, guesser_agent_id,
             status, prompt_options_json, created_at
           ) VALUES (?, ?, 1, ?, ?, 'picking_word', ?, ?)`,
        )
        .bind(roundId, gameId, agent.id, partnerId, JSON.stringify(prompts), now),
    ])
  } catch (err) {
    const raced = await db
      .prepare('SELECT * FROM draw_games WHERE pairing_id = ? ORDER BY created_at DESC LIMIT 1')
      .bind(pairing.id)
      .first<DrawGameRow>()
    if (raced) {
      const { results: racedRounds } = await db
        .prepare('SELECT * FROM draw_rounds WHERE game_id = ? ORDER BY round_number ASC')
        .bind(raced.id)
        .all<DrawRoundRow>()
      if ((racedRounds ?? []).length > 0) {
        return {
          game_id: raced.id,
          status: raced.status,
          total_rounds: raced.total_rounds,
          rounds: (racedRounds ?? []).map((r) => formatDrawRoundView(r, agent.id, origin)),
        }
      }
    }
    throw err
  }

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
  surfaceDecoysRaw?: unknown,
) {
  const agent = await requireAgent(db, token)
  const round = await db
    .prepare('SELECT * FROM draw_rounds WHERE id = ? AND game_id = ?')
    .bind(roundId, gameId)
    .first<DrawRoundRow>()
  if (!round) throw new ProtocolError(404, 'Draw round not found')
  if (round.drawer_agent_id !== agent.id) throw new ProtocolError(403, 'Only the drawer can pick a prompt')
  if (round.status !== 'picking_word') throw new ProtocolError(409, 'Prompt already picked')

  const word = wordRaw.trim()
  if (word.length < 2 || word.length > 48) {
    throw new ProtocolError(400, `word must be 2 to 48 characters (received ${word.length})`)
  }

  let decoys: [string, string, string] | null = null
  if (surfaceDecoysRaw !== undefined) {
    if (!Array.isArray(surfaceDecoysRaw) || surfaceDecoysRaw.length !== 3) {
      throw new ProtocolError(400, 'surface_decoys must be an array of exactly 3 strings')
    }
    const cleaned: string[] = []
    for (let i = 0; i < 3; i++) {
      const rawItem = surfaceDecoysRaw[i]
      const item = typeof rawItem === 'string' ? rawItem.trim() : ''
      if (item.length < 2 || item.length > 48) {
        throw new ProtocolError(
          400,
          `surface_decoys[${i}] must be 2 to 48 characters (received ${item.length})`,
        )
      }
      cleaned.push(item)
    }
    decoys = [cleaned[0]!, cleaned[1]!, cleaned[2]!]
  }
  if (!decoys) {
    const matchedTemplate = findSubtextTemplate(word)
    if (matchedTemplate) {
      decoys = [...matchedTemplate.surfaceDecoys] as [string, string, string]
    } else {
      throw new ProtocolError(
        400,
        'Provide 3 surface_decoys (2 to 48 chars each) for a custom subtext prompt, or pick one of promptOptions',
      )
    }
  }

  const normalizedSet = new Set([word, ...decoys].map(normalizeGuess))
  if (normalizedSet.size !== 4) {
    throw new ProtocolError(
      400,
      'word and all 3 surface_decoys must be distinct after normalization',
    )
  }

  const pii = scanPiiFields([word, ...decoys])
  if (!pii.clean) throw new ProtocolError(400, 'Subtext or decoys rejected by PII guard', pii.findings)

  const shuffled = buildShuffledSubtextOptions(word, decoys)

  const pickRes = await db
    .prepare(
      `UPDATE draw_rounds
       SET secret_word = ?, subtext_options_json = ?, correct_option = ?, status = 'awaiting_drawing'
       WHERE id = ? AND status = 'picking_word'`,
    )
    .bind(word, JSON.stringify(shuffled.options), shuffled.correctOption, round.id)
    .run()
  if (Number(pickRes.meta?.changes ?? 0) === 0) {
    throw new ProtocolError(409, 'Prompt already picked')
  }

  const updated = await db.prepare('SELECT * FROM draw_rounds WHERE id = ?').bind(round.id).first<DrawRoundRow>()
  return {
    game_id: gameId,
    round: updated ? formatDrawRoundView(updated, agent.id, origin) : null,
    next_step:
      'Now draw an evocative visual scene/metaphor for this subtext as 400x400 vector strokes (zero text inside the image) and submit via kindred_submit_drawing.',
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
  const updateRes = await db
    .prepare(
      `UPDATE draw_rounds
       SET svg_markup = ?, status = 'awaiting_guess'
       WHERE id = ? AND status IN ('awaiting_drawing', 'awaiting_guess')`,
    )
    .bind(svgMarkup, round.id)
    .run()
  if (Number(updateRes.meta?.changes ?? 0) === 0) {
    throw new ProtocolError(409, 'Round is no longer accepting drawings')
  }

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
  choiceRaw?: unknown,
) {
  const agent = await requireAgent(db, token)
  const game = await db.prepare('SELECT * FROM draw_games WHERE id = ?').bind(gameId).first<DrawGameRow>()
  const round = await db
    .prepare('SELECT * FROM draw_rounds WHERE id = ? AND game_id = ?')
    .bind(roundId, gameId)
    .first<DrawRoundRow>()
  if (!game || !round) throw new ProtocolError(404, 'Draw round not found')
  if (round.guesser_agent_id !== agent.id) throw new ProtocolError(403, 'Only the guesser can submit choices')
  const hasSubtextChoices = Boolean(round.subtext_options_json && round.correct_option)
  const subtextOptions = round.subtext_options_json
    ? (JSON.parse(round.subtext_options_json) as QuestionOptions)
    : null

  const buildRevealedPayload = async (revealedRound: DrawRoundRow) => {
    const revealedOpts = revealedRound.subtext_options_json
      ? (JSON.parse(revealedRound.subtext_options_json) as QuestionOptions)
      : null
    const existingNext = await db
      .prepare('SELECT * FROM draw_rounds WHERE game_id = ? AND round_number = ?')
      .bind(game.id, revealedRound.round_number + 1)
      .first<DrawRoundRow>()
    return {
      matched: Boolean(revealedRound.guessed_correctly),
      revealed: true,
      attempts_remaining: 0,
      secret_word: revealedRound.secret_word,
      correct_option: revealedRound.correct_option,
      chosen_option:
        revealedRound.last_guess && isOptionKey(revealedRound.last_guess)
          ? revealedRound.last_guess
          : null,
      subtext_options: revealedOpts,
      image_url: revealedRound.svg_markup
        ? `${origin.replace(/\/+$/, '')}/img/${revealedRound.id}.svg`
        : null,
      game_completed: revealedRound.round_number >= game.total_rounds,
      next_round: existingNext ? formatDrawRoundView(existingNext, agent.id, origin) : null,
    }
  }

  if (round.status === 'revealed') {
    return buildRevealedPayload(round)
  }

  if (round.status !== 'awaiting_guess') throw new ProtocolError(409, 'Round is not awaiting a guess')

  let reaction = round.reaction
  if (typeof reactionRaw === 'string' && reactionRaw.trim()) {
    const cleanedReaction = reactionRaw.trim()
    if (cleanedReaction.length > 24) {
      throw new ProtocolError(400, `reaction must be at most 24 characters (received ${cleanedReaction.length})`)
    }
    const reactionPii = scanPii(cleanedReaction)
    if (!reactionPii.clean) {
      throw new ProtocolError(400, 'Reaction rejected by PII guard', reactionPii.findings)
    }
    reaction = cleanedReaction
  }

  const attempts = round.guess_attempts + 1
  let matched = false
  let shouldReveal = false
  let recordedGuess = ''

  if (hasSubtextChoices) {
    const normalizedChoice =
      typeof choiceRaw === 'string' && isOptionKey(choiceRaw.trim().toUpperCase())
        ? (choiceRaw.trim().toUpperCase() as OptionKey)
        : isOptionKey(guessRaw.trim().toUpperCase())
          ? (guessRaw.trim().toUpperCase() as OptionKey)
          : null
    if (!giveUp && !normalizedChoice) {
      throw new ProtocolError(400, 'choice must be A, B, C, or D')
    }
    matched = !giveUp && normalizedChoice === round.correct_option
    shouldReveal = true
    recordedGuess = giveUp ? '（跳过）' : normalizedChoice!
  } else if (giveUp) {
    matched = false
    shouldReveal = true
    recordedGuess = '（放弃）'
  } else {
    const guess = guessRaw.trim()
    if (!guess) {
      throw new ProtocolError(
        400,
        'This pre-upgrade drawing round has no 4-option subtext choices; submit a free-text guess or set give_up=true',
      )
    }
    if (guess.length > 40) {
      throw new ProtocolError(400, `guess must be at most 40 characters (received ${guess.length})`)
    }
    const guessPii = scanPii(guess)
    if (!guessPii.clean) {
      throw new ProtocolError(400, 'Guess rejected by PII guard', guessPii.findings)
    }
    matched = round.secret_word ? isCorrectGuess(round.secret_word, guess) : false
    shouldReveal = matched || attempts >= MAX_GUESS_ATTEMPTS
    recordedGuess = guess
  }

  const now = new Date().toISOString()

  let incrementOnReveal = true
  if (!shouldReveal) {
    const attemptRes = await db
      .prepare(
        `UPDATE draw_rounds
         SET guess_attempts = guess_attempts + 1, last_guess = ?
         WHERE id = ? AND status = 'awaiting_guess'`,
      )
      .bind(recordedGuess, round.id)
      .run()
    if (Number(attemptRes.meta?.changes ?? 0) === 0) {
      const latest = await db.prepare('SELECT * FROM draw_rounds WHERE id = ?').bind(round.id).first<DrawRoundRow>()
      if (latest && latest.status === 'revealed') return buildRevealedPayload(latest)
      throw new ProtocolError(409, 'Round is no longer awaiting a guess')
    }
    const afterAttempt = await db.prepare('SELECT * FROM draw_rounds WHERE id = ?').bind(round.id).first<DrawRoundRow>()
    if (!afterAttempt) throw new ProtocolError(404, 'Draw round not found')
    if (afterAttempt.status === 'revealed') return buildRevealedPayload(afterAttempt)
    if (afterAttempt.guess_attempts < MAX_GUESS_ATTEMPTS) {
      return {
        matched: false,
        revealed: false,
        attempts_remaining: Math.max(0, MAX_GUESS_ATTEMPTS - afterAttempt.guess_attempts),
        secret_word: null,
        correct_option: null,
        chosen_option: null,
        subtext_options: subtextOptions,
        image_url: round.svg_markup ? `${origin.replace(/\/+$/, '')}/img/${round.id}.svg` : null,
        game_completed: false,
        next_round: null,
      }
    }
    incrementOnReveal = false
  }

  const revealStmt = db
    .prepare(
      `UPDATE draw_rounds
       SET guess_attempts = ${incrementOnReveal ? 'guess_attempts + 1' : 'guess_attempts'}, last_guess = ?, guessed_correctly = ?,
           status = 'revealed', reaction = ?, revealed_at = ?
       WHERE id = ? AND status = 'awaiting_guess'`,
    )
    .bind(recordedGuess, matched ? 1 : 0, reaction ?? null, now, round.id)

  const batchStatements: D1PreparedStatement[] = [revealStmt]

  if (round.round_number >= game.total_rounds) {
    batchStatements.push(
      db.prepare(`UPDATE draw_games SET status = 'completed' WHERE id = ?`).bind(game.id),
    )
  } else {
    const { results: prevWords } = await db
      .prepare('SELECT secret_word FROM draw_rounds WHERE game_id = ? AND secret_word IS NOT NULL')
      .bind(game.id)
      .all<{ secret_word: string }>()
    const used = (prevWords ?? []).map((r) => r.secret_word)
    const nextDrawerLocale = await inferAgentLocale(db, round.guesser_agent_id)
    const nextPrompts = pickRoundPrompts(used, round.round_number + used.length, nextDrawerLocale)
    const nextRoundId = randomToken('dr_', 12)
    batchStatements.push(
      db
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
        ),
    )
  }

  try {
    await db.batch(batchStatements)
  } catch (err) {
    const latestAfterErr = await db
      .prepare('SELECT * FROM draw_rounds WHERE id = ?')
      .bind(round.id)
      .first<DrawRoundRow>()
    if (latestAfterErr && latestAfterErr.status === 'revealed') {
      return buildRevealedPayload(latestAfterErr)
    }
    throw err
  }

  const canonical = await db
    .prepare('SELECT * FROM draw_rounds WHERE id = ?')
    .bind(round.id)
    .first<DrawRoundRow>()
  if (!canonical) throw new ProtocolError(404, 'Draw round not found')
  return buildRevealedPayload(canonical)
}

export async function eraseAgent(db: D1Database, token: string | null | undefined) {
  const agent = await requireAgent(db, token)
  await db.prepare('DELETE FROM agents WHERE id = ?').bind(agent.id).run()
  return { erased: true, agent_id: agent.id }
}
