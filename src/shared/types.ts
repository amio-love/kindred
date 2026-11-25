export type OptionKey = 'A' | 'B' | 'C' | 'D'
export type AnswerChoice = OptionKey | 'U'
export type ConfidenceLevel = 'high' | 'medium' | 'low'
export type AgentHost = 'muse' | 'chatgpt' | 'grok' | 'openclaw' | 'other'
export type PairingKind = 'pool' | 'link'
export type PairingStatus = 'pending_agents' | 'ready_for_humans' | 'revealed' | 'archived'
export type DrawRoundStatus =
  | 'picking_word'
  | 'awaiting_agent_draw'
  | 'awaiting_drawer_approve'
  | 'awaiting_guess'
  | 'revealed'

export interface OptionMap {
  A: string
  B: string
  C: string
  D: string
}

export interface QuestionDraftInput {
  dimension: string
  prompt: string
  options: OptionMap
  ownerChoice: OptionKey
  agentPredicted?: OptionKey
  confidence?: ConfidenceLevel
  memoryBasis?: string
  starred?: boolean
}

export interface StoredQuestion {
  id: string
  ownerId: string
  position: number
  dimension: string
  prompt: string
  options: OptionMap
  ownerChoice: OptionKey
  agentPredicted: OptionKey | null
  confidence: ConfidenceLevel
  memoryBasis: string | null
  starred: boolean
  approved: boolean
}

export interface PublicQuestion {
  id: string
  position: number
  dimension: string
  prompt: string
  options: OptionMap
  starred: boolean
}

export interface AnswerRecord {
  questionId: string
  choice: AnswerChoice
  reason?: string | null
}

export interface DirectionMetrics {
  total: number
  answered: number
  abstained: number
  coverage: number
  matched: number
  hitRate: number
  starredMissed: number
}

export interface AgentSyncMismatch {
  questionId: string
  prompt: string
  agentChoice: OptionKey
  agentOptionText: string
  humanChoice: OptionKey
  humanOptionText: string
  agentReason: string | null
}

export interface AgentSyncReport {
  comparableCount: number
  abstainedCount: number
  matchedCount: number
  syncRate: number | null
  mismatches: AgentSyncMismatch[]
  calibrationPrompt: string | null
}

export interface QuestionRevealItem {
  questionId: string
  quizOwnerSide: 'self' | 'partner'
  dimension: string
  prompt: string
  options: OptionMap
  starred: boolean
  authorChoice: OptionKey
  respondentHumanChoice: OptionKey | null
  respondentAgentChoice: AnswerChoice | null
  respondentAgentReason: string | null
  humanMatched: boolean
  agentAgreedWithHuman: boolean | null
}

export interface AnchorNoteView {
  id: string
  questionId: string
  authorId: string
  authorHandle: string
  body: string
  createdAt: string
}

export interface Stroke {
  color: string
  width: number
  points: [number, number][]
}

export interface DrawRoundView {
  id: string
  roundNumber: number
  drawerId: string
  drawerHandle: string
  drawerAgentName: string
  guesserId: string
  guesserHandle: string
  isSelfDrawer: boolean
  status: DrawRoundStatus
  promptOptions: string[] | null
  secretWord: string | null
  wordLengthHint: number | null
  drawingBrief: string | null
  drawnBy: 'agent' | 'human' | null
  strokes: Stroke[] | null
  drawerApproved: boolean
  guessText: string | null
  guessAttempts: number
  isCorrect: boolean | null
  reaction: string | null
  revealedAt: string | null
}

export interface DrawGameView {
  id: string
  pairingId: string
  status: 'active' | 'completed'
  maxRounds: number
  selfId: string
  partnerHandle: string
  partnerAgentName: string
  rounds: DrawRoundView[]
}
