#!/usr/bin/env npx tsx
/**
 * The Revoked demo server — one process, three surfaces:
 *
 *   1. A REAL MCP server (Streamable HTTP at POST /mcp) whose `wallet_send`
 *      tool is gated by the SHIPPED withKyaOs delegation middleware, with
 *      revocation resolved from the cheqd DLR on Cosmos testnet. Point
 *      mcp-inspector at it — nothing demo-specific in the gate.
 *   2. Act API routes (/api/*) the demo page uses. The "agent sends" route
 *      exercises the exact same wrapped handler the MCP surface uses.
 *   3. The static act page (web/).
 *
 * Low-level SDK `Server` (not McpServer.registerTool): delegation-protected
 * tools receive `_kyaos_delegation` as a tool argument, and registerTool's
 * zod validation would strip it (see examples/consent-basic in @kya-os/mcp).
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { Hono } from 'hono';
import { getRequestListener } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import {
  createKyaOsMiddleware,
  BitstringManager,
  type DelegationCredential,
  type KyaOsMiddleware,
} from '@kya-os/mcp';
import {
  cryptoProvider,
  env,
  requiredEnv,
  gzipCompressor,
  gzipDecompressor,
  loadIssuerIdentity,
  makeFetchProvider,
  statusListUrl,
} from './lib/wiring.js';
import { makeJwkSynthesizingDidResolver } from './lib/verifier.js';
import { CheqdDlrStatusListResolver } from './cheqd-statuslist-resolver.js';
import { fetchLatestStatusList } from './statuslist-ops.js';
import { revokeIndex, type RevokePhase } from './revoke.js';
import { issueDelegationAt } from './issue-delegation.js';
import { runAgentSend } from './agent.js';
import {
  agentAddress,
  agentBalanceNcheq,
  extractSpendCapNcheq,
  toNcheq,
  walletSend,
  NCHEQ_PER_CHEQ,
} from './wallet-send-tool.js';

const PORT = Number(env('DEMO_PORT', '4949'));
const VAR_DIR = path.resolve(process.cwd(), 'var');
const ACTIVE_INDEX_FILE = path.join(VAR_DIR, 'active-index');
const SPARE_MAX = 120; // 131072-bit list; burn as many rehearsal indices as needed

// ---------------------------------------------------------------------------
// Active credential state (which status-list index the demo is running on)
// ---------------------------------------------------------------------------

function activeIndex(): number {
  if (!fs.existsSync(ACTIVE_INDEX_FILE)) return 95;
  return Number(fs.readFileSync(ACTIVE_INDEX_FILE, 'utf-8').trim() || '95');
}

function setActiveIndex(index: number): void {
  fs.mkdirSync(VAR_DIR, { recursive: true });
  fs.writeFileSync(ACTIVE_INDEX_FILE, String(index));
}

function activeCredential(): DelegationCredential {
  const file = path.join(VAR_DIR, `delegation-${activeIndex()}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(`No credential at ${file} — run: npm run issue:delegation -- --index ${activeIndex()}`);
  }
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as DelegationCredential;
}

// ---------------------------------------------------------------------------
// KYA-OS middleware with the ON-CHAIN status list resolver
// ---------------------------------------------------------------------------

const identity = loadIssuerIdentity();
const fetchProvider = makeFetchProvider();

/**
 * Build the KYA-OS gate: middleware + the wrapped wallet_send handler.
 *
 * Rebuilt from scratch after every on-chain revocation: the shipped
 * DelegationCredentialVerifier caches VALID verdicts for 60s (cacheTtl
 * default) and the middleware exposes no way to bust it — without a rebuild,
 * a just-revoked credential keeps authorizing until the cache lapses.
 * (Filed for upstream: expose cacheTtl / a bust hook in KyaOsDelegationConfig.)
 */
function buildGate(): { kyaos: KyaOsMiddleware; walletSendHandler: ReturnType<KyaOsMiddleware['wrapWithDelegation']> } {
  const didResolver = makeJwkSynthesizingDidResolver(fetchProvider);
  const statusListResolver = new CheqdDlrStatusListResolver({
    fetchProvider,
    didResolver,
    cryptoProvider,
    expectedIssuerDid: identity.did,
    compressor: gzipCompressor,
    decompressor: gzipDecompressor,
    cacheTtlMs: 5_000,
  });

  const kyaos: KyaOsMiddleware = createKyaOsMiddleware(
    {
      identity: {
        did: identity.did,
        kid: identity.kid,
        privateKey: identity.privateKeyBase64,
        publicKey: requiredEnv('CHEQD_PUBLIC_KEY_BASE64'),
      },
      autoSession: true,
      delegation: {
        didResolver,
        statusListResolver,
        // Subject-bound, not bearer: the caller must present a per-request
        // proof signed by the delegation SUBJECT's did:key. A stolen
        // credential without the agent's key → holder_binding_failed.
        holderBinding: 'enforce',
      },
    },
    cryptoProvider,
  );

  const walletSendHandler = kyaos.wrapWithDelegation(
    'wallet_send',
    {
      scopeId: 'payments.transfer',
      consentUrl: env('CONSENT_URL', 'https://poc.kya-os.ai/consent'),
    },
    kyaos.wrapWithProof('wallet_send', async (args: Record<string, unknown>) => {
      // The gate has verified signature + scope + ON-CHAIN revocation by the
      // time we are here. The spend cap comes out of the same credential.
      const cap = extractSpendCapNcheq(activeCredential());
      const requested = toNcheq(String(args['amount'] ?? ''));

      if (requested > cap) {
        return {
          isError: true,
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: 'SCOPE_CONSTRAINT_VIOLATED',
              message: `Requested ${requested} ncheq exceeds the credential's cap of ${cap} ncheq (${cap / NCHEQ_PER_CHEQ} CHEQ). The cap is cryptographic — it lives in the signed credential, not in app config.`,
            }),
          }],
        };
      }

      const result = await walletSend({
        amountNcheq: requested,
        ...(typeof args['to'] === 'string' && args['to'] ? { to: args['to'] } : {}),
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
      };
    }),
  );

  return { kyaos, walletSendHandler };
}

let gate = buildGate();

// ---------------------------------------------------------------------------
// MCP surface (Streamable HTTP) — inspector-compatible
// ---------------------------------------------------------------------------

function createMcpServer(): Server {
  const server = new Server(
    { name: 'revoked-dc34', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      gate.kyaos.kyaOsTool,
      {
        name: 'wallet_send',
        description:
          'Send CHEQ from the agent wallet on cheqd testnet. Requires a KYA-OS delegation with scope payments.transfer; revocation is resolved from the on-chain StatusList2021 DLR.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            amount: { type: 'string', description: 'Amount in CHEQ' },
            to: { type: 'string', description: 'Recipient (optional; defaults to the demo treasury)' },
          },
          required: ['amount'],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const { name, arguments: args = {} } = request.params;
    const sessionId = extra?.sessionId;
    if (name === '_kyaos') return gate.kyaos.handleKyaOs(args as Record<string, unknown>);
    if (name === 'wallet_send') return gate.walletSendHandler(args as Record<string, unknown>, sessionId);
    return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
  });

  return server;
}

// ---------------------------------------------------------------------------
// Act API + static page (Hono)
// ---------------------------------------------------------------------------

const app = new Hono();

app.get('/api/state', async (c) => {
  const url = statusListUrl(identity.did);
  const index = activeIndex();
  let bit: boolean | null = null;
  try {
    const list = await fetchLatestStatusList(fetchProvider, url, { bust: true });
    const bits = await BitstringManager.decode(list.credentialSubject.encodedList, gzipCompressor, gzipDecompressor);
    bit = bits.getBit(index);
  } catch {
    bit = null; // unreadable list renders as unknown — the gate itself fails closed
  }
  const vc = activeCredential();
  return c.json({
    issuerDid: identity.did,
    agentDid: vc.credentialSubject.id,
    agentAddress: await agentAddress(),
    balanceNcheq: (await agentBalanceNcheq()).toString(),
    statusListUrl: url,
    activeIndex: index,
    revoked: bit,
    capNcheq: extractSpendCapNcheq(vc).toString(),
    scope: 'payments.transfer',
    expires: vc.expirationDate ?? null,
  });
});

app.post('/api/act/send', async (c) => {
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const amount = String((body as Record<string, unknown>)['amount'] ?? '1');
  const forge = Boolean((body as Record<string, unknown>)['forge']);
  // The console is only a control plane: this drives THE AGENT — a real MCP
  // client that connects to our own /mcp over Streamable HTTP and presents
  // credential + holder proof. Identical to running `npm run agent` in a
  // terminal.
  const outcome = await runAgentSend({
    amount,
    forge,
    serverUrl: `http://localhost:${PORT}/mcp`,
  });
  return c.json({
    elapsedMs: outcome.elapsedMs,
    result: outcome.result,
    agentDid: outcome.agentDid,
    via: 'mcp/streamable-http',
  });
});

app.post('/api/act/revoke', async (c) => {
  const phases: RevokePhase[] = [];
  const index = activeIndex();
  const result = await revokeIndex(index, { onPhase: (p) => phases.push(p) });
  gate = buildGate(); // fresh verifier — no 60s cached-valid verdict survives
  return c.json({ index, phases, ...result });
});

app.post('/api/act/reset', async (c) => {
  const next = activeIndex() + 1;
  if (next > SPARE_MAX) {
    return c.json({
      error: `Out of spare indices (95–${SPARE_MAX}). Publish a fresh list (npm run publish:statuslist -- --force) and re-issue.`,
    }, 409);
  }
  const file = path.join(VAR_DIR, `delegation-${next}.json`);
  if (!fs.existsSync(file)) await issueDelegationAt(String(next));
  setActiveIndex(next);
  gate = buildGate();
  return c.json({ activeIndex: next });
});

app.use('/*', serveStatic({ root: './web' }));

// ---------------------------------------------------------------------------
// One HTTP server: /mcp → MCP transport, everything else → Hono
// ---------------------------------------------------------------------------

const honoListener = getRequestListener(app.fetch);

const httpServer = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  if (url.pathname === '/mcp' && req.method === 'POST') {
    const server = createMcpServer();
    // stateless mode: no sessionIdGenerator
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on('close', () => transport.close());
    await server.connect(transport);
    await transport.handleRequest(req, res);
    return;
  }
  await honoListener(req, res);
});

httpServer.listen(PORT, () => {
  console.log(`Revoked demo server: http://localhost:${PORT}`);
  console.log(`  act page:  http://localhost:${PORT}/`);
  console.log(`  MCP:       http://localhost:${PORT}/mcp`);
  console.log(`  issuer:    ${identity.did}`);
  console.log(`  list:      ${statusListUrl(identity.did)}`);
  console.log(`  active ix: ${activeIndex()}`);
});
