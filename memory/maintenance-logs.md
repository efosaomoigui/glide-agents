# GLIDE Maintenance Logs — PAPERLY
## Registry of system improvements and content operations (v2.0.0)

---

## LOG ENTRY: 2026-03-31 (v2.0.0 Synchronization)

### Actions Taken:
- **Major Memory Reset:** Synchronized all memory files with the `GLIDEN_SKILL.md v2.0.0` identity.
- **Brand Voice Pivot:** Shifted from "SME Business Data" to "News Sense-Making."
- **Audience Realignment:** Targeted "Urban Nigerian Professionals (25-40)" instead of "SME Owners."
- **Content Rule Enforcement:** Implemented the strict 5-Slide Carousel Rule and 1-2-3 Template Variety rule.
- **Hook Library Overhaul:** Replaced data-driven hooks with high-curiosity news hooks.

### Reason for Action:
Existing memory files were describing PAPERLY as a business consulting tool, which led to incorrect content generation. This reset ensures GLIDE operates with the correct product context.

## LOG ENTRY: 2026-03-31 (v2.0.1 Optimizations)

### Actions Taken:
- **Timestamp Correction:** Standardized all database entries and dashboard rendering to ISO 8601 UTC (with `Z`). This resolved the 1-hour timezone drift for users in WAT (+01:00).
- **Agent Self-Debugging:** Updated `chatWithGlide` to inject recent system errors and a file structure summary into the agent's context. GLIDE can now troubleshoot its own failures (e.g., JSON parse errors).
- **Duplicate Prevention:** Enforced the "Unique Story Mapping Rule" in the `/api/generate` prompt to ensure news stories are never reused in different formats within the same session.

### Reason for Action:
Corrected several operational blockers that affected dashboard accuracy and agent reliability. These optimizations ensure content variety and better system maintainability.

---

## LOG ENTRY: 2026-03-31 (v2.0.2 Instagram Optimization)

### Actions Taken:
- **Batch Polling Implementation:** Refactored `instagram.js` to poll multiple media containers in a single request using the `?ids=` Graph API parameter. This reduces API call volume by ~80% for carousels.
- **Enhanced Error Visibility:** Added `status_code`, `status`, and `error_message` fields to the polling logic. Success/failure reasons from Meta are now captured directly in the system logs.
- **Rate Limit Buffering:** Increased the polling interval from 8s to 12s and added a 30s back-off delay when a 403/429 "Rate Limit" error is detected.
- **Traceability:** Updated the `errors` table to include the specific `post.id` in the error message for easier debugging.

### Reason for Action:
Frequent "Application request limit reached" errors were blocking Instagram posts. These optimizations ensure GLIDE stays within Meta's strict platform limits while providing better feedback when processing fails.

---

## LOG ENTRY: [DATE] — [LOG TITLE]

### Actions Taken:
- [Action 1]
- [Action 2]

### Reason for Action:
[Description of the improvement or cleanup justification]

---

*GLIDE adds to this file whenever major system modifications, content cleanups, or prompt improvements are executed.*
