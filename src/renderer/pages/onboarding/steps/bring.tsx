// What comes over from the browser the import step chose, as wren://migrate
// asks: its profiles, if it has more than one, and each thing they have,
// each with a switch, and which extensions. Import starts the run at once,
// and the next step shows it (migrating.tsx). Each profile comes into a new
// one of its name, and the empty profile Wren started on goes
// (src/main/onboarding.rs).

import { useState } from "react";
import { ExtensionsDialog } from "@/components/migrate/extensions-dialog";
import { ProfileAvatar } from "@/components/migrate/profile-avatar";
import { ThingIcon } from "@/components/migrate/thing-icons";
import { detail, NAMES } from "@/components/migrate/thing-text";
import { Loading } from "@/components/library/rows";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { onboardingMigrate } from "@/ipc";
import { Group, GroupRow } from "@/pages/onboarding/group";
import { Split } from "@/pages/onboarding/split";
import type { StepProps } from "@/pages/onboarding/step";

export function Bring({ migrate, next, back, finishing, last }: StepProps) {
  const [choosing, setChoosing] = useState(false);
  const { source } = migrate;
  const name = source?.name ?? "your browser";
  const go = () => {
    void migrate.start();
    next({ spaces: migrate.things.includes("spaces") });
  };
  return (
    <Split
      title="Choose what comes over"
      body={`From ${name}. It all stays on this Mac.`}
      back={back}
      go={go}
      goLabel="Import"
      canGo={migrate.canStart}
      last={last}
      finishing={finishing}
    >
      <div className="-mx-2 flex max-h-full flex-col gap-4 overflow-y-auto px-2 py-6 scrollbar-none">
        {migrate.needsAccess && (
          <Group>
            <div className="flex items-center gap-3 px-3.5 py-2.5 text-onboarding-option-body">
              <span className="flex-1 text-fg-2">
                Wren needs Full Disk Access to read {name}’s things. Allow it, then come back here.
              </span>
              <Button variant="raised" onClick={() => void onboardingMigrate.openAccessSettings()}>
                Open Settings
              </Button>
            </div>
          </Group>
        )}
        {source && source.profiles.length > 1 && (
          <Group title="Profiles">
            {source.profiles.map((profile) => {
              const choice = migrate.profiles[profile.id];
              if (!choice) return null;
              return (
                <GroupRow
                  key={profile.id}
                  icon={
                    <ProfileAvatar
                      name={profile.name}
                      picture={profile.picture}
                      className="bg-inverse text-on-inverse"
                    />
                  }
                  name={profile.name}
                >
                  <Switch
                    label={profile.name}
                    checked={choice.on}
                    onCheckedChange={(on) => migrate.setProfile(profile.id, { on })}
                  />
                </GroupRow>
              );
            })}
          </Group>
        )}
        {migrate.summaries.length > 0 && (
          <Group title="Things">
            {migrate.summaries.map((summary) => (
              <GroupRow
                key={summary.thing}
                icon={<ThingIcon thing={summary.thing} size={26} />}
                name={NAMES[summary.thing]}
              >
                {summary.thing === "extensions" ? (
                  <button
                    className="text-subtitle text-fg-3 tabular-nums hover:underline"
                    onClick={() => setChoosing(true)}
                  >
                    {migrate.chosenExtensions.size} of {migrate.storeExtensions.length} · Choose…
                  </button>
                ) : (
                  <span className="text-subtitle text-fg-3 tabular-nums">{detail(summary)}</span>
                )}
                <Switch
                  label={NAMES[summary.thing]}
                  checked={migrate.isOn(summary.thing)}
                  onCheckedChange={(on) => migrate.setOn(summary.thing, on)}
                />
              </GroupRow>
            ))}
          </Group>
        )}
        {!migrate.surveyed && !migrate.needsAccess && <Loading />}
        {migrate.surveyed && !migrate.needsAccess && migrate.summaries.length === 0 && (
          <p className="py-3 text-center text-subtitle text-fg-3">{name} has nothing to bring over.</p>
        )}
      </div>
      <ExtensionsDialog
        open={choosing}
        onOpenChange={setChoosing}
        extensions={migrate.storeExtensions}
        chosen={migrate.chosenExtensions}
        onChoose={migrate.setExtensions}
      />
    </Split>
  );
}
