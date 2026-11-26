import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { SUBTEXT_PROMPT_POOL, SUBTEXT_PROMPT_POOL_EN } from '../shared/drawing'
import { renderElevatorProtocolSvg } from '../shared/sampleSketch'
import type { QuestionOptions } from '../shared/types'
import {
  eraseAgent,
  getInbox,
  getPairingReveal,
  guessDrawing,
  pickDrawWord,
  postAnchorNote,
  publishQuiz,
  startDrawGame,
  submitAgentAnswers,
  submitDrawing,
  submitHumanAnswers,
} from './service'

interface SqliteD1Hooks {
  shouldFailSql?: (sql: string) => boolean
  beforeExecuteSql?: (sql: string, op: 'first' | 'all' | 'run' | 'batch') => Promise<void> | void
}

function createSqliteD1(hooks: SqliteD1Hooks = {}): D1Database {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec('PRAGMA foreign_keys = ON;')
  const migrationsDir = fileURLToPath(new URL('../../migrations', import.meta.url))
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  for (const file of files) {
    sqlite.exec(readFileSync(join(migrationsDir, file), 'utf-8'))
  }

  const makeStmt = (sql: string, bindings: SQLInputValue[] = []): D1PreparedStatement => {
    const runPreHooks = async (op: 'first' | 'all' | 'run') => {
      if (hooks.beforeExecuteSql) {
        await hooks.beforeExecuteSql(sql, op)
      }
      if (hooks.shouldFailSql && hooks.shouldFailSql(sql)) {
        throw new Error('Simulated D1 write failure')
      }
    }
    return {
      bind(...params: SQLInputValue[]) {
        return makeStmt(sql, params)
      },
      async first<T = Record<string, unknown>>() {
        await runPreHooks('first')
        const row = sqlite.prepare(sql).get(...bindings) as T | undefined
        return row ?? null
      },
      async all<T = Record<string, unknown>>() {
        await runPreHooks('all')
        const results = sqlite.prepare(sql).all(...bindings) as T[]
        return { results, success: true, meta: {} } as unknown as D1Result<T>
      },
      async run() {
        await runPreHooks('run')
        const info = sqlite.prepare(sql).run(...bindings)
        return {
          results: [],
          success: true,
          meta: { changes: Number(info.changes) },
        } as unknown as D1Result
      },
      async raw() {
        await runPreHooks('all')
        return []
      },
      _sql: sql,
      _bindings: bindings,
    } as unknown as D1PreparedStatement
  }

  return {
    prepare(sql: string) {
      return makeStmt(sql)
    },
    async batch(statements: D1PreparedStatement[]) {
      const joinedSql = statements.map((st) => (st as unknown as { _sql: string })._sql).join('\n')
      if (hooks.beforeExecuteSql) {
        await hooks.beforeExecuteSql(joinedSql, 'batch')
      }
      sqlite.exec('BEGIN TRANSACTION')
      try {
        const results: D1Result[] = []
        for (const stmt of statements) {
          const s = stmt as unknown as { _sql: string; _bindings: SQLInputValue[] }
          if (hooks.shouldFailSql && hooks.shouldFailSql(s._sql)) {
            throw new Error('Simulated D1 batch SQL failure')
          }
          const info = sqlite.prepare(s._sql).run(...s._bindings)
          results.push({
            results: [],
            success: true,
            meta: { changes: Number(info.changes) },
          } as unknown as D1Result)
        }
        sqlite.exec('COMMIT')
        return results
      } catch (err) {
        sqlite.exec('ROLLBACK')
        throw err
      }
    },
    async exec(sql: string) {
      sqlite.exec(sql)
      return { count: 1, duration: 0 }
    },
    async dump() {
      return new ArrayBuffer(0)
    },
  } as unknown as D1Database
}

function createBarrier(parties: number): () => Promise<void> {
  let arrived = 0
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  return async () => {
    arrived += 1
    if (arrived >= parties) {
      release()
    }
    await gate
  }
}

const ORIGIN = 'https://kindred.example.test'

function buildQuestions(prefix: string, lang: 'en' | 'zh' = 'en') {
  return [1, 2, 3, 4].map((i) => ({
    dimension: lang === 'zh' ? `维度-${i}` : `dim-${i}`,
    prompt: lang === 'zh' ? `${prefix} 深夜偏好问题 ${i}？` : `${prefix} question ${i}?`,
    options: { A: `${prefix}-a-${i}`, B: `${prefix}-b-${i}`, C: `${prefix}-c-${i}`, D: `${prefix}-d-${i}` },
    owner_choice: 'A',
    agent_predicted: 'A',
    confidence: 'high',
  }))
}

function mapMatchingAnswers(
  qs: Array<{ id: string; prompt: string; options: QuestionOptions }>,
  src: ReturnType<typeof buildQuestions>,
  pickWrong = false,
) {
  return qs.map((q) => {
    const orig = src.find((s) => s.prompt === q.prompt)!
    const targetText = pickWrong ? orig.options.B : orig.options.A
    const key = Object.entries(q.options).find(([, v]) => v === targetText)![0]
    return { question_id: q.id, choice: key }
  })
}

async function setupPendingPairing(db: D1Database, lang: 'en' | 'zh' = 'en') {
  const qsA = buildQuestions('alpha', lang)
  const qsB = buildQuestions('beta', lang)
  const pubA = await publishQuiz(db, ORIGIN, null, qsA)
  const pubB = await publishQuiz(db, ORIGIN, null, qsB)
  const inboxA = await getInbox(db, ORIGIN, pubA.agent_token)
  const inboxB = await getInbox(db, ORIGIN, pubB.agent_token)
  const pairA = inboxA.pending_quizzes[0]!
  const pairB = inboxB.pending_quizzes[0]!
  return {
    tokenA: pubA.agent_token!,
    tokenB: pubB.agent_token!,
    pairingId: pairA.pairing_id,
    qsA,
    qsB,
    pairA,
    pairB,
  }
}

async function setupRevealedPairing(db: D1Database, lang: 'en' | 'zh' = 'en') {
  const { tokenA, tokenB, pairingId, qsA, qsB, pairA } = await setupPendingPairing(db, lang)
  const screenA = await submitAgentAnswers(db, tokenA, pairingId, mapMatchingAnswers(pairA.questions, qsB))
  assert.equal(screenA.pairing_status, 'ready_for_humans')
  assert.equal(screenA.agent_score.passed, true)
  const revA = await getPairingReveal(db, ORIGIN, tokenA, pairingId)
  const revB = await getPairingReveal(db, ORIGIN, tokenB, pairingId)
  await submitHumanAnswers(
    db,
    ORIGIN,
    tokenA,
    pairingId,
    mapMatchingAnswers((revA as { partner_questions: typeof pairA.questions }).partner_questions, qsB),
  )
  await submitHumanAnswers(
    db,
    ORIGIN,
    tokenB,
    pairingId,
    mapMatchingAnswers((revB as { partner_questions: typeof pairA.questions }).partner_questions, qsA),
  )
  return {
    tokenA,
    tokenB,
    pairingId,
    questionId: pairA.questions[0]!.id,
  }
}

async function setupDrawGame(db: D1Database, lang: 'en' | 'zh' = 'en') {
  const { tokenA, tokenB, pairingId, questionId } = await setupRevealedPairing(db, lang)
  const draw = await startDrawGame(db, ORIGIN, tokenA, pairingId)
  return {
    tokenA,
    tokenB,
    pairingId,
    questionId,
    gameId: draw.game_id,
    roundId: draw.rounds[0]!.id,
    round1: draw.rounds[0]!,
  }
}

const VALID_STROKES = [{ color: '#17191f', width: 4, points: [[20, 20], [180, 180]] }]

describe('Phase 1 quiz publishing, screening gates, and double-blind immutability', () => {
  test('rejects invalid token, duplicate options, and overlong prompt, and rolls back atomically', async () => {
    let failInsert = false
    const db = createSqliteD1({ shouldFailSql: (sql) => failInsert && /INSERT INTO questions/i.test(sql) })

    await assert.rejects(() => publishQuiz(db, ORIGIN, 'knd_nonexistent_token', buildQuestions('bad')), /Invalid agent_token/i)

    const dupOptQuiz = buildQuestions('dup')
    dupOptQuiz[0]!.options.B = dupOptQuiz[0]!.options.A
    await assert.rejects(() => publishQuiz(db, ORIGIN, null, dupOptQuiz), /4 distinct/i)

    const longQuiz = buildQuestions('long')
    longQuiz[0]!.prompt = 'a'.repeat(141)
    await assert.rejects(() => publishQuiz(db, ORIGIN, null, longQuiz), /2 to 140 characters/i)

    failInsert = true
    await assert.rejects(() => publishQuiz(db, ORIGIN, null, buildQuestions('atomic')))
    failInsert = false
    const agentCnt = await db.prepare('SELECT COUNT(*) AS cnt FROM agents').first<{ cnt: number }>()
    const qCnt = await db.prepare('SELECT COUNT(*) AS cnt FROM questions').first<{ cnt: number }>()
    assert.equal(Number(agentCnt?.cnt ?? -1), 0)
    assert.equal(Number(qCnt?.cnt ?? -1), 0)

    const safePlatforms = buildQuestions('chat', 'zh')
    safePlatforms[0]!.options = { A: '微信', B: 'Telegram', C: 'Discord', D: '短信' }
    const pub = await publishQuiz(db, ORIGIN, null, safePlatforms)
    assert.equal(pub.published_count, 4)
  })

  test('enforces blind non-leakage, coverage gate, partial human rejection, agent/human CAS concurrency, and immutability', async () => {
    const SAFE_QUESTION_KEYS = ['dimension', 'id', 'options', 'position', 'prompt', 'starred']
    const dbCov = createSqliteD1()
    const covPending = await setupPendingPairing(dbCov)
    assert.deepEqual(Object.keys(covPending.pairA.questions[0]!).sort(), SAFE_QUESTION_KEYS)

    const revPending = await getPairingReveal(dbCov, ORIGIN, covPending.tokenA, covPending.pairingId)
    assert.equal(revPending.phase, 'pending_agents')
    assert.equal('partner_questions' in revPending, false)

    await assert.rejects(
      () => publishQuiz(dbCov, ORIGIN, covPending.tokenA, buildQuestions('replace-pending')),
      /Cannot replace quiz while active or revealed pairings exist/i,
    )

    await assert.rejects(
      () =>
        submitAgentAnswers(dbCov, covPending.tokenA, covPending.pairingId, [
          { question_id: covPending.pairA.questions[0]!.id, choice: 'A' },
          { question_id: covPending.pairA.questions[0]!.id, choice: 'B' },
        ]),
      /Duplicate question_id/i,
    )
    await assert.rejects(
      () =>
        submitAgentAnswers(dbCov, covPending.tokenA, covPending.pairingId, [
          { question_id: covPending.pairB.questions[0]!.id, choice: 'A' },
        ]),
      /Invalid question_id/i,
    )

    const missA = await submitAgentAnswers(
      dbCov,
      covPending.tokenA,
      covPending.pairingId,
      mapMatchingAnswers(covPending.pairA.questions, covPending.qsB).slice(0, 1),
    )
    assert.equal(missA.agent_score.passed, false)
    assert.equal(missA.agent_score.matched, 1)
    assert.equal(missA.pairing_status, 'pending_agents')
    const covRes = await submitAgentAnswers(
      dbCov,
      covPending.tokenB,
      covPending.pairingId,
      mapMatchingAnswers(covPending.pairB.questions, covPending.qsA, true),
    )
    assert.equal(covRes.agent_score.passed, false)
    assert.equal(covRes.pairing_status, 'rejected')
    const revRejected = await getPairingReveal(dbCov, ORIGIN, covPending.tokenA, covPending.pairingId)
    assert.equal(revRejected.phase, 'rejected')
    assert.equal('partner_questions' in revRejected, false)
    await assert.rejects(
      () => submitHumanAnswers(dbCov, ORIGIN, covPending.tokenA, covPending.pairingId, mapMatchingAnswers(covPending.pairA.questions, covPending.qsB)),
      /has not passed agent screening/i,
    )
    const replacedAfterReject = await publishQuiz(dbCov, ORIGIN, covPending.tokenA, buildQuestions('after-reject'))
    assert.equal(replacedAfterReject.published_count, 4)
    const replacedCount = await dbCov
      .prepare('SELECT COUNT(*) AS cnt FROM questions WHERE agent_id = ?')
      .bind(replacedAfterReject.agent_id)
      .first<{ cnt: number }>()
    assert.equal(Number(replacedCount?.cnt ?? 0), 4)

    const agentBarrier = createBarrier(2)
    const humanBarrier = createBarrier(2)
    let interleaveAgent = false
    let interleaveHuman = false
    const db = createSqliteD1({
      beforeExecuteSql: async (sql, op) => {
        if (interleaveAgent && op === 'batch' && /SET agent_[ab]_submitted_at = \?/i.test(sql)) {
          await agentBarrier()
        }
        if (interleaveHuman && op === 'batch' && /SET human_[ab]_submitted_at = \?/i.test(sql)) {
          await humanBarrier()
        }
      },
    })
    const pending = await setupPendingPairing(db)

    interleaveAgent = true
    const agentRace = await Promise.allSettled([
      submitAgentAnswers(db, pending.tokenA, pending.pairingId, mapMatchingAnswers(pending.pairA.questions, pending.qsB, true)),
      submitAgentAnswers(db, pending.tokenA, pending.pairingId, mapMatchingAnswers(pending.pairA.questions, pending.qsB, true)),
    ])
    interleaveAgent = false
    assert.equal(agentRace.filter((r) => r.status === 'fulfilled').length, 1)
    assert.equal(agentRace.filter((r) => r.status === 'rejected').length, 1)

    const screenB = await submitAgentAnswers(db, pending.tokenB, pending.pairingId, mapMatchingAnswers(pending.pairB.questions, pending.qsA))
    assert.equal(screenB.agent_score.passed, true)
    assert.equal(screenB.pairing_status, 'ready_for_humans')

    const readyInboxA = await getInbox(db, ORIGIN, pending.tokenA)
    const readyQ = readyInboxA.ready_for_human.find((r) => r.pairing_id === pending.pairingId)?.questions?.[0]
    assert.ok(readyQ)
    assert.deepEqual(Object.keys(readyQ).sort(), SAFE_QUESTION_KEYS)

    await assert.rejects(
      () => publishQuiz(db, ORIGIN, pending.tokenA, buildQuestions('replace-ready')),
      /Cannot replace quiz while active or revealed pairings exist/i,
    )
    const outsider = await publishQuiz(db, ORIGIN, null, buildQuestions('outsider-p1'))
    await assert.rejects(
      () => submitAgentAnswers(db, outsider.agent_token, pending.pairingId, mapMatchingAnswers(pending.pairA.questions, pending.qsB)),
      /Not a participant/i,
    )
    await assert.rejects(
      () => submitHumanAnswers(db, ORIGIN, outsider.agent_token, pending.pairingId, mapMatchingAnswers(pending.pairA.questions, pending.qsB)),
      /Not a participant/i,
    )
    await assert.rejects(
      () => postAnchorNote(db, pending.tokenA, pending.pairingId, pending.pairA.questions[0]!.id, 'Too early'),
      /Notes unlock after both humans finish/i,
    )
    await assert.rejects(
      () => startDrawGame(db, ORIGIN, pending.tokenA, pending.pairingId),
      /Complete the Phase 1 double-blind reveal/i,
    )

    const blindA = (await getPairingReveal(db, ORIGIN, pending.tokenA, pending.pairingId)) as {
      phase: string
      partner_questions: typeof pending.pairA.questions
    }
    assert.equal(blindA.phase, 'blind_answering')
    assert.deepEqual(Object.keys(blindA.partner_questions[0]!).sort(), SAFE_QUESTION_KEYS)

    const firstQ = blindA.partner_questions[0]!.id
    await assert.rejects(
      () =>
        submitHumanAnswers(db, ORIGIN, pending.tokenA, pending.pairingId, [
          { question_id: firstQ, choice: 'A' },
          { question_id: firstQ, choice: 'A' },
          { question_id: firstQ, choice: 'A' },
          { question_id: firstQ, choice: 'A' },
        ]),
      /Duplicate question_id/i,
    )
    await assert.rejects(
      () =>
        submitHumanAnswers(
          db,
          ORIGIN,
          pending.tokenA,
          pending.pairingId,
          blindA.partner_questions.map((q) => ({ question_id: q.id, choice: 'U' })),
        ),
      /must choose A, B, C, or D/i,
    )
    await assert.rejects(
      () =>
        submitHumanAnswers(
          db,
          ORIGIN,
          pending.tokenA,
          pending.pairingId,
          pending.pairB.questions.map((q) => ({ question_id: q.id, choice: 'A' })),
        ),
      /must choose A, B, C, or D/i,
    )
    await assert.rejects(
      () =>
        submitHumanAnswers(
          db,
          ORIGIN,
          pending.tokenA,
          pending.pairingId,
          mapMatchingAnswers(blindA.partner_questions, pending.qsB).slice(0, 3),
        ),
      /Expected 4 human answers/i,
    )

    const correctA = mapMatchingAnswers(blindA.partner_questions, pending.qsB, false)
    const wrongA = mapMatchingAnswers(blindA.partner_questions, pending.qsB, true)
    interleaveHuman = true
    const humanRace = await Promise.allSettled([
      submitHumanAnswers(db, ORIGIN, pending.tokenA, pending.pairingId, correctA),
      submitHumanAnswers(db, ORIGIN, pending.tokenA, pending.pairingId, wrongA),
    ])
    interleaveHuman = false
    assert.equal(humanRace.filter((r) => r.status === 'fulfilled').length, 1)
    assert.equal(humanRace.filter((r) => r.status === 'rejected').length, 1)

    const partial = (await getPairingReveal(db, ORIGIN, pending.tokenA, pending.pairingId)) as {
      phase: string
      partner_submitted: boolean
      human_to_human: { self_on_partner: { answered: number }; partner_on_self: null }
      breakdown: Array<{ author: string; author_choice: string }>
    }
    assert.equal(partial.phase, 'partial_reveal')
    assert.equal(partial.partner_submitted, false)
    assert.equal(partial.human_to_human.self_on_partner.answered, 4)
    assert.equal(partial.human_to_human.partner_on_self, null)
    assert.equal(partial.breakdown.length, 4)
    assert.ok(partial.breakdown.every((item) => item.author === 'partner' && Boolean(item.author_choice)))

    const blindB = (await getPairingReveal(db, ORIGIN, pending.tokenB, pending.pairingId)) as {
      partner_questions: typeof pending.pairB.questions
    }
    const revealedB = (await submitHumanAnswers(
      db,
      ORIGIN,
      pending.tokenB,
      pending.pairingId,
      mapMatchingAnswers(blindB.partner_questions, pending.qsA, true),
    )) as { phase: string; human_to_human: { combined_hit_rate: number } }
    assert.equal(revealedB.phase, 'revealed')
    assert.equal(revealedB.human_to_human.combined_hit_rate, 0.5)

    await assert.rejects(
      () => submitHumanAnswers(db, ORIGIN, pending.tokenB, pending.pairingId, mapMatchingAnswers(blindB.partner_questions, pending.qsA, false)),
      /already revealed/i,
    )
    await assert.rejects(
      () => submitAgentAnswers(db, pending.tokenB, pending.pairingId, mapMatchingAnswers(pending.pairB.questions, pending.qsA, true)),
      /no longer accepting/i,
    )
  })

  test('never wedges a pairing on partial write failure and self-heals status on read', async () => {
    let failRevealStmt = false
    const db = createSqliteD1({
      shouldFailSql: (sql) => failRevealStmt && /SET status = 'revealed'/i.test(sql),
    })
    const pending = await setupPendingPairing(db)
    await submitAgentAnswers(db, pending.tokenA, pending.pairingId, mapMatchingAnswers(pending.pairA.questions, pending.qsB))

    const blindA = (await getPairingReveal(db, ORIGIN, pending.tokenA, pending.pairingId)) as {
      partner_questions: typeof pending.pairA.questions
    }
    const blindB = (await getPairingReveal(db, ORIGIN, pending.tokenB, pending.pairingId)) as {
      partner_questions: typeof pending.pairB.questions
    }
    await submitHumanAnswers(db, ORIGIN, pending.tokenA, pending.pairingId, mapMatchingAnswers(blindA.partner_questions, pending.qsB))

    failRevealStmt = true
    await assert.rejects(() =>
      submitHumanAnswers(db, ORIGIN, pending.tokenB, pending.pairingId, mapMatchingAnswers(blindB.partner_questions, pending.qsA)),
    )
    failRevealStmt = false

    const recovered = await submitHumanAnswers(
      db,
      ORIGIN,
      pending.tokenB,
      pending.pairingId,
      mapMatchingAnswers(blindB.partner_questions, pending.qsA),
    )
    assert.equal(recovered.phase, 'revealed')

    await db
      .prepare(`UPDATE pairings SET status = 'ready_for_humans', revealed_at = NULL WHERE id = ?`)
      .bind(pending.pairingId)
      .run()
    const selfHealed = await getPairingReveal(db, ORIGIN, pending.tokenA, pending.pairingId)
    assert.equal(selfHealed.phase, 'revealed')

    await db
      .prepare(`UPDATE pairings SET status = 'ready_for_humans', revealed_at = NULL WHERE id = ?`)
      .bind(pending.pairingId)
      .run()
    const noteHealed = await postAnchorNote(db, pending.tokenA, pending.pairingId, pending.pairA.questions[0]!.id, 'Healed note')
    assert.ok(noteHealed.note_id)

    await db
      .prepare(`UPDATE pairings SET status = 'ready_for_humans', revealed_at = NULL WHERE id = ?`)
      .bind(pending.pairingId)
      .run()
    const drawHealed = await startDrawGame(db, ORIGIN, pending.tokenA, pending.pairingId)
    assert.ok(drawHealed.game_id)

    const dbAgentHeal = createSqliteD1()
    const p2 = await setupPendingPairing(dbAgentHeal)
    await submitAgentAnswers(dbAgentHeal, p2.tokenA, p2.pairingId, mapMatchingAnswers(p2.pairA.questions, p2.qsB))
    await dbAgentHeal
      .prepare(`UPDATE pairings SET status = 'pending_agents' WHERE id = ?`)
      .bind(p2.pairingId)
      .run()
    const inboxHealedA = await getInbox(dbAgentHeal, ORIGIN, p2.tokenA)
    assert.equal(inboxHealedA.ready_for_human.some((item) => item.pairing_id === p2.pairingId), true)

    await dbAgentHeal
      .prepare(`UPDATE pairings SET status = 'pending_agents' WHERE id = ?`)
      .bind(p2.pairingId)
      .run()
    const inboxHealedB = await getInbox(dbAgentHeal, ORIGIN, p2.tokenB)
    assert.equal(inboxHealedB.ready_for_human.some((item) => item.pairing_id === p2.pairingId), true)

    const dbRejectHeal = createSqliteD1()
    const pFail = await setupPendingPairing(dbRejectHeal)
    const wrongA = pFail.pairA.questions.map((q) => ({ question_id: q.id, choice: 'U' as const }))
    const wrongB = pFail.pairB.questions.map((q) => ({ question_id: q.id, choice: 'U' as const }))
    await submitAgentAnswers(dbRejectHeal, pFail.tokenA, pFail.pairingId, wrongA)
    await submitAgentAnswers(dbRejectHeal, pFail.tokenB, pFail.pairingId, wrongB)
    await dbRejectHeal
      .prepare(`UPDATE pairings SET status = 'pending_agents' WHERE id = ?`)
      .bind(pFail.pairingId)
      .run()
    const inboxRejectHeal = await getInbox(dbRejectHeal, ORIGIN, pFail.tokenA)
    assert.equal(inboxRejectHeal.ready_for_human.some((item) => item.pairing_id === pFail.pairingId), false)
    const healedRow = await dbRejectHeal
      .prepare('SELECT status FROM pairings WHERE id = ?')
      .bind(pFail.pairingId)
      .first<{ status: string }>()
    assert.equal(healedRow?.status, 'rejected')
  })

  test('preserves revealed and unanswered pending pairings under >12 rows and enforces deterministic 24h daily caps on both A/B sides', async () => {
    const dbCap = createSqliteD1()
    const seedAgent = async (id: string, rawToken: string) => {
      const pub = await publishQuiz(dbCap, ORIGIN, null, buildQuestions(`seed-${id}`))
      await dbCap.prepare('DELETE FROM pairings').run()
      const now = new Date().toISOString()
      const encoder = new TextEncoder()
      const hashBuf = await crypto.subtle.digest('SHA-256', encoder.encode(rawToken))
      const hashHex = Array.from(new Uint8Array(hashBuf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
      await dbCap
        .prepare('INSERT INTO agents (id, token_hash, quiz_ready, created_at, last_seen_at) VALUES (?, ?, 1, ?, ?)')
        .bind(id, hashHex, now, now)
        .run()
      await dbCap.prepare('UPDATE questions SET agent_id = ? WHERE agent_id = ?').bind(id, pub.agent_id).run()
      await dbCap.prepare('DELETE FROM agents WHERE id = ?').bind(pub.agent_id).run()
    }

    for (let i = 0; i < 6; i++) {
      await seedAgent(`agt_50${i}_mid`, `knd_mid_${i}`)
    }
    await seedAgent('agt_000_low', 'knd_low')
    await seedAgent('agt_zzz_high', 'knd_high')

    await getInbox(dbCap, ORIGIN, 'knd_low')
    const lowAfterFirst = await dbCap
      .prepare('SELECT COUNT(*) AS cnt FROM pairings WHERE agent_a_id = ? OR agent_b_id = ?')
      .bind('agt_000_low', 'agt_000_low')
      .first<{ cnt: number }>()
    assert.equal(Number(lowAfterFirst?.cnt ?? -1), 3)

    await getInbox(dbCap, ORIGIN, 'knd_low')
    const lowAfterRepoll = await dbCap
      .prepare('SELECT COUNT(*) AS cnt FROM pairings WHERE agent_a_id = ? OR agent_b_id = ?')
      .bind('agt_000_low', 'agt_000_low')
      .first<{ cnt: number }>()
    assert.equal(Number(lowAfterRepoll?.cnt ?? -1), 3)

    const aged23h = new Date(Date.now() - 23 * 3_600_000).toISOString()
    await dbCap.prepare('UPDATE pairings SET created_at = ?').bind(aged23h).run()
    await getInbox(dbCap, ORIGIN, 'knd_low')
    const lowAfter23h = await dbCap
      .prepare('SELECT COUNT(*) AS cnt FROM pairings WHERE agent_a_id = ? OR agent_b_id = ?')
      .bind('agt_000_low', 'agt_000_low')
      .first<{ cnt: number }>()
    assert.equal(Number(lowAfter23h?.cnt ?? -1), 3)

    const agedCaller25h = new Date(Date.now() - 25 * 3_600_000).toISOString()
    await dbCap.prepare('UPDATE pairings SET created_at = ?').bind(agedCaller25h).run()
    await getInbox(dbCap, ORIGIN, 'knd_low')
    const lowAfter25h = await dbCap
      .prepare('SELECT COUNT(*) AS cnt FROM pairings WHERE agent_a_id = ? OR agent_b_id = ?')
      .bind('agt_000_low', 'agt_000_low')
      .first<{ cnt: number }>()
    assert.equal(Number(lowAfter25h?.cnt ?? -1), 6)

    await dbCap.prepare('DELETE FROM pairings').run()
    await getInbox(dbCap, ORIGIN, 'knd_high')
    await getInbox(dbCap, ORIGIN, 'knd_high')
    const highCount = await dbCap
      .prepare('SELECT COUNT(*) AS cnt FROM pairings WHERE agent_a_id = ? OR agent_b_id = ?')
      .bind('agt_zzz_high', 'agt_zzz_high')
      .first<{ cnt: number }>()
    assert.equal(Number(highCount?.cnt ?? -1), 3)

    await dbCap.prepare('DELETE FROM pairings').run()
    await dbCap.prepare(`UPDATE agents SET quiz_ready = 0 WHERE id LIKE 'agt_50%_mid'`).run()
    const nowIso = new Date().toISOString()
    for (let i = 0; i < 2; i++) {
      await dbCap
        .prepare(`INSERT INTO pairings (id, agent_a_id, agent_b_id, status, created_at) VALUES (?, ?, ?, 'pending_agents', ?)`)
        .bind(`pr_cand_allow3_${i}`, 'agt_000_low', `agt_50${i}_mid`, nowIso)
        .run()
    }
    await getInbox(dbCap, ORIGIN, 'knd_high')
    const lowAtThird = await dbCap
      .prepare('SELECT COUNT(*) AS cnt FROM pairings WHERE agent_a_id = ? OR agent_b_id = ?')
      .bind('agt_000_low', 'agt_000_low')
      .first<{ cnt: number }>()
    assert.equal(Number(lowAtThird?.cnt ?? -1), 3)

    await dbCap.prepare('DELETE FROM pairings').run()
    for (let i = 0; i < 3; i++) {
      await dbCap
        .prepare(`INSERT INTO pairings (id, agent_a_id, agent_b_id, status, created_at) VALUES (?, ?, ?, 'pending_agents', ?)`)
        .bind(`pr_cand_a_${i}`, 'agt_000_low', `agt_50${i}_mid`, nowIso)
        .run()
    }
    await getInbox(dbCap, ORIGIN, 'knd_high')
    const lowAfterPassive = await dbCap
      .prepare('SELECT COUNT(*) AS cnt FROM pairings WHERE agent_a_id = ? OR agent_b_id = ?')
      .bind('agt_000_low', 'agt_000_low')
      .first<{ cnt: number }>()
    assert.equal(Number(lowAfterPassive?.cnt ?? -1), 3)
    const highZeroWhenMidNotReady = await dbCap
      .prepare('SELECT COUNT(*) AS cnt FROM pairings WHERE agent_a_id = ? OR agent_b_id = ?')
      .bind('agt_zzz_high', 'agt_zzz_high')
      .first<{ cnt: number }>()
    assert.equal(Number(highZeroWhenMidNotReady?.cnt ?? -1), 0)

    await dbCap.prepare('DELETE FROM pairings').run()
    for (let i = 0; i < 3; i++) {
      await dbCap
        .prepare(`INSERT INTO pairings (id, agent_a_id, agent_b_id, status, created_at) VALUES (?, ?, ?, 'pending_agents', ?)`)
        .bind(`pr_cand_b_${i}`, `agt_50${i}_mid`, 'agt_zzz_high', nowIso)
        .run()
    }
    await getInbox(dbCap, ORIGIN, 'knd_low')
    const highAfterPassive = await dbCap
      .prepare('SELECT COUNT(*) AS cnt FROM pairings WHERE agent_a_id = ? OR agent_b_id = ?')
      .bind('agt_zzz_high', 'agt_zzz_high')
      .first<{ cnt: number }>()
    assert.equal(Number(highAfterPassive?.cnt ?? -1), 3)

    const agedCand23h = new Date(Date.now() - 23 * 3_600_000).toISOString()
    await dbCap.prepare('UPDATE pairings SET created_at = ?').bind(agedCand23h).run()
    await getInbox(dbCap, ORIGIN, 'knd_low')
    const highAfter23h = await dbCap
      .prepare('SELECT COUNT(*) AS cnt FROM pairings WHERE agent_a_id = ? OR agent_b_id = ?')
      .bind('agt_zzz_high', 'agt_zzz_high')
      .first<{ cnt: number }>()
    assert.equal(Number(highAfter23h?.cnt ?? -1), 3)

    const agedIso = new Date(Date.now() - 25 * 3_600_000).toISOString()
    await dbCap.prepare('UPDATE pairings SET created_at = ?').bind(agedIso).run()
    await getInbox(dbCap, ORIGIN, 'knd_low')
    const highAfter25h = await dbCap
      .prepare('SELECT COUNT(*) AS cnt FROM pairings WHERE agent_a_id = ? OR agent_b_id = ?')
      .bind('agt_zzz_high', 'agt_zzz_high')
      .first<{ cnt: number }>()
    assert.equal(Number(highAfter25h?.cnt ?? -1), 4)

    const db = createSqliteD1()
    const { tokenA, pairingId } = await setupRevealedPairing(db)
    const inboxInit = await getInbox(db, ORIGIN, tokenA)
    const agentAId = inboxInit.agent_id

    const extraAgents: string[] = []
    for (let i = 0; i < 28; i++) {
      const p = await publishQuiz(db, ORIGIN, null, buildQuestions(`flood-${i}`))
      extraAgents.push(p.agent_id)
    }
    await db.prepare('DELETE FROM pairings WHERE id != ?').bind(pairingId).run()
    const baseMs = Date.now()
    for (let i = 0; i < 14; i++) {
      await db
        .prepare(
          `INSERT INTO pairings (id, agent_a_id, agent_b_id, status, created_at)
           VALUES (?, ?, ?, 'pending_agents', ?)`,
        )
        .bind(`pr_unanswered_flood_${i}`, agentAId, extraAgents[i]!, new Date(baseMs + 1000 + i * 1000).toISOString())
        .run()
    }
    const inboxUnansweredFlood = await getInbox(db, ORIGIN, tokenA)
    assert.equal(inboxUnansweredFlood.pending_quizzes.length, 12)
    assert.equal(inboxUnansweredFlood.revealed_pairings.some((p) => p.pairing_id === pairingId), true)

    await db.prepare(`DELETE FROM pairings WHERE id LIKE 'pr_unanswered_flood_%'`).run()
    const unansweredAId = 'pr_unanswered_as_a'
    await db
      .prepare(`INSERT INTO pairings (id, agent_a_id, agent_b_id, status, created_at) VALUES (?, ?, ?, 'pending_agents', ?)`)
      .bind(unansweredAId, agentAId, extraAgents[0]!, new Date(baseMs + 50_000).toISOString())
      .run()
    for (let i = 1; i <= 13; i++) {
      await db
        .prepare(
          `INSERT INTO pairings (id, agent_a_id, agent_b_id, status, agent_a_submitted_at, created_at)
           VALUES (?, ?, ?, 'pending_agents', ?, ?)`,
        )
        .bind(
          `pr_ans_a_${i}`,
          agentAId,
          extraAgents[i]!,
          new Date(baseMs + 60_000 + i * 1000).toISOString(),
          new Date(baseMs + 60_000 + i * 1000).toISOString(),
        )
        .run()
    }
    const inboxAsA = await getInbox(db, ORIGIN, tokenA)
    assert.equal(inboxAsA.pending_quizzes.some((p) => p.pairing_id === unansweredAId), true)

    await db.prepare(`DELETE FROM pairings WHERE id LIKE 'pr_ans_a_%' OR id = ?`).bind(unansweredAId).run()
    const unansweredBId = 'pr_unanswered_as_b'
    await db
      .prepare(`INSERT INTO pairings (id, agent_a_id, agent_b_id, status, created_at) VALUES (?, ?, ?, 'pending_agents', ?)`)
      .bind(unansweredBId, extraAgents[14]!, agentAId, new Date(baseMs + 90_000).toISOString())
      .run()
    for (let i = 15; i < 28; i++) {
      await db
        .prepare(
          `INSERT INTO pairings (id, agent_a_id, agent_b_id, status, agent_b_submitted_at, created_at)
           VALUES (?, ?, ?, 'pending_agents', ?, ?)`,
        )
        .bind(
          `pr_ans_b_${i}`,
          extraAgents[i]!,
          agentAId,
          new Date(baseMs + 100_000 + i * 1000).toISOString(),
          new Date(baseMs + 100_000 + i * 1000).toISOString(),
        )
        .run()
    }
    const inboxAsB = await getInbox(db, ORIGIN, tokenA)
    assert.equal(inboxAsB.pending_quizzes.some((p) => p.pairing_id === unansweredBId), true)
  })

  test('enforces strict 24h cap and exact created counts under concurrent pool entry, blocks 409 promotion, and guards quiz replacement atomically', async () => {
    const poolBarrier = createBarrier(6)
    let interleavePool = false
    const dbPool = createSqliteD1({
      beforeExecuteSql: async (sql, op) => {
        if (interleavePool && op === 'run' && /INSERT OR IGNORE INTO pairings/i.test(sql)) {
          await poolBarrier()
        }
      },
    })
    const seed = await publishQuiz(dbPool, ORIGIN, null, buildQuestions('pool-seed'))
    const tokens: string[] = [seed.agent_token!]
    for (let i = 0; i < 5; i++) {
      const p = await publishQuiz(dbPool, ORIGIN, null, buildQuestions(`pool-${i}`))
      tokens.push(p.agent_token!)
    }
    await dbPool.prepare('DELETE FROM pairings').run()

    interleavePool = true
    const results = await Promise.all(
      tokens.map((t) => getInbox(dbPool, ORIGIN, t, { maxNew: 3, dailyLimit: 3 })),
    )
    interleavePool = false
    assert.equal(results.length, 6)

    const { results: counts } = await dbPool
      .prepare(
        `SELECT a.id,
          (SELECT COUNT(*) FROM pairings p WHERE p.agent_a_id = a.id OR p.agent_b_id = a.id) AS cnt
         FROM agents a`,
      )
      .all<{ id: string; cnt: number }>()
    for (const row of counts ?? []) {
      assert.ok(Number(row.cnt) <= 3, `Agent ${row.id} exceeded daily cap 3 with ${row.cnt}`)
    }

    const dbCount = createSqliteD1()
    const pub1 = await publishQuiz(dbCount, ORIGIN, null, buildQuestions('cnt-1'))
    const pub2 = await publishQuiz(dbCount, ORIGIN, null, buildQuestions('cnt-2'))
    const pub3 = await publishQuiz(dbCount, ORIGIN, null, buildQuestions('cnt-3'))
    const pub4 = await publishQuiz(dbCount, ORIGIN, null, buildQuestions('cnt-4'))
    const totalReported =
      pub1.new_pairings_created +
      pub2.new_pairings_created +
      pub3.new_pairings_created +
      pub4.new_pairings_created
    const actualRows = await dbCount
      .prepare('SELECT COUNT(*) AS cnt FROM pairings')
      .first<{ cnt: number }>()
    assert.equal(totalReported, Number(actualRows?.cnt ?? -1))

    const submitBarrier = createBarrier(2)
    let interleaveMixed = false
    const dbMixed = createSqliteD1({
      beforeExecuteSql: async (sql, op) => {
        if (interleaveMixed && op === 'batch' && /SET agent_[ab]_submitted_at = \?/i.test(sql)) {
          await submitBarrier()
        }
      },
    })
    const pendingMixed = await setupPendingPairing(dbMixed)
    interleaveMixed = true
    const [missRes, passRes] = await Promise.allSettled([
      submitAgentAnswers(
        dbMixed,
        pendingMixed.tokenA,
        pendingMixed.pairingId,
        mapMatchingAnswers(pendingMixed.pairA.questions, pendingMixed.qsB, true),
      ),
      submitAgentAnswers(
        dbMixed,
        pendingMixed.tokenA,
        pendingMixed.pairingId,
        mapMatchingAnswers(pendingMixed.pairA.questions, pendingMixed.qsB, false),
      ),
    ])
    interleaveMixed = false
    assert.equal(missRes.status, 'fulfilled')
    assert.equal(passRes.status, 'rejected')
    const afterMixed = await dbMixed
      .prepare('SELECT status FROM pairings WHERE id = ?')
      .bind(pendingMixed.pairingId)
      .first<{ status: string }>()
    assert.equal(afterMixed?.status, 'pending_agents')

    let injectBlockingPairing = false
    let injectedAgentId = ''
    let injectedPartnerId = ''
    const dbReplace = createSqliteD1({
      beforeExecuteSql: async (sql, op) => {
        if (injectBlockingPairing && op === 'batch' && /DELETE FROM questions WHERE agent_id = \?/i.test(sql)) {
          injectBlockingPairing = false
          const [aId, bId] =
            injectedAgentId < injectedPartnerId
              ? [injectedAgentId, injectedPartnerId]
              : [injectedPartnerId, injectedAgentId]
          await dbReplace
            .prepare(
              `INSERT INTO pairings (id, agent_a_id, agent_b_id, status, created_at)
               VALUES ('pr_race_block', ?, ?, 'pending_agents', ?)`,
            )
            .bind(aId, bId, new Date().toISOString())
            .run()
        }
      },
    })
    const origA = await publishQuiz(dbReplace, ORIGIN, null, buildQuestions('orig-a'))
    const origB = await publishQuiz(dbReplace, ORIGIN, null, buildQuestions('orig-b'))
    await dbReplace.prepare('DELETE FROM pairings').run()
    const beforeQs = await dbReplace
      .prepare('SELECT id FROM questions WHERE agent_id = ? ORDER BY position ASC')
      .bind(origA.agent_id)
      .all<{ id: string }>()
    injectedAgentId = origA.agent_id
    injectedPartnerId = origB.agent_id
    injectBlockingPairing = true
    await assert.rejects(
      () => publishQuiz(dbReplace, ORIGIN, origA.agent_token, buildQuestions('raced-replace')),
      /Cannot replace quiz while active or revealed pairings exist/i,
    )
    const afterQs = await dbReplace
      .prepare('SELECT id FROM questions WHERE agent_id = ? ORDER BY position ASC')
      .bind(origA.agent_id)
      .all<{ id: string }>()
    assert.deepEqual(
      (afterQs.results ?? []).map((r) => r.id),
      (beforeQs.results ?? []).map((r) => r.id),
    )
  })

  test('enforces participant 403 on reveal/notes/startDraw, protects revealed pairings from republish, validates note ownership, and erases data', async () => {
    const db = createSqliteD1()
    const { tokenA, tokenB, pairingId, questionId } = await setupRevealedPairing(db)

    await postAnchorNote(db, tokenA, pairingId, questionId, 'Exact same evening habit!')

    await assert.rejects(
      () => publishQuiz(db, ORIGIN, tokenB, buildQuestions('replacement')),
      /Cannot replace quiz while active or revealed pairings exist/i,
    )

    const pubC = await publishQuiz(db, ORIGIN, null, buildQuestions('outsider'))
    await assert.rejects(
      () => getPairingReveal(db, ORIGIN, pubC.agent_token, pairingId),
      /Not a participant/i,
    )
    await assert.rejects(
      () => postAnchorNote(db, pubC.agent_token, pairingId, questionId, 'Intruder note'),
      /Not a participant/i,
    )
    await assert.rejects(
      () => startDrawGame(db, ORIGIN, pubC.agent_token, pairingId),
      /Not a participant/i,
    )

    const outsiderQ = await db
      .prepare('SELECT id FROM questions WHERE agent_id = ? LIMIT 1')
      .bind(pubC.agent_id)
      .first<{ id: string }>()
    await assert.rejects(
      () => postAnchorNote(db, tokenA, pairingId, outsiderQ!.id, 'Cross pairing note'),
      /does not belong to this pairing/i,
    )
    await assert.rejects(
      () => postAnchorNote(db, tokenA, pairingId, 'q_nonexistent', 'Missing question'),
      /does not belong to this pairing/i,
    )

    const notesRow = await db.prepare('SELECT COUNT(*) AS cnt FROM anchor_notes WHERE pairing_id = ?').bind(pairingId).first<{ cnt: number }>()
    assert.equal(Number(notesRow?.cnt ?? 0), 1)

    const erased = await eraseAgent(db, tokenA)
    assert.equal(erased.erased, true)
    await assert.rejects(() => getInbox(db, ORIGIN, tokenA), /Invalid or missing agent_token/i)
    const survivingB = await getInbox(db, ORIGIN, tokenB)
    assert.ok(survivingB.agent_id)
    const survivingC = await getInbox(db, ORIGIN, pubC.agent_token)
    assert.equal(survivingC.agent_id, pubC.agent_id)
    const remainingPairings = await db.prepare('SELECT COUNT(*) AS cnt FROM pairings WHERE id = ?').bind(pairingId).first<{ cnt: number }>()
    assert.equal(Number(remainingPairings?.cnt ?? -1), 0)
  })
})

describe('Subtext Draw protocol invariants', () => {
  test('rejects duplicate subtext/decoy strings, overlong words, and overlong notes', async () => {
    const db = createSqliteD1()
    const { tokenA, pairingId, questionId, gameId, roundId } = await setupDrawGame(db)

    await assert.rejects(
      () =>
        pickDrawWord(db, ORIGIN, tokenA, gameId, roundId, 'Waiting for the rain', [
          'Waiting for the rain!',
          'Missing the bus',
          'Checking the weather',
        ]),
      /distinct/i,
    )

    await assert.rejects(
      () =>
        pickDrawWord(
          db,
          ORIGIN,
          tokenA,
          gameId,
          roundId,
          'This subtext is deliberately way longer than forty-eight characters total',
          ['Late office hour', 'Tired eyes', 'Forgot keys'],
        ),
      /word must be 2 to 48 characters/i,
    )

    await assert.rejects(
      () => postAnchorNote(db, tokenA, pairingId, questionId, 'a'.repeat(241)),
      /at most 240 characters/i,
    )
  })

  test('enforces drawer/guesser role auth, hides secrets and promptOptions from guesser, scores different lenses cleanly, and localizes give_up', async () => {
    const db = createSqliteD1()
    const { tokenA, tokenB, gameId, roundId } = await setupDrawGame(db, 'zh')
    const midnightReading = SUBTEXT_PROMPT_POOL[0]!.readings[1]
    const crossingReading = SUBTEXT_PROMPT_POOL[1]!.readings[2]

    const guesserInboxPicking = await getInbox(db, ORIGIN, tokenB)
    assert.equal(guesserInboxPicking.active_draw_turns[0]?.round.promptOptions, undefined)

    await assert.rejects(
      () => pickDrawWord(db, ORIGIN, tokenB, gameId, roundId, midnightReading),
      /Only the drawer/i,
    )

    const picked = await pickDrawWord(db, ORIGIN, tokenA, gameId, roundId, midnightReading)
    const inboxBeforeDraw = await getInbox(db, ORIGIN, tokenB)
    const rBefore = inboxBeforeDraw.active_draw_turns[0]?.round
    assert.equal(rBefore?.subtextOptions, null)
    assert.equal(rBefore?.secretWord, null)
    assert.equal(rBefore?.correctOption, null)
    assert.equal(rBefore?.drawerChoice, null)
    assert.equal(rBefore?.promptOptions, undefined)

    await assert.rejects(
      () => submitDrawing(db, ORIGIN, tokenB, gameId, roundId, VALID_STROKES),
      /Only the drawer/i,
    )

    await submitDrawing(db, ORIGIN, tokenA, gameId, roundId, VALID_STROKES)
    const inboxAfterDraw = await getInbox(db, ORIGIN, tokenB)
    const rAfter = inboxAfterDraw.active_draw_turns[0]?.round
    assert.ok(rAfter?.subtextOptions)
    assert.equal(rAfter?.secretWord, null)
    assert.equal(rAfter?.correctOption, null)
    assert.equal(rAfter?.drawerChoice, null)

    const drawerKey = picked.round!.drawerChoice!
    const otherKey = (['A', 'B', 'C', 'D'] as const).find((k) => k !== drawerKey)!

    await assert.rejects(
      () => guessDrawing(db, ORIGIN, tokenA, gameId, roundId, '', false, undefined, drawerKey),
      /Only the guesser/i,
    )
    await assert.rejects(
      () => guessDrawing(db, ORIGIN, tokenB, gameId, roundId, '', false, 'a'.repeat(25), drawerKey),
      /at most 24 characters/i,
    )

    const diffReveal = await guessDrawing(db, ORIGIN, tokenB, gameId, roundId, '', false, '各看各的风景', otherKey)
    assert.equal(diffReveal.matched, false)
    assert.equal(diffReveal.resonated, false)
    assert.equal(diffReveal.revealed, true)
    assert.equal(diffReveal.chosen_option, otherKey)
    assert.equal(diffReveal.partner_choice, otherKey)
    assert.equal(diffReveal.partner_reading, picked.round!.subtextOptions![otherKey])
    assert.equal(diffReveal.correct_option, drawerKey)
    assert.equal(diffReveal.drawer_choice, drawerKey)
    assert.equal(diffReveal.drawer_reading, midnightReading)
    assert.equal(diffReveal.secret_word, midnightReading)

    const retryReveal = await guessDrawing(db, ORIGIN, tokenB, gameId, roundId, '', false, '各看各的风景', drawerKey)
    assert.equal(retryReveal.matched, false)
    assert.equal(retryReveal.resonated, false)
    assert.equal(retryReveal.chosen_option, otherKey)
    assert.equal(retryReveal.next_round?.id, diffReveal.next_round?.id)

    const round2Id = diffReveal.next_round!.id
    await pickDrawWord(db, ORIGIN, tokenB, gameId, round2Id, crossingReading)
    await submitDrawing(db, ORIGIN, tokenB, gameId, round2Id, VALID_STROKES)
    const skipped = await guessDrawing(db, ORIGIN, tokenA, gameId, round2Id, '跳过', true)
    assert.equal(skipped.matched, false)
    assert.equal(skipped.resonated, false)
    assert.equal(skipped.revealed, true)
    const storedR2 = await db
      .prepare('SELECT last_guess FROM draw_rounds WHERE id = ?')
      .bind(round2Id)
      .first<{ last_guess: string }>()
    assert.equal(storedR2?.last_guess, '（跳过）')
  })

  test('serves locale-matched promptOptions and English skip label for English pairings', async () => {
    const dbEn = createSqliteD1()
    const enGame = await setupDrawGame(dbEn, 'en')
    const enPrompts = enGame.round1.promptOptions ?? []
    assert.equal(enPrompts.length, 3)
    for (const p of enPrompts) {
      assert.equal(p.readings.length, 4)
      for (const reading of p.readings) {
        assert.equal(/[\u4e00-\u9fff]/.test(reading), false, `Expected English reading, got ${reading}`)
      }
    }

    const pickedEn = await pickDrawWord(dbEn, ORIGIN, enGame.tokenA, enGame.gameId, enGame.roundId, enPrompts[0]!.readings[2])
    assert.ok(pickedEn.round?.subtextOptions)
    await submitDrawing(dbEn, ORIGIN, enGame.tokenA, enGame.gameId, enGame.roundId, VALID_STROKES)
    const skippedEn = await guessDrawing(dbEn, ORIGIN, enGame.tokenB, enGame.gameId, enGame.roundId, '', true)
    assert.equal(skippedEn.matched, false)
    assert.equal(skippedEn.resonated, false)
    assert.equal(skippedEn.revealed, true)
    const storedEn = await dbEn
      .prepare('SELECT last_guess FROM draw_rounds WHERE id = ?')
      .bind(enGame.roundId)
      .first<{ last_guess: string }>()
    assert.equal(storedEn?.last_guess, '(skipped)')
    assert.equal(skippedEn.next_round?.roundNumber, 2)
    const round2Prompts = skippedEn.next_round?.promptOptions ?? []
    assert.equal(round2Prompts.length, 3)
    for (const p of round2Prompts) {
      assert.equal(p.readings.length, 4)
      for (const reading of p.readings) {
        assert.equal(/[\u4e00-\u9fff]/.test(reading), false, `Expected English Round 2 reading, got ${reading}`)
      }
    }

    const round2EnId = skippedEn.next_round!.id
    await dbEn
      .prepare(
        `UPDATE draw_rounds
         SET secret_word = 'Midnight breeze', subtext_options_json = NULL, correct_option = NULL,
             svg_markup = '<svg></svg>', status = 'awaiting_guess'
         WHERE id = ?`,
      )
      .bind(round2EnId)
      .run()
    const gaveUpEn = await guessDrawing(dbEn, ORIGIN, enGame.tokenA, enGame.gameId, round2EnId, 'dirty @handle', true)
    assert.equal(gaveUpEn.revealed, true)
    const storedGaveUpEn = await dbEn
      .prepare('SELECT last_guess FROM draw_rounds WHERE id = ?')
      .bind(round2EnId)
      .first<{ last_guess: string }>()
    assert.equal(storedGaveUpEn?.last_guess, '(gave up)')

    const dbZh = createSqliteD1()
    const zhGame = await setupDrawGame(dbZh, 'zh')
    const zhPrompts = zhGame.round1.promptOptions ?? []
    assert.equal(zhPrompts.length, 3)
    assert.equal(zhPrompts[0]!.readings.length, 4)
    assert.equal(/[\u4e00-\u9fff]/.test(zhPrompts[0]!.readings[0]), true)
  })

  test('rolls back round reveal atomically when next-round INSERT fails inside batch', async () => {
    let failInsert = false
    const db = createSqliteD1({ shouldFailSql: (sql) => failInsert && /INSERT INTO draw_rounds/i.test(sql) })
    const { tokenA, tokenB, gameId, roundId } = await setupDrawGame(db, 'zh')
    const picked = await pickDrawWord(db, ORIGIN, tokenA, gameId, roundId, SUBTEXT_PROMPT_POOL[1]!.readings[0])
    await submitDrawing(db, ORIGIN, tokenA, gameId, roundId, VALID_STROKES)

    failInsert = true
    const drawerKey = picked.round!.drawerChoice!
    await assert.rejects(() =>
      guessDrawing(db, ORIGIN, tokenB, gameId, roundId, '', false, undefined, drawerKey),
    )

    const inboxAfterFailure = await getInbox(db, ORIGIN, tokenB)
    assert.equal(inboxAfterFailure.active_draw_turns[0]?.round.status, 'awaiting_guess')

    failInsert = false
    const recovered = await guessDrawing(db, ORIGIN, tokenB, gameId, roundId, '', false, undefined, drawerKey)
    assert.equal(recovered.matched, true)
    assert.equal(recovered.resonated, true)
    assert.equal(recovered.revealed, true)
    assert.equal(recovered.next_round?.roundNumber, 2)
  })

  test('CAS interleaving: overlapping final-round guesses keep first winner and never overwrite verdict', async () => {
    const barrier = createBarrier(2)
    let interleave = false
    const db = createSqliteD1({
      beforeExecuteSql: async (sql, op) => {
        if (interleave && op === 'batch' && /SET guess_attempts =/i.test(sql)) {
          await barrier()
        }
      },
    })
    const { tokenA, tokenB, gameId, roundId } = await setupDrawGame(db, 'zh')
    const picked = await pickDrawWord(db, ORIGIN, tokenA, gameId, roundId, SUBTEXT_PROMPT_POOL[0]!.readings[1])
    await submitDrawing(db, ORIGIN, tokenA, gameId, roundId, VALID_STROKES)
    await db.prepare('UPDATE draw_games SET total_rounds = 1 WHERE id = ?').bind(gameId).run()

    const drawerKey = picked.round!.drawerChoice!
    const otherKey = (['A', 'B', 'C', 'D'] as const).find((k) => k !== drawerKey)!

    interleave = true
    const [first, second] = await Promise.all([
      guessDrawing(db, ORIGIN, tokenB, gameId, roundId, '', false, undefined, drawerKey),
      guessDrawing(db, ORIGIN, tokenB, gameId, roundId, '', false, undefined, otherKey),
    ])
    interleave = false

    assert.equal(first.revealed, true)
    assert.equal(second.revealed, true)
    assert.equal(first.matched, true)
    assert.equal(second.matched, true)
    assert.equal(first.resonated, true)
    assert.equal(second.resonated, true)
    assert.equal(first.chosen_option, drawerKey)
    assert.equal(second.chosen_option, drawerKey)
  })

  test('CAS interleaving: late submitDrawing that passed pre-check cannot reopen a revealed round', async () => {
    let pauseSubmit = false
    let releaseSubmit!: () => void
    let submitPaused!: () => void
    const submitReachedUpdate = new Promise<void>((r) => {
      submitPaused = r
    })
    const allowSubmitUpdate = new Promise<void>((r) => {
      releaseSubmit = r
    })

    const db = createSqliteD1({
      beforeExecuteSql: async (sql, op) => {
        if (pauseSubmit && op === 'run' && /SET svg_markup = \?/i.test(sql)) {
          pauseSubmit = false
          submitPaused()
          await allowSubmitUpdate
        }
      },
    })
    const { tokenA, tokenB, gameId, roundId } = await setupDrawGame(db, 'zh')
    const picked = await pickDrawWord(db, ORIGIN, tokenA, gameId, roundId, SUBTEXT_PROMPT_POOL[0]!.readings[1])
    await submitDrawing(db, ORIGIN, tokenA, gameId, roundId, VALID_STROKES)

    pauseSubmit = true
    const lateRedraw = submitDrawing(db, ORIGIN, tokenA, gameId, roundId, VALID_STROKES)
    await submitReachedUpdate

    const revealed = await guessDrawing(
      db,
      ORIGIN,
      tokenB,
      gameId,
      roundId,
      '',
      false,
      undefined,
      picked.round!.drawerChoice!,
    )
    assert.equal(revealed.revealed, true)

    releaseSubmit()
    await assert.rejects(() => lateRedraw, /no longer accepting/i)

    const row = await db
      .prepare('SELECT status FROM draw_rounds WHERE id = ?')
      .bind(roundId)
      .first<{ status: string }>()
    assert.equal(row?.status, 'revealed')
  })

  test('CAS interleaving: concurrent pickDrawWord calls allow exactly one winner', async () => {
    const barrier = createBarrier(2)
    let interleave = false
    const db = createSqliteD1({
      beforeExecuteSql: async (sql, op) => {
        if (interleave && op === 'run' && /SET secret_word = \?/i.test(sql)) {
          await barrier()
        }
      },
    })
    const { tokenA, gameId, roundId } = await setupDrawGame(db, 'zh')

    interleave = true
    const results = await Promise.allSettled([
      pickDrawWord(db, ORIGIN, tokenA, gameId, roundId, SUBTEXT_PROMPT_POOL[0]!.readings[1]),
      pickDrawWord(db, ORIGIN, tokenA, gameId, roundId, SUBTEXT_PROMPT_POOL[1]!.readings[0]),
    ])
    interleave = false

    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    const rejected = results.filter((r) => r.status === 'rejected')
    assert.equal(fulfilled.length, 1)
    assert.equal(rejected.length, 1)
    assert.match(String((rejected[0] as PromiseRejectedResult).reason), /already picked/i)
  })

  test('starts draw game atomically with zero orphan rows on failure and deduplicates concurrent starts', async () => {
    let failRoundInsert = true
    let interleaveStarts = false
    const startBarrier = createBarrier(2)
    const db = createSqliteD1({
      shouldFailSql: (sql) => failRoundInsert && /INSERT INTO draw_rounds/i.test(sql),
      beforeExecuteSql: async (sql, op) => {
        if (interleaveStarts && op === 'batch' && /INSERT INTO draw_games/i.test(sql)) {
          await startBarrier()
        }
      },
    })
    const { tokenA, tokenB, pairingId } = await setupRevealedPairing(db)

    await assert.rejects(() => startDrawGame(db, ORIGIN, tokenA, pairingId))
    const afterFailure = await db
      .prepare('SELECT COUNT(*) AS cnt FROM draw_games WHERE pairing_id = ?')
      .bind(pairingId)
      .first<{ cnt: number }>()
    assert.equal(Number(afterFailure?.cnt ?? -1), 0)

    failRoundInsert = false
    interleaveStarts = true
    const [startedA, startedB] = await Promise.all([
      startDrawGame(db, ORIGIN, tokenA, pairingId),
      startDrawGame(db, ORIGIN, tokenB, pairingId),
    ])
    interleaveStarts = false

    assert.equal(startedA.game_id, startedB.game_id)
    assert.equal(startedA.rounds.length, 1)
    assert.equal(startedB.rounds.length, 1)
    const gameCount = await db
      .prepare('SELECT COUNT(*) AS cnt FROM draw_games WHERE pairing_id = ?')
      .bind(pairingId)
      .first<{ cnt: number }>()
    assert.equal(Number(gameCount?.cnt ?? -1), 1)

    await db.prepare('DELETE FROM draw_rounds WHERE game_id = ?').bind(startedA.game_id).run()
    const recovered = await startDrawGame(db, ORIGIN, tokenA, pairingId)
    assert.equal(recovered.game_id, startedA.game_id)
    assert.equal(recovered.rounds.length, 1)
  })

  test('auto-upgrades legacy rounds, atomically counts concurrent legacy guesses, and guards length and give_up', async () => {
    const legacyBarrier = createBarrier(3)
    let interleaveLegacy = false
    const db = createSqliteD1({
      beforeExecuteSql: async (sql, op) => {
        if (interleaveLegacy && op === 'run' && /UPDATE draw_rounds\s+SET guess_attempts/i.test(sql)) {
          await legacyBarrier()
        }
      },
    })
    const { tokenA, tokenB, gameId, roundId } = await setupDrawGame(db, 'zh')
    await db
      .prepare('UPDATE draw_rounds SET prompt_options_json = ? WHERE id = ?')
      .bind(JSON.stringify(['戴墨镜的猫', '长翅膀的咖啡杯', '打哈欠的火山']), roundId)
      .run()

    const inbox = await getInbox(db, ORIGIN, tokenA)
    const prompts = inbox.active_draw_turns[0]?.round.promptOptions
    assert.ok(Array.isArray(prompts) && prompts.length === 3)
    assert.equal(typeof prompts[0]?.visualHint, 'string')
    assert.equal(prompts[0]?.readings.length, 4)

    await db
      .prepare('UPDATE draw_rounds SET prompt_options_json = ? WHERE id = ?')
      .bind(
        JSON.stringify([
          { subtext: 'old', visualHint: 'old', surfaceDecoys: ['a', 'b', 'c'] },
        ]),
        roundId,
      )
      .run()
    const inboxFromV1 = await getInbox(db, ORIGIN, tokenA)
    const promptsFromV1 = inboxFromV1.active_draw_turns[0]?.round.promptOptions
    assert.ok(Array.isArray(promptsFromV1) && promptsFromV1.length === 3)
    assert.equal(promptsFromV1[0]?.readings.length, 4)

    await db
      .prepare(
        `UPDATE draw_rounds
         SET secret_word = '海边电车', subtext_options_json = NULL, correct_option = NULL,
             svg_markup = '<svg></svg>', status = 'awaiting_guess'
         WHERE id = ?`,
      )
      .bind(roundId)
      .run()

    const guesserInbox = await getInbox(db, ORIGIN, tokenB)
    assert.equal(guesserInbox.active_draw_turns[0]?.round.guessMode, 'legacy_free_text')

    await assert.rejects(
      () => guessDrawing(db, ORIGIN, tokenB, gameId, roundId, 'a'.repeat(41), false),
      /at most 40 characters/i,
    )

    interleaveLegacy = true
    const legacyRace = await Promise.all([
      guessDrawing(db, ORIGIN, tokenB, gameId, roundId, '咖啡', false),
      guessDrawing(db, ORIGIN, tokenB, gameId, roundId, '月亮', false),
      guessDrawing(db, ORIGIN, tokenB, gameId, roundId, '雨伞', false),
    ])
    interleaveLegacy = false
    assert.ok(legacyRace.some((r) => r.revealed))
    const finalLegacy = await db
      .prepare('SELECT guess_attempts, status FROM draw_rounds WHERE id = ?')
      .bind(roundId)
      .first<{ guess_attempts: number; status: string }>()
    assert.equal(finalLegacy?.guess_attempts, 3)
    assert.equal(finalLegacy?.status, 'revealed')

    const round2Id = legacyRace.find((r) => r.next_round)?.next_round?.id
    assert.ok(round2Id)
    await db
      .prepare(
        `UPDATE draw_rounds
         SET secret_word = '晚风', subtext_options_json = NULL, correct_option = NULL,
             svg_markup = '<svg></svg>', status = 'awaiting_guess'
         WHERE id = ?`,
      )
      .bind(round2Id)
      .run()
    const gaveUp = await guessDrawing(db, ORIGIN, tokenA, gameId, round2Id!, '加微信号:kindred_99', true)
    assert.equal(gaveUp.revealed, true)
    assert.equal(gaveUp.matched, false)
    const stored = await db
      .prepare('SELECT last_guess FROM draw_rounds WHERE id = ?')
      .bind(round2Id)
      .first<{ last_guess: string }>()
    assert.equal(stored?.last_guess, '（放弃）')
  })

  test('built-in ZH and EN subtext templates satisfy the live pickDrawWord contract and protocol SVG compiles', async () => {
    const svg = renderElevatorProtocolSvg()
    assert.ok(svg.startsWith('<svg '))
    assert.equal(svg.includes('<script'), false)
    assert.equal(svg.includes('<text'), false)

    for (const [locale, pool] of [
      ['zh', SUBTEXT_PROMPT_POOL.slice(0, 3)],
      ['en', SUBTEXT_PROMPT_POOL_EN.slice(0, 3)],
    ] as const) {
      for (const template of pool) {
        const db = createSqliteD1()
        const { tokenA, gameId, roundId } = await setupDrawGame(db, locale)
        const drawerReading = template.readings[1]
        const resAuto = await pickDrawWord(db, ORIGIN, tokenA, gameId, roundId, drawerReading)
        assert.ok(resAuto.round?.subtextOptions)
        assert.equal(new Set(Object.values(resAuto.round!.subtextOptions!)).size, 4)
        for (const opt of template.readings) {
          assert.ok(Object.values(resAuto.round!.subtextOptions!).includes(opt))
        }

        const dbExplicit = createSqliteD1()
        const g2 = await setupDrawGame(dbExplicit, locale)
        const peerReadings = template.readings.filter((r) => r !== drawerReading)
        const resExplicit = await pickDrawWord(dbExplicit, ORIGIN, g2.tokenA, g2.gameId, g2.roundId, drawerReading, peerReadings)
        assert.ok(resExplicit.round?.subtextOptions)
      }
    }
  })
})
