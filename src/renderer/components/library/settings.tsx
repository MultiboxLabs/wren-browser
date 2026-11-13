// The Library's settings, in groups under their names: a row for each, its
// name with what it does in a tooltip, and its control at the row's end, as
// the system's settings are laid out. A search keeps the rows it matches, or
// a whole group whose name it matches.

import { ChevronsUpDown, Info } from "lucide-react";
import type { ReactNode } from "react";
import type { AddressBar } from "@/ipc";
import { archiveAfterOptions, DEFAULT_ARCHIVE_AFTER, type LibrarySettings } from "@/state/library";
import { Button } from "@/components/ui/button";
import { Menu } from "@/components/ui/menu";
import { Switch } from "@/components/ui/switch";
import { Tooltip } from "@/components/ui/tooltip";
import { Empty, matches } from "./rows";

/** Where the page's address can show, as the Address Bar menu names each place. */
const addressBarOptions: { id: AddressBar; label: string }[] = [
  { id: "sidebar", label: "Sidebar" },
  { id: "top", label: "Above Page" }
];

type Setting = { name: string; about: string; control: ReactNode };
type Group = { name: string; settings: Setting[] };

export function Settings({ query, settings }: { query: string; settings: LibrarySettings }) {
  const { values, update } = settings;
  // A switch named as its row is, for VoiceOver.
  const toggle = (name: string, checked: boolean, onChange: (on: boolean) => void) => (
    <Switch label={name} checked={checked} onCheckedChange={onChange} />
  );
  const groups: Group[] = [
    {
      name: "Appearance",
      settings: [
        {
          name: "Window Margins",
          about: "Leave a gap round the page, or let it fill the window.",
          control: toggle("Window Margins", values.windowMargins, (windowMargins) => update({ windowMargins }))
        },
        {
          name: "Address Bar",
          about: "Show the page’s address in the sidebar, or above the page.",
          control: (
            <ChoiceMenu
              options={addressBarOptions}
              chosen={values.addressBar}
              onChoose={(addressBar) => update({ addressBar })}
            />
          )
        }
      ]
    },
    {
      name: "Tabs",
      settings: [
        {
          name: "Archive Tabs After",
          about: "Close tabs you haven’t pinned once they’ve gone unused this long.",
          control: (
            <ChoiceMenu
              options={archiveAfterOptions}
              chosen={values.archiveAfter}
              byDefault={DEFAULT_ARCHIVE_AFTER}
              onChoose={(archiveAfter) => update({ archiveAfter })}
            />
          )
        }
      ]
    },
    {
      name: "Privacy & Security",
      settings: [
        {
          name: "Ad Blocker in New Profiles",
          about: "Block ads in each new profile. You can change it for each profile in Profiles.",
          control: toggle("Ad Blocker in New Profiles", values.blockAdsInNewProfiles, (blockAdsInNewProfiles) =>
            update({ blockAdsInNewProfiles })
          )
        },
        {
          name: "Help Improve Wren",
          about: "Send anonymous feature counts and crash reports. Wren never sends what you browse.",
          control: toggle("Help Improve Wren", values.shareUsageData, (shareUsageData) => update({ shareUsageData }))
        }
      ]
    },
    {
      name: "Autofill & Passwords",
      settings: [
        {
          name: "Password Manager",
          about: "Offer to save and fill passwords. Turning it off keeps the ones already saved.",
          control: toggle("Password Manager", values.passwordManager, (passwordManager) => update({ passwordManager }))
        },
        {
          name: "Form Autofill",
          about: "Fill in forms with your saved addresses, cards and what you’ve typed before.",
          control: toggle("Form Autofill", values.autofill, (autofill) => update({ autofill }))
        }
      ]
    },
    {
      name: "Updates",
      settings: [
        {
          name: "Automatic Updates",
          about: "Download updates in the background, and install them when Wren quits, instead of asking first.",
          control: toggle("Automatic Updates", values.automaticUpdates, (automaticUpdates) =>
            update({ automaticUpdates })
          )
        },
        // A Dev build has nothing to update to.
        ...(values.channel === "dev"
          ? []
          : [
              {
                name: "Beta Updates",
                // Never back to an older version: off, a beta stays until a release passes it.
                about:
                  values.channel === "beta"
                    ? "Get new versions before everyone else. Turning it off keeps you on this beta until the next release."
                    : "Get new versions before everyone else.",
                control: toggle("Beta Updates", values.betaUpdates, (betaUpdates) => update({ betaUpdates }))
              }
            ])
      ]
    }
  ];
  const shown = groups
    .map((group) => ({
      ...group,
      settings: matches(query, group.name)
        ? group.settings
        : group.settings.filter(({ name, about }) => matches(query, name, about))
    }))
    .filter((group) => group.settings.length > 0);
  if (shown.length === 0) return <Empty>No Settings Found</Empty>;
  return (
    <div className="no-drag flex flex-col gap-3 px-3">
      {shown.map((group) => (
        <section key={group.name} className="flex flex-col">
          <h3 className="flex h-6 items-center text-caption font-semibold text-fg-3">{group.name}</h3>
          {group.settings.map((setting) => (
            <SettingRow key={setting.name} {...setting} />
          ))}
        </section>
      ))}
    </div>
  );
}

function SettingRow({ name, about, control }: Setting) {
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

/**
 * A setting with a few choices: a button that says the one chosen, and a menu
 * of them all. `byDefault`: the menu marks it "(default)"; the button says
 * only what is chosen.
 */
function ChoiceMenu<Id extends string>({
  options,
  chosen,
  byDefault,
  onChoose
}: {
  options: { id: Id; label: string }[];
  chosen: Id;
  byDefault?: Id;
  onChoose: (id: Id) => void;
}) {
  return (
    <Menu
      checked={chosen}
      onSelect={onChoose}
      items={options.map(({ id, label }) => ({ id, label: id === byDefault ? `${label} (default)` : label }))}
      trigger={
        <Button variant="filled" className="gap-1 pr-1.5 font-medium">
          {options.find(({ id }) => id === chosen)?.label}
          <ChevronsUpDown size={13} strokeWidth={2} className="shrink-0 glyph-2" />
        </Button>
      }
    />
  );
}
