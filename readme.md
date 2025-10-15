


2) Frontend scaffold (Next.js + health fetch)

 Initialize a Next.js (TypeScript) app in apps/web.
 Ensure src/app/page.tsx renders a basic landing.
 Add .env.local (dev-only) with a backend base URL (also create .env.local.example).
 On the landing page, fetch /health and display the status text.

 Start the Next.js dev server and verify the status displays.

Milestone: Frontend ↔ Backend (HTTP) wired ✅

3) Contract (events & shapes)

 In docs/api-contract.md, write the names + fields (no code):

Client → Server

join: { roomCode: string, nickname: string }

Server → Client

room_state: { roomCode: string, players: Array<{ id: string, name: string }> }

 Create placeholder files in backend for later:

rooms.py (in-memory room tracking)

scoring.py (pure scoring rules)

schemas.py (Pydantic models for events)

Milestone: Contract written & placeholders created ✅

4) WebSocket: basic lobby flow

 Backend /ws: on connect, expect first message to be a join payload.

 Maintain an in-memory map: roomCode → list/set of players & connections.

 On join/leave, broadcast room_state to that room only.

 Frontend /lobby page:

 Open a native WebSocket to the backend using an env var for the URL.

 Immediately send join with { roomCode, nickname }.

 Listen for room_state and render the player list.

 Show a small “connected/disconnected” indicator.

Acceptance test:

 Open two browser tabs to /lobby with the same room code and different nicknames.

 Both tabs show both players in the list.

 Closing one tab updates the other within a moment.

Milestone: Live lobby presence ✅