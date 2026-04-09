# OpenCase — Investigation Simulator: Current State

**Commit:** `1758e52` on `master`
**Stack:** Next.js 16.2.1, Tailwind CSS 4, PostgreSQL (Jmail archive), Web Audio API
**Running:** `localhost:3006`

---

## What This App Is

A digital cork board for investigating the Epstein case. Users pin people and evidence (emails, photos, documents, iMessages) to a canvas and draw connections between them. Think crime-show evidence wall — red string connecting photos and documents — but interactive.

---

## The Main Board (default view)

Three-panel layout:

- **Left panel (230px):** Evidence browser with tabs for Photos, Emails, Files. Each item is draggable onto the board. Has a search bar at top. Panel width is fixed at 230px in normal mode.

- **Center:** The board canvas. Dark background with dot grid and parallax scrolling. Cards are positioned absolutely and connected by red SVG bezier curves. Ctrl+scroll zooms. Click-drag on background pans. Cards have physics-like interaction polish (slight rotation on drag, bounce on drop, ripple effect on land, synthesized sounds for all actions).

- **Right panel (230px):** People directory. Lists all known persons. Click to add to board. Multi-select spotlight filter — click multiple people to dim everything unrelated to them. Shows "Filtering X of Y" with clear button.

Both side panels have toggle buttons ("EVIDENCE" / "PEOPLE") at top-left of the board. Collapsing panels gives the board more horizontal space.

---

## Card Types

**Person cards:** Dark card with red left accent bar, photo thumbnail, name in large text. Shows collapsed evidence tabs above the card (small pills like "3 emails", "2 photos") that expand on click. Importance scaling — more connections = slightly larger card.

**Evidence cards:** Smaller than person cards. Left border color varies by type (email=red, document=blue, photo=green, iMessage=purple). Shows type icon, title, snippet. Same importance scaling.

**Semantic zoom:** Below 0.55 zoom, cards switch to compact mini-mode (just photo + name for people, just icon + title for evidence). Photos stay large at all zoom levels.

**Edge bundling:** Multiple connections between the same pair of nodes collapse into a single thicker line with a count badge.

---

## Organize Modes (toolbar at bottom of board)

- **Grid:** Cards in a centered grid, people first then evidence
- **Split:** People in a horizontal row across top, evidence in rows below
- **Network:** Fruchterman-Reingold force-directed layout, centered in viewport
- **Wide:** Like Network but with much higher repulsion and scale-to-fit — fills the entire viewport
- **Ego:** Pick a person, everyone else radiates outward in concentric rings by connection distance
- **Lab / Lab 2:** Experimental layouts (fCoSE via cytoscape, alternative force-directed)
- **Compare:** Pick two people, shows all paths between them in a columnar layout with shared evidence in the center

All modes use actual viewport dimensions to fill available space when panels are collapsed.

---

## Evidence-Focus Mode (resizable panel feature)

The left evidence panel has a draggable resize handle (thin strip with 3 dots between panel and board). Drag it past 40% of screen width and the app snaps into evidence-focus mode:

- Right panel auto-hides
- Board compresses into a mini-board showing only spotlighted people + their direct connections
- Evidence cards in the panel get richer — emails show 6 lines of body text instead of truncated, photos display in a 2-3 column grid with descriptions, files show full snippets
- If no people are spotlighted, a prompt appears over the mini-board with quick-select chips for your top connected people
- Drag the panel back narrow to return to normal mode

---

## Evidence Pack ("NEW EVIDENCE" button)

Pulsing red button at bottom-left of board. Click to fetch 7 curated evidence items in a split-screen tray above the board:

- Mix of direct evidence (related to people on your board), cryptic (interesting peripheral), and fodder (noise)
- Items appear as flip cards — back shows category color hint, click to flip and reveal content
- Drag flipped cards onto the board to add them
- Tray auto-closes when all items are used or dismissed

---

## Focused Investigation Mode

Double-click a person on the board to enter a full-screen focused investigation session. This is a self-contained game loop:

**Layout:** The person is centered at top. 5-8 curated evidence items orbit around them, color-coded by relevance: red=direct (40%), yellow=tangential (30%), blue=temporal (20%), purple=wildcard (10%).

**Interaction:** Click evidence to expand and read full content. Three action buttons appear: Connect (draws red string to person, +100 points), Dismiss (slides card off screen, +25 points), Uncertain (yellow border, revisit later). As you process items, new waves of evidence appear (up to 4 waves, later waves shift toward more tangential content).

**Layout on enter:** Board auto-arranges into an ego-wide layout centered on the investigated person with all collapsed evidence groups expanded. New evidence items animate in with staggered bounce. A bouncing arrow indicator points to new evidence.

**Double-click evidence** during investigation opens a split-screen detail view of that specific card alongside the board.

**Completion:** Hit "Complete Investigation" for a summary screen showing connections made, evidence dismissed, items marked for follow-up, and points earned. "Return to Board" integrates everything — new evidence and connections added to the main board.

**Top bar:** Breadcrumb ("Main Board / Investigating [Name]"), live point counter, progress indicator.

---

## Leads System

A leads modal that presents investigation leads/missions to the user. Defined in `src/lib/lead-definitions.ts` with types in `src/lib/lead-types.ts`.

---

## Interaction Polish

- **Drag:** Cards rotate slightly toward movement direction (capped at +/-1 degree). Pickup/drop synthesized sounds.
- **Drop:** Bounce animation on land + red ripple pulse effect.
- **Connections:** Two-tone chime sound. Shift+drag from any node draws a connection line to another node.
- **Sounds:** All synthesized via Web Audio API (no audio files). Pickup, drop, connection, discovery, error. Mute toggle stored in localStorage.
- **Parallax:** Background texture scrolls at 0.2x speed relative to content.
- **Collapse tabs:** Small pills above person cards showing evidence type counts. Click to expand/collapse groups. "Expand All" button available.

---

## Tech Notes

- Board state persisted to sessionStorage (nodes, connections, seen evidence IDs)
- Two drag systems: HTML5 native drag (panel to board) and custom mousedown/move/up (on-board repositioning)
- Connection endpoints recalculated after zoom via requestAnimationFrame + 450ms timeout (DOM needs to reflow)
- TABLESAMPLE SYSTEM() used for fast random PostgreSQL queries instead of ORDER BY RANDOM()
- Photo CDN: `assets.getkino.com` with on-the-fly image resizing via Cloudflare
- Database is read-only Jmail archive: emails, documents, photos, iMessages, people, photo_faces tables

---

## File Map

| File | Purpose |
|------|---------|
| `board-canvas.tsx` (~3500 lines) | All board rendering, organize modes, drag, zoom, connections, toolbar |
| `board-workspace.tsx` (~900 lines) | State orchestrator, panel layout, resize, spotlight, investigation flow |
| `focused-investigation.tsx` (~640 lines) | Full focus investigation mode UI and game loop |
| `intake-panel.tsx` (~1100 lines) | Left evidence panel with Photos/Emails/Files tabs |
| `context-panel.tsx` (~400 lines) | Right people panel with spotlight multi-select |
| `evidence-folder.tsx` (~280 lines) | Evidence pack tray with flip cards |
| `leads-modal.tsx` (~140 lines) | Leads/missions modal |
| `globals.css` (~750 lines) | All animations and transitions |
| `use-board-sounds.ts` | Web Audio synthesized sounds |
| `queries.ts` (~500 lines) | All database queries |
| `api/focus-evidence/route.ts` | Curated evidence endpoint for focus mode |
| `api/evidence-folder/route.ts` | Evidence pack endpoint |
