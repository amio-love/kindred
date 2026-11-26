import { pickRoundPrompts } from '../shared/drawing'
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
  SubtextPromptTemplate,
} from '../shared/types'
import { randomToken, sha256Hex } from './env'

export interface AgentRow {
  id: string
  token_hash: string
  quiz_ready: number
  current_quiz_version: number
  skill_version: number
  created_at: string
  last_seen_at: string
}

export interface PairingRow {
  id: string
  agent_a_id: string
  agent_b_id: string
  agent_a_quiz_version: number
  agent_b_quiz_version: number
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
  subtext_options_json: string | null
  correct_option: OptionKey | null
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

export function isOAuthAgent(agent: AgentRow): boolean {
  return agent.token_hash.startsWith('oauth_')
}

export async function getAgentByToken(
  db: D1Database,
  rawToken: string | null | undefined,
  options?: { allowOAuth?: boolean; expectedResource?: string },
): Promise<AgentRow | null> {
  if (!rawToken) return null
  const trimmed = rawToken.trim()
  if (!trimmed) return null
  const hash = await sha256Hex(trimmed)
  const nowIso = new Date().toISOString()
  let row = await db.prepare('SELECT * FROM agents WHERE token_hash = ?').bind(hash).first<AgentRow>()
  if (!row && options?.allowOAuth && options.expectedResource) {
    const oauthRow = await db
      .prepare(
        `SELECT a.*, t.resource AS oauth_resource, t.expires_at AS oauth_expires_at, t.revoked_at AS oauth_revoked_at
         FROM oauth_tokens t
         JOIN agents a ON a.id = t.agent_id
         WHERE t.access_token_hash = ?`,
      )
      .bind(hash)
      .first<
        AgentRow & {
          oauth_resource: string
          oauth_expires_at: string
          oauth_revoked_at: string | null
        }
      >()
    if (
      oauthRow &&
      oauthRow.oauth_revoked_at === null &&
      oauthRow.oauth_expires_at > nowIso &&
      oauthRow.oauth_resource === options.expectedResource
    ) {
      row = {
        id: oauthRow.id,
        token_hash: oauthRow.token_hash,
        quiz_ready: oauthRow.quiz_ready,
        current_quiz_version: oauthRow.current_quiz_version,
        skill_version: oauthRow.skill_version,
        created_at: oauthRow.created_at,
        last_seen_at: oauthRow.last_seen_at,
      }
    }
  }
  if (row) {
    await db
      .prepare('UPDATE agents SET last_seen_at = ? WHERE id = ?')
      .bind(nowIso, row.id)
      .run()
  }
  return row ?? null
}

export async function listQuestions(
  db: D1Database,
  agentId: string,
  quizVersion?: number,
): Promise<StoredQuestion[]> {
  const stmt =
    quizVersion !== undefined
      ? db
          .prepare('SELECT * FROM questions WHERE agent_id = ? AND quiz_version = ? ORDER BY position ASC')
          .bind(agentId, quizVersion)
      : db
          .prepare(
            `SELECT q.* FROM questions q
             JOIN agents a ON a.id = q.agent_id
             WHERE q.agent_id = ? AND q.quiz_version = a.current_quiz_version
             ORDER BY q.position ASC`,
          )
          .bind(agentId)

  const { results } = await stmt.all<{
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

export async function ensurePoolPairingsForAgent(
  db: D1Database,
  agentId: string,
  options?: { maxNew?: number; dailyLimit?: number },
): Promise<number> {
  const dailyLimit = Math.min(3, Math.max(1, Math.round(options?.dailyLimit ?? 3)))
  const maxNew = Math.min(dailyLimit, Math.max(0, Math.round(options?.maxNew ?? dailyLimit)))
  if (maxNew === 0) return 0

  const sinceIso = new Date(Date.now() - 86_400_000).toISOString()
  const { results: recentRows } = await db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM pairings
       WHERE (agent_a_id = ? OR agent_b_id = ?)
         AND created_at >= ?`,
    )
    .bind(agentId, agentId, sinceIso)
    .all<{ cnt: number }>()

  const recentCount = Number(recentRows?.[0]?.cnt ?? 0)
  const remainingSlots = Math.min(maxNew, Math.max(0, dailyLimit - recentCount))
  if (remainingSlots === 0) return 0

  const candidateFetchLimit = Math.max(remainingSlots * 4, 12)
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
         AND (
           SELECT COUNT(*) FROM pairings p2
           WHERE (p2.agent_a_id = a.id OR p2.agent_b_id = a.id)
             AND p2.created_at >= ?
         ) < 3
       ORDER BY a.last_seen_at DESC
       LIMIT ?`,
    )
    .bind(agentId, agentId, agentId, sinceIso, candidateFetchLimit)
    .all<{ id: string }>()

  let created = 0
  const now = new Date().toISOString()
  for (const cand of candidates ?? []) {
    if (created >= remainingSlots) break
    const [aId, bId] = agentId < cand.id ? [agentId, cand.id] : [cand.id, agentId]
    const pairingId = randomToken('pr_', 12)
    const insertRes = await db
      .prepare(
        `INSERT OR IGNORE INTO pairings (
           id, agent_a_id, agent_b_id, agent_a_quiz_version, agent_b_quiz_version, status, created_at
         )
         SELECT
           ?,
           ?,
           ?,
           (SELECT current_quiz_version FROM agents WHERE id = ?),
           (SELECT current_quiz_version FROM agents WHERE id = ?),
           'pending_agents',
           ?
         WHERE EXISTS (SELECT 1 FROM agents WHERE id = ? AND quiz_ready = 1)
           AND EXISTS (SELECT 1 FROM agents WHERE id = ? AND quiz_ready = 1)
           AND (
             SELECT COUNT(*) FROM pairings
             WHERE (agent_a_id = ? OR agent_b_id = ?) AND created_at >= ?
           ) < ?
           AND (
             SELECT COUNT(*) FROM pairings
             WHERE (agent_a_id = ? OR agent_b_id = ?) AND created_at >= ?
           ) < 3`,
      )
      .bind(
        pairingId,
        aId,
        bId,
        aId,
        bId,
        now,
        agentId,
        cand.id,
        agentId,
        agentId,
        sinceIso,
        dailyLimit,
        cand.id,
        cand.id,
        sinceIso,
      )
      .run()
    created += Number(insertRes.meta?.changes ?? 0)
  }
  return created
}

function normalizePromptOptions(rawJson: string, roundNumber: number): SubtextPromptTemplate[] {
  try {
    const parsed = JSON.parse(rawJson) as unknown
    if (
      Array.isArray(parsed) &&
      parsed.length > 0 &&
      parsed.every(
        (item) =>
          item &&
          typeof item === 'object' &&
          typeof (item as SubtextPromptTemplate).visualHint === 'string' &&
          Array.isArray((item as SubtextPromptTemplate).readings) &&
          (item as SubtextPromptTemplate).readings.length === 4 &&
          (item as SubtextPromptTemplate).readings.every((r) => typeof r === 'string'),
      )
    ) {
      return parsed as SubtextPromptTemplate[]
    }
  } catch {
  }
  return pickRoundPrompts([], roundNumber)
}

export function formatDrawRoundView(
  row: DrawRoundRow,
  viewerAgentId: string,
  origin: string,
): DrawRoundView {
  const isDrawer = row.drawer_agent_id === viewerAgentId
  const canSeeSecret = isDrawer || row.status === 'revealed'
  const canSeeOptions = isDrawer || row.status === 'awaiting_guess' || row.status === 'revealed'
  const base = origin.replace(/\/+$/, '')
  const hasSubtextChoices = Boolean(row.subtext_options_json && row.correct_option)
  const guessMode =
    row.status === 'picking_word' || hasSubtextChoices ? 'subtext_choice' : 'legacy_free_text'
  const subtextOptions =
    canSeeOptions && row.subtext_options_json
      ? (JSON.parse(row.subtext_options_json) as QuestionOptions)
      : null
  const chosenOption =
    row.last_guess === 'A' || row.last_guess === 'B' || row.last_guess === 'C' || row.last_guess === 'D'
      ? row.last_guess
      : null

  return {
    id: row.id,
    roundNumber: row.round_number,
    role: isDrawer ? 'drawer' : 'guesser',
    status: row.status,
    guessMode,
    promptOptions:
      isDrawer && row.status === 'picking_word'
        ? normalizePromptOptions(row.prompt_options_json, row.round_number)
        : undefined,
    secretWord: canSeeSecret ? row.secret_word : null,
    subtextOptions,
    correctOption: canSeeSecret ? row.correct_option : null,
    drawerChoice: canSeeSecret ? row.correct_option : null,
    chosenOption: row.status === 'revealed' ? chosenOption : null,
    partnerChoice: row.status === 'revealed' ? chosenOption : null,
    imageUrl: row.svg_markup ? `${base}/img/${row.id}.svg` : null,
    guessAttempts: row.guess_attempts,
    lastGuess: row.last_guess,
    guessedCorrectly: Boolean(row.guessed_correctly),
    resonated: Boolean(row.guessed_correctly),
    reaction: row.reaction,
    revealedAt: row.revealed_at,
  }
}
