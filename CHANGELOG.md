# Changelog

## 1.0.0 — 2026-11-15

First release. Merges `dsh-sidebar-fold` (折叠) and `dsh-pin-persist` (固定持久化)
into one plugin, since both modify the same part of the left sidebar.

**Added**

- A collapsible header row at the top of the sidebar's global panel list. Click
  the row to fold every other panel icon away; click again to bring them back.
  The row is an ordinary `sidebar.panellist` entry, so it inherits the host's own
  row styling, height and collapsed-rail behaviour. Folding is pure CSS
  (`html[data-sbk-fold="1"]` + `:has()`), so icons from plugins installed later
  are folded too.
- Persistence for the sidebar's unpinned panels. The stock
  `@deepseek-ai/dsh-client-ui-sidebar` keeps that list in memory
  (`createPanelPins()` rebuilds a snapshot store on every apply, with no storage
  backend), so the choice was lost on every reload.
- A **Settings → Left sidebar** page showing the fold toggle, the remembered
  panel ids, and whether the plugin has attached to the live pin store.

**How the pin half attaches**

- Borrows the sidebar entry's own injected pin face through the public
  `ctx.slots.entriesOfSlot('sidebar')` API: the same `setPinned` function and the
  same live `hooks.entryPins` snapshot the sidebar's own component uses. No
  component replacement, no slot takeover, no file patching.
- Replays the saved ids into that store before subscribing, so the empty initial
  snapshot cannot overwrite the saved list on mount.
- Re-attaches on `slots/changed` so a sidebar rebuild does not leave the
  subscription pointing at an orphaned store.

**Migration**

- First run inherits the predecessor plugins' choices and immediately writes them
  to its own keys, so uninstalling the old plugins does not drop them:
  `dsh-sidebar-fold:collapsed` → `dsh-sidebar-kit:folded`,
  `dsh-pin-persist:unpinned` → `dsh-sidebar-kit:unpinned`.

**Compatibility**

- `engines.dsh: >=0.2.0-0` — client-only: one `sidebar.panellist` row, the locale
  service, React from the module table, and the sidebar's injected pin face, all
  unchanged across 0.2.x.
- Uninstalling restores the stock sidebar exactly.
