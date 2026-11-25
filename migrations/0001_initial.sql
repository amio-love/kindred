CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  handle TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  agent_host TEXT NOT NULL,
  api_key_hash TEXT UNIQUE,
  claim_token_hash TEXT UNIQUE,
  owner_session_hash TEXT UNIQUE,
  claimed_at TEXT,
  pool_opted_in INTEGER NOT NULL DEFAULT 1,
  share_code TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  dimension TEXT NOT NULL,
  prompt TEXT NOT NULL,
  options_json TEXT NOT NULL,
  owner_choice TEXT NOT NULL CHECK(owner_choice IN ('A','B','C','D')),
  agent_predicted TEXT CHECK(agent_predicted IN ('A','B','C','D')),
  confidence TEXT NOT NULL DEFAULT 'medium' CHECK(confidence IN ('high','medium','low')),
  memory_basis TEXT,
  starred INTEGER NOT NULL DEFAULT 0,
  approved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_questions_owner ON questions(owner_id, position);

CREATE TABLE IF NOT EXISTS pairings (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('pool','link')),
  user_a_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK(status IN ('pending_agents','ready_for_humans','revealed','archived')),
  agent_hit_a_on_b REAL,
  agent_cov_a_on_b REAL,
  agent_hit_b_on_a REAL,
  agent_cov_b_on_a REAL,
  human_a_submitted_at TEXT,
  human_b_submitted_at TEXT,
  revealed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pairings_users ON pairings(user_a_id, user_b_id);

CREATE TABLE IF NOT EXISTS quiz_answers (
  id TEXT PRIMARY KEY,
  pairing_id TEXT NOT NULL REFERENCES pairings(id) ON DELETE CASCADE,
  respondent_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quiz_owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_type TEXT NOT NULL CHECK(actor_type IN ('agent','human')),
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  choice TEXT NOT NULL CHECK(choice IN ('A','B','C','D','U')),
  reason TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(pairing_id, respondent_id, actor_type, question_id)
);

CREATE INDEX IF NOT EXISTS idx_quiz_answers_pairing ON quiz_answers(pairing_id, respondent_id, actor_type);

CREATE TABLE IF NOT EXISTS anchor_notes (
  id TEXT PRIMARY KEY,
  pairing_id TEXT NOT NULL REFERENCES pairings(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_anchor_notes_pairing ON anchor_notes(pairing_id, created_at);

CREATE TABLE IF NOT EXISTS draw_games (
  id TEXT PRIMARY KEY,
  pairing_id TEXT NOT NULL REFERENCES pairings(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK(status IN ('active','completed')),
  max_rounds INTEGER NOT NULL DEFAULT 4,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS draw_rounds (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES draw_games(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  drawer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  guesser_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  prompt_options_json TEXT NOT NULL,
  secret_word TEXT,
  drawing_brief TEXT,
  drawn_by TEXT CHECK(drawn_by IN ('agent','human')),
  strokes_json TEXT,
  drawer_approved INTEGER NOT NULL DEFAULT 0,
  guess_text TEXT,
  guess_attempts INTEGER NOT NULL DEFAULT 0,
  is_correct INTEGER,
  reaction TEXT,
  status TEXT NOT NULL CHECK(status IN ('picking_word','awaiting_agent_draw','awaiting_drawer_approve','awaiting_guess','revealed')),
  created_at TEXT NOT NULL,
  revealed_at TEXT,
  UNIQUE(game_id, round_number)
);

CREATE INDEX IF NOT EXISTS idx_draw_rounds_game ON draw_rounds(game_id, round_number);
