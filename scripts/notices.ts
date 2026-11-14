// Writes dist/LICENSES, which every manifest's `resources` puts in Wren.app's
// Resources: Wren Browser's licence, the Wren runtime's LICENSES folder (its
// licence, Chromium's notices and where its changed LGPL source is), and
// third-party.txt, the notices of what else the app ships: uBlock Origin,
// Sparkle, Kagi's bangs, Instrument Serif and Geist (wren://migrate's type),
// and the Rust crates and npm packages built into it.
// Run by build.ts and dev.ts after `wren install` and sparkle(), which put
// the runtime and Sparkle in place. A file is written only when its text
// changes, so dev.ts bundles again only when a notice changed.
import { $ } from "bun";
import { mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { SPARKLE_LICENSE } from "./sparkle";

const OUT = "dist/LICENSES";
const SOURCE_URL = "https://github.com/MultiboxLabs/wren-browser";
const COPYRIGHT = "Copyright 2026 Avocado and Bear Limited, trading as Multibox Labs.";
const UBLOCK = "extensions/uBlock0.crx";
const BANGS_LICENSE = "src/renderer/data/bangs.LICENSE";
const SERIF_LICENSE = "src/renderer/assets/fonts/InstrumentSerif-OFL.txt";
const GEIST_LICENSE = "src/renderer/assets/fonts/Geist-OFL.txt";
const RUNTIME_LICENSES = ".wren/runtime/LICENSES";

/** A licence file's name, as crates and packages name them. */
const LICENCE_FILE = /^(licen[cs]e|copying|notice|unlicense)([-._].*)?$/i;

type Notice = { name: string; licence: string; source?: string; text: string };

/**
 * Licences for what ships with no licence file of its own, from its
 * repository, by the repository. The objc2 crates are MIT, or Zlib, Apache-2.0
 * or MIT, and are used under MIT.
 */
const UPSTREAM_LICENCES: Record<string, string> = {
  "https://github.com/madsmtm/objc2": "scripts/licences/objc2.txt",
  "https://github.com/theKashey/react-remove-scroll-bar": "scripts/licences/react-remove-scroll-bar.txt"
};

/** The licence text for what has no licence file: its repository's, else a line saying so. */
async function missingLicence(source: string | undefined, licence: string | null | undefined) {
  const path = source && UPSTREAM_LICENCES[source.replace(/\.git$/, "")];
  if (path) return (await readFile(path, "utf8")).trim();
  return `It has no licence file. Its licence is ${licence}.`;
}

/** The texts of the licence files in `folder`, one after another. */
async function licenceTexts(folder: string, extra: string[] = []) {
  const names = (await readdir(folder, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && LICENCE_FILE.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  const paths = [...new Set([...names.map((name) => join(folder, name)), ...extra])];
  const texts = await Promise.all(paths.map((path) => readFile(path, "utf8")));
  return texts.map((text) => text.trim()).join("\n\n");
}

/** The Rust crates the release executable links: normal dependencies, for a Mac, from crates.io. */
async function crates(): Promise<Notice[]> {
  type Metadata = {
    packages: {
      id: string;
      name: string;
      version: string;
      license: string | null;
      license_file: string | null;
      manifest_path: string;
      repository: string | null;
      source: string | null;
    }[];
    resolve: { root: string; nodes: { id: string; deps: { pkg: string; dep_kinds: { kind: string | null }[] }[] }[] };
  };
  const metadata = (await $`cargo metadata --format-version 1 --filter-platform aarch64-apple-darwin`
    .quiet()
    .json()) as Metadata;
  const nodes = new Map(metadata.resolve.nodes.map((node) => [node.id, node]));
  const linked = new Set<string>();
  const queue = [metadata.resolve.root];
  while (queue.length) {
    for (const dep of nodes.get(queue.pop()!)?.deps ?? []) {
      if (linked.has(dep.pkg) || !dep.dep_kinds.some(({ kind }) => kind === null)) continue;
      linked.add(dep.pkg);
      queue.push(dep.pkg);
    }
  }
  const notices: Notice[] = [];
  // Path dependencies are Wren's own: the runtime's crate has its notices in the runtime's folder.
  for (const crate of metadata.packages.filter(({ id, source }) => linked.has(id) && source)) {
    const folder = dirname(crate.manifest_path);
    const extra = crate.license_file ? [join(folder, crate.license_file)] : [];
    const text = await licenceTexts(folder, extra);
    notices.push({
      name: `${crate.name} ${crate.version}`,
      licence: crate.license ?? "see below",
      source: crate.repository ?? undefined,
      text: text || (await missingLicence(crate.repository ?? undefined, crate.license))
    });
  }
  return notices;
}

/** The folder of package `name`, as Node finds it from `from`. */
async function packageFolder(name: string, from: string) {
  for (let folder = from; ; folder = dirname(folder)) {
    const candidate = join(folder, "node_modules", name);
    if (await stat(join(candidate, "package.json")).catch(() => null)) return candidate;
    if (folder === dirname(folder) || folder === ".") return null;
  }
}

/** The npm packages the pages are built from: package.json's dependencies, and theirs. */
async function packages(): Promise<Notice[]> {
  type Package = {
    name: string;
    version: string;
    license?: string | { type: string };
    repository?: string | { url: string };
    dependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
  };
  const root = (await Bun.file("package.json").json()) as Package;
  const seen = new Map<string, Notice>();
  const queue: [string, string][] = Object.keys(root.dependencies ?? {}).map((name) => [name, "."]);
  while (queue.length) {
    const [name, from] = queue.pop()!;
    const folder = await packageFolder(name, from);
    // An optional or peer dependency need not be installed.
    if (!folder || seen.has(folder)) continue;
    const found = (await Bun.file(join(folder, "package.json")).json()) as Package;
    const licence = typeof found.license === "object" ? found.license.type : found.license;
    const repository = typeof found.repository === "object" ? found.repository.url : found.repository;
    const source = repository?.replace(/^git\+/, "");
    seen.set(folder, {
      name: `${found.name} ${found.version}`,
      licence: licence ?? "see below",
      source,
      text: (await licenceTexts(folder)) || (await missingLicence(source, licence))
    });
    for (const dependency of Object.keys({
      ...found.dependencies,
      ...found.optionalDependencies,
      ...found.peerDependencies
    })) {
      queue.push([dependency, folder]);
    }
  }
  return [...seen.values()];
}

/** uBlock Origin, as the .crx in extensions/ carries it, with its own licence inside. */
async function uBlock(): Promise<Notice> {
  // unzip reads past the .crx's header, and warns about it with exit status 1.
  const manifest = JSON.parse(await $`unzip -p ${UBLOCK} manifest.json`.quiet().nothrow().text()) as {
    version: string;
  };
  const licence = (await $`unzip -p ${UBLOCK} LICENSE.txt`.quiet().nothrow().text()).trim();
  if (!licence) throw new Error(`${UBLOCK} has no LICENSE.txt`);
  return {
    name: `uBlock Origin ${manifest.version}`,
    licence: "GPL-3.0",
    source: `https://github.com/gorhill/uBlock/tree/${manifest.version}`,
    text: [
      "Wren ships uBlock Origin as its author released it, but for two changes. Its manifest has no update_url,",
      "and Wren packs it with a key of its own (scripts/sync-ublock.ts). Its source is at the address above.",
      "The parts it includes have their own licences, inside the extension.",
      "",
      licence
    ].join("\n")
  };
}

function section({ name, licence, source, text }: Notice) {
  const rule = "-".repeat(Math.max(20, name.length));
  const about = [`Licence: ${licence}`, ...(source ? [`Source: ${source}`] : [])];
  return [rule, name, rule, ...about, "", text, ""].join("\n");
}

/** Every file the folder should hold, by its path in it. */
async function wanted() {
  const files = new Map<string, string>();
  files.set(
    "Wren Browser.txt",
    [
      "Wren Browser",
      COPYRIGHT,
      "",
      "Wren Browser is under the Mozilla Public License, version 2.0, below.",
      `Its source is at ${SOURCE_URL}.`,
      'The names "Wren" and "Multibox Labs", and Wren\'s logos and icons, are',
      "not under this licence.",
      "",
      (await readFile("LICENSE", "utf8")).trim(),
      ""
    ].join("\n")
  );

  // The runtime's own folder, whole, so what a later release adds comes too.
  const runtime = await Array.fromAsync(new Bun.Glob("**/*").scan({ cwd: RUNTIME_LICENSES, followSymlinks: true }));
  if (!runtime.length) throw new Error(`${RUNTIME_LICENSES} is empty: run \`wren install\` first`);
  for (const file of runtime) {
    files.set(join("Wren Runtime", file), await readFile(join(RUNTIME_LICENSES, file), "utf8"));
  }

  const notices = [
    await uBlock(),
    {
      name: "Sparkle",
      licence: "MIT",
      source: "https://github.com/sparkle-project/Sparkle",
      text: (await readFile(SPARKLE_LICENSE, "utf8")).trim()
    },
    {
      name: "Kagi bangs",
      licence: "MIT",
      source: "https://github.com/kagisearch/bangs",
      text: (await readFile(BANGS_LICENSE, "utf8")).trim()
    },
    {
      name: "Instrument Serif",
      licence: "OFL-1.1",
      source: "https://github.com/Instrument/instrument-serif",
      text: (await readFile(SERIF_LICENSE, "utf8")).trim()
    },
    {
      name: "Geist and Geist Mono",
      licence: "OFL-1.1",
      source: "https://github.com/vercel/geist-font",
      text: (await readFile(GEIST_LICENSE, "utf8")).trim()
    },
    ...(await crates()).sort((a, b) => a.name.localeCompare(b.name)),
    ...(await packages()).sort((a, b) => a.name.localeCompare(b.name))
  ];
  files.set(
    "third-party.txt",
    [
      "Wren Browser ships the software below, each under its own licence.",
      'Chromium and the rest of the Wren runtime have their notices in "Wren Runtime".',
      "",
      ...notices.map(section)
    ].join("\n")
  );
  return files;
}

/** Makes dist/LICENSES hold what `wanted` gives, and nothing else. */
export async function notices() {
  const files = await wanted();
  const existing = await Array.fromAsync(new Bun.Glob("**/*").scan({ cwd: OUT })).catch(() => [] as string[]);
  for (const file of existing) {
    if (!files.has(file)) await rm(join(OUT, file));
  }
  let written = 0;
  for (const [file, text] of files) {
    const path = join(OUT, file);
    if ((await readFile(path, "utf8").catch(() => null)) === text) continue;
    await mkdir(dirname(path), { recursive: true });
    await Bun.write(path, text);
    written++;
  }
  if (written) console.log(`Wrote ${written} of ${files.size} notices in ${relative(".", OUT)}`);
}

if (import.meta.main) await notices();
