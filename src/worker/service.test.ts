import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { COPY } from '../client/i18n'
import { renderElevatorProtocolSvg } from '../shared/sampleSketch'
import {
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

async function setupRevealedPairing(db: D1Database, lang: 'en' | 'zh' = 'en') {
  const qsA = buildQuestions('alpha', lang)
  const qsB = buildQuestions('beta', lang)
  const pubA = await publishQuiz(db, ORIGIN, null, qsA)
  const pubB = await publishQuiz(db, ORIGIN, null, qsB)
  const inboxA = await getInbox(db, ORIGIN, pubA.agent_token)
  const inboxB = await getInbox(db, ORIGIN, pubB.agent_token)
  const pairA = inboxA.pending_quizzes[0]!
  const pairB = inboxB.pending_quizzes[0]!
  const mapAnswers = (qs: typeof pairA.questions, src: typeof qsA) =>
    qs.map((q) => {
      const orig = src.find((s) => s.prompt === q.prompt)!
      const key = Object.entries(q.options).find(([, v]) => v === orig.options.A)![0]
      return { question_id: q.id, choice: key }
    })
  await submitAgentAnswers(db, pubA.agent_token, pairA.pairing_id, mapAnswers(pairA.questions, qsB))
  await submitAgentAnswers(db, pubB.agent_token, pairB.pairing_id, mapAnswers(pairB.questions, qsA))
  const revA = await getPairingReveal(db, ORIGIN, pubA.agent_token, pairA.pairing_id)
  const revB = await getPairingReveal(db, ORIGIN, pubB.agent_token, pairB.pairing_id)
  await submitHumanAnswers(
    db,
    ORIGIN,
    pubA.agent_token,
    pairA.pairing_id,
    mapAnswers((revA as { partner_questions: typeof pairA.questions }).partner_questions, qsB),
  )
  await submitHumanAnswers(
    db,
    ORIGIN,
    pubB.agent_token,
    pairB.pairing_id,
    mapAnswers((revB as { partner_questions: typeof pairA.questions }).partner_questions, qsA),
  )
  return {
    tokenA: pubA.agent_token,
    tokenB: pubB.agent_token,
    pairingId: pairA.pairing_id,
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

  test('serves locale-matched promptOptions for English and Chinese drawers and auto-fills English templates', async () => {
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
    const revealedEn = await guessDrawing(
      dbEn,
      ORIGIN,
      enGame.tokenB,
      enGame.gameId,
      enGame.roundId,
      '',
      false,
      'Instant insight!',
      pickedEn.round!.correctOption!,
    )
    assert.equal(revealedEn.matched, true)
    assert.equal(revealedEn.next_round?.roundNumber, 2)
    const round2Prompts = revealedEn.next_round?.promptOptions ?? []
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

  test('hides subtextOptions from guesser until drawing is submitted and blocks PII in reaction', async () => {
    const db = createSqliteD1()
    const { tokenA, tokenB, gameId, roundId } = await setupDrawGame(db, 'zh')

    const picked = await pickDrawWord(db, ORIGIN, tokenA, gameId, roundId, '舍不得今天结束的报复性熬夜')
    const inboxBeforeDraw = await getInbox(db, ORIGIN, tokenB)
    assert.equal(inboxBeforeDraw.active_draw_turns[0]?.round.subtextOptions, null)

    await submitDrawing(db, ORIGIN, tokenA, gameId, roundId, VALID_STROKES)
    const inboxAfterDraw = await getInbox(db, ORIGIN, tokenB)
    assert.ok(inboxAfterDraw.active_draw_turns[0]?.round.subtextOptions)

    const correctKey = picked.round!.correctOption!
    await assert.rejects(
      () => guessDrawing(db, ORIGIN, tokenB, gameId, roundId, '', false, 'a@b.co', correctKey),
      /PII/i,
    )

    const firstReveal = await guessDrawing(db, ORIGIN, tokenB, gameId, roundId, '', false, '太懂了', correctKey)
    assert.equal(firstReveal.matched, true)
    assert.equal(firstReveal.revealed, true)

    const retryReveal = await guessDrawing(db, ORIGIN, tokenB, gameId, roundId, '', false, '太懂了', correctKey)
    assert.equal(retryReveal.matched, true)
    assert.equal(retryReveal.revealed, true)
    assert.equal(retryReveal.next_round?.id, firstReveal.next_round?.id)
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
        if (interleave && op === 'batch' && /SET guess_attempts = \?/i.test(sql)) {
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

  test('auto-upgrades legacy picking_word rounds and guards PII, length, and give_up sanitization in legacy free-text guesses', async () => {
    const db = createSqliteD1()
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

    const gaveUp = await guessDrawing(db, ORIGIN, tokenB, gameId, roundId, '加微信号:kindred_99', true)
    assert.equal(gaveUp.revealed, true)
    assert.equal(gaveUp.matched, false)

    const stored = await db
      .prepare('SELECT last_guess FROM draw_rounds WHERE id = ?')
      .bind(roundId)
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
