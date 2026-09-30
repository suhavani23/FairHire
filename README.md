# Fairhire 🛡️
> **Job Trust & Safety Co-pilot**
> *"Job boards tell you what companies want. Fairhire tells you what they won't: is it a scam, is it safe, is it worth your time."*

Fairhire is a Manifest V3 Chrome Extension + FastAPI backend that analyzes job listings on portals like Naukri, Internshala, and LinkedIn for:
1. **Recruitment scams**: Fraudulent registration fees, training charges, WhatsApp/Telegram redirection, and free webmail hiring contacts.
2. **Inclusivity & culture**: Masculine-coded wording, age bias, availability pressure, and extreme overtime hints with suggested neutral rewrites.
3. **Pay & role transparency**: Upfront compensation disclosures, POSH (Prevention of Sexual Harassment) statements, parental leave, and hybrid perks.
4. **Verified company signals**: Grounded company disclosures, news mentions, and deep links to employee reviews (AmbitionBox, Glassdoor).

---

## 📁 Repository Structure

```text
FairHire/
├── backend/
│   ├── main.py                    # FastAPI server entrypoint (/health, /analyze, mock page routes)
│   ├── rules_engine.py            # Step 3 Rule engine (evaluates scam, bias, transparency, green flags)
│   ├── scoring.py                 # Trust score calculation, clamping, and verdict determination
│   ├── config.py                  # Configuration loader (.env, paths)
│   ├── requirements.txt           # Python dependencies
│   ├── test_rules.py              # Step 3 unit tests (9 tests, 100% offline)
│   └── test_step3_integration.py  # End-to-end integration test against running server
├── data/
│   ├── contract.json              # Strict JSON contract schema shared by backend & extension
│   ├── demo_analysis.json         # Standalone canned fallback analysis
│   ├── aliases.json               # Company name alias resolution mappings
│   └── rules/                     # Editable rule files (JSON with regex patterns)
│       ├── scam.json              # Fee demands, chat app redirects, urgency hints
│       ├── bias.json              # Gendered jargon, age restrictions, overtime pressure
│       ├── transparency.json      # Missing salary, vague responsibilities
│       └── green_flags.json       # Disclosed salary, POSH statements, parental leave
├── extension/
│   ├── manifest.json              # Chrome Manifest V3 declaration
│   ├── background.js              # Service worker (15s timeout, offline DEMO_MODE fallback)
│   ├── content.js                 # Floating trigger & Shadow DOM Neo-Brutalist Trust Report UI
│   ├── selectors.js               # Multi-portal DOM extraction selectors
│   ├── panel.css                  # Neo-Brutalist styling (Space Grotesk, 2px borders, 4px shadows)
│   ├── mock_test.html             # Naukri-style mock listing fixture
│   ├── mock_internshala.html      # Internshala-style mock listing fixture
│   ├── mock_scam.html             # High-risk recruitment scam listing fixture
│   └── data/                      # Bundled offline demo data for extension
└── docs/
    └── SCORING.md                 # Scoring formula and weighting documentation
```

---

## 🚀 Quickstart Guide

### 1. Backend Setup

```bash
cd backend

# Create and activate virtual environment
python -m venv .venv
# Windows PowerShell:
.venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
cp .env.example .env
# Edit .env with your GROQ_API_KEY, ANTHROPIC_API_KEY, or GEMINI_API_KEY if desired

# Start FastAPI server (runs on http://127.0.0.1:8000)
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

### 2. Chrome Extension Setup

1. Open Google Chrome and go to `chrome://extensions/`.
2. Toggle on **Developer mode** in the top-right corner.
3. Click **Load unpacked**.
4. Select the `extension/` folder inside this repository:
   `c:\Users\suhav\OneDrive\Desktop\FairHire\extension`
5. The **Fairhire: Job Trust & Safety Co-pilot** extension is now active.

---

## 🧪 Testing

### Backend Unit & Integration Tests

```bash
cd backend

# Run rule engine unit tests (9 tests, offline):
python -m unittest test_rules -v

# Run full integration test against running backend:
python test_step3_integration.py
```

### In-Browser Acceptance Tests

1. Ensure the backend is running at `http://127.0.0.1:8000`.
2. Open `http://127.0.0.1:8000/test-scam` in Chrome:
   - Click the floating **"Check This Job"** button.
   - Click **"Run Trust & Safety Check"**.
   - **Verdict**: `Likely scam` (Trust Score $\le 30$).
3. Open `http://127.0.0.1:8000/test` in Chrome:
   - Open the panel and run the check.
   - **Verdict**: `Looks OK`. Review flagged phrases (*rockstar*, *aggressive*, *work late*, *24x7*) and test the **"📋 Copy Rewrite"** button.
4. **Offline & Demo Mode**:
   - In the panel header, click **"DEMO: OFF"** to toggle to **"DEMO: ON"**.
   - Analysis runs completely offline with zero network latency.
