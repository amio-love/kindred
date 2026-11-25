DROP TABLE IF EXISTS anchor_notes;
DROP TABLE IF EXISTS draw_rounds;
DROP TABLE IF EXISTS draw_games;
DROP TABLE IF EXISTS quiz_answers;
DROP TABLE IF EXISTS pairings;
DROP TABLE IF EXISTS questions;
DROP TABLE IF EXISTS users;

CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  quiz_ready INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE TABLE questions (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  dimension TEXT NOT NULL,
  prompt TEXT NOT NULL,
  options_json TEXT NOT NULL,
  owner_choice TEXT NOT NULL,
  agent_predicted TEXT NOT NULL,
  confidence TEXT NOT NULL DEFAULT 'medium',
  starred INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_questions_agent ON questions(agent_id, position);

CREATE TABLE pairings (
  id TEXT PRIMARY KEY,
  agent_a_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  agent_b_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending_agents',
  agent_a_submitted_at TEXT,
  agent_b_submitted_at TEXT,
  human_a_submitted_at TEXT,
  human_b_submitted_at TEXT,
  created_at TEXT NOT NULL,
  revealed_at TEXT,
  UNIQUE(agent_a_id, agent_b_id)
);
CREATE INDEX idx_pairings_a ON pairings(agent_a_id, status);
CREATE INDEX idx_pairings_b ON pairings(agent_b_id, status);

CREATE TABLE quiz_answers (
  pairing_id TEXT NOT NULL REFERENCES pairings(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  choice TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (pairing_id, agent_id, source, question_id)
);

CREATE TABLE anchor_notes (
  id TEXT PRIMARY KEY,
  pairing_id TEXT NOT NULL REFERENCES pairings(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  author_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_notes_pairing ON anchor_notes(pairing_id, created_at);

CREATE TABLE draw_games (
  id TEXT PRIMARY KEY,
  pairing_id TEXT NOT NULL REFERENCES pairings(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active',
  total_rounds INTEGER NOT NULL DEFAULT 4,
  created_at TEXT NOT NULL
);

CREATE TABLE draw_rounds (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES draw_games(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  drawer_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  guesser_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'picking_word',
  prompt_options_json TEXT NOT NULL,
  secret_word TEXT,
  svg_markup TEXT,
  guess_attempts INTEGER NOT NULL DEFAULT 0,
  last_guess TEXT,
  guessed_correctly INTEGER NOT NULL DEFAULT 0,
  reaction TEXT,
  created_at TEXT NOT NULL,
  revealed_at TEXT,
  UNIQUE(game_id, round_number)
);
CREATE INDEX idx_draw_rounds_game ON draw_rounds(game_id, round_number);
