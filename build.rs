// Compiles the built renderer (dist/renderer) into the executable, so the
// app's code signature covers it. The renderer has access to the app, and a
// file in Contents/Resources can be replaced without breaking that signature.
//
// Writes $OUT_DIR/renderer.rs, the table src/main/pages/embedded.rs includes,
// and $OUT_DIR/pages.rs, the pages' folders src/main/pages/mod.rs checks its
// `PAGES` against.

use std::fmt::Write;
use std::path::{Path, PathBuf};
use std::{env, fs};

const RENDERER: &str = "dist/renderer";
const PAGES: &str = "src/renderer/pages";

fn main() {
    pages();
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

/// The folders of src/renderer/pages with a page in them, as vite.config.ts
/// finds them.
fn pages() {
    println!("cargo:rerun-if-changed={PAGES}");
    let mut folders: Vec<String> = fs::read_dir(PAGES)
        .unwrap()
        .flatten()
        .filter(|entry| entry.path().join("index.html").is_file())
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .collect();
    folders.sort();
    let source = format!("const FOLDERS: &[&str] = &{folders:?};\n");
    // Written only when it changes, as a page's every edit reruns this.
    let path = Path::new(&env::var("OUT_DIR").unwrap()).join("pages.rs");
    if fs::read_to_string(&path).ok().as_deref() != Some(&source) {
        fs::write(path, source).unwrap();
    }
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
