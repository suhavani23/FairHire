# main.py - Fairhire FastAPI Backend Entrypoint
import json
import logging
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, HTMLResponse

from config import (
    DEMO_MODE,
    LLM_PROVIDER,
    GROQ_API_KEY,
    GEMINI_API_KEY,
    ANTHROPIC_API_KEY,
    CONTRACT_PATH,
    DEMO_ANALYSIS_PATH,
    PROJECT_ROOT
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("fairhire")

app = FastAPI(
    title="Fairhire API",
    description="AI-powered Job Trust & Safety Co-pilot Backend",
    version="1.0.0"
)

# Enable CORS for Chrome Extension and local testing
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health_check():
    """
    Health check endpoint queried by Chrome extension background worker.
    """
    return {
        "status": "ok",
        "app": "Fairhire",
        "version": "1.0.0",
        "demo_mode": DEMO_MODE,
        "llm_provider": LLM_PROVIDER,
        "keys_configured": {
            "groq": bool(GROQ_API_KEY),
            "gemini": bool(GEMINI_API_KEY),
            "anthropic": bool(ANTHROPIC_API_KEY)
        }
    }

@app.get("/contract")
def get_contract():
    """
    Returns the strict JSON contract schema shared by backend and extension.
    """
    if CONTRACT_PATH.exists():
        with open(CONTRACT_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return JSONResponse(status_code=404, content={"error": "Contract schema not found"})

from rules_engine import analyze_rules, analyze_rules_only  # analyze_rules_only kept as fallback

# Simple URL/payload cache to prevent duplicate processing
ANALYSIS_CACHE: dict = {}

@app.post("/analyze")
async def analyze_job(request: Request):
    """
    Main job trust analysis endpoint.
    Step 4: rules → LLM (Groq) + RDAP domain checks → merge → score → contract JSON.
    Fallback chain: pipeline → rules-only → demo JSON. Never crashes the client.
    """
    try:
        body = await request.json()
    except Exception as e:
        logger.error(f"Failed to parse /analyze JSON body: {e}")
        return JSONResponse(status_code=400, content={"error": "Invalid JSON body"})

    company_name = body.get("company", "Unknown")
    job_title = body.get("title", "Unknown")
    job_url = body.get("url", "")
    logger.info(f"Incoming /analyze request for: {company_name} - {job_title} ({job_url})")

    # Hard Rule 1: DEMO_MODE toggle returns canned JSON immediately
    if DEMO_MODE:
        logger.info("[DEMO_MODE=True] Returning canned demo analysis JSON")
        if DEMO_ANALYSIS_PATH.exists():
            with open(DEMO_ANALYSIS_PATH, "r", encoding="utf-8") as f:
                canned = json.load(f)
                if body.get("company"):
                    canned["company"]["name"] = body["company"]
                return canned

    # Check cache by URL
    if job_url and job_url in ANALYSIS_CACHE:
        logger.info(f"Returning cached analysis for URL: {job_url}")
        return ANALYSIS_CACHE[job_url]

    try:
        # Step 4: rules → LLM + domain checks → merge → score
        from pipeline import run_analysis
        analysis_result = run_analysis(body, analyze_rules(body))

        # Ensure review deep-links exist if company name is known
        company_obj = analysis_result.get("company", {})
        c_name = company_obj.get("name")
        if c_name and not company_obj.get("reviewLinks"):
            clean_q = c_name.replace(" ", "+")
            company_obj["reviewLinks"] = [
                {"label": "AmbitionBox Reviews", "url": f"https://www.google.com/search?q={clean_q}+reviews+ambitionbox"},
                {"label": "Glassdoor Reviews", "url": f"https://www.google.com/search?q={clean_q}+reviews+glassdoor"}
            ]

        if job_url:
            ANALYSIS_CACHE[job_url] = analysis_result

        return analysis_result
    except Exception as e:
        logger.error(f"Error during Step 4 analysis: {e}", exc_info=True)
        # Graceful fallback 1: rule-only result
        try:
            fallback = analyze_rules_only(body)
            logger.info("Returned rule-only fallback due to pipeline error")
            return fallback
        except Exception:
            pass
        # Graceful fallback 2: canned demo JSON
        if DEMO_ANALYSIS_PATH.exists():
            with open(DEMO_ANALYSIS_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.get("/test", response_class=HTMLResponse)
def serve_test_page():
    """
    Convenience route: serves extension/mock_test.html (Naukri style)
    """
    test_file = PROJECT_ROOT / "extension" / "mock_test.html"
    if test_file.exists():
        with open(test_file, "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    return HTMLResponse("<h1>Mock test file not found</h1>", status_code=404)

@app.get("/test-internshala", response_class=HTMLResponse)
def serve_test_internshala():
    """
    Convenience route: serves extension/mock_internshala.html
    """
    test_file = PROJECT_ROOT / "extension" / "mock_internshala.html"
    if test_file.exists():
        with open(test_file, "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    return HTMLResponse("<h1>Mock Internshala file not found</h1>", status_code=404)

@app.get("/test-scam", response_class=HTMLResponse)
def serve_test_scam():
    """
    Convenience route: serves extension/mock_scam.html
    """
    test_file = PROJECT_ROOT / "extension" / "mock_scam.html"
    if test_file.exists():
        with open(test_file, "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    return HTMLResponse("<h1>Mock Scam file not found</h1>", status_code=404)

if __name__ == "__main__":
    import uvicorn
    from config import HOST, PORT
    uvicorn.run("main:app", host=HOST, port=PORT, reload=True)
