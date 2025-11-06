"""Message dispatch helpers for the WebSocket router."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Dict

from fastapi import WebSocket

from .game_service import GameService
from .room_manager import RoomManager


@dataclass
class MessageContext:
    ws: WebSocket
    player_id: str
    room_code: str
    room_manager: RoomManager
    game_service: GameService


MessageHandler = Callable[[MessageContext, Dict[str, Any]], Awaitable[None]]


async def handle_select_game_mode(ctx: MessageContext, payload: Dict[str, Any]) -> None:
    room = ctx.room_manager.get_room(ctx.room_code)
    if not room or ctx.player_id != room.host_id:
        return

    selected_mode = payload.get("mode")
    if not selected_mode:
        return

    room.selected_mode = selected_mode
    await ctx.room_manager.broadcast(
        ctx.room_code,
        {
            "type": "mode_selected",
            "payload": {"selectedMode": selected_mode},
        },
    )


async def handle_start_game(ctx: MessageContext, payload: Dict[str, Any]) -> None:  # noqa: ARG001
    room = ctx.room_manager.get_room(ctx.room_code)
    if not room or ctx.player_id != room.host_id:
        await ctx.ws.send_json({"type": "error", "payload": {"code": "NOT_HOST"}})
        return

    await ctx.room_manager.broadcast(
        ctx.room_code,
        {"type": "game_state_changed", "payload": {"newState": "playing"}},
    )
    await ctx.game_service.start_round(ctx.room_code)


async def handle_submit_answer(ctx: MessageContext, payload: Dict[str, Any]) -> None:
    response = await ctx.game_service.process_answer(
        ctx.room_code, ctx.player_id, payload
    )
    await ctx.ws.send_json(response)


async def handle_next_round(ctx: MessageContext, payload: Dict[str, Any]) -> None:  # noqa: ARG001
    room = ctx.room_manager.get_room(ctx.room_code)
    if not room or ctx.player_id != room.host_id:
        return

    if room.round_number < room.total_rounds:
        await ctx.game_service.start_round(ctx.room_code)


async def handle_set_audio_mode(ctx: MessageContext, payload: Dict[str, Any]) -> None:
    room = ctx.room_manager.get_room(ctx.room_code)
    if not room or ctx.player_id != room.host_id:
        return

    host_only = bool(payload.get("hostOnly", False))
    room.host_only_audio = host_only
    await ctx.room_manager.broadcast(
        ctx.room_code,
        {"type": "audio_mode_set", "payload": {"hostOnlyAudio": host_only}},
    )


HANDLERS: Dict[str, MessageHandler] = {
    "select_game_mode": handle_select_game_mode,
    "start_game": handle_start_game,
    "submit_answer": handle_submit_answer,
    "next_round": handle_next_round,
    "set_audio_mode": handle_set_audio_mode,
}


__all__ = ["HANDLERS", "MessageContext"]
