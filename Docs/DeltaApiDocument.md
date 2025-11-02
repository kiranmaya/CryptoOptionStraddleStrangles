# Delta Exchange India API Quick Reference

## Scope

- Concise reference for the Delta Exchange India REST v2 and WebSocket APIs.
- Focuses on production (`api.india.delta.exchange`) and the matching testnet; the global host `api.delta.exchange` is not compatible.
- Designed as an LLM-friendly summary of behaviour, required headers, and high-signal endpoints.

## Environments

| Environment | REST host | WebSocket host | Notes |
| --- | --- | --- | --- |
| Production | `https://api.india.delta.exchange` | `wss://socket.india.delta.exchange` | Infrastructure located in AWS Tokyo. |
| Testnet (Demo) | `https://cdn-ind.testnet.deltaex.org` | `wss://socket-ind.testnet.deltaex.org` | Use demo API keys only. |

Append `/v2/...` to the REST host for all endpoints. Examples in this document default to production; swap in the testnet host when testing.

## Key Concepts

**Assets and products**

- *Assets* are currencies; each has an integer `id` and short `symbol` (BTC, USDC, INR, etc.).
- *Underlying asset* drives contract payoff; *quoting asset* denominates contract prices; *settling asset* denominates margin and P&L.
- *Products* are derivatives identified by numeric `product_id` (for example `27`) and `symbol` (`BTCUSD`).
- Product types include `perpetual_futures`, dated futures, and options (`call_options`, `put_options`).

**Symbol formats**

- Perpetuals/futures: `<UNDERLYING><QUOTE>` or `<UNDERLYING><QUOTE>_<DDMMMYY>` for dated futures (e.g., `BTCUSD`, `ETHUSD_JAN25`).
- Options: `<C|P>-<UNDERLYING>-<STRIKE>-<DDMMYY>` (e.g., `C-BTC-90000-310125`).
- Mark price tickers prefix the product symbol with `MARK:` (e.g., `MARK:BTCUSD`).
- Index price symbols follow `.DE<UNDERLYING><QUOTE>` (BTCUSD index is `.DEXBTUSD`).

**Pricing references**

- *Mark price* determines liquidation and PnL marking.
- *Index price* is a weighted average of constituent spot exchanges and feeds mark prices and settlement.

## Data Conventions

- Timestamps default to ISO 8601 with microseconds in REST, or integer microseconds in WebSocket payloads.
- Decimal numbers are returned as strings to preserve precision; send decimals as strings to avoid rounding drift.
- Boolean flags use lowercase `true`/`false`.
- Nominal response structure: `{ "success": true, "result": ..., "meta": {...} }`.

## Pagination

- Cursor-based with `page_size`, `after`, and `before` parameters.
- Use `meta.after` or `meta.before` from the response in the next request.
- Supported on: `/v2/products`, `/v2/orders`, `/v2/orders/history`, `/v2/fills`, `/v2/wallet/transactions`.

## Authentication & Signing

**Required headers**

- `api-key`: your API key.
- `timestamp`: Unix epoch seconds, must be within 5 seconds of server time.
- `signature`: HMAC SHA-256 of `METHOD + TIMESTAMP + PATH + QUERY + BODY` (strings concatenated exactly as transmitted).
- `User-Agent`: mandatory; send a meaningful value (for example `python-3.12`).
- `Content-Type: application/json` when including a body.

**Signature workflow**

1. Build `path` (e.g., `/v2/orders`), `query_string` (empty string if there are no query params), and raw JSON `payload` string.
2. Concatenate uppercase HTTP method + timestamp string + path + query_string + payload.
3. Compute `HMAC_SHA256(secret, prehash)` and use the lowercase hex digest as `signature`.
4. Send the same timestamp in the header and signature input.
5. Signatures older than 5 seconds are rejected with `SignatureExpired`.

**Python helper**

```python
import hashlib, hmac, json, time, requests

BASE_URL = "https://api.india.delta.exchange"
API_KEY = "YOUR_API_KEY"
API_SECRET = "YOUR_API_SECRET"

def sign_request(method, path, params=None, body=None):
    params = params or {}
    body = body or {}
    query = ""
    if params:
        query = "?" + "&".join(f"{k}={v}" for k, v in params.items())
    payload = json.dumps(body, separators=(",", ":")) if body else ""
    timestamp = str(int(time.time()))
    prehash = f"{method.upper()}{timestamp}{path}{query}{payload}"
    signature = hmac.new(API_SECRET.encode(), prehash.encode(), hashlib.sha256).hexdigest()
    headers = {
        "api-key": API_KEY,
        "timestamp": timestamp,
        "signature": signature,
        "User-Agent": "python-requests",
        "Content-Type": "application/json",
    }
    return headers, payload
```

**Key management tips**

- Keys are environment-specific; demo keys only work on testnet, production keys only on production.
- Permissions: `Read Data` for market data, `Trading` for orders/positions/wallet.
- IP allow-listing is enforced when configured; rejected requests return `ip_not_whitelisted_for_api_key`.
- `client_order_id` maximum length is 32 characters.

## Rate Limits

- Default quota: 10,000 weight units per fixed 5-minute window (resets on the minute). Response header `X-RATE-LIMIT-RESET` reports remaining milliseconds.
- Unauthenticated REST calls are limited per IP; authenticated calls are limited per user.
- Matching engine operations: 500 operations per second per product (batch orders count each child order).
- Representative REST weight schedule:

| Weight | Applies to |
| --- | --- |
| 3 | `GET /v2/products`, `GET /v2/l2orderbook/{symbol}`, `GET /v2/tickers`, `GET /v2/orders`, `GET /v2/positions`, `GET /v2/wallet/balances`, `GET /v2/history/candles` |
| 5 | `POST/PUT/DELETE /v2/orders`, `POST /v2/positions/change_margin` |
| 10 | `GET /v2/orders/history`, `GET /v2/fills`, `GET /v2/wallet/transactions` |
| 25 | Batch order endpoints (`/v2/orders/batch`, `/v2/orders/bracket`) |

Endpoints not listed consume weight 1 unless noted otherwise. Contact `support@delta.exchange` to discuss higher quotas.

## Common Error Responses

| Error | Example payload | Probable cause | Fix |
| --- | --- | --- | --- |
| `SignatureExpired` | `{ "error": "SignatureExpired" }` | Timestamp older than 5 seconds. | Sync clock with NTP, recompute signature immediately before sending. |
| `InvalidApiKey` | `{ "error": "InvalidApiKey" }` | Key deleted or wrong environment. | Confirm key exists in the chosen environment; double-check copy/paste. |
| `UnauthorizedApiAccess` | `{ "error": "UnauthorizedApiAccess" }` | Missing permission (Read Data / Trading). | Edit key permissions or create a new key with required scopes. |
| `ip_not_whitelisted_for_api_key` | `{ "code": "ip_not_whitelisted_for_api_key" }` | Request from non-whitelisted IP. | Add the outbound IP (IPv4 or IPv6) in API Management. |
| `Forbidden` | `{ "error": "Forbidden", "message": "Request blocked by CDN" }` | Missing mandatory headers or blocked network. | Provide a `User-Agent`, ensure traffic originates from an allowed network. |
| `Signature Mismatch` | `{ "code": "Signature Mismatch" }` | Prehash string differs from the transmitted request. | Validate HTTP method, path, query order, and JSON encoding; reuse the exact body for signing. |

## REST API Overview

Base path: `https://api.india.delta.exchange/v2`. The testnet host uses the same paths.

### Public data (no authentication)

| Method | Path | Weight | Notes |
| --- | --- | --- | --- |
| GET | `/assets` | 1 | Asset metadata and deposit/withdrawal status. |
| GET | `/indices` | 1 | Underlying index definitions and constituents. |
| GET | `/products` | 3 | Active products; supports filters (`contract_types`, `states`, etc.). |
| GET | `/products/{symbol}` | 1 | Single product detail by symbol. |
| GET | `/tickers` | 3 | 24h stats across contracts; filter by product type or expiry. |
| GET | `/tickers/{symbol}` | 3 | Ticker for a single contract. |
| GET | `/l2orderbook/{symbol}` | 3 | Depth snapshot for a product. |
| GET | `/trades/{symbol}` | 1 | Most recent public trades. |
| GET | `/history/candles` | 3 | Historical OHLC (resolutions exclude 7d/2w/30d). |
| GET | `/history/sparklines` | 1 | Micro timeframe sparkline data. |
| GET | `/stats` | 1 | Exchange-wide statistics (open interest, volume). |

### Trading & order management (authentication required)

| Method | Path | Weight | Notes |
| --- | --- | --- | --- |
| POST | `/orders` | 5 | Create single order (market, limit, stop, bracket). |
| PUT | `/orders` | 5 | Amend order size/price/flags. |
| DELETE | `/orders` | 5 | Cancel by `id` or `client_order_id`. |
| GET | `/orders` | 3 | List open orders (supports filtering). |
| GET | `/orders/{order_id}` | 3 | Fetch one order by numeric ID. |
| GET | `/orders/client_order_id/{client_oid}` | 3 | Fetch by client-provided ID. |
| GET | `/orders/history` | 10 | Historical orders across states. |
| DELETE | `/orders/all` | 5 | Cancel all open orders (optional filters). |
| POST | `/orders/batch` | 25 | Submit up to 50 orders in one call (same contract). |
| PUT | `/orders/batch` | 25 | Amend multiple orders in bulk. |
| DELETE | `/orders/batch` | 25 | Cancel multiple orders by IDs. |
| POST | `/orders/bracket` | 25 | Create main order with attached stop/take-profit legs. |
| PUT | `/orders/bracket` | 25 | Modify existing bracket legs. |

### Positions & risk controls

| Method | Path | Weight | Notes |
| --- | --- | --- | --- |
| GET | `/positions` | 3 | Lightweight positions (size, entry price). |
| GET | `/positions/margined` | 3 | Full margin details (liq price, bankruptcy price). |
| POST | `/positions/change_margin` | 5 | Adjust isolated margin on a position. |
| POST | `/positions/close_all` | 5 | Market-close every open position (supports filters). |
| PUT | `/positions/auto_topup` | 5 | Toggle isolated position auto-top-up per product. |
| PUT | `/users/margin_mode` | 1 | Switch between cross and isolated margin. |
| PUT | `/users/update_mmp` | 1 | Configure Market Maker Protection thresholds. |
| PUT | `/users/reset_mmp` | 1 | Manually reset MMP breach state. |
| GET | `/products/{product_id}/orders/leverage` | 1 | View leverage configuration per product. |
| POST | `/products/{product_id}/orders/leverage` | 1 | Update user leverage for a product. |

### Account, wallet, and preferences

| Method | Path | Weight | Notes |
| --- | --- | --- | --- |
| GET | `/profile` | 1 | Basic account details. |
| GET | `/sub_accounts` | 1 | List linked sub-accounts. |
| GET | `/users/trading_preferences` | 1 | Retrieve order defaults (post-only, reduce-only, etc.). |
| PUT | `/users/trading_preferences` | 1 | Update trading preferences. |
| GET | `/wallet/balances` | 3 | Wallet balances and available margin by asset. |
| GET | `/wallet/transactions` | 10 | Ledger of deposits, withdrawals, funding, fees. |
| GET | `/wallet/transactions/download` | 10 | CSV export of wallet transactions. |
| POST | `/wallets/sub_account_balance_transfer` | 1 | Move funds between parent/sub-accounts. |
| GET | `/wallets/sub_accounts_transfer_history` | 1 | History of internal transfers. |

### Reporting and utilities

| Method | Path | Weight | Notes |
| --- | --- | --- | --- |
| GET | `/fills` | 10 | Execution fills with pagination. |
| GET | `/fills/history/download/csv` | 10 | CSV export of fills. |
| GET | `/heartbeat` | 1 | List configured deadman heartbeats (requires `user_id`). |
| POST | `/heartbeat/create` | 1 | Create a deadman switch policy. |
| POST | `/heartbeat` | 1 | Acknowledge an active heartbeat (`ttl` resets). |

## Deadman Switch (Heartbeat)

- Configure with `POST /v2/heartbeat/create`, specifying impacted contracts (`contract_types`, `underlying_assets`, `product_symbols`) and remediation (`cancel_orders`, spreads, etc.).
- Acknowledge within the defined interval using `POST /v2/heartbeat` and optional `ttl` override.
- Query active policies via `GET /v2/heartbeat?user_id=...`.
- Missing acknowledgements trigger the configured action automatically (for example, cancelling outstanding orders).

## WebSocket API

**Why use it**

- Stream market data (order books, trades, mark prices).
- Receive account-level updates (orders, positions, fills, balances).
- Lower latency than polling REST endpoints.

### Connection rules

- One subscription protocol for both environments (see Environments table).
- Maximum 150 new connections per IP per 5-minute window; additional attempts return HTTP 429.
- Server disconnects idle sockets after 60 seconds without traffic.
- Supports server heartbeats (`enable_heartbeat`) or client ping/pong.

### Subscribe / unsubscribe

```json
{
  "type": "subscribe",
  "payload": {
    "channels": [
      { "name": "v2/ticker", "symbols": ["BTCUSD", "ETHUSD"] },
      { "name": "l2_orderbook", "symbols": ["BTCUSD"] }
    ]
  }
}
```

- Pass `symbols` for symbol-scoped channels; `["all"]` is accepted only on channels that explicitly allow it (snapshots are omitted when using `"all"`).
- Use `{"type":"unsubscribe", ...}` with the same structure to stop feeds. Omitting `symbols` unsubscribes the entire channel.

### Authentication (`key-auth`)

```json
{
  "type": "key-auth",
  "payload": {
    "api-key": "<YOUR_KEY>",
    "timestamp": 1731420800,
    "signature": "<HMAC_of_GET+timestamp+/live>"
  }
}
```

- Signature prehash: `GET + timestamp + /live`.
- Timestamp tolerance ±5 seconds; reuse the same timestamp in signature and payload.
- Success response: `{"type":"key-auth","success":true,"status":"authenticated","status_code":200}`.
- Deprecated `{"type":"auth", ...}` method retires after 31 Dec 2025.

### Keepalive options

- `{"type":"enable_heartbeat"}`: server emits `{"type":"heartbeat"}` roughly every 30 seconds; reset a 35s watchdog timer on receipt.
- Client-originated ping: send `{"type":"ping"}` roughly every 30 seconds; expect `{"type":"pong"}`. Reconnect if no pong arrives within ~5 seconds.

### Public channels

- `v2/ticker`: 24h ticker every ~5 seconds; accepts symbols or product categories (e.g., `["futures"]`, `["put_options"]`).
- `l1_orderbook`: Best bid/ask snapshots at ~100 ms (max 5 s if unchanged); supports symbols, categories, or `["all"]`.
- `l2_orderbook`: Full depth snapshots every ~1 s; maximum 20 symbols per connection; symbols only.
- `l2_updates`: Initial snapshot plus incremental depth updates; maximum 100 symbols per connection; symbols only.
- `all_trades`: Snapshot of the last 50 trades followed by live prints; supports categories or `["all"]`.
- `mark_price`: Streaming mark prices; subscribe with `["MARK:BTCUSD"]` style symbols.
- `candlestick_<resolution>`: Latest OHLC candle per resolution (e.g., `candlestick_1m`, `candlestick_5m`). Use `MARK:<symbol>` for mark-price candles.
- `spot_price`: Underlying index price feed; symbols are required.
- `spot_30mtwap_price`: 30-minute TWAP of index prices; symbols required.
- `funding_rate`: Current and predicted funding for perpetual contracts; supports `["all"]` or symbol lists.
- `product_updates`: Trading status changes, auctions, and market disruptions; no symbols parameter.
- `announcements`: Exchange-wide maintenance and bulletin messages; no symbols parameter.

### Private channels (require `key-auth`)

- `margins`: Wallet balances and blocked margin per asset.
- `portfolio_margins`: Portfolio margin metrics per index (2-second cadence).
- `positions`: Snapshot plus incremental position changes; supports categories or `["all"]`.
- `orders`: Order lifecycle events (`create`, `update`, `delete`) with `reason` fields (`fill`, `stop_trigger`, `liquidation`, etc.); supports categories or `["all"]`.
- `user_trades`: Fills with commission data; supports categories or `["all"]`.
- `v2/user_trades`: Low-latency fills without commission data; includes `sequence_id` for gap detection and `reason` (`adl`, `liquidation`, etc.).
- `mmp_trigger`: Alerts when Market Maker Protection trips; no symbols required.

## SDKs and Tooling

- Official REST clients available for Python and Node.js via Delta Exchange developer resources.
- CCXT is an authorised SDK; Delta Exchange India is supported through the CCXT integration.
- Swagger (OpenAPI) specification is published in the Delta Exchange documentation portal.

## Support

- Trading and quota requests: `support@delta.exchange`.
- Follow Delta Exchange responsible disclosure guidelines before probing production systems.

 <https://cdn.india.deltaex.org/web/options/info>>
gives  dates
{
    "result": [
        {
            "contract_type": "call_options",
            "data": [
                {
                    "asset": "BTC",
                    "settlement_time": [
                        "2025-11-02T12:00:00Z",
                        "2025-11-03T12:00:00Z",
                        "2025-11-04T12:00:00Z",
                        "2025-11-07T12:00:00Z",
                        "2025-11-14T12:00:00Z",
                        "2025-11-21T12:00:00Z",
                        "2025-11-28T12:00:00Z",
                        "2025-12-26T12:00:00Z"
                    ]
                },
