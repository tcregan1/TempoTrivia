from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from typing import Dict, List
import json, uuid

app = FastAPI()


rooms: Dict[str, Dict[str, List]] = {}

# Track where a socket belongs so we can clean up on disconnect
socket_index: Dict[WebSocket, Dict[str, str]] = {}


async def broadcast_room(room_code: str, message: dict):
    room = rooms.get(room_code)
    if not room:
        return
    dead = []
    for ws in room["sockets"]:
        try:
            await ws.send_text(json.dumps(message))
        except Exception:
            dead.append(ws)
    # prune dead sockets
    for ws in dead:
        if ws in room["sockets"]:
            room["sockets"].remove(ws)


def room_state_payload(room_code: str) -> dict:
    room = rooms.get(room_code, {"players": []})
    return {
        "type": "room_state",
        "payload": {
            "roomCode": room_code,
            "players": [{"id": p["id"], "name": p["name"]} for p in room["players"]],
        },
    }


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await ws.accept()

    player_id = None
    room_code = None

    try:
        # FIRST MESSAGE MUST BE: {"type":"join","payload":{"roomCode":"ABC123","nickname":"Tom"}}
        raw = await ws.receive_text()
        msg = json.loads(raw)

        if not isinstance(msg, dict) or msg.get("type") != "join":
            await ws.close(code=1003)  # unsupported data
            return

        payload = msg.get("payload") or {}
        room_code = str(payload.get("roomCode", "")).upper()
        nickname = str(payload.get("nickname", "")).strip()

        # super-basic validation
        if len(room_code) != 6 or not room_code.isalnum() or len(nickname) < 2:
            await ws.send_text(json.dumps({"type": "error", "payload": {"code": "INVALID_JOIN"}}))
            await ws.close(code=1008)  # policy violation
            return

        # create room if missing
        rooms.setdefault(room_code, {"players": [], "sockets": []})

        # register player
        player_id = uuid.uuid4().hex[:8]
        rooms[room_code]["players"].append({"id": player_id, "name": nickname})
        rooms[room_code]["sockets"].append(ws)
        socket_index[ws] = {"roomCode": room_code, "playerId": player_id}

        # broadcast presence
        await broadcast_room(room_code, room_state_payload(room_code))

        # (optional) echo any further messages for now
        while True:
            _ = await ws.receive_text()
            # ignore or extend later (e.g., submit_answer)

    except WebSocketDisconnect:
        pass
    finally:
        # cleanup on disconnect
        meta = socket_index.pop(ws, None)
        if meta:
            rc = meta["roomCode"]
            pid = meta["playerId"]
            room = rooms.get(rc)
            if room:
                room["sockets"] = [s for s in room["sockets"] if s is not ws]
                room["players"] = [p for p in room["players"] if p["id"] != pid]
                if not room["sockets"]:
                    # delete empty room
                    rooms.pop(rc, None)
                else:
                    # broadcast updated state
                    await broadcast_room(rc, room_state_payload(rc))
