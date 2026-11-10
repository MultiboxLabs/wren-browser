// Where the page's address shows, as Address Bar in the Library's settings
// says (db/settings.rs): atop the sidebar, or atop the page, in its card
// (components/tab-view.tsx). A split shows each side's address atop it
// either way. Chromium's bubbles hang off the one the setting names, and
// the omnibox for the active tab opens over it.

import { createContext, useContext } from "react";
import type { AddressBar } from "@/ipc";
import { useWindowSetting } from "./window-setting";

/** The setting, read and followed: undefined until the app says, and the sidebar with no app. */
export const useAddressBarSetting = () => useWindowSetting("addressBar", "sidebar");

/** The window's setting, to everything in it. */
export const AddressBarContext = createContext<AddressBar>("sidebar");

/** Where the page's address shows. */
export const useAddressBar = () => useContext(AddressBarContext);

/** A page in a card has its address bar atop it: while the setting puts it there, and in a split either way. */
export const hasPageBar = (setting: AddressBar, split: boolean) => setting === "top" || split;
