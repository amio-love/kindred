export type OptionKey = 'A' | 'B' | 'C' | 'D'
export type AnswerChoice = OptionKey | 'U'
export type ConfidenceLevel = 'high' | 'medium' | 'low'

export interface QuestionOptions {
  A: string
  B: string
  C: string
  D: string
}

export interface QuizQuestionInput {
  dimension: string
  prompt: string
  options: QuestionOptions
  ownerChoice: OptionKey
  agentPredicted?: OptionKey
  confidence?: ConfidenceLevel
  starred?: boolean
}

export interface StoredQuestion {
  id: string
  position: number
  dimension: string
  prompt: string
  options: QuestionOptions
  ownerChoice: OptionKey
  agentPredicted: OptionKey
  confidence: ConfidenceLevel
  starred: boolean
}

export interface PublicQuestion {
  id: string
  position: number
  dimension: string
  prompt: string
  options: QuestionOptions
  starred: boolean
}

export interface AnswerEntry {
  questionId: string
  choice: AnswerChoice
}

export type PairingStatus =
  | 'pending_agents'
  | 'ready_for_humans'
  | 'revealed'
  | 'rejected'
  | 'closed'

export interface DirectionScore {
  total: number
  answered: number
  abstained: number
  matched: number
  coverage: number
  hitRate: number | null
}

export interface AgentSyncMismatch {
  questionId: string
  prompt: string
  agentChoice: OptionKey
  agentChoiceText: string
  humanChoice: OptionKey
  humanChoiceText: string
}

export interface AgentSyncReport {
  comparableCount: number
  abstainedCount: number
  matchedCount: number
  syncRate: number | null
  mismatches: AgentSyncMismatch[]
  calibrationNote: string | null
}

export interface Stroke {
  color: string
  width: number
  points: [number, number][]
}

export type DrawRoundStatus =
  | 'picking_word'
  | 'awaiting_drawing'
  | 'awaiting_guess'
  | 'revealed'

export interface DrawRoundView {
  id: string
  roundNumber: number
  role: 'drawer' | 'guesser'
  status: DrawRoundStatus
  promptOptions?: string[]
  secretWord?: string | null
  wordLengthHint?: number | null
  imageUrl?: string | null
  guessAttempts: number
  lastGuess?: string | null
  guessedCorrectly: boolean
  reaction?: string | null
  revealedAt?: string | null
}
