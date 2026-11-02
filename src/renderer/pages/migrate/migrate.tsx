// wren://migrate: bringing the user's things over from the browser they used
// before, in a tab. A sky with the wren migrating from the old browser to
// Wren, and under it the app's own UI: the browsers to choose from, their
// profiles, what comes over, and the button. It calls the app through Wren
// Components (`migrate`, ipc/migrate.ts); its state is state/migrate.ts.

import { motion, MotionConfig } from "motion/react";
import { type ReactNode, useLayoutEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { migrate } from "@/ipc";
import { useMigrate } from "@/state/migrate";
import { useSystemScheme } from "@/state/window";
import { ExtensionsDialog } from "./extensions-dialog";
import { Destination, Profiles } from "./profiles";
import { type Flight, Sky } from "./sky";
import { Sources } from "./sources";
import { ChooseThings, FlyingThings } from "./things";

export function Migrate() {
  const scheme = useSystemScheme();
  useLayoutEffect(() => {
    document.documentElement.dataset.scheme = scheme;
  }, [scheme]);

  const state = useMigrate();
  // The column is scrolled: its edge under the sky blurs.
  const [scrolled, setScrolled] = useState(false);
  const { phase, run, source, sources } = state;
  const flightSource = run && phase !== "choose" ? sources?.find(({ id }) => id === run.source) : source;

  return (
    <MotionConfig reducedMotion="user">
      <TooltipProvider>
        {/* The sky stays; the column under it scrolls. */}
        <main className="flex h-screen flex-col overflow-hidden">
          <Sky source={flightSource} flight={flight(state)} />
          <div className="relative min-h-0 flex-1">
            <div
              className="migrate-scroll h-full overflow-y-auto"
              onScroll={(event) => setScrolled(event.currentTarget.scrollTop > 0)}
            >
              {/* Each phase rises into place as it comes; the last one goes at once.
                  Choosing shows its heading at once, and the rest as it is read. */}
              <motion.div
                key={phase === "loading" ? "choose" : phase}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="mx-auto flex w-full max-w-[552px] flex-col items-center px-4 pb-16"
              >
                <Content state={state} />
              </motion.div>
            </div>
            {/* Clear of the scrollbar. */}
            <div
              aria-hidden
              data-shown={scrolled}
              className="migrate-scroll-edge pointer-events-none absolute top-0 right-3.5 left-0 h-12"
            />
          </div>
        </main>
      </TooltipProvider>
    </MotionConfig>
  );
}

// How far the wren has come: the share of the run's things that has landed.
function flight({ phase, run }: ReturnType<typeof useMigrate>): Flight {
  if (phase === "landed") return "landed";
  if (phase !== "flying" || !run) return "waiting";
  const shares = run.things.map(({ state, done, total }) =>
    state === "landed" || state === "failed" ? 1 : total ? done / total : 0
  );
  return shares.reduce((sum, share) => sum + share, 0) / Math.max(1, shares.length);
}

function Content({ state }: { state: ReturnType<typeof useMigrate> }) {
  const { phase, error } = state;
  switch (phase) {
    case "loading":
      return error ? <Heading title="Something went" flourish="astray" body={error} /> : <Choose state={state} />;
    case "incognito":
      return (
        <Heading
          title="Not from"
          flourish="here"
          body="Open wren://migrate in a normal window to bring your things over."
        />
      );
    case "none":
      return <Heading title="No other browsers" flourish="nearby" body="Wren found no other browser on this Mac." />;
    case "flying":
      return (
        <>
          <Heading
            title="On the"
            flourish="wing"
            body="Keep browsing if you like. This tab shows when everything has landed."
          />
          <div className="mt-8 w-full">
            <FlyingThings things={state.run!.things} />
          </div>
        </>
      );
    case "landed":
      return <Landed state={state} />;
    case "choose":
      return <Choose state={state} />;
  }
}

function Heading({ title, flourish, body }: { title: string; flourish: string; body: ReactNode }) {
  return (
    <header className="mt-10 flex flex-col items-center gap-3 text-center">
      <h1 className="text-[44px] leading-[1.06] tracking-[-0.03em] text-balance">
        {title} <em className="migrate-serif">{flourish}</em>
      </h1>
      <p className="max-w-[520px] text-[16px] leading-[1.45] text-(--fg-quiet)">{body}</p>
    </header>
  );
}

function Choose({ state }: { state: ReturnType<typeof useMigrate> }) {
  const [choosing, setChoosing] = useState(false);
  const { source, sources, context } = state;
  const heading = (
    <Heading
      title="Time to"
      flourish="migrate"
      body="Bring your things over from the browser you used before. It all stays on this Mac."
    />
  );
  if (!sources || !context) return heading;
  return (
    <>
      {heading}
      <div className="mt-6.5">
        <Sources sources={sources} chosen={source?.id} onChoose={state.chooseSource} />
      </div>
      <div className="mt-5.5 flex w-full flex-col gap-4">
        {source && source.profiles.length > 1 && (
          <Profiles profiles={source.profiles} choices={state.profiles} context={context} onChange={state.setProfile} />
        )}
        {state.needsAccess && <AccessNotice />}
        {state.summaries.length > 0 && (
          <ChooseThings
            summaries={state.summaries}
            isOn={state.isOn}
            setOn={state.setOn}
            extensions={
              <button
                className="text-[13px] text-(--fg-faint) tabular-nums hover:underline"
                onClick={() => setChoosing(true)}
              >
                {state.chosenExtensions.size} of {state.storeExtensions.length} · Choose…
              </button>
            }
          />
        )}
        {source?.profiles.length === 1 && state.summaries.length > 0 && (
          <Destination
            profiles={source.profiles}
            choices={state.profiles}
            context={context}
            onChange={state.setProfile}
          />
        )}
        {state.surveyed && !state.needsAccess && state.summaries.length === 0 && (
          <p className="py-3 text-center text-[13px] text-(--fg-faint)">{source?.name} has nothing to bring over.</p>
        )}
        {source && (
          <Button
            variant="solid"
            shape="none"
            className="-mt-0.5 h-11 w-full justify-center rounded-[12px] text-[15px]"
            disabled={!state.canStart}
            onClick={() => void state.start()}
          >
            Migrate from {source.name}
          </Button>
        )}
      </div>
      <ExtensionsDialog
        open={choosing}
        onOpenChange={setChoosing}
        extensions={state.storeExtensions}
        chosen={state.chosenExtensions}
        onChoose={state.setExtensions}
      />
    </>
  );
}

// macOS keeps some of what the source has from Wren until the user allows it.
function AccessNotice() {
  return (
    <div className="flex items-center gap-3 rounded-[12px] bg-(--group) px-3.5 py-3 text-[13px]">
      <span className="flex-1 text-(--fg-quiet)">
        Wren needs Full Disk Access to read this browser’s things. Allow it, then come back here.
      </span>
      <Button variant="filled" onClick={() => void migrate.openAccessSettings()}>
        Open Settings
      </Button>
    </div>
  );
}

function Landed({ state }: { state: ReturnType<typeof useMigrate> }) {
  const things = state.run!.things;
  const failed = things.some(({ state }) => state === "failed");
  const name = state.sources?.find(({ id }) => id === state.run!.source)?.name ?? "your old browser";
  return (
    <>
      <Heading
        title={failed ? "Most of it" : "Everything has"}
        flourish="landed"
        body={`Your things from ${name} are in Wren now.`}
      />
      <div className="mt-8 flex w-full flex-col gap-4">
        <FlyingThings things={things} />
        <Button variant="plain" className="self-center text-(--fg-quiet)" onClick={state.again}>
          Migrate from Another Browser
        </Button>
      </div>
    </>
  );
}
