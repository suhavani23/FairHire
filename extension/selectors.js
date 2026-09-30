// selectors.js - Site-specific selectors and robust DOM extraction engine for Fairhire
// Extracts: title, company, location, salary, description, and contact info (emails, urls, phones)

const SITE_SELECTORS = {
  naukri: {
    match: /naukri\.com/i,
    title: [
      "h1.styles_jd-header-title__rZwM1",
      "h1.jd-header-title",
      "header.jd-header h1",
      ".styles_jdn-header__1K0f7 h1",
      ".jd-top-head h1",
      "h1"
    ],
    company: [
      "a.styles_jd-header-comp-name__MvqAI",
      ".styles_jd-header-comp-name__MvqAI",
      ".company-name",
      ".jd-header-comp-name a",
      "div.styles_jd-header-comp-name__MvqAI",
      ".top-head .comp-name"
    ],
    location: [
      ".styles_jdn-loc__nl_dr span",
      ".styles_jdn-loc__nl_dr",
      ".location",
      ".styles_loc-info__dD_pW",
      "span[class*='loc']",
      ".loc"
    ],
    salary: [
      ".styles_jdn-salary__rEwLp span",
      ".styles_jdn-salary__rEwLp",
      ".salary",
      ".styles_salary-info__f8j2Y",
      "span[class*='salary']",
      ".sal"
    ],
    description: [
      "section.styles_job-desc-container__txpYf",
      ".styles_job-desc-container__txpYf",
      ".job-desc",
      ".styles_job-description__kfqqJ",
      "section[class*='job-desc']",
      ".dang-inner-html"
    ]
  },
  internshala: {
    match: /internshala\.com/i,
    title: [
      ".profile_on_detail_page",
      "h1.heading_4_5",
      ".heading_4_5.profile",
      ".heading_4_5",
      "h1"
    ],
    company: [
      ".company_name a",
      ".company_name",
      ".heading_6.company_name",
      "a.link_display_like_text",
      ".company_and_premium"
    ],
    location: [
      "#location_names a",
      "#location_names",
      ".location_link",
      "a[id*='location']",
      ".internship_meta .location"
    ],
    salary: [
      ".stipend",
      ".salary_container .desktop",
      ".desktoptext",
      "span[class*='stipend']",
      "span[class*='salary']",
      ".stipend_container"
    ],
    description: [
      ".internship_details",
      "#details_container",
      ".text-container",
      ".job_description",
      ".internship_other_details"
    ]
  },
  linkedin: {
    match: /linkedin\.com/i,
    title: [
      "h1.top-card-layout__title",
      "h1.t-24",
      "h1.job-details-jobs-unified-top-card__job-title",
      "h1.jobs-details__title",
      "h1"
    ],
    company: [
      "a.topcard__org-name-link",
      ".job-details-jobs-unified-top-card__company-name a",
      ".job-details-jobs-unified-top-card__company-name",
      "a[href*='/company/']",
      ".jobs-unified-top-card__company-name"
    ],
    location: [
      ".topcard__flavor--bullet",
      ".job-details-jobs-unified-top-card__bullet",
      ".job-details-jobs-unified-top-card__primary-description-container span",
      ".jobs-unified-top-card__bullet"
    ],
    salary: [
      ".job-details-jobs-unified-top-card__job-insight span",
      ".compensation__salary",
      ".job-details-preferences-and-skills"
    ],
    description: [
      ".jobs-description__content",
      "#job-details",
      ".show-more-less-html__markup",
      ".description__text",
      "article.jobs-description"
    ]
  },
  generic: {
    title: [
      "h1",
      "[data-testid*='job-title']",
      ".job-title",
      ".posting-title",
      ".role-title"
    ],
    company: [
      "[data-testid*='company']",
      ".company-name",
      ".employer",
      "a[href*='company']",
      ".org-name"
    ],
    location: [
      "[data-testid*='location']",
      ".job-location",
      ".location",
      "[class*='location']"
    ],
    salary: [
      "[data-testid*='salary']",
      ".job-salary",
      ".salary",
      ".compensation",
      "[class*='salary']",
      "[class*='stipend']"
    ],
    description: [
      "[data-testid*='job-description']",
      "#job-description",
      ".job-description",
      ".job-details",
      "main article",
      "article",
      ".description"
    ]
  }
};

/**
 * Normalizes text: strips excess spaces, linebreaks, and zero-width chars
 */
function cleanText(text) {
  if (!text) return "";
  return text
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Tries a list of CSS selectors on the document and returns the first clean text match
 */
function queryFirstText(selectorList, root = document) {
  for (const selector of selectorList) {
    try {
      const el = root.querySelector(selector);
      if (el) {
        const text = cleanText(el.innerText || el.textContent);
        if (text.length > 0) return { text, matchedSelector: selector };
      }
    } catch (e) {
      // Ignore invalid selector syntax if any
    }
  }
  return { text: "", matchedSelector: null };
}

/**
 * Finds the largest block of visible text on the page as a resilient fallback
 */
function findLargestTextBlock(root = document.body) {
  if (!root) return "";

  // Candidates that usually contain the job description
  const candidates = root.querySelectorAll(
    "article, main, section, .content, #content, div[class*='desc'], div[class*='detail'], div[id*='desc']"
  );

  let largestText = "";
  for (const el of candidates) {
    // Avoid picking script/style or Fairhire's own root
    if (el.closest("#fairhire-root")) continue;
    const text = (el.innerText || "").trim();
    if (text.length > largestText.length && text.length > 150) {
      largestText = text;
    }
  }

  // If no good container found, take the whole body text excluding scripts
  if (!largestText && root.innerText) {
    largestText = root.innerText.trim();
  }

  return largestText;
}

/**
 * Extracts emails, URLs, and phone numbers from description
 */
function extractContacts(text) {
  if (!text) return { emails: [], urls: [], phones: [] };

  // Email regex
  const emailRegex = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/gi;
  const emails = Array.from(new Set(text.match(emailRegex) || [])).map(e => e.toLowerCase());

  // URL regex (excludes obvious host domains and image extensions)
  const urlRegex = /\b(?:https?:\/\/|www\.)[^\s<>"'{}|\\^`]+(?:\.[^\s<>"'{}|\\^`]+)+/gi;
  const rawUrls = Array.from(new Set(text.match(urlRegex) || []));
  const urls = rawUrls.filter(u => !/\.(png|jpe?g|svg|gif|webp|css|js)$/i.test(u));

  // Phone regex: Indian (+91/0 followed by 10 digits starting 6,7,8,9) and international formats
  const phoneRegex = /(?:\+?91[\-\s]?)?[6789]\d{4}[\-\s]?\d{5}\b|(?:\+?\d{1,3}[\-\s]?)?\(?\d{3}\)?[\-\s]?\d{3}[\-\s]?\d{4}\b/g;
  const rawPhones = Array.from(new Set(text.match(phoneRegex) || []));
  // Clean phone formatting
  const phones = rawPhones.map(p => p.trim()).filter(p => p.replace(/\D/g, "").length >= 10);

  return { emails, urls, phones };
}

/**
 * Main Extraction Function
 * Extracts full job listing information from the current page
 */
function extractJobListing() {
  const hostname = window.location.hostname || "";
  let portalKey = "generic";

  if (/naukri\.com/i.test(hostname)) portalKey = "naukri";
  else if (/internshala\.com/i.test(hostname)) portalKey = "internshala";
  else if (/linkedin\.com/i.test(hostname)) portalKey = "linkedin";

  const config = SITE_SELECTORS[portalKey] || SITE_SELECTORS.generic;
  const genericConfig = SITE_SELECTORS.generic;

  // 1. Extract Title
  let titleRes = queryFirstText(config.title);
  if (!titleRes.text) titleRes = queryFirstText(genericConfig.title);
  if (!titleRes.text) {
    // Fallback to document title cleaning
    const rawDocTitle = document.title || "";
    const cleanedTitle = rawDocTitle.split(/[-|–:]/)[0].trim();
    titleRes = { text: cleanedTitle || "Job Listing", matchedSelector: "document.title fallback" };
  }

  // 2. Extract Company
  let companyRes = queryFirstText(config.company);
  if (!companyRes.text) companyRes = queryFirstText(genericConfig.company);
  if (!companyRes.text) {
    // Fallback: look for meta tags
    const metaCompany = document.querySelector("meta[property*='employer'], meta[name*='company']");
    if (metaCompany && metaCompany.content) {
      companyRes = { text: cleanText(metaCompany.content), matchedSelector: "meta tag" };
    }
  }

  // 3. Extract Location
  let locRes = queryFirstText(config.location);
  if (!locRes.text) locRes = queryFirstText(genericConfig.location);

  // 4. Extract Salary
  let salRes = queryFirstText(config.salary);
  if (!salRes.text) salRes = queryFirstText(genericConfig.salary);

  // 5. Extract Description
  let descRes = queryFirstText(config.description);
  let usedFallbackDesc = false;
  if (!descRes.text || descRes.text.length < 100) {
    descRes = queryFirstText(genericConfig.description);
  }
  if (!descRes.text || descRes.text.length < 100) {
    const fallbackBlock = findLargestTextBlock();
    if (fallbackBlock.length > 50) {
      descRes = { text: fallbackBlock, matchedSelector: "largest-text-block-fallback" };
      usedFallbackDesc = true;
    }
  }

  const description = descRes.text || "";
  const contacts = extractContacts(description);

  return {
    title: titleRes.text || "Untitled Position",
    company: companyRes.text || "Unknown Company",
    location: locRes.text || "Not specified",
    salary: salRes.text || "Not disclosed",
    description: description,
    url: window.location.href,
    contacts: contacts,
    meta: {
      portal: portalKey,
      hasSalary: salRes.text.length > 0 && !/not disclosed|undisclosed/i.test(salRes.text),
      wordCount: description.split(/\s+/).filter(Boolean).length,
      charCount: description.length,
      selectorsUsed: {
        title: titleRes.matchedSelector,
        company: companyRes.matchedSelector,
        location: locRes.matchedSelector,
        salary: salRes.matchedSelector,
        description: descRes.matchedSelector
      },
      usedFallbackDesc
    }
  };
}

if (typeof window !== "undefined") {
  window.FAIRHIRE_SELECTORS = SITE_SELECTORS;
  window.FAIRHIRE_EXTRACTOR = {
    cleanText,
    extractContacts,
    extractJobListing
  };
}
