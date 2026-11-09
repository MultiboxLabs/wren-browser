---
name: writing
description: Wren Browser's writing rules. Load before writing or editing any text in the app's UI (a label, button, menu item, tooltip, setting's description, dialog, onboarding or wren:// page), or any README, document in docs/, AGENTS.md, skill, plan in .agent/plans/, release note, commit message or code comment. Also use to review text for AI slop.
---

# Writing for Wren Browser

These rules cover every piece of text in this repository: what Wren shows the people who use it, the documents, the plans and skills agents act on, the commit messages and the code comments. They exist so that the text reads as if a person who knows Wren well wrote it for another person, and so that Wren's own words sit beside the platform's without standing out.

## How to write

1. **Ask what the text is for.** Answer in one sentence before writing anything. The next section explains how.
2. **Write it for that purpose and that reader,** to the section below for the kind of text it is, and to the rules every text follows.
3. **Check every fact.** Check each claim against the code, and each command against `package.json` and `scripts/`.
4. **Go through the checklist** at the end, and rewrite what it finds.
5. **Read it once more as the reader.** Read UI text where it shows, beside the platform's own. Read a page for people aloud in your head. A sentence that would sound odd said to another person is wrong, even if it follows every rule here.

## Start with the purpose

Before writing or editing anything, ask: what is this for? Who reads it, at what moment, and what should they be able to do once they've read it?

Write the answer as one sentence. That sentence decides everything else:

- **What goes in.** Each sentence must help the reader do what the purpose says. If it doesn't, cut it or move it to the place whose purpose it serves.
- **What comes first.** The thing the reader came for. Everything else follows in the order they'll need it.
- **The voice.** UI text talks to the person using Wren. A page that introduces Wren talks to the reader. A page an agent acts on gives instructions. A doc comment states a contract.
- **How long it is.** A label is a few words. A file loaded at the start of every task stays short. A reference page can be as long as its subject.

Ask the same question when editing. If the text has drifted from its purpose, reshape it instead of adding to it.

| Text                                                                             | Its purpose                                                                 | Its reader                              | So it leads with                                                                | So it leaves out                                                                         |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| UI text                                                                          | Let someone use Wren without stopping to work it out                        | A person using Wren, mid-task           | What the control does, or what will happen                                      | How it works inside                                                                      |
| A release note, in `../wren-browser-website/src/app/releases/<version>/page.tsx` | Tell people what's new in this version                                      | A person who uses Wren                  | What they can do now that they couldn't, in the UI's words                      | Internals, refactors, file names                                                         |
| `README.md`                                                                      | Show someone who finds Wren why they'd want it, and get them to download it | A person deciding whether to try Wren   | What Wren is, why it's better, the features as a bullet list, the download link | How Wren is built, the code map and build details, which belong in `docs/development.md` |
| A page in `docs/`                                                                | Get a maintainer through one task                                           | A maintainer                            | What the task gets them, then the steps                                         | Other tasks                                                                              |
| `AGENTS.md`                                                                      | Let a coding agent work on Wren correctly from its first task               | An agent with the code and nothing else | Principles, commands, rules with their reasons                                  | Selling, history, what one file does                                                     |
| A skill                                                                          | Let an agent do one kind of task the way this project wants it              | An agent that just loaded it            | When to use it, then the steps                                                  | What `AGENTS.md` already says                                                            |
| A plan in `.agent/plans/`                                                        | Let another agent carry out a change with only the plan and the code        | An agent, and the user approving it     | Status, goal, the rules of the new behaviour, then phases                       | Code the agent can write itself                                                          |
| A code comment                                                                   | Say what a file, item or line is for, and what a caller must know           | Whoever reads or calls the code next    | What it is, then the contract or the reason                                     | What the code already says plainly                                                       |
| A commit message                                                                 | Say what changed and why                                                    | A contributor reading history           | The change in behaviour, then the reason                                        | A list of files                                                                          |

## Text in the UI

Wren aims to look and behave like the platform's own UI, and its words are part of that. Write each string the way the system's own apps write the same kind of string. Before naming a command or a setting, look at what macOS calls the same thing in its own menus and settings, and use that word. A word the system already uses is one the person already knows.

**Capitalise names in title case.** Buttons, menu items, window and dialog titles, and the labels of icon buttons are names, so they take title case, as macOS's own do. Wren's setting names do too: "Check for Updates…", "Close Side Panel", "Automatic Updates", "Quit Wren?". Descriptions and dialog messages are sentences, in sentence case with a full stop: "Your windows and tabs will be here when you come back."

**One label for one control.** An icon button's tooltip and its `aria-label` are the same string, so that VoiceOver and the pointer say the same thing. A label isn't a sentence, so it has no full stop.

**End with an ellipsis** when a command asks for more before it acts, as "New Profile…" opens a form and "Check for Updates…" opens a check. Use the one character `…`, never three full stops. A placeholder for text to type ends with one too: "Search…".

**Say what happens.** A setting's description says what it does when on, and what happens to what's already there when it's turned off: "Offer to save passwords, and fill them in, in every profile. Turning it off keeps the passwords already saved." A choice says how to change it later: "You can change it any time in System Settings." A person reads the description to decide, so it must answer what they'd ask before flipping the switch. Never open a sentence with "Off," or "On,". Say "Turning it off…", or put the other state in the same sentence: "Leave a gap round the page, or let it fill the window."

**Talk to the person.** Write "you" and "your", and call the product Wren. Never "the app", "the browser" or "the user" for them or for Wren. "Links from Mail, Messages and your other apps open in Wren" is right.

**Use their words, not the code's.** A person knows spaces, tabs, profiles, favourites and the Library, because Wren shows them those. They don't know a `Browser`, a place, a web view, a window on no space, or IPC. A label or an error that names one of these is wrong.

**Name the feature.** A step, a setting or a choice about a feature says the name people know it by, such as "password manager" or "ad blocker". Describing only what it does, such as "Your passwords" over "Save passwords in Wren", leaves the person to work out which feature it is before they can choose.

**Keep it calm.** No exclamation marks, no jokes, no "Oops", no emoji, as the system's own text has none. An error says what went wrong and what the person can do, never that they did something wrong.

**Never name another browser** as the thing Wren is like or better than. Write "the browser you use now". Where the person picks a browser by name, such as the sources on `wren://migrate`, its name is the point and belongs there.

## Pages for people

These are `README.md`, the pages in `docs/` and the release notes. Write the way someone who works on Wren would explain it to a friend.

**Open with what it is and what it gets you.** One or two sentences, nothing else. "Wren is a browser for the Mac that keeps each part of your life in its own space." Leave out qualifiers the reader doesn't need yet.

**The README sells, in as few words as it can.** Its reader decides in seconds whether Wren is worth trying, and leaves if they have to dig. After the opening, give one short paragraph on why Wren is better, then the download link, then the features as a bullet list, each a bold name and one line. Never give each feature a section of prose. That reads as an essay, and people click away before they reach the feature they'd have cared about. Wren Runtime's public README has the same shape.

**Show the benefit. Never assign the reader a job.** "You" followed by a plain verb about using the product reads as a duty: "You manage your tabs in spaces". Say what the reader gets, or what Wren has: "Spaces keep work and personal tabs apart". Imperatives that invite are fine in a list of what Wren offers: "Reorder tabs and groups by dragging them."

**Talk to the reader.** "You" and "your" are fine with "get", "can" and "lets you", and read better than "the user" or "anyone".

**Instructions are imperative.** Steps, commands and requests address the reader directly: "Install `wren` once", "Report a security vulnerability privately".

**Say what it offers.** Readers can't use what they don't know exists. A release note names each new thing where the person will find it: "Settings has a Beta Updates switch."

**Keep mechanics out of front pages.** The README gives the three commands to build from source, and links to `docs/development.md`, which has how Wren is built and the map of the code. What a script checks and which variables it reads go in a page in `docs/`, such as `docs/publishing.md`. If a newcomer doesn't need a sentence to take the next step, move it.

**Use words the reader already knows.** The README and the release notes use the UI's words only. A page in `docs/` may use the code's terms, such as the main process and the renderer, and explains each once.

**Don't let the rules make it stiff.** Avoiding "you" everywhere, splitting every clause into its own sentence, and stacking exact qualifiers all read like a machine wrote them. Contractions such as "isn't", "you're" and "here's" are fine.

## Pages for agents

These are `AGENTS.md`, the skills in `.claude/skills/` and the plans in `.agent/plans/`. An agent reads them, then acts on them. Ask what an agent working on Wren needs to know before its first edit, and what it would otherwise get wrong. Here the instructions are the point, so imperatives are right.

**Write rules, each with its reason.** "Keep platform-specific code behind an interface in `src/main/platform/`." Then why: Wren will run on Windows and Linux. An agent that knows the reason handles the case the rule didn't name.

**Name the symptom.** Say what the agent will see when a rule is broken: the error, the flash, the popover that moves. It then recognises the cause while debugging. "A popover that slides as its trigger is pressed hangs off a box that scales."

**Be exact.** Name the function, the file, the command and the path. "Use `restingBox` in `ui/press.ts`" beats "keep the trigger's box stable". Give commands in a block the agent can copy.

**Say what to do instead.** A rule that only forbids leaves the agent to guess. "Don't import `radix-ui` outside `src/renderer/components/ui`. Use or add a wrapper there."

**Point to the reference, don't copy it.** `AGENTS.md` is loaded every time, so it stays short. It says which file, skill or plan has the details, and holds what an agent needs before it knows where to look.

**State what agents would guess wrong.** Agents assume Wren is Electron, or that it uses Chrome's own toolbar and tab strip. Say where it doesn't work that way: the main process is Rust on Wren Runtime, and the interface is Wren's own React pages at `wren://`, which Chromium renders in Wren Runtime's web views. Use comparisons only for this.

**A skill's description decides when it loads.** Say what the skill covers and every situation it's for, in the words a user would use, and what it isn't for. The body then starts with the steps.

**A plan settles what it can and asks about the rest.** Each open question becomes a numbered decision with a recommendation and its reason, for the user to approve. The plan gives the rules of the new behaviour as numbered sentences, the files to read first, and phases that each end in a working app.

**No selling.** No benefits, no history. The agent is already working on Wren.

## Names

**Wren** is the browser, as people see it. Use it in the UI, the release notes and anywhere a person who uses it reads.

**Wren Browser** is the project and this repository. Use it where it has to be told apart from Wren Runtime, such as the README's title, the licence and contributor pages.

**Wren Runtime** is the library Wren is built on. Call it Wren Runtime every time, capitalised, never "the Wren runtime" or bare "Wren". Code names keep their own spelling: the crate `wren`, the `wren` command, `wren://`, `Wren.app`.

**Chromium and Chrome.** Wren is built on Chromium, so Chromium is the engine. Chrome names only Chrome's own things, such as the Chrome Web Store and `chrome://` pages.

**Other browsers.** Never name a browser whose design Wren follows, in code, comments, commits, plans, PRs or the UI. Describe the behaviour instead: "a list of recent downloads above the Library button". Name a browser only where Wren reads its data, such as an import source.

**Spelling is British.** Colour, favourite, licence, behaviour, notarise. Code keeps its own spelling where an API or a file has it, such as CSS `color` or `favorite.tsx`.

**One thing, one name.** Call a thing what the UI calls it, and keep calling it that. Don't switch between "space", "workspace" and "profile" for the same thing.

## Facts

Every sentence must be true, and an agent will repeat it as fact. Check before writing.

**Check each name and behaviour in the source.** A document can be out of date. The code can't be. Look up every function, file, command and setting a text names. A setting's description must say what its handler does, so read the handler.

**Check claims about Wren Runtime in its release,** under `.wren/runtime`: its `AGENTS.md`, `docs/` and the headers in `include/`. Wren Runtime's source isn't in this repository, so don't guess at its internals.

**Check claims about macOS** in the system's own apps or Apple's documentation, and keep each claim as narrow as the evidence.

**Run what a page tells the reader to run,** or say in the report which commands weren't run. Type-check code shown in a page.

**Don't overstate plans.** Wren runs on macOS on Apple silicon. Windows and Linux are planned, so a page says that, not that they're coming soon.

## What a page must state

Agents fill gaps with guesses and then state the guesses as fact. Close the gaps they hit:

- what happens by default, such as uBlock Origin being on by default in each new profile;
- what Wren can't do yet, on the page where a reader would look for it, as the README's Requirements says Wren runs only on Apple silicon;
- what it needs, such as macOS on Apple silicon and the `wren` command.

When something isn't possible, say so plainly and say what is missing. Don't leave the reader to infer it from silence.

## Working from the user's words

**A rough explanation.** When the user explains what a text should say in their own words, take the point and write it well. Their wording is a brief, not text to paste.

**A sentence to try.** When the user gives a sentence and asks for it, use it. Fix only what breaks a rule here, such as "allows you to" for "lets you". It shows the voice they want, so match the rest to it.

**A correction.** When the user rejects a sentence, fix every sentence like it in every file touched, not only the one they quoted. Then add the pair to the before-and-after table, and the rule behind it to this skill.

## Sentences

**One idea a sentence.** If a reader has to read a sentence twice, split it.

**Say who does what.** "Wren reopens your windows and tabs when it starts again" is better than "windows and tabs are restored on launch". Catch "is, are, was or were" followed by a past participle, and name who acts. Passive voice is fine only when the actor is unknown or doesn't matter.

**Use the plain word.** A function "is", "has", "returns" or "calls". It doesn't "serve as", "stand as", "boast", "feature", "ensure" or "leverage". Write "use", "help", "lets", "many", "if", "to" and "because", not "utilize", "facilitate", "allows you to", "numerous", "in the event that", "in order to" and "due to the fact that".

**Say what it does, not how it feels.** "Feels at home", "stays out of your way" and "just works" name a feeling. Name the mechanism or give a number. If a sentence could appear unchanged in another browser's text, it says nothing about Wren. Cut it.

**Recommend one way when one is better,** and say why in the next sentence. A list of every option leaves the choice to someone who knows less.

**Write whole sentences.** Keep the articles and the verbs. Don't write arrows, symbols or abbreviations in prose. "Wren keeps the window when a page asks to stay, and closes the rest" is right. "Page stays → keep window" is not.

## Punctuation and format

- Use a colon only before a list, a table, an example or code. Don't join two clauses with a colon.
- Don't join facts with semicolons. Write two sentences.
- Don't use em dashes, en dashes, or a hyphen as a dash. Keep parentheses for code and paths. A thought that needs setting apart is its own sentence.
- Bold only a lead-in that names its item and ends with a full stop, such as "**Spelling is British.** Colour, favourite…". The text after it adds something new. Never bold words for emphasis. Never write "**Performance:** Performance improved…".
- Headings are in sentence case. No emoji.
- Quotes and apostrophes are straight in documents, comments and code. UI text uses curly ones, `’` and `“ ”`, as the system's own text does.
- Markdown has one line a paragraph, with no hard wraps. A small edit to a file that is still wrapped keeps its wrapping, and the file is rewrapped when it's rewritten.

## Code comments

**A file opens with what it is for.** Its first comment says what the file does and how it fits with the files around it, naming them in parentheses: "The app's updates. The platform's updater (platform/updater.rs) checks and downloads…".

**A doc comment states a contract.** A `///` or `/** */` comment says what the item is or does, then what a caller must know: what it returns when it can't, what it owns, when it's called. Start with what it is: "The version that runs", not "This constant holds the version".

**A comment in code says why.** It gives the reason the line is there, or the case it handles, not what the line plainly does. "A Dev build has nothing to update to" earns its place. "Filter out dev" doesn't.

**Keep it true.** A comment that no longer matches the code is worse than none. Change it in the same edit as the code.

Comments follow the sentence rules above, and match the comments around them in density and idiom.

## Commit messages

- **The prefix says what kind of change it is.** `feat:` for behaviour a person can see that wasn't there, `fix:` for behaviour that was wrong, and `chore:` for everything else, such as a refactor, a runtime update or formatting.
- **The summary is lowercase,** names included: "wren runtime", "macos", "chromium".
- **The summary says what changed in behaviour,** in the UI's words where it can, and the reason when it isn't obvious: "fix: delete a space only once its browsers have closed, so a page's leave site? can keep it". "X, not Y" names what it replaced.
- **A body only when the summary can't hold the reason.** Write it in sentences or one bullet a change. Never a list of files.
- No `Co-Authored-By` trailer.

## Before and after

Each "before" breaks a rule above. When the user rejects a sentence, add the pair here.

| Before                                                                                                                                                                            | After                                                                                                                                       | Rule                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| The app uses the Wren Runtime.                                                                                                                                                    | Wren Browser is built on Wren Runtime.                                                                                                      | Names                                                     |
| The Wren runtime's `wren` command                                                                                                                                                 | Wren Runtime's `wren` command                                                                                                               | Names                                                     |
| Whether the ad blocker starts on in a profile you make. Each profile's can be turned on or off in Profiles.                                                                       | Block ads in each new profile you make. You can turn it on or off for each profile in Profiles.                                             | Say what happens. Say who does what.                      |
| Leave a gap round the page. Off, the page fills the window. The user said the "Off, …" pattern sucks.                                                                             | Leave a gap round the page, or let it fill the window.                                                                                      | Say what happens.                                         |
| Move to previous preset page. (a tooltip)                                                                                                                                         | Previous Presets                                                                                                                            | Capitalise names in title case. A label has no full stop. |
| Remove color                                                                                                                                                                      | Remove Colour                                                                                                                               | Spelling is British. Title case.                          |
| You manage your tabs in spaces.                                                                                                                                                   | Spaces keep separate sets of tabs, each with its own name, icon and theme.                                                                  | Never assign the reader a job.                            |
| A README with a section of prose for each feature, such as "A space for each part of your life" and three paragraphs under it. The user rejected it as an essay.                  | "**Spaces.** Separate sets of tabs and pins, each with its own name, icon and theme." as one bullet in a list of features.                  | The README sells, in as few words as it can.              |
| A README that lists features as plain facts, with no reason to care. The user rejected it as a requirements list.                                                                 | One short paragraph on the problem Wren solves, before the features: "Most browsers put work, home and everything else in one row of tabs…" | Show the benefit. Never assign the reader a job.          |
| An onboarding step titled "Your passwords", with the options "Save passwords in Wren" and "Use another password manager". The user said people take a moment to see what it asks. | "Wren’s password manager", with the options "Use Wren’s password manager" and "Use another password manager".                               | Name the feature.                                         |
| Agents assume that Chromium draws Wren's interface. (in `AGENTS.md`, which the user pointed out is wrong, as Chromium renders it in web views)                                    | Agents assume that Wren uses Chrome's own toolbar, tab strip and omnibox.                                                                   | Check every fact.                                         |

## Checklist

Go through the text for each of these, and rewrite what you find.

### Purpose

- Can you say in one sentence what this is for, who reads it and what they can do after?
- Does every section serve that purpose? Cut or move any that doesn't.
- Does it open with the thing its reader came for?

### UI text

- Does each name use title case, and each description read as a sentence with a full stop?
- Does a command that asks for more end with `…`?
- Is each word the one the system's own apps use for the same thing?
- Does a setting's description say what happens when it's turned off?
- Does any string name a code term, another browser, or "the app"?
- Are the tooltip and the `aria-label` of each icon button the same?

### Content

- An "-ing" phrase tacked onto a sentence, such as "highlighting…", "ensuring…" or "reflecting…". Delete it, or make it a sentence that says something.
- A vague source, such as "experts believe" or "it is widely known". Name the source or delete the claim.
- A generic ending, such as "the future looks bright". State a plan or a fact, or end earlier.

### Words

- AI vocabulary. Additionally, crucial, delve, enduring, enhance, fostering, garner, interplay, intricate, landscape, pivotal, robust, seamless, showcase, tapestry, testament, underscore, vibrant. Use plain words.
- Metaphor nouns. Substrate, wedge, vector, locus, nexus, primitive, harness, surface, bedrock, scaffolding, modality, paradigm, north star, flywheel, endgame. Use the concrete word, such as "base", "add", "way" or "the last phase".
- Figurative verbs and personified code, such as "rides along", "stands on" or "the plan holds it". Say what happens.
- Adverbs that prop up a weak verb, such as "runs quickly" or "significantly improves". Use a stronger verb or a number.
- Hedging, such as "could potentially". Write "may", or state the fact.
- American spelling outside code. Color, favorite, license as a noun, behavior.

### Shapes

- "Not just X, but Y". State the point.
- Ideas forced into groups of three. Use the number there really is.
- "From X to Y" where X and Y aren't two ends of a scale. List the things.
- Synonyms cycled for one thing. Pick one name and repeat it.
- Comparison framing used as a crutch, such as "If you're coming from X:". In a page for agents, a comparison earns its place only when it corrects a wrong guess.
- Chatbot phrases and flattery, such as "Of course!", "Great question" or "I hope this helps". Delete them.

### The reader

- Does a sentence give a person a job, such as "You manage…", where it should show what they get?
- Does any sentence sound odd read aloud, such as "the user" where a person would say "you"?
- Is there a sentence a newcomer doesn't need yet? Move it to a page in `docs/`.
- In the README, can someone see what Wren offers in a few seconds, from one short paragraph and a bullet list?
- In a page for agents, does every rule have its reason, its symptom where there is one, and what to do instead?

### Facts

- Is every name, path, command and behaviour checked against the source?
- Is every claim about Wren Runtime checked against its release in `.wren/runtime`?
