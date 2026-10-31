// The page info button, and the popover it opens: what can be done with the
// page, the extensions, the site's permissions, and how its connection
// stands. What it shows is Chromium's, for the active tab; every change goes
// back to it. The button is in the sidebar's address field, and in a popup's
// address bar (pages/ui/popup.tsx), where the popover has what a popup has.

import {
  AppWindow,
  Bell,
  Bluetooth,
  Camera,
  Check,
  Clipboard,
  Code,
  Cookie,
  Cpu,
  Download,
  Ellipsis,
  ExternalLink,
  Gamepad2,
  Image,
  Link,
  Lock,
  MapPin,
  Mic,
  Music,
  PictureInPicture2,
  Pin,
  Plus,
  Puzzle,
  RotateCw,
  Settings2,
  Shield,
  TriangleAlert,
  Type,
  Usb,
  Vibrate,
  Volume2
} from "lucide-react";
import { motion } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  browser,
  type ExtensionAction,
  extensions,
  iconUrl,
  type Site,
  sidePanel,
  site,
  type SitePermission
} from "@/ipc";
import { Anchor } from "@/components/ui/anchor";
import { Button, type Icon } from "@/components/ui/button";
import { Popover } from "@/components/ui/popover";
import { press } from "@/components/ui/press";
import { Tooltip } from "@/components/ui/tooltip";
import { isNewTab } from "@/utils/url";
import { InsecureIcon, PageInfoIcon } from "@/components/icons";
import { type SidePanelId, sidePanels } from "@/components/side-panel";
import { useBrowser, useSite } from "@/state/browser";
import type { Tab } from "@/state/space";
import { cn } from "@/utils/cn";

/** Where the Extensions section's add button goes. */
const STORE = "https://chromewebstore.google.com";

/** The side panels the popover's first row opens and closes. */
const quickPanels: SidePanelId[] = ["ReadingList", "Bookmarks", "ReadAnything"];

/**
 * The page info button, which the site's bubbles hang off (its mark is
 * "page-info"), and which opens the popover. `popup`: in a popup's address
 * bar, near the window's side, it is round and faintly filled, as
 * Chromium's there is, and its popover may come nearer the side, for its
 * arrow to point at the button from off the popover's rounded corner.
 */
export function PageInfoButton({
  tab,
  actions = [],
  popup = false
}: {
  tab?: Tab;
  actions?: ExtensionAction[];
  popup?: boolean;
}) {
  const site = useSite();
  // A button is pressed while what it opens is open: the popover, or one
  // of Chromium's bubbles hanging off its mark.
  const { showing } = useBrowser();
  const [open, setOpen] = useState(false);
  // A bubble of Chromium's that opens below the button closes the popover.
  const anchored = showing.includes("page-info");
  if (anchored && open) setOpen(false);
  // A press on the button while Chromium's bubble is open closes the bubble
  // (Wren does), and must not open the popover in its place, though the
  // bubble is gone by the time of the click.
  const pressedAnchored = useRef(false);
  return (
    <Anchor name="page-info">
      <Popover
        open={open}
        onOpenChange={(next) => setOpen(next && !pressedAnchored.current)}
        label="Page Info"
        windowMargin={popup ? 2 : undefined}
        trigger={
          <Button
            icon={PageInfoIcon}
            iconSize={18}
            label="Page Info"
            variant={popup ? "faint" : "plain"}
            className={cn(popup && "rounded-full")}
            pressed={anchored}
            onPointerDown={() => (pressedAnchored.current = anchored)}
            onKeyDown={() => (pressedAnchored.current = anchored)}
          />
        }
      >
        <PageInfo tab={tab} site={site} actions={actions} popup={popup} onClose={() => setOpen(false)} />
      </Popover>
    </Anchor>
  );
}

function PageInfo({
  tab,
  site: info,
  actions,
  popup,
  onClose
}: {
  tab?: Tab;
  site: Site | null;
  actions: ExtensionAction[];
  /**
   * In a popup's window, which has no side panel, and whose Browser has no
   * extensions' actions (Chromium gives them only to a tabbed window's): it
   * has neither the side panels' tiles nor the Extensions section.
   */
  popup: boolean;
  onClose: () => void;
}) {
  const openPanel = useBrowser().sidePanel?.id;
  return (
    <div className="flex w-66 flex-col p-2.5">
      <div className="grid grid-cols-4 grid-rows-[40px] gap-2">
        <CopyLinkTile disabled={!tab || isNewTab(tab.url)} onCopied={onClose} />
        {!popup &&
          quickPanels.map((id) => {
            const panel = sidePanels.find((each) => each.id === id)!;
            const open = openPanel === id;
            return (
              <Button
                key={id}
                variant="raised"
                shape="tile"
                icon={panel.icon}
                iconSize={17}
                label={open ? `Close ${panel.label}` : panel.label}
                pressed={open}
                aria-pressed={open}
                onClick={() => {
                  onClose();
                  if (open) sidePanel.close();
                  else sidePanel.show(id);
                }}
              />
            );
          })}
      </div>

      {!popup && (
        <Section
          title="Extensions"
          action={{
            label: "Manage",
            onPress: () => {
              onClose();
              browser.open("chrome://extensions");
            }
          }}
        >
          <div className="grid auto-rows-[36px] grid-cols-4 gap-2">
            {actions.map((action) => (
              <ExtensionTile key={action.id} action={action} onRun={onClose} />
            ))}
            <Button
              variant="faint"
              shape="tile"
              icon={Plus}
              iconSize={17}
              label="Add Extensions"
              onClick={() => {
                onClose();
                browser.open(STORE);
              }}
            />
          </div>
        </Section>
      )}

      {info && info.permissions.length > 0 && (
        <Section title="Permissions">
          <div className="flex flex-col gap-1">
            {info.permissions.map((permission) => (
              <PermissionRow key={permission.id} permission={permission} />
            ))}
          </div>
        </Section>
      )}

      {info?.reloadNeeded && (
        <Button variant="raised" icon={RotateCw} iconSize={13} onClick={() => site.reload()} className="mt-2">
          Reload to Apply Changes
        </Button>
      )}

      {/* A browser page, the app's own, a file: no connection to speak of,
          and none of the site's settings. */}
      {info && info.security !== "internal" && (
        <>
          <div className="mx-0.5 mt-3 mb-1.5 h-px bg-separator" />
          <div className="flex items-center justify-between">
            <SecurityButton site={info} onClose={onClose} />
            <Button
              icon={Ellipsis}
              label="More"
              iconSize={17}
              onClick={(event) => {
                const button = event.currentTarget;
                const box = button.getBoundingClientRect();
                site.menu(box.left + 6, box.bottom + 4).then(
                  (chosen) => {
                    // The native menu gives focus back as if by the
                    // keyboard, which would ring the button.
                    button.blur();
                    if (chosen) onClose();
                  },
                  () => {}
                );
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}

// A heading and what is under it. A section's action (Manage) is at the
// heading's end, shown while the pointer is over the section.
function Section({
  title,
  action,
  children
}: {
  title: string;
  action?: { label: string; onPress: () => void };
  children: ReactNode;
}) {
  return (
    <section className="group/section mt-3.5 flex flex-col">
      <div className="mb-2 flex items-baseline justify-between px-0.5">
        <h2 className="font-semibold text-fg-2">{title}</h2>
        {action && (
          <button
            type="button"
            onClick={action.onPress}
            className="font-medium text-fg-3 opacity-0 transition-[opacity,color] duration-150 ease-out group-focus-within/section:opacity-100 group-hover/section:opacity-100 hover:text-fg-2"
          >
            {action.label}
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

// Copies the page's address, says so for a moment, and closes the popover.
function CopyLinkTile({ disabled, onCopied }: { disabled: boolean; onCopied: () => void }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(onCopied, 700);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <Button
      variant="raised"
      shape="tile"
      icon={copied ? Check : Link}
      iconSize={17}
      label={copied ? "Copied" : "Copy Link"}
      disabled={disabled}
      onClick={() =>
        browser.copyLink().then(
          () => setCopied(true),
          () => {}
        )
      }
    />
  );
}

/** An extension's icon as Chrome draws its button, badge and all; a puzzle piece while it has none. */
export function ExtensionIcon({ action }: { action: ExtensionAction }) {
  return action.icon ? (
    <img src={iconUrl(action.icon)} alt="" className="size-7" />
  ) : (
    <span className="grid glyph-2">
      <Puzzle size={16} strokeWidth={1.75} />
    </span>
  );
}

// An extension: a click runs it, its popup below the page info button (or
// its own, if pinned), and a right click is Chromium's menu for it. Its pin
// is a button of its own at its corner: shown while it is pinned, faintly
// while the pointer is over an unpinned one; a click pins or unpins it.
function ExtensionTile({ action, onRun }: { action: ExtensionAction; onRun: () => void }) {
  const { pinned } = action;
  return (
    <div className="group/extension relative grid">
      <Button
        variant="faint"
        shape="tile"
        label={action.name}
        onClick={() => {
          onRun();
          extensions.click(action.id);
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          extensions.menu(action.id);
        }}
      >
        <ExtensionIcon action={action} />
      </Button>
      <Tooltip label={pinned ? "Unpin from Address Field" : "Pin to Address Field"}>
        <motion.button
          {...press(0.85)}
          type="button"
          aria-label={pinned ? "Unpin" : "Pin"}
          aria-pressed={pinned}
          disabled={action.forcePinned}
          onClick={() => extensions.setPinned(action.id, !pinned)}
          className={cn(
            "absolute -right-1 -bottom-1 grid size-4 place-items-center rounded-full bg-inverse text-on-inverse shadow-tooltip transition-opacity duration-150 ease-out",
            !pinned && "opacity-0 group-hover/extension:opacity-40 hover:opacity-70!"
          )}
        >
          <Pin size={9} strokeWidth={2.75} fill="currentColor" className="rotate-45" />
        </motion.button>
      </Tooltip>
    </div>
  );
}

// A permission: its circle, filled while it is allowed, its name and its
// state. A row as tall and as round as the tiles above, its circle inset
// evenly on every side. A click is its menu, below it, which sets it.
function PermissionRow({ permission }: { permission: SitePermission }) {
  const Icon = permissionIcon(permission.id);
  return (
    <Button
      shape="none"
      scale={0.985}
      disabled={permission.managed}
      onClick={(event) => {
        const row = event.currentTarget;
        const box = row.getBoundingClientRect();
        site.permissionMenu(permission.id, box.left + 6, box.bottom + 4).then(
          // As the More menu's: no ring from the focus it gives back.
          () => row.blur(),
          () => {}
        );
      }}
      className="flex h-10 items-center gap-2.5 rounded-tile p-1.5 text-left"
    >
      <span
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-full group-disabled/button:opacity-50",
          permission.allowed ? "bg-inverse text-on-inverse" : "bg-fill"
        )}
      >
        <span className={cn("grid", !permission.allowed && "glyph-1")}>
          <Icon size={14} strokeWidth={2} />
        </span>
      </span>
      <span className="flex min-w-0 flex-col gap-px">
        <span className="truncate font-semibold">{permission.label}</span>
        <span className="truncate text-subtitle text-fg-3">{permission.state}</span>
      </span>
    </Button>
  );
}

// Chromium's names for permissions and settings (its content settings'),
// by a part of the name, with an icon for each.
const permissionIcons: [string, Icon][] = [
  ["geolocation", MapPin],
  ["notifications", Bell],
  ["camera", Camera],
  ["mic", Mic],
  ["popups", ExternalLink],
  ["javascript", Code],
  ["images", Image],
  ["sound", Volume2],
  ["automatic-downloads", Download],
  ["clipboard", Clipboard],
  ["midi", Music],
  ["sensors", Vibrate],
  ["picture-in-picture", PictureInPicture2],
  ["window", AppWindow],
  ["fonts", Type],
  ["usb", Usb],
  ["bluetooth", Bluetooth],
  ["hid", Gamepad2],
  ["serial", Cpu],
  ["cookies", Cookie],
  ["storage-access", Cookie]
];

const permissionIcon = (id: string) => permissionIcons.find(([part]) => id.includes(part))?.[1] ?? Settings2;

/** How the connection stands, in a word, with Chrome's summary as its tooltip. */
const securityLabels: Record<
  Exclude<Site["security"], "internal">,
  { label: string; icon: Icon; warning?: boolean }
> = {
  secure: { label: "Secure", icon: Lock },
  "not-secure": { label: "Insecure", icon: InsecureIcon, warning: true },
  dangerous: { label: "Dangerous", icon: TriangleAlert, warning: true },
  enterprise: { label: "Managed", icon: Shield }
};

// Opens the certificate of a secure connection; one that is not secure has
// nothing to show, and a click only closes the popover.
function SecurityButton({ site: info, onClose }: { site: Site; onClose: () => void }) {
  if (info.security === "internal") return null;
  const { label, icon, warning } = securityLabels[info.security];
  const certificate = info.hasCertificate && !warning;
  return (
    <Button
      icon={icon}
      iconSize={14}
      iconTone={warning ? "inherit" : "dim"}
      label={info.summary || undefined}
      onClick={() => {
        onClose();
        if (certificate) site.certificate();
      }}
      // Quiet, as a status is: a fill only under the pointer.
      className={cn("font-medium", warning ? "text-danger" : "text-fg-2")}
    >
      {label}
    </Button>
  );
}
