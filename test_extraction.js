// test_extraction.js - Automated test to verify extraction against Naukri, Internshala, and Scam fixtures
const fs = require("fs");
const path = require("path");

// Simple regex-based test harness for HTML fixtures
function testFixture(filename, portalName) {
  console.log(`\n==================================================`);
  console.log(`TESTING FIXTURE: ${filename} (${portalName})`);
  console.log(`==================================================`);

  const filePath = path.join(__dirname, "extension", filename);
  const html = fs.readFileSync(filePath, "utf-8");

  // Email regex
  const emails = Array.from(new Set(html.match(/\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/gi) || []));
  // URL regex
  const urls = Array.from(new Set(html.match(/\b(?:https?:\/\/|www\.)[^\s<>"'{}|\\^`]+(?:\.[^\s<>"'{}|\\^`]+)+/gi) || []));
  // Phone regex
  const phones = Array.from(new Set(html.match(/(?:\+?91[\-\s]?)?[6789]\d{4}[\-\s]?\d{5}\b|(?:\+?\d{1,3}[\-\s]?)?\(?\d{3}\)?[\-\s]?\d{3}[\-\s]?\d{4}\b/g) || []));

  // Extract title from h1 or title tag
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const title = h1Match ? h1Match[1].replace(/<[^>]+>/g, "").trim() : "None";

  // Check company
  const companyMatch = html.match(/class="[^"]*company[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div|span)>/i);
  const company = companyMatch ? companyMatch[1].replace(/<[^>]+>/g, "").trim() : "None";

  // Check salary / stipend
  const salaryMatch = html.match(/class="[^"]*(?:salary|stipend)[^"]*"[^>]*>([\s\S]*?)<\/(?:div|span)>/i);
  const salary = salaryMatch ? salaryMatch[1].replace(/<[^>]+>/g, "").trim() : "None";

  console.log(`Extracted Title   : ${title}`);
  console.log(`Extracted Company : ${company}`);
  console.log(`Extracted Salary  : ${salary}`);
  console.log(`Emails Found      : ${emails.join(", ") || "None"}`);
  console.log(`URLs Found        : ${urls.join(", ") || "None"}`);
  console.log(`Phones Found      : ${phones.join(", ") || "None"}`);

  if (!title || title === "None") throw new Error(`Title extraction failed for ${filename}`);
  if (!company || company === "None") throw new Error(`Company extraction failed for ${filename}`);
  console.log(`>>> PASS: Fixture ${filename} parsed successfully.`);
}

try {
  testFixture("mock_test.html", "Naukri portal style");
  testFixture("mock_internshala.html", "Internshala portal style");
  testFixture("mock_scam.html", "Generic / Scam listing style");
  console.log("\nALL 3 FIXTURES PASSED EXTRACTION VERIFICATION!");
} catch (err) {
  console.error("Test failed:", err.message);
  process.exit(1);
}
