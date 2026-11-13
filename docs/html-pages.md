# What an HTML or localhost page can do

An HTML page in your notes, and a local address you approve (a dev server, for example), open in a tab like a normal browser tab. Ryte does not lock them down. Open pages you trust.

## What a page can do

1. **Read your notes.** A page can read any file in your notes folder, of any type, Markdown notes included, and nothing outside it. Folders that start with a dot, and `node_modules`, are not served, and neither is a link that leads into one. A page and any web script it loads can therefore read every note.
2. **Use the internet.** It can load scripts and data from the web, embed web pages in frames, and send anything on the page anywhere. It can also reach any port on this Mac, approved or not, as a browser tab can.
3. **Use the clipboard.** It can read and replace what you copied, at any time.
4. **Download files and show alert boxes.** A download goes through the usual macOS save dialog, and only while the page's tab is the one showing; a page in a background tab cannot start one. `alert` and `confirm` work, and a page in a background tab can still show them. `prompt` does not work in Electron.
5. **Keep what it saves.** Saved data (answers, settings) stays across sleeping, reloading and restarting Ryte. It is kept per folder for an HTML page (an HTML page only runs under its own folder's address, and an SVG or XML file from another folder is served sandboxed), and per address for a local page. Nothing clears it automatically.

The camera, the microphone, your location, other devices and system notifications stay off, because Ryte has nowhere to ask you. Fullscreen and every other permission not listed above are refused too.

## Coming back as it was

When a page sleeps to save memory, reloads because its file changed, or comes back after Ryte restarts, it returns where you left it, even if the page saves nothing itself: how far it is scrolled (the window and the larger scrolling areas), and what you typed or picked (text boxes, text areas, number, date and similar inputs, drop-downs, checkboxes and radio buttons). Ryte reads this from the page in a separate world, so the page's own code is not involved, and puts the values back after the page loads, then fires `input` and `change` so the page notices. Text in editable regions is not kept. Password, hidden and file inputs are never read. At most 256 KB is kept per page.

It is read when the tab goes to the background, before a reload, and every 30 seconds while the page is showing. It is kept in memory and, for tabs that are still open, in `page-state.json` in the app data folder. It is dropped when the tab closes.

## What stays locked

- The page runs in a sandbox with no Node and no Ryte API, and has no address bar.
- A page cannot move itself to a website or any other address. Only your click on a link opens one, in your browser. A redirect from a local server to another address is refused too.
- A link or a new window opens in your browser only when you click it, never by itself.
- Frames inside a page may load the web, but not local files, your notes through `ryte-file`, or Ryte's own window.
- Ryte's own shortcuts still go to Ryte.
- A local address needs your approval the first time, once or always. That approval is only for opening it in a tab; any page can still reach any local port.

## Where it lives in the code

`app/src/main/page/`: `page-box.ts` (HTML pages), `local-box.ts` (local addresses), `page-view.ts` (the view and the session rules they share), `page-scheme.ts` (the `ryte-page` handler and folder token) and `page-permissions.ts`, with `page-state.ts` and `page-memory.ts` for coming back as it was. HTML pages share one lasting session (`ryte-pages`), and local addresses another (`ryte-local`). A folder's token is a hash of its path with a random salt kept in `page-token-salt` in the app data folder.
