from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .database import Database
from .routers.game_ws import router as game_ws_router

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/playlists")
async def list_playlists() -> dict:
    """Return the available playlists/game modes."""

    try:
        data = Database.get_all_playlists() or []
    except Exception as exc:  # pragma: no cover - defensive guard for Supabase failures
        raise HTTPException(status_code=500, detail="Failed to load playlists") from exc

    playlists = []
    for raw in data:
        if not isinstance(raw, dict):
            continue
        playlists.append(
            {
                "id": raw.get("id"),
                "name": raw.get("name", ""),
                "description": raw.get("description", ""),
                "is_default": raw.get("is_default", False),
            }
        )

    return {"playlists": playlists}


app.include_router(game_ws_router)
