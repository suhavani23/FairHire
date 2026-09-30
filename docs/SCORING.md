# Fairhire Trust Scoring Methodology

## Overview
Fairhire calculates a composite **Trust Score** ($0 - 100$) reflecting job safety, linguistic inclusivity, and compensation/role transparency.

## Score Formula

$$\text{trustScore} = \text{round}\Big(0.4 \times (100 - \text{scamRiskScore}) + 0.3 \times \text{inclusivityScore} + 0.3 \times \text{transparencyScore}\Big)$$

### Hard Cap for High Scam Risk
If $\text{scamRiskScore} \ge 60$ or `scam.risk == "high"`:
$$\text{trustScore} = \min(\text{trustScore}, 30)$$
Reasoning: A job posting that asks for upfront money or uses fraudulent domains can never be trusted, regardless of polished diversity statements or high stated compensation.

---

## Metric Breakdown

### 1. Scam Risk Score ($0 - 100$)
- **Baseline**: Starts at $0$.
- **High-severity penalties (+35 to +50 pts)**:
  - Registration, training, laptop, or interview fee demands.
  - WhatsApp/Telegram-only interview process.
  - "No interview needed / direct selection".
  - Recruiter domain registered $< 30$ days ago or disposable email for an MNC claim.
- **Medium-severity penalties (+20 pts)**:
  - Free email domain (gmail.com, yahoo.com) for corporate job postings.
  - Unrealistic guaranteed earnings ("earn ₹50,000/day with 1 hour typing").
- **Low-severity penalties (+10 pts)**:
  - Urgent countdown pressure ("apply within 2 hours or forfeit offer").

**Risk Categories**:
- `low`: $0 - 29$
- `medium`: $30 - 59$
- `high`: $60 - 100$

---

### 2. Inclusivity Score ($0 - 100$)
- **Baseline**: Starts at $100$.
- **Deductions**:
  - **Gendered / Masculine Jargon**: $-10$ pts per instance ("rockstar", "ninja", "aggressive personality", "dominant player").
  - **Age Bias**: $-15$ pts per instance ("digital native", "young and energetic candidates only", "fresh blood").
  - **Availability / Boundary Pressure**: $-12$ pts per instance ("must work 24x7", "work late nights", "no leaves during crunch").
  - **Gender / Marital Restrictions**: $-25$ pts per instance ("only female/male candidates", "unmarried only").
- **Floor**: Minimum score is $10$.

---

### 3. Transparency Score ($0 - 100$)
- **Baseline**: Starts at $50$.
- **Bonuses (+10 to +15 pts)**:
  - Explicit salary range or stipend provided ($+20$).
  - Equal Opportunity Employer (EOE) statement present ($+10$).
  - POSH (Prevention of Sexual Harassment) compliance or policy mentioned ($+10$).
  - Paid parental leave mentioned ($+5$).
  - Flexible / hybrid work policy disclosed ($+5$).
- **Deductions (-10 to -20 pts)**:
  - No compensation mentioned or "competitive" without range ($-15$).
  - Missing day-to-day responsibilities ($-10$).
  - Unrealistic mandatory requirements (e.g. 10+ years required for junior title) ($-10$).
- **Clamp**: $0 - 100$.

---

## Verdict Determination

| Trust Score | Scam Risk | Verdict | Meaning |
|---|---|---|---|
| $\ge 70$ | `low` | **Looks OK** | Clean signals, transparent compensation, safe domain. |
| $40 - 69$ | `low` or `medium` | **Apply with caution** | Missing salary transparency, pushy hours, or minor flags. |
| $< 40$ or Any | `high` | **Likely scam** | Upfront payment request, suspicious contact channels, or deceptive domain. |

---

## Note on Disclosed Company Safety Metrics (POSH & Turnover)
Official statutory disclosures (BRSR Principle 3 & 5) provide factual context:
- Zero POSH complaints filed does **not** prove safety; an established company with healthy reporting mechanisms often records and resolves complaints transparently.
- Statistically abnormal women-to-men turnover gaps signal potential retention issues.
