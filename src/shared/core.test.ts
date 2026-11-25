import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { scanPii } from './pii'
import {
  buildAgentSyncReport,
  evaluateDirection,
  passesPoolGate,
  shuffleQuestionOptions,
} from './quiz'
import { isCorrectGuess, validateStrokes } from './drawing'
import type { StoredQuestion } from './types'

function makeQuestion(id: string, ownerChoice: 'A' | 'B' | 'C' | 'D', starred = false): StoredQuestion {
  return {
    id,
    ownerId: 'u1',
    position: 1,
    dimension: '生活习惯',
    prompt: `Question ${id}`,
    options: { A: 'optA', B: 'optB', C: 'optC', D: 'optD' },
    ownerChoice,
    agentPredicted: ownerChoice,
    confidence: 'high',
    memoryBasis: null,
    starred,
    approved: true,
  }
}

describe('PII boundary scanner', () => {
  test('blocks emails, phones, URLs, China IDs, and social handles', () => {
    assert.equal(scanPii('联系我 alice@example.com').clean, false)
    assert.equal(scanPii('电话 13812345678').clean, false)
    assert.equal(scanPii('微信: my_wechat_99').clean, false)
    assert.equal(scanPii('https://example.com/me').clean, false)
    assert.equal(scanPii('11010519900307123X').clean, false)
  })

  test('allows specific non-identifying personal tastes and habits', () => {
    const res = scanPii('买洗发水先翻背面看成分表，手机23:30放卧室外面')
    assert.equal(res.clean, true)
    assert.equal(res.findings.length, 0)
  })
})

describe('Option shuffling and paired matching gate', () => {
  test('remaps ownerChoice and agentPredicted to the exact same option text after shuffle', () => {
    const options = { A: 'Alpha', B: 'Beta', C: 'Gamma', D: 'Delta' }
    let seed = 0.27
    const deterministic = () => {
      seed = (seed * 9301 + 49297) % 233280
      return seed / 233280
    }
    const result = shuffleQuestionOptions(options, 'A', 'A', deterministic)
    assert.equal(result.options[result.ownerChoice], 'Alpha')
    assert.equal(result.agentPredicted, result.ownerChoice)
    assert.deepEqual(Object.values(result.options).sort(), ['Alpha', 'Beta', 'Delta', 'Gamma'])
  })

  test('rejects high-abstention lucky guesses under paired coverage and hit-rate gate', () => {
    const qs = [
      makeQuestion('q1', 'B'),
      makeQuestion('q2', 'C'),
      makeQuestion('q3', 'D'),
      makeQuestion('q4', 'A'),
    ]
    const luckySparse = evaluateDirection(qs, [
      { questionId: 'q1', choice: 'B' },
      { questionId: 'q2', choice: 'U' },
      { questionId: 'q3', choice: 'U' },
      { questionId: 'q4', choice: 'U' },
    ])
    const solidMatch = evaluateDirection(qs, [
      { questionId: 'q1', choice: 'B' },
      { questionId: 'q2', choice: 'C' },
      { questionId: 'q3', choice: 'D' },
      { questionId: 'q4', choice: 'U' },
    ])
    assert.equal(luckySparse.hitRate, 1)
    assert.equal(luckySparse.coverage, 0.25)
    assert.equal(passesPoolGate(luckySparse, solidMatch), false)
    assert.equal(passesPoolGate(solidMatch, solidMatch), true)
  })

  test('builds Human-to-Own-Agent sync report excluding U abstentions and listing mismatches', () => {
    const qs = [makeQuestion('q1', 'B'), makeQuestion('q2', 'C'), makeQuestion('q3', 'D')]
    const report = buildAgentSyncReport(
      qs,
      [
        { questionId: 'q1', choice: 'B' },
        { questionId: 'q2', choice: 'A' },
        { questionId: 'q3', choice: 'D' },
      ],
      [
        { questionId: 'q1', choice: 'B', reason: 'matched' },
        { questionId: 'q2', choice: 'C', reason: 'guessed wrong' },
        { questionId: 'q3', choice: 'U', reason: 'no memory' },
      ],
    )
    assert.equal(report.comparableCount, 2)
    assert.equal(report.abstainedCount, 1)
    assert.equal(report.matchedCount, 1)
    assert.equal(report.syncRate, 0.5)
    assert.equal(report.mismatches.length, 1)
    assert.equal(report.mismatches[0]?.questionId, 'q2')
    assert.match(report.calibrationPrompt ?? '', /optC/)
    assert.match(report.calibrationPrompt ?? '', /optA/)
  })
})

describe('Agent-drawn stroke boundary validation and guess matching', () => {
  test('rejects invalid stroke structures and clamps out-of-bounds coordinates', () => {
    assert.equal(validateStrokes([]).ok, false)
    assert.equal(validateStrokes([{ color: '#000000', width: 4, points: [[10, 10]] }]).ok, false)
    assert.equal(
      validateStrokes([{ color: '#000000', width: 4, points: [[Number.NaN, 10], [20, 20]] }]).ok,
      false,
    )

    const valid = validateStrokes([
      { color: 'javascript:alert(1)', width: 99, points: [[-50, 500], [120.45, 200.12]] },
    ])
    assert.equal(valid.ok, true)
    if (valid.ok) {
      assert.equal(valid.strokes[0]?.color, '#1F1D1A')
      assert.equal(valid.strokes[0]?.width, 24)
      assert.deepEqual(valid.strokes[0]?.points, [
        [0, 400],
        [120.5, 200.1],
      ])
    }
  })

  test('matches normalized Chinese and English guesses', () => {
    assert.equal(isCorrectGuess('戴墨镜的猫', ' 戴墨镜的猫！ '), true)
    assert.equal(isCorrectGuess('戴墨镜的猫', '长翅膀的咖啡杯'), false)
  })
})
