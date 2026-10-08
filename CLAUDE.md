# project-blueprint

The gold standard for every app of the family (see README.md). This repository is the
blueprint itself: changing it changes every app on its next update.

## Rules for working on the blueprint

- Read `spec/README.md`, `spec/12-library.md` and `spec/13-updating.md` first.
- **Never break an existing app.** No removed installer options, no renamed paths, classes,
  storage keys, environment variables or config keys; selectors of the Helm chart never change. If
  something must break, it is a major version with exact "Projects must" steps in `CHANGELOG.md`.
- **Core or library?** Only what every app needs goes into `core/`; everything else is a library
  element (`library/<name>/`), opt-in per app.
- **Design language stays as it is.** New components use only the tokens of base.css and the
  type scale; their CSS selectors start with their own class.
- `@@PLACEHOLDER@@` and `@@IF static@@` / `@@IF server@@` / `@@IF lib:<name>@@` / `@@IF packages@@` /
  `@@ELSE@@` / `@@END@@` work in every file of `core/`, `template/` and `library/`; markers stand
  alone on their line. A core file that renders empty is not written.
- **Spec and code agree.** A change of behavior changes the spec chapter in the same commit
  (the tests compare tokens and headers).
- **Prove it:** `node test/run.mjs`; then generate an example app of the affected profile(s)
  (`node tools/blueprint.mjs new /tmp/ex …`) and run its `build.sh`, check, unit and browser tests,
  and `bash test/installer/run.sh debian:12` when installer, server or deployment changed. CI does all
  of it for both profiles, with no and with all library elements.
- **Release:** a `CHANGELOG.md` entry, raise `BLUEPRINT_VERSION`, tag `vX.Y.Z` on main. Then update
  PacketPilot (the reference app) first.
