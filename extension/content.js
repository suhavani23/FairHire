// content.js - Injects floating button & Shadow DOM side panel on job listing pages
// Handles page extraction, /analyze communication with 15s timeout, loading skeletons,
// friendly error handling with retry & demo buttons, and neo-brutalist Trust Report UI.

(function () {
  // Prevent duplicate injection
  if (document.getElementById("fairhire-root")) return;

  console.log("[Fairhire] Initializing Job Trust & Safety Co-pilot...");

  // Host container
  const hostEl = document.createElement("div");
  hostEl.id = "fairhire-root";
  document.body.appendChild(hostEl);

  // Attach isolated Shadow DOM
  const shadow = hostEl.attachShadow({ mode: "open" });

  // Detect site context
  const hostname = window.location.hostname;
  let siteName = "Generic Site";
  if (/naukri\.com/i.test(hostname)) siteName = "Naukri";
  else if (/internshala\.com/i.test(hostname)) siteName = "Internshala";
  else if (/linkedin\.com/i.test(hostname)) siteName = "LinkedIn";
  else if (/localhost|127\.0\.0\.1|file/i.test(hostname) || window.location.protocol === "file:") siteName = "Mock Test Page";

  // Build UI inside Shadow DOM
  shadow.innerHTML = `
    <link rel="stylesheet" href="${chrome.runtime.getURL("panel.css")}">
    
    <!-- Floating "Check this job" Trigger -->
    <button id="fairhire-floating-btn" title="Open Fairhire Trust & Safety Panel">
      <span class="fh-btn-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          <path d="m9 12 2 2 4-4"/>
        </svg>
      </span>
      <span>Check This Job</span>
      <span class="fh-btn-badge">${siteName}</span>
    </button>

    <!-- Side Panel (~380px) -->
    <aside id="fairhire-side-panel" aria-label="Fairhire Trust Report Side Panel">
      
      <!-- Header -->
      <div class="fh-panel-header">
        <div class="fh-brand-group" id="fh-brand-logo" title="Shift+Click for Debug Menu">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          <span class="fh-panel-title">Fairhire</span>
        </div>
        <button class="fh-icon-btn" id="fh-close-btn" title="Close Panel">✕</button>
      </div>

      <!-- Debug Area (Hidden by default) -->
      <div class="fh-debug-area" id="fh-debug-area">
        <button class="fh-demo-toggle-btn" id="fh-demo-toggle">DEMO: OFF</button>
        <button class="fh-demo-toggle-btn" id="fh-theme-toggle">Dark Mode</button>
        <div class="fh-status-pill">
          <span class="fh-status-dot" id="fh-status-dot"></span>
          <span id="fh-status-text">Checking backend...</span>
          <span class="fh-mode-badge" id="fh-mode-badge">${siteName.toUpperCase()}</span>
        </div>
      </div>

      <!-- Tabs -->
      <div class="fh-tabs">
        <div class="fh-tab active" data-target="tab-overview">Overview</div>
        <div class="fh-tab" data-target="tab-company">Company</div>
        <div class="fh-tab" data-target="tab-people">People</div>
      </div>

      <!-- Scrollable Body -->
      <div class="fh-panel-body" id="fh-panel-body">
        
        <!-- Tab: Overview -->
        <div class="fh-tab-content active" id="tab-overview">
          <!-- 1. Idle Scanner State -->
          <div class="fh-card fh-card-empty" id="fh-idle-card">
            <h2 class="fh-empty-title">Check This Listing</h2>
            <p class="fh-empty-desc">
              Analyze this job for hidden recruitment scam fees, inclusive language bias, salary transparency, and employer signals.
            </p>
            <button class="fh-action-btn" id="fh-btn-run-extract">
              <span>Scan Listing Details</span>
            </button>
            <div style="margin-top: 12px; font-size: 11px; color: var(--fh-secondary);">
              Detected Portal: <b>${siteName}</b><br>
              <span id="fh-detect-url">${escapeHtml(window.location.href.substring(0, 48))}...</span>
            </div>
          </div>

          <!-- 2. Extraction Results View (Listing Summary) -->
          <div id="fh-extract-view" style="display: none;"></div>

          <!-- 3. Loading Skeleton View -->
          <div id="fh-loading-view" style="display: none;">
            <div class="fh-skeleton-box">
              <div style="font-size:12px; font-weight:600;">⚡ Running Trust & Safety Rules...</div>
              <div class="fh-skeleton-line" style="width: 80%;"></div>
              <div class="fh-skeleton-line" style="width: 100%;"></div>
              <div class="fh-skeleton-line" style="width: 60%;"></div>
              <div class="fh-skeleton-line" style="width: 90%;"></div>
            </div>
          </div>

          <!-- 4. Friendly Error View -->
          <div id="fh-error-view" style="display: none;"></div>

          <!-- 5. Full Trust Report View -->
          <div id="fh-report-view" style="display: none;"></div>
        </div>

        <!-- Tab: Company -->
        <div class="fh-tab-content" id="tab-company">
          <div class="fh-card fh-card-empty">
            <p class="fh-empty-desc">Company details will appear here.</p>
          </div>
        </div>

        <!-- Tab: People -->
        <div class="fh-tab-content" id="tab-people">
          <div class="fh-card fh-card-empty">
            <p class="fh-empty-desc">People details will appear here.</p>
          </div>
        </div>

      </div>

      <!-- Sticky Footer -->
      <div class="fh-panel-footer">
        <button class="fh-pill-btn outlined" id="fh-footer-company-btn">View company details</button>
        <button class="fh-pill-btn outlined" id="fh-footer-reviews-btn">Open reviews</button>
      </div>
    </aside>
  `;

  // Elements
  const floatingBtn = shadow.getElementById("fairhire-floating-btn");
  const panel = shadow.getElementById("fairhire-side-panel");
  const closeBtn = shadow.getElementById("fh-close-btn");
  const themeToggle = shadow.getElementById("fh-theme-toggle");
  const demoToggle = shadow.getElementById("fh-demo-toggle");
  const statusDot = shadow.getElementById("fh-status-dot");
  const statusText = shadow.getElementById("fh-status-text");
  const extractBtn = shadow.getElementById("fh-btn-run-extract");
  const idleCard = shadow.getElementById("fh-idle-card");
  const extractView = shadow.getElementById("fh-extract-view");
  const loadingView = shadow.getElementById("fh-loading-view");
  const errorView = shadow.getElementById("fh-error-view");
  const reportView = shadow.getElementById("fh-report-view");

  const brandLogo = shadow.getElementById("fh-brand-logo");
  const debugArea = shadow.getElementById("fh-debug-area");
  const tabs = shadow.querySelectorAll(".fh-tab");
  const tabContents = shadow.querySelectorAll(".fh-tab-content");
  const footerCompanyBtn = shadow.getElementById("fh-footer-company-btn");
  const footerReviewsBtn = shadow.getElementById("fh-footer-reviews-btn");

  brandLogo.addEventListener("click", (e) => {
    if (e.shiftKey) {
      debugArea.classList.toggle("show");
    }
  });

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      tabContents.forEach(c => c.classList.remove("active"));
      tab.classList.add("active");
      shadow.getElementById(tab.dataset.target).classList.add("active");
    });
  });

  footerCompanyBtn.addEventListener("click", () => {
    const companyTab = shadow.querySelector('.fh-tab[data-target="tab-company"]');
    if(companyTab) companyTab.click();
  });

  footerReviewsBtn.addEventListener("click", () => {
    const compName = currentExtractedData ? currentExtractedData.company : "Company";
    const encodedComp = encodeURIComponent(compName);
    window.open(`https://www.google.com/search?q=${encodedComp}+reviews+ambitionbox`, '_blank');
    window.open(`https://www.google.com/search?q=${encodedComp}+reviews+glassdoor`, '_blank');
  });

  let currentExtractedData = null;
  let currentAnalysisData = null;
  let isDemoModeActive = false;

  // Sync DEMO_MODE from storage
  chrome.storage.local.get(["DEMO_MODE"], (res) => {
    if (res && res.DEMO_MODE === true) {
      setDemoModeUI(true);
    } else {
      setDemoModeUI(false);
    }
  });

  function setDemoModeUI(active) {
    isDemoModeActive = active;
    if (active) {
      demoToggle.textContent = "DEMO: ON";
      demoToggle.classList.add("active");
      demoToggle.title = "Demo Mode is ON: Canned offline data returned";
    } else {
      demoToggle.textContent = "DEMO: OFF";
      demoToggle.classList.remove("active");
      demoToggle.title = "Click to turn ON Demo Mode (Offline canned responses)";
    }
  }

  // Toggle DEMO_MODE
  demoToggle.addEventListener("click", () => {
    const nextState = !isDemoModeActive;
    setDemoModeUI(nextState);
    chrome.storage.local.set({ DEMO_MODE: nextState });
  });

  // Toggle Panel Open/Close
  function togglePanel(open) {
    const isOpen = open !== undefined ? open : !panel.classList.contains("open");
    if (isOpen) {
      panel.classList.add("open");
      floatingBtn.style.display = "none";
      // Auto-extract when opening panel if not already extracted
      if (!currentExtractedData) {
        performExtraction();
      }
    } else {
      panel.classList.remove("open");
      floatingBtn.style.display = "flex";
    }
  }

  floatingBtn.addEventListener("click", () => togglePanel(true));
  closeBtn.addEventListener("click", () => togglePanel(false));

  // Dark Mode Toggle
  themeToggle.addEventListener("click", () => {
    shadow.host.classList.toggle("dark");
    const isDark = shadow.host.classList.contains("dark");
    chrome.storage.local.set({ fairhire_dark_mode: isDark });
  });

  // Restore Dark Mode Preference
  chrome.storage.local.get(["fairhire_dark_mode"], (res) => {
    if (res && res.fairhire_dark_mode) {
      shadow.host.classList.add("dark");
    }
  });

  // Check Backend Health via background.js
  function checkHealth() {
    chrome.runtime.sendMessage({ action: "HEALTH_CHECK" }, (response) => {
      if (!response) {
        statusDot.className = "fh-status-dot offline";
        statusText.textContent = "Offline (Demo Available)";
        return;
      }

      if (response.connected) {
        statusDot.className = "fh-status-dot";
        statusText.textContent = "Backend Live (:8000)";
      } else {
        statusDot.className = "fh-status-dot offline";
        statusText.textContent = "Backend Offline";
      }
    });
  }
  checkHealth();

  if (extractBtn) {
    extractBtn.addEventListener("click", performExtraction);
  }

  /**
   * Runs the extraction engine and renders the extracted card
   */
  function performExtraction() {
    try {
      if (!window.FAIRHIRE_EXTRACTOR) {
        console.error("[Fairhire] Extractor engine not available");
        return;
      }

      const data = window.FAIRHIRE_EXTRACTOR.extractJobListing();
      currentExtractedData = data;
      renderExtractionCard(data);
    } catch (err) {
      console.error("[Fairhire] Extraction error:", err);
      idleCard.style.display = "block";
      extractView.style.display = "none";
      loadingView.style.display = "none";
      errorView.style.display = "none";
      reportView.style.display = "none";
    }
  }

  /**
   * Switch active views
   */
  function showView(viewName) {
    idleCard.style.display = viewName === "idle" ? "block" : "none";
    extractView.style.display = viewName === "extract" ? "block" : "none";
    loadingView.style.display = viewName === "loading" ? "block" : "none";
    errorView.style.display = viewName === "error" ? "block" : "none";
    reportView.style.display = viewName === "report" ? "block" : "none";
  }

  /**
   * Renders the job summary card with "Check trust" CTA
   */
  function renderExtractionCard(data) {
    showView("extract");

    const companyInitials = (data.company || "UN")
      .split(" ")
      .map(w => w[0])
      .join("")
      .substring(0, 3)
      .toUpperCase();

    const isSalaryDisclosed = data.meta && data.meta.hasSalary;
    const salaryText = isSalaryDisclosed ? escapeHtml(data.salary) : "Salary not disclosed";
    const salaryClass = isSalaryDisclosed ? "" : "salary-missing";
    const experienceText = data.experience ? escapeHtml(data.experience) : "Not specified";

    // Build contact and description HTML for the debug section
    const emailsCount = data.contacts.emails.length;
    const urlsCount = data.contacts.urls.length;
    const phonesCount = data.contacts.phones.length;

    let emailsHtml = "";
    if (emailsCount > 0) {
      emailsHtml = data.contacts.emails.map(email => {
        const domain = email.split("@")[1] || "";
        const isFree = /gmail|yahoo|outlook|hotmail|rediff|proton/i.test(domain);
        return `
          <div class="fh-contact-item">
            <span>✉️ ${escapeHtml(email)}</span>
            <span class="fh-contact-tag" style="background:${isFree ? '#FEE2E2; color:#DC2626' : 'var(--fh-tint-1); color:var(--fh-primary)'}">
              ${isFree ? 'Free Webmail' : 'Corporate'}
            </span>
          </div>
        `;
      }).join("");
    } else {
      emailsHtml = `<div class="fh-contact-item" style="color:#777; font-style:italic;">No direct email address found</div>`;
    }

    let urlsHtml = "";
    if (urlsCount > 0) {
      urlsHtml = data.contacts.urls.slice(0, 3).map(url => {
        const cleanUrl = url.length > 34 ? url.substring(0, 34) + "..." : url;
        return `<div class="fh-contact-item"><span>🔗 ${escapeHtml(cleanUrl)}</span><span class="fh-contact-tag">Link</span></div>`;
      }).join("");
    }

    let phonesHtml = "";
    if (phonesCount > 0) {
      phonesHtml = data.contacts.phones.map(phone =>
        `<div class="fh-contact-item"><span>📞 ${escapeHtml(phone)}</span><span class="fh-contact-tag">Phone</span></div>`
      ).join("");
    }

    extractView.innerHTML = `
      <!-- Job Summary Card -->
      <div class="fh-summary-card">
        <div class="fh-summary-title">${escapeHtml(data.title)}</div>

        <div class="fh-summary-company-row">
          <div class="fh-summary-initials">${companyInitials}</div>
          <div class="fh-summary-company-info">
            <div class="fh-summary-company-name">${escapeHtml(data.company)}</div>
            <div class="fh-summary-rating">
              <svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
              <span>Rating unavailable</span>
            </div>
          </div>
        </div>

        <div class="fh-summary-chips">
          <span class="fh-summary-chip"><span class="chip-icon">📍</span> ${escapeHtml(data.location)}</span>
          <span class="fh-summary-chip"><span class="chip-icon">💼</span> ${experienceText}</span>
          <span class="fh-summary-chip ${salaryClass}"><span class="chip-icon">💰</span> ${salaryText}</span>
        </div>

        <button class="fh-cta-pill" id="fh-btn-trigger-analyze">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            <path d="m9 12 2 2 4-4"/>
          </svg>
          <span>Check trust</span>
        </button>
      </div>

      <!-- What We Check -->
      <div class="fh-check-list">
        <div class="fh-check-row">
          <div class="fh-check-icon icon-scam">🛡️</div>
          <div class="fh-check-text">
            <div class="fh-check-title">Scam signals</div>
            <div class="fh-check-desc">Fee demands, fake contacts, urgency traps, and suspicious domains</div>
          </div>
        </div>
        <div class="fh-check-row">
          <div class="fh-check-icon icon-inclusive">⚖️</div>
          <div class="fh-check-text">
            <div class="fh-check-title">Inclusive wording</div>
            <div class="fh-check-desc">Gendered language, age bias, and unreasonable availability expectations</div>
          </div>
        </div>
        <div class="fh-check-row">
          <div class="fh-check-icon icon-pay">💰</div>
          <div class="fh-check-text">
            <div class="fh-check-title">Pay and role clarity</div>
            <div class="fh-check-desc">Salary transparency, vague duties, inflated requirements, and missing benefits</div>
          </div>
        </div>
      </div>

      <!-- Debug Section (collapsed) -->
      <details class="fh-debug-details">
        <summary>Debug · extraction data</summary>
        <div class="fh-debug-body">
          <div class="fh-section-title">
            <span>Contact Signals</span>
            <span style="font-size:10px; color:#666;"> · ${emailsCount + urlsCount + phonesCount} found</span>
          </div>
          <div class="fh-contact-list">
            ${emailsHtml}
            ${urlsHtml}
            ${phonesHtml}
          </div>

          <div class="fh-section-title" style="margin-top:12px;">
            <span>Extracted Description</span>
            <span style="font-size:10px; color:#666;"> · ${data.meta.charCount} chars</span>
          </div>
          <div class="fh-desc-preview">${escapeHtml(data.description.substring(0, 360))}${data.description.length > 360 ? '...' : ''}</div>

          <div style="display:flex; gap:8px; margin-top:10px;">
            <button class="fh-btn-secondary" id="fh-btn-rescan" style="flex:1;">
              🔄 Re-scan Page
            </button>
            <button class="fh-btn-secondary" id="fh-btn-copy-json" style="flex:1;">
              📋 Copy Extracted JSON
            </button>
          </div>
        </div>
      </details>
    `;

    // Wire up buttons
    const analyzeBtn = shadow.getElementById("fh-btn-trigger-analyze");
    const rescanBtn = shadow.getElementById("fh-btn-rescan");
    const copyJsonBtn = shadow.getElementById("fh-btn-copy-json");

    if (rescanBtn) rescanBtn.addEventListener("click", performExtraction);

    if (copyJsonBtn) {
      copyJsonBtn.addEventListener("click", () => {
        navigator.clipboard.writeText(JSON.stringify(currentExtractedData, null, 2));
        copyJsonBtn.textContent = "✓ Copied!";
        setTimeout(() => { copyJsonBtn.textContent = "📋 Copy Extracted JSON"; }, 2000);
      });
    }

    if (analyzeBtn) {
      analyzeBtn.addEventListener("click", () => {
        executeAnalysis(currentExtractedData);
      });
    }
  }

  /**
   * Executes the /analyze check with loading skeleton & error handling
   */
  function executeAnalysis(jobData) {
    if (!jobData) return;

    showView("loading");

    const payload = {
      title: jobData.title,
      company: jobData.company,
      location: jobData.location,
      salary: jobData.salary,
      description: jobData.description,
      url: jobData.url,
      contacts: jobData.contacts
    };

    chrome.runtime.sendMessage({
      action: "ANALYZE_JOB",
      payload: payload
    }, (res) => {
      if (chrome.runtime.lastError) {
        renderErrorState(chrome.runtime.lastError.message, payload);
        return;
      }

      if (!res) {
        renderErrorState("No response received from background service worker.", payload);
        return;
      }

      if (res.error) {
        renderErrorState(res.error, payload);
        return;
      }

      if (res.success && res.data) {
        currentAnalysisData = res.data;
        renderTrustReport(res.data, payload, res.source || "backend");
      } else {
        renderErrorState("Unexpected response format from backend.", payload);
      }
    });
  }

  /**
   * Load demo data directly and render
   */
  function loadDemoDataAndRender(payload) {
    showView("loading");
    chrome.runtime.sendMessage({ action: "GET_DEMO_DATA" }, (res) => {
      if (res && res.success && res.data) {
        const demoData = res.data;
        if (payload && payload.company && payload.company !== "Unknown Company") {
          demoData.company.name = payload.company;
        }
        currentAnalysisData = demoData;
        renderTrustReport(demoData, payload, "demo_mode");
      } else {
        renderErrorState("Could not load canned demo data.", payload);
      }
    });
  }

  /**
   * Renders the friendly error state with Retry and Demo buttons
   */
  function renderErrorState(errorMessage, payload) {
    showView("error");

    errorView.innerHTML = `
      <div class="fh-error-card">
        <div class="fh-error-sticker">CONNECTION NOTICE</div>
        <h3 class="fh-error-title">Backend Unavailable</h3>
        <p class="fh-error-msg">${escapeHtml(errorMessage)}</p>

        <div class="fh-error-actions">
          <button class="fh-action-btn" id="fh-btn-retry" style="background:var(--fh-yellow);">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M21 2v6h-6"></path>
              <path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path>
              <path d="M3 22v-6h6"></path>
              <path d="M21 12a9 9 0 0 1-15 6.7L3 16"></path>
            </svg>
            <span>Retry Analysis</span>
          </button>

          <button class="fh-btn-secondary" id="fh-btn-use-demo" style="width:100%; padding:10px; background:var(--fh-white);">
            🧪 View Sample Trust Report (Demo Mode)
          </button>

          <button class="fh-btn-secondary" id="fh-btn-back-extract" style="width:100%; padding:8px;">
            ← Back to Listing Details
          </button>
        </div>
      </div>
    `;

    const retryBtn = shadow.getElementById("fh-btn-retry");
    const demoBtn = shadow.getElementById("fh-btn-use-demo");
    const backBtn = shadow.getElementById("fh-btn-back-extract");

    if (retryBtn) retryBtn.addEventListener("click", () => executeAnalysis(payload));
    if (demoBtn) demoBtn.addEventListener("click", () => loadDemoDataAndRender(payload));
    if (backBtn) backBtn.addEventListener("click", () => showView("extract"));
  }

  /**
   * Renders the full Step 3 Trust Report UI
   */
  function renderTrustReport(data, payload, source) {
    showView("report");
    footerCompanyBtn.classList.remove("outlined");

    const verdict = data.verdict || "Apply with caution";
    let verdictClass = "verdict-caution";
    let verdictTag = "APPLY WITH CAUTION";

    if (verdict === "Looks OK") {
      verdictClass = "verdict-ok";
      verdictTag = "LOOKS OK";
    } else if (verdict === "Likely scam") {
      verdictClass = "verdict-scam";
      verdictTag = "LIKELY SCAM";
    }

    const scam = data.scam || { risk: "low", score: 0, signals: [] };
    const inclusivity = data.inclusivity || { score: 100, flags: [] };
    const transparency = data.transparency || { score: 50, salaryListed: false, redFlags: [], greenFlags: [], missing: [] };
    const reasons = data.reasons || ["Analysis completed."];
    const company = data.company || { name: (payload && payload.company) || "Company", reviewLinks: [] };

    // Format meters fill and colors
    // Scam risk: higher is worse
    let scamFillClass = "fill-green";
    if (scam.score >= 60 || scam.risk === "high") scamFillClass = "fill-red";
    else if (scam.score >= 30 || scam.risk === "medium") scamFillClass = "fill-yellow";

    // Inclusivity: higher is better
    let inclFillClass = "fill-green";
    if (inclusivity.score < 40) inclFillClass = "fill-red";
    else if (inclusivity.score < 70) inclFillClass = "fill-yellow";

    // Transparency: higher is better
    let transFillClass = "fill-green";
    if (transparency.score < 40) transFillClass = "fill-red";
    else if (transparency.score < 70) transFillClass = "fill-yellow";

    // Flags aggregation: scam signals + bias flags
    const flagCardsHtml = [];

    // Scam signals
    if (scam.signals && scam.signals.length > 0) {
      scam.signals.forEach((sig, idx) => {
        flagCardsHtml.push(`
          <div class="fh-flag-card open" data-flag-idx="scam-${idx}">
            <div class="fh-flag-header">
              <span class="fh-flag-badge tag-scam">SCAM SIGNAL</span>
              <div class="fh-flag-phrase">"${escapeHtml(sig.phrase)}"</div>
              <span class="fh-flag-chevron">▼</span>
            </div>
            <div class="fh-flag-body">
              <div class="fh-flag-why">${escapeHtml(sig.why)}</div>
            </div>
          </div>
        `);
      });
    }

    // Inclusivity flags
    if (inclusivity.flags && inclusivity.flags.length > 0) {
      inclusivity.flags.forEach((f, idx) => {
        const typeLower = (f.type || "other").toLowerCase();
        let tagClass = "tag-other";
        if (typeLower.includes("gender")) tagClass = "tag-gender";
        else if (typeLower.includes("age")) tagClass = "tag-age";
        else if (typeLower.includes("hour") || typeLower.includes("avail")) tagClass = "tag-hours";

        const hasRewrite = Boolean(f.rewrite);

        flagCardsHtml.push(`
          <div class="fh-flag-card open" data-flag-idx="bias-${idx}">
            <div class="fh-flag-header">
              <span class="fh-flag-badge ${tagClass}">${escapeHtml((f.type || 'BIAS').toUpperCase())}</span>
              <div class="fh-flag-phrase">"${escapeHtml(f.phrase)}"</div>
              <span class="fh-flag-chevron">▼</span>
            </div>
            <div class="fh-flag-body">
              <div class="fh-flag-why">${escapeHtml(f.why)}</div>
              ${hasRewrite ? `
                <div class="fh-rewrite-box">
                  <span class="fh-rewrite-label">Suggested Neutral Rewrite</span>
                  <div class="fh-rewrite-content">${escapeHtml(f.rewrite)}</div>
                  <button class="fh-rewrite-copy-btn" data-copy-text="${escapeHtml(f.rewrite)}">
                    📋 Copy Rewrite
                  </button>
                </div>
              ` : ''}
            </div>
          </div>
        `);
      });
    }

    // Fallback if zero flags
    const flagsSectionContent = flagCardsHtml.length > 0
      ? flagCardsHtml.join("")
      : `
        <div class="fh-card" style="background:#EDF7F1; border:var(--fh-border-sm); text-align:center; padding:12px;">
          <strong style="color:#166534; font-size:12px;">✓ Clean Listing Language</strong>
          <p style="font-size:11px; color:#14532d; margin-top:4px;">
            No overt scam patterns or exclusionary language detected in this job description.
          </p>
        </div>
      `;

    // Transparency lists
    const greenPills = (transparency.greenFlags || []).map(g => `
      <div class="fh-pill-item green-pill">
        <span style="font-weight:800; color:#166534;">✓</span>
        <span>${escapeHtml(g)}</span>
      </div>
    `).join("");

    const redPills = (transparency.redFlags || []).map(r => `
      <div class="fh-pill-item red-pill">
        <span style="font-weight:800; color:#991b1b;">⚠️</span>
        <span>${escapeHtml(r)}</span>
      </div>
    `).join("");

    const missingPills = (transparency.missing || []).map(m => `
      <div class="fh-pill-item missing-pill">
        <span style="font-weight:800; color:#854d0e;">✕</span>
        <span>Missing: ${escapeHtml(m)}</span>
      </div>
    `).join("");

    // Review deep-links
    const cleanCompanyName = company.name || (payload && payload.company) || "Company";
    const encodedComp = encodeURIComponent(cleanCompanyName);
    const ambitionUrl = `https://www.google.com/search?q=${encodedComp}+reviews+ambitionbox`;
    const glassdoorUrl = `https://www.google.com/search?q=${encodedComp}+reviews+glassdoor`;

    reportView.innerHTML = `
      <!-- TOP TRUST SCORE CARD -->
      <div class="fh-trust-card ${verdictClass}">
        <span class="fh-verdict-banner">${verdictTag}</span>
        <div class="fh-score-display">
          <span class="fh-score-number" id="fh-countup-score">0</span>
          <span class="fh-score-max">/100</span>
        </div>
        <div style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; opacity:0.85;">
          Composite Trust Score${source === "demo_mode" ? " (Demo Mode)" : (data.analysisSource !== "ai" ? " (Basic check, AI unavailable)" : "")}
        </div>

        <div class="fh-reasons-box">
          <div class="fh-reasons-title">Key Signals & Assessment</div>
          <ul class="fh-reasons-list">
            ${reasons.map(r => `<li>${escapeHtml(r)}</li>`).join("")}
          </ul>
        </div>
      </div>

      <!-- THREE METERS -->
      <div class="fh-meters-card">
        <div style="font-family:var(--fh-font-heading); font-size:12px; font-weight:800; text-transform:uppercase; margin-bottom:12px;">
          Dimension Breakdown
        </div>

        <!-- Meter 1: Scam Risk -->
        <div class="fh-meter-item">
          <div class="fh-meter-header">
            <span>Scam Risk</span>
            <span class="fh-meter-val" style="font-weight:800;">${scam.risk.toUpperCase()} (${scam.score}/100)</span>
          </div>
          <div class="fh-meter-track">
            <div class="fh-meter-fill ${scamFillClass}" id="fh-meter-scam" style="width:0%;"></div>
          </div>
        </div>

        <!-- Meter 2: Inclusivity -->
        <div class="fh-meter-item">
          <div class="fh-meter-header">
            <span>Inclusivity & Bias</span>
            <span class="fh-meter-val" style="font-weight:800;">${inclusivity.score}/100</span>
          </div>
          <div class="fh-meter-track">
            <div class="fh-meter-fill ${inclFillClass}" id="fh-meter-incl" style="width:0%;"></div>
          </div>
        </div>

        <!-- Meter 3: Transparency -->
        <div class="fh-meter-item">
          <div class="fh-meter-header">
            <span>Pay & Role Transparency</span>
            <span class="fh-meter-val" style="font-weight:800;">${transparency.score}/100</span>
          </div>
          <div class="fh-meter-track">
            <div class="fh-meter-fill ${transFillClass}" id="fh-meter-trans" style="width:0%;"></div>
          </div>
        </div>
      </div>

      <!-- STACKED FLAG CARDS -->
      <div class="fh-flags-section">
        <div style="font-family:var(--fh-font-heading); font-size:12px; font-weight:800; text-transform:uppercase; display:flex; justify-content:space-between; align-items:center;">
          <span>Flagged Phrases & Risks</span>
          <span style="font-size:11px; color:#555;">${(scam.signals || []).length + (inclusivity.flags || []).length} items</span>
        </div>
        ${flagsSectionContent}
      </div>

      <!-- TRANSPARENCY DETAILS -->
      <div class="fh-transparency-card">
        <div style="font-family:var(--fh-font-heading); font-size:12px; font-weight:800; text-transform:uppercase; margin-bottom:10px;">
          Transparency & Benefits
        </div>

        ${greenPills ? `
          <div class="fh-list-group">
            <div class="fh-list-header" style="color:#166534;">✓ Disclosed Signals</div>
            <div class="fh-pill-list">${greenPills}</div>
          </div>
        ` : ''}

        ${redPills ? `
          <div class="fh-list-group">
            <div class="fh-list-header" style="color:#991b1b;">⚠️ Red Flags</div>
            <div class="fh-pill-list">${redPills}</div>
          </div>
        ` : ''}

        ${missingPills ? `
          <div class="fh-list-group">
            <div class="fh-list-header" style="color:#854d0e;">✕ Missing Disclosures</div>
            <div class="fh-pill-list">${missingPills}</div>
          </div>
        ` : ''}
      </div>

      <!-- REVIEWS DEEP-LINKS (RULE 3: DEEP-LINK ONLY) -->
      <div class="fh-reviews-card">
        <div style="font-family:var(--fh-font-heading); font-size:12px; font-weight:800; text-transform:uppercase;">
          Verified External Reviews
        </div>
        <div style="font-size:11px; color:#555; margin:4px 0 8px 0;">
          Read unmoderated employee reviews directly on external platforms for ${escapeHtml(cleanCompanyName)}:
        </div>
        <div class="fh-review-links-row">
          <a class="fh-review-link-btn" href="${ambitionUrl}" target="_blank" rel="noopener noreferrer">
            AmbitionBox ↗
          </a>
          <a class="fh-review-link-btn" href="${glassdoorUrl}" target="_blank" rel="noopener noreferrer">
            Glassdoor ↗
          </a>
        </div>
      </div>

      <!-- ACTIONS BAR -->
      <div style="display:flex; flex-direction:column; gap:8px;">
        <button class="fh-action-btn" id="fh-btn-recheck" style="background:var(--fh-yellow);">
          🔄 Re-analyze Listing
        </button>
        <div style="display:flex; gap:8px;">
          <button class="fh-btn-secondary" id="fh-btn-view-details" style="flex:1;">
            ← Listing Details
          </button>
          <button class="fh-btn-secondary" id="fh-btn-copy-report-json" style="flex:1;">
            📋 Copy JSON
          </button>
        </div>
      </div>
    `;

    // 1. Animate Count-up score
    animateCountUp(shadow.getElementById("fh-countup-score"), data.trustScore || 0, 600);

    // 2. Animate meters filling on load
    setTimeout(() => {
      const scamMeter = shadow.getElementById("fh-meter-scam");
      const inclMeter = shadow.getElementById("fh-meter-incl");
      const transMeter = shadow.getElementById("fh-meter-trans");
      if (scamMeter) scamMeter.style.width = Math.min(100, Math.max(0, scam.score)) + "%";
      if (inclMeter) inclMeter.style.width = Math.min(100, Math.max(0, inclusivity.score)) + "%";
      if (transMeter) transMeter.style.width = Math.min(100, Math.max(0, transparency.score)) + "%";
    }, 50);

    // 3. Wire up flag accordion click toggles
    const flagCards = shadow.querySelectorAll(".fh-flag-card");
    flagCards.forEach(card => {
      const header = card.querySelector(".fh-flag-header");
      if (header) {
        header.addEventListener("click", () => {
          card.classList.toggle("open");
        });
      }
    });

    // 4. Wire up copy rewrite buttons
    const copyRewriteBtns = shadow.querySelectorAll(".fh-rewrite-copy-btn");
    copyRewriteBtns.forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const text = btn.getAttribute("data-copy-text");
        if (text) {
          navigator.clipboard.writeText(text);
          btn.textContent = "✓ Copied!";
          setTimeout(() => { btn.textContent = "📋 Copy Rewrite"; }, 2000);
        }
      });
    });

    // 5. Wire action buttons
    const recheckBtn = shadow.getElementById("fh-btn-recheck");
    const viewDetailsBtn = shadow.getElementById("fh-btn-view-details");
    const copyReportJsonBtn = shadow.getElementById("fh-btn-copy-report-json");

    if (recheckBtn) recheckBtn.addEventListener("click", () => executeAnalysis(payload));
    if (viewDetailsBtn) viewDetailsBtn.addEventListener("click", () => showView("extract"));
    if (copyReportJsonBtn) {
      copyReportJsonBtn.addEventListener("click", () => {
        navigator.clipboard.writeText(JSON.stringify(data, null, 2));
        copyReportJsonBtn.textContent = "✓ Copied!";
        setTimeout(() => { copyReportJsonBtn.textContent = "📋 Copy JSON"; }, 2000);
      });
    }
  }

  /**
   * Smooth count-up ticker animation
   */
  function animateCountUp(element, target, durationMs) {
    if (!element) return;
    const start = 0;
    const startTime = performance.now();

    function update(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      // Ease out cubic
      const ease = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(start + (target - start) * ease);
      element.textContent = current;
      if (progress < 1) {
        requestAnimationFrame(update);
      } else {
        element.textContent = target;
      }
    }
    requestAnimationFrame(update);
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

})();
