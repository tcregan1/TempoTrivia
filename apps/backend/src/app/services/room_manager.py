"""Room state management utilities."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Optional

from fastapi import WebSocket


@dataclass
class Player:
    """Simple representation of a player within a room."""

    id: str
    name: str
    score: int = 0


@dataclass
class Room:
    """Mutable in-memory state for an active room."""

    code: str
    players: List[Player] = field(default_factory=list)
    sockets: List[WebSocket] = field(default_factory=list)
    host_id: Optional[str] = None
    selected_mode: str = ""
    current_song: Optional[Dict[str, Any]] = None
    played_song_ids: List[int] = field(default_factory=list)
    round_number: int = 0
    round_start_time: Optional[float] = None
    total_rounds: int = 10
    host_only_audio: bool = False
    game_state: str = "lobby"


class RoomManager:
    """Encapsulates room, player, and socket lifecycle logic."""

    def __init__(self) -> None:
        self._rooms: Dict[str, Room] = {}
        self._socket_index: Dict[WebSocket, Dict[str, str]] = {}

    # ------------------------------------------------------------------
    # Room helpers
    # ------------------------------------------------------------------
    def ensure_room(self, room_code: str) -> Room:
        room_code = room_code.upper()
        if room_code not in self._rooms:
            self._rooms[room_code] = Room(code=room_code)
        return self._rooms[room_code]

    def get_room(self, room_code: str) -> Optional[Room]:
        return self._rooms.get(room_code.upper())

    def remove_room_if_empty(self, room_code: str) -> None:
        room = self.get_room(room_code)
        if room and not room.sockets:
            self._rooms.pop(room_code.upper(), None)

    # ------------------------------------------------------------------
    # Player helpers
    # ------------------------------------------------------------------
    def add_player(self, room_code: str, player_id: str, name: str, ws: WebSocket) -> Player:
        room = self.ensure_room(room_code)
        player = Player(id=player_id, name=name)
        room.players.append(player)
        room.sockets.append(ws)
        self._socket_index[ws] = {"roomCode": room.code, "playerId": player_id}
        if room.host_id is None:
            room.host_id = player_id
        return player

    def remove_connection(self, ws: WebSocket) -> Optional[Dict[str, Any]]:
        meta = self._socket_index.pop(ws, None)
        if not meta:
            return None

        room_code = meta["roomCode"]
        player_id = meta["playerId"]
        room = self.get_room(room_code)
        if not room:
            return None

        room.sockets = [s for s in room.sockets if s is not ws]
        room.players = [p for p in room.players if p.id != player_id]

        host_changed = False
        if room.host_id == player_id:
            room.host_id = room.players[0].id if room.players else None
            host_changed = True

        self.remove_room_if_empty(room_code)
        return {
            "roomCode": room_code,
            "playerId": player_id,
            "hostChanged": host_changed,
        }

    def get_player(self, room_code: str, player_id: str) -> Optional[Player]:
        room = self.get_room(room_code)
        if not room:
            return None
        for player in room.players:
            if player.id == player_id:
                return player
        return None

    # ------------------------------------------------------------------
    # Socket helpers
    # ------------------------------------------------------------------
    def get_socket_meta(self, ws: WebSocket) -> Optional[Dict[str, str]]:
        return self._socket_index.get(ws)

    def get_socket_for_player(self, room_code: str, player_id: str) -> Optional[WebSocket]:
        room = self.get_room(room_code)
        if not room:
            return None
        for ws in room.sockets:
            meta = self._socket_index.get(ws)
            if meta and meta.get("playerId") == player_id:
                return ws
        return None

    def iter_sockets(self, room_code: str, *, exclude_players: Optional[Iterable[str]] = None) -> Iterable[WebSocket]:
        room = self.get_room(room_code)
        if not room:
            return []
        exclude = set(exclude_players or [])
        for ws in list(room.sockets):
            meta = self._socket_index.get(ws)
            if meta and meta.get("playerId") in exclude:
                continue
            yield ws

    async def broadcast(self, room_code: str, message: Dict[str, Any], *, exclude_players: Optional[Iterable[str]] = None) -> None:
        room = self.get_room(room_code)
        if not room:
            return
        dead: List[WebSocket] = []
        for ws in self.iter_sockets(room_code, exclude_players=exclude_players):
            try:
                await ws.send_text(json.dumps(message))
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.remove_connection(ws)

    async def send_to_player(self, room_code: str, player_id: str, message: Dict[str, Any]) -> None:
        ws = self.get_socket_for_player(room_code, player_id)
        if not ws:
            return
        try:
            await ws.send_text(json.dumps(message))
        except Exception:
            self.remove_connection(ws)

    # ------------------------------------------------------------------
    # Derived data
    # ------------------------------------------------------------------
    def build_room_state_payload(self, room_code: str) -> Dict[str, Any]:
        room = self.get_room(room_code)
        if not room:
            return {
                "type": "room_state",
                "payload": {"roomCode": room_code, "players": [], "hostId": None, "selectedMode": ""},
            }

        return {
            "type": "room_state",
            "payload": {
                "roomCode": room.code,
                "hostId": room.host_id,
                "players": [
                    {"id": player.id, "name": player.name, "isHost": player.id == room.host_id}
                    for player in room.players
                ],
                "selectedMode": room.selected_mode,
            },
        }


__all__ = ["RoomManager", "Room", "Player"]
