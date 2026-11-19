# `analytics/`

A part. It is what Wren counts and sends, and its crash reports. [The main process](../README.md) says what a part is and where code goes.

## What belongs here

- The events Wren counts, and what each carries.
- Sending them, and turning that on or off.
- Crash reports.

## What goes elsewhere

- Deciding when to count. The action a person asked for counts it, in its part.
- Keeping the counts between runs, in `db/`.

## Rules

- **Only what `Event` names is counted, never what is browsed.** No address, title, text typed or name of the user's leaves the app.
- **Sending never waits on the network.** It happens on a thread of its own.
- **A Dev build and a performance run send nothing.**
