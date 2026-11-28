import type {
  AgentSyncMismatch,
  AgentSyncReport,
  AnswerEntry,
  DirectionScore,
  OptionKey,
  QuestionOptions,
  StoredQuestion,
} from './types'

export const OPTION_KEYS: readonly OptionKey[] = ['A', 'B', 'C', 'D']

export const MATCH_GATE = {
  minCoverage: 0.5,
  minHitRate: 0.55,
  minNormalizedLift: 0.4,
  minAnswered: 2,
} as const

export function isOptionKey(value: unknown): value is OptionKey {
  return value === 'A' || value === 'B' || value === 'C' || value === 'D'
}

export function isAnswerChoice(value: unknown): value is OptionKey | 'U' {
  return isOptionKey(value) || value === 'U'
}

export function getOptionKeys(options: QuestionOptions): OptionKey[] {
  return OPTION_KEYS.filter((key) => {
    const val = options[key]
    return typeof val === 'string' && val.trim().length > 0
  })
}

export function isValidChoiceForQuestion(options: QuestionOptions, value: unknown): value is OptionKey {
  if (!isOptionKey(value)) return false
  const val = options[value]
  return typeof val === 'string' && val.trim().length > 0
}

export function shuffleQuestionOptions(
  options: QuestionOptions,
  ownerChoice: OptionKey,
  agentPredicted: OptionKey = ownerChoice,
  rng: () => number = Math.random,
): {
  options: QuestionOptions
  ownerChoice: OptionKey
  agentPredicted: OptionKey
} {
  const presentKeys = getOptionKeys(options)
  const entries: Array<{ oldKey: OptionKey; text: string }> = presentKeys.map((key) => ({
    oldKey: key,
    text: (options[key] ?? '').trim(),
  }))

  for (let i = entries.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = entries[i]!
    entries[i] = entries[j]!
    entries[j] = tmp
  }

  const nextOptions = {} as Record<OptionKey, string>
  let nextOwner: OptionKey = 'A'
  let nextPredicted: OptionKey = 'A'

  presentKeys.forEach((newKey, idx) => {
    const item = entries[idx]!
    nextOptions[newKey] = item.text
    if (item.oldKey === ownerChoice) nextOwner = newKey
    if (item.oldKey === agentPredicted) nextPredicted = newKey
  })

  return {
    options: nextOptions as QuestionOptions,
    ownerChoice: nextOwner,
    agentPredicted: nextPredicted,
  }
}

export function evaluateDirection(
  questions: readonly StoredQuestion[],
  answers: readonly AnswerEntry[],
): DirectionScore {
  const byId = new Map(answers.map((a) => [a.questionId, a]))
  const total = questions.length
  let answered = 0
  let abstained = 0
  let matched = 0
  let chanceSum = 0

  for (const q of questions) {
    const ans = byId.get(q.id)
    if (!ans || ans.choice === 'U') {
      abstained += 1
      continue
    }
    const optionCount = Math.max(2, getOptionKeys(q.options).length)
    chanceSum += 1 / optionCount
    answered += 1
    if (ans.choice === q.ownerChoice) {
      matched += 1
    }
  }

  const coverage = total > 0 ? answered / total : 0
  const hitRate = answered > 0 ? matched / answered : null
  const chanceBaseline = answered > 0 ? chanceSum / answered : 0.25
  const requiredHitRate = chanceBaseline + MATCH_GATE.minNormalizedLift * (1 - chanceBaseline)
  const normalizedLift =
    hitRate !== null && chanceBaseline < 1 ? (hitRate - chanceBaseline) / (1 - chanceBaseline) : null

  return {
    total,
    answered,
    abstained,
    matched,
    coverage,
    hitRate,
    chanceBaseline,
    requiredHitRate,
    normalizedLift,
  }
}

export function passesSingleDirectionGate(dir: DirectionScore): boolean {
  return (
    dir.total > 0 &&
    dir.answered >= Math.min(MATCH_GATE.minAnswered, dir.total) &&
    dir.coverage >= MATCH_GATE.minCoverage &&
    dir.hitRate !== null &&
    dir.normalizedLift !== null &&
    dir.normalizedLift + 1e-9 >= MATCH_GATE.minNormalizedLift
  )
}

export function passesAgentMatchGate(dirA: DirectionScore, dirB: DirectionScore): boolean {
  return passesSingleDirectionGate(dirA) || passesSingleDirectionGate(dirB)
}

export function buildAgentSyncReport(
  questions: readonly StoredQuestion[],
  humanAnswers: readonly AnswerEntry[],
  agentAnswers: readonly AnswerEntry[],
): AgentSyncReport {
  const humanById = new Map(humanAnswers.map((a) => [a.questionId, a]))
  const agentById = new Map(agentAnswers.map((a) => [a.questionId, a]))

  let comparableCount = 0
  let abstainedCount = 0
  let matchedCount = 0
  const mismatches: AgentSyncMismatch[] = []

  for (const q of questions) {
    const human = humanById.get(q.id)
    const agent = agentById.get(q.id)
    if (!human || human.choice === 'U') continue
    if (!agent || agent.choice === 'U') {
      abstainedCount += 1
      continue
    }
    comparableCount += 1
    if (agent.choice === human.choice) {
      matchedCount += 1
    } else {
      mismatches.push({
        questionId: q.id,
        prompt: q.prompt,
        agentChoice: agent.choice,
        agentChoiceText: q.options[agent.choice] ?? agent.choice,
        humanChoice: human.choice,
        humanChoiceText: q.options[human.choice] ?? human.choice,
      })
    }
  }

  const syncRate = comparableCount > 0 ? matchedCount / comparableCount : null

  let calibrationNote: string | null = null
  if (mismatches.length > 0) {
    const isEnglish = !/[\u4e00-\u9fff]/.test(questions.map((q) => q.prompt).join(' '))
    if (isEnglish) {
      const lines = mismatches.map(
        (m, i) =>
          `${i + 1}. "${m.prompt}": your AI guessed "${m.agentChoiceText}", you picked "${m.humanChoiceText}"`,
      )
      const countLabel = mismatches.length === 1 ? '1 question' : `${mismatches.length} questions`
      calibrationNote = `Your AI missed ${countLabel} compared to your real picks — worth updating its memory of you:\n${lines.join('\n')}`
    } else {
      const lines = mismatches.map(
        (m, i) =>
          `${i + 1}. 题目「${m.prompt}」：Agent 猜「${m.agentChoiceText}」，真人亲选「${m.humanChoiceText}」`,
      )
      calibrationNote = `以下 ${mismatches.length} 题与主人的真实选择存在偏差，可顺手更新你对主人的记忆：\n${lines.join('\n')}`
    }
  }

  return {
    comparableCount,
    abstainedCount,
    matchedCount,
    syncRate,
    mismatches,
    calibrationNote,
  }
}
