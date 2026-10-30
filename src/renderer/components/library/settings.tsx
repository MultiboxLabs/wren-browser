// The Library's settings: a row for each, its name with what it does in a
// tooltip, and its control at the row's end, as the system's settings are
// laid out.

import { ChevronsUpDown, Info } from "lucide-react";
import type { ReactNode } from "react";
import { archiveAfterOptions, DEFAULT_ARCHIVE_AFTER, type LibrarySettings } from "../../state/library";
import { Button } from "../ui/button";
import { Menu } from "../ui/menu";
import { Tooltip } from "../ui/tooltip";
import { cn } from "../../utils/cn";
import { Empty, matches } from "./rows";

export function Settings({ query, settings }: { query: string; settings: LibrarySettings }) {
  const rows = [
    {
      name: "Archive tabs after",
      about: "How long an unpinned tab can stay untouched before it is closed.",
      control: (
        <Menu
          checked={settings.values.archiveAfter}
          onSelect={(archiveAfter) => settings.update({ archiveAfter })}
          // The menu says which is the default; the button says only what is chosen.
          items={archiveAfterOptions.map(({ id, label }) => ({
            id,
            label: id === DEFAULT_ARCHIVE_AFTER ? `${label} (default)` : label
          }))}
          trigger={
            <Button variant="filled" className="gap-1 pr-1.5 font-medium">
              {archiveAfterOptions.find(({ id }) => id === settings.values.archiveAfter)?.label}
              <ChevronsUpDown size={13} strokeWidth={2} className="shrink-0 glyph-2" />
            </Button>
          }
        />
      )
    },
    {
      name: "Ad Blocker in New Profiles",
      about:
        "Whether the ad blocker starts on in a profile you make. Each profile's can be turned on or off in Profiles.",
      control: (
        <OnOff
          on={settings.values.blockAdsInNewProfiles}
          onChange={(blockAdsInNewProfiles) => settings.update({ blockAdsInNewProfiles })}
        />
      )
    },
    {
      name: "Password Manager",
      about: "Offer to save passwords, and fill them in, in every profile. Off, passwords already saved stay saved.",
      control: (
        <OnOff
          on={settings.values.passwordManager}
          onChange={(passwordManager) => settings.update({ passwordManager })}
        />
      )
    },
    {
      name: "Help Improve Wren",
      about: "Send anonymous counts of which features you use, and crash reports. Never what you browse.",
      control: (
        <OnOff on={settings.values.shareUsageData} onChange={(shareUsageData) => settings.update({ shareUsageData })} />
      )
    }
  ].filter(({ name, about }) => matches(query, name, about));
  if (rows.length === 0) return <Empty>No Settings Found</Empty>;
  return (
    <div className="no-drag flex flex-col px-3">
      {rows.map((row, index) => (
        <SettingRow key={row.name} {...row} separated={index > 0} />
      ))}
    </div>
  );
}

// A setting that is on or off, on by default: a menu of the two, as the
// archive's of its times.
function OnOff({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <Menu
      checked={on ? "on" : "off"}
      onSelect={(chosen) => onChange(chosen === "on")}
      items={[
        { id: "on", label: "On (default)" },
        { id: "off", label: "Off" }
      ]}
      trigger={
        <Button variant="filled" className="gap-1 pr-1.5 font-medium">
          {on ? "On" : "Off"}
          <ChevronsUpDown size={13} strokeWidth={2} className="shrink-0 glyph-2" />
        </Button>
      }
    />
  );
}

function SettingRow({
  name,
  about,
  control,
  separated
}: {
  name: string;
  about: string;
  control: ReactNode;
  /** Under another row, with a line between them. */
  separated: boolean;
}) {
  return (
    <div className={cn("flex min-h-11 items-center gap-2 py-1.5", separated && "border-t border-separator")}>
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        <span className="truncate">{name}</span>
        <Tooltip label={about}>
          <span role="img" aria-label={about} className="grid shrink-0 glyph-2">
            <Info size={14} strokeWidth={1.75} />
          </span>
        </Tooltip>
      </span>
      {control}
    </div>
  );
}
