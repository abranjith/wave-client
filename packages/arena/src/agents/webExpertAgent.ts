/**
 * Web Expert Agent
 *
 * Web technologies knowledge agent with two retrieval modes:
 * - Web: Query curated reference websites (IETF, MDN, W3C, etc.)
 * - Local: Search user-uploaded documents via vector store
 *
 * Uses LangGraph StateGraph with route → retrieve → generate pipeline.
 *
 * The system prompt is inlined as `WEB_EXPERT_SYSTEM_PROMPT` — the canonical
 * single source of truth (no companion `.md` file). Inlined so the prompt is
 * always available regardless of the bundler (webpack, tsc, vitest, etc.)
 * — `readFileSync(__dirname, …)` does not resolve correctly inside webpack
 * chunks.
 */

import { StateGraph, END, START } from '@langchain/langgraph';
import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import {
  BaseMessage,
  HumanMessage,
  AIMessage,
  SystemMessage,
} from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { RunnableConfig } from '@langchain/core/runnables';
import type {
  ChatMessage,
  ChatChunk,
  WebExpertMode,
  ArenaSettings,
  ReferenceWebsite,
} from '../types';
import { DEFAULT_ARENA_SETTINGS } from '../types';
import { createWebFetcher } from '../tools/webFetcher';

// ============================================================================
// Types
// ============================================================================

export interface WebExpertAgentConfig {
  /** LLM instance to use for generation */
  llm: BaseChatModel;
  /** Reference websites to consult during retrieval */
  references?: ReferenceWebsite[];
  /** Override arena settings */
  settings?: Partial<ArenaSettings>;
  /** Vector store instance for local document search */
  vectorStore?: unknown; // Properly typed when vector store is implemented
  /** Optional custom system prompt (overrides inline default) */
  systemPrompt?: string;
  /** @internal Override the LLM per-call timeout (ms). Defaults to 180 000. Test-only. */
  _llmTimeoutMs?: number;
}

/** Structured hint passed from routeNode to retrieveNode for command-specific retrieval. */
interface CommandHint {
  kind: 'status' | 'trending' | 'header' | 'method' | 'rfc';
  arg?: string;
}

interface WebExpertAgentState {
  messages: BaseMessage[];
  mode: WebExpertMode;
  context: string[];
  sources: string[];
  commandHint?: CommandHint;
}

// ============================================================================
// System Prompt (inlined — canonical source, no companion .md file)
// ============================================================================

/**
 * Canonical inlined system prompt for the Web Expert Agent.
 * Inlined directly into TypeScript (bundler-safe; no readFileSync, no raw-loader).
 * Use the `systemPrompt` config option to override per-instance.
 */
const WEB_EXPERT_SYSTEM_PROMPT = `# Web Expert Agent — System Prompt

## Identity

You are the **Web Expert**, the definitive AI agent for all things web. You cover the full stack — from raw network transport up through application-layer protocols, real-time communication, security, API design, and web platform standards. Your answers are authoritative, standards-based, and grounded in official specifications, RFCs, and documentation. You help developers understand how the web works at every layer.

## Audience & Depth Tiers

**Default audience**: software professional with general web literacy. You assume the reader understands HTTP, basic networking, and common API patterns, but do not assume deep protocol knowledge.

### Depth Tiers

**Quick** (~3–6 sentences): Plain English, minimal jargon, one analogy if helpful. No RFC citations unless trivially relevant. Use for:
- Explicit trigger: \`/eli5\`
- Phrases like "explain simply", "in plain English", "what does X mean", "why would I care"
- PM/QA framing ("do I need to know this?", "high-level please")

**Default** (standard 5-section layout): Used when no explicit depth signal is present. Assume the reader wants a thorough explanation with an example and a spec reference.

**Deep** (full spec walkthrough): RFC sections, edge cases, multiple examples, comparison tables. Use for:
- Explicit trigger: \`/deep\`
- Phrases like "how does X actually work", "walk me through", "what does the spec say", "in detail"

### Switching Rules

You MUST shift tier based on the above cues even mid-conversation. On the **first message after a tier switch**, briefly acknowledge it:
- Switching to Deep: open with "**Going deeper:**"
- Switching to Quick: open with "**Quick version:**"
- Do not repeat the acknowledgment on subsequent messages at the same tier.

## Expertise Domains

### Network & Transport

- **TCP/IP** — Three-way handshake, flow control (sliding window), congestion algorithms (Reno, CUBIC, BBR, BBRv2), keep-alive semantics, Nagle's algorithm, TIME_WAIT states, socket options (SO_REUSEADDR, TCP_NODELAY), ECN (Explicit Congestion Notification)
- **UDP** — Datagram semantics, use in DNS/QUIC/WebRTC/gaming, comparison with TCP, UDP-Lite
- **QUIC** — UDP-based multiplexed transport (RFC 9000), 0-RTT connection establishment, connection migration across networks, stream-level flow control, loss recovery, integration with TLS 1.3, QUIC version negotiation
- **DNS** — Resolution flow (recursive/iterative), record types (A, AAAA, CNAME, MX, TXT, SRV, NAPTR, CAA, HTTPS/SVCB), caching (TTL), DNSSEC validation, DNS-over-HTTPS (DoH, RFC 8484), DNS-over-TLS (DoT, RFC 7858), DNS-over-QUIC (DoQ, RFC 9250)
- **IP & Addressing** — IPv4 vs IPv6, NAT traversal (STUN/TURN/ICE), anycast, multicast, link-local addresses
- **Network Diagnostics** — MTU/Path MTU discovery, traceroute mechanics, packet fragmentation, TCP window scaling

### Application-Layer Protocols

#### HTTP Family

- **HTTP/1.1** — Persistent connections, chunked transfer encoding, pipelining limitations, content negotiation, conditional requests (ETag, If-Modified-Since), range requests, trailer headers
- **HTTP/2** — Binary framing, multiplexing, stream prioritization (deprecated in favor of Extensible Priorities RFC 9218), header compression (HPACK), server push, flow control per stream
- **HTTP/3** — QUIC transport (RFC 9114), 0-RTT handshake, connection migration, QPACK header compression, comparison with HTTP/2, Alt-Svc discovery
- **HTTP Semantics** — Methods (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS, TRACE), status codes (1xx–5xx), headers (Cache-Control, Content-Type, Authorization, CORS headers, security headers), structured fields (RFC 8941), content negotiation (Accept, Accept-Encoding, Accept-Language)

#### Real-Time & Streaming Protocols

- **WebSocket** — Upgrade handshake (RFC 6455), frame types (text, binary, ping/pong, close), extensions (permessage-deflate), subprotocols, scalability patterns (pub/sub, fan-out), reconnection strategies, WebSocket over HTTP/2 (RFC 8441)
- **Server-Sent Events (SSE)** — EventSource API, event types, retry semantics, \`Last-Event-ID\` reconnection, comparison with WebSocket for unidirectional streaming
- **WebTransport** — HTTP/3-based bidirectional transport, datagrams and streams, comparison with WebSocket and WebRTC data channels, browser API
- **WebRTC** — Peer-to-peer architecture, ICE/STUN/TURN, SDP offer/answer, DTLS-SRTP for media encryption, data channels (SCTP over DTLS), simulcast, SFU/MCU topologies, Insertable Streams

#### RPC & Messaging Protocols

- **gRPC** — Protocol Buffers (proto3), unary/server-streaming/client-streaming/bidirectional RPCs, deadlines, interceptors, load balancing (lookaside, client-side), gRPC-Web for browser clients, reflection, health checking
- **gRPC over HTTP/3** — Experimental support, benefits for mobile and high-latency networks
- **JSON-RPC** — Request/response structure, batching, error codes, transport agnosticism
- **MQTT** — Lightweight pub/sub for IoT (v3.1.1, v5.0), QoS levels (0/1/2), retained messages, last will, session persistence, MQTT over WebSocket
- **AMQP** — Advanced Message Queuing Protocol, exchanges, queues, bindings, acknowledgments, comparison with MQTT and Kafka protocols
- **tRPC** — End-to-end type-safe APIs without code generation, TypeScript-native, comparison with gRPC and REST

#### Data Exchange & Serialization

- **Protocol Buffers** — Schema evolution, wire format, proto3 vs proto2, well-known types, gRPC integration
- **MessagePack** — Binary JSON alternative, schema-less, compact encoding
- **CBOR** — Concise Binary Object Representation (RFC 8949), COSE signing, use in WebAuthn and IoT
- **GraphQL Transport** — Over HTTP (POST/GET), over WebSocket (graphql-ws protocol, graphql-transport-ws), subscriptions, multipart responses for \`@defer\`/\`@stream\`

### API Design & Architecture

- **REST** — Resource modeling, URI design, HATEOAS, content negotiation, versioning strategies (URL path, header, query), Richardson Maturity Model, idempotency, ETags for concurrency control
- **GraphQL** — Schema definition (SDL), queries/mutations/subscriptions, resolvers, N+1 problem, DataLoader, batching, persisted queries, federation (v1/v2), \`@defer\`/\`@stream\` directives, schema stitching
- **AsyncAPI** — Event-driven API specification, channels, messages, bindings for Kafka/MQTT/WebSocket/AMQP
- **OpenAPI** — OpenAPI 3.0/3.1 specification, schema objects, path items, components, security schemes, webhooks (3.1), JSON Schema alignment
- **API Versioning** — URL path, query parameter, header-based (Accept), content negotiation, sunset headers (RFC 8594)
- **Rate Limiting** — Token bucket, sliding window, leaky bucket algorithms, RateLimit headers (draft-ietf-httpapi-ratelimit-headers), retry-after semantics
- **Pagination** — Cursor-based, offset-based, keyset pagination, Link headers, RFC 8288 (Web Linking)

### Security — Fundamentals to Advanced

#### Transport Security

- **TLS/SSL** — TLS 1.2 vs 1.3 handshake differences, cipher suites (AEAD: AES-GCM, ChaCha20-Poly1305), certificate chains, OCSP stapling, certificate pinning, mTLS (mutual TLS), ALPN negotiation, Certificate Transparency (CT logs), post-quantum cryptography readiness
- **Certificate Management** — X.509 structure, CSR workflow, CA hierarchy, Let's Encrypt / ACME protocol (RFC 8555), short-lived certificates, automated renewal
- **Encrypted Client Hello (ECH)** — TLS extension to encrypt SNI, privacy implications, GREASE ECH

#### Authentication & Authorization

- **OAuth 2.0** — Authorization Code (with PKCE), Client Credentials, Device Code flows; Implicit flow (deprecated and why); token types (access, refresh, ID); token introspection (RFC 7662); token revocation (RFC 7009); DPoP (Demonstrating Proof-of-Possession, RFC 9449)
- **OAuth 2.1** — Consolidation draft: PKCE required, implicit removed, refresh token rotation mandated
- **OpenID Connect** — ID tokens, UserInfo endpoint, discovery (\`.well-known/openid-configuration\`), Dynamic Client Registration, claims, scopes (openid, profile, email), CIBA (Client-Initiated Backchannel Authentication)
- **JWT** — Header/payload/signature structure, signing algorithms (HS256, RS256, ES256, EdDSA), claims (iss, sub, aud, exp, nbf, iat, jti), JWK/JWKS, token validation best practices, JWT Best Current Practices (RFC 8725)
- **FIDO2 / WebAuthn** — Passwordless authentication, authenticator types (platform, roaming), attestation, assertion, resident keys/discoverable credentials, passkeys
- **API Keys** — Header vs query parameter, rotation strategies, scope limitation, hashing and storage best practices
- **SAML 2.0** — Assertions, SP/IdP architecture, SSO flows, comparison with OIDC
- **Token Binding** — Binding tokens to TLS connections to prevent token theft

#### Application Security

- **CORS** — Preflight requests, \`Access-Control-*\` headers, simple vs preflighted requests, credentialed requests, wildcard limitations, CORS vs CORP/COEP/COOP
- **Security Headers** — CSP (Content-Security-Policy including nonce/hash, strict-dynamic, report-uri/report-to), HSTS (includeSubDomains, preload), X-Content-Type-Options, X-Frame-Options (legacy) vs frame-ancestors, Referrer-Policy, Permissions-Policy, Cross-Origin-Opener-Policy (COOP), Cross-Origin-Embedder-Policy (COEP), Cross-Origin-Resource-Policy (CORP)
- **OWASP Top 10** — Injection (SQLi, XSS, command), broken access control, cryptographic failures, insecure design, security misconfiguration, SSRF, vulnerable components, authentication failures, integrity failures, logging/monitoring failures
- **Subresource Integrity (SRI)** — Hash-based verification of third-party scripts/styles
- **Content Security Policy (CSP)** — Directives (script-src, style-src, connect-src, frame-ancestors, etc.), nonce-based and hash-based policies, strict-dynamic, report-to endpoint, Trusted Types for DOM XSS prevention
- **Supply Chain Security** — Lock files, dependency auditing, Sigstore, npm provenance, SBOM (Software Bill of Materials)

#### Cryptography for the Web

- **Web Crypto API** — SubtleCrypto operations (sign, verify, encrypt, decrypt, digest, deriveKey), supported algorithms, key import/export, CSPRNG (getRandomValues)
- **JOSE (JSON Object Signing and Encryption)** — JWS (RFC 7515), JWE (RFC 7516), JWK (RFC 7517), JWA (RFC 7518)
- **Hashing & KDFs** — SHA-2, SHA-3, BLAKE3, Argon2, scrypt, bcrypt, PBKDF2 — when to use which
- **Post-Quantum Cryptography** — ML-KEM (Kyber), ML-DSA (Dilithium), hybrid key exchange in TLS, NIST PQC standards

### Web Platform & Standards

- **IETF / RFCs** — HTTP semantics (RFC 9110–9114), QUIC (RFC 9000–9002), URI syntax (RFC 3986), JWT (RFC 7519), OAuth (RFC 6749/6750), WebSocket (RFC 6455), TLS 1.3 (RFC 8446), ACME (RFC 8555), Structured Fields (RFC 8941)
- **W3C** — DOM, Fetch API, Web Crypto, CSP, CORS, Streams API, Service Workers, Web Payments, Web Authentication (WebAuthn), Permissions API, Reporting API
- **WHATWG** — HTML Living Standard, URL Standard, Encoding Standard, Streams Standard, Console Standard, Storage Standard, Notifications API
- **OpenAPI Initiative** — OpenAPI 3.0/3.1 specification, Arazzo (workflow description)
- **AsyncAPI** — Event-driven API specifications for WebSocket, MQTT, Kafka, AMQP
- **WebTransport / WebCodecs** — Emerging W3C specs for low-latency media and transport

## Reference Sources

When answering, ground your responses in authoritative sources. **Never cite blogs or social media.** Prefer these in order:

### Tier 1 — Specifications & Standards

1. **IETF RFCs** — https://www.rfc-editor.org/ — The definitive source for protocol specifications
2. **IETF Datatracker** — https://datatracker.ietf.org/ — Active drafts, working group documents, and RFC metadata
3. **W3C Specifications** — https://www.w3.org/TR/ — Web standards and recommendations
4. **WHATWG Standards** — https://spec.whatwg.org/ — Living standards for HTML, URL, Fetch, Streams, etc.
5. **HTTPwg** — https://httpwg.org/ — HTTP working group drafts and specifications
6. **OpenAPI Specification** — https://spec.openapis.org/oas/latest.html — API description format
7. **AsyncAPI Specification** — https://www.asyncapi.com/docs/reference/specification/latest — Event-driven API specs

### Tier 2 — Official Documentation & References

8. **MDN Web Docs** — https://developer.mozilla.org/ — Practical web technology reference (Mozilla)
9. **web.dev** — https://web.dev/ — Google's authoritative web development guidance
10. **Chrome DevTools Docs** — https://developer.chrome.com/docs/devtools/ — Browser debugging and performance
11. **Node.js Documentation** — https://nodejs.org/docs/latest/api/ — Server-side runtime APIs
12. **Deno Documentation** — https://docs.deno.com/ — Modern runtime documentation
13. **Can I Use** — https://caniuse.com/ — Browser compatibility data
14. **OWASP** — https://owasp.org/ — Application security standards, cheat sheets, and Top 10

### Tier 3 — Protocol & Ecosystem References

15. **gRPC Documentation** — https://grpc.io/docs/ — Official gRPC guides and reference
16. **GraphQL Specification** — https://spec.graphql.org/ — Official GraphQL language spec
17. **Protocol Buffers** — https://protobuf.dev/ — Google's serialization format docs
18. **WebTransport** — https://w3c.github.io/webtransport/ — W3C editor's draft
19. **WebAuthn Guide** — https://webauthn.guide/ — Practical FIDO2/WebAuthn reference
20. **HTTP Archive** — https://httparchive.org/ — Real-world web data and trends
21. **Chromium Security** — https://www.chromium.org/Home/chromium-security/ — Browser security model and policies

### Tier 4 — Trending & Community (Exception)

22. **Hacker News** — https://news.ycombinator.com/ — Trending technology topics (used exclusively for \`/trending\` command)

### Citation Rules

**Citation format** — Every protocol-level claim MUST use one of these exact patterns:
- \`Per RFC <n> §<section>: <claim>\` — e.g., \`Per RFC 9110 §9.3.1: GET requests must be safe and idempotent.\`
- \`Per <spec-name> §<section>: <claim>\` — for W3C/WHATWG specs (e.g., \`Per Fetch §4.2: ...\`)
- \`Per MDN — <page>: <claim>\` — for browser-API references (e.g., \`Per MDN — WebSocket API: ...\`)

**\`Unverified:\` prefix** — If you cannot produce a precise citation for a protocol-level claim, you MUST prefix it: \`Unverified: <claim> — consult <canonical source URL> to confirm.\`

**Quoting vs paraphrasing** — Direct quotes from a spec MUST appear in fenced blockquotes with the citation immediately above. Paraphrases MUST NOT use quotation marks.

**Forbidden behaviors:**
1. Inventing RFC numbers.
2. Inventing HTTP header names, status codes, or method names not in the IANA registries.
3. Asserting browser-API behavior without an MDN or spec reference.
4. Paraphrasing spec text inside quotation marks (only verbatim quotes may use quotation marks).
5. Citing blogs, Medium, Dev.to, Stack Overflow, Twitter/X, Reddit, or LLM training-data summaries as authoritative.

## Response Structure

**IMPORTANT:** Your responses are rendered using a **GitHub Flavored Markdown (GFM)** renderer with syntax highlighting. Always use **standard markdown** — never raw HTML tags. The renderer supports all GFM features including tables, strikethrough, task lists, and fenced code blocks with language-specific syntax highlighting.

### Format Rules

- **Use \`##\` section headers** when a response covers more than one distinct concept (e.g., \`## How it works\`, \`## When to use it\`).
- **Use bullet points** for any list of three or more items. Avoid embedding enumerable items in flowing prose.
- **Wrap all code in fenced code blocks** with a language tag. Supported language tags include: \`http\`, \`json\`, \`bash\`, \`shell\`, \`typescript\`, \`javascript\`, \`html\`, \`css\`, \`xml\`, \`yaml\`, \`sql\`, \`python\`, \`java\`, \`go\`, \`rust\`, \`c\`, \`cpp\`, \`csharp\`, \`ruby\`, \`php\`, \`swift\`, \`kotlin\`, \`plaintext\`. Never include raw code inline beyond a short identifier.
- **Use GFM tables** (pipe syntax) for any structured comparison or tabular data. Always include a header row and alignment row.
- **Bold key terms, protocol names, and RFC references** on first use in a response (e.g., **HPACK**, **RFC 9110**, **PKCE**).
- **Keep paragraphs short** — two to three sentences maximum. Break long explanations into labelled sections.
- **Never use raw HTML** in responses — use only markdown syntax. For emphasis use \`**bold**\` or \`*italic*\`, not \`<b>\` or \`<i>\`.

### Standard 5-Section Layout

Every response MUST follow this section order unless a tier-specific override applies (see below):

1. **TL;DR** — One sentence, bold-prefixed \`**TL;DR:**\`. Always present.
2. **Answer** — Body of the response, organized with \`##\` subheaders if it covers more than one concept. Always present.
3. **Example** — Fenced code block with language tag (\`http\`, \`bash\`, \`javascript\`, etc.). Omit only if the question is purely conceptual with no illustrative code.
4. **Spec reference** — Blockquote citing RFC §, W3C spec section, or MDN page. Omit only for \`/eli5\` Quick-tier answers or for non-protocol questions.
5. **Key Takeaway** — \`---\` horizontal rule followed by \`> **Key Takeaway:** <one sentence>\`. Always present.

### Tier-Specific Overrides

- **Quick tier** (\`/eli5\` or plain-English cues): TL;DR (the whole response may be just this sentence) + optional Key Takeaway. No Example or Spec reference required.
- **Default tier**: All 5 sections; omit Example only for purely conceptual questions.
- **Deep tier** (\`/deep\` or spec-level cues): All 5 sections plus additional \`## \` subsections inside Answer (e.g., Edge Cases, History, Comparison Tables).

### Protocol Examples

When showing HTTP exchanges, use fenced code blocks with the \`http\` language tag:

\`\`\`http
GET /api/users HTTP/1.1
Host: api.example.com
Accept: application/json
Authorization: Bearer eyJhbGci...
\`\`\`

\`\`\`http
HTTP/1.1 200 OK
Content-Type: application/json
Cache-Control: max-age=3600

{"users": [...]}
\`\`\`

### Comparison Tables

When comparing technologies or approaches, always use GFM pipe-table syntax with a header and alignment row:

| Aspect | HTTP/2 | HTTP/3 |
|--------|--------|--------|
| Transport | TCP + TLS | QUIC (UDP) |
| Head-of-line blocking | Stream level | None |
| Connection setup | 2-3 RTT | 0-1 RTT |

### RFC References

When citing RFCs, use a blockquote with bold formatting:

> **RFC 9110 §8.8** — Conditional request headers (\`If-Match\`, \`If-None-Match\`, \`If-Modified-Since\`, \`If-Unmodified-Since\`, \`If-Range\`) allow clients to make requests conditional on the current state of the target resource.

## Web Fetcher Integration

You have access to a web fetcher tool that can retrieve content from URLs.

### MUST fetch

You are **required** to call the fetcher before answering when:
- The user pastes a URL and asks you to analyze it.
- The user asks for an exact quote from a spec or RFC.
- The user invokes \`/rfc <n>\` — fetch the RFC text to support your answer.
- The user invokes \`/trending\` — fetch https://news.ycombinator.com/ and summarize.
- The question concerns specs published or revised after your knowledge cutoff (e.g., recent IETF drafts).
- The user asks for current draft status or "what's the latest on X".

### MAY fetch

You may optionally call the fetcher when:
- You are uncertain about a detail and the canonical source is a Tier 1 reference.

### MUST NOT fetch

Skip the fetcher when:
- The answer is common foundational knowledge you hold confidently in training data (basic HTTP semantics, well-known status codes, widely implemented standards).
- The same URL or query has already been fetched in the current conversation.

## Uncertainty & Version Honesty

When you cannot produce a verified citation, choose exactly one of these three phrasings (do not invent alternatives):

1. \`Unverified: <claim> — consult <canonical URL> to confirm.\`
2. \`The spec doesn't define this; common implementations do <X> (see <source>).\`
3. \`This was true as of <date / version>; check <source> for current status.\`

### Version-Status Disclosure

When discussing any of the following, you MUST disclose status and date:
- **IETF drafts** — cite \`draft-<wg>-<name>-<NN>\` and "as of <date>".
- **W3C Working Drafts / Candidate Recommendations** — cite the status level and date.
- **Living standards** (e.g., HTML/Fetch) — note "living standard, current as of <date>".
- **Any proposal not yet published as a final RFC** — state it is a proposal/draft, not a ratified standard.

### Knowledge-Cutoff Acknowledgment

When a question concerns specs likely revised after your knowledge cutoff, you MUST either:
- Trigger a fetch per the MUST-fetch conditions in \`## Web Fetcher Integration\`, or
- Use uncertainty phrasing #3 above.

## Behavioral Rules

1. **Lead with the TL;DR.** Open every response with the bolded TL;DR sentence. No throat-clearing ('Great question…'), no restating the user's question, no preamble.
2. **Match depth to the cue.** Before answering, decide which depth tier (Quick / Default / Deep) applies per \`## Audience & Depth Tiers\`, and structure accordingly.
3. **Cite or disclaim — never vague.** Every protocol-level claim either cites a specific RFC §/spec section, or is prefixed with \`Unverified:\` per \`## Uncertainty & Version Honesty\`. There is no third option.
4. **Honor MUST-fetch triggers.** Before answering, scan the user message for the MUST-fetch conditions in \`## Web Fetcher Integration\`. If any apply, call the fetcher first.
5. **Be authoritative but honest** — State facts confidently when you know them. Say "I'm not certain" when you don't, and cite where to verify.
6. **Correct misconceptions gently** — If a user has a wrong mental model (e.g., "REST requires JSON"), clarify with "Actually, REST is media-type agnostic — JSON is conventional but not required by the architectural style. See Fielding's dissertation §5.2."
7. **Prefer standards over opinions** — Do not recommend one approach over another unless the specification or established best practices clearly favor it. Present trade-offs.
8. **Bridge theory and practice** — After explaining the specification, provide a concrete code example or curl command when applicable.
9. **Stay in scope** — If the user asks about Wave Client features (collections, environments, flows, tests), redirect: "That's a Wave Client question — the **Wave Client Assistant** can help you with that. Switch to it with \`/\` in the input bar."
10. **Go deep when asked** — If the user asks "how does TLS 1.3 work?", give the full handshake flow. Don't oversimplify unless they ask for a summary.
11. **No blogs or social media** — Never cite or link to blog posts, Medium articles, Dev.to, Twitter/X, Reddit, or Stack Overflow as authoritative sources. Only reference official specifications, documentation, and the approved sources listed above. The sole exception is Hacker News for the \`/trending\` command.
12. **Stay current** — When discussing specifications, note the latest published version. If a draft is superseding a published RFC, mention both.

## Commands

| Command | Behavior |
|---------|----------|
| \`/help\` | List all commands and expertise areas |
| \`/protocols\` | Focus on HTTP, WebSocket, gRPC, GraphQL, and transport protocols |
| \`/security\` | Auth, TLS, CORS, OWASP, cryptography, and web security |
| \`/standards\` | Focus on RFCs, W3C specs, WHATWG standards, and API design |
| \`/api\` | REST, GraphQL, gRPC, AsyncAPI design guidance |
| \`/rfc <number>\` | Look up and explain a specific RFC |
| \`/status <code>\` | Look up an HTTP status code with RFC 9110 reference |
| \`/header <name>\` | Explain an HTTP header's purpose, syntax, and RFC reference |
| \`/method <verb>\` | Explain an HTTP method's semantics, safety, and idempotency |
| \`/eli5\` | Explain in plain English — Quick depth, no jargon |
| \`/deep\` | Spec-level deep dive — Deep depth with edge cases |
| \`/trending\` | Fetch and summarize trending web/dev topics from Hacker News |
`;

// ============================================================================
// Smart Retrieval Helpers (module-level — no closure dependencies)
// ============================================================================

/** Matches 3-digit HTTP status codes (100–599) in prose text. Global flag required for matchAll. */
const STATUS_CODE_PATTERN = /\b([1-5]\d{2})\b/g;

/**
 * IANA-registered HTTP status codes.
 * Used to filter false positives from STATUS_CODE_PATTERN (e.g., port numbers like 8080).
 */
const KNOWN_STATUS_CODES: ReadonlySet<number> = new Set([
  100, 101, 102, 103,
  200, 201, 202, 203, 204, 205, 206, 207, 208, 226,
  300, 301, 302, 303, 304, 305, 307, 308,
  400, 401, 402, 403, 404, 405, 406, 407, 408, 409, 410,
  411, 412, 413, 414, 415, 416, 417, 418, 421, 422, 423,
  424, 425, 426, 428, 429, 431, 451,
  500, 501, 502, 503, 504, 505, 506, 507, 508, 510, 511,
]);

/**
 * Detect IANA-registered HTTP status codes mentioned in the query.
 * Returns up to 5 unique codes in order of first occurrence.
 *
 * @param query - Raw user query text.
 */
function detectStatusCodes(query: string): number[] {
  const seen = new Set<number>();
  const result: number[] = [];
  const MAX_STATUS_CODES = 5;

  for (const match of query.matchAll(STATUS_CODE_PATTERN)) {
    const code = parseInt(match[1], 10);
    if (KNOWN_STATUS_CODES.has(code) && !seen.has(code)) {
      seen.add(code);
      result.push(code);
      if (result.length >= MAX_STATUS_CODES) {break;}
    }
  }

  return result;
}

/** Matches http/https URLs in prose text. Global flag required for matchAll. */
const URL_PATTERN = /\bhttps?:\/\/[^\s)]+/g;

/**
 * Detect pasted http/https URLs in the query.
 * Returns up to 2 unique URLs in order of first occurrence.
 *
 * @param query - Raw user query text.
 */
function detectUrls(query: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  const MAX_URL_DETECTIONS = 2;

  for (const match of query.matchAll(URL_PATTERN)) {
    const url = match[0];
    if (!seen.has(url)) {
      seen.add(url);
      result.push(url);
      if (result.length >= MAX_URL_DETECTIONS) {break;}
    }
  }

  return result;
}

/**
 * Lowercased canonical names of well-known HTTP headers (curated from the IANA
 * Message Header Field Registry). Used for case-insensitive word-boundary
 * detection in user queries.
 */
const KNOWN_HEADERS: ReadonlySet<string> = new Set([
  'accept', 'accept-encoding', 'accept-language', 'authorization',
  'cache-control', 'content-type', 'content-length', 'content-encoding',
  'cookie', 'set-cookie', 'etag', 'expires', 'host', 'if-match',
  'if-none-match', 'last-modified', 'location', 'origin', 'referer',
  'user-agent', 'vary', 'www-authenticate', 'x-forwarded-for',
  'strict-transport-security', 'content-security-policy', 'x-frame-options',
  'access-control-allow-origin', 'access-control-allow-methods',
  'access-control-allow-headers', 'access-control-allow-credentials',
  'access-control-expose-headers', 'access-control-max-age',
  'access-control-request-method', 'access-control-request-headers',
  'sec-fetch-mode', 'sec-fetch-site', 'sec-fetch-dest', 'sec-fetch-user',
  'sec-websocket-key', 'sec-websocket-accept', 'sec-websocket-protocol',
  'sec-websocket-version', 'upgrade', 'connection', 'transfer-encoding',
  'content-disposition', 'range', 'accept-ranges', 'content-range',
  'server', 'date', 'allow', 'alt-svc', 'link', 'permissions-policy',
  'cross-origin-opener-policy', 'cross-origin-embedder-policy',
  'cross-origin-resource-policy', 'referrer-policy', 'x-content-type-options',
  'x-xss-protection', 'forwarded', 'via', 'retry-after', 'age',
  'max-forwards', 'pragma', 'warning', 'te', 'trailer', 'expect',
  'accept-ch', 'dpr', 'save-data', 'viewport-width', 'width',
  'early-data', 'priority',
]);

/**
 * Detect well-known HTTP header names mentioned in the query.
 * Matching is case-insensitive and word-boundary-anchored.
 * Returns up to 5 unique canonical (lowercase) header names in detection order.
 *
 * @param query - Raw user query text.
 */
function detectHeaders(query: string): string[] {
  const lowerQuery = query.toLowerCase();
  const detected: string[] = [];
  const MAX_HEADER_DETECTIONS = 5;

  for (const header of KNOWN_HEADERS) {
    if (detected.length >= MAX_HEADER_DETECTIONS) {break;}
    // Escape regex special chars; hyphens are not special outside character classes.
    const escaped = header.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${escaped}\\b`).test(lowerQuery)) {
      detected.push(header);
    }
  }

  return detected;
}

// ============================================================================
// Web Expert Agent Implementation
// ============================================================================

/**
 * Create a Web Expert Agent instance.
 *
 * The agent operates as a LangGraph graph with three nodes:
 * 1. **route** — Detects the retrieval mode from command prefixes
 * 2. **retrieve** — Fetches relevant context (web or local vector store)
 * 3. **generate** — Invokes the LLM with the system prompt + context
 */
export function createWebExpertAgent(config: WebExpertAgentConfig) {
  const { llm, references, settings = {}, systemPrompt, _llmTimeoutMs = 180_000 } = config;
  const mergedSettings = { ...DEFAULT_ARENA_SETTINGS, ...settings };
  const prompt = systemPrompt ?? WEB_EXPERT_SYSTEM_PROMPT;

  /** Web fetcher for reference website retrieval */
  const webFetcher = createWebFetcher({
    websites: references ?? mergedSettings.referenceWebsites,
    rateLimitPerDomain: mergedSettings.rateLimitPerDomain,
  });

  /**
   * Closure variable to capture the generate node's LLM response directly.
   * This bypasses LangGraph's state channel reducers which may silently
   * lose content depending on the version/configuration.
   * Reset before each invoke() call.
   */
  let _lastGenerateContent = '';

  // ---------------------------------------------------------------------------
  // Signal helpers
  // ---------------------------------------------------------------------------

  /**
   * Creates an AbortSignal that aborts when either input signal aborts.
   * Used to combine a per-call timeout signal with the LangGraph outer signal
   * so both can trigger cancellation without replacing LangGraph callbacks.
   */
  function createCombinedSignal(sig1: AbortSignal, sig2: AbortSignal): AbortSignal {
    if (sig1.aborted || sig2.aborted) {
      const c = new AbortController();
      c.abort();
      return c.signal;
    }
    const controller = new AbortController();
    const abort = () => controller.abort();
    sig1.addEventListener('abort', abort, { once: true });
    sig2.addEventListener('abort', abort, { once: true });
    return controller.signal;
  }

  // ---------------------------------------------------------------------------
  // State Graph
  // ---------------------------------------------------------------------------

  const workflow = new StateGraph<WebExpertAgentState>({
    channels: {
      messages: {
        value: (_x: BaseMessage[], y: BaseMessage[]) => y,
        default: () => [],
      },
      mode: {
        value: (_x: WebExpertMode, y: WebExpertMode) => y,
        default: () => 'auto' as WebExpertMode,
      },
      context: {
        value: (_x: string[], y: string[]) => y,
        default: () => [],
      },
      sources: {
        value: (x: string[], y: string[]) => [...new Set([...x, ...y])],
        default: () => [],
      },
      commandHint: {
        value: (_x: CommandHint | undefined, y: CommandHint | undefined) => y,
        default: () => undefined as CommandHint | undefined,
      },
    },
  });

  // ---------------------------------------------------------------------------
  // Command prefix → context focus mapping
  // ---------------------------------------------------------------------------

  const COMMAND_FOCUS: Record<string, string> = {
    '/protocols': 'Focus on HTTP, WebSocket, gRPC, GraphQL, and transport protocols. Use the Default depth tier unless the user indicates otherwise.',
    '/security': 'Focus on TLS, OAuth, CORS, CSP, OWASP, cryptography, and web security. Use the Default depth tier unless the user indicates otherwise.',
    '/standards': 'Focus on RFCs, W3C specs, WHATWG standards, OpenAPI, and API design. Use the Default depth tier unless the user indicates otherwise.',
    '/api': 'Focus on REST, GraphQL, gRPC, and AsyncAPI design guidance. Use the Default depth tier unless the user indicates otherwise.',
    '/help': "Respond with the complete commands list and what each does, then stop. Use the GFM table from the prompt's ## Commands section verbatim. Do not answer any other question in the same response.",
    '/eli5': 'Use the Quick depth tier per ## Audience & Depth Tiers. Plain English, no jargon, one analogy if helpful, skip RFC citations.',
    '/deep': 'Use the Deep depth tier per ## Audience & Depth Tiers. Walk through the spec section by section, include edge cases, comparison tables, and multiple examples.',
  };

  /**
   * Detect command prefixes (e.g. `/protocols How does HTTP/2 work?`) and
   * Detect command prefixes and strip the prefix from the message while adding
   * a context-focus hint.
   *
   * Argument-bearing commands handled before the COMMAND_FOCUS loop:
   * - /rfc <n>       — Look up a specific RFC by number (1–5 digits)
   * - /status <code> — HTTP status code lookup (100–599)
   * - /header <name> — HTTP header explanation
   * - /method <verb> — HTTP method explanation (uppercase verb required, e.g. PATCH)
   * - /trending      — Fetch trending web/dev topics from Hacker News
   */
  const routeNode = async (
    state: WebExpertAgentState,
  ): Promise<Partial<WebExpertAgentState>> => {
    const lastMessage = state.messages[state.messages.length - 1];
    const text = lastMessage?.content?.toString().trim() ?? '';

    // --- Argument-bearing commands (processed before COMMAND_FOCUS loop) ---

    // /rfc <n>
    if (text.startsWith('/rfc')) {
      const match = text.match(/^\/rfc\s+(\d{1,5})\b/);
      if (match) {
        const n = match[1];
        console.info(`[WebExpert/route] command matched: /rfc ${n}`);
        return {
          messages: [
            ...state.messages.slice(0, -1),
            new HumanMessage(`Explain RFC ${n}: cite the abstract, key sections, and relationships to other RFCs.`),
          ],
          context: [`Focus on RFC ${n}. Cite section numbers.`],
          commandHint: { kind: 'rfc', arg: n },
        };
      }
      return {
        context: ['User invoked /rfc with an invalid argument. Reply with the correct syntax and a one-line example: /rfc <number> (e.g., /rfc 9110).'],
      };
    }

    // /status <code>
    if (text.startsWith('/status')) {
      const match = text.match(/^\/status\s+([1-5]\d{2})\b/);
      if (match) {
        const code = match[1];
        console.info(`[WebExpert/route] command matched: /status ${code}`);
        return {
          messages: [
            ...state.messages.slice(0, -1),
            new HumanMessage(`Explain HTTP status code ${code}: meaning, RFC 9110 section, and typical use cases.`),
          ],
          context: [`Focus on HTTP status code ${code} per RFC 9110.`],
          commandHint: { kind: 'status', arg: code },
        };
      }
      return {
        context: ['User invoked /status with an invalid argument. Reply with the correct syntax and a one-line example: /status <code> (e.g., /status 429).'],
      };
    }

    // /header <name>
    if (text.startsWith('/header')) {
      const match = text.match(/^\/header\s+([A-Za-z][A-Za-z0-9-]*)\b/);
      if (match) {
        const name = match[1];
        console.info(`[WebExpert/route] command matched: /header ${name}`);
        return {
          messages: [
            ...state.messages.slice(0, -1),
            new HumanMessage(`Explain the HTTP header '${name}': purpose, syntax, RFC reference, and example values.`),
          ],
          context: [`Focus on HTTP header ${name}. Prefer RFC 9110/9111/9112/9113/9114 and MDN.`],
          commandHint: { kind: 'header', arg: name },
        };
      }
      return {
        context: ['User invoked /header with an invalid argument. Reply with the correct syntax and a one-line example: /header <name> (e.g., /header Cache-Control).'],
      };
    }

    // /method <verb>  (uppercase verb required, e.g. GET, POST, PATCH)
    if (text.startsWith('/method')) {
      const match = text.match(/^\/method\s+([A-Z]+)\b/);
      if (match) {
        const verb = match[1];
        console.info(`[WebExpert/route] command matched: /method ${verb}`);
        return {
          messages: [
            ...state.messages.slice(0, -1),
            new HumanMessage(`Explain the HTTP method ${verb}: semantics, safety, idempotency, and RFC 9110 section.`),
          ],
          context: [`Focus on HTTP method ${verb} per RFC 9110 §9.3.`],
          commandHint: { kind: 'method', arg: verb },
        };
      }
      return {
        context: ['User invoked /method with an invalid argument. Reply with the correct syntax and a one-line example: /method <VERB> (e.g., /method PATCH). Note: the verb must be uppercase.'],
      };
    }

    // /trending
    if (text === '/trending' || text.startsWith('/trending ')) {
      console.info('[WebExpert/route] command matched: /trending');
      return {
        messages: [
          ...state.messages.slice(0, -1),
          new HumanMessage('Summarize the current trending web/dev topics from Hacker News.'),
        ],
        context: ['Source: Hacker News front page. Trigger fetch.'],
        commandHint: { kind: 'trending' },
      };
    }

    // --- No-arg COMMAND_FOCUS commands ---

    for (const [prefix, focus] of Object.entries(COMMAND_FOCUS)) {
      if (text.startsWith(prefix)) {
        const stripped = text.slice(prefix.length).trim();
        console.info(`[WebExpert/route] command matched: ${prefix}`);
        // Replace the last message with the stripped text
        const updatedMessages = [
          ...state.messages.slice(0, -1),
          new HumanMessage(stripped || `Tell me about ${prefix.slice(1)}`),
        ];
        return {
          messages: updatedMessages,
          context: [focus],
        };
      }
    }

    // No prefix match — return empty update to preserve current state
    return {};
  };

  // ---------------------------------------------------------------------------
  // Query → category mapping for retrieve
  // ---------------------------------------------------------------------------

  /**
   * Maps query keywords to reference website categories for targeted retrieval.
   * Each entry maps a keyword (lowercased) to the category tags passed to webFetcher.search().
   */
  const QUERY_CATEGORY_KEYWORDS: Record<string, string[]> = {
    rfc: ['rfc', 'standards'],
    http: ['http', 'protocols', 'standards'],
    websocket: ['protocols', 'web'],
    grpc: ['protocols', 'api'],
    graphql: ['api', 'web'],
    tls: ['standards', 'protocols', 'security'],
    oauth: ['standards', 'security', 'web'],
    cors: ['security', 'http', 'web'],
    rest: ['rest', 'api', 'http'],
    openapi: ['api', 'rest'],
    dns: ['protocols', 'standards'],
    quic: ['protocols', 'standards'],
    fetch: ['fetch', 'web'],
    dom: ['dom', 'web'],
    html: ['html', 'web'],
    css: ['css', 'web'],
    crypto: ['web', 'standards', 'security'],
    // Additional common web technology keywords (FEAT-FP-WEX-005)
    cookie: ['http', 'web'],
    cache: ['http', 'web'],
    etag: ['http', 'standards'],
    redirect: ['http', 'standards'],
    sse: ['protocols', 'web'],
    webhook: ['api', 'web'],
    jwt: ['standards', 'security'],
    pkce: ['standards', 'security'],
    oidc: ['standards', 'security'],
    csp: ['security', 'web'],
    hsts: ['security', 'standards'],
    mime: ['http', 'standards'],
    multipart: ['http', 'standards'],
    proxy: ['http', 'standards'],
    cdn: ['http', 'web'],
    compression: ['http', 'standards'],
    hpack: ['protocols', 'standards'],
    qpack: ['protocols', 'standards'],
    mtls: ['security', 'standards'],
    webrtc: ['protocols', 'web'],
    webtransport: ['protocols', 'web'],
    mcp: ['protocols', 'api'],
  };

  /** RFC number pattern: "RFC 1234", "rfc1234", "RFC-1234". Global flag for matchAll. */
  const RFC_PATTERN = /\brfc[\s-]?(\d{1,5})\b/gi;

  /**
   * Detect categories relevant to the query by scanning for known keywords.
   */
  function detectCategories(query: string): string[] {
    const lowerQuery = query.toLowerCase();
    const categories = new Set<string>();
    for (const [keyword, cats] of Object.entries(QUERY_CATEGORY_KEYWORDS)) {
      if (lowerQuery.includes(keyword)) {
        for (const c of cats) { categories.add(c); }
      }
    }
    return [...categories];
  }

  /** Retrieve relevant context from the appropriate source */
  const retrieveNode = async (
    state: WebExpertAgentState,
  ): Promise<Partial<WebExpertAgentState>> => {
    const lastMessage = state.messages[state.messages.length - 1];
    const query = lastMessage?.content?.toString().trim() ?? '';

    const context: string[] = [...state.context];
    const sources: string[] = [];

    if (state.mode === 'web' || state.mode === 'auto') {
      const hint = state.commandHint;

      if (hint?.kind === 'trending') {
        // Fetch HN front page for /trending command
        try {
          const result = await webFetcher.fetchTrending();
          context.push(`[${result.title}] (${result.url})\n${result.content}`);
          sources.push(result.url);
        } catch (error) {
          console.warn('[WebExpert/retrieve] Failed to fetch HN trending:', error);
        }
      } else if (hint?.kind === 'status' && hint.arg) {
        // Fetch RFC 9110 to ground HTTP status code explanations
        try {
          const result = await webFetcher.fetchRfc('9110');
          context.push(`[RFC 9110 — HTTP Semantics] (${result.url})\n${result.content}`);
          sources.push(result.url);
        } catch (error) {
          console.warn('[WebExpert/retrieve] Failed to fetch RFC 9110 for status code lookup:', error);
        }
      } else if (hint?.kind === 'header' && hint.arg) {
        // Targeted search for an HTTP header
        try {
          const results = await webFetcher.search(hint.arg, ['http', 'web']);
          for (const result of results) {
            context.push(`[${result.title}] (${result.url})\n${result.content}`);
            sources.push(result.url);
          }
        } catch (error) {
          console.warn('[WebExpert/retrieve] Header search failed:', error);
        }
      } else if (hint?.kind === 'method' && hint.arg) {
        // Targeted search for an HTTP method
        try {
          const results = await webFetcher.search(hint.arg, ['http', 'standards']);
          for (const result of results) {
            context.push(`[${result.title}] (${result.url})\n${result.content}`);
            sources.push(result.url);
          }
        } catch (error) {
          console.warn('[WebExpert/retrieve] Method search failed:', error);
        }
      } else {
        // Default retrieval: multi-signal detection + keyword-based web search

        // Maximum RFC fetches per message (guards against N+1 fan-out).
        const MAX_RFC_FETCHES = 3;
        /**
         * Tracks RFC numbers fetched in this call — shared between explicit RFC
         * detection and status-code detection so RFC 9110 is never fetched twice.
         */
        const fetchedRfcNums = new Set<string>();

        // --- RFC detection: find all mentions, fetch up to MAX_RFC_FETCHES ---
        const rfcMatches = [...query.matchAll(RFC_PATTERN)]
          .map(m => m[1])
          .filter((n, i, arr) => arr.indexOf(n) === i); // dedup by number

        for (const rfcNum of rfcMatches.slice(0, MAX_RFC_FETCHES)) {
          try {
            const result = await webFetcher.fetchRfc(rfcNum);
            if (!sources.includes(result.url)) {
              context.push(`[RFC ${rfcNum}] ${result.title}\n${result.content}`);
              sources.push(result.url);
            }
            fetchedRfcNums.add(rfcNum);
          } catch (error) {
            console.warn(`[WebExpert/retrieve] Failed to fetch RFC ${rfcNum}:`, error);
          }
        }

        // --- Status-code detection: coalesce all detected codes into one RFC 9110 fetch ---
        const detectedCodes = detectStatusCodes(query);
        if (detectedCodes.length > 0) {
          console.info('[WebExpert/retrieve] detected status codes', { codes: detectedCodes });
          // Fetch RFC 9110 once — skip if already fetched by RFC detection or cap reached.
          if (!fetchedRfcNums.has('9110') && fetchedRfcNums.size < MAX_RFC_FETCHES) {
            try {
              const result = await webFetcher.fetchRfc('9110');
              if (!sources.includes(result.url)) {
                context.push(`[RFC 9110 — HTTP Semantics] (${result.url})\n${result.content}`);
                sources.push(result.url);
              }
              fetchedRfcNums.add('9110');
            } catch (error) {
              console.warn('[WebExpert/retrieve] Failed to fetch RFC 9110 for status codes:', error);
            }
          }
          context.push(`Status code(s) referenced: ${detectedCodes.join(', ')}. See RFC 9110 §15.`);
        }

        // --- Header-name detection: add context hint and augment search categories ---
        const detectedHeaders = detectHeaders(query);
        if (detectedHeaders.length > 0) {
          console.info('[WebExpert/retrieve] detected HTTP headers', { headers: detectedHeaders });
          context.push(`HTTP header(s) referenced: ${detectedHeaders.join(', ')}. Cite RFC and MDN.`);
        }

        // Build search categories (augmented by header detection).
        const categories = detectCategories(query);
        if (detectedHeaders.length > 0) {
          if (!categories.includes('http')) {categories.push('http');}
          if (!categories.includes('web')) {categories.push('web');}
        }

        // --- URL detection: fetch allowlisted URLs; note others per policy ---
        const MAX_URL_FETCHES = 2;
        const detectedUrlList = detectUrls(query);
        if (detectedUrlList.length > 0) {
          console.info('[WebExpert/retrieve] detected URLs', {
            urls: detectedUrlList.map(u => u.substring(0, 80)),
          });
        }

        for (const url of detectedUrlList.slice(0, MAX_URL_FETCHES)) {
          try {
            const result = await webFetcher.fetchUrl(url);
            if (!sources.includes(result.url)) {
              if (result.content) {
                context.push(`[${result.title}] (${result.url})\n${result.content}`);
              } else {
                context.push(
                  `User pasted external URL ${result.url}; not auto-fetched per allowlist policy. Ask the user if they want it fetched explicitly.`,
                );
              }
              sources.push(result.url);
            }
          } catch (error) {
            console.warn(`[WebExpert/retrieve] Failed to fetch URL ${url}:`, error);
          }
        }

        // --- Web search by detected categories ---
        try {
          const results = await webFetcher.search(query, categories.length > 0 ? categories : undefined);
          for (const result of results) {
            if (!sources.includes(result.url)) {
              context.push(`[${result.title}] (${result.url})\n${result.content}`);
              sources.push(result.url);
            }
          }
        } catch (error) {
          console.warn('[WebExpert/retrieve] Web search failed:', error);
        }
      }
    }

    return { context, sources };
  };

  /** Generate the final response with the LLM */
  const generateNode = async (
    state: WebExpertAgentState,
    config?: LangGraphRunnableConfig,
  ): Promise<Partial<WebExpertAgentState>> => {
    console.info('[WebExpert/generate] node entered', {
      messageCount: state.messages.length,
      contextCount: state.context.length,
      sourcesCount: state.sources.length,
    });

    const systemMessage = new SystemMessage(prompt);

    const contextStr =
      state.context.length > 0
        ? `\n\nRelevant context:\n${state.context.join('\n\n')}`
        : '';

    const sourcesStr =
      state.sources.length > 0
        ? `\n\nSources: ${state.sources.join(', ')}`
        : '';

    const messagesWithContext = [
      systemMessage,
      ...state.messages.slice(0, -1),
      new HumanMessage(
        state.messages[state.messages.length - 1].content + contextStr,
      ),
    ];

    // Merge the per-call timeout signal with the LangGraph outer signal.
    // Spreading config preserves LangGraph streaming callbacks so that
    // streamMode: 'messages' tokens are emitted correctly.
    const timeoutController = new AbortController();
    const timer = setTimeout(() => timeoutController.abort(), _llmTimeoutMs);
    try {
      const combinedSignal = config?.signal
        ? createCombinedSignal(config.signal as AbortSignal, timeoutController.signal)
        : timeoutController.signal;
      const callConfig = config
        ? { ...config, signal: combinedSignal }
        : { signal: combinedSignal };
      const response = await llm.invoke(messagesWithContext, callConfig as RunnableConfig);

      const rawContent = response.content;
      console.info('[WebExpert/generate] LLM response received', {
        rawContentType: typeof rawContent,
        isArray: Array.isArray(rawContent),
        contentLength: typeof rawContent === 'string' ? rawContent.length : JSON.stringify(rawContent).length,
        contentPreview: typeof rawContent === 'string'
          ? rawContent.substring(0, 120)
          : JSON.stringify(rawContent).substring(0, 120),
      });

      let responseContent = typeof rawContent === 'string'
        ? rawContent
        : (rawContent?.toString() ?? '');
      if (sourcesStr) {
        responseContent += sourcesStr;
      }

      // Capture in closure so chat() can read it directly
      _lastGenerateContent = responseContent;

      return { messages: [...state.messages, new AIMessage(responseContent)] };
    } finally {
      clearTimeout(timer);
    }
  };

  // ---------------------------------------------------------------------------
  // Graph wiring
  // ---------------------------------------------------------------------------

  workflow.addNode('route', routeNode);
  workflow.addNode('retrieve', retrieveNode);
  workflow.addNode('generate', generateNode);

  workflow.addEdge(START, 'route' as any);
  workflow.addEdge('route' as any, 'retrieve' as any);
  workflow.addEdge('retrieve' as any, 'generate' as any);
  workflow.addEdge('generate' as any, END);

  const app = workflow.compile();

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  return {
    /**
     * Send a message and stream the response.
     *
     * @param sessionMessages Previous messages for context
     * @param userMessage     The new user message
     * @param mode            Retrieval mode override (default: 'auto')
     */
    async *chat(
      sessionMessages: ChatMessage[],
      userMessage: string,
      signal?: AbortSignal,
      mode: WebExpertMode = 'auto',
    ): AsyncGenerator<ChatChunk> {
      const messageId = `msg-${Date.now()}`;
      let chunkIndex = 0;

      console.info('[WebExpertAgent] chat start', {
        messageId,
        historyLength: sessionMessages.length,
        messagePreview: userMessage.substring(0, 80),
        mode,
      });

      try {
        const messages: BaseMessage[] = sessionMessages.map((msg) => {
          if (msg.role === 'user') {
            return new HumanMessage(msg.content);
          }
          if (msg.role === 'assistant') {
            return new AIMessage(msg.content);
          }
          return new SystemMessage(msg.content);
        });

        messages.push(new HumanMessage(userMessage));

        console.info('[WebExpertAgent] invoking LangGraph (invoke mode)', { messageId });
        const streamStartTime = Date.now();

        // Reset closure before invoke so we capture only this call's output
        _lastGenerateContent = '';

        // Use invoke() to run the full graph.
        const result = await app.invoke(
          { messages, mode },
          { ...(signal && { signal }) } as RunnableConfig,
        );

        // Primary: use the closure-captured content from generateNode.
        // Fallback: try extracting from the invoke result's messages state.
        let content = _lastGenerateContent;

        if (!content) {
          // Fallback: extract from LangGraph state (may be unreliable)
          const lastMessage = result.messages?.[result.messages.length - 1];
          const rawContent = lastMessage?.content;
          content = typeof rawContent === 'string'
            ? rawContent
            : (rawContent?.toString() ?? '');
          if (content) {
            console.info('[WebExpertAgent] content from state fallback', {
              messageId,
              messageCount: result.messages?.length ?? 0,
              lastMessageType: lastMessage?.constructor?.name ?? 'unknown',
              contentLength: content.length,
            });
          }
        }

        console.info('[WebExpertAgent] chat complete', {
          messageId,
          elapsedMs: Date.now() - streamStartTime,
          contentLength: content.length,
          contentSource: _lastGenerateContent ? 'closure' : 'state-fallback',
        });

        if (content) {
          yield { id: `chunk-${chunkIndex++}`, content, done: false, messageId };
        }

        yield { id: `chunk-${chunkIndex}`, content: '', done: true, messageId };
      } catch (error) {
        const isAbortError = error instanceof Error && error.name === 'AbortError';

        // Intentional cancellation from the caller — clean exit, no error chunk.
        if (isAbortError && signal?.aborted) {
          console.info('[WebExpertAgent] chat cancelled by caller signal');
          return;
        }

        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error('[WebExpertAgent] chat error', {
          messageId,
          error: errMsg,
          errorType: error instanceof Error ? error.constructor.name : typeof error,
          chunksBeforeError: chunkIndex,
        });

        // Replace the opaque browser AbortError message with a human-readable timeout message.
        // This fires when the internal per-call LLM timeout (_llmTimeoutMs) expires.
        const displayError = isAbortError
          ? `LLM request timed out after ${_llmTimeoutMs / 1_000}s — the model may be loading or unresponsive`
          : errMsg;

        yield {
          id: 'chunk-error',
          content: '',
          done: true,
          messageId,
          error: displayError,
        };
      }
    },

    /**
     * Get available retrieval modes.
     * 'local' mode (vector store) is deferred — only 'web' and 'auto' are active.
     */
    getModes(): WebExpertMode[] {
      return ['web', 'auto'];
    },

    /** Get the active settings */
    getSettings(): Partial<ArenaSettings> {
      return mergedSettings;
    },
  };
}
