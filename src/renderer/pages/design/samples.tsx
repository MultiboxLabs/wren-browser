// What wren://design shows of Wren's look (design.tsx has the page): each
// of the shared controls (components/ui) in each of its kinds, then the
// palette, the type and the corners index.css names. They are drawn on the
// window, so they take its scheme and its space's colour as the page's
// theme changes.

import { Bookmark, Plus, Settings } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Menu } from "@/components/ui/menu";
import { Switch } from "@/components/ui/switch";
import { TextField } from "@/components/ui/text-field";

const VARIANTS: ButtonVariant[] = ["plain", "filled", "faint", "raised", "prominent", "bright", "solid", "bare"];

// The palette's named colours, as Tailwind has them (index.css), and the
// space's colour as what is drawn of it alone shows it.
const COLOURS = [
  { name: "fg", className: "bg-fg" },
  { name: "fg-2", className: "bg-fg-2" },
  { name: "fg-3", className: "bg-fg-3" },
  { name: "fg-4", className: "bg-fg-4" },
  { name: "fill", className: "bg-fill" },
  { name: "hover", className: "bg-hover" },
  { name: "pressed", className: "bg-pressed" },
  { name: "selected", className: "bg-selected" },
  { name: "separator", className: "bg-separator" },
  { name: "accent", className: "bg-accent" },
  { name: "prominent", className: "bg-prominent" },
  { name: "raised", className: "bg-raised shadow-raised" },
  { name: "field", className: "bg-field shadow-field" },
  { name: "solid", className: "bg-solid" },
  { name: "danger", className: "bg-danger" },
  { name: "space-shown", className: "bg-(--space-shown)" }
];

const TYPE = [
  { name: "text-ui", size: "13.5px", className: "text-ui" },
  { name: "text-menu-item", size: "13px", className: "text-menu-item" },
  { name: "text-subtitle", size: "12px", className: "text-subtitle" },
  { name: "text-caption", size: "11px", className: "text-caption" }
];

const CORNERS = [
  { name: "favicon", className: "rounded-favicon" },
  { name: "card", className: "rounded-card" },
  { name: "tooltip", className: "rounded-tooltip" },
  { name: "control", className: "rounded-control" },
  { name: "menu", className: "rounded-menu" },
  { name: "tile", className: "rounded-tile" },
  { name: "row", className: "rounded-row" },
  { name: "panel", className: "rounded-panel" },
  { name: "field", className: "rounded-field" },
  { name: "popover", className: "rounded-popover" }
];

type Sort = "name" | "date" | "size";

const SORTS: { id: Sort; label: string }[] = [
  { id: "name", label: "Name" },
  { id: "date", label: "Date Added" },
  { id: "size", label: "Size" }
];

export function Samples() {
  return (
    <>
      <Buttons />
      <Controls />
      <Section title="Colours">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-3">
          {COLOURS.map(({ name, className }) => (
            <Labelled key={name} name={name}>
              <span className={`block h-10 w-full rounded-control ${className}`} />
            </Labelled>
          ))}
        </div>
      </Section>
      <Section title="Type">
        <div className="flex flex-col gap-3">
          {TYPE.map(({ name, size, className }) => (
            <div key={name} className="flex items-baseline justify-between gap-4">
              <span className={className}>Spaces keep separate sets of tabs.</span>
              <span className="shrink-0 text-caption text-fg-3">
                {name} · {size}
              </span>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Corners">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-3">
          {CORNERS.map(({ name, className }) => (
            <Labelled key={name} name={name}>
              <span className={`block size-14 bg-fill ${className}`} />
            </Labelled>
          ))}
        </div>
      </Section>
    </>
  );
}

function Buttons() {
  return (
    <Section title="Buttons">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-4 gap-y-5">
        {VARIANTS.map((variant) => (
          <Labelled key={variant} name={variant}>
            <div className="flex items-center gap-1.5">
              <Button variant={variant}>Button</Button>
              <Button variant={variant} icon={Plus} label="New Tab" />
              <Button variant={variant} disabled>
                Off
              </Button>
            </div>
          </Labelled>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="prominent" shape="large">
          Done
        </Button>
        <Button variant="raised" shape="large">
          Cancel
        </Button>
        <Button variant="plain" icon={Bookmark} label="Bookmark" pressed />
        <Button variant="filled" shape="tile" icon={Settings} label="Settings" className="size-11" />
      </div>
    </Section>
  );
}

function Controls() {
  const [on, setOn] = useState(true);
  const [checked, setChecked] = useState(false);
  const [sort, setSort] = useState<Sort>("name");
  return (
    <Section title="Controls">
      <div className="flex flex-wrap items-center gap-6">
        <label className="flex items-center gap-2">
          <Switch checked={on} onCheckedChange={setOn} />
          Block Ads
        </label>
        <Checkbox checked={checked} onCheckedChange={setChecked}>
          Show Bookmarks
        </Checkbox>
        <Menu
          trigger={<Button variant="raised">Sort by {SORTS.find(({ id }) => id === sort)?.label}</Button>}
          items={SORTS}
          checked={sort}
          onSelect={setSort}
          commands={[{ label: "Reset", onSelect: () => setSort("name") }]}
        />
      </div>
      <div className="flex flex-wrap gap-3">
        <TextField placeholder="Search…" className="w-64" />
        <TextField defaultValue="Personal" className="w-48" />
        <TextField placeholder="Disabled" disabled className="w-40" />
      </div>
    </Section>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-subtitle font-semibold text-fg-3">{title}</h2>
      {children}
    </section>
  );
}

// A sample with its name under it, as index.css or the component names it.
function Labelled({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-1.5">
      {children}
      <span className="text-caption text-fg-3">{name}</span>
    </div>
  );
}
