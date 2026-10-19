import { iconUrl } from "../ipc";
import { host } from "../utils/url";

/** A site's icon: the tab's own, or else its first letter on a colour from its address. */
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
