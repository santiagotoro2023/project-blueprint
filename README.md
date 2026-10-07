# project-blueprint

The gold standard for every app of the family: one design, one logo style, one installer, one
way to deploy (Debian, Docker Compose, Kubernetes, Helm), one repository layout, one way to test
and to document. Taken from [PacketPilot](https://github.com/santiagotoro2023/packetpilot), which
is built on it. Every app made from it looks, feels and is run exactly the same way; only its
purpose, and therefore its pages, differ.

## Start a new app

Open a new Claude Code session (claude.ai/code or the CLI), paste everything in the box below,
fill in the part under **The app** at the end, and send it.

````text
Build a new app with the project blueprint (https://github.com/santiagotoro2023/project-blueprint).
The blueprint is the gold standard for this app: its specification wins over your own taste,
habits and other conventions, in design, structure, installer, deployment, tests and docs.

1. Get the blueprint and read it before anything else:
     git clone --depth 1 https://github.com/santiagotoro2023/project-blueprint /tmp/project-blueprint
   Read /tmp/project-blueprint/spec/README.md completely, then 10-composition.md, 01-design.md,
   02-logo.md, 03-repository.md and 07-backend.md (if the app needs a server), and skim the rest.

2. Understand the app described under "The app" below. Then ask me, in one message, everything
   you need to know before building: who uses it and how, which data it keeps and whether it must
   be shared (static or server profile), its main areas, what must be there on day one. For each
   question, say what you would choose and why, so that I can just confirm. Do not start building
   before I answered.

3. Propose the plan in one message, and wait for my yes:
   - APP_ID, APP_NAME, tagline, description, profile (static or server), port;
   - the menu (2 to 6 entries with icons) and, per page, its purpose in one sentence and the parts
     it is made of; the home page pattern from spec/10-composition.md and why;
   - the logo: LOGO_PATTERN and LOGO_COLORS and what they stand for;
   - library elements to switch on (spec/12-library.md), and anything that needs a new element;
   - server profile: the tables and the API; anything that would need a deviation (spec/11).

4. Create the app in its own GitHub repository named after APP_ID (create it if you can, otherwise
   ask me to create an empty one and give you access). Then, from the blueprint:
     node /tmp/project-blueprint/tools/blueprint.mjs new <dir> --id … --name "…" --repo owner/<APP_ID> \
       --profile static|server --tagline "…" --description "…" --pattern … --colors …
   Replace the template's example pages with the app's own, composed by spec/10-composition.md
   from the components of spec/01-design.md. Write README.md and CLAUDE.md ("This project") as
   spec/09-documentation.md says.

5. Keep every rule and safeguard: never edit a file the blueprint writes, never touch .blueprint/,
   no other frameworks, databases or dependencies, and never any deviation from the blueprint
   without explaining it to me first and getting my explicit yes (then record it in DEVIATIONS.md).
   A component other apps could use too: propose it for the blueprint's library (spec/12-library.md).

6. Before you say it is done: bash build.sh, node .blueprint/tools/blueprint.mjs check,
   node test/run.mjs, node test/run.mjs --browser, bash test/installer/run.sh debian:12, all green;
   look at every page at 1440x900, 1000x800 and 390x844 in light and dark mode against
   spec/screens/. Commit, push to main, and make sure the GitHub workflow (tests, Compose, installer
   on Debian 12 and 13, image, Helm chart) passes. Then tell me how to install it.

## The app

Name (or leave it to you):
What it does, in a few sentences:
Who uses it, and how often:
What data it keeps; must it be shared between people or devices, or survive a browser being wiped?
The main areas or pages I imagine:
Must have from the start:
Later:
Anything else (where it will run, who installs it, examples of similar tools I like):
````

## What is in here

```
spec/        the specification: the contract and 13 chapters (design, logo, repository, installer,
             deployment, data, backend, testing, documentation, composition, deviations,
             library, updating), reference screenshots and the logo template
core/        the files every app carries, rendered from its project.conf: design system, fonts,
             shell, installer, Dockerfile, Compose, Kubernetes, Helm, workflow, test runner,
             server core (common/, static/, server/)
library/     opt-in elements an app switches on with LIBRARY in project.conf
template/    the starting point of a new app: example pages of every type, owned by the app afterwards
tools/       blueprint.mjs (new, render, check, update, verify, logo) and make-logo.mjs
test/        the blueprint's own tests: rendering, new apps of both profiles, the checks, the library
```

## How it works

- `node tools/blueprint.mjs new <dir> …` creates an app: the template, `project.conf`, the
  blueprint at this version in `.blueprint/` (with checksums), every blueprint file rendered, the
  logo, the lockfile.
- In the app, `bash build.sh` renders the blueprint files from `project.conf` and builds the
  one-file installer. `node .blueprint/tools/blueprint.mjs check` (also in CI) fails when a
  blueprint file was edited, a rule is broken, a dependency or deviation is not approved, or a
  released migration changed.
- `node .blueprint/tools/blueprint.mjs update` moves an app to a newer blueprint version and shows
  what changed. Apps never change by themselves: each one updates when its owner decides, and its
  whole pipeline must pass.
- Profiles: **static** (everything in the browser, nginx) and **server** (Node.js and PostgreSQL,
  backups by the installer). Both install, update and deploy the same way.

## Changing the blueprint

See [spec/13-updating.md](spec/13-updating.md) and [spec/12-library.md](spec/12-library.md). In short: a
branch and a pull request; keep every existing app working; a changelog entry; the blueprint's CI
builds example apps of both profiles with no and with all library elements and runs their whole
pipeline; then raise `BLUEPRINT_VERSION` and tag `vX.Y.Z`.

```bash
node test/run.mjs          # the blueprint's own tests (Docker for PostgreSQL in the server example)
```
