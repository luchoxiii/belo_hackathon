"""
Simple REST server for dashboard data - no MCP/fastmcp dependency.
Runs on Python 3.8+ with just httpx, pydantic, and starlette.
"""
import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "src"))

from datetime import datetime, timezone
from starlette.applications import Starlette
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse
from starlette.routing import Route

from dashboard import build_transactions_payload
from scoring_engine.demo import PROFILE_NAMES, demo_raw

# Demo profile from env
DEMO_PROFILE = os.getenv("BELO_DEMO_PROFILE", "family")

# CORS origins
DASHBOARD_ORIGINS = [
    o.strip() for o in os.getenv("DASHBOARD_ALLOWED_ORIGINS", "http://localhost:3000").split(",") if o.strip()
]


async def dashboard_transactions(request):
    """
    GET /api/dashboard/transactions
    Returns transactions in the mock-transactions.json format.
    """
    try:
        raw = demo_raw(DEMO_PROFILE)
    except ValueError as e:
        return JSONResponse({"error": {"code": "unknown_demo_profile", "message": str(e)}}, status_code=500)

    payload = build_transactions_payload(raw, f"demo-{DEMO_PROFILE}", PROFILE_NAMES.get(DEMO_PROFILE))
    return JSONResponse(payload)


async def health(request):
    """GET / - Health check"""
    return JSONResponse({
        "status": "ok",
        "profile": DEMO_PROFILE,
        "timestamp": datetime.now(timezone.utc).isoformat()
    })


routes = [
    Route("/", health),
    Route("/api/dashboard/transactions", dashboard_transactions),
]

middleware = [
    Middleware(
        CORSMiddleware,
        allow_origins=DASHBOARD_ORIGINS,
        allow_methods=["GET"],
        allow_headers=["*"],
    ),
]

app = Starlette(routes=routes, middleware=middleware)


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    print(f"🚀 Starting simple server on http://localhost:{port}")
    print(f"   Profile: {DEMO_PROFILE}")
    print(f"   Endpoints:")
    print(f"     GET /api/dashboard/transactions")
    uvicorn.run(app, host="0.0.0.0", port=port)
