# ryte-answers

A small connector that lets a Claude Code session ask you a question and have you answer it later in Ryte. It runs on its own, separate from the Ryte app, and Claude Code starts it over stdio.

## Add it

```bash
cd connector && corepack pnpm install
claude mcp add ryte-answers -- node /absolute/path/connector/server.mjs
```

Questions are saved as JSON files in `~/Library/Application Support/ryte-answers/questions/`. Set `RYTE_ANSWERS_DIR` to keep them somewhere else, for example inside your notes folder so they show in Ryte's file tree.

## What slice 0 does

- `ask` checks a question against the contract and saves it as `questions/<id>.json`. A bad question (no decisions, or a choice with fewer than two options) is refused and nothing is written.
- `answers` takes a question id and says there is no answer yet, or that the question doesn't exist.

It doesn't yet take answers, keep receipts, or write summaries. Those come in later slices.

The record shape is defined by the contract (kept in the owner's notes); `contract.mjs` is its machine form.

## Pinned dependencies

`pnpm.overrides` in `package.json` holds five packages that the MCP SDK pulls in, pinned to versions at least 7 days old. Remove the overrides when the SDK is next upgraded, then check the new lockfile against the same rule.

## Test

```bash
corepack pnpm test
```
