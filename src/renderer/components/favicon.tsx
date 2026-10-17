import { host } from "../utils/url";

/** A site's icon: the tab's own, or else its first letter on a colour from its address. */
export function Favicon({
  url,
  title,
  src,
  size = 16
}: {
  url: string;
  title: string;
  src?: string | null;
  size?: number;
}) {
  if (src) return <img aria-hidden src={src} width={size} height={size} className="shrink-0 rounded-favicon" />;
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
