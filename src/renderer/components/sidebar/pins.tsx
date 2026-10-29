// The space's pins, as the sidebar's list draws them over its tabs: a tab
// pin's row, a split pin's two pages in one row, and a folder with what is
// in it, a step further in for each folder it is in.

import { Favicon } from "../favicon";
import { Tooltip } from "../ui/tooltip";
import type { Pin, PinFolder, PinPage } from "../../ipc";
import { FolderIcon } from "./folder-icon";
import { Disclosed, IconSlot, NESTED_INDENT, Row } from "./rows";

type PinProps = { indent?: number; onToggleFolder: (folder: PinFolder) => void };

/** A pin's page's icon: the one kept with it, or one made from its address. */
export const PinIcon = ({ page }: { page: PinPage }) => (
  <Favicon url={page.url} title={page.title} icon={page.favicon} />
);

/** What a pin is called: the user's name for it, or its page's title, or its pages'. */
export const pinTitle = (pin: Exclude<Pin, PinFolder>) =>
  pin.name ?? (pin.kind === "tab" ? pin.page.title : pin.pages.map((page) => page.title).join(" | "));

export function PinRows({ pins, ...props }: PinProps & { pins: Pin[] }) {
  return pins.map((pin) => <PinItem key={pin.id} pin={pin} {...props} />);
}

function PinItem({ pin, ...props }: PinProps & { pin: Pin }) {
  switch (pin.kind) {
    case "folder":
      return <FolderRow folder={pin} {...props} />;
    case "split":
      return <SplitPinRow pages={pin.pages} indent={props.indent} />;
    case "tab": {
      const title = pinTitle(pin);
      return (
        <Row indent={props.indent}>
          <PinIcon page={pin.page} />
          <Tooltip label={title}>
            <span className="min-w-0 flex-1 truncate">{title}</span>
          </Tooltip>
        </Row>
      );
    }
  }
}

// A split pin's two pages side by side in one row, as the list draws a
// split of the Browser's, parted by a line.
function SplitPinRow({ pages, indent }: { pages: [PinPage, PinPage]; indent?: number }) {
  return (
    <div
      role="group"
      style={{ marginLeft: indent }}
      className="no-drag group flex h-9 shrink-0 items-center rounded-row p-1 hover:bg-hover"
    >
      {pages.map((page, index) => (
        <div key={index} className="contents">
          {index > 0 && <div className="mx-[1.5px] h-4 w-px shrink-0 bg-separator" />}
          <div className="flex h-full min-w-0 flex-1 items-center gap-2.75 rounded-[calc(var(--radius-row)-4px)] pr-0.75 pl-1.5">
            <PinIcon page={page} />
            <Tooltip label={page.title}>
              <span className="min-w-0 flex-1 truncate">{page.title}</span>
            </Tooltip>
          </div>
        </div>
      ))}
    </div>
  );
}

/** A folder and, while it is open, what is in it. */
function FolderRow({ folder, ...props }: PinProps & { folder: PinFolder }) {
  const { indent = 0, onToggleFolder } = props;
  return (
    <>
      <Row indent={indent} onPress={() => onToggleFolder(folder)}>
        <IconSlot>
          <FolderIcon open={folder.open} className="text-fg" />
        </IconSlot>
        <span className="min-w-0 flex-1 truncate font-semibold">{folder.name}</span>
      </Row>
      <Disclosed open={folder.open}>
        <PinRows pins={folder.items} {...props} indent={indent + NESTED_INDENT} />
      </Disclosed>
    </>
  );
}
