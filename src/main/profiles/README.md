# `profiles/`

A part. It is what Wren does with the profiles Chromium keeps. [The main process](../README.md) says what a part is and where code goes.

## What belongs here

- Making, renaming and deleting a profile.
- What follows a change to the list of profiles, and a profile opening.
- Having every profile follow the password manager and autofill settings.

## What goes elsewhere

- Spaces, which belong to a profile, in `spaces.rs`.
- A profile's window, in `windows/`.
- The profiles as the Library lists them, in `ipc/`.

## Rules

- **Never load a profile to tell it of a setting.** A setting reaches a profile as it loads, and one that is not loaded is left until it is.
- **The spaces are told when the profiles change.** The page and the main menu show a profile's name beside its spaces.
