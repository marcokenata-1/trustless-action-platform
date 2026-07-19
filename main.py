from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import users, movements
from database import get_db

ROUTERS = (
    users.router,
    movements.router
)

def create_app() -> FastAPI:
# Initialize FastAPI application
    app = FastAPI(title="Blockchain Backend (off-chain)")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Include all routers
    for router in ROUTERS:
        app.include_router(router)

    @app.get("/")
    def start_app():
        return {
            "status": "ok"
        }
    
    return app

app = create_app()
