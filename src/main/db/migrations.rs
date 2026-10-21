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
];
