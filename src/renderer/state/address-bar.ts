// Where the page's address shows, as Address Bar in the Library's settings
// says (db/settings.rs): atop the sidebar, or atop the page, in its card
// (components/tab-view.tsx), the active side's in a split. Chromium's
// bubbles hang off it, and the omnibox for the active tab opens over it.

import { createContext, useContext } from "react";
import type { AddressBar } from "@/ipc";
import { useWindowSetting } from "./window-setting";

/** The setting, read and followed: undefined until the app says, and the sidebar with no app. */
export const useAddressBarSetting = () => useWindowSetting("addressBar", "sidebar");

/** The window's setting, to everything in it. */
export const AddressBarContext = createContext<AddressBar>("sidebar");

/** Where the page's address shows. */
export const useAddressBar = () => useContext(AddressBarContext);
