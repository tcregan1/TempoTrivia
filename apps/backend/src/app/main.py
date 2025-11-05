from fastapi import FastAPI

from .routers.game_ws import router as game_ws_router

app = FastAPI()

app.include_router(game_ws_router)
