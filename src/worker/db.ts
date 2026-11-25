import type {
  AnswerChoice,
  AnswerEntry,
  ConfidenceLevel,
  DrawRoundStatus,
  DrawRoundView,
  OptionKey,
  PairingStatus,
  QuestionOptions,
  StoredQuestion,
} from '../shared/types'
import { randomToken, sha256Hex } from './env'

export interface AgentRow {
  id: string
  token_hash: string
  quiz_ready: number
  created_at: string
  last_seen_at: string
}

export interface PairingRow {
  id: string
  agent_a_id: string
  agent_b_id: string
  status: PairingStatus
  agent_a_submitted_at: string | null
  agent_b_submitted_at: string | null
  human_a_submitted_at: string | null
  human_b_submitted_at: string | null
  created_at: string
  revealed_at: string | null
}

export interface DrawGameRow {
  id: string
  pairing_id: string
  status: 'active' | 'completed'
  total_rounds: number
  created_at: string
}

export interface DrawRoundRow {
  id: string
  game_id: string
  round_number: number
  drawer_agent_id: string
  guesser_agent_id: string
  status: DrawRoundStatus
  prompt_options_json: string
  secret_word: string | null
  svg_markup: string | null
  guess_attempts: number
  last_guess: string | null
  guessed_correctly: number
  reaction: string | null
  created_at: string
  revealed_at: string | null
}

export interface AnchorNoteItem {
  id: string
  questionId: string
  author: 'self' | 'partner'
  body: string
  createdAt: string
}

export async function getAgentByToken(db: D1Database, rawToken: string | null | undefined): Promise<AgentRow | null> {
  if (!rawToken) return null
  const hash = await sha256Hex(rawToken.trim())
  const row = await db.prepare('SELECT * FROM agents WHERE token_hash = ?').bind(hash).first<AgentRow>()
  if (row) {
    await db
      .prepare('UPDATE agents SET last_seen_at = ? WHERE id = ?')
      .bind(new Date().toISOString(), row.id)
      .run()
  }
  return row ?? null
}

export async function listQuestions(db: D1Database, agentId: string): Promise<StoredQuestion[]> {
  const { results } = await db
    .prepare('SELECT * FROM questions WHERE agent_id = ? ORDER BY position ASC')
    .bind(agentId)
    .all<{
      id: string
      position: number
      dimension: string
      prompt: string
      options_json: string
      owner_choice: OptionKey
      agent_predicted: OptionKey
      confidence: ConfidenceLevel
      starred: number
    }>()

  return (results ?? []).map((row) => ({
    id: row.id,
    position: row.position,
    dimension: row.dimension,
    prompt: row.prompt,
    options: JSON.parse(row.options_json) as QuestionOptions,
    ownerChoice: row.owner_choice,
    agentPredicted: row.agent_predicted,
    confidence: row.confidence,
    starred: Boolean(row.starred),
  }))
}

export async function listAnswers(
  db: D1Database,
  pairingId: string,
  agentId: string,
  source: 'agent' | 'human',
): Promise<AnswerEntry[]> {
  const { results } = await db
    .prepare(
      `SELECT question_id, choice FROM quiz_answers
       WHERE pairing_id = ? AND agent_id = ? AND source = ?`,
    )
    .bind(pairingId, agentId, source)
    .all<{ question_id: string; choice: AnswerChoice }>()

  return (results ?? []).map((row) => ({
    questionId: row.question_id,
    choice: row.choice,
  }))
}

export async function listAnchorNotes(
  db: D1Database,
  pairingId: string,
  viewerAgentId: string,
): Promise<AnchorNoteItem[]> {
  const { results } = await db
    .prepare(
      `SELECT id, question_id, author_agent_id, body, created_at
       FROM anchor_notes
       WHERE pairing_id = ?
       ORDER BY created_at ASC`,
    )
    .bind(pairingId)
    .all<{
      id: string
      question_id: string
      author_agent_id: string
      body: string
      created_at: string
    }>()

  return (results ?? []).map((row) => ({
    id: row.id,
    questionId: row.question_id,
    author: row.author_agent_id === viewerAgentId ? 'self' : 'partner',
    body: row.body,
    createdAt: row.created_at,
  }))
}

export async function ensurePoolPairingsForAgent(db: D1Database, agentId: string): Promise<number> {
  const { results: recentRows } = await db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM pairings
       WHERE (agent_a_id = ? OR agent_b_id = ?)
         AND created_at >= datetime('now', '-1 day')`,
    )
    .bind(agentId, agentId)
    .all<{ cnt: number }>()

  const recentCount = Number(recentRows?.[0]?.cnt ?? 0)
  const remainingSlots = Math.max(0, 3 - recentCount)
  if (remainingSlots === 0) return 0

  const { results: candidates } = await db
    .prepare(
      `SELECT a.id FROM agents a
       WHERE a.id != ?
         AND a.quiz_ready = 1
         AND NOT EXISTS (
           SELECT 1 FROM pairings p
           WHERE (p.agent_a_id = a.id AND p.agent_b_id = ?)
              OR (p.agent_a_id = ? AND p.agent_b_id = a.id)
         )
       ORDER BY a.last_seen_at DESC
       LIMIT ?`,
    )
    .bind(agentId, agentId, agentId, remainingSlots)
    .all<{ id: string }>()

  let created = 0
  const now = new Date().toISOString()
  for (const cand of candidates ?? []) {
    const [aId, bId] = agentId < cand.id ? [agentId, cand.id] : [cand.id, agentId]
    const pairingId = randomToken('pr_', 12)
    await db
      .prepare(
        `INSERT OR IGNORE INTO pairings (id, agent_a_id, agent_b_id, status, created_at)
         VALUES (?, ?, ?, 'pending_agents', ?)`,
      )
      .bind(pairingId, aId, bId, now)
      .run()
    created += 1
  }
  return created
}

export function formatDrawRoundView(
  row: DrawRoundRow,
  viewerAgentId: string,
  origin: string,
): DrawRoundView {
  const isDrawer = row.drawer_agent_id === viewerAgentId
  const canSeeSecret = isDrawer || row.status === 'revealed'
  const base = origin.replace(/\/+$/, '')

  return {
    id: row.id,
    roundNumber: row.round_number,
    role: isDrawer ? 'drawer' : 'guesser',
    status: row.status,
    promptOptions: isDrawer && row.status === 'picking_word' ? (JSON.parse(row.prompt_options_json) as string[]) : undefined,
    secretWord: canSeeSecret ? row.secret_word : null,
    wordLengthHint: row.secret_word ? Array.from(row.secret_word.replace(/\s+/g, '')).length : null,
    imageUrl: row.svg_markup ? `${base}/img/${row.id}.svg` : null,
    guessAttempts: row.guess_attempts,
    lastGuess: row.last_guess,
    guessedCorrectly: Boolean(row.guessed_correctly),
    reaction: row.reaction,
    revealedAt: row.revealed_at,
  }
}
