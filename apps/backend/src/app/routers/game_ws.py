"""WebSocket router for the TempoTrivia game."""

from __future__ import annotations

import json
import uuid
from typing import Any, Dict, List, Tuple

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..database import Database
from ..services import GameService, RoomManager
from ..services.message_handlers import HANDLERS, MessageContext

router = APIRouter()

_room_manager = RoomManager()
_game_service = GameService(_room_manager)


def _get_mode_options() -> Tuple[List[str], List[str]]:
    options = Database.get_all_playlists()
    names = [item.get("name", "") for item in options]
    descriptions = [item.get("description", "") for item in options]
    return names, descriptions


async def _handle_join(ws: WebSocket, payload: Dict[str, Any]) -> Tuple[str, str]:
    room_code = str(payload.get("roomCode", "")).upper()
    nickname = str(payload.get("nickname", "")).strip()

    if len(room_code) != 6 or not room_code.isalnum() or len(nickname) < 2:
        await ws.send_json({"type": "error", "payload": {"code": "INVALID_JOIN"}})
        await ws.close(code=1008)
        raise ValueError("Invalid join payload")

    _room_manager.ensure_room(room_code)
    player_id = uuid.uuid4().hex[:8]
    _room_manager.add_player(room_code, player_id, nickname, ws)

    names, descriptions = _get_mode_options()
    await ws.send_json(
        {
            "type": "game_modes",
            "payload": {"name": names, "description": descriptions},
        }
    )

    room = _room_manager.get_room(room_code)
    await ws.send_json(
        {
            "type": "joined",
            "payload": {
                "playerId": player_id,
                "hostId": room.host_id if room else None,
                "roomCode": room_code,
                "nickname": nickname,
            },
        }
    )

    await _room_manager.broadcast(room_code, _room_manager.build_room_state_payload(room_code))

    return room_code, player_id


@router.websocket("/ws")
async def ws_endpoint(ws: WebSocket) -> None:
    await ws.accept()

    player_id: str | None = None
    room_code: str | None = None

    try:
        raw = await ws.receive_text()
        message = json.loads(raw)
        if not isinstance(message, dict) or message.get("type") != "join":
            await ws.close(code=1003)
            return

        room_code, player_id = await _handle_join(ws, message.get("payload") or {})

        while True:
            raw = await ws.receive_text()
            msg = json.loads(raw)
            msg_type = msg.get("type")
            payload = msg.get("payload", {})

            handler = HANDLERS.get(msg_type)
            if not handler:
                print(f"Unhandled message type: {msg_type}")
                continue

            context = MessageContext(
                ws=ws,
                player_id=player_id,
                room_code=room_code,
                room_manager=_room_manager,
                game_service=_game_service,
            )
            await handler(context, payload)
    except ValueError:
        # _handle_join already notified the client
        return
    except WebSocketDisconnect:
        pass
    finally:
        meta = _room_manager.remove_connection(ws)
        if meta:
            rc = meta["roomCode"]
            if _room_manager.get_room(rc):
                await _room_manager.broadcast(rc, _room_manager.build_room_state_payload(rc))
