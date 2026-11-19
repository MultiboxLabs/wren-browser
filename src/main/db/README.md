# `db/`

A layer. It is what Wren keeps on disk. [The main process](../README.md) says what a layer is and where code goes.

## What belongs here

- Wren's database, with a file for each thing it keeps.
- The files Wren keeps beside it, such as the sidebar's state.

## What goes elsewhere

- What Chromium keeps for a profile, such as history and cookies. Chromium has it, and a part asks Wren Runtime for it.
- A rule about the data, such as what follows when a space is deleted. It goes in the part.

## Rules

- **It calls no part and no other layer.** A part calls it, and tells the windows itself.
- **It is used on the main thread only.**
- **A change to the tables is a new migration.** A step that has shipped is never edited, as a database from an older version has already run it.
