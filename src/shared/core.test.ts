import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  SUBTEXT_PROMPT_POOL,
  SUBTEXT_PROMPT_POOL_EN,
  buildShuffledSubtextOptions,
  findSubtextTemplate,
  isCorrectGuess,
  pickRoundPrompts,
  strokesToStaticSvg,
  validateStrokes,
} from './drawing'
import {
  buildAgentSyncReport,
  evaluateDirection,
  passesAgentMatchGate,
  passesSingleDirectionGate,
  shuffleQuestionOptions,
} from './quiz'
import { QUIZ_SCENARIO_SEEDS, sampleQuizSeeds } from './quizSeeds'
import type { StoredQuestion } from './types'

describe('Option shuffling and paired matching gate', () => {
  test('remaps ownerChoice and agentPredicted to the exact same option text after shuffle', () => {
    const original = {
      A: '放卧室外面',
      B: '放床头柜静音',
      C: '放枕边刷手机',
      D: '塞进包里',
    }
    const shuffled = shuffleQuestionOptions(original, 'A', 'B', () => 0.37)
    assert.equal(shuffled.options[shuffled.ownerChoice], '放卧室外面')
    assert.equal(shuffled.options[shuffled.agentPredicted], '放床头柜静音')
    assert.equal(new Set(Object.values(shuffled.options)).size, 4)
  })

  test('rejects high-abstention lucky guesses under paired coverage and hit-rate gate', () => {
    const questions: StoredQuestion[] = [1, 2, 3, 4, 5, 6].map((n) => ({
      id: `q_${n}`,
      position: n,
      dimension: '习惯',
      prompt: `Q${n}`,
      options: { A: '1', B: '2', C: '3', D: '4' },
      ownerChoice: 'A',
      agentPredicted: 'A',
      confidence: 'high',
      starred: false,
    }))

    const highAbstain = evaluateDirection(questions, [
      { questionId: 'q_1', choice: 'A' },
      { questionId: 'q_2', choice: 'U' },
      { questionId: 'q_3', choice: 'U' },
      { questionId: 'q_4', choice: 'U' },
      { questionId: 'q_5', choice: 'U' },
      { questionId: 'q_6', choice: 'U' },
    ])
    const lowCoverage = evaluateDirection(questions, [
      { questionId: 'q_1', choice: 'A' },
      { questionId: 'q_2', choice: 'A' },
      { questionId: 'q_3', choice: 'U' },
      { questionId: 'q_4', choice: 'U' },
      { questionId: 'q_5', choice: 'U' },
      { questionId: 'q_6', choice: 'U' },
    ])
    const lowHitRate = evaluateDirection(questions, [
      { questionId: 'q_1', choice: 'A' },
      { questionId: 'q_2', choice: 'A' },
      { questionId: 'q_3', choice: 'B' },
      { questionId: 'q_4', choice: 'B' },
      { questionId: 'q_5', choice: 'U' },
      { questionId: 'q_6', choice: 'U' },
    ])
    const goodPartner = evaluateDirection(questions, [
      { questionId: 'q_1', choice: 'A' },
      { questionId: 'q_2', choice: 'A' },
      { questionId: 'q_3', choice: 'A' },
      { questionId: 'q_4', choice: 'B' },
      { questionId: 'q_5', choice: 'U' },
      { questionId: 'q_6', choice: 'U' },
    ])

    assert.equal(highAbstain.hitRate, 1)
    assert.equal(passesSingleDirectionGate(highAbstain), false)
    assert.equal(lowCoverage.answered, 2)
    assert.equal(lowCoverage.hitRate, 1)
    assert.equal(passesSingleDirectionGate(lowCoverage), false)
    assert.equal(lowHitRate.coverage >= 0.5, true)
    assert.equal(lowHitRate.hitRate, 0.5)
    assert.equal(passesSingleDirectionGate(lowHitRate), false)
    assert.equal(passesSingleDirectionGate(goodPartner), true)
    assert.equal(passesAgentMatchGate(highAbstain, lowHitRate), false)
    assert.equal(passesAgentMatchGate(lowCoverage, lowHitRate), false)
    assert.equal(passesAgentMatchGate(highAbstain, goodPartner), true)
    assert.equal(passesAgentMatchGate(goodPartner, lowHitRate), true)
    assert.equal(passesAgentMatchGate(goodPartner, goodPartner), true)
  })

  test('builds Human-to-Own-Agent sync report excluding U abstentions and listing mismatches', () => {
    const questions: StoredQuestion[] = [
      {
        id: 'q_1',
        position: 1,
        dimension: '习惯',
        prompt: '夜宵怎么选？',
        options: { A: '煮面', B: '便利店', C: '烧烤', D: '不吃' },
        ownerChoice: 'B',
        agentPredicted: 'B',
        confidence: 'high',
        starred: false,
      },
      {
        id: 'q_2',
        position: 2,
        dimension: '审美',
        prompt: '听老歌怎么听？',
        options: { A: '转发', B: '单曲循环', C: '当背景', D: '挖乐评' },
        ownerChoice: 'D',
        agentPredicted: 'D',
        confidence: 'medium',
        starred: false,
      },
      {
        id: 'q_3',
        position: 3,
        dimension: '决策',
        prompt: '工具变复杂怎么办？',
        options: { A: '换更简的', B: '忍着用', C: '看教程', D: '自己写' },
        ownerChoice: 'A',
        agentPredicted: 'A',
        confidence: 'high',
        starred: true,
      },
    ]

    const report = buildAgentSyncReport(
      questions,
      [
        { questionId: 'q_1', choice: 'B' },
        { questionId: 'q_2', choice: 'D' },
        { questionId: 'q_3', choice: 'A' },
      ],
      [
        { questionId: 'q_1', choice: 'A' },
        { questionId: 'q_2', choice: 'U' },
        { questionId: 'q_3', choice: 'A' },
      ],
    )

    assert.equal(report.comparableCount, 2)
    assert.equal(report.abstainedCount, 1)
    assert.equal(report.matchedCount, 1)
    assert.equal(report.syncRate, 0.5)
    assert.equal(report.mismatches.length, 1)
    assert.equal(report.mismatches[0]?.questionId, 'q_1')
    assert.ok(report.calibrationNote?.includes('便利店'))
    assert.ok(report.calibrationNote?.includes('主人的真实选择'))
    assert.equal(report.calibrationNote?.includes('与你的真实选择'), false)

    const enQuestions: StoredQuestion[] = [
      {
        id: 'eq_1',
        position: 1,
        dimension: 'Habits',
        prompt: 'Late-night snack choice?',
        options: { A: 'Ramen', B: 'Tea', C: 'Toast', D: 'Nothing' },
        ownerChoice: 'B',
        agentPredicted: 'B',
        confidence: 'high',
        starred: false,
      },
    ]
    const enReport = buildAgentSyncReport(
      enQuestions,
      [{ questionId: 'eq_1', choice: 'B' }],
      [{ questionId: 'eq_1', choice: 'A' }],
    )
    assert.ok(enReport.calibrationNote)
    assert.equal(/[\u4e00-\u9fff]/.test(enReport.calibrationNote), false)
    assert.ok(enReport.calibrationNote.includes('Tea'))
  })
})

describe('Static SVG drawing compiler and guess matching', () => {
  test('validates bounds and compiles sanitized static SVG with zero script or text tags', () => {
    const bad = validateStrokes([{ color: '#000000', width: 4, points: [[10, 10]] }])
    assert.equal(bad.ok, false)

    const good = validateStrokes([
      { color: 'javascript:alert(1)', width: 99, points: [[-50, 500], [200, 180]] },
    ])
    assert.equal(good.ok, true)
    if (good.ok) {
      assert.equal(good.strokes[0]?.color, '#1F1D1A')
      assert.equal(good.strokes[0]?.width, 24)
      assert.deepEqual(good.strokes[0]?.points[0], [0, 400])

      const svg = strokesToStaticSvg(good.strokes)
      assert.ok(svg.startsWith('<svg '))
      assert.ok(svg.includes('<polyline '))
      assert.equal(svg.includes('<script'), false)
      assert.equal(svg.includes('<text'), false)
    }
  })

  test('shuffles 4 peer readings into varying keys while preserving drawer reading and auto-fills any reading from built-in templates', () => {
    const template = SUBTEXT_PROMPT_POOL[0]!
    const drawerReading = template.readings[1]
    const peers = [template.readings[0], template.readings[2], template.readings[3]] as const

    const first = buildShuffledSubtextOptions(drawerReading, peers, () => 0)
    const second = buildShuffledSubtextOptions(drawerReading, peers, () => 0.99)

    assert.equal(first.options[first.correctOption], drawerReading)
    assert.equal(second.options[second.correctOption], drawerReading)
    assert.notEqual(first.correctOption, second.correctOption)

    for (const result of [first, second]) {
      const values = new Set(Object.values(result.options))
      assert.equal(values.size, 4)
      assert.ok(values.has(drawerReading))
      for (const peer of peers) {
        assert.ok(values.has(peer))
      }
    }

    for (const pool of [SUBTEXT_PROMPT_POOL, SUBTEXT_PROMPT_POOL_EN]) {
      assert.equal(pool.length, 12)
      for (const item of pool) {
        assert.equal(item.readings.length, 4)
        for (const reading of item.readings) {
          assert.ok(reading.length >= 2 && reading.length <= 48, `Out-of-bounds reading: ${reading}`)
          const found = findSubtextTemplate(reading)
          assert.ok(found, `Expected template lookup for: ${reading}`)
          assert.equal(found.peerReadings.length, 3)
          assert.equal(found.peerReadings.includes(reading), false)
        }
      }
    }

    const round2 = pickRoundPrompts([SUBTEXT_PROMPT_POOL[0]!.readings[2]], 0, 'zh')
    assert.equal(round2.length, 3)
    assert.equal(
      round2.some((t) => t.readings.includes(SUBTEXT_PROMPT_POOL[0]!.readings[2])),
      false,
    )
  })

  test('matches normalized Chinese and English guesses', () => {
    assert.equal(isCorrectGuess('灌篮高手：电车开过去，湘北的夏天就结束了', '  灌篮高手：电车开过去，湘北的夏天就结束了！ '), true)
    assert.equal(isCorrectGuess('舍不得今天结束，宁愿把深夜浪费在空白里', '舍不得今天结束，宁愿把深夜浪费在空白里'), true)
    assert.equal(isCorrectGuess('灌篮高手：电车开过去，湘北的夏天就结束了', '夏天'), false)
  })
})

describe('Rotating scenario seed pool', () => {
  test('samples distinct lenses with complete bilingual fields across the pool', () => {
    const lenses = new Set(QUIZ_SCENARIO_SEEDS.map((s) => s.lens))
    assert.equal(lenses.size, 8)
    for (const seed of QUIZ_SCENARIO_SEEDS) {
      assert.ok(seed.lens.trim().length > 0 && seed.lensZh.trim().length > 0)
      assert.ok(seed.angleEn.trim().length > 10 && seed.angleZh.trim().length > 6)
    }
    const sampled = sampleQuizSeeds(8, () => 0.42)
    assert.equal(sampled.length, 8)
    assert.equal(new Set(sampled.map((s) => s.lens)).size, 8)
  })
})
