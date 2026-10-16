# Help screenshot captures

Use `scripts/capture-help-screenshots.mjs` to capture the local app with isolated synthetic responses. Every API request is intercepted, external requests are blocked, and no live workspace is read or modified.

See [capture instructions](../../../docs/help-screenshots.md) for prerequisites, commands, focused checks, and safe fixture requirements. Set `HELP_CAPTURE_OUTPUT` to a temporary directory to review images before replacing bundled files.

Only include screenshots in bundled Help when they clarify an essential workflow. Keep captions actionable, verify referenced images, and rebuild the frontend after updating bundled assets. Other captures remain available for browser verification and README previews.
