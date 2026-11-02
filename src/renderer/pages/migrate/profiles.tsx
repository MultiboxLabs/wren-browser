// A source's real profiles, when it has more than one: each comes over or
// not, and lands in a Wren profile, the tab's, another of the user's, or a
// new one of its name.

import { ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Menu } from "@/components/ui/menu";
import { Switch } from "@/components/ui/switch";
import type { Landing, MigrateContext, SourceProfile } from "@/ipc";
import type { ProfileChoice } from "@/state/migrate";
import { Group, Row } from "./group";

// A landing, as the menu's items name it.
const landingId = (landing: Landing) => (landing.kind === "existing" ? `existing:${landing.id}` : landing.kind);

export function Profiles({
  profiles,
  choices,
  context,
  onChange
}: {
  profiles: SourceProfile[];
  choices: Record<string, ProfileChoice>;
  context: MigrateContext;
  onChange: (id: string, choice: Partial<ProfileChoice>) => void;
}) {
  const others = context.profiles.filter(({ id }) => id !== context.profile?.id);
  return (
    <Group title="Profiles">
      {profiles.map((profile) => {
        const choice = choices[profile.id];
        if (!choice) return null;
        const items = [
          { id: "this", label: `This Profile (${context.profile?.name ?? "Wren"})` },
          ...others.map(({ id, name }) => ({ id: `existing:${id}`, label: name })),
          { id: "new", label: `New Profile “${profile.name}”` }
        ];
        const landing = choice.landing;
        const label =
          landing.kind === "this"
            ? "This profile"
            : landing.kind === "new"
              ? "New profile"
              : (others.find(({ id }) => id === landing.id)?.name ?? "Profile");
        return (
          <Row
            key={profile.id}
            icon={
              <span className="grid size-6.5 shrink-0 place-items-center rounded-full bg-(--space) text-[12px] font-semibold text-white">
                {profile.name[0]}
              </span>
            }
            name={profile.name}
          >
            <Menu
              trigger={
                <Button variant="plain" className="glyph-2" disabled={!choice.on}>
                  {label}
                  <ChevronsUpDown size={12} />
                </Button>
              }
              items={items}
              checked={landingId(landing)}
              onSelect={(id) =>
                onChange(profile.id, {
                  landing:
                    id === "this"
                      ? { kind: "this" }
                      : id === "new"
                        ? { kind: "new", name: profile.name }
                        : { kind: "existing", id: id.slice("existing:".length) }
                })
              }
            />
            <Switch label={profile.name} checked={choice.on} onCheckedChange={(on) => onChange(profile.id, { on })} />
          </Row>
        );
      })}
    </Group>
  );
}
