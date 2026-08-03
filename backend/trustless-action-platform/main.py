from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import users, movements, conn
from database import base, engine

import models

ROUTERS = (
    users.router,
    movements.router,
    conn.router
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


base.metadata.create_all(bind=engine)

app = create_app()
