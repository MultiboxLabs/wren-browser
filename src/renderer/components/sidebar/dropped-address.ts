// A web address dragged to the tab list from outside it, like a link, or a
// file dropped from Finder, which opens on its `file://` address as in Chrome.

import { hasApp } from "../../ipc";

/** Whether a drag carries an address. What it is only shows once it is dropped. */
export const carriesAddress = (data: DataTransfer) =>
  data.types.includes("text/uri-list") || data.types.includes("Files");

/**
 * The addresses a drop carries, in order: each file's, as Chrome opens a tab
 * for each, or else a link's. Empty if it has none.
 */
export function addressesOf(data: DataTransfer) {
  const paths = hasApp ? [...data.files].map((file) => wren.pathForFile(file)) : [];
  const files = paths.filter((path) => path !== null).map(fileAddress);
  if (files.length > 0) return files;
  const line = data
    .getData("text/uri-list")
    .split(/\r?\n/)
    .find((each) => each && !each.startsWith("#"));
  return line && /^(https?|file):\/\//.test(line) ? [line] : [];
}

// The `file://` address of an absolute path, each part of it escaped.
const fileAddress = (path: string) => `file://${path.split("/").map(encodeURIComponent).join("/")}`;
