// The Library's spaces, under the profile each belongs to, each drawn with its
// theme.

import type { ProfileEntry, SpaceEntry } from "../../ipc";
import { SpaceIcon } from "../space-icon";
import { ThemeSwatch } from "../theme-swatch";
import { Empty, type ListProps, Loading, LoadFailed, matches, Row } from "./rows";

export function Spaces({
  query,
  selected,
  onSelect,
  profiles,
  spaces,
  failed,
  onReload
}: ListProps & {
  /** Null until the app has listed them. */
  profiles: ProfileEntry[] | null;
  spaces: SpaceEntry[] | null;
  /** The app could not list the profiles or the spaces. */
  failed: boolean;
  onReload: () => void;
}) {
  if (!profiles || !spaces) return failed ? <LoadFailed what="Spaces" onRetry={onReload} /> : <Loading />;
  const groups = profiles
    .map((profile) => ({
      profile,
      spaces: spaces.filter(
        (space) => space.profile === profile.id && (matches(query, space.name) || matches(query, profile.name))
      )
    }))
    .filter((group) => group.spaces.length > 0);
  if (groups.length === 0) return <Empty>No Spaces Found</Empty>;
  return (
    <div className="flex flex-col gap-2">
      {groups.map(({ profile, spaces }) => (
        <section key={profile.id} className="flex flex-col gap-0.5">
          <h3 className="flex h-6 items-center pl-2.5 text-caption font-semibold text-fg-3">{profile.name}</h3>
          {spaces.map((space) => (
            <Row
              key={space.id}
              selected={String(space.id) === selected}
              onPress={() => onSelect(String(space.id))}
              tile={
                <ThemeSwatch theme={space.theme} className="size-9 rounded-[9px]">
                  <SpaceIcon icon={space.icon} />
                </ThemeSwatch>
              }
              title={space.name}
            />
          ))}
        </section>
      ))}
    </div>
  );
}
