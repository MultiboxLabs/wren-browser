// The database's schema, one step at a time. A step that has shipped is never
// edited: a change to the schema is a new step after it.

/// The steps, in order. The database's `user_version` is the number of those it
/// has had.
pub const MIGRATIONS: &[&str] = &[
    // Spaces, which belong to a profile. Chromium owns the profiles, so
    // `profiles` only mirrors their IDs: deleting one deletes the profile's
    // spaces, and what hangs off them later.
    "
    CREATE TABLE profiles (
      id TEXT PRIMARY KEY
    );
    CREATE TABLE spaces (
      id INTEGER PRIMARY KEY,
      profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      icon TEXT NOT NULL,
      theme TEXT NOT NULL,
      position INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX spaces_by_profile ON spaces(profile_id, position);
    ",
    // When each space was last used, in milliseconds since 1970, so a window
    // can open on its profile's most recent one. NULL is never.
    "
    ALTER TABLE spaces ADD COLUMN last_used_at INTEGER;
    ",
    // The windows open at quit, so each comes back with its spaces. A
    // window's key is in the session tag of each of its Browsers; its frame
    // is in AppKit's screen coordinates, NULL until it is first kept.
    "
    CREATE TABLE windows (
      id TEXT PRIMARY KEY,
      position INTEGER NOT NULL,
      current_space INTEGER REFERENCES spaces(id) ON DELETE SET NULL,
      frame_x REAL,
      frame_y REAL,
      frame_width REAL,
      frame_height REAL
    );
    CREATE TABLE window_spaces (
      window_id TEXT NOT NULL REFERENCES windows(id) ON DELETE CASCADE,
      space_id INTEGER NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
      PRIMARY KEY (window_id, space_id)
    );
    ",
];
