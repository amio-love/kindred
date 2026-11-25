import { Hono } from 'hono'
import type { Env } from '../env'
import { randomShareCode, randomToken, sha256Hex } from '../env'
import {
  ensurePoolPairingsForUser,
  getUserByApiKey,
  getUserById,
  listAnswers,
  listQuestions,
  type PairingRow,
} from '../db'
import { scanPii } from '../../shared/pii'
import { evaluateDirection, passesPoolGate, shuffleQuestionOptions } from '../../shared/quiz'
import { CANVAS_SIZE, validateStrokes } from '../../shared/drawing'
import type {
  AgentHost,
  AnswerChoice,
  ConfidenceLevel,
  OptionKey,
  OptionMap,
  PairingStatus,
} from '../../shared/types'

const VALID_HOSTS = new Set<AgentHost>(['muse', 'chatgpt', 'grok', 'openclaw', 'other'])
const VALID_OPTIONS = new Set<OptionKey>(['A', 'B', 'C', 'D'])
const VALID_ANSWERS = new Set<AnswerChoice>(['A', 'B', 'C', 'D', 'U'])
const VALID_CONF = new Set<ConfidenceLevel>(['high', 'medium', 'low'])

export function createAgentRouter() {
  const app = new Hono<{ Bindings: Env }>()

  app.post('/register', async (c) => {
    const body = await c.req.json<Record<string, unknown>>().catch(() => null)
    if (!body) return c.json({ error: 'Invalid JSON body' }, 400)

    const handle = typeof body.handle === 'string' ? body.handle.trim().slice(0, 24) : ''
    const agentName = typeof body.agent_name === 'string' ? body.agent_name.trim().slice(0, 32) : 'Personal Agent'
    const rawHost = typeof body.agent_host === 'string' ? body.agent_host.trim().toLowerCase() : 'other'
    const agentHost: AgentHost = VALID_HOSTS.has(rawHost as AgentHost) ? (rawHost as AgentHost) : 'other'

    if (!handle) {
      return c.json({ error: 'handle is required (1-24 characters)' }, 400)
    }
    const pii = scanPii(`${handle} ${agentName}`)
    if (!pii.clean) {
      return c.json({ error: 'handle or agent_name contains PII', findings: pii.findings }, 400)
    }

    const userId = randomToken('usr_', 12)
    const apiKey = randomToken('knd_', 24)
    const claimToken = randomToken('clm_', 20)
    const shareCode = randomShareCode()
    const [apiKeyHash, claimTokenHash] = await Promise.all([
      sha256Hex(apiKey),
      sha256Hex(claimToken),
    ])
    const now = new Date().toISOString()

    await c.env.DB.prepare(
      `INSERT INTO users (
         id, handle, agent_name, agent_host, api_key_hash,
         claim_token_hash, pool_opted_in, share_code, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    )
      .bind(userId, handle, agentName, agentHost, apiKeyHash, claimTokenHash, shareCode, now)
      .run()

    const origin = new URL(c.req.url).origin
    return c.json(
      {
        user_id: userId,
        handle,
        api_key: apiKey,
        claim_url: `${origin}/claim/${claimToken}`,
        share_url: `${origin}/q/${shareCode}`,
      },
      201,
    )
  })

  app.post('/quiz', async (c) => {
    const auth = c.req.header('Authorization')
    const token = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : ''
    if (!token) return c.json({ error: 'Missing Bearer API key' }, 401)

    const user = await getUserByApiKey(c.env.DB, token)
    if (!user) return c.json({ error: 'Invalid API key' }, 401)

    const body = await c.req.json<Record<string, unknown>>().catch(() => null)
    const rawQuestions = body?.questions
    if (!Array.isArray(rawQuestions) || rawQuestions.length < 3 || rawQuestions.length > 10) {
      return c.json({ error: 'questions must be an array of 3 to 10 items (recommended 6-10)' }, 400)
    }

    const validated: Array<{
      dimension: string
      prompt: string
      options: OptionMap
      ownerChoice: OptionKey
      agentPredicted: OptionKey | null
      confidence: ConfidenceLevel
      memoryBasis: string | null
      starred: boolean
    }> = []

    for (let i = 0; i < rawQuestions.length; i++) {
      const item = rawQuestions[i] as Record<string, unknown>
      const dimension = typeof item?.dimension === 'string' && item.dimension.trim()
        ? item.dimension.trim().slice(0, 20)
        : '综合'
      const prompt = typeof item?.prompt === 'string' ? item.prompt.trim().slice(0, 200) : ''
      const opts = item?.options as Record<string, unknown> | undefined
      const rawChoice = typeof item?.owner_choice === 'string' ? item.owner_choice.trim().toUpperCase() : ''
      const rawConf = typeof item?.confidence === 'string' ? item.confidence.trim().toLowerCase() : 'medium'
      const memoryBasis = typeof item?.memory_basis === 'string' ? item.memory_basis.trim().slice(0, 200) : null

      if (!prompt || !opts) {
        return c.json({ error: `questions[${i}] missing prompt or options` }, 400)
      }
      const optionMap: OptionMap = {
        A: typeof opts.A === 'string' ? opts.A.trim().slice(0, 120) : '',
        B: typeof opts.B === 'string' ? opts.B.trim().slice(0, 120) : '',
        C: typeof opts.C === 'string' ? opts.C.trim().slice(0, 120) : '',
        D: typeof opts.D === 'string' ? opts.D.trim().slice(0, 120) : '',
      }
      if (!optionMap.A || !optionMap.B || !optionMap.C || !optionMap.D) {
        return c.json({ error: `questions[${i}] requires non-empty options A, B, C, D` }, 400)
      }
      if (!VALID_OPTIONS.has(rawChoice as OptionKey)) {
        return c.json({ error: `questions[${i}].owner_choice must be A, B, C, or D` }, 400)
      }

      const publicText = `${prompt} ${optionMap.A} ${optionMap.B} ${optionMap.C} ${optionMap.D}`
      const pii = scanPii(publicText)
      if (!pii.clean) {
        return c.json(
          {
            error: `questions[${i}] rejected by PII guard: remove emails, phones, URLs, IDs, or social handles`,
            findings: pii.findings,
          },
          400,
        )
      }

      const shuffled = shuffleQuestionOptions(
        optionMap,
        rawChoice as OptionKey,
        rawChoice as OptionKey,
      )

      validated.push({
        dimension,
        prompt,
        options: shuffled.options,
        ownerChoice: shuffled.ownerChoice,
        agentPredicted: shuffled.agentPredicted,
        confidence: VALID_CONF.has(rawConf as ConfidenceLevel) ? (rawConf as ConfidenceLevel) : 'medium',
        memoryBasis,
        starred: item?.starred === true,
      })
    }

    await c.env.DB.prepare('DELETE FROM questions WHERE owner_id = ? AND approved = 0')
      .bind(user.id)
      .run()

    const now = new Date().toISOString()
    const insertedIds: string[] = []
    for (let i = 0; i < validated.length; i++) {
      const q = validated[i]!
      const qId = randomToken('q_', 10)
      insertedIds.push(qId)
      await c.env.DB.prepare(
        `INSERT INTO questions (
           id, owner_id, position, dimension, prompt, options_json,
           owner_choice, agent_predicted, confidence, memory_basis, starred, approved, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      )
        .bind(
          qId,
          user.id,
          i + 1,
          q.dimension,
          q.prompt,
          JSON.stringify(q.options),
          q.ownerChoice,
          q.agentPredicted,
          q.confidence,
          q.memoryBasis,
          q.starred ? 1 : 0,
          now,
        )
        .run()
    }

    return c.json({
      submitted_count: insertedIds.length,
      question_ids: insertedIds,
      shuffled: true,
      awaiting_owner_approval: true,
    })
  })

  app.get('/pending', async (c) => {
    const auth = c.req.header('Authorization')
    const token = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : ''
    if (!token) return c.json({ error: 'Missing Bearer API key' }, 401)

    const user = await getUserByApiKey(c.env.DB, token)
    if (!user) return c.json({ error: 'Invalid API key' }, 401)

    await ensurePoolPairingsForUser(c.env.DB, user.id)

    const { results: pairings } = await c.env.DB.prepare(
      `SELECT * FROM pairings
       WHERE status IN ('pending_agents', 'ready_for_humans')
         AND (user_a_id = ? OR user_b_id = ?)
       ORDER BY created_at ASC`,
    )
      .bind(user.id, user.id)
      .all<PairingRow>()

    const pendingQuizzes = []
    for (const pairing of pairings) {
      const partnerId = pairing.user_a_id === user.id ? pairing.user_b_id : pairing.user_a_id
      const existing = await listAnswers(c.env.DB, pairing.id, user.id, 'agent')
      if (existing.length > 0) continue

      const [partner, partnerQuestions] = await Promise.all([
        getUserById(c.env.DB, partnerId),
        listQuestions(c.env.DB, partnerId, true),
      ])
      if (!partner || partnerQuestions.length === 0) continue

      pendingQuizzes.push({
        pairing_id: pairing.id,
        kind: pairing.kind,
        partner_handle: partner.handle,
        questions: partnerQuestions.map((q) => ({
          id: q.id,
          position: q.position,
          dimension: q.dimension,
          prompt: q.prompt,
          options: q.options,
        })),
      })
    }

    const { results: pendingDrawRows } = await c.env.DB.prepare(
      `SELECT r.id, r.game_id, r.round_number, r.secret_word, r.drawing_brief, u.handle AS guesser_handle
       FROM draw_rounds r
       JOIN users u ON u.id = r.guesser_id
       WHERE r.drawer_id = ? AND r.status = 'awaiting_agent_draw'
       ORDER BY r.created_at ASC`,
    )
      .bind(user.id)
      .all<{
        id: string
        game_id: string
        round_number: number
        secret_word: string
        drawing_brief: string | null
        guesser_handle: string
      }>()

    return c.json({
      pending_quizzes: pendingQuizzes,
      pending_drawings: pendingDrawRows.map((row) => ({
        round_id: row.id,
        game_id: row.game_id,
        round_number: row.round_number,
        guesser_handle: row.guesser_handle,
        secret_word: row.secret_word,
        drawing_brief: row.drawing_brief,
        canvas_size: CANVAS_SIZE,
      })),
    })
  })

  app.post('/answers', async (c) => {
    const auth = c.req.header('Authorization')
    const token = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : ''
    if (!token) return c.json({ error: 'Missing Bearer API key' }, 401)

    const user = await getUserByApiKey(c.env.DB, token)
    if (!user) return c.json({ error: 'Invalid API key' }, 401)

    const body = await c.req.json<Record<string, unknown>>().catch(() => null)
    const pairingId = typeof body?.pairing_id === 'string' ? body.pairing_id.trim() : ''
    const rawAnswers = body?.answers
    if (!pairingId || !Array.isArray(rawAnswers) || rawAnswers.length === 0) {
      return c.json({ error: 'pairing_id and non-empty answers array are required' }, 400)
    }

    const pairing = await c.env.DB.prepare('SELECT * FROM pairings WHERE id = ?')
      .bind(pairingId)
      .first<PairingRow>()
    if (!pairing) return c.json({ error: 'Pairing not found' }, 404)
    if (pairing.user_a_id !== user.id && pairing.user_b_id !== user.id) {
      return c.json({ error: 'Not a participant in this pairing' }, 403)
    }

    const partnerId = pairing.user_a_id === user.id ? pairing.user_b_id : pairing.user_a_id
    const partnerQuestions = await listQuestions(c.env.DB, partnerId, true)
    const validQuestionIds = new Set(partnerQuestions.map((q) => q.id))

    const now = new Date().toISOString()
    let saved = 0
    for (const item of rawAnswers) {
      const rec = item as Record<string, unknown>
      const questionId = typeof rec?.question_id === 'string' ? rec.question_id.trim() : ''
      const rawChoice = typeof rec?.choice === 'string' ? rec.choice.trim().toUpperCase() : ''
      const reason = typeof rec?.reason === 'string' ? rec.reason.trim().slice(0, 160) : null
      if (!validQuestionIds.has(questionId) || !VALID_ANSWERS.has(rawChoice as AnswerChoice)) {
        continue
      }
      const answerId = randomToken('ans_', 10)
      await c.env.DB.prepare(
        `INSERT INTO quiz_answers (
           id, pairing_id, respondent_id, quiz_owner_id, actor_type, question_id, choice, reason, created_at
         ) VALUES (?, ?, ?, ?, 'agent', ?, ?, ?, ?)
         ON CONFLICT(pairing_id, respondent_id, actor_type, question_id)
         DO UPDATE SET choice = excluded.choice, reason = excluded.reason`,
      )
        .bind(answerId, pairing.id, user.id, partnerId, questionId, rawChoice, reason, now)
        .run()
      saved++
    }

    const [questionsA, questionsB, agentAOnB, agentBOnA] = await Promise.all([
      listQuestions(c.env.DB, pairing.user_a_id, true),
      listQuestions(c.env.DB, pairing.user_b_id, true),
      listAnswers(c.env.DB, pairing.id, pairing.user_a_id, 'agent'),
      listAnswers(c.env.DB, pairing.id, pairing.user_b_id, 'agent'),
    ])

    const metricsAOnB = evaluateDirection(questionsB, agentAOnB)
    const metricsBOnA = evaluateDirection(questionsA, agentBOnA)

    let nextStatus: PairingStatus = pairing.status
    if (pairing.kind === 'pool' && pairing.status === 'pending_agents') {
      const bothAnswered = agentAOnB.length > 0 && agentBOnA.length > 0
      if (bothAnswered) {
        nextStatus = passesPoolGate(metricsAOnB, metricsBOnA) ? 'ready_for_humans' : 'archived'
      }
    }

    await c.env.DB.prepare(
      `UPDATE pairings
       SET agent_hit_a_on_b = ?, agent_cov_a_on_b = ?,
           agent_hit_b_on_a = ?, agent_cov_b_on_a = ?,
           status = ?
       WHERE id = ?`,
    )
      .bind(
        agentAOnB.length > 0 ? metricsAOnB.hitRate : null,
        agentAOnB.length > 0 ? metricsAOnB.coverage : null,
        agentBOnA.length > 0 ? metricsBOnA.hitRate : null,
        agentBOnA.length > 0 ? metricsBOnA.coverage : null,
        nextStatus,
        pairing.id,
      )
      .run()

    return c.json({
      saved,
      pairing_status: nextStatus,
    })
  })

  app.post('/draw', async (c) => {
    const auth = c.req.header('Authorization')
    const token = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : ''
    if (!token) return c.json({ error: 'Missing Bearer API key' }, 401)

    const user = await getUserByApiKey(c.env.DB, token)
    if (!user) return c.json({ error: 'Invalid API key' }, 401)

    const body = await c.req.json<Record<string, unknown>>().catch(() => null)
    const roundId = typeof body?.round_id === 'string' ? body.round_id.trim() : ''
    if (!roundId) return c.json({ error: 'round_id is required' }, 400)

    const round = await c.env.DB.prepare('SELECT * FROM draw_rounds WHERE id = ?')
      .bind(roundId)
      .first<{ id: string; drawer_id: string; status: string }>()
    if (!round) return c.json({ error: 'Draw round not found' }, 404)
    if (round.drawer_id !== user.id) return c.json({ error: 'Not the drawer for this round' }, 403)
    if (round.status !== 'awaiting_agent_draw') {
      return c.json({ error: `Round is not awaiting agent drawing (status: ${round.status})` }, 409)
    }

    const parsed = validateStrokes(body?.strokes)
    if (!parsed.ok) return c.json({ error: parsed.error }, 400)

    await c.env.DB.prepare(
      `UPDATE draw_rounds
       SET strokes_json = ?, drawn_by = 'agent', drawer_approved = 0, status = 'awaiting_drawer_approve'
       WHERE id = ?`,
    )
      .bind(JSON.stringify(parsed.strokes), round.id)
      .run()

    return c.json({
      round_id: round.id,
      stroke_count: parsed.strokes.length,
      status: 'awaiting_drawer_approve',
    })
  })

  app.get('/status', async (c) => {
    const auth = c.req.header('Authorization')
    const token = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : ''
    if (!token) return c.json({ error: 'Missing Bearer API key' }, 401)

    const user = await getUserByApiKey(c.env.DB, token)
    if (!user) return c.json({ error: 'Invalid API key' }, 401)

    const [drafts, approved, pairings] = await Promise.all([
      c.env.DB.prepare('SELECT COUNT(*) AS count FROM questions WHERE owner_id = ? AND approved = 0')
        .bind(user.id)
        .first<{ count: number }>(),
      c.env.DB.prepare('SELECT COUNT(*) AS count FROM questions WHERE owner_id = ? AND approved = 1')
        .bind(user.id)
        .first<{ count: number }>(),
      c.env.DB.prepare(
        'SELECT status, COUNT(*) AS count FROM pairings WHERE user_a_id = ? OR user_b_id = ? GROUP BY status',
      )
        .bind(user.id, user.id)
        .all<{ status: string; count: number }>(),
    ])

    const origin = new URL(c.req.url).origin
    return c.json({
      user_id: user.id,
      handle: user.handle,
      claimed: Boolean(user.claimed_at),
      pool_opted_in: user.pool_opted_in === 1,
      share_url: `${origin}/q/${user.share_code}`,
      draft_questions: drafts?.count ?? 0,
      approved_questions: approved?.count ?? 0,
      pairings: Object.fromEntries(pairings.results.map((r) => [r.status, r.count])),
    })
  })

  return app
}
