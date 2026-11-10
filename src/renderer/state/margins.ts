// Whether the window leaves a gap round the page, as Window Margins in the
// Library's settings says (db/settings.rs). Off, the page fills the window
// (pages/ui/app.tsx).

import { createContext, useContext } from "react";
import { useWindowSetting } from "./window-setting";

/** The setting, read and followed: undefined until the app says, and on with no app. */
export const useWindowMarginsSetting = () => useWindowSetting("windowMargins", true);

/** The window's setting, to everything in it. */
export const WindowMarginsContext = createContext(true);

/** Whether the window leaves a gap round the page. */
export const useWindowMargins = () => useContext(WindowMarginsContext);
