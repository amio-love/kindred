import type {
  AgentSyncMismatch,
  AgentSyncReport,
  AnswerRecord,
  DirectionMetrics,
  OptionKey,
  OptionMap,
  QuestionRevealItem,
  StoredQuestion,
} from './types'

export const OPTION_KEYS: readonly OptionKey[] = ['A', 'B', 'C', 'D']

export const POOL_MIN_COVERAGE = 0.5
export const POOL_MIN_HIT_RATE = 0.5

export function shuffleQuestionOptions(
  options: OptionMap,
  ownerChoice: OptionKey,
  agentPredicted?: OptionKey,
  randomSource?: () => number,
): {
  options: OptionMap
  ownerChoice: OptionKey
  agentPredicted: OptionKey | null
} {
  const nextFloat =
    randomSource ??
    (() => {
      const buf = new Uint32Array(1)
      crypto.getRandomValues(buf)
      return (buf[0] ?? 0) / 0x100000000
    })

  const order: OptionKey[] = ['A', 'B', 'C', 'D']
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(nextFloat() * (i + 1))
    const current = order[i]!
    order[i] = order[j]!
    order[j] = current
  }

  const shuffled: OptionMap = {
    A: options[order[0]!],
    B: options[order[1]!],
    C: options[order[2]!],
    D: options[order[3]!],
  }

  const remap = (oldKey: OptionKey): OptionKey => {
    const newIndex = order.indexOf(oldKey)
    return OPTION_KEYS[newIndex] ?? 'A'
  }

  return {
    options: shuffled,
    ownerChoice: remap(ownerChoice),
    agentPredicted: agentPredicted ? remap(agentPredicted) : null,
  }
}

export function evaluateDirection(
  questions: readonly StoredQuestion[],
  answers: readonly AnswerRecord[],
): DirectionMetrics {
  const byQuestion = new Map(answers.map((answer) => [answer.questionId, answer]))
  let answered = 0
  let abstained = 0
  let matched = 0
  let starredMissed = 0

  for (const question of questions) {
    const answer = byQuestion.get(question.id)
    if (!answer || answer.choice === 'U') {
      abstained++
      continue
    }
    answered++
    if (answer.choice === question.ownerChoice) {
      matched++
    } else if (question.starred) {
      starredMissed++
    }
  }

  const total = questions.length
  return {
    total,
    answered,
    abstained,
    coverage: total > 0 ? answered / total : 0,
    matched,
    hitRate: answered > 0 ? matched / answered : 0,
    starredMissed,
  }
}

export function passesPoolGate(aOnB: DirectionMetrics, bOnA: DirectionMetrics): boolean {
  return (
    aOnB.coverage >= POOL_MIN_COVERAGE &&
    bOnA.coverage >= POOL_MIN_COVERAGE &&
    aOnB.hitRate >= POOL_MIN_HIT_RATE &&
    bOnA.hitRate >= POOL_MIN_HIT_RATE
  )
}

export function buildAgentSyncReport(
  questions: readonly StoredQuestion[],
  humanAnswers: readonly AnswerRecord[],
  agentAnswers: readonly AnswerRecord[],
): AgentSyncReport {
  const humanMap = new Map(humanAnswers.map((item) => [item.questionId, item]))
  const agentMap = new Map(agentAnswers.map((item) => [item.questionId, item]))
  const mismatches: AgentSyncMismatch[] = []
  let comparableCount = 0
  let abstainedCount = 0
  let matchedCount = 0

  for (const question of questions) {
    const human = humanMap.get(question.id)
    const agent = agentMap.get(question.id)
    if (!human || human.choice === 'U') continue
    if (!agent || agent.choice === 'U') {
      abstainedCount++
      continue
    }
    comparableCount++
    if (agent.choice === human.choice) {
      matchedCount++
    } else {
      mismatches.push({
        questionId: question.id,
        prompt: question.prompt,
        agentChoice: agent.choice,
        agentOptionText: question.options[agent.choice],
        humanChoice: human.choice,
        humanOptionText: question.options[human.choice],
        agentReason: agent.reason ?? null,
      })
    }
  }

  const syncRate = comparableCount > 0 ? matchedCount / comparableCount : null
  const calibrationPrompt =
    mismatches.length > 0
      ? [
          '刚才在 Kindred 的双盲题库里，有几道题你替我猜偏了，请更新你对我的记忆：',
          ...mismatches.map(
            (item, index) =>
              `${index + 1}. 题目「${item.prompt}」：你猜我会选「${item.agentOptionText}」，其实我本人会选「${item.humanOptionText}」。`,
          ),
        ].join('\n')
      : null

  return {
    comparableCount,
    abstainedCount,
    matchedCount,
    syncRate,
    mismatches,
    calibrationPrompt,
  }
}

export function buildRevealItems(
  questions: readonly StoredQuestion[],
  quizOwnerSide: 'self' | 'partner',
  humanAnswers: readonly AnswerRecord[],
  agentAnswers: readonly AnswerRecord[],
  exposeAgentReason: boolean,
): QuestionRevealItem[] {
  const humanMap = new Map(humanAnswers.map((item) => [item.questionId, item]))
  const agentMap = new Map(agentAnswers.map((item) => [item.questionId, item]))

  return questions.map((question) => {
    const human = humanMap.get(question.id)
    const agent = agentMap.get(question.id)
    const humanChoice = human && human.choice !== 'U' ? human.choice : null
    const agentChoice = agent ? agent.choice : null
    const agentAgreedWithHuman =
      humanChoice && agentChoice && agentChoice !== 'U' ? agentChoice === humanChoice : null

    return {
      questionId: question.id,
      quizOwnerSide,
      dimension: question.dimension,
      prompt: question.prompt,
      options: question.options,
      starred: question.starred,
      authorChoice: question.ownerChoice,
      respondentHumanChoice: humanChoice,
      respondentAgentChoice: agentChoice,
      respondentAgentReason: exposeAgentReason ? (agent?.reason ?? null) : null,
      humanMatched: humanChoice === question.ownerChoice,
      agentAgreedWithHuman,
    }
  })
}
