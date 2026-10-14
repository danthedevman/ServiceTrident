# Help screenshots

These PNGs capture the current application with synthetic fixtures defined in `scripts/capture-help-screenshots.mjs`. All API requests are intercepted, external requests are blocked, and the browser uses a fresh profile. No live workspace is seeded, read, or modified. Names, addresses, endpoints, dates, and tasks are demo examples.

To refresh them from the repository root:

1. Start the frontend with `npm run dev -w app -- --host 127.0.0.1 --port 5173`.
2. Install Playwright in a temporary directory: `npm install --prefix /tmp/servicetrident-help-capture playwright`.
3. Run `PLAYWRIGHT_MODULE=/tmp/servicetrident-help-capture/node_modules/playwright/index.mjs node scripts/capture-help-screenshots.mjs`.

The script defaults to installed macOS Google Chrome. Set `CHROME_PATH` for a different Chromium executable and `HELP_CAPTURE_URL` for a different local frontend URL. It refreshes workflow Help screenshots and five README images using the Ocean theme in dark mode. It checks task movement and ordering, keyboard controls, mobile overflow, conflict handling, archive separation, viewer permissions, custom status lanes, admin-only global lane ordering, continuous card loading, knowledge-base creation and article association, runbook reading, read-only references, Help image loading, loading access-message suppression, field labels and Help Text, AI feature gating, draft confirmation, six chat examples, simulated thinking/retrieval, the floating close icon, confirmed record actions, and immediate viewed-record refresh, themes, date/time formats, and matching record header/panel heights, compact controls, report-specific breadcrumb titles, and list header alignment, single-border composite fields, unclipped on-call header dropdowns, and the status Color preview. AI responses are synthetic and no provider receives a request. API key input is cleared before any provider screenshot is captured.

Keep screenshot metadata in `app/src/features/help/topics.js` and the main README aligned with these images. Open every output to review framing and confirm that it contains only demo data before committing. To check the built running application without changing bundled images, set `HELP_CAPTURE_URL=http://127.0.0.1:8090` and `HELP_CAPTURE_OUTPUT=/tmp/servicetrident-help-live-check`.
