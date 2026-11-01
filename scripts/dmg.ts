// Makes the disk image people download Wren in: the app, a link to
// Applications, and Finder's window arranged over the picture in
// branding/dmg/background.html, which has the app's version in its corner. The
// version, a beta's too, comes from the app, so the picture is drawn afresh
// for each image. Only the app inside is signed and notarised: the image
// around it needs neither.
//
//   bun run dmg                         from Wren.app, into target/publish
//   bun run dmg --app PATH --output PATH
//
// It needs, on this Mac: Google Chrome, which draws the picture (or
// WREN_CHROME, the path of a browser like it), Xcode's command line tools, and
// permission to control Finder, which macOS asks for the first time. Finder
// opens the image's window while it runs.
import { $ } from "bun";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "util";
import { app } from "./channel";

const BACKGROUND = "branding/dmg/background.html";
const CHROME = process.env.WREN_CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const VOLUME = "Wren";
const MOUNT = `/Volumes/${VOLUME}`;
// The window's content, the size of the picture. Finder's bounds include its
// title bar as well.
const WIDTH = 600;
const HEIGHT = 408;
const TITLE_BAR = 32;
const ICON_SIZE = 112;
// Where the icons' centres are in the picture, which draws around them.
const ICONS = { app: [160, 204], applications: [440, 204] };
// Long enough for someone to answer macOS's question about controlling Finder.
const FINDER_TIMEOUT = 120_000;

/** What `plist` says for `key`. */
async function plistValue(plist: string, key: string) {
  return (await $`/usr/libexec/PlistBuddy -c ${`Print :${key}`} ${plist}`.text()).trim();
}

/** Where `bun run dmg` puts an image of this version, as publish.ts does. */
export const dmgOf = (version: string) => `target/publish/Wren-${version}.dmg`;

/**
 * Throws if an image could not be made here. Publishing calls this before it
 * builds, so that nothing is notarised for a release that could not finish.
 */
export async function checkDmgTools() {
  if (!(await Bun.file(CHROME).exists()))
    throw new Error(`The disk image's picture needs Google Chrome, or WREN_CHROME: ${CHROME} is not there.`);
  if (!Bun.which("SetFile")) throw new Error("The disk image needs SetFile: install Xcode's command line tools.");
  if ((await $`test -e ${MOUNT}`.nothrow().quiet()).exitCode === 0)
    throw new Error(`Eject ${MOUNT} first: the disk image is arranged under that name.`);
  await finder(`tell application "Finder" to get name`);
}

/** Runs AppleScript, which asks macOS's permission to control Finder if it has not been given. */
async function finder(script: string) {
  const run = Bun.spawn(["osascript", "-e", script], { stdout: "ignore", stderr: "pipe", timeout: FINDER_TIMEOUT });
  const [code, error] = await Promise.all([run.exited, new Response(run.stderr).text()]);
  if (code === 0) return;
  // -1743 is macOS refusing, for want of that permission.
  const hint = error.includes("-1743") ? " Allow it in System Settings ▸ Privacy & Security ▸ Automation." : "";
  throw new Error(`Finder did not arrange the disk image: ${error.trim() || `osascript stopped (${code})`}.${hint}`);
}

/** Draws the picture for `version` into `tiff`, at 1x and 2x as one file. */
async function drawBackground(version: string, tiff: string, scratch: string) {
  const page = pathToFileURL(resolve(BACKGROUND));
  page.searchParams.set("version", version);
  const drawn = await Promise.all(
    [1, 2].map(async (scale) => {
      const png = join(scratch, `background-${scale}x.png`);
      await $`${CHROME} --headless=new --disable-gpu --hide-scrollbars --user-data-dir=${join(scratch, `chrome-${scale}`)} --force-device-scale-factor=${scale} --window-size=${WIDTH},${HEIGHT} --virtual-time-budget=2000 --screenshot=${png} ${page.href}`.quiet();
      const dpi = String(72 * scale);
      await $`sips -s dpiWidth ${dpi} -s dpiHeight ${dpi} ${png}`.quiet();
      return png;
    })
  );
  await $`tiffutil -cathidpicheck ${drawn} -out ${tiff}`.quiet();
}

/**
 * Arranges the mounted image's window, which Finder stores in the image's
 * .DS_Store. Finder shows its background and icon size only once the window
 * opens again, and writes them when it closes.
 */
async function arrangeWindow() {
  const [left, top] = [240, 160];
  await finder(`
    tell application "Finder"
      tell disk "${VOLUME}"
        open
        delay 1
        set current view of container window to icon view
        set toolbar visible of container window to false
        set statusbar visible of container window to false
        set bounds of container window to {${left}, ${top}, ${left + WIDTH}, ${top + HEIGHT + TITLE_BAR}}
        set opts to the icon view options of container window
        set arrangement of opts to not arranged
        set icon size of opts to ${ICON_SIZE}
        set text size of opts to 13
        set shows item info of opts to false
        set shows icon preview of opts to false
        set background picture of opts to file ".background:background.tiff"
        set position of item "${app}" of container window to {${ICONS.app}}
        set position of item "Applications" of container window to {${ICONS.applications}}
        update without registering applications
        delay 2
        close
        delay 1
        open
        delay 2
      end tell
      set selection to {}
      delay 1
      close window "${VOLUME}"
      delay 2
    end tell`);
}

/** Makes `output` from the app at `appPath`, which should be notarised already. */
export async function makeDmg(appPath: string, output: string) {
  const plist = join(appPath, "Contents/Info.plist");
  const version = await plistValue(plist, "CFBundleShortVersionString");
  const iconFile = await plistValue(plist, "CFBundleIconFile");
  const icon = join(appPath, "Contents/Resources", iconFile.endsWith(".icns") ? iconFile : `${iconFile}.icns`);
  await checkDmgTools();

  const scratch = await mkdtemp(join(tmpdir(), "wren-dmg-"));
  try {
    const stage = join(scratch, "stage");
    await $`mkdir -p ${join(stage, ".background")}`;
    await drawBackground(version, join(stage, ".background/background.tiff"), scratch);
    // ditto keeps the app's symbolic links, signature and stapled ticket.
    await $`ditto ${appPath} ${join(stage, app)}`;
    await $`ln -s /Applications ${join(stage, "Applications")}`;

    const writable = join(scratch, "writable.dmg");
    const megabytes = Number((await $`du -sm ${stage}`.text()).split("\t")[0]) + 100;
    await $`hdiutil create -quiet -srcfolder ${stage} -volname ${VOLUME} -fs HFS+ -format UDRW -size ${`${megabytes}m`} ${writable}`;
    await $`hdiutil attach -quiet -noverify -noautoopen ${writable}`;
    try {
      await arrangeWindow();
      // After Finder is done with the disk: it deletes the icon when it first
      // opens the disk's window.
      await $`cp ${icon} ${join(MOUNT, ".VolumeIcon.icns")}`;
      await $`SetFile -a C ${MOUNT}`;
    } finally {
      await $`sync`;
      // Finder can hold on to a disk it has just closed for a moment.
      if ((await $`hdiutil detach -quiet ${MOUNT}`.nothrow().quiet()).exitCode !== 0) {
        await Bun.sleep(5000);
        await $`hdiutil detach -quiet -force ${MOUNT}`;
      }
    }

    await $`mkdir -p ${dirname(output)}`;
    await $`hdiutil convert -quiet -ov ${writable} -format ULFO -o ${output}`;
    await $`hdiutil verify -quiet ${output}`;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: { app: { type: "string", default: app }, output: { type: "string" } }
  });
  const version = await plistValue(join(values.app, "Contents/Info.plist"), "CFBundleShortVersionString");
  const output = values.output ?? dmgOf(version);
  await makeDmg(values.app, output);
  console.log(`Made ${output}`);
}
