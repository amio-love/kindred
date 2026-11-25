import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { COPY } from '../client/i18n'
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
  const { tokenA, tokenB, pairingId, qsA, qsB, pairA, pairB } = await setupPendingPairing(db, lang)
  await submitAgentAnswers(db, tokenA, pairingId, mapMatchingAnswers(pairA.questions, qsB))
  await submitAgentAnswers(db, tokenB, pairingId, mapMatchingAnswers(pairB.questions, qsA))
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
  test('validates PII per field (including options), rejects invalid token/duplicates/overlong prompt, and rolls back atomically', async () => {
    let failInsert = false
    const db = createSqliteD1({ shouldFailSql: (sql) => failInsert && /INSERT INTO questions/i.test(sql) })

    await assert.rejects(() => publishQuiz(db, ORIGIN, 'knd_nonexistent_token', buildQuestions('bad')), /Invalid agent_token/i)

    const piiPrompt = buildQuestions('pii', 'zh')
    piiPrompt[0]!.prompt = '我的微信号是kindred_99，聊聊？'
    await assert.rejects(() => publishQuiz(db, ORIGIN, null, piiPrompt), /PII/i)

    const piiOption = buildQuestions('piiopt', 'en')
    piiOption[0]!.options.B = 'my telegram is alice_99'
    await assert.rejects(() => publishQuiz(db, ORIGIN, null, piiOption), /PII/i)

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
    const dbCov = createSqliteD1()
    const covPending = await setupPendingPairing(dbCov)
    assert.equal('ownerChoice' in covPending.pairA.questions[0]!, false)
    assert.equal('owner_choice' in covPending.pairA.questions[0]!, false)

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

    await submitAgentAnswers(
      dbCov,
      covPending.tokenA,
      covPending.pairingId,
      mapMatchingAnswers(covPending.pairA.questions, covPending.qsB).slice(0, 1),
    )
    const covRes = await submitAgentAnswers(
      dbCov,
      covPending.tokenB,
      covPending.pairingId,
      mapMatchingAnswers(covPending.pairB.questions, covPending.qsA),
    )
    assert.equal(covRes.pairing_status, 'rejected')
    await assert.rejects(
      () => submitHumanAnswers(dbCov, ORIGIN, covPending.tokenA, covPending.pairingId, mapMatchingAnswers(covPending.pairA.questions, covPending.qsB)),
      /has not passed agent screening/i,
    )
    const replacedAfterReject = await publishQuiz(dbCov, ORIGIN, covPending.tokenA, buildQuestions('after-reject'))
    assert.equal(replacedAfterReject.published_count, 4)

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
      submitAgentAnswers(db, pending.tokenA, pending.pairingId, mapMatchingAnswers(pending.pairA.questions, pending.qsB, false)),
      submitAgentAnswers(db, pending.tokenA, pending.pairingId, mapMatchingAnswers(pending.pairA.questions, pending.qsB, true)),
    ])
    interleaveAgent = false
    assert.equal(agentRace.filter((r) => r.status === 'fulfilled').length, 1)
    assert.equal(agentRace.filter((r) => r.status === 'rejected').length, 1)

    const screenB = await submitAgentAnswers(db, pending.tokenB, pending.pairingId, mapMatchingAnswers(pending.pairB.questions, pending.qsA))
    assert.equal(screenB.pairing_status, 'ready_for_humans')

    await assert.rejects(
      () => publishQuiz(db, ORIGIN, pending.tokenA, buildQuestions('replace-ready')),
      /Cannot replace quiz while active or revealed pairings exist/i,
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
    assert.equal('ownerChoice' in blindA.partner_questions[0]!, false)
    assert.equal('owner_choice' in blindA.partner_questions[0]!, false)

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

    const waiting = await getPairingReveal(db, ORIGIN, pending.tokenA, pending.pairingId)
    assert.equal(waiting.phase, 'waiting_partner')
    assert.equal('breakdown' in waiting, false)
    assert.equal('human_to_human' in waiting, false)

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
    await submitAgentAnswers(db, pending.tokenB, pending.pairingId, mapMatchingAnswers(pending.pairB.questions, pending.qsA))

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

    const dbAgentHeal = createSqliteD1()
    const p2 = await setupPendingPairing(dbAgentHeal)
    await submitAgentAnswers(dbAgentHeal, p2.tokenA, p2.pairingId, mapMatchingAnswers(p2.pairA.questions, p2.qsB))
    await submitAgentAnswers(dbAgentHeal, p2.tokenB, p2.pairingId, mapMatchingAnswers(p2.pairB.questions, p2.qsA))
    await dbAgentHeal
      .prepare(`UPDATE pairings SET status = 'pending_agents' WHERE id = ?`)
      .bind(p2.pairingId)
      .run()
    const inboxHealed = await getInbox(dbAgentHeal, ORIGIN, p2.tokenA)
    assert.equal(inboxHealed.ready_for_human.some((item) => item.pairing_id === p2.pairingId), true)
  })

  test('preserves revealed pairings under passive spam and enforces daily pairing cap on both caller and candidate', async () => {
    const db = createSqliteD1()
    const { tokenA, pairingId } = await setupRevealedPairing(db)

    for (let i = 0; i < 13; i++) {
      await publishQuiz(db, ORIGIN, null, buildQuestions(`spam-${i}`))
    }

    const inboxA = await getInbox(db, ORIGIN, tokenA)
    assert.equal(inboxA.revealed_pairings.some((p) => p.pairing_id === pairingId), true)

    const totalForA = await db
      .prepare(
        `SELECT COUNT(*) AS cnt FROM pairings
         WHERE agent_a_id = ? OR agent_b_id = ?`,
      )
      .bind(inboxA.agent_id, inboxA.agent_id)
      .first<{ cnt: number }>()
    assert.ok(Number(totalForA?.cnt ?? 99) <= 3, `Expected passive cap <= 3, got ${totalForA?.cnt}`)
  })

  test('enforces participant 403 on reveal/notes, protects revealed pairings from republish, validates note ownership, and erases data', async () => {
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
    const remainingPairings = await db.prepare('SELECT COUNT(*) AS cnt FROM pairings WHERE id = ?').bind(pairingId).first<{ cnt: number }>()
    assert.equal(Number(remainingPairings?.cnt ?? -1), 0)
  })
})

describe('Subtext Draw protocol invariants', () => {
  test('rejects duplicate subtext/decoy strings, overlong words, and PII across subtext, decoys, and notes', async () => {
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
      () =>
        pickDrawWord(db, ORIGIN, tokenA, gameId, roundId, '加微信号:kindred_99', [
          'Late office hour',
          'Tired eyes',
          'Forgot keys',
        ]),
      /PII/i,
    )

    await assert.rejects(
      () =>
        pickDrawWord(db, ORIGIN, tokenA, gameId, roundId, 'Quiet evening commute', [
          'find me @kindred_99',
          'Tired eyes',
          'Forgot keys',
        ]),
      /PII/i,
    )

    await assert.rejects(
      () => postAnchorNote(db, tokenA, pairingId, questionId, '加微信号:kindred_99 聊聊'),
      /PII/i,
    )
  })

  test('enforces drawer/guesser role auth, hides secrets and promptOptions from guesser, scores wrong picks false, and localizes give_up', async () => {
    const db = createSqliteD1()
    const { tokenA, tokenB, gameId, roundId } = await setupDrawGame(db, 'zh')

    const guesserInboxPicking = await getInbox(db, ORIGIN, tokenB)
    assert.equal(guesserInboxPicking.active_draw_turns[0]?.round.promptOptions, undefined)

    await assert.rejects(
      () => pickDrawWord(db, ORIGIN, tokenB, gameId, roundId, '舍不得今天结束的报复性熬夜'),
      /Only the drawer/i,
    )

    const picked = await pickDrawWord(db, ORIGIN, tokenA, gameId, roundId, '舍不得今天结束的报复性熬夜')
    const inboxBeforeDraw = await getInbox(db, ORIGIN, tokenB)
    const rBefore = inboxBeforeDraw.active_draw_turns[0]?.round
    assert.equal(rBefore?.subtextOptions, null)
    assert.equal(rBefore?.secretWord, null)
    assert.equal(rBefore?.correctOption, null)
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

    const correctKey = picked.round!.correctOption!
    const wrongKey = (['A', 'B', 'C', 'D'] as const).find((k) => k !== correctKey)!

    await assert.rejects(
      () => guessDrawing(db, ORIGIN, tokenA, gameId, roundId, '', false, undefined, correctKey),
      /Only the guesser/i,
    )
    await assert.rejects(
      () => guessDrawing(db, ORIGIN, tokenB, gameId, roundId, '', false, 'a@b.co', correctKey),
      /PII/i,
    )

    const wrongReveal = await guessDrawing(db, ORIGIN, tokenB, gameId, roundId, '', false, '猜偏了', wrongKey)
    assert.equal(wrongReveal.matched, false)
    assert.equal(wrongReveal.revealed, true)
    assert.equal(wrongReveal.chosen_option, wrongKey)
    assert.equal(wrongReveal.correct_option, correctKey)
    assert.equal(wrongReveal.secret_word, '舍不得今天结束的报复性熬夜')

    const retryReveal = await guessDrawing(db, ORIGIN, tokenB, gameId, roundId, '', false, '猜偏了', correctKey)
    assert.equal(retryReveal.matched, false)
    assert.equal(retryReveal.chosen_option, wrongKey)
    assert.equal(retryReveal.next_round?.id, wrongReveal.next_round?.id)

    const round2Id = wrongReveal.next_round!.id
    await pickDrawWord(db, ORIGIN, tokenB, gameId, round2Id, '湘北平交道的那个夏天')
    await submitDrawing(db, ORIGIN, tokenB, gameId, round2Id, VALID_STROKES)
    const skipped = await guessDrawing(db, ORIGIN, tokenA, gameId, round2Id, '加微信号:kindred_99', true)
    assert.equal(skipped.matched, false)
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
      assert.equal(/[\u4e00-\u9fff]/.test(p.subtext), false, `Expected English subtext, got ${p.subtext}`)
      assert.equal(p.surfaceDecoys.length, 3)
    }

    const pickedEn = await pickDrawWord(dbEn, ORIGIN, enGame.tokenA, enGame.gameId, enGame.roundId, enPrompts[0]!.subtext)
    assert.ok(pickedEn.round?.subtextOptions)
    await submitDrawing(dbEn, ORIGIN, enGame.tokenA, enGame.gameId, enGame.roundId, VALID_STROKES)
    const skippedEn = await guessDrawing(dbEn, ORIGIN, enGame.tokenB, enGame.gameId, enGame.roundId, '', true)
    assert.equal(skippedEn.matched, false)
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
      assert.equal(/[\u4e00-\u9fff]/.test(p.subtext), false, `Expected English Round 2 subtext, got ${p.subtext}`)
    }

    const dbZh = createSqliteD1()
    const zhGame = await setupDrawGame(dbZh, 'zh')
    const zhPrompts = zhGame.round1.promptOptions ?? []
    assert.equal(zhPrompts.length, 3)
    assert.equal(/[\u4e00-\u9fff]/.test(zhPrompts[0]!.subtext), true)
  })

  test('rolls back round reveal atomically when next-round INSERT fails inside batch', async () => {
    let failInsert = false
    const db = createSqliteD1({ shouldFailSql: (sql) => failInsert && /INSERT INTO draw_rounds/i.test(sql) })
    const { tokenA, tokenB, gameId, roundId } = await setupDrawGame(db, 'zh')
    const picked = await pickDrawWord(db, ORIGIN, tokenA, gameId, roundId, '湘北平交道的那个夏天')
    await submitDrawing(db, ORIGIN, tokenA, gameId, roundId, VALID_STROKES)

    failInsert = true
    const correctKey = picked.round!.correctOption!
    await assert.rejects(() =>
      guessDrawing(db, ORIGIN, tokenB, gameId, roundId, '', false, undefined, correctKey),
    )

    const inboxAfterFailure = await getInbox(db, ORIGIN, tokenB)
    assert.equal(inboxAfterFailure.active_draw_turns[0]?.round.status, 'awaiting_guess')

    failInsert = false
    const recovered = await guessDrawing(db, ORIGIN, tokenB, gameId, roundId, '', false, undefined, correctKey)
    assert.equal(recovered.matched, true)
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
    const picked = await pickDrawWord(db, ORIGIN, tokenA, gameId, roundId, '舍不得今天结束的报复性熬夜')
    await submitDrawing(db, ORIGIN, tokenA, gameId, roundId, VALID_STROKES)
    await db.prepare('UPDATE draw_games SET total_rounds = 1 WHERE id = ?').bind(gameId).run()

    const correctKey = picked.round!.correctOption!
    const wrongKey = (['A', 'B', 'C', 'D'] as const).find((k) => k !== correctKey)!

    interleave = true
    const [first, second] = await Promise.all([
      guessDrawing(db, ORIGIN, tokenB, gameId, roundId, '', false, undefined, correctKey),
      guessDrawing(db, ORIGIN, tokenB, gameId, roundId, '', false, undefined, wrongKey),
    ])
    interleave = false

    assert.equal(first.revealed, true)
    assert.equal(second.revealed, true)
    assert.equal(first.matched, true)
    assert.equal(second.matched, true)
    assert.equal(first.chosen_option, correctKey)
    assert.equal(second.chosen_option, correctKey)
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
    const picked = await pickDrawWord(db, ORIGIN, tokenA, gameId, roundId, '舍不得今天结束的报复性熬夜')
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
      picked.round!.correctOption!,
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
      pickDrawWord(db, ORIGIN, tokenA, gameId, roundId, '舍不得今天结束的报复性熬夜'),
      pickDrawWord(db, ORIGIN, tokenA, gameId, roundId, '湘北平交道的那个夏天'),
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

  test('auto-upgrades legacy rounds, atomically counts concurrent legacy guesses, and guards PII/length/give_up', async () => {
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
    assert.equal(typeof prompts[0]?.subtext, 'string')
    assert.equal(prompts[0]?.surfaceDecoys.length, 3)

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
      () => guessDrawing(db, ORIGIN, tokenB, gameId, roundId, '联系 alice@example.com', false),
      /PII/i,
    )
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

  test('every landing-page ZH and EN gallery card satisfies the live pickDrawWord contract and protocol SVG compiles', async () => {
    const svg = renderElevatorProtocolSvg()
    assert.ok(svg.startsWith('<svg '))
    assert.equal(svg.includes('<script'), false)
    assert.equal(svg.includes('<text'), false)

    for (const locale of ['zh', 'en'] as const) {
      for (const card of COPY[locale].subtextCards) {
        const db = createSqliteD1()
        const { tokenA, gameId, roundId } = await setupDrawGame(db, locale)
        const trueSubtext = card.options[card.correctIndex]
        const decoys = card.options.filter((_, idx) => idx !== card.correctIndex)
        const res = await pickDrawWord(db, ORIGIN, tokenA, gameId, roundId, trueSubtext, decoys)
        assert.ok(res.round?.subtextOptions)
      }
    }
  })
})
