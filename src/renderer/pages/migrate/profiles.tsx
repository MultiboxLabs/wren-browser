// Where a source's profiles land: each in a Wren profile, the tab's, another
// of the user's, or a new one of its name. A source with several lists them,
// each to come over or not (`Profiles`); one with a single profile asks only
// where its things go (`Destination`), as it is no choice of the user's.

import { ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Menu } from "@/components/ui/menu";
import { Switch } from "@/components/ui/switch";
import type { Landing, MigrateContext, SourceProfile } from "@/ipc";
import type { ProfileChoice } from "@/state/migrate";
import { Group, Row } from "./group";

type Props = {
  profiles: SourceProfile[];
  choices: Record<string, ProfileChoice>;
  context: MigrateContext;
  onChange: (id: string, choice: Partial<ProfileChoice>) => void;
};

export function Profiles({ profiles, choices, context, onChange }: Props) {
  return (
    <Group title="Profiles">
      {profiles.map((profile) => {
        const choice = choices[profile.id];
        if (!choice) return null;
        return (
          <Row key={profile.id} icon={<Avatar name={profile.name} />} name={profile.name}>
            <LandingMenu
              profile={profile}
              landing={choice.landing}
              context={context}
              disabled={!choice.on}
              onChange={(landing) => onChange(profile.id, { landing })}
            />
            <Switch label={profile.name} checked={choice.on} onCheckedChange={(on) => onChange(profile.id, { on })} />
          </Row>
        );
      })}
    </Group>
  );
}

/** The one profile's things, and the Wren profile they go into. */
export function Destination({ profiles: [profile], choices, context, onChange }: Props) {
  const choice = profile && choices[profile.id];
  if (!choice) return null;
  return (
    <Group>
      <Row icon={<Avatar name={landingName(choice.landing, context)} />} name="Bring into">
        <LandingMenu
          profile={profile}
          landing={choice.landing}
          context={context}
          onChange={(landing) => onChange(profile.id, { landing })}
        />
      </Row>
    </Group>
  );
}

// The Wren profile a landing names.
function landingName(landing: Landing, context: MigrateContext) {
  switch (landing.kind) {
    case "this":
      return context.profile?.name ?? "Wren";
    case "existing":
      return context.profiles.find(({ id }) => id === landing.id)?.name ?? "Profile";
    case "new":
      return landing.name;
  }
}

// A landing, as the menu's items name it.
const landingId = (landing: Landing) => (landing.kind === "existing" ? `existing:${landing.id}` : landing.kind);

function LandingMenu({
  profile,
  landing,
  context,
  disabled,
  onChange
}: {
  profile: SourceProfile;
  landing: Landing;
  context: MigrateContext;
  disabled?: boolean;
  onChange: (landing: Landing) => void;
}) {
  const others = context.profiles.filter(({ id }) => id !== context.profile?.id);
  const items = [
    { id: "this", label: `This Profile (${context.profile?.name ?? "Wren"})` },
    ...others.map(({ id, name }) => ({ id: `existing:${id}`, label: name })),
    { id: "new", label: `New Profile “${profile.name}”` }
  ];
  const label = landing.kind === "new" ? `New “${landing.name}”` : landingName(landing, context);
  return (
    <Menu
      trigger={
        <Button variant="plain" className="text-[13px] text-(--fg-faint)" disabled={disabled}>
          {label}
          <ChevronsUpDown size={12} />
        </Button>
      }
      items={items}
      checked={landingId(landing)}
      onSelect={(id) =>
        onChange(
          id === "this"
            ? { kind: "this" }
            : id === "new"
              ? { kind: "new", name: profile.name }
              : { kind: "existing", id: id.slice("existing:".length) }
        )
      }
    />
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <span className="grid size-6.5 shrink-0 place-items-center rounded-full bg-(--space) text-[12px] font-semibold text-white">
      {name[0]}
    </span>
  );
}
