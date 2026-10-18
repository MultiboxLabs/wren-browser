// A web address dragged to the tab list from outside it, like a link.

// TODO: Open a file dropped from Finder, as Chrome does (a tab on its
// `file://` address). The page is given a `File` with no path, and the Wren
// runtime has no call that gives one, so only a link opens for now. Once the
// runtime has one, take a drag of "Files" here too, and let `file:` through
// in `addressOf` and in `open_at` (src/main/tabs.rs), which allow only web
// addresses.

/** Whether a drag carries an address. What it is only shows once it is dropped. */
export const carriesAddress = (data: DataTransfer) => data.types.includes("text/uri-list");

/** The web address a drop carries, if it has one. */
export function addressOf(data: DataTransfer) {
  const line = data
    .getData("text/uri-list")
    .split(/\r?\n/)
    .find((each) => each && !each.startsWith("#"));
  return line && /^https?:\/\//.test(line) ? line : null;
}
