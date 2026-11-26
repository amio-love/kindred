CREATE TABLE IF NOT EXISTS oauth_clients (
  client_id TEXT PRIMARY KEY,
  client_name TEXT NOT NULL,
  redirect_uris_json TEXT NOT NULL,
  token_endpoint_auth_method TEXT NOT NULL DEFAULT 'client_secret_basic',
  client_secret_hash TEXT,
  grant_types_json TEXT NOT NULL,
  response_types_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS oauth_auth_requests (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  client_name TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  redirect_uri_sent INTEGER NOT NULL DEFAULT 1,
  allow_refresh INTEGER NOT NULL DEFAULT 0,
  code_challenge TEXT NOT NULL,
  scope TEXT NOT NULL,
  state TEXT,
  resource TEXT,
  csrf_token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_oauth_auth_requests_exp ON oauth_auth_requests(expires_at);

CREATE TABLE IF NOT EXISTS oauth_codes (
  code_hash TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  redirect_uri_sent INTEGER NOT NULL DEFAULT 1,
  allow_refresh INTEGER NOT NULL DEFAULT 0,
  code_challenge TEXT NOT NULL,
  scope TEXT NOT NULL,
  resource TEXT,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  consumed_by TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_oauth_codes_exp ON oauth_codes(expires_at);

CREATE TABLE IF NOT EXISTS oauth_tokens (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  access_token_hash TEXT NOT NULL UNIQUE,
  refresh_token_hash TEXT UNIQUE,
  scope TEXT NOT NULL,
  resource TEXT NOT NULL,
  auth_code_hash TEXT,
  expires_at TEXT NOT NULL,
  refresh_expires_at TEXT,
  revoked_at TEXT,
  revoked_by TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_agent ON oauth_tokens(agent_id);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_code ON oauth_tokens(auth_code_hash);
