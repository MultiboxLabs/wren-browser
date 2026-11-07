# Wren Browser

Wren is a browser for the Mac that keeps each part of your life in its own space. It's built on Chromium, so every site and Chrome extension works, and it looks like it came with your Mac.

Most browsers put work, home and everything else in one row of tabs, and leave you to keep them apart. In Wren, each space has its own tabs, pins, theme and profile, so you stay signed in to your work accounts in one and your personal ones in the next. One swipe moves you between them.

**[Download Wren](https://wrenbrowser.com)** for macOS 13 or later on Apple silicon.

## Features

- **Spaces.** Separate sets of tabs and pins, each with its own name, icon and theme. Swipe the sidebar or press ⌃1 to ⌃9 to switch.
- **A profile for each space.** Its own cookies, history, passwords and extensions, so work and personal accounts stay signed in side by side.
- **Themes.** Up to three colours, grain, and light, dark or matching your Mac.
- **Tabs in the sidebar.** Group them under a name and a colour, or open two in split view, side by side or stacked.
- **Tabs that tidy themselves.** A tab you haven't pinned closes after 12 hours untouched, or after the time you choose.
- **Ad blocking built in.** uBlock Origin is on from the start, in every new profile and in incognito windows.
- **An omnibox with bangs.** Search, history, open tabs and sums in one box, with more than 10,000 bangs such as `!yt` and `!w`.
- **Import from your old browser.** Bookmarks, history and cookies, and spaces, pins and extensions where it has them, from Arc, Brave, Chrome, Dia, Edge, Firefox, Helium, Opera, Safari, Vivaldi or Zen.
- **Chrome's extensions and passwords.** Install anything from the Chrome Web Store, and save passwords in each profile.
- **Made for macOS.** A see-through window, a real menu bar, and menus and dialogs drawn like the system's, light or dark with it.
- **Picks up where you left off.** Your windows and tabs reopen, and updates install themselves as Wren restarts.

## Privacy

Wren never sends what you browse. It sends anonymous counts of which features you use, and crash reports. Turn off Help Improve Wren in Settings to send nothing.

## Requirements

A Mac with Apple silicon, on macOS 13 or later. Windows and Linux are planned.

## Build from source

Install Bun, Rust 1.85 or later, and Wren Runtime's `wren` command, then start Wren:

```sh
curl -fsSL https://wrenbrowser.com/runtime/cli/install.sh | sh
bun install
bun run dev
```

[docs/development.md](docs/development.md) explains how Wren is built and how to work on it.

## Contributing

Report bugs and request features in [issues](https://github.com/MultiboxLabs/wren-browser/issues). Report security vulnerabilities privately, as [SECURITY.md](SECURITY.md) says.

Pull requests are welcome. Each one asks you to agree to the [Contributor Licence Agreement](CLA.md) by ticking a box in its description. Read [AGENTS.md](AGENTS.md) for the project's conventions, and run `bun run check` before you commit.

## Licence

Copyright 2026 Avocado and Bear Limited, trading as Multibox Labs.

Wren Browser is under the [Mozilla Public License 2.0](LICENSE). These are not:

- the name Wren, and the logos and icons in `branding/`, which are trademarks that [TRADEMARKS.md](TRADEMARKS.md) says how you may use;
- Wren Runtime, which has its [own licence](https://github.com/MultiboxLabs/wren-runtime/blob/main/LICENSE);
- `extensions/uBlock0.crx`, uBlock Origin, under the GPL 3.0;
- `src/renderer/data/bangs.json`, from Kagi's bangs, under the MIT licence in `bangs.LICENSE` beside it.

Wren Runtime isn't open source. Its licence lets you build, run, change and contribute to Wren Browser, but not distribute builds of it.
