# `downloads/`

A part. It is the downloads a window lists. [The main process](../README.md) says what a part is and where code goes.

## What belongs here

- The downloads the shelf and the Library list, each as the page draws it.
- Their thumbnails.
- What a download's menu does.

## What goes elsewhere

- Chromium's downloads bubble, which the shelf or the Library shows in its place, in `ipc/`.
- What a download's menu lists, in `menus/`.

## Rules

It has none of its own. Chromium downloads and decides, and this part reads what Chromium has.
