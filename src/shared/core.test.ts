import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  buildShuffledSubtextOptions,
  isCorrectGuess,
  strokesToStaticSvg,
  validateStrokes,
} from './drawing'
import { scanPii, scanPiiFields } from './pii'
import {
  buildAgentSyncReport,
  evaluateDirection,
  passesAgentMatchGate,
  shuffleQuestionOptions,
} from './quiz'
import type { StoredQuestion } from './types'

describe('PII boundary scanner', () => {
  test('blocks emails, phones, international/spaced/fullwidth numbers, bare domains, QQ, and social handles', () => {
    const blocked = [
      '联系我 alice@example.com',
      '电话 13800138000',
      '电话 138 0013 8000',
      '电话 +8613800138000',
      '电话 138\u200b0013\u200b8000',
      '手机 １３８００１３８０００',
      'whatsapp +447911123456',
      'call +1 415-555-0199',
      'text 415-555-0199',
      'call (415) 555-0199',
      '主页 https://example.org/me',
      '看看我的站点 kindred.dev/profile',
      '频道 t.me/alice/',
      '身份证 110101199001011234',
      '加我微信：my_handle_99',
      '我的微信号是kindred_99',
      '加微信号:kindred_99',
      '加微信 kindred_99',
      '加我微信kindred_99',
      '加v：kindred99',
      '加V kindred99',
      'weixin: kindred99',
      'wx: my_id_01',
      'wx kindred_99',
      'line id alice_99',
      '小红书: kind_99',
      'QQ 123456789',
      'find me @kindred_qa_99',
      'tg: @kindred_bot',
      'ins: quiet_reader',
    ]
    for (const sample of blocked) {
      assert.equal(scanPii(sample).clean, false, `Expected PII block on: ${sample}`)
    }
  })

  test('allows ordinary Chinese and English tastes without false positives on substrings, media terms, years, or separate fields', () => {
    const allowed = [
      '挑一款新的洗发水时，先翻背面逐项查配方成分表，避开硅油和植物油。',
      '睡前刷小红书看露营攻略，但从不发帖。',
      '睡前会刷小红书 vlog 吗？',
      '周末拍一条抖音vlog记录城市散步。',
      '微信2024年度报告里全是深夜群聊。',
      '微信 2024年度报告里全是深夜群聊。',
      'Do you miss Twitter 2012 vibes?',
      'Instagram: never',
      'I prefer ASP.NET over legacy scripts.',
      'Walking 200 300 4000 steps after dinner.',
      'I would rather read instead of sleeping early.',
      'Revenge insomnia and midnight playlists.',
      'Instant click when someone shares quiet insight.',
      'Inspired by trains in the rain and late-night vitamins.',
      'Mortgages, insurance, and scrolling Instagram before bed.',
      'Waiting in line for coffee when phone signal: weak.',
    ]
    for (const sample of allowed) {
      assert.equal(scanPii(sample).clean, true, `Unexpected PII false positive on: ${sample}`)
    }
    assert.equal(scanPiiFields(['聊天工具', '平时最常用哪个？', '微信', 'Telegram', 'Discord', '短信']).clean, true)
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

  test('shuffles 1 true subtext with 3 surface literal decoys into varying keys while preserving all texts', () => {
    const trueSubtext = '舍不得今天结束的报复性熬夜'
    const decoys = ['半夜还在赶方案加班', '忘了关电脑就睡着了', '晚上喝太多茶失眠了'] as const

    const first = buildShuffledSubtextOptions(trueSubtext, decoys, () => 0)
    const second = buildShuffledSubtextOptions(trueSubtext, decoys, () => 0.99)

    assert.equal(first.options[first.correctOption], trueSubtext)
    assert.equal(second.options[second.correctOption], trueSubtext)
    assert.notEqual(first.correctOption, second.correctOption)

    for (const result of [first, second]) {
      const values = new Set(Object.values(result.options))
      assert.equal(values.size, 4)
      assert.ok(values.has(trueSubtext))
      for (const decoy of decoys) {
        assert.ok(values.has(decoy))
      }
    }
  })

  test('matches normalized Chinese and English guesses', () => {
    assert.equal(isCorrectGuess('湘北平交道的那个夏天', '  湘北平交道的那个夏天！ '), true)
    assert.equal(isCorrectGuess('舍不得今天结束的报复性熬夜', '舍不得今天结束的报复性熬夜'), true)
    assert.equal(isCorrectGuess('湘北平交道的那个夏天', '夏天'), false)
  })
})
