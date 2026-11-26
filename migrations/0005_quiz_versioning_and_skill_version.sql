ALTER TABLE agents ADD COLUMN current_quiz_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE agents ADD COLUMN skill_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE questions ADD COLUMN quiz_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE pairings ADD COLUMN agent_a_quiz_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE pairings ADD COLUMN agent_b_quiz_version INTEGER NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX IF NOT EXISTS idx_questions_agent_version_pos ON questions(agent_id, quiz_version, position);
