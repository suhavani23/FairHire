# config.py - Centralized configuration for Fairhire backend
import os
from pathlib import Path
from dotenv import load_dotenv

# Locate base directories
BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent
DATA_DIR = PROJECT_ROOT / "data"

# Load .env file
load_dotenv(BACKEND_DIR / ".env")
load_dotenv(PROJECT_ROOT / ".env")

DEMO_MODE = os.getenv("DEMO_MODE", "false").lower() in ("true", "1", "yes")
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))

LLM_PROVIDER = os.getenv("LLM_PROVIDER", "groq").lower()
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
GOOGLE_SAFE_BROWSING_API_KEY = os.getenv("GOOGLE_SAFE_BROWSING_API_KEY", "")

MIN_REVIEWS = int(os.getenv("MIN_REVIEWS", "3"))

DB_PATH = BACKEND_DIR / "fairhire.db"
CONTRACT_PATH = DATA_DIR / "contract.json"
DEMO_ANALYSIS_PATH = DATA_DIR / "demo_analysis.json"
