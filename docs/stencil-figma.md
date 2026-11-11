# Stencil in Figma

Stencil's tokens and six components live in a Figma file that is kept in line with the code. Code is the source for values; Figma is where designers compose. Nothing here changes code from Figma.

## What the library holds

- **Variables**, named like the code (`color/text/primary`, `space/100`, `radius/pill`, `font-size/150`). Collections: Color (Light and Dark modes), Space (with negative and block), Radius, Border, Typography. Each variable's web code syntax is its CSS variable, so Dev Mode shows the real token.
- **Components**: StButton, StIconButton, StInput, StSegmented, StCheckbox, StMenuItem, as component sets. The Figma property names are the code prop names (`variant`, `size`, `state`), and each description starts with the code name.

## Export the tokens

```bash
cd app
pnpm stencil:figma-export            # writes app/.stencil-figma/export.json (gitignored)
pnpm stencil:figma-export -- --stdout --min   # one line, to paste into the sync script
```

The file is `{ version, collections: [{ name, modes, variables: [{ name, type, values, scopes, codeSyntax }] }], components: [{ name, props }] }`. Colors are `#rrggbb` or `#rrggbbaa`, sizes are px numbers, and values are resolved from the token sources, not read from CSS.

## Sync the variables (an agent, through the Figma connector)

1. Open a session on your Figma file, then run the export with `--stdout --min`.
2. Paste the JSON over `EXPORT` in `app/scripts/figma/sync-variables.js`. Set `ONLY` to a collection name to sync one per run (the connector returns at most 20 KB), and `DRY_RUN = true` to see what would change first.
3. Run the script with `use_figma`. It finds each collection and variable by name, creates what is missing, sets each mode's value and code syntax, and leaves an alias alone when it resolves to the right color.
4. Read the report: created, updated, unchanged, and "not in code" (variables only in Figma). It never deletes. A second run should create and update nothing.

## Code Connect

`app/figma.config.json` points at `src/renderer/src/stencil/figma/*.figma.js`, one template per component, labelled Vue. Each reads the Figma properties and writes an `<StButton variant="..." size="...">` snippet. The templates use the placeholder `<STENCIL_FILE>`; copy the config to a gitignored `figma.local.json`, put your file's URL in `documentUrlSubstitutions`, and run `npx figma connect publish --config figma.local.json` with a personal access token in the shell (never in the repo).

Code Connect goes from Figma to code only. It shows your snippet in Dev Mode and in the Figma MCP server; it does not change components or variables. The components must be published as a library first.

## Plan needs

- Variables REST API: Enterprise only (the sync above uses the Plugin API through the connector instead).
- Connector writes (`use_figma`) and Code Connect: Professional and up, with a Full seat.
- Publishing the library: Professional and up, by hand (Assets > Libraries > Publish). There is no API for it.
