# What an HTML or localhost page can do

An HTML page in your notes, and a local address you approve (a dev server, for example), open in a tab like a normal browser tab. Ryte does not lock them down. Open pages you trust.

## What a page can do

1. **Read your notes.** A page can read any file in your notes folder, of any type, Markdown notes included, and nothing outside it. Folders that start with a dot, and `node_modules`, are not served. A page and any web script it loads can therefore read every note.
2. **Use the internet.** It can load scripts and data from the web and send anything on the page anywhere.
3. **Use the clipboard.** It can read and replace what you copied, at any time.
4. **Download files and show alert boxes.** A download goes through the usual macOS save dialog. `alert`, `confirm` and `prompt` work.
5. **Keep what it saves.** Saved data (answers, settings) stays across sleeping, reloading and restarting Ryte. Pages in the same folder share it; a local address keeps its own per address. Nothing clears it automatically.

The camera, the microphone, your location, other devices and system notifications stay off, because Ryte has nowhere to ask you.

## What stays locked

- The page runs in a sandbox with no Node and no Ryte API, and has no address bar.
- A link or a new window opens in your browser only when you click it, never by itself.
- Ryte's own shortcuts still go to Ryte.
- A local address still needs your approval the first time, once or always.

## Where it lives in the code

`app/src/main/page/`: `page-box.ts` (HTML pages), `local-box.ts` (local addresses), `page-view.ts` (the view and the session rules they share), `page-scheme.ts` (the `ryte-page` handler and folder token) and `page-permissions.ts`. HTML pages share one lasting session (`ryte-pages`), and local addresses another (`ryte-local`).
