"""
Simple REST server for dashboard data - no MCP/fastmcp dependency.
Runs on Python 3.8+ with just httpx, pydantic, and starlette.
"""
import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "src"))

from datetime import datetime, timezone
from decimal import Decimal
from starlette.applications import Starlette
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse
from starlette.routing import Route

from dashboard import build_transactions_payload
from scoring_engine.demo import PROFILE_NAMES, demo_raw
from scoring_engine.service import demo_decision, public_offer, public_profile, public_simulation
from scoring_engine import OfferError

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


async def scoring_profile(request):
    """
    GET /api/scoring/profile
    Returns credit score, eligibility and preapproved offer.
    Query params: term_months (optional)
    """
    term_str = request.query_params.get("term_months")
    term_months = int(term_str) if term_str and term_str.isdigit() else None

    try:
        decision = demo_decision(DEMO_PROFILE, term_months)
    except ValueError as e:
        return JSONResponse({"error": {"code": "invalid_profile", "message": str(e)}}, status_code=400)

    return JSONResponse({
        "profile": public_profile(decision),
        "offer": public_offer(decision),
    })


async def scoring_simulate(request):
    """
    GET /api/scoring/simulate
    Simulates a loan with specific amount and term.
    Query params: amount_usd (required), term_months (required)
    """
    amount_str = request.query_params.get("amount_usd")
    term_str = request.query_params.get("term_months")

    if not amount_str or not term_str:
        return JSONResponse({
            "error": {"code": "missing_params", "message": "amount_usd and term_months are required"}
        }, status_code=400)

    try:
        amount_usd = Decimal(amount_str)
        term_months = int(term_str)
    except (ValueError, TypeError):
        return JSONResponse({
            "error": {"code": "invalid_params", "message": "amount_usd must be a number, term_months must be an integer"}
        }, status_code=400)

    try:
        decision = demo_decision(DEMO_PROFILE, term_months)
        simulation = public_simulation(decision, amount_usd, term_months)
        return JSONResponse(simulation)
    except OfferError as e:
        return JSONResponse({"error": {"code": "offer_error", "message": str(e)}}, status_code=400)
    except ValueError as e:
        return JSONResponse({"error": {"code": "invalid_profile", "message": str(e)}}, status_code=400)


routes = [
    Route("/", health),
    Route("/api/dashboard/transactions", dashboard_transactions),
    Route("/api/scoring/profile", scoring_profile),
    Route("/api/scoring/simulate", scoring_simulate),
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
    print(f"     GET /api/scoring/profile")
    print(f"     GET /api/scoring/simulate?amount_usd=X&term_months=Y")
    uvicorn.run(app, host="0.0.0.0", port=port)
