from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from typing import Dict, List
import json, uuid

app = FastAPI()

rooms: Dict[str, Dict[str, List]] = {}
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
    for ws in dead:
        if ws in room["sockets"]:
            room["sockets"].remove(ws)


def room_state_payload(room_code: str) -> dict:
    room = rooms.get(room_code, {"players": [], "host_id": None})
    host_id = room.get("host_id")
    return {
        "type": "room_state",
        "payload": {
            "roomCode": room_code,
            "hostId": host_id,
            "players": [
                {"id": p["id"], "name": p["name"], "isHost": (p["id"] == host_id)}
                for p in room["players"]
            ],
        },
    }


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await ws.accept()

    player_id = None
    room_code = None

    try:
        raw = await ws.receive_text()
        msg = json.loads(raw)

        if not isinstance(msg, dict) or msg.get("type") != "join":
            await ws.close(code=1003)
            return

        payload = msg.get("payload") or {}
        room_code = str(payload.get("roomCode", "")).upper()
        nickname = str(payload.get("nickname", "")).strip()

        # Validation
        if len(room_code) != 6 or not room_code.isalnum() or len(nickname) < 2:
            await ws.send_text(json.dumps({"type": "error", "payload": {"code": "INVALID_JOIN"}}))
            await ws.close(code=1008)
            return

        rooms.setdefault(room_code, {"players": [], "sockets": [], "host_id": None})

        # Register player
        player_id = uuid.uuid4().hex[:8]
        rooms[room_code]["players"].append({"id": player_id, "name": nickname})
        rooms[room_code]["sockets"].append(ws)
        socket_index[ws] = {"roomCode": room_code, "playerId": player_id}

        # Set host if first player
        if rooms[room_code]["host_id"] is None:
            rooms[room_code]["host_id"] = player_id

        # Send joined confirmation
        await ws.send_text(json.dumps({
            "type": "joined",
            "payload": {
                "playerId": player_id,
                "hostId": rooms[room_code]["host_id"],
                "roomCode": room_code,
                "nickname": nickname,
            }
        }))

        # Broadcast room state to all players
        await broadcast_room(room_code, room_state_payload(room_code))

        # ONGOING MESSAGES HANDLED HERE
        while True:
            raw = await ws.receive_text()
            print(f" Received: {raw}")
            msg = json.loads(raw)
            msg_type = msg.get("type")
            print(f" Message type: {msg_type}")
            payload = msg.get("payload", {})

            if msg_type == "start_game":
                print(f" Start game request from player {player_id}")
                room = rooms.get(room_code)
                
                # Check if sender is host
                if not room or player_id != room.get("host_id"):
                    print(f" Not host! player_id={player_id}, host_id={room.get('host_id')}")
                    await ws.send_text(json.dumps({
                        "type": "error",
                        "payload": {"code": "NOT_HOST"}
                    }))
                    continue

                print(f" Starting game for room {room_code}")

                # Broadcast game state change
                await broadcast_room(room_code, {
                    "type": "game_state_changed",
                    "payload": {"newState": "playing"}
                })

                # Send round data
                await broadcast_room(room_code, {
                    "type": "round_started",
                    "payload": {
                        "songData": {
                            "url": "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
                            "title": "Test Song",
                            "artist": "Test Artist"
                        },
                        "duration": 20
                    }
                })

            elif msg_type == "submit_answer":
                artist = payload.get("artist", "").strip()
                title = payload.get("title", "").strip()
                print(f" Answer from {player_id}: {artist} - {title}")
                
                # TODO: Check if answer is correct
                # TODO: Update player score
                # For now, just acknowledge
                await ws.send_text(json.dumps({
                    "type": "answer_received",
                    "payload": {"artist": artist, "title": title}
                }))

    except WebSocketDisconnect:
        print(f" Player {player_id} disconnected")
    finally:
        meta = socket_index.pop(ws, None)
        if meta:
            rc = meta["roomCode"]
            pid = meta["playerId"]
            room = rooms.get(rc)
            if room:
                # Remove socket & player
                room["sockets"] = [s for s in room["sockets"] if s is not ws]
                room["players"] = [p for p in room["players"] if p["id"] != pid]

                # Reassign host if needed
                if room.get("host_id") == pid:
                    room["host_id"] = room["players"][0]["id"] if room["players"] else None

                if not room["sockets"]:
                    rooms.pop(rc, None)
                else:
                    await broadcast_room(rc, room_state_payload(rc))