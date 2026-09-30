// background.js - MV3 Service Worker for Fairhire
// Handles backend proxying, 15s timeout, DEMO_MODE toggle, and health monitoring

const BACKEND_BASE_URL = "http://127.0.0.1:8000";
const REQUEST_TIMEOUT_MS = 15000; // 15 second strict timeout

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "HEALTH_CHECK") {
    handleHealthCheck(sendResponse);
    return true; // Keep channel open for async response
  }

  if (request.action === "ANALYZE_JOB") {
    handleAnalyzeJob(request.payload, sendResponse);
    return true;
  }

  if (request.action === "GET_DEMO_DATA") {
    handleGetDemoData(sendResponse);
    return true;
  }

  if (request.action === "GET_COMPANY") {
    handleGetCompany(request.companyName, sendResponse);
    return true;
  }

  if (request.action === "SUBMIT_REVIEW") {
    handleSubmitReview(request.payload, sendResponse);
    return true;
  }
});

/**
 * Loads canned JSON from data/demo_analysis.json
 */
async function loadDemoAnalysisJson() {
  try {
    const url = chrome.runtime.getURL("data/demo_analysis.json");
    const res = await fetch(url);
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn("[Fairhire SW] Failed to fetch data/demo_analysis.json:", err);
  }

  // Built-in hardcoded fallback matching contract
  return {
    trustScore: 78,
    verdict: "Looks OK",
    reasons: [
      "Offline demo data loaded",
      "Salary and role requirements transparently stated",
      "Minor gender-coded words detected in requirements"
    ],
    scam: { risk: "low", score: 10, signals: [], domainChecks: [] },
    inclusivity: {
      score: 75,
      flags: [
        {
          phrase: "rockstar developer",
          type: "gendered",
          severity: "medium",
          why: "Masculine-coded jargon that can discourage diverse candidates.",
          rewrite: "collaborative software engineer"
        }
      ]
    },
    transparency: {
      score: 85,
      salaryListed: true,
      redFlags: [],
      greenFlags: ["Explicit salary range provided", "Equal opportunity employer commitment stated"],
      missing: ["Parental leave policy"]
    },
    company: {
      name: "Tata Consultancy Services",
      tier: 1,
      type: "MNC",
      facts: {},
      news: [],
      reviewLinks: [
        { label: "AmbitionBox Reviews", url: "https://www.google.com/search?q=TCS+reviews+ambitionbox" },
        { label: "Glassdoor Reviews", url: "https://www.google.com/search?q=TCS+reviews+glassdoor" }
      ],
      community: []
    },
    history: { id: "demo-" + Date.now(), timestamp: new Date().toISOString() }
  };
}

/**
 * Direct fetch for demo data
 */
async function handleGetDemoData(sendResponse) {
  try {
    const demoData = await loadDemoAnalysisJson();
    sendResponse({ success: true, source: "demo_mode", data: demoData });
  } catch (err) {
    sendResponse({ error: "Failed to load demo data: " + err.message });
  }
}

/**
 * Checks backend health with timeout. Never throws.
 */
async function handleHealthCheck(sendResponse) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);

  try {
    const res = await fetch(`${BACKEND_BASE_URL}/health`, {
      method: "GET",
      signal: controller.signal
    });
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      sendResponse({ success: true, connected: true, data });
    } else {
      sendResponse({ success: false, connected: false, error: `Backend returned ${res.status}` });
    }
  } catch (err) {
    clearTimeout(timer);
    sendResponse({
      success: true,
      connected: false,
      error: err.name === "AbortError" ? "Timeout" : err.message
    });
  }
}

/**
 * Sends job analysis request to backend with 15s timeout.
 * If DEMO_MODE is on, loads and returns data/demo_analysis.json.
 * On timeout, network error, or non-200: returns { error: "friendly message" } and NEVER throws.
 */
async function handleAnalyzeJob(payload, sendResponse) {
  try {
    const storage = await chrome.storage.local.get(["DEMO_MODE"]);
    if (storage && storage.DEMO_MODE === true) {
      console.log("[Fairhire SW] DEMO_MODE is ON. Returning data/demo_analysis.json");
      const demoData = await loadDemoAnalysisJson();
      if (payload && payload.company && payload.company !== "Unknown Company") {
        demoData.company.name = payload.company;
      }
      sendResponse({ success: true, source: "demo_mode", data: demoData });
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(`${BACKEND_BASE_URL}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload || {}),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        sendResponse({
          error: `Backend returned error (${res.status}): ${res.statusText || "Analysis failed"}`
        });
        return;
      }

      const data = await res.json();
      sendResponse({ success: true, source: "backend", data });
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      if (fetchErr.name === "AbortError") {
        sendResponse({
          error: "Backend request timed out after 15 seconds. Please check your backend connection."
        });
      } else {
        sendResponse({
          error: `Cannot connect to Fairhire backend at ${BACKEND_BASE_URL}. Is the server running?`
        });
      }
    }
  } catch (err) {
    sendResponse({ error: "Unexpected error: " + err.message });
  }
}

/**
 * Company info placeholder for upcoming tiers
 */
async function handleGetCompany(companyName, sendResponse) {
  try {
    const res = await fetch(`${BACKEND_BASE_URL}/company/${encodeURIComponent(companyName)}`);
    if (res.ok) {
      const data = await res.json();
      sendResponse({ success: true, data });
    } else {
      sendResponse({ success: false, status: res.status });
    }
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}

/**
 * Community review submission placeholder
 */
async function handleSubmitReview(payload, sendResponse) {
  try {
    const res = await fetch(`${BACKEND_BASE_URL}/reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      const data = await res.json();
      sendResponse({ success: true, data });
    } else {
      sendResponse({ success: false, status: res.status });
    }
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}
