# File Types Manual Smoke

Use this checklist before a release that includes pictures, code, video, HTML pages or local addresses. Use a synthetic notes folder only. Do not paste real note content, API keys, local database paths, or private file excerpts into this document or a PR.

## Environment

- Date:
- Branch:
- App version:
- Node version:
- pnpm version:
- macOS version:

## Required Automated Checks

- [ ] `pnpm guard:branch`
- [ ] `pnpm validate`
- [ ] `pnpm smoke:indexer`

## Manual App Checks

| Check                                                                                                               | Result | Notes |
| ------------------------------------------------------------------------------------------------------------------- | ------ | ----- |
| A picture in a note shows, and its lightbox opens and closes                                                        |        |       |
| A picture shows in the tree and quick open, and opens as a tab                                                      |        |       |
| A code file and a JSON file open in the code view, and a too-large file says so                                     |        |       |
| A video plays and seeks, in its own tab and inside a note                                                           |        |       |
| An HTML page opens in its tab and shows the blocked notice when it asks for the network                             |        |       |
| "Open in browser (not locked)" opens that one page in the default browser                                           |        |       |
| A link in an HTML page opens the browser only on a real click, and a page-to-page link stays in the tab             |        |       |
| A link to a local address asks first: Open once opens it, Always allow opens it and remembers, Cancel opens nothing |        |       |
| Removing an allowed address in Preferences makes it ask again                                                       |        |       |

## Follow-Ups

Record any failures here with a short description and the target follow-up PR.
