from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from typing import Dict, List
import json, uuid
import aiohttp
import time
from database import Database
import asyncio

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

async def start_round(room_code: str):
    room = rooms.get(room_code)
    if not room:
        return

    # ensure exclude ids are INTs and unique
    exclude_ids = list({int(x) for x in room.get("played_song_ids", []) if x is not None})

    # TODO: use the real playlist/mode id instead of hard-coded 1
    song = Database.get_random_song_exclude_ids(1, exclude_ids)
    if not song:
        await broadcast_room(room_code, {"type": "no_more_songs", "payload": {}})
        return

    room["current_song"] = song
    # record the DB id you are excluding on
    room.setdefault("played_song_ids", [])
    if song["id"] not in room["played_song_ids"]:
        room["played_song_ids"].append(int(song["id"]))

    room["round_number"] += 1
    room["round_start_time"] = time.time()

    preview_url = await get_fresh_preview_url(song["deezer_track_id"])

    if room.get("host_only_audio"):
        host_id = room.get("host_id")
        host_ws = next((ws for ws in room["sockets"] if socket_index.get(ws, {}).get("playerId") == host_id), None)
        if host_ws:
            await host_ws.send_text(json.dumps({
                "type": "round_started",
                "payload": {"songData": {"url": preview_url, "title": song["title"], "artist": song["artist"]}, "duration": 30, "isHost": True}
            }))
        for ws in room["sockets"]:
            if socket_index.get(ws, {}).get("playerId") != host_id:
                await ws.send_text(json.dumps({
                    "type": "round_started",
                    "payload": {"songData": {"url": "", "title": song["title"], "artist": song["artist"]}, "duration": 30, "isHost": False}
                }))
    else:
        await broadcast_room(room_code, {
            "type": "round_started",
            "payload": {"songData": {"url": preview_url, "title": song["title"], "artist": song["artist"]}, "duration": 30}
        })

    asyncio.create_task(round_timer(room_code, 30))



async def round_timer(room_code, duration):
    await asyncio.sleep(duration)
    await end_round(room_code)


def check_answer(artist_guess, title_guess, artist, title) -> str:   
    def normalize(text):
        return ''.join(text.lower().split())

    artist_guess = normalize(artist_guess)
    title_guess = normalize(title_guess)
    artist = normalize(artist)
    title = normalize(title)
    

    if artist_guess == artist and title_guess == title:
        print("ARTIST and TITLE CORRECT")
        return "artist and title"
    elif artist_guess == artist:
        print("Only Artist Correct")
        return "artist"
    elif title_guess == title:
        print("Only Title Correct")
        return "title"
    else:
        return "none"
    
async def end_round(room_code):
    room = rooms.get(room_code)
    room["game_state"] = "leaderboard"
    leaderboard = sorted(room["players"], key=lambda p: p["score"], reverse=True)   
    await broadcast_room(room_code, {
        "type": "round_ended",
        "payload": {
            "leaderboard": [{"name": p["name"], "score": p["score"]} for p in leaderboard],
            "currentRound": room["round_number"],
            "totalRounds": room["total_rounds"]
        }
    })
    if room["round_number"] >= room["total_rounds"]:
        room["game_state"] = "ended"
        await broadcast_room(room_code, {
            "type": "game_ended",
            "payload": {"finalLeaderboard": leaderboard}
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

        rooms.setdefault(room_code, {
            "players": [],
            "sockets": [], 
            "host_id": None,
            "selected_mode":"", 
            "current_song":None,
            "played_song_ids":[],
            "round_number": 0,
            "round_start_time": None,
            "total_rounds":10,
            "host_only_audio": False
            })

        # Register player
        player_id = uuid.uuid4().hex[:8]
        rooms[room_code]["players"].append({"id": player_id, "name": nickname, "score": 0})
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
                
                elapsed = time.time() - room["round_start_time"]
                room = rooms.get(room_code)
                if not room:
                    print(f"Room {room_code} not found.")
                    return
                artist = payload.get("artist", "").strip()
                title = payload.get("title", "").strip()
                print(f" Answer from {player_id}: {artist} - {title}")
                song = room["current_song"]
                print(f"THE SONG IS: {song["title"]}")
                print(f"THE Artist IS: {song["artist"]}")
                if not song:
                    print(f"Song not set for {room_code}")
                    return
                result = check_answer(artist, title, song["artist"], song["title"])
                print(f"Result:{result}")
                if result == "artist and title":
                    base_score = 1000
                    speed_penalty = (elapsed * 10)
                    score = max(base_score - speed_penalty, 100)
                    score = int(round(score, 10))
                    for player in room["players"]:
                        if player["id"] == player_id:
                            player["score"] += score
                            break
                        
                elif result == "title" or result == "artist":
                    base_score = 500
                    speed_penalty = (elapsed * 10)
                    score = max(base_score - speed_penalty, 50)
                    score = int(round(score,10))
                    for player in room["players"]:
                        if player["id"] == player_id:
                            player["score"] += score
                            break
                
                print(f"Player score = {player["score"]}")
                await ws.send_text(json.dumps({
                    "type": "answer_received",
                    "payload": {"artist": artist, "title": title}
                }))
            elif msg_type == "next_round":
                room = rooms.get(room_code)
                if player_id != room.get("host_id"):
                    continue
    
                if room["round_number"] < room["total_rounds"]:
                    await start_round(room_code)
            elif msg_type == "set_audio_mode":
                room = rooms.get(room_code)
                if player_id != room.get("host_id"):
                    continue
    
            host_only = payload.get("hostOnly", False)
            room["host_only_audio"] = host_only
    
            await broadcast_room(room_code, {
                "type": "audio_mode_set",
                "payload": {"hostOnlyAudio": host_only}
            })

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


                    
    