// The Library's settings: a row for each, its name with what it does in a
// tooltip, and its control at the row's end, as the system's settings are
// laid out.

import { ChevronsUpDown, Info } from "lucide-react";
import type { ReactNode } from "react";
import { archiveAfterOptions, DEFAULT_ARCHIVE_AFTER, type LibrarySettings } from "@/state/library";
import { Button } from "@/components/ui/button";
import { Menu } from "@/components/ui/menu";
import { Switch } from "@/components/ui/switch";
import { Tooltip } from "@/components/ui/tooltip";
import { Empty, matches } from "./rows";

export function Settings({ query, settings }: { query: string; settings: LibrarySettings }) {
  const rows = [
    {
      name: "Archive Tabs After",
      about: "How long a tab you haven’t pinned can go untouched before Wren closes it.",
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
        "Turn the ad blocker on in each profile you make from now on. Off, new profiles start without it. You can change it for each profile in Profiles.",
      control: (
        <Switch
          label="Ad Blocker in New Profiles"
          checked={settings.values.blockAdsInNewProfiles}
          onCheckedChange={(blockAdsInNewProfiles) => settings.update({ blockAdsInNewProfiles })}
        />
      )
    },
    {
      name: "Password Manager",
      about: "Offer to save passwords, and fill them in, in every profile. Off, passwords already saved stay saved.",
      control: (
        <Switch
          label="Password Manager"
          checked={settings.values.passwordManager}
          onCheckedChange={(passwordManager) => settings.update({ passwordManager })}
        />
      )
    },
    {
      name: "Automatic Updates",
      about:
        "Download new versions of Wren in the background, and install them when Wren restarts or quits. Off, Wren asks before it downloads one.",
      control: (
        <Switch
          label="Automatic Updates"
          checked={settings.values.automaticUpdates}
          onCheckedChange={(automaticUpdates) => settings.update({ automaticUpdates })}
        />
      )
    },
    // A Dev build has nothing to update to.
    ...(settings.values.channel === "dev"
      ? []
      : [
          {
            name: "Beta Updates",
            // Never back to an older version: off, a beta stays until a release passes it.
            about:
              settings.values.channel === "beta"
                ? "Get new versions of Wren before they’re released to everyone. Off, Wren stays on this beta until the next release."
                : "Get new versions of Wren before they’re released to everyone.",
            control: (
              <Switch
                label="Beta Updates"
                checked={settings.values.betaUpdates}
                onCheckedChange={(betaUpdates) => settings.update({ betaUpdates })}
              />
            )
          }
        ]),
    {
      name: "Help Improve Wren",
      about: "Send anonymous counts of which features you use, and crash reports. Wren never sends what you browse.",
      control: (
        <Switch
          label="Help Improve Wren"
          checked={settings.values.shareUsageData}
          onCheckedChange={(shareUsageData) => settings.update({ shareUsageData })}
        />
      )
    }
  ].filter(({ name, about }) => matches(query, name, about));
  if (rows.length === 0) return <Empty>No Settings Found</Empty>;
  return (
    <div className="no-drag flex flex-col px-3">
      {rows.map((row) => (
        <SettingRow key={row.name} {...row} />
      ))}
    </div>
  );
}

function SettingRow({ name, about, control }: { name: string; about: string; control: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center gap-2 py-1.5">
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
