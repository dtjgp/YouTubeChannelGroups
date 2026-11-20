# YouTubeChannelGroups agent instructions

## Product

A Manifest V3 extension for Chrome, Edge and Brave on the YouTube desktop site, plus an optional
macOS Native Messaging helper (Swift, `native/`) that runs the local Codex or Claude CLI. The user
sorts subscribed channels into categories, browses by category, and reviews AI suggestions before
they are applied. Data stays in the browser; there is no telemetry.

The helper has its own version (see `CHANGELOG.md`). A helper change needs the user to run the
installer again; say so in the change.

## Read first

1. This file, then the nearest test and source files.
2. The latest section of `docs/task.md` for the current scope and boundaries.
3. `docs/design-guidance.md` before any UI, accessibility, layout, performance, privacy or security
   change. Its acceptance flow is required, not advisory.

## One-way doors

These actions cannot be undone, spend the user's quota, or act on the user's real account. Ask the
user before each one. Never automate them in tests.

- **YouTube subscriptions.** The extension never clicks YouTube's final unsubscribe confirmation.
  Unsubscribe is one channel at a time; there is no batch unsubscribe (user decision, v0.13.0).
- **Saved user data.** Removal suggestions appear only when the subscription list loaded
  completely, and nothing is preselected. Do not delete the user's saved channels or categories.
- **Real models and paid APIs.** Development and tests use the mock AI service. Do not call the
  user's Codex, Claude or cloud API accounts.
- **Live pages.** `YCG_REAL_WEB=1` (live YouTube) and `YCG_VOICEOVER=1` (screen reader) runs are
  opt-in only.
- **Machine state.** Installing or registering the native helper, removing files in system
  temporary folders, and changing the extension ID (a fixed key changes the ID and data ownership;
  migration is undecided).
- **Publication.** Commit, push, GitHub Release and store publication.

Privileged panel actions (spend AI quota, change subscriptions, remove data) must ignore synthetic
clicks (`event.isTrusted`), because YouTube page scripts can call `element.click()`. Keep this
guard on every new privileged action.

## Decisions already made

Do not reopen these without a new reason from the user.

- The panel always floats. It never reserves side space or changes YouTube's layout, video size or
  scroll position (v0.8.1).
- No heuristic repair of repeated names such as "X X"; real names like "Duran Duran" exist (v0.12.0).
- The old local HTTP bridge was removed (v0.11.0). AI runs through Native Messaging or a
  user-configured API.
- Avatars load only from the HTTPS hosts `yt3.ggpht.com` and `yt3.googleusercontent.com`, and are
  never sent to AI.
- Do not add extension permissions without an explicit scope from the user.
- Ask before you add a feature, setting, toggle or UI text that the user did not request.

## Verification

```bash
npm run check                               # syntax of every runtime file
npm test                                    # unit tests
npm run build:native && npm run test:native # macOS helper
npm run package                             # package list and version consistency
npm run test:browser                        # Playwright Chromium, isolated pages and mock AI
```

- Run the focused test first, then all five before a commit. CI runs the same set.
- A new `extension/*.js` file must be added to the `check` script in `package.json` and to the
  `files` set in `scripts/package_extension.py`.
- A release changes the version in `extension/manifest.json`, `package.json` and
  `package-lock.json` together, and adds a `CHANGELOG.md` entry.
- For user-visible changes, follow the acceptance flow in `docs/design-guidance.md`: Chinese and
  English, light and dark, narrow viewport, focus, and screenshots you have inspected.

## Workflow

- **Before code:** state what will change, which features it affects, and how you will verify it.
- **Behavior first:** for new behavior, turn the requirement into behavior tests first. For
  user-visible behavior, let the user confirm the test points, then implement until they pass.
- **Small slices:** each commit is one usable step and leaves all checks green.
- **Bugs:** find the cause before you change code. After two failed attempts, stop guessing: add
  temporary diagnostics and read the real runtime data. Diagnostics must not log API keys or the
  user's channel data. After three failed attempts, stop: add a dated handoff entry to
  `docs/task.md` (problem, expected and actual behavior, reproduction, each attempt and why it
  failed, current hypothesis), revert unverified attempt changes, and restart in a fresh session.
- **Same root cause:** when the cause is known, search for the same pattern and fix every
  occurrence with that cause in the same change. Record other similar problems as follow-ups.
- **Regression tests:** every fixed bug, including user-reported ones, gets a test that stays in
  the suite.
- **Review:** a separate agent with fresh context reviews the diff, not the agent that wrote it.
  Limit review to three rounds. Round one reviews the full diff; later rounds review only the
  changes since the previous round. If a critical or high finding is still open after round three,
  stop and report it.
- **Parallel agents:** each agent works in its own worktree and stages only its own paths. Run the
  full verification set after the work is merged.
- **Records:** add each version's goal, scope, verification, stop condition and boundaries to
  `docs/task.md`, and its results to `docs/verification.md`. Report checks that did not run as not
  run.

## Commit message

Use Conventional Commits; add the version to the subject for a release, for example
`feat: ... (v0.15.1)`. Except for typo or formatting-only commits, the body has three parts:

```text
What changed: <the behavior or files that changed, and why>
Verification: <the commands or checks that ran, and their results>
Rollback: <how to undo it; say if users must reinstall the helper or restore a backup>
```

## Security and privacy

- Treat YouTube page content, channel names and descriptions, backup files and model output as
  untrusted. Write them as text, never as HTML, and validate them at the boundary.
- Never commit, log or export API keys. Keep `.env` files and keys out of the repository.
- Send AI only the data the current batch needs: channel names, URLs, collected descriptions and
  category names.
