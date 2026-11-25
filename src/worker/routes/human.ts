import { Hono } from 'hono'
import type { Env } from '../env'
import {
  buildClearSessionCookie,
  buildSessionCookie,
  parseSessionCookie,
  randomShareCode,
  randomToken,
  sha256Hex,
} from '../env'
import {
  createNextDrawRound,
  ensurePoolPairingsForUser,
  getUserByClaimToken,
  getUserById,
  getUserBySession,
  getUserByShareCode,
  listAnchorNotes,
  listAnswers,
  listQuestions,
  loadDrawGameView,
  type PairingRow,
  type UserRow,
} from '../db'
import { scanPii } from '../../shared/pii'
import {
  buildAgentSyncReport,
  buildRevealItems,
  evaluateDirection,
  shuffleQuestionOptions,
} from '../../shared/quiz'
import { isCorrectGuess, MAX_GUESS_ATTEMPTS, validateStrokes } from '../../shared/drawing'
import { buildDemoAgentStrokes, DEMO_PARTNER_QUESTIONS, DEMO_SELF_QUESTIONS } from '../demo'
import type { OptionKey, OptionMap } from '../../shared/types'

const VALID_OPTIONS = new Set<OptionKey>(['A', 'B', 'C', 'D'])

async function requireSessionUser(db: D1Database, cookieHeader: string | undefined): Promise<UserRow | null> {
  const token = parseSessionCookie(cookieHeader)
  if (!token) return null
  return getUserBySession(db, token)
}

export function createHumanRouter() {
  const app = new Hono<{ Bindings: Env }>()

  app.post('/claim', async (c) => {
    const body = await c.req.json<Record<string, unknown>>().catch(() => null)
    const claimToken = typeof body?.claim_token === 'string' ? body.claim_token.trim() : ''
    if (!claimToken) return c.json({ error: 'claim_token is required' }, 400)

    const user = await getUserByClaimToken(c.env.DB, claimToken)
    if (!user) return c.json({ error: 'Claim link not found or already used' }, 404)

    const sessionToken = randomToken('ses_', 24)
    const sessionHash = await sha256Hex(sessionToken)
    const now = new Date().toISOString()

    await c.env.DB.prepare(
      `UPDATE users
       SET owner_session_hash = ?, claimed_at = COALESCE(claimed_at, ?), claim_token_hash = NULL
       WHERE id = ?`,
    )
      .bind(sessionHash, now, user.id)
      .run()

    c.header('Set-Cookie', buildSessionCookie(sessionToken, c.req.url))
    return c.json({ ok: true, user_id: user.id, handle: user.handle })
  })

  app.post('/demo/bootstrap', async (c) => {
    const body = await c.req.json<Record<string, unknown>>().catch((): Record<string, unknown> => ({}))
    const handle = typeof body?.handle === 'string' && body.handle.trim()
      ? body.handle.trim().slice(0, 20)
      : '夜行探索者'

    const now = new Date().toISOString()
    const selfId = randomToken('usr_', 12)
    const partnerId = randomToken('usr_', 12)
    const selfSession = randomToken('ses_', 24)
    const selfApiKey = randomToken('knd_', 24)
    const partnerApiKey = randomToken('knd_', 24)
    const [selfSessionHash, selfApiHash, partnerApiHash] = await Promise.all([
      sha256Hex(selfSession),
      sha256Hex(selfApiKey),
      sha256Hex(partnerApiKey),
    ])

    const selfShare = randomShareCode()
    const partnerShare = randomShareCode()

    await c.env.DB.prepare(
      `INSERT INTO users (
         id, handle, agent_name, agent_host, api_key_hash,
         owner_session_hash, claimed_at, pool_opted_in, share_code, created_at
       ) VALUES (?, ?, 'Flow（演练）', 'muse', ?, ?, ?, 1, ?, ?)`,
    )
      .bind(selfId, handle, selfApiHash, selfSessionHash, now, selfShare, now)
      .run()

    await c.env.DB.prepare(
      `INSERT INTO users (
         id, handle, agent_name, agent_host, api_key_hash,
         claimed_at, pool_opted_in, share_code, created_at
       ) VALUES (?, '凌晨便利店（演练）', 'Dots（演练）', 'chatgpt', ?, ?, 1, ?, ?)`,
    )
      .bind(partnerId, partnerApiHash, now, partnerShare, now)
      .run()

    const selfQuestionIds: Array<{ id: string; ownerChoice: OptionKey }> = []
    for (let i = 0; i < DEMO_SELF_QUESTIONS.length; i++) {
      const q = DEMO_SELF_QUESTIONS[i]!
      const shuffled = shuffleQuestionOptions(q.options, q.ownerChoice, q.agentPredicted)
      const qId = randomToken('q_', 10)
      selfQuestionIds.push({ id: qId, ownerChoice: shuffled.ownerChoice })
      await c.env.DB.prepare(
        `INSERT INTO questions (
           id, owner_id, position, dimension, prompt, options_json,
           owner_choice, agent_predicted, confidence, memory_basis, starred, approved, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      )
        .bind(
          qId,
          selfId,
          i + 1,
          q.dimension,
          q.prompt,
          JSON.stringify(shuffled.options),
          shuffled.ownerChoice,
          shuffled.agentPredicted,
          q.confidence ?? 'medium',
          q.memoryBasis ?? null,
          q.starred ? 1 : 0,
          now,
        )
        .run()
    }

    const partnerQuestionIds: Array<{ id: string; ownerChoice: OptionKey }> = []
    for (let i = 0; i < DEMO_PARTNER_QUESTIONS.length; i++) {
      const q = DEMO_PARTNER_QUESTIONS[i]!
      const shuffled = shuffleQuestionOptions(q.options, q.ownerChoice, q.agentPredicted)
      const qId = randomToken('q_', 10)
      partnerQuestionIds.push({ id: qId, ownerChoice: shuffled.ownerChoice })
      await c.env.DB.prepare(
        `INSERT INTO questions (
           id, owner_id, position, dimension, prompt, options_json,
           owner_choice, agent_predicted, confidence, memory_basis, starred, approved, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      )
        .bind(
          qId,
          partnerId,
          i + 1,
          q.dimension,
          q.prompt,
          JSON.stringify(shuffled.options),
          shuffled.ownerChoice,
          shuffled.agentPredicted,
          q.confidence ?? 'medium',
          q.memoryBasis ?? null,
          q.starred ? 1 : 0,
          now,
        )
        .run()
    }

    const pairingId = randomToken('pr_', 12)
    await c.env.DB.prepare(
      `INSERT INTO pairings (
         id, kind, user_a_id, user_b_id, status,
         agent_hit_a_on_b, agent_cov_a_on_b, agent_hit_b_on_a, agent_cov_b_on_a,
         human_b_submitted_at, created_at
       ) VALUES (?, 'pool', ?, ?, 'ready_for_humans', 0.8, 0.83, 0.8, 0.83, ?, ?)`,
    )
      .bind(pairingId, selfId, partnerId, now, now)
      .run()

    const altChoice = (key: OptionKey): OptionKey => (key === 'A' ? 'B' : 'A')

    for (let i = 0; i < partnerQuestionIds.length; i++) {
      const pq = partnerQuestionIds[i]!
      let choice: OptionKey | 'U' = pq.ownerChoice
      let reason = '基于日常记忆匹配'
      if (i === 1) {
        choice = altChoice(pq.ownerChoice)
        reason = '演练：Agent 故意猜错 1 题，展示纠偏体验'
      } else if (i === 5) {
        choice = 'U'
        reason = '记忆中无听歌习惯记录，诚实弃权'
      }
      await c.env.DB.prepare(
        `INSERT INTO quiz_answers (
           id, pairing_id, respondent_id, quiz_owner_id, actor_type, question_id, choice, reason, created_at
         ) VALUES (?, ?, ?, ?, 'agent', ?, ?, ?, ?)`,
      )
        .bind(randomToken('ans_', 10), pairingId, selfId, partnerId, pq.id, choice, reason, now)
        .run()
    }

    for (let i = 0; i < selfQuestionIds.length; i++) {
      const sq = selfQuestionIds[i]!
      const partnerAgentChoice: OptionKey | 'U' =
        i === 5 ? 'U' : i === 3 ? altChoice(sq.ownerChoice) : sq.ownerChoice
      const partnerHumanChoice: OptionKey = i === 1 ? altChoice(sq.ownerChoice) : sq.ownerChoice
      await c.env.DB.prepare(
        `INSERT INTO quiz_answers (
           id, pairing_id, respondent_id, quiz_owner_id, actor_type, question_id, choice, reason, created_at
         ) VALUES (?, ?, ?, ?, 'agent', ?, ?, '演练匹配', ?)`,
      )
        .bind(randomToken('ans_', 10), pairingId, partnerId, selfId, sq.id, partnerAgentChoice, now)
        .run()
      await c.env.DB.prepare(
        `INSERT INTO quiz_answers (
           id, pairing_id, respondent_id, quiz_owner_id, actor_type, question_id, choice, reason, created_at
         ) VALUES (?, ?, ?, ?, 'human', ?, ?, NULL, ?)`,
      )
        .bind(randomToken('ans_', 10), pairingId, partnerId, selfId, sq.id, partnerHumanChoice, now)
        .run()
    }

    c.header('Set-Cookie', buildSessionCookie(selfSession, c.req.url))
    return c.json({
      ok: true,
      user_id: selfId,
      pairing_id: pairingId,
      share_code: selfShare,
      is_demo: true,
    })
  })

  app.get('/me', async (c) => {
    const user = await requireSessionUser(c.env.DB, c.req.header('Cookie'))
    if (!user) return c.json({ authenticated: false })

    const [questions, pairingsResult, drawResult] = await Promise.all([
      listQuestions(c.env.DB, user.id, false),
      c.env.DB.prepare(
        `SELECT p.*, ua.handle AS a_handle, ua.agent_name AS a_agent, ub.handle AS b_handle, ub.agent_name AS b_agent
         FROM pairings p
         JOIN users ua ON ua.id = p.user_a_id
         JOIN users ub ON ub.id = p.user_b_id
         WHERE (p.user_a_id = ? OR p.user_b_id = ?) AND p.status != 'archived'
         ORDER BY p.created_at DESC`,
      )
        .bind(user.id, user.id)
        .all<
          PairingRow & {
            a_handle: string
            a_agent: string
            b_handle: string
            b_agent: string
          }
        >(),
      c.env.DB.prepare(
        `SELECT g.id, g.pairing_id, g.status, g.max_rounds,
                (SELECT COUNT(*) FROM draw_rounds r WHERE r.game_id = g.id AND r.status = 'revealed') AS revealed_rounds,
                (SELECT r.status FROM draw_rounds r WHERE r.game_id = g.id ORDER BY r.round_number DESC LIMIT 1) AS latest_status,
                (SELECT r.drawer_id FROM draw_rounds r WHERE r.game_id = g.id ORDER BY r.round_number DESC LIMIT 1) AS latest_drawer_id
         FROM draw_games g
         JOIN pairings p ON p.id = g.pairing_id
         WHERE p.user_a_id = ? OR p.user_b_id = ?
         ORDER BY g.created_at DESC`,
      )
        .bind(user.id, user.id)
        .all<{
          id: string
          pairing_id: string
          status: string
          max_rounds: number
          revealed_rounds: number
          latest_status: string | null
          latest_drawer_id: string | null
        }>(),
    ])

    const origin = new URL(c.req.url).origin
    return c.json({
      authenticated: true,
      user: {
        id: user.id,
        handle: user.handle,
        agentName: user.agent_name,
        agentHost: user.agent_host,
        hasAgentKey: Boolean(user.api_key_hash),
        poolOptedIn: user.pool_opted_in === 1,
        shareCode: user.share_code,
        shareUrl: `${origin}/q/${user.share_code}`,
      },
      questions,
      pairings: pairingsResult.results.map((p) => {
        const isA = p.user_a_id === user.id
        const selfSubmitted = isA ? Boolean(p.human_a_submitted_at) : Boolean(p.human_b_submitted_at)
        const partnerSubmitted = isA ? Boolean(p.human_b_submitted_at) : Boolean(p.human_a_submitted_at)
        return {
          id: p.id,
          kind: p.kind,
          status: p.status,
          partnerHandle: isA ? p.b_handle : p.a_handle,
          partnerAgentName: isA ? p.b_agent : p.a_agent,
          selfSubmitted,
          partnerSubmitted,
          createdAt: p.created_at,
        }
      }),
      drawGames: drawResult.results.map((g) => ({
        id: g.id,
        pairingId: g.pairing_id,
        status: g.status,
        maxRounds: g.max_rounds,
        revealedRounds: g.revealed_rounds,
        latestStatus: g.latest_status,
        isMyTurn:
          (g.latest_drawer_id === user.id &&
            (g.latest_status === 'picking_word' || g.latest_status === 'awaiting_drawer_approve')) ||
          (g.latest_drawer_id !== user.id && g.latest_status === 'awaiting_guess'),
      })),
    })
  })

  app.post('/me/quiz/approve', async (c) => {
    const user = await requireSessionUser(c.env.DB, c.req.header('Cookie'))
    if (!user) return c.json({ error: 'Not signed in' }, 401)

    const body = await c.req.json<Record<string, unknown>>().catch(() => null)
    if (!body) return c.json({ error: 'Invalid JSON body' }, 400)

    const handle = typeof body.handle === 'string' && body.handle.trim()
      ? body.handle.trim().slice(0, 24)
      : user.handle
    const poolOptedIn = body.poolOptedIn === false ? 0 : 1
    const keepList = Array.isArray(body.questions) ? body.questions : []
    if (keepList.length < 3 || keepList.length > 10) {
      return c.json({ error: '请保留 3 到 10 道个人专属题再发布' }, 400)
    }

    const existing = await listQuestions(c.env.DB, user.id, false)
    const existingById = new Map(existing.map((q) => [q.id, q]))
    const keepIds = new Set<string>()

    for (let i = 0; i < keepList.length; i++) {
      const item = keepList[i] as Record<string, unknown>
      const qId = typeof item.id === 'string' ? item.id : ''
      const orig = existingById.get(qId)
      if (!orig) continue

      const prompt = typeof item.prompt === 'string' && item.prompt.trim()
        ? item.prompt.trim().slice(0, 200)
        : orig.prompt
      const opts = (item.options as Partial<OptionMap> | undefined) ?? orig.options
      const optionMap: OptionMap = {
        A: typeof opts.A === 'string' && opts.A.trim() ? opts.A.trim().slice(0, 120) : orig.options.A,
        B: typeof opts.B === 'string' && opts.B.trim() ? opts.B.trim().slice(0, 120) : orig.options.B,
        C: typeof opts.C === 'string' && opts.C.trim() ? opts.C.trim().slice(0, 120) : orig.options.C,
        D: typeof opts.D === 'string' && opts.D.trim() ? opts.D.trim().slice(0, 120) : orig.options.D,
      }
      const rawChoice = typeof item.ownerChoice === 'string' ? item.ownerChoice.toUpperCase() : orig.ownerChoice
      const ownerChoice: OptionKey = VALID_OPTIONS.has(rawChoice as OptionKey)
        ? (rawChoice as OptionKey)
        : orig.ownerChoice
      const starred = item.starred === true ? 1 : 0

      const pii = scanPii(`${prompt} ${optionMap.A} ${optionMap.B} ${optionMap.C} ${optionMap.D}`)
      if (!pii.clean) {
        return c.json({ error: `第 ${i + 1} 题包含疑似隐私信息，请先删除后再发布`, findings: pii.findings }, 400)
      }

      keepIds.add(qId)
      await c.env.DB.prepare(
        `UPDATE questions
         SET position = ?, prompt = ?, options_json = ?, owner_choice = ?, starred = ?, approved = 1
         WHERE id = ? AND owner_id = ?`,
      )
        .bind(i + 1, prompt, JSON.stringify(optionMap), ownerChoice, starred, qId, user.id)
        .run()
    }

    for (const orig of existing) {
      if (!keepIds.has(orig.id)) {
        await c.env.DB.prepare('DELETE FROM questions WHERE id = ? AND owner_id = ?')
          .bind(orig.id, user.id)
          .run()
      }
    }

    const now = new Date().toISOString()
    await c.env.DB.prepare(
      'UPDATE users SET handle = ?, pool_opted_in = ?, claimed_at = COALESCE(claimed_at, ?) WHERE id = ?',
    )
      .bind(handle, poolOptedIn, now, user.id)
      .run()

    if (poolOptedIn === 1) {
      await ensurePoolPairingsForUser(c.env.DB, user.id)
    }

    return c.json({ ok: true, approvedCount: keepIds.size })
  })

  app.get('/share/:shareCode', async (c) => {
    const shareCode = c.req.param('shareCode')
    const owner = await getUserByShareCode(c.env.DB, shareCode)
    if (!owner) return c.json({ error: '找不到该专属题库链接' }, 404)

    const questions = await listQuestions(c.env.DB, owner.id, true)
    if (questions.length === 0) {
      return c.json({ error: '对方尚未发布个人题库' }, 404)
    }

    const viewer = await requireSessionUser(c.env.DB, c.req.header('Cookie'))
    return c.json({
      ownerHandle: owner.handle,
      ownerAgentName: owner.agent_name,
      questionCount: questions.length,
      dimensions: Array.from(new Set(questions.map((q) => q.dimension))),
      isOwnLink: viewer?.id === owner.id,
      viewerHandle: viewer?.handle ?? null,
    })
  })

  app.post('/share/:shareCode/start', async (c) => {
    const shareCode = c.req.param('shareCode')
    const owner = await getUserByShareCode(c.env.DB, shareCode)
    if (!owner) return c.json({ error: '找不到该专属题库链接' }, 404)

    const body = await c.req.json<Record<string, unknown>>().catch((): Record<string, unknown> => ({}))
    let challenger = await requireSessionUser(c.env.DB, c.req.header('Cookie'))

    if (!challenger) {
      const guestHandle = typeof body?.handle === 'string' && body.handle.trim()
        ? body.handle.trim().slice(0, 24)
        : '路过的好友'
      const pii = scanPii(guestHandle)
      if (!pii.clean) return c.json({ error: '昵称请勿包含隐私信息' }, 400)

      const guestId = randomToken('usr_', 12)
      const sessionToken = randomToken('ses_', 24)
      const sessionHash = await sha256Hex(sessionToken)
      const now = new Date().toISOString()

      await c.env.DB.prepare(
        `INSERT INTO users (
           id, handle, agent_name, agent_host, owner_session_hash,
           claimed_at, pool_opted_in, share_code, created_at
         ) VALUES (?, ?, '无外接 Agent', 'other', ?, ?, 0, ?, ?)`,
      )
        .bind(guestId, guestHandle, sessionHash, now, randomShareCode(), now)
        .run()

      c.header('Set-Cookie', buildSessionCookie(sessionToken, c.req.url))
      challenger = await getUserById(c.env.DB, guestId)
    }

    if (!challenger) return c.json({ error: 'Unable to establish session' }, 500)
    if (challenger.id === owner.id) {
      return c.json({ error: '这是你自己的专属链接，发给朋友或陌生人来测吧' }, 400)
    }

    const existing = await c.env.DB.prepare(
      `SELECT * FROM pairings
       WHERE (user_a_id = ? AND user_b_id = ?) OR (user_a_id = ? AND user_b_id = ?)
       LIMIT 1`,
    )
      .bind(owner.id, challenger.id, challenger.id, owner.id)
      .first<PairingRow>()

    if (existing) {
      return c.json({ pairingId: existing.id })
    }

    const pairingId = randomToken('pr_', 12)
    const now = new Date().toISOString()
    await c.env.DB.prepare(
      `INSERT INTO pairings (id, kind, user_a_id, user_b_id, status, created_at)
       VALUES (?, 'link', ?, ?, 'ready_for_humans', ?)`,
    )
      .bind(pairingId, owner.id, challenger.id, now)
      .run()

    return c.json({ pairingId }, 201)
  })

  app.get('/pairings/:id', async (c) => {
    const user = await requireSessionUser(c.env.DB, c.req.header('Cookie'))
    if (!user) return c.json({ error: 'Not signed in' }, 401)

    const pairing = await c.env.DB.prepare('SELECT * FROM pairings WHERE id = ?')
      .bind(c.req.param('id'))
      .first<PairingRow>()
    if (!pairing) return c.json({ error: 'Pairing not found' }, 404)
    if (pairing.user_a_id !== user.id && pairing.user_b_id !== user.id) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    const isA = pairing.user_a_id === user.id
    const partnerId = isA ? pairing.user_b_id : pairing.user_a_id
    const [partner, selfQuestions, partnerQuestions, selfHumanAns, selfAgentAns, partnerHumanAns, partnerAgentAns, notes, drawGame] =
      await Promise.all([
        getUserById(c.env.DB, partnerId),
        listQuestions(c.env.DB, user.id, true),
        listQuestions(c.env.DB, partnerId, true),
        listAnswers(c.env.DB, pairing.id, user.id, 'human'),
        listAnswers(c.env.DB, pairing.id, user.id, 'agent'),
        listAnswers(c.env.DB, pairing.id, partnerId, 'human'),
        listAnswers(c.env.DB, pairing.id, partnerId, 'agent'),
        listAnchorNotes(c.env.DB, pairing.id),
        c.env.DB.prepare('SELECT id FROM draw_games WHERE pairing_id = ? ORDER BY created_at DESC LIMIT 1')
          .bind(pairing.id)
          .first<{ id: string }>(),
      ])

    if (!partner) return c.json({ error: 'Partner not found' }, 404)

    const selfSubmitted = isA ? Boolean(pairing.human_a_submitted_at) : Boolean(pairing.human_b_submitted_at)
    const partnerSubmitted = isA ? Boolean(pairing.human_b_submitted_at) : Boolean(pairing.human_a_submitted_at)
    const isRevealed = pairing.status === 'revealed'

    if (!selfSubmitted && partnerQuestions.length > 0) {
      return c.json({
        id: pairing.id,
        kind: pairing.kind,
        status: pairing.status,
        phase: 'blind_answering',
        selfHandle: user.handle,
        selfAgentName: user.agent_name,
        partnerHandle: partner.handle,
        partnerAgentName: partner.agent_name,
        hasOwnAgentAnswers: selfAgentAns.length > 0,
        partnerQuestions: partnerQuestions.map((q) => ({
          id: q.id,
          position: q.position,
          dimension: q.dimension,
          prompt: q.prompt,
          options: q.options,
          starred: q.starred,
        })),
      })
    }

    const ownAgentSync = buildAgentSyncReport(partnerQuestions, selfHumanAns, selfAgentAns)
    const selfOnPartner = evaluateDirection(partnerQuestions, selfHumanAns)
    const partnerOnSelf = evaluateDirection(selfQuestions, partnerHumanAns)

    if (!isRevealed) {
      return c.json({
        id: pairing.id,
        kind: pairing.kind,
        status: pairing.status,
        phase: 'waiting_partner',
        selfHandle: user.handle,
        selfAgentName: user.agent_name,
        partnerHandle: partner.handle,
        partnerAgentName: partner.agent_name,
        selfSubmitted,
        partnerSubmitted,
        ownAgentSync,
      })
    }

    const revealPartnerItems = buildRevealItems(
      partnerQuestions,
      'partner',
      selfHumanAns,
      selfAgentAns,
      true,
    )
    const revealSelfItems = buildRevealItems(
      selfQuestions,
      'self',
      partnerHumanAns,
      partnerAgentAns,
      false,
    )

    const combinedTotal =
      (partnerQuestions.length > 0 ? selfOnPartner.answered : 0) +
      (selfQuestions.length > 0 ? partnerOnSelf.answered : 0)
    const combinedMatched =
      (partnerQuestions.length > 0 ? selfOnPartner.matched : 0) +
      (selfQuestions.length > 0 ? partnerOnSelf.matched : 0)

    const selfAgentPredHit = isA ? pairing.agent_hit_a_on_b : pairing.agent_hit_b_on_a
    const partnerAgentPredHit = isA ? pairing.agent_hit_b_on_a : pairing.agent_hit_a_on_b

    return c.json({
      id: pairing.id,
      kind: pairing.kind,
      status: pairing.status,
      phase: 'revealed',
      selfHandle: user.handle,
      selfAgentName: user.agent_name,
      partnerHandle: partner.handle,
      partnerAgentName: partner.agent_name,
      tripleReveal: {
        humanToHuman: {
          combinedHitRate: combinedTotal > 0 ? combinedMatched / combinedTotal : 0,
          selfOnPartner,
          partnerOnSelf,
        },
        ownAgentSync,
        agentPrediction: {
          selfAgentHitRate: selfAgentPredHit,
          partnerAgentHitRate: partnerAgentPredHit,
        },
        items: [...revealPartnerItems, ...revealSelfItems],
      },
      notes,
      drawGameId: drawGame?.id ?? null,
    })
  })

  app.post('/pairings/:id/human-answers', async (c) => {
    const user = await requireSessionUser(c.env.DB, c.req.header('Cookie'))
    if (!user) return c.json({ error: 'Not signed in' }, 401)

    const pairing = await c.env.DB.prepare('SELECT * FROM pairings WHERE id = ?')
      .bind(c.req.param('id'))
      .first<PairingRow>()
    if (!pairing) return c.json({ error: 'Pairing not found' }, 404)
    if (pairing.user_a_id !== user.id && pairing.user_b_id !== user.id) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    const body = await c.req.json<Record<string, unknown>>().catch(() => null)
    const rawAnswers = body?.answers
    if (!Array.isArray(rawAnswers) || rawAnswers.length === 0) {
      return c.json({ error: 'answers array is required' }, 400)
    }

    const isA = pairing.user_a_id === user.id
    const partnerId = isA ? pairing.user_b_id : pairing.user_a_id
    const partnerQuestions = await listQuestions(c.env.DB, partnerId, true)
    const validIds = new Set(partnerQuestions.map((q) => q.id))

    const now = new Date().toISOString()
    let saved = 0
    for (const item of rawAnswers) {
      const rec = item as Record<string, unknown>
      const questionId = typeof rec?.questionId === 'string' ? rec.questionId : ''
      const rawChoice = typeof rec?.choice === 'string' ? rec.choice.toUpperCase() : ''
      if (!validIds.has(questionId) || !VALID_OPTIONS.has(rawChoice as OptionKey)) continue

      await c.env.DB.prepare(
        `INSERT INTO quiz_answers (
           id, pairing_id, respondent_id, quiz_owner_id, actor_type, question_id, choice, reason, created_at
         ) VALUES (?, ?, ?, ?, 'human', ?, ?, NULL, ?)
         ON CONFLICT(pairing_id, respondent_id, actor_type, question_id)
         DO UPDATE SET choice = excluded.choice`,
      )
        .bind(randomToken('ans_', 10), pairing.id, user.id, partnerId, questionId, rawChoice, now)
        .run()
      saved++
    }

    if (saved < partnerQuestions.length) {
      return c.json({ error: '请完成全部题目后再揭晓结果' }, 400)
    }

    const selfQuestions = await listQuestions(c.env.DB, user.id, true)
    const humanASubmitted = isA ? now : pairing.human_a_submitted_at
    const humanBSubmitted = isA ? pairing.human_b_submitted_at : now

    const shouldReveal =
      (Boolean(humanASubmitted) && Boolean(humanBSubmitted)) ||
      (pairing.kind === 'link' && !isA && selfQuestions.length === 0)

    await c.env.DB.prepare(
      `UPDATE pairings
       SET human_a_submitted_at = ?, human_b_submitted_at = ?,
           status = ?, revealed_at = COALESCE(revealed_at, ?)
       WHERE id = ?`,
    )
      .bind(
        humanASubmitted,
        humanBSubmitted,
        shouldReveal ? 'revealed' : pairing.status,
        shouldReveal ? now : null,
        pairing.id,
      )
      .run()

    return c.json({ ok: true, revealed: shouldReveal })
  })

  app.post('/pairings/:id/notes', async (c) => {
    const user = await requireSessionUser(c.env.DB, c.req.header('Cookie'))
    if (!user) return c.json({ error: 'Not signed in' }, 401)

    const pairing = await c.env.DB.prepare('SELECT * FROM pairings WHERE id = ?')
      .bind(c.req.param('id'))
      .first<PairingRow>()
    if (!pairing || (pairing.user_a_id !== user.id && pairing.user_b_id !== user.id)) {
      return c.json({ error: 'Forbidden' }, 403)
    }
    if (pairing.status !== 'revealed') {
      return c.json({ error: '请先完成双盲揭晓后再留言' }, 409)
    }

    const body = await c.req.json<Record<string, unknown>>().catch(() => null)
    const questionId = typeof body?.questionId === 'string' ? body.questionId.trim() : ''
    const noteBody = typeof body?.body === 'string' ? body.body.trim().slice(0, 240) : ''
    if (!questionId || !noteBody) return c.json({ error: 'questionId and body are required' }, 400)

    const pii = scanPii(noteBody)
    if (!pii.clean) {
      return c.json({ error: '留言里包含疑似隐私信息，请确认后再发', findings: pii.findings }, 400)
    }

    const noteId = randomToken('nt_', 10)
    const now = new Date().toISOString()
    await c.env.DB.prepare(
      'INSERT INTO anchor_notes (id, pairing_id, question_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
      .bind(noteId, pairing.id, questionId, user.id, noteBody, now)
      .run()

    return c.json({
      id: noteId,
      questionId,
      authorId: user.id,
      authorHandle: user.handle,
      body: noteBody,
      createdAt: now,
    })
  })

  app.post('/pairings/:id/archive', async (c) => {
    const user = await requireSessionUser(c.env.DB, c.req.header('Cookie'))
    if (!user) return c.json({ error: 'Not signed in' }, 401)

    await c.env.DB.prepare(
      `UPDATE pairings SET status = 'archived' WHERE id = ? AND (user_a_id = ? OR user_b_id = ?)`,
    )
      .bind(c.req.param('id'), user.id, user.id)
      .run()

    return c.json({ ok: true })
  })

  app.post('/pairings/:id/draw-game', async (c) => {
    const user = await requireSessionUser(c.env.DB, c.req.header('Cookie'))
    if (!user) return c.json({ error: 'Not signed in' }, 401)

    const pairing = await c.env.DB.prepare('SELECT * FROM pairings WHERE id = ?')
      .bind(c.req.param('id'))
      .first<PairingRow>()
    if (!pairing || (pairing.user_a_id !== user.id && pairing.user_b_id !== user.id)) {
      return c.json({ error: 'Forbidden' }, 403)
    }
    if (pairing.status !== 'revealed') {
      return c.json({ error: '请先完成双盲题库揭晓后再开启「你画我猜」' }, 409)
    }

    const existing = await c.env.DB.prepare(
      'SELECT id FROM draw_games WHERE pairing_id = ? ORDER BY created_at DESC LIMIT 1',
    )
      .bind(pairing.id)
      .first<{ id: string }>()
    if (existing) {
      return c.json({ gameId: existing.id })
    }

    const gameId = randomToken('dg_', 12)
    const now = new Date().toISOString()
    const partnerId = pairing.user_a_id === user.id ? pairing.user_b_id : pairing.user_a_id

    await c.env.DB.prepare(
      `INSERT INTO draw_games (id, pairing_id, status, max_rounds, created_at)
       VALUES (?, ?, 'active', 4, ?)`,
    )
      .bind(gameId, pairing.id, now)
      .run()

    await createNextDrawRound(c.env.DB, gameId, 1, user.id, partnerId, [])
    return c.json({ gameId }, 201)
  })

  app.get('/draw/:gameId', async (c) => {
    const user = await requireSessionUser(c.env.DB, c.req.header('Cookie'))
    if (!user) return c.json({ error: 'Not signed in' }, 401)

    const view = await loadDrawGameView(c.env.DB, c.req.param('gameId'), user.id)
    if (!view) return c.json({ error: 'Draw game not found' }, 404)
    return c.json(view)
  })

  app.post('/draw/:gameId/rounds/:roundId/pick-word', async (c) => {
    const user = await requireSessionUser(c.env.DB, c.req.header('Cookie'))
    if (!user) return c.json({ error: 'Not signed in' }, 401)

    const round = await c.env.DB.prepare(
      'SELECT * FROM draw_rounds WHERE id = ? AND game_id = ?',
    )
      .bind(c.req.param('roundId'), c.req.param('gameId'))
      .first<{ id: string; drawer_id: string; status: string }>()
    if (!round || round.drawer_id !== user.id) return c.json({ error: 'Forbidden' }, 403)
    if (round.status !== 'picking_word') {
      return c.json({ error: '当前回合已完成选题' }, 409)
    }

    const body = await c.req.json<Record<string, unknown>>().catch(() => null)
    const secretWord = typeof body?.secretWord === 'string' ? body.secretWord.trim().slice(0, 24) : ''
    const drawingBrief = typeof body?.drawingBrief === 'string' ? body.drawingBrief.trim().slice(0, 120) : null
    if (!secretWord) return c.json({ error: '请选择或输入一个要画的词' }, 400)

    const pii = scanPii(`${secretWord} ${drawingBrief ?? ''}`)
    if (!pii.clean) return c.json({ error: '题目或画画提示不能包含隐私信息' }, 400)

    await c.env.DB.prepare(
      `UPDATE draw_rounds
       SET secret_word = ?, drawing_brief = ?, status = 'awaiting_agent_draw'
       WHERE id = ?`,
    )
      .bind(secretWord, drawingBrief, round.id)
      .run()

    return c.json({ ok: true, status: 'awaiting_agent_draw' })
  })

  app.post('/draw/:gameId/rounds/:roundId/demo-agent-draw', async (c) => {
    const user = await requireSessionUser(c.env.DB, c.req.header('Cookie'))
    if (!user) return c.json({ error: 'Not signed in' }, 401)

    const round = await c.env.DB.prepare(
      'SELECT * FROM draw_rounds WHERE id = ? AND game_id = ?',
    )
      .bind(c.req.param('roundId'), c.req.param('gameId'))
      .first<{ id: string; drawer_id: string; secret_word: string | null; status: string }>()
    if (!round || round.drawer_id !== user.id) return c.json({ error: 'Forbidden' }, 403)
    if (round.status !== 'awaiting_agent_draw' || !round.secret_word) {
      return c.json({ error: '当前回合不处于等待 Agent 作画状态' }, 409)
    }

    const strokes = buildDemoAgentStrokes(round.secret_word)
    await c.env.DB.prepare(
      `UPDATE draw_rounds
       SET strokes_json = ?, drawn_by = 'agent', drawer_approved = 0, status = 'awaiting_drawer_approve'
       WHERE id = ?`,
    )
      .bind(JSON.stringify(strokes), round.id)
      .run()

    return c.json({ ok: true, strokeCount: strokes.length })
  })

  app.post('/draw/:gameId/rounds/:roundId/human-draw', async (c) => {
    const user = await requireSessionUser(c.env.DB, c.req.header('Cookie'))
    if (!user) return c.json({ error: 'Not signed in' }, 401)

    const round = await c.env.DB.prepare(
      'SELECT * FROM draw_rounds WHERE id = ? AND game_id = ?',
    )
      .bind(c.req.param('roundId'), c.req.param('gameId'))
      .first<{ id: string; drawer_id: string; status: string }>()
    if (!round || round.drawer_id !== user.id) return c.json({ error: 'Forbidden' }, 403)
    if (round.status !== 'awaiting_agent_draw' && round.status !== 'awaiting_drawer_approve') {
      return c.json({ error: '当前回合不可修改画作' }, 409)
    }

    const body = await c.req.json<Record<string, unknown>>().catch(() => null)
    const parsed = validateStrokes(body?.strokes)
    if (!parsed.ok) return c.json({ error: parsed.error }, 400)

    await c.env.DB.prepare(
      `UPDATE draw_rounds
       SET strokes_json = ?, drawn_by = 'human', drawer_approved = 1, status = 'awaiting_guess'
       WHERE id = ?`,
    )
      .bind(JSON.stringify(parsed.strokes), round.id)
      .run()

    return c.json({ ok: true, status: 'awaiting_guess' })
  })

  app.post('/draw/:gameId/rounds/:roundId/approve', async (c) => {
    const user = await requireSessionUser(c.env.DB, c.req.header('Cookie'))
    if (!user) return c.json({ error: 'Not signed in' }, 401)

    const round = await c.env.DB.prepare(
      'SELECT * FROM draw_rounds WHERE id = ? AND game_id = ?',
    )
      .bind(c.req.param('roundId'), c.req.param('gameId'))
      .first<{ id: string; drawer_id: string; status: string; guesser_id: string }>()
    if (!round || round.drawer_id !== user.id) return c.json({ error: 'Forbidden' }, 403)
    if (round.status !== 'awaiting_drawer_approve') {
      return c.json({ error: '当前回合没有待批准的画作' }, 409)
    }

    const body = await c.req.json<Record<string, unknown>>().catch((): Record<string, unknown> => ({}))
    if (body?.action === 'redraw') {
      await c.env.DB.prepare(
        `UPDATE draw_rounds
         SET strokes_json = NULL, drawer_approved = 0, status = 'awaiting_agent_draw'
         WHERE id = ?`,
      )
        .bind(round.id)
        .run()
      return c.json({ ok: true, status: 'awaiting_agent_draw' })
    }

    await c.env.DB.prepare(
      `UPDATE draw_rounds SET drawer_approved = 1, status = 'awaiting_guess' WHERE id = ?`,
    )
      .bind(round.id)
      .run()

    return c.json({ ok: true, status: 'awaiting_guess' })
  })

  app.post('/draw/:gameId/rounds/:roundId/demo-partner-turn', async (c) => {
    const user = await requireSessionUser(c.env.DB, c.req.header('Cookie'))
    if (!user) return c.json({ error: 'Not signed in' }, 401)

    const game = await c.env.DB.prepare('SELECT * FROM draw_games WHERE id = ?')
      .bind(c.req.param('gameId'))
      .first<{ id: string; max_rounds: number }>()
    if (!game) return c.json({ error: 'Game not found' }, 404)

    const round = await c.env.DB.prepare(
      'SELECT * FROM draw_rounds WHERE id = ? AND game_id = ?',
    )
      .bind(c.req.param('roundId'), game.id)
      .first<{
        id: string
        round_number: number
        drawer_id: string
        guesser_id: string
        secret_word: string | null
        status: string
      }>()
    if (!round) return c.json({ error: 'Round not found' }, 404)
    if (round.drawer_id !== user.id || round.status !== 'awaiting_guess' || !round.secret_word) {
      return c.json({ error: '仅在等待对方猜画时可演练推进对方回合' }, 409)
    }

    const partner = await getUserById(c.env.DB, round.guesser_id)
    if (!partner || !partner.handle.includes('演练')) {
      return c.json({ error: '仅演练对手支持模拟回猜' }, 403)
    }

    const now = new Date().toISOString()
    await c.env.DB.prepare(
      `UPDATE draw_rounds
       SET guess_text = ?, guess_attempts = 1, is_correct = 1, reaction = '哈哈画得太传神了',
           status = 'revealed', revealed_at = ?
       WHERE id = ?`,
    )
      .bind(round.secret_word, now, round.id)
      .run()

    if (round.round_number < game.max_rounds) {
      const { results: used } = await c.env.DB.prepare(
        'SELECT secret_word FROM draw_rounds WHERE game_id = ? AND secret_word IS NOT NULL',
      )
        .bind(game.id)
        .all<{ secret_word: string }>()
      const nextWord = used.some((u) => u.secret_word === '长翅膀的咖啡杯')
        ? '雨天打伞的机器人'
        : '长翅膀的咖啡杯'
      const nextRoundId = await createNextDrawRound(
        c.env.DB,
        game.id,
        round.round_number + 1,
        round.guesser_id,
        round.drawer_id,
        used.map((u) => u.secret_word),
      )
      await c.env.DB.prepare(
        `UPDATE draw_rounds
         SET secret_word = ?, drawing_brief = '画得夸张一点！', drawn_by = 'agent',
             strokes_json = ?, drawer_approved = 1, status = 'awaiting_guess'
         WHERE id = ?`,
      )
        .bind(nextWord, JSON.stringify(buildDemoAgentStrokes(nextWord)), nextRoundId)
        .run()
    } else {
      await c.env.DB.prepare(`UPDATE draw_games SET status = 'completed', completed_at = ? WHERE id = ?`)
        .bind(now, game.id)
        .run()
    }

    return c.json({ ok: true })
  })

  app.post('/draw/:gameId/rounds/:roundId/guess', async (c) => {
    const user = await requireSessionUser(c.env.DB, c.req.header('Cookie'))
    if (!user) return c.json({ error: 'Not signed in' }, 401)

    const game = await c.env.DB.prepare('SELECT * FROM draw_games WHERE id = ?')
      .bind(c.req.param('gameId'))
      .first<{ id: string; max_rounds: number }>()
    if (!game) return c.json({ error: 'Game not found' }, 404)

    const round = await c.env.DB.prepare(
      'SELECT * FROM draw_rounds WHERE id = ? AND game_id = ?',
    )
      .bind(c.req.param('roundId'), game.id)
      .first<{
        id: string
        round_number: number
        drawer_id: string
        guesser_id: string
        secret_word: string | null
        guess_attempts: number
        status: string
      }>()
    if (!round || round.guesser_id !== user.id) return c.json({ error: 'Forbidden' }, 403)
    if (round.status !== 'awaiting_guess' || !round.secret_word) {
      return c.json({ error: '当前回合不在猜画阶段' }, 409)
    }

    const body = await c.req.json<Record<string, unknown>>().catch(() => null)
    const giveUp = body?.giveUp === true
    const guessText = typeof body?.guess === 'string' ? body.guess.trim().slice(0, 40) : ''
    if (!giveUp && !guessText) return c.json({ error: '请输入你的猜测' }, 400)

    const nextAttempts = round.guess_attempts + (giveUp ? 0 : 1)
    const matched = !giveUp && isCorrectGuess(round.secret_word, guessText)
    const finished = matched || giveUp || nextAttempts >= MAX_GUESS_ATTEMPTS
    const now = new Date().toISOString()

    await c.env.DB.prepare(
      `UPDATE draw_rounds
       SET guess_text = ?, guess_attempts = ?, is_correct = ?,
           status = ?, revealed_at = COALESCE(revealed_at, ?)
       WHERE id = ?`,
    )
      .bind(
        giveUp ? '（选择揭晓）' : guessText,
        nextAttempts,
        finished ? (matched ? 1 : 0) : null,
        finished ? 'revealed' : 'awaiting_guess',
        finished ? now : null,
        round.id,
      )
      .run()

    if (finished) {
      if (round.round_number < game.max_rounds) {
        const { results: used } = await c.env.DB.prepare(
          'SELECT secret_word FROM draw_rounds WHERE game_id = ? AND secret_word IS NOT NULL',
        )
          .bind(game.id)
          .all<{ secret_word: string }>()
        await createNextDrawRound(
          c.env.DB,
          game.id,
          round.round_number + 1,
          round.guesser_id,
          round.drawer_id,
          used.map((u) => u.secret_word),
        )
      } else {
        await c.env.DB.prepare(`UPDATE draw_games SET status = 'completed', completed_at = ? WHERE id = ?`)
          .bind(now, game.id)
          .run()
      }
    }

    return c.json({
      matched,
      revealed: finished,
      attemptsRemaining: finished ? 0 : MAX_GUESS_ATTEMPTS - nextAttempts,
      secretWord: finished ? round.secret_word : null,
    })
  })

  app.post('/draw/:gameId/rounds/:roundId/react', async (c) => {
    const user = await requireSessionUser(c.env.DB, c.req.header('Cookie'))
    if (!user) return c.json({ error: 'Not signed in' }, 401)

    const body = await c.req.json<Record<string, unknown>>().catch(() => null)
    const reaction = typeof body?.reaction === 'string' ? body.reaction.trim().slice(0, 24) : ''
    if (!reaction) return c.json({ error: 'reaction is required' }, 400)

    await c.env.DB.prepare(
      `UPDATE draw_rounds SET reaction = ?
       WHERE id = ? AND game_id = ? AND status = 'revealed' AND (drawer_id = ? OR guesser_id = ?)`,
    )
      .bind(reaction, c.req.param('roundId'), c.req.param('gameId'), user.id, user.id)
      .run()

    return c.json({ ok: true })
  })

  app.get('/me/export', async (c) => {
    const user = await requireSessionUser(c.env.DB, c.req.header('Cookie'))
    if (!user) return c.json({ error: 'Not signed in' }, 401)

    const [questions, answers, pairings] = await Promise.all([
      listQuestions(c.env.DB, user.id, false),
      c.env.DB.prepare('SELECT * FROM quiz_answers WHERE respondent_id = ?').bind(user.id).all(),
      c.env.DB.prepare('SELECT id, kind, status, created_at, revealed_at FROM pairings WHERE user_a_id = ? OR user_b_id = ?')
        .bind(user.id, user.id)
        .all(),
    ])

    return c.json({
      exportedAt: new Date().toISOString(),
      user: {
        id: user.id,
        handle: user.handle,
        agentName: user.agent_name,
        agentHost: user.agent_host,
        shareCode: user.share_code,
        createdAt: user.created_at,
      },
      questions,
      answers: answers.results,
      pairings: pairings.results,
    })
  })

  app.delete('/me', async (c) => {
    const user = await requireSessionUser(c.env.DB, c.req.header('Cookie'))
    if (!user) return c.json({ error: 'Not signed in' }, 401)

    await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(user.id).run()
    c.header('Set-Cookie', buildClearSessionCookie(c.req.url))
    return c.json({ deleted: true })
  })

  return app
}
