"""Domain logic for running TempoTrivia games."""

from __future__ import annotations

import asyncio
import time
from typing import Any, Dict, Optional

from ..add_songs import get_artist_image_url, get_spotify_client
from ..database import Database
from .room_manager import RoomManager


class GameService:
    """Coordinates gameplay actions for a room."""

    ROUND_DURATION = 30
    ANSWER_REVEAL_DELAY = 5

    def __init__(self, room_manager: RoomManager) -> None:
        self._rooms = room_manager

    # ------------------------------------------------------------------
    # Round lifecycle
    # ------------------------------------------------------------------
    async def start_round(self, room_code: str) -> None:
        room = self._rooms.get_room(room_code)
        if not room or not room.selected_mode:
            return

        playlist_id = Database.get_playlist_id(room.selected_mode)
        exclude_ids = list({int(x) for x in room.played_song_ids if x is not None})
        song = Database.get_random_song_exclude_ids(playlist_id, exclude_ids)
        if not song:
            await self._rooms.broadcast(room_code, {"type": "no_more_songs", "payload": {}})
            return

        room.current_song = song
        if song["id"] not in room.played_song_ids:
            room.played_song_ids.append(int(song["id"]))

        room.round_number += 1
        room.round_start_time = time.time()
        room.game_state = "playing"

        preview_url = await self._get_preview_url(song)
        payload = {
            "type": "round_started",
            "payload": {
                "songData": {
                    "url": preview_url if not room.host_only_audio else "",
                    "title": song["title"],
                    "artist": song["artist"],
                },
                "duration": self.ROUND_DURATION,
            },
        }

        if room.host_only_audio and room.host_id:
            host_payload = {
                "type": "round_started",
                "payload": {
                    "songData": {
                        "url": preview_url,
                        "title": song["title"],
                        "artist": song["artist"],
                    },
                    "duration": self.ROUND_DURATION,
                    "isHost": True,
                },
            }
            await self._rooms.send_to_player(room_code, room.host_id, host_payload)
            await self._rooms.broadcast(room_code, payload, exclude_players=[room.host_id])
        else:
            await self._rooms.broadcast(room_code, payload)

        asyncio.create_task(self._round_timer(room_code, self.ROUND_DURATION))

    async def reveal_answer(self, room_code: str) -> None:
        room = self._rooms.get_room(room_code)
        if not room or not room.current_song:
            return

        song = room.current_song
        artist_image_url: Optional[str] = None
        try:
            sp = get_spotify_client()
            artist_image_url = await asyncio.to_thread(
                get_artist_image_url, sp, song.get("artist", "")
            )
        except Exception as exc:  # pragma: no cover - best effort logging
            print(f"Artist image lookup failed: {exc}")

        await self._rooms.broadcast(
            room_code,
            {
                "type": "answer_reveal",
                "payload": {
                    "title": song.get("title", ""),
                    "artist": song.get("artist", ""),
                    "artistImageUrl": artist_image_url,
                },
            },
        )

    async def end_round(self, room_code: str) -> None:
        room = self._rooms.get_room(room_code)
        if not room:
            return

        room.game_state = "leaderboard"
        leaderboard = sorted(room.players, key=lambda p: p.score, reverse=True)
        await self._rooms.broadcast(
            room_code,
            {
                "type": "round_ended",
                "payload": {
                    "leaderboard": [
                        {"name": player.name, "score": player.score}
                        for player in leaderboard
                    ],
                    "currentRound": room.round_number,
                    "totalRounds": room.total_rounds,
                },
            },
        )

        if room.round_number >= room.total_rounds:
            room.game_state = "ended"
            await self._rooms.broadcast(
                room_code,
                {
                    "type": "game_ended",
                    "payload": {
                        "finalLeaderboard": [
                            {"name": player.name, "score": player.score}
                            for player in leaderboard
                        ]
                    },
                },
            )

    # ------------------------------------------------------------------
    # Message helpers
    # ------------------------------------------------------------------
    async def process_answer(self, room_code: str, player_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        room = self._rooms.get_room(room_code)
        if not room or not room.current_song:
            return {
                "type": "error",
                "payload": {"code": "NO_ACTIVE_ROUND"},
            }

        round_start = room.round_start_time or time.time()
        elapsed = time.time() - round_start
        song = room.current_song
        artist = payload.get("artist", "").strip()
        title = payload.get("title", "").strip()

        result = self._check_answer(artist, title, song["artist"], song["title"])

        score_awarded = self._calculate_score(result, elapsed)
        if score_awarded:
            self._update_player_score(room_code, player_id, score_awarded)

        return {
            "type": "answer_received",
            "payload": {
                "artist": artist,
                "title": title,
                "result": result,
                "scoreAwarded": score_awarded,
            },
        }

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    async def _round_timer(self, room_code: str, duration: int) -> None:
        await asyncio.sleep(duration)
        await self.reveal_answer(room_code)
        await asyncio.sleep(self.ANSWER_REVEAL_DELAY)
        await self.end_round(room_code)

    async def _get_preview_url(self, song: Dict[str, Any]) -> str:
        from aiohttp import ClientSession

        async with ClientSession() as session:
            async with session.get(
                f"https://api.deezer.com/track/{song['deezer_track_id']}"
            ) as resp:
                data = await resp.json()
                return data.get("preview", "")

    def _calculate_score(self, result: Dict[str, bool], elapsed: float) -> int:
        if result.get("both_correct"):
            base_score = 1000
            min_score = 100
        elif result.get("title_correct") or result.get("artist_correct"):
            base_score = 500
            min_score = 50
        else:
            return 0

        speed_penalty = elapsed * 10
        score = max(base_score - speed_penalty, min_score)
        return int(round(score, 0))

    def _check_answer(self, artist_guess: str, title_guess: str, artist: str, title: str) -> Dict[str, bool]:
        from difflib import SequenceMatcher
        import re

        def normalize(text: str) -> str:
            text = text.lower()
            text = re.sub(r"\([^)]*\)", "", text)
            text = re.sub(r"\[[^\]]*\]", "", text)
            text = re.sub(r"\s*-\s*remaster(ed)?.*", "", text, flags=re.IGNORECASE)
            text = re.sub(r"\s*-\s*\d{4}.*", "", text)
            text = re.sub(r"[^\w\s]", "", text)
            text = " ".join(text.split())
            return text.strip()

        def similarity(guess: str, actual: str) -> float:
            return SequenceMatcher(None, guess, actual).ratio()

        artist_score = similarity(normalize(artist_guess), normalize(artist))
        title_score = similarity(normalize(title_guess), normalize(title))

        artist_correct = artist_score >= 0.80
        title_correct = title_score >= 0.80

        return {
            "artist_correct": artist_correct,
            "title_correct": title_correct,
            "both_correct": artist_correct and title_correct,
        }

    def _update_player_score(self, room_code: str, player_id: str, points: int) -> None:
        player = self._rooms.get_player(room_code, player_id)
        if not player:
            return
        player.score += points


__all__ = ["GameService"]
