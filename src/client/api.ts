import type {
  AgentSyncReport,
  AnchorNoteView,
  DirectionMetrics,
  DrawGameView,
  OptionKey,
  OptionMap,
  PublicQuestion,
  QuestionRevealItem,
  StoredQuestion,
  Stroke,
} from '../shared/types'

export interface MeResponse {
  authenticated: boolean
  user?: {
    id: string
    handle: string
    agentName: string
    agentHost: string
    hasAgentKey: boolean
    poolOptedIn: boolean
    shareCode: string
    shareUrl: string
  }
  questions?: StoredQuestion[]
  pairings?: Array<{
    id: string
    kind: 'pool' | 'link'
    status: string
    partnerHandle: string
    partnerAgentName: string
    selfSubmitted: boolean
    partnerSubmitted: boolean
    createdAt: string
  }>
  drawGames?: Array<{
    id: string
    pairingId: string
    status: string
    maxRounds: number
    revealedRounds: number
    latestStatus: string | null
    isMyTurn: boolean
  }>
}

export interface PairingViewResponse {
  id: string
  kind: 'pool' | 'link'
  status: string
  phase: 'blind_answering' | 'waiting_partner' | 'revealed'
  selfHandle: string
  selfAgentName: string
  partnerHandle: string
  partnerAgentName: string
  hasOwnAgentAnswers?: boolean
  partnerQuestions?: PublicQuestion[]
  selfSubmitted?: boolean
  partnerSubmitted?: boolean
  ownAgentSync?: AgentSyncReport
  tripleReveal?: {
    humanToHuman: {
      combinedHitRate: number
      selfOnPartner: DirectionMetrics
      partnerOnSelf: DirectionMetrics
    }
    ownAgentSync: AgentSyncReport
    agentPrediction: {
      selfAgentHitRate: number | null
      partnerAgentHitRate: number | null
    }
    items: QuestionRevealItem[]
  }
  notes?: AnchorNoteView[]
  drawGameId?: string | null
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  })
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) {
    throw new Error(data.error || `请求失败（${res.status}）`)
  }
  return data
}

export const api = {
  getMe: () => request<MeResponse>('/api/me'),
  claim: (claimToken: string) =>
    request<{ ok: boolean; user_id: string; handle: string }>('/api/claim', {
      method: 'POST',
      body: JSON.stringify({ claim_token: claimToken }),
    }),
  bootstrapDemo: (handle?: string) =>
    request<{ ok: boolean; user_id: string; pairing_id: string; share_code: string; is_demo: boolean }>(
      '/api/demo/bootstrap',
      { method: 'POST', body: JSON.stringify({ handle }) },
    ),
  approveQuiz: (payload: {
    handle: string
    poolOptedIn: boolean
    questions: Array<{
      id: string
      prompt: string
      options: OptionMap
      ownerChoice: OptionKey
      starred: boolean
    }>
  }) =>
    request<{ ok: boolean; approvedCount: number }>('/api/me/quiz/approve', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getShareInfo: (shareCode: string) =>
    request<{
      ownerHandle: string
      ownerAgentName: string
      questionCount: number
      dimensions: string[]
      isOwnLink: boolean
      viewerHandle: string | null
    }>(`/api/share/${encodeURIComponent(shareCode)}`),
  startShareChallenge: (shareCode: string, handle?: string) =>
    request<{ pairingId: string }>(`/api/share/${encodeURIComponent(shareCode)}/start`, {
      method: 'POST',
      body: JSON.stringify({ handle }),
    }),
  getPairing: (pairingId: string) => request<PairingViewResponse>(`/api/pairings/${encodeURIComponent(pairingId)}`),
  submitHumanAnswers: (pairingId: string, answers: Array<{ questionId: string; choice: OptionKey }>) =>
    request<{ ok: boolean; revealed: boolean }>(`/api/pairings/${encodeURIComponent(pairingId)}/human-answers`, {
      method: 'POST',
      body: JSON.stringify({ answers }),
    }),
  postAnchorNote: (pairingId: string, questionId: string, body: string) =>
    request<AnchorNoteView>(`/api/pairings/${encodeURIComponent(pairingId)}/notes`, {
      method: 'POST',
      body: JSON.stringify({ questionId, body }),
    }),
  archivePairing: (pairingId: string) =>
    request<{ ok: boolean }>(`/api/pairings/${encodeURIComponent(pairingId)}/archive`, {
      method: 'POST',
    }),
  startDrawGame: (pairingId: string) =>
    request<{ gameId: string }>(`/api/pairings/${encodeURIComponent(pairingId)}/draw-game`, {
      method: 'POST',
    }),
  getDrawGame: (gameId: string) => request<DrawGameView>(`/api/draw/${encodeURIComponent(gameId)}`),
  pickDrawWord: (gameId: string, roundId: string, secretWord: string, drawingBrief?: string) =>
    request<{ ok: boolean }>(`/api/draw/${encodeURIComponent(gameId)}/rounds/${encodeURIComponent(roundId)}/pick-word`, {
      method: 'POST',
      body: JSON.stringify({ secretWord, drawingBrief }),
    }),
  triggerDemoAgentDraw: (gameId: string, roundId: string) =>
    request<{ ok: boolean; strokeCount: number }>(
      `/api/draw/${encodeURIComponent(gameId)}/rounds/${encodeURIComponent(roundId)}/demo-agent-draw`,
      { method: 'POST' },
    ),
  submitHumanDraw: (gameId: string, roundId: string, strokes: Stroke[]) =>
    request<{ ok: boolean }>(
      `/api/draw/${encodeURIComponent(gameId)}/rounds/${encodeURIComponent(roundId)}/human-draw`,
      { method: 'POST', body: JSON.stringify({ strokes }) },
    ),
  approveDraw: (gameId: string, roundId: string, action: 'approve' | 'redraw') =>
    request<{ ok: boolean }>(
      `/api/draw/${encodeURIComponent(gameId)}/rounds/${encodeURIComponent(roundId)}/approve`,
      { method: 'POST', body: JSON.stringify({ action }) },
    ),
  triggerDemoPartnerTurn: (gameId: string, roundId: string) =>
    request<{ ok: boolean }>(
      `/api/draw/${encodeURIComponent(gameId)}/rounds/${encodeURIComponent(roundId)}/demo-partner-turn`,
      { method: 'POST' },
    ),
  submitGuess: (gameId: string, roundId: string, guess: string, giveUp = false) =>
    request<{ matched: boolean; revealed: boolean; attemptsRemaining: number; secretWord: string | null }>(
      `/api/draw/${encodeURIComponent(gameId)}/rounds/${encodeURIComponent(roundId)}/guess`,
      { method: 'POST', body: JSON.stringify({ guess, giveUp }) },
    ),
  reactDrawRound: (gameId: string, roundId: string, reaction: string) =>
    request<{ ok: boolean }>(
      `/api/draw/${encodeURIComponent(gameId)}/rounds/${encodeURIComponent(roundId)}/react`,
      { method: 'POST', body: JSON.stringify({ reaction }) },
    ),
  exportMe: () => request<Record<string, unknown>>('/api/me/export'),
  deleteMe: () => request<{ deleted: boolean }>('/api/me', { method: 'DELETE' }),
}
