/** A site's icon. Until there are real ones, its first letter on a colour from its address. */
export function Favicon({ url, title, size = 16 }: { url: string; title: string; size?: number }) {
  let hash = 0;
  for (const char of new URL(url).host) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-[4px] font-bold text-white"
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
