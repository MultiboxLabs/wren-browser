import { iconUrl } from "../ipc";
import { enginePage, host } from "../utils/url";
import { PAGE_GLYPHS, PageIcon } from "./page-icon";

/** A site's icon: the tab's own, or else its first letter on a colour from its address. A Chromium page's is a glyph of ours (page-icon.tsx), in place of the stock one Chromium gives it. */
export function Favicon({
  url,
  title,
  icon,
  size = 16
}: {
  url: string;
  title: string;
  /** The ID of the tab's own icon, once the app has given it. */
  icon?: string | null;
  size?: number;
}) {
  const page = enginePage(url);
  const glyph = page !== null && Object.hasOwn(PAGE_GLYPHS, page) ? PAGE_GLYPHS[page] : undefined;
  if (glyph) return <PageIcon glyph={glyph} size={size} />;
  if (icon)
    return <img aria-hidden src={iconUrl(icon)} width={size} height={size} className="shrink-0 rounded-favicon" />;
  let hash = 0;
  for (const char of host(url)) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-favicon font-bold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.62,
        background: `oklch(0.62 0.17 ${Math.abs(hash) % 360})`
      }}
    >
      {title[0]}
    </span>
  );
}
