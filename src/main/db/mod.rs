// The app's database: what the browser keeps of its own, as opposed to what
// Chromium keeps for a profile. For now that is spaces. It is used on the main
// thread only, and its methods take `&self`.

mod migrations;
mod profiles;
mod spaces;
mod theme;

use std::cell::RefCell;
use std::collections::HashSet;
use std::fs;
use std::path::Path;

use rusqlite::Connection;

pub use profiles::avatar;
pub use spaces::{NewSpace, SpaceChange, SpaceId, SpaceRow};

use migrations::MIGRATIONS;

pub struct Db {
    conn: Connection,
    /// The profile IDs the last `sync_profiles` was told of.
    listed: RefCell<HashSet<String>>,
}

impl Db {
    /// Opens `wren.sqlite` in `data`, or, if it can't be opened or migrated,
    /// a database in memory, so the browser still runs.
    pub fn open(data: &Path) -> Db {
        let conn = open_file(data).unwrap_or_else(|error| {
            eprintln!("Wren could not open its database: {error}");
            let conn = Connection::open_in_memory().expect("an in-memory database");
            prepare(&conn).expect("a migrated in-memory database");
            conn
        });
        Db {
            conn,
            listed: RefCell::default(),
        }
    }
}

/// A database in memory with the schema, for tests.
#[cfg(test)]
fn test_db() -> Db {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
    for step in MIGRATIONS {
        conn.execute_batch(step).unwrap();
    }
    Db {
        conn,
        listed: RefCell::default(),
    }
}

fn open_file(data: &Path) -> Result<Connection, String> {
    fs::create_dir_all(data).map_err(|error| error.to_string())?;
    let conn = Connection::open(data.join("wren.sqlite")).map_err(|error| error.to_string())?;
    prepare(&conn)?;
    Ok(conn)
}

fn prepare(conn: &Connection) -> Result<(), String> {
    // `journal_mode` answers with the mode it set, so it is read, not run.
    conn.query_row("PRAGMA journal_mode = WAL", [], |_| Ok(()))
        .map_err(|error| error.to_string())?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(|error| error.to_string())?;
    migrate(conn).map_err(|error| error.to_string())
}

// Runs the steps the database has not had, each in a transaction of its own.
fn migrate(conn: &Connection) -> rusqlite::Result<()> {
    let had: i64 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    for (index, step) in MIGRATIONS.iter().enumerate().skip(had as usize) {
        let transaction = conn.unchecked_transaction()?;
        transaction.execute_batch(step)?;
        // A pragma takes no parameters.
        transaction.execute_batch(&format!("PRAGMA user_version = {}", index + 1))?;
        transaction.commit()?;
    }
    Ok(())
}

fn sql(error: rusqlite::Error) -> String {
    format!("Wren's database failed: {error}")
}
