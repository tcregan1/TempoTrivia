from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from typing import Dict, List
import json, uuid
import aiohttp

from database import Database

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
            


def get_random_song(songId):
    song = Database.get_song(songId)
    return song



async def get_fresh_preview_url(track_id):
    async with aiohttp.ClientSession() as session:
        async with session.get(f'https://api.deezer.com/track/{track_id}') as resp:
            data = await resp.json()
            return data.get('preview')




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
            "selectedMode": room.get("selected_mode", "")
        },
    }
    
def get_mode_options():
    options = Database.get_all_playlists()
    name = [item['name'] for item in options]
    description = [item['description'] for item in options]
    print(options)
    print(name)
    print(description)
    return name, description

async def start_round(room_code):
    
    song = get_random_song(1)
    
    # Fetch fresh URL right before broadcasting
    async with aiohttp.ClientSession() as session:
        async with session.get(f'https://api.deezer.com/track/{song["deezer_track_id"]}') as resp:
            data = await resp.json()
            preview_url = data.get('preview')
    
    
    print("PREVIEW URL:", preview_url)
    await broadcast_room(room_code, {
        "type": "round_started",
        "payload": {
            "songData": {
                "url": preview_url,
                "title": song["title"],
                "artist": song["artist"]
            },
            "duration": 20
        }
    })
    

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

        rooms.setdefault(room_code, {"players": [], "sockets": [], "host_id": None, "selected_mode":""})

        # Register player
        player_id = uuid.uuid4().hex[:8]
        rooms[room_code]["players"].append({"id": player_id, "name": nickname})
        rooms[room_code]["sockets"].append(ws)
        socket_index[ws] = {"roomCode": room_code, "playerId": player_id}

        # Set host if first player
        if rooms[room_code]["host_id"] is None:
            rooms[room_code]["host_id"] = player_id
        
        name, description = get_mode_options()
        await ws.send_text(json.dumps({
            "type":"game_modes",
            "payload": {
                "name": name,
                "description":description,
            }
        }))

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
            if msg_type == "select_game_mode":
                room = rooms.get(room_code)
                selected_mode = payload.get("mode") # Get the mode from the client payload
                
                # Input validation (always a good idea)
                if not selected_mode or not room:
                    continue
                
                # Check if sender is host
                if player_id != room.get("host_id"):
                    print(f" Not host! Cannot select mode.")
                    continue               
                room["selected_mode"] = selected_mode
                payload = {
                    "type": "mode_selected",
                    "payload": {
                        "selectedMode": selected_mode,
                    }
                }
                await broadcast_room(room_code, payload)
                print(f" Mode set and broadcast: {selected_mode}")
                continue 
            
            elif msg_type == "start_game":
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
                
                
                current_mode = room.get("selected_mode")
                print(f" Starting game using mode: {current_mode}")

                # Broadcast game state change (Omitted for brevity)
                await broadcast_room(room_code, {
                    "type": "game_state_changed",
                    "payload": {"newState": "playing"}
                })
                await start_round(room_code)


            elif msg_type == "submit_answer":
                artist = payload.get("artist", "").strip()
                title = payload.get("title", "").strip()
                print(f" Answer from {player_id}: {artist} - {title}")
                song = get_random_song(1)

                if artist == song["artist"] and title == song["title"]:
                    print("ARTIST and TITLE CORRECT")
                elif artist == song["artist"] and not title == song["title"]:
                    print("Only got Artist")
                elif title == song["title"] and not artist == song["artist"]:
                    print("Only Title")
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
                    
    