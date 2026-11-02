# Issue tracker: Backlog.md

Issues for this repo are Backlog.md tasks under `backlog/tasks/`, managed
through the `backlog` CLI. Never edit task `.md` files directly; always go
through the CLI and pass `--plain` when reading.

## Conventions

- One issue = one task: `backlog task create "Title" -d "Why" --ac "..."`
- Specs live as Backlog docs: `backlog doc create "<Feature> spec"`; link a
  task to its spec with `--doc <path>` or `--ref`.
- Triage state is a task label (see `triage-labels.md`):
  `backlog task edit <id> --add-label needs-triage`
- Workflow status stays in `-s` (`To Do` / `In Progress` / `Done`); triage
  labels are orthogonal to status.
- Dependencies: `--depends-on task-N`. Discussion: `--comment "..."`.
- Multi-line text: pass real newlines inside quotes; the CLI does not
  interpret `\n`.

## When a skill says "publish to the issue tracker"

Run `backlog task create` once per ticket. Put the rationale in `-d`, each
acceptance criterion in its own `--ac`, and add the triage label with `-l`.

## When a skill says "fetch the relevant ticket"

`backlog task <id> --plain`. The user will normally pass the task id
(`task-12` / `TASK-12`). Use `backlog search "<topic>" --plain` when they
don't.

## PRs as a request surface

Off. External PRs are not part of the triage queue.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a Backlog doc; each **child** is a task.

- **Map**: `backlog doc create "<effort> map"` holding Notes /
  Decisions-so-far / Fog.
- **Child ticket**: a task whose description holds the question, with
  label `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`) and
  `--ref` pointing at the map doc.
- **Blocking**: `--depends-on`. A ticket is unblocked when every dependency
  is `Done`.
- **Frontier**: `backlog task list -s "To Do" --plain`, filter to unblocked
  tickets with no assignee; lowest id wins.
- **Claim**: `backlog task edit <id> -s "In Progress" -a @myself` before
  any work.
- **Resolve**: `--final-summary "<answer>"`, `-s Done`, then append a
  context pointer (gist + task id) to the map doc's Decisions-so-far via
  `backlog doc update`.
