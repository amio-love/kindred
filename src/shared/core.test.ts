import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { isCorrectGuess, strokesToStaticSvg, validateStrokes } from './drawing'
import { scanPii } from './pii'
import {
  buildAgentSyncReport,
  evaluateDirection,
  passesAgentMatchGate,
  shuffleQuestionOptions,
} from './quiz'
import type { StoredQuestion } from './types'

describe('PII boundary scanner', () => {
  test('blocks emails, phones, URLs, China IDs, and social handles', () => {
    assert.equal(scanPii('联系我 alice@example.com').clean, false)
    assert.equal(scanPii('电话 13800138000').clean, false)
    assert.equal(scanPii('主页 https://example.org/me').clean, false)
    assert.equal(scanPii('身份证 110101199001011234').clean, false)
    assert.equal(scanPii('加我微信：my_handle_99').clean, false)
  })

  test('allows specific non-identifying personal tastes and habits', () => {
    const res = scanPii('挑一款新的洗发水时，先翻背面逐项查配方成分表，避开硅油和植物油。')
    assert.equal(res.clean, true)
  })
})

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
    const goodPartner = evaluateDirection(questions, [
      { questionId: 'q_1', choice: 'A' },
      { questionId: 'q_2', choice: 'A' },
      { questionId: 'q_3', choice: 'A' },
      { questionId: 'q_4', choice: 'B' },
      { questionId: 'q_5', choice: 'U' },
      { questionId: 'q_6', choice: 'U' },
    ])

    assert.equal(highAbstain.hitRate, 1)
    assert.equal(passesAgentMatchGate(highAbstain, goodPartner), false)
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

  test('matches normalized Chinese and English guesses', () => {
    assert.equal(isCorrectGuess('戴墨镜的猫', '  戴墨镜的猫！ '), true)
    assert.equal(isCorrectGuess('长翅膀的咖啡杯', '长翅膀的咖啡'), true)
    assert.equal(isCorrectGuess('戴墨镜的猫', '猫'), false)
  })
})
