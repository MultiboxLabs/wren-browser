# Plans

A plan sets out a big change before it's made, so the user can approve it and another agent can carry it out with only the plan and the code. Write one here, as `<name>.md`, before starting a big change.

## Writing a plan

Load the `writing` skill first. A plan is a page for agents, so its rules for those apply.

- **Write it for an agent that knows nothing else.** It should hold everything needed to carry out the change, other than the plan and the code. Name the files to read first and what each holds now.
- **Open with the status, then the goal.** The goal says what is true today and what will be true after. Give the rules of the new behaviour as numbered sentences, and say what's out of scope.
- **Make each uncertainty a decision.** Number it, recommend an answer with its reason, and ask the user to settle it. Don't guess and carry on.
- **Split a large plan into phases.** Each phase ends in a working app, and is one commit.

## Status

A plan opens with its status, as `- **Status:** proposed` under the title. It goes through these stages:

1. **proposed**, until the user has read it;
2. **approved** or **rejected**, by the user;
3. **completed**, once every phase is committed.

Start work only on an approved plan. Commit on `main`, as `AGENTS.md` says, unless the user asks for a branch.
