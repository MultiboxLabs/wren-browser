// The omnibox's field, as Chrome's behaves (WrenOmnibox.h): it asks
// Chromium for suggestions after each edit, completes the default one inline
// after the caret, selected, moves through the list with the arrow keys
// putting each row's text in the field, brings back what was typed on
// Escape, and enters a search engine's keyword mode on Tab. What it lists,
// and what choosing a row does, is items.ts's.

import {
  type ChangeEvent,
  type KeyboardEvent,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from "react";
import { type OmniboxTarget, omnibox, type Suggestion, type Suggestions } from "../../ipc";
import { type BangMatch, findBang, loadBangs, mentionsBang } from "../../utils/bangs";
import { defaultIndex, fillOf, itemsOf, type OmniboxTabs, type OpenHow, openHowOf, openItem } from "./items";

/** The search engine whose chip the field shows: Chromium's keyword for it, and its name. */
export type Keyword = { keyword: string; name: string };

type Field = {
  /** What the field opened on: the active tab's address, or "" for a new tab; null until the app says. */
  start: string | null;
  /** What the user typed, after the keyword's chip if there is one. */
  typed: string;
  /** The default suggestion's completion, shown after `typed` and selected. */
  inline: string;
  keyword: Keyword | null;
  /** The bang in `typed`, and the text it was found in. */
  bang: { match: BangMatch; text: string } | null;
  suggestions: Suggestions | null;
  /** The row Return opens, highlighted in the list. */
  selected: number;
  /** The user moved to `selected` with the keys: the field shows its text, not `typed`. */
  moved: boolean;
};

const empty: Field = {
  start: null,
  typed: "",
  inline: "",
  keyword: null,
  bang: null,
  suggestions: null,
  selected: 0,
  moved: false
};

/** Nothing is typed: the field holds what it opened on. */
const isIdle = (field: Field) => field.start !== null && !field.keyword && field.typed === field.start;

/** The field's list, and the row Return opens in it before the user moves. */
function listOf(field: Field, tabs: OmniboxTabs) {
  const idle = isIdle(field);
  const items = itemsOf(field.suggestions, idle, tabs, field.keyword ? null : field.bang);
  return { items, first: defaultIndex(items, idle) };
}

/** How a query is asked, besides its text. */
type QueryOptions = {
  /** The caret, in UTF-16 units; the end by default. */
  cursor?: number;
  /** Do not complete inline: the user deleted or pasted. */
  noInline?: boolean;
  /** The field has just opened, or was emptied: what Chromium lists for an untouched field. */
  onFocus?: boolean;
};

/**
 * The field's state and handlers. `onDone` is called once what was chosen
 * is open, or the omnibox closed without it, its tab given the keyboard
 * back by then.
 */
export function useOmniboxField(
  target: OmniboxTarget,
  input: RefObject<HTMLInputElement | null>,
  tabs: OmniboxTabs,
  onDone: () => void
) {
  const [field, setField] = useState<Field>(empty);
  // Read by the handlers as they are now, not as they were at their render.
  const latest = useRef(field);
  latest.current = field;
  const latestTabs = useRef(tabs);
  latestTabs.current = tabs;
  const update = (change: (field: Field) => Field) => {
    latest.current = change(latest.current);
    setField(latest.current);
  };
  const { items } = listOf(field, tabs);

  // Each query's answer, and Chromium's later suggestions for it. While a
  // query is on its way, a message about the last one says nothing of the
  // text now in the field.
  const asked = useRef(0);
  const answered = useRef(0);
  const pending = useRef<Promise<void>>(Promise.resolve());
  const take = (suggestions: Suggestions | null, typed: string) =>
    update((field) => {
      const next = { ...field, suggestions };
      const { items, first } = listOf(next, latestTabs.current);
      const selected = field.moved ? Math.min(field.selected, Math.max(0, items.length - 1)) : first;
      // A completion is for the text it was asked about, and only of what
      // was typed.
      const top = items[first];
      const completes = !isIdle(next) && top?.type === "suggestion" && top.suggestion.isDefault;
      const inline = field.typed !== typed ? field.inline : completes ? top.suggestion.inline : "";
      return { ...next, selected, moved: field.moved && items.length > 0, inline };
    });
  const ask = (typed: string, options: QueryOptions = {}) => {
    const query = ++asked.current;
    // A bang is found at once, or when the list has loaded.
    const bang = (text: string) => (mentionsBang(text) ? findBang(text) : null);
    const found = bang(typed);
    update((field) => ({ ...field, bang: found && { match: found, text: typed } }));
    if (!found && mentionsBang(typed)) {
      loadBangs().then(
        () => {
          const loaded = bang(typed);
          if (loaded && query === asked.current)
            update((field) => ({ ...field, bang: { match: loaded, text: typed } }));
        },
        () => {}
      );
    }
    pending.current = omnibox
      .query({
        text: typed,
        cursor: options.cursor ?? typed.length,
        keyword: latest.current.keyword?.keyword ?? null,
        noInline: options.noInline ?? false,
        onFocus: options.onFocus ?? false
      })
      .then(
        (suggestions) => {
          if (query !== asked.current) return;
          answered.current = query;
          take(suggestions, typed);
        },
        () => {}
      );
  };
  useEffect(
    () =>
      omnibox.onSuggestions((suggestions) => {
        if (answered.current === asked.current) take(suggestions, latest.current.typed);
      }),
    []
  );

  // Opens on the active tab's address, all of it selected, or empty for a
  // new tab; and lists what Chromium has for that.
  const ready = field.start !== null;
  useEffect(() => {
    loadBangs().catch(() => {});
    const location = target === "current" ? omnibox.location() : Promise.resolve("");
    location.then(
      (typed) => {
        update(() => ({ ...empty, start: typed, typed }));
        ask(typed, { onFocus: true });
      },
      () => update(() => ({ ...empty, start: "" }))
    );
  }, []);
  useLayoutEffect(() => {
    if (ready) input.current?.select();
  }, [ready]);
  // The field has the keyboard once what opened it is done: a press on the
  // New Tab row opens it, then focuses the row as the mouse goes down.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (document.activeElement !== input.current) input.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const moved = field.moved ? items[field.selected] : undefined;
  const value = moved ? fillOf(moved) : field.typed + field.inline;
  // The completion stays selected after the caret, so typing replaces it.
  useLayoutEffect(() => {
    if (field.inline && !field.moved) input.current?.setSelectionRange(field.typed.length, value.length, "backward");
  }, [value, field.inline, field.moved]);

  const done = useRef(false);
  const close = () => {
    if (done.current) return;
    done.current = true;
    omnibox.close().then(onDone, onDone);
  };
  const open = async (index: number | null, how: OpenHow = "default") => {
    if (done.current) return;
    // Return as soon as the text is typed opens what Chromium suggests for
    // it, not for what was there before.
    await pending.current;
    const field = latest.current;
    const { items, first } = listOf(field, latestTabs.current);
    const item = items[index ?? (field.moved ? field.selected : first)];
    if (!item || done.current) return;
    if (how === "background-tab") {
      // The omnibox stays as it is, for the next one; Chromium's list is
      // spent by this one, so it is asked again.
      openItem(item, field.suggestions?.result, target, how).then(
        () => ask(latest.current.typed, { noInline: true, onFocus: isIdle(latest.current) }),
        () => {}
      );
      return;
    }
    done.current = true;
    openItem(item, field.suggestions?.result, target, how).then(onDone, onDone);
  };

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const typed = event.target.value;
    const kind = (event.nativeEvent as InputEvent).inputType ?? "";
    // As Chrome's: no completion after a deletion or a paste.
    const noInline = kind.startsWith("delete") || kind === "insertFromPaste" || kind === "insertFromDrop";
    update((field) => {
      // Typing what the completion says keeps the rest of it, rather than
      // waiting on Chromium for it.
      const shown = field.typed + field.inline;
      const through =
        !noInline &&
        !field.moved &&
        typed.length > field.typed.length &&
        shown.toLowerCase().startsWith(typed.toLowerCase());
      return { ...field, typed, inline: through ? shown.slice(typed.length) : "", moved: false };
    });
    // An emptied field lists what an empty one does.
    ask(typed, { cursor: event.target.selectionStart ?? typed.length, noInline, onFocus: typed === "" });
  };

  const move = (by: number) =>
    update((field) => {
      const { items, first } = listOf(field, latestTabs.current);
      if (!items.length) return field;
      const selected = (field.selected + by + items.length) % items.length;
      // Back on the default, the field shows what was typed again.
      return { ...field, selected, moved: selected !== first };
    });

  // Escape brings back what was typed, if the user moved off it; then it
  // closes.
  const revert = () => {
    if (!latest.current.moved) return close();
    update((field) => ({ ...field, moved: false, selected: listOf(field, latestTabs.current).first }));
  };

  // Tab on a suggestion with a keyword puts the field in its search
  // engine's keyword mode; what was typed after the keyword stays.
  const enterKeyword = (suggestion: Suggestion) => {
    const rest = latest.current.typed.trimStart().split(/\s+/).slice(1).join(" ");
    update((field) => ({
      ...field,
      keyword: { keyword: suggestion.keyword, name: suggestion.keywordName },
      typed: rest,
      inline: "",
      moved: false
    }));
    ask(rest, { noInline: true });
  };
  // Backspace at the field's start takes the chip off, back to its keyword.
  const leaveKeyword = (keyword: Keyword) => {
    const typed = latest.current.typed ? `${keyword.keyword} ${latest.current.typed}` : keyword.keyword;
    update((field) => ({ ...field, keyword: null, typed, inline: "", moved: false }));
    ask(typed, { noInline: true });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    const { suggestions, selected, keyword, inline, moved } = latest.current;
    const item = listOf(latest.current, latestTabs.current).items[selected];
    const suggestion = item?.type === "suggestion" ? item.suggestion : undefined;
    const element = event.currentTarget;
    const atStart = element.selectionStart === 0 && element.selectionEnd === 0;
    const key = event.key;
    const ctrl = event.ctrlKey && !event.metaKey && !event.altKey;
    if (key === "ArrowDown" || key === "ArrowUp" || (ctrl && (key === "n" || key === "p"))) {
      event.preventDefault();
      move(key === "ArrowUp" || key === "p" ? -1 : 1);
    } else if (key === "Tab") {
      event.preventDefault();
      if (!event.shiftKey && !keyword && suggestion?.keyword) enterKeyword(suggestion);
      else move(event.shiftKey ? -1 : 1);
    } else if (key === "Enter") {
      event.preventDefault();
      // Ctrl-Return completes a bare word to "www.word.com", as Chrome's does.
      const { typed } = latest.current;
      if (ctrl && !moved && !keyword && /^[^\s./:]+$/.test(typed.trim())) {
        const address = `www.${typed.trim()}.com`;
        update((field) => ({ ...field, typed: address, inline: "" }));
        ask(address, { noInline: true });
      }
      open(null, openHowOf(event));
    } else if (key === "Escape") {
      event.preventDefault();
      revert();
    } else if ((key === "Backspace" || key === "Delete") && event.shiftKey && moved && suggestion?.deletable) {
      // Shift-Delete removes the selected suggestion, as Chrome's does.
      event.preventDefault();
      if (item?.type === "suggestion" && suggestions) omnibox.delete(suggestions.result, item.index);
    } else if (key === "Backspace" && keyword && atStart) {
      event.preventDefault();
      leaveKeyword(keyword);
    } else if (inline && ["ArrowRight", "ArrowLeft", "End", "Home"].includes(key)) {
      // Moving the caret takes the completion as typed, as Chrome's does.
      update((field) => ({ ...field, typed: field.typed + field.inline, inline: "" }));
    }
  };

  return {
    field,
    items,
    value,
    ready,
    /** The field holds what it opened on, untouched: the tab's address, for ⌘L. */
    untouched: ready && !field.moved && isIdle(field),
    onChange,
    onKeyDown,
    open,
    close
  };
}
