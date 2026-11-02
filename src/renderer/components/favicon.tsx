import { iconUrl } from "@/ipc";
import { enginePage, ownPage } from "@/utils/url";
import { OWN_PAGE_GLYPHS, PAGE_GLYPHS, PageIcon, SITE_GLYPH } from "./page-icon";

/** One of `glyphs`, by a page's host, if it has one. */
const glyphOf = (glyphs: typeof PAGE_GLYPHS, page: string | null) =>
  page !== null && Object.hasOwn(glyphs, page) ? glyphs[page] : undefined;

/**
 * A site's icon: the tab's own, or else a globe. A Chromium page's, and one of Wren's own, is a glyph of ours
 * (page-icon.tsx), in the text's colour, in place of one the page gives.
 */
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
  const glyph = glyphOf(PAGE_GLYPHS, enginePage(url)) ?? glyphOf(OWN_PAGE_GLYPHS, ownPage(url));
  if (glyph) return <PageIcon glyph={glyph} size={size} />;
  if (icon)
    return <img aria-hidden src={iconUrl(icon)} width={size} height={size} className="shrink-0 rounded-favicon" />;
  return <PageIcon glyph={SITE_GLYPH} size={size} />;
}
