import { iconUrl } from "@/ipc";
import { enginePage } from "@/utils/url";
import { PAGE_GLYPHS, PageIcon, SITE_GLYPH } from "./page-icon";

/** A site's icon: the tab's own, or else a globe. A Chromium page's is a glyph of ours (page-icon.tsx), in place of the stock one Chromium gives it. */
export function Favicon({
  url,
  icon,
  size = 16
}: {
  url: string;
  /** The ID of the tab's own icon, once the app has given it. */
  icon?: string | null;
  size?: number;
}) {
  const page = enginePage(url);
  const glyph = page !== null && Object.hasOwn(PAGE_GLYPHS, page) ? PAGE_GLYPHS[page] : undefined;
  if (glyph) return <PageIcon glyph={glyph} size={size} />;
  if (icon)
    return <img aria-hidden src={iconUrl(icon)} width={size} height={size} className="shrink-0 rounded-favicon" />;
  return <PageIcon glyph={SITE_GLYPH} size={size} />;
}
