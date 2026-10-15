# Input validation and safe output review

Review date: October 15, 2026.

This review covers the API route installers, shared validators, authentication/authorization middleware, database query boundaries, React rendering, rich articles, file handling, outbound requests and record exports. It is a code review and automated regression check, not a guarantee that every vulnerability is absent or a substitute for an independent penetration test.

## Changes delivered

- API requests reject prototype-related object keys, excessive JSON depth/complexity, ambiguous repeated query values and unsupported control characters. Missing JSON objects are normalized for empty JSON actions; field validators still reject missing required values. Binary uploads retain their dedicated parser and limits.
- Persisted text and browser controls reject unsupported controls while retaining ordinary Unicode, tabs and multiline content. Password values are not rewritten or character-stripped; existing bounded password validation and hashing remain authoritative.
- Reference types resolve only own allowlisted definitions; names such as `constructor` cannot reach inherited object properties.
- Rejected Origin headers are neither logged nor echoed. Errors retain useful configured-origin guidance without reflecting untrusted header contents.
- Article links reject executable schemes, embedded URL credentials and control characters. Article content remains validated structured JSON, rendered as React nodes, never user HTML.
- CSV exports neutralize spreadsheet formulas. Record export projections exclude credentials, archived custom fields and monitor URL queries; PDF rendering consumes text, never HTML or remote image URLs.

## Boundaries checked

| Area                             | Enforcement                                                                                                                 |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Authentication and authorization | Session cookies, password checks, workspace/role guards, portal restrictions and dedicated scoped machine endpoints         |
| Records and forms                | Bounded field types, choices, relationships, current required policy and revision checks on writes                          |
| Filters and persistence          | Allowlisted columns and sorts, literal searches, tenant predicates and parameterized PostgreSQL values                      |
| Articles and generated text      | Bounded document trees, safe links, upload-owned image references and escaped text rendering                                |
| Files                            | Filename/extension/size checks, image signatures, private parent authorization and download-only non-images                 |
| Outbound checks and integrations | Restricted schemes/ports, public DNS/address checks, pinned destinations, bounded responses and secret redaction/encryption |
| Audit                            | Bounded verified metadata, no request/response contents or credentials, and export-read outcome tracking                    |

## Verification and limits

Run `npm test`, `npm run lint`, and the integration suite on both MongoDB and PostgreSQL. Security regressions include `test/input-shape.test.js` and `test/integration/input-security.test.js`, alongside existing tenant, role, OIDC, service-account, upload, SSRF, rich-content and persistence tests. Incident collaboration tests also cover foreign mentions/watchers, note restrictions, current notification access, read-state isolation and bounded directory routing fields. Browser regression capture uses isolated synthetic responses only; no live data or provider credentials are used. See [Help screenshot checks](help-screenshots.md).

The dependency advisory scan reported zero known vulnerabilities for both production-only and complete dependencies at review time. Advisory databases change; repeat `npm audit` in CI.

Uploads are constrained and served safely, but are not malware-scanned or subjected to content disarm/reconstruction. Downloaded files must still be treated as untrusted. This review does not verify real external-provider credentials, production infrastructure, distributed rate limiting, or all possible concurrency and abuse scenarios. Production HTTPS, secure-cookie/proxy configuration, secret handling, patching and operational monitoring remain necessary; see [deployment guidance](../README.md#hosting-and-operations).
