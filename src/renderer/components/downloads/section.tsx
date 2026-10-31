// The Library's Downloads: newest first, under how long ago each last
// changed, searched by name, kind, site and address, and filtered by the
// profile each is of (filter.tsx).

import { useEffect, useMemo, useRef } from "react";
import type { Download } from "@/ipc";
import { Empty, matches } from "@/components/library/rows";
import { isRunning, lastChanged, newestFirst, useDownloadHistory } from "@/state/downloads";
import { useNow } from "@/utils/now";
import { ageHeading, origin, siteOf, statusLine } from "./format";
import { DownloadRow } from "./row";

/**
 * The list, searched by `query` (lowercased), and of `profile` only if one
 * is chosen. `revealed` is the download the Library was opened at, scrolled
 * to and chosen.
 */
export function DownloadsSection({
  query,
  profile,
  revealed
}: {
  query: string;
  profile: string | null;
  revealed: string | null;
}) {
  const list = useDownloadHistory();
  const now = useNow();
  const spans = useMemo(() => {
    const bySpan = new Map<string, Download[]>();
    for (const download of [...list].sort(newestFirst)) {
      if (profile && download.profile !== profile) continue;
      if (!matches(query, download.name, download.kind, siteOf(download.url), download.url)) continue;
      // One that runs is today's, whenever it started.
      const span = ageHeading(isRunning(download) ? now : lastChanged(download), now);
      const inSpan = bySpan.get(span);
      if (inSpan) inSpan.push(download);
      else bySpan.set(span, [download]);
    }
    return [...bySpan];
  }, [list, query, profile, now]);

  const box = useRef<HTMLDivElement>(null);
  const any = spans.length > 0;
  useEffect(() => {
    if (!revealed) return;
    box.current?.querySelector(`[data-download="${CSS.escape(revealed)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [revealed, any]);

  if (!any) return <Empty>{query || profile ? "No Downloads Found" : "No Downloads"}</Empty>;
  return (
    // Its first heading clear of the fields above, as a row would be.
    <div ref={box} className="flex flex-col gap-3 pt-2">
      {spans.map(([span, inSpan]) => (
        <section key={span} aria-label={span} className="flex flex-col gap-0.5">
          <h3 className="px-1.5 pb-0.5 text-subtitle font-semibold text-fg-2">{span}</h3>
          {inSpan.map((download) => (
            <DownloadRow
              key={download.id}
              download={download}
              line={statusLine(download) ?? origin(download)}
              selected={download.id === revealed}
            />
          ))}
        </section>
      ))}
    </div>
  );
}
