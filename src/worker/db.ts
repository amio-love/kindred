import type {
  AgentHost,
  AnchorNoteView,
  AnswerChoice,
  AnswerRecord,
  ConfidenceLevel,
  DrawGameView,
  DrawRoundStatus,
  DrawRoundView,
  OptionKey,
  OptionMap,
  PairingKind,
  PairingStatus,
  StoredQuestion,
  Stroke,
} from '../shared/types'
import { pickRoundPrompts } from '../shared/drawing'
import { randomToken, sha256Hex } from './env'

export interface UserRow {
  id: string
  handle: string
  agent_name: string
  agent_host: AgentHost
  api_key_hash: string | null
  claim_token_hash: string | null
  owner_session_hash: string | null
  claimed_at: string | null
  pool_opted_in: number
  share_code: string
  created_at: string
}

export interface PairingRow {
  id: string
  kind: PairingKind
  user_a_id: string
  user_b_id: string
  status: PairingStatus
  agent_hit_a_on_b: number | null
  agent_cov_a_on_b: number | null
  agent_hit_b_on_a: number | null
  agent_cov_b_on_a: number | null
  human_a_submitted_at: string | null
  human_b_submitted_at: string | null
  revealed_at: string | null
  created_at: string
}

interface QuestionDbRow {
  id: string
  owner_id: string
  position: number
  dimension: string
  prompt: string
  options_json: string
  owner_choice: OptionKey
  agent_predicted: OptionKey | null
  confidence: ConfidenceLevel
  memory_basis: string | null
  starred: number
  approved: number
}

interface AnswerDbRow {
  question_id: string
  choice: AnswerChoice
  reason: string | null
}

interface DrawRoundDbRow {
  id: string
  game_id: string
  round_number: number
  drawer_id: string
  guesser_id: string
  prompt_options_json: string
  secret_word: string | null
  drawing_brief: string | null
  drawn_by: 'agent' | 'human' | null
  strokes_json: string | null
  drawer_approved: number
  guess_text: string | null
  guess_attempts: number
  is_correct: number | null
  reaction: string | null
  status: DrawRoundStatus
  revealed_at: string | null
}

export function mapQuestionRow(row: QuestionDbRow): StoredQuestion {
  return {
    id: row.id,
    ownerId: row.owner_id,
    position: row.position,
    dimension: row.dimension,
    prompt: row.prompt,
    options: JSON.parse(row.options_json) as OptionMap,
    ownerChoice: row.owner_choice,
    agentPredicted: row.agent_predicted,
    confidence: row.confidence,
    memoryBasis: row.memory_basis,
    starred: row.starred === 1,
    approved: row.approved === 1,
  }
}

export async function getUserByApiKey(db: D1Database, apiKey: string): Promise<UserRow | null> {
  const hash = await sha256Hex(apiKey)
  return db.prepare('SELECT * FROM users WHERE api_key_hash = ?').bind(hash).first<UserRow>()
}

export async function getUserBySession(db: D1Database, sessionToken: string): Promise<UserRow | null> {
  const hash = await sha256Hex(sessionToken)
  return db.prepare('SELECT * FROM users WHERE owner_session_hash = ?').bind(hash).first<UserRow>()
}

export async function getUserByClaimToken(db: D1Database, claimToken: string): Promise<UserRow | null> {
  const hash = await sha256Hex(claimToken)
  return db.prepare('SELECT * FROM users WHERE claim_token_hash = ?').bind(hash).first<UserRow>()
}

export async function getUserByShareCode(db: D1Database, shareCode: string): Promise<UserRow | null> {
  return db.prepare('SELECT * FROM users WHERE share_code = ?').bind(shareCode).first<UserRow>()
}

export async function getUserById(db: D1Database, userId: string): Promise<UserRow | null> {
  return db.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first<UserRow>()
}

export async function listQuestions(
  db: D1Database,
  ownerId: string,
  approvedOnly = false,
): Promise<StoredQuestion[]> {
  const sql = approvedOnly
    ? 'SELECT * FROM questions WHERE owner_id = ? AND approved = 1 ORDER BY position ASC'
    : 'SELECT * FROM questions WHERE owner_id = ? ORDER BY position ASC'
  const { results } = await db.prepare(sql).bind(ownerId).all<QuestionDbRow>()
  return results.map(mapQuestionRow)
}

export async function listAnswers(
  db: D1Database,
  pairingId: string,
  respondentId: string,
  actorType: 'agent' | 'human',
): Promise<AnswerRecord[]> {
  const { results } = await db
    .prepare(
      'SELECT question_id, choice, reason FROM quiz_answers WHERE pairing_id = ? AND respondent_id = ? AND actor_type = ?',
    )
    .bind(pairingId, respondentId, actorType)
    .all<AnswerDbRow>()

  return results.map((row) => ({
    questionId: row.question_id,
    choice: row.choice,
    reason: row.reason,
  }))
}

export async function listAnchorNotes(
  db: D1Database,
  pairingId: string,
): Promise<AnchorNoteView[]> {
  const { results } = await db
    .prepare(
      `SELECT n.id, n.question_id, n.author_id, u.handle AS author_handle, n.body, n.created_at
       FROM anchor_notes n
       JOIN users u ON u.id = n.author_id
       WHERE n.pairing_id = ?
       ORDER BY n.created_at ASC`,
    )
    .bind(pairingId)
    .all<{
      id: string
      question_id: string
      author_id: string
      author_handle: string
      body: string
      created_at: string
    }>()

  return results.map((row) => ({
    id: row.id,
    questionId: row.question_id,
    authorId: row.author_id,
    authorHandle: row.author_handle,
    body: row.body,
    createdAt: row.created_at,
  }))
}

export async function ensurePoolPairingsForUser(db: D1Database, userId: string, dailyLimit = 3): Promise<void> {
  const self = await getUserById(db, userId)
  if (!self || !self.claimed_at || self.pool_opted_in !== 1) return

  const selfApproved = await db
    .prepare('SELECT COUNT(*) AS count FROM questions WHERE owner_id = ? AND approved = 1')
    .bind(userId)
    .first<{ count: number }>()
  if (!selfApproved || selfApproved.count < 1) return

  const existingActive = await db
    .prepare(
      `SELECT COUNT(*) AS count FROM pairings
       WHERE kind = 'pool' AND status IN ('pending_agents', 'ready_for_humans')
         AND (user_a_id = ? OR user_b_id = ?)`,
    )
    .bind(userId, userId)
    .first<{ count: number }>()

  const slotsLeft = dailyLimit - (existingActive?.count ?? 0)
  if (slotsLeft <= 0) return

  const { results: candidates } = await db
    .prepare(
      `SELECT u.id FROM users u
       WHERE u.id != ?
         AND u.claimed_at IS NOT NULL
         AND u.pool_opted_in = 1
         AND u.api_key_hash IS NOT NULL
         AND EXISTS (SELECT 1 FROM questions q WHERE q.owner_id = u.id AND q.approved = 1)
         AND NOT EXISTS (
           SELECT 1 FROM pairings p
           WHERE (p.user_a_id = ? AND p.user_b_id = u.id)
              OR (p.user_a_id = u.id AND p.user_b_id = ?)
         )
       ORDER BY u.created_at DESC
       LIMIT ?`,
    )
    .bind(userId, userId, userId, slotsLeft)
    .all<{ id: string }>()

  const now = new Date().toISOString()
  for (const candidate of candidates) {
    const pairingId = randomToken('pr_', 12)
    await db
      .prepare(
        `INSERT INTO pairings (id, kind, user_a_id, user_b_id, status, created_at)
         VALUES (?, 'pool', ?, ?, 'pending_agents', ?)`,
      )
      .bind(pairingId, userId, candidate.id, now)
      .run()
  }
}

export async function createNextDrawRound(
  db: D1Database,
  gameId: string,
  roundNumber: number,
  drawerId: string,
  guesserId: string,
  usedWords: readonly string[],
): Promise<string> {
  const roundId = randomToken('dr_', 12)
  const prompts = pickRoundPrompts(usedWords, roundNumber + drawerId.charCodeAt(drawerId.length - 1))
  const now = new Date().toISOString()
  await db
    .prepare(
      `INSERT INTO draw_rounds (
         id, game_id, round_number, drawer_id, guesser_id,
         prompt_options_json, status, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, 'picking_word', ?)`,
    )
    .bind(roundId, gameId, roundNumber, drawerId, guesserId, JSON.stringify(prompts), now)
    .run()
  return roundId
}

export async function loadDrawGameView(
  db: D1Database,
  gameId: string,
  viewerId: string,
): Promise<DrawGameView | null> {
  const game = await db
    .prepare('SELECT * FROM draw_games WHERE id = ?')
    .bind(gameId)
    .first<{
      id: string
      pairing_id: string
      status: 'active' | 'completed'
      max_rounds: number
    }>()
  if (!game) return null

  const pairing = await db
    .prepare('SELECT * FROM pairings WHERE id = ?')
    .bind(game.pairing_id)
    .first<PairingRow>()
  if (!pairing) return null
  if (pairing.user_a_id !== viewerId && pairing.user_b_id !== viewerId) return null

  const partnerId = pairing.user_a_id === viewerId ? pairing.user_b_id : pairing.user_a_id
  const [selfUser, partnerUser] = await Promise.all([
    getUserById(db, viewerId),
    getUserById(db, partnerId),
  ])
  if (!selfUser || !partnerUser) return null

  const userMap = new Map<string, UserRow>([
    [selfUser.id, selfUser],
    [partnerUser.id, partnerUser],
  ])

  const { results: rawRounds } = await db
    .prepare('SELECT * FROM draw_rounds WHERE game_id = ? ORDER BY round_number ASC')
    .bind(game.id)
    .all<DrawRoundDbRow>()

  const rounds: DrawRoundView[] = rawRounds.map((row) => {
    const isSelfDrawer = row.drawer_id === viewerId
    const isRevealed = row.status === 'revealed'
    const drawer = userMap.get(row.drawer_id)
    const guesser = userMap.get(row.guesser_id)
    const canSeeSecret = isSelfDrawer || isRevealed
    const canSeeStrokes =
      isSelfDrawer || row.status === 'awaiting_guess' || row.status === 'revealed'

    return {
      id: row.id,
      roundNumber: row.round_number,
      drawerId: row.drawer_id,
      drawerHandle: drawer?.handle ?? '对方',
      drawerAgentName: drawer?.agent_name ?? 'Agent',
      guesserId: row.guesser_id,
      guesserHandle: guesser?.handle ?? '对方',
      isSelfDrawer,
      status: row.status,
      promptOptions: isSelfDrawer ? (JSON.parse(row.prompt_options_json) as string[]) : null,
      secretWord: canSeeSecret ? row.secret_word : null,
      wordLengthHint: row.secret_word ? row.secret_word.length : null,
      drawingBrief: canSeeSecret ? row.drawing_brief : null,
      drawnBy: row.drawn_by,
      strokes: canSeeStrokes && row.strokes_json ? (JSON.parse(row.strokes_json) as Stroke[]) : null,
      drawerApproved: row.drawer_approved === 1,
      guessText: row.guess_text,
      guessAttempts: row.guess_attempts,
      isCorrect: row.is_correct === null ? null : row.is_correct === 1,
      reaction: row.reaction,
      revealedAt: row.revealed_at,
    }
  })

  return {
    id: game.id,
    pairingId: game.pairing_id,
    status: game.status,
    maxRounds: game.max_rounds,
    selfId: viewerId,
    partnerHandle: partnerUser.handle,
    partnerAgentName: partnerUser.agent_name,
    rounds,
  }
}
