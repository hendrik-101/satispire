CREATE TABLE site_rooms (
 room_id TEXT PRIMARY KEY,
 revision INTEGER NOT NULL DEFAULT 0,
 plan_json TEXT NOT NULL,
 share_digest TEXT NOT NULL,
 write_token TEXT NOT NULL DEFAULT ''
);
CREATE TABLE site_room_members (
 digest TEXT PRIMARY KEY,
 room_id TEXT NOT NULL REFERENCES site_rooms(room_id),
 participant_id TEXT NOT NULL,
 name TEXT NOT NULL,
 role TEXT NOT NULL DEFAULT 'editor' CHECK(role IN ('owner','editor','viewer')),
 UNIQUE(room_id,participant_id)
);
CREATE INDEX site_room_members_room ON site_room_members(room_id);
CREATE TABLE site_room_history (
 id TEXT PRIMARY KEY,
 room_id TEXT NOT NULL REFERENCES site_rooms(room_id),
 revision INTEGER NOT NULL,
 participant_id TEXT NOT NULL,
 author TEXT NOT NULL,
 timestamp INTEGER NOT NULL,
 summary TEXT NOT NULL,
 changes_json TEXT NOT NULL,
 undo_of TEXT,
 UNIQUE(room_id,revision)
);
CREATE TABLE site_room_receipts (
 room_id TEXT NOT NULL REFERENCES site_rooms(room_id),
 command_id TEXT NOT NULL,
 participant_id TEXT NOT NULL,
 fingerprint TEXT NOT NULL,
 revision INTEGER NOT NULL,
 PRIMARY KEY(room_id,command_id)
);
CREATE TABLE site_room_caller_admission (
 actor_key TEXT PRIMARY KEY,
 window_start INTEGER NOT NULL,
 attempts INTEGER NOT NULL
);
CREATE INDEX site_room_caller_admission_expiry ON site_room_caller_admission(window_start);
