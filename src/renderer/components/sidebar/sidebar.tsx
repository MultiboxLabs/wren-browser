// The sidebar: the toolbar beside the window's buttons, the address, the
// favourites, and the space's tabs (tab-list.tsx); or, while the window is
// on no space, the form for a new one (new-space.tsx). At the bottom, a new
// version of Wren, if there is one (update.tsx).

import { Archive, Plus } from "lucide-react";
import { motion, type MotionValue, useMotionValue, useMotionValueEvent, useTransform } from "motion/react";
import { type ReactNode, type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { AddressField } from "@/components/address/field";
import { useAddressBar } from "@/state/address-bar";
import { SidebarIcon } from "@/components/icons";
import { Navigation } from "@/components/address/navigation";
import type { OmniboxState } from "@/components/omnibox/shown";
import { cn } from "@/utils/cn";
import { shortcut } from "@/utils/shortcut";
import { DownloadFlights } from "@/components/downloads/flight";
import { Indicator } from "@/components/downloads/indicator";
import { Shelf, useShelf } from "@/components/downloads/shelf";
import { ArrivalScope } from "./arrival";
import { Favorites } from "./favorites";
import { useItemActions } from "./item-actions";
import { MARKS_MARK } from "./item-drag";
import { MarkingProvider, useSpaceMarking } from "./marking";
import { NewSpaceForm } from "./new-space";
import { SpaceColours } from "./space-colours";
import { useSpaceSwipe } from "./space-swipe";
import { SpaceSwitcher } from "./space-switcher";
import { ListBelowContext } from "./list-edge";
import { TabList } from "./tab-list";
import { UpdateCard } from "./update";
import { BrowserOfSpace, useClearMarks, useNoneSelected, useTab, useTabShape } from "@/state/browser";
import { useDownloadIndicator } from "@/state/downloads";
import { type LibrarySettings, useSettings } from "@/state/library";
import { useItems } from "@/state/items";
import { usePins } from "@/state/pins";
import { type Space, useDrawnSpace, useSpace } from "@/state/space";
import { SLIDE, spacing } from "@/state/space-slide";

export type SidebarProps = {
  /** Docked beside the page: its button hides it, rather than keeps it. */
  open: boolean;
  onToggle: () => void;
  /** The omnibox, which the address and the New Tab row open. */
  omnibox: OmniboxState;
  /** For the address field, whose box the omnibox for the active tab opens over. */
  address: RefObject<HTMLDivElement | null>;
  onOpenLibrary: () => void;
  /** It is out, and not the Library in its place: the downloads' shelf may show by itself. */
  visible: boolean;
};

/** Where a space's content is drawn: the window's (0), or a slot beside it, how many spaces over (negative before). */
type Page = number;

/** The most a space's content fades as it slides out with nothing beside it. */
const FADED = 0.85;

/**
 * How far from showing, in spaces, a space's content has faded out by as the
 * strip glides to a space chosen: the space left is mostly gone by the time
 * the one chosen shows, so the two are seldom seen over each other.
 */
const CROSSFADE = 0.6;

/**
 * How near to showing, in spaces, it is whole again: the one chosen is in
 * full before the glide's long tail, which moves it too little to be seen.
 */
const WHOLE = 0.075;

/**
 * A space's content at `page`, a sidebar's width and a gap from the
 * window's for each page, drawn at the strip's `travel`. One beside the
 * window's takes no pointer, focus or VoiceOver. As the strip glides to a
 * space chosen, each fades by how far it is from showing. Otherwise the
 * window's fades only as it slides the short way a press makes, with
 * nothing beside it; beside another, each stays whole, as fingers move them.
 */
function SpacePage({
  page,
  x,
  pitch,
  travel,
  fades,
  children
}: {
  page: Page;
  x: MotionValue<number>;
  /** How far apart the pages are, in points. */
  pitch: MotionValue<number>;
  /** How much of `x` and `pitch` the pages are drawn at (state/space-slide.ts). */
  travel: MotionValue<number>;
  /** Whether it fades as it moves, read as it moves. */
  fades: () => boolean;
  children: ReactNode;
}) {
  // Set once the page has changed, not as it is drawn: Motion measures its
  // tiles and rows before the change, taking out the offset it has then,
  // which must still be the one on the page.
  const offset = useMotionValue(page * pitch.get());
  useLayoutEffect(() => {
    const place = () => offset.set(page * pitch.get());
    place();
    return pitch.on("change", place);
  }, [page]);
  const shifted = useTransform(() => offset.get() * travel.get());
  const opacity = useTransform(() => {
    const at = x.get();
    const apart = pitch.get();
    if (travel.get() < 1 && apart > 0) {
      const away = Math.abs(at + offset.get()) / apart;
      return Math.min(1, Math.max(0, (CROSSFADE - away) / (CROSSFADE - WHOLE)));
    }
    return fades() ? 1 - Math.min(Math.abs(at) / SLIDE, 1) * FADED : 1;
  });
  return (
    // Every page is laid out in the same place, and moved beside by a
    // transform in points, which Motion takes out as it measures (it can't
    // take out a `calc()`). So as the window switches to a page beside, nothing in it
    // is laid out anywhere new, and its tiles and rows don't slide as if
    // they had moved.
    <motion.div
      inert={page !== 0}
      aria-hidden={page !== 0 || undefined}
      style={{ opacity, x: shifted }}
      className="absolute inset-0 flex min-h-0 flex-col"
    >
      {children}
    </motion.div>
  );
}

export function Sidebar({ open, onToggle, omnibox, address, onOpenLibrary, visible }: SidebarProps) {
  const { space, spaces, profile, newSpace, startNewSpace, show, showNow, slide, beside: drawnBeside } = useSpace();
  // While the omnibox for a new tab is open, the New Tab row is the selected
  // one, and no tab's is.
  useNoneSelected(omnibox.shown?.target === "new-tab");
  // Escape, or a press on anything but a row that can be marked, leaves no
  // row marked: such a row decides for itself (item-actions.tsx).
  const clearMarks = useClearMarks();
  useEffect(() => {
    const over = new AbortController();
    const pressed = (event: PointerEvent) => {
      if (!(event.target as Element).closest(`[${MARKS_MARK}]`)) clearMarks();
    };
    window.addEventListener("pointerdown", pressed, { signal: over.signal, capture: true });
    window.addEventListener("keydown", (event) => event.key === "Escape" && clearMarks(), { signal: over.signal });
    return () => over.abort();
  }, []);
  // A swipe across the sidebar goes to the next space or the previous one;
  // the space being made is after the last.
  const area = useRef<HTMLDivElement>(null);
  // How far apart the spaces' content is side by side, as the sidebar is wide.
  const { pitch } = slide;
  useLayoutEffect(() => {
    const element = area.current;
    if (!element) return;
    const observer = new ResizeObserver(() => pitch.set(spacing(element)));
    observer.observe(element);
    pitch.set(spacing(element));
    return () => observer.disconnect();
  }, []);
  const at = newSpace ? spaces.length : spaces.findIndex(({ id }) => id === space.id);
  const neighbour = (by: 1 | -1) => (at < 0 ? undefined : spaces[at + by]);
  useSpaceSwipe(
    area,
    slide,
    showNow,
    (by) => neighbour(by) !== undefined,
    (by) => {
      const next = neighbour(by);
      if (next) show(next.id);
    }
  );
  const swipe = slide.x;
  const { travel } = slide;
  // Where the strip is drawn: as far as it has moved, at its `travel`.
  const stripX = useTransform(() => swipe.get() * travel.get());
  // Read as the content moves, not as it was drawn.
  const fades = () => !slide.besideNow();
  const content = (drawn: Space, page: Page) => (
    // Each space's own, so one's tabs never leave or arrive in another's.
    <SpaceColours space={drawn}>
      <BrowserOfSpace space={drawn.id}>
        <ListBelowContext value={page === 0 ? below : null}>
          <SpaceContent omnibox={omnibox} address={page === 0 ? address : beside} settings={settings} />
        </ListBelowContext>
      </BrowserOfSpace>
    </SpaceColours>
  );
  const active = useTab(useTabShape().active);
  const addressBar = useAddressBar();
  // Read once for every space's content, not again as each comes in.
  const settings = useSettings(true);
  const indicator = useDownloadIndicator();
  // The latest downloads, over the bottom of the content, which fades out under them.
  const shelf = useShelf(visible && !newSpace);
  // How far the update's card reaches up over the content as it opens; the
  // content is cut off there, as the shelf fades it.
  const update = useMotionValue(0);
  const mask = useTransform(() => {
    const height = update.get();
    const layers = [
      shelf.mask.get(),
      height > 0 ? `linear-gradient(black calc(100% - ${height}px), transparent 0)` : "none"
    ];
    return layers.filter((layer) => layer !== "none").join(", ") || "none";
  });
  // Where the list is cut off, a hairline, while any of it goes on below:
  // at its bottom edge, or where the card reaches. Edge to edge: past the
  // content's padding on the left, and on the right, the floating sidebar's
  // padding or, docked, the gap to the page, as wide; but inside the
  // floating sidebar's 1px edge (`.floating-panel`), which it would otherwise cross.
  const below = useMotionValue(0);
  const edge = useTransform(update, (height) => -height);
  const [cutOff, setCutOff] = useState(false);
  useMotionValueEvent(
    useTransform(() => below.get() + update.get() > 1),
    "change",
    setCutOff
  );
  // Where a download that starts flies to.
  const library = useRef<HTMLDivElement>(null);
  // The address field of a space beside the window's, which nothing opens over.
  const beside = useRef<HTMLDivElement>(null);

  return (
    <div ref={area} className="relative flex h-full flex-col">
      <div className="flex h-10 shrink-0 items-center">
        <div className="w-[calc(var(--window-buttons)-8px)] shrink-0" />
        <Button
          icon={SidebarIcon}
          label={`${open ? "Hide" : "Keep"} Sidebar (${shortcut("S")})`}
          iconSize={19}
          className="ml-1.75"
          onClick={onToggle}
        />
        <div className="flex-1" />
        {/* Atop the page with the address, as the setting may say (address/page-bar.tsx). */}
        {addressBar === "sidebar" && <Navigation tab={active} className="gap-1.5" />}
      </div>

      {/* What slides with a swipe: the space's, below the toolbar. It is
          clipped at the sidebar's sides, with room for the rows' outlines.
          While a space is made, below the toolbar is the form's, not a
          handle for the window: a press that misses a field is no drag. */}
      <motion.div
        style={{ maskImage: mask, maskComposite: "intersect" }}
        className={cn("-mx-2 flex min-h-0 flex-1 flex-col overflow-x-clip px-2", newSpace && "no-drag")}
      >
        {/* Keyed by space, so a space's content drawn beside stays as it
            is as the window switches to it, and only moves to the middle. */}
        <motion.div style={{ x: stripX }} className="relative flex min-h-0 flex-1 flex-col">
          {[
            <SpacePage
              key={newSpace ? "new-space" : space.id}
              page={0}
              x={swipe}
              pitch={pitch}
              travel={travel}
              fades={fades}
            >
              {newSpace ? <NewSpaceForm state={newSpace} /> : content(space, 0)}
            </SpacePage>,
            ...drawnBeside.map(({ slot: page, space: drawn }) => (
              <SpacePage key={drawn.id} page={page} x={swipe} pitch={pitch} travel={travel} fades={fades}>
                {content(drawn, page)}
              </SpacePage>
            ))
          ]}
        </motion.div>
      </motion.div>

      {/* Above the buttons: the update, if there is one, and the shelf over
          the bottom of the content, above it; over them, where the list is
          cut off, its hairline, which the shelf takes the place of while it
          is up, as it sits right above the buttons. */}
      <div className="relative shrink-0">
        <motion.div
          style={{ y: edge }}
          className={cn(
            "pointer-events-none absolute -inset-x-[7px] top-0 h-px bg-(--list-edge) transition-opacity duration-150",
            cutOff && !shelf.shown ? "opacity-100" : "opacity-0"
          )}
        />
        <Shelf shelf={shelf} />
        {!newSpace && <UpdateCard cover={update} />}
      </div>

      {/* While a space is made, only the switcher: the form is left by its own
          buttons, or by another space. */}
      <div className={cn("flex h-12.5 shrink-0 items-center", newSpace && "no-drag")}>
        {!newSpace && (
          <div ref={library} className="relative shrink-0" {...shelf.button}>
            <Button
              icon={Archive}
              label="Library"
              onClick={() => {
                shelf.hide();
                onOpenLibrary();
              }}
            />
            <Indicator indicator={indicator} />
            <DownloadFlights target={library} />
          </div>
        )}
        <div className="flex min-w-0 flex-1 justify-center px-1">
          <SpaceSwitcher />
        </div>
        {/* A window on a profile never switches, so makes no space. */}
        {!profile && !newSpace && <Button icon={Plus} label="New Space" onClick={() => startNewSpace()} />}
      </div>
    </div>
  );
}

type SpaceContentProps = Pick<SidebarProps, "omnibox" | "address"> & { settings: LibrarySettings };

/** What the sidebar shows of the space, below its toolbar: the address, the favourites, the pins and the tabs. */
function SpaceContent({ omnibox, address, settings }: SpaceContentProps) {
  const { profile } = useSpace();
  const space = useDrawnSpace();
  const { active, ready } = useTabShape();
  const current = useTab(active);
  const addressBar = useAddressBar();
  // A window on a profile shows its favourites; a made-up space has none.
  const pins = usePins(profile ? null : space.id > 0 ? space.id : undefined);
  const items = useItems(pins.favorites, pins.pinned);
  const marking = useSpaceMarking(items);
  const { actions, dialog } = useItemActions(pins.setFolderOpen, marking);
  // The space's pins and the settings are mostly read before it is shown
  // (state/pins.tsx, and the sidebar's), but may not be yet, nor its tabs,
  // as it comes in. Once they are, what shows them is made anew, so what is
  // there from the start is simply there, rather than coming in as if new
  // (rows growing in, the pins unfolding); only what changes after moves.
  // Where its tabs and pins were is made anew with them (arrival.ts): the
  // rows made anew are not ones moving from where they were drawn before,
  // which the pins and favourites, read, push down.
  const read = ready && pins.read && settings.read ? "read" : "reading";
  return (
    <>
      {/* Atop the page instead, as the setting may say (tab-view.tsx). What
          comes first below leaves a gap for the field. Without it, that gap
          would add to the room under the toolbar's buttons, so the content
          is pulled up, as far below the sidebar button's icon as favourites
          are apart. */}
      {addressBar === "sidebar" ? (
        <AddressField tab={current} ref={address} onOpenLocation={() => omnibox.toggle("current")} />
      ) : (
        <div aria-hidden className="-mt-2 shrink-0" />
      )}
      <MarkingProvider value={marking}>
        <ArrivalScope key={read}>
          <Favorites
            favorites={items.favorites}
            read={pins.read}
            settled={read === "read"}
            settings={settings}
            actions={actions}
          />
          <TabList omnibox={omnibox} pinned={items.pinned} tabs={items.tabs} actions={actions} />
        </ArrivalScope>
      </MarkingProvider>
      {dialog}
    </>
  );
}
