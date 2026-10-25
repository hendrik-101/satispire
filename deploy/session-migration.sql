CREATE TABLE site_sessions (
 session_id TEXT PRIMARY KEY,
 revision INTEGER NOT NULL DEFAULT 0,
 plan_json TEXT NOT NULL,
 receipts_json TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE site_session_members (
 digest TEXT PRIMARY KEY,
 session_id TEXT NOT NULL REFERENCES site_sessions(session_id),
 participant_id TEXT NOT NULL,
 name TEXT NOT NULL,
 color TEXT NOT NULL,
 UNIQUE(session_id,participant_id)
);
CREATE INDEX site_members_session ON site_session_members(session_id);
CREATE TABLE site_session_presence (
 session_id TEXT NOT NULL REFERENCES site_sessions(session_id),
 participant_id TEXT NOT NULL,
 client_id TEXT NOT NULL,
 name TEXT NOT NULL,
 color TEXT NOT NULL,
 view TEXT NOT NULL,
 floor TEXT NOT NULL,
 cursor_json TEXT,
 updated_at INTEGER NOT NULL,
 PRIMARY KEY(session_id,participant_id,client_id)
);
CREATE INDEX site_presence_scope ON site_session_presence(session_id,view,floor,updated_at);
CREATE INDEX site_presence_expiry ON site_session_presence(updated_at);

CREATE TABLE site_session_admission (
 id INTEGER PRIMARY KEY CHECK(id=1),
 window_start INTEGER NOT NULL,
 attempts INTEGER NOT NULL
);
