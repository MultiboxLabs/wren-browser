// Compiles the built renderer (dist/renderer) into the executable, so the
// app's code signature covers it. The renderer has access to the app, and a
// file in Contents/Resources can be replaced without breaking that signature.
//
// Writes $OUT_DIR/renderer.rs, the table src/main/pages/embedded.rs includes.

use std::fmt::Write;
use std::path::{Path, PathBuf};
use std::{env, fs};

const RENDERER: &str = "dist/renderer";

fn main() {
    println!("cargo:rerun-if-changed={RENDERER}");
    let root = Path::new(RENDERER);
    let mut files = Vec::new();
    collect(root, &mut files);
    files.sort();

    // A debug build may have none: it fetches the pages from Vite's dev
    // server. A release build without them would ship an app with no UI.
    if files.is_empty() && env::var("PROFILE").is_ok_and(|profile| profile == "release") {
        panic!("{RENDERER} is empty: build the renderer first (`bunx vite build`)");
    }

    let mut table = String::from("pub static FILES: &[(&str, &[u8])] = &[\n");
    for file in &files {
        // Named as in a page's address, whatever the platform's separator.
        let name = file
            .strip_prefix(root)
            .unwrap()
            .components()
            .map(|part| part.as_os_str().to_string_lossy())
            .collect::<Vec<_>>()
            .join("/");
        let path = fs::canonicalize(file).unwrap();
        writeln!(
            table,
            "    ({name:?}, include_bytes!({:?})),",
            path.to_string_lossy()
        )
        .unwrap();
    }
    table.push_str("];\n");
    fs::write(
        Path::new(&env::var("OUT_DIR").unwrap()).join("renderer.rs"),
        table,
    )
    .unwrap();
}

fn collect(directory: &Path, files: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(directory) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect(&path, files);
        } else {
            files.push(path);
        }
    }
}
