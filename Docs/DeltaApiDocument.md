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
Websocket Feed
Websocket api can be used for the following use cases

Get real time feed of market data, this includes L2 orderbook and recent trades.
Get price feeds - Mark prices of different contracts, price feed of underlying indexes etc.
Get account specific notifications like fills, liquidations, ADL and PnL updates.
Get account specific updates on orders, positions and wallets.
Websocket url for Delta Exchange

Production - wss://socket.india.delta.exchange
Testnet(Demo Account) - wss://socket-ind.testnet.deltaex.org
There is a limit of 150 connections every 5 minutes per IP address. A connection attempt that goes beyond the limit will be disconnected with 429 HTTP status error. On receiving this error, wait for 5 to 10 minutes before making new connection requests.

You will be disconnected, if there is no activity within 60 seconds after making connection.

Subscribing to Channels
Subscribe
To begin receiving feed messages, you must first send a subscribe message to the server indicating which channels and contracts to subscribe for.

To specify contracts within each channel, just pass a list of symbols inside the channel payload. Mention ["all"] in symbols if you want to receive updates across all the contracts. Please note that snapshots are sent only for specified symbols,meaning no snapshots are sent for symbol: "all".

Once a subscribe message is received the server will respond with a subscriptions message that lists all channels you are subscribed to. Subsequent subscribe messages will add to the list of subscriptions.

Subscription Sample

// Request: Subscribe to BTCUSD and ETHUSD with the ticker and orderbook(L2) channels.
{
    "type": "subscribe",
    "payload": {
        "channels": [
            {
                "name": "v2/ticker",
                "symbols": [
                    "BTCUSD",
                    "ETHUSD"
                ]
            },
            {
                "name": "l2_orderbook",
                "symbols": [
                    "BTCUSD"
                ]
            },
            {
                "name": "funding_rate",
                "symbols": [
                    "all"
                ]
            }
        ]
    }
}

// Response: Success
{
    "type": "subscriptions",
    "channels": [
        {
            "name": "l2_orderbook",
            "symbols": [
                "BTCUSD"
            ],
        },
        {
            "name": "v2/ticker",
            "symbols": [
                "BTCUSD",
                "ETHUSD"
            ]
        },
        {
            "name": "funding_rate",
            "symbols": [
                "all"
            ]
        }
    ]
}

// Response: Error
{
    "type": "subscriptions",
    "channels": [
        {
            "name": "l2_orderbook",
            "symbols": [
                "BTCUSD"
            ],
        },
        {
            "name": "trading_notifications",
            "error": "subscription forbidden on trading_notifications. Unauthorized user"
        }
    ]
}
Unsubscribe
If you want to unsubscribe from channel/contracts pairs, send an "unsubscribe" message. The structure is equivalent to subscribe messages. If you want to unsubscribe for specific symbols in a channel, you can pass it in the symbol list. As a shorthand you can also provide no symbols for a channel, which will unsubscribe you from the channel entirely.

Unsubscribe Sample

// Request: Unbubscribe from BTCUSD and ETHUSD with the ticker and orderbook(L2) channels.
{
    "type": "unsubscribe",
    "payload": {
        "channels": [
            {
                "name": "v2/ticker",          // unsubscribe from ticker channel only for BTCUSD
                "symbols": [
                    "BTCUSD"
                ]
            },
            {
                "name": "l2_orderbook"      // unsubscribe from all symbols for l2_orderbook channel
            }
        ]
    }
}
Authenticating
Current method
Authentication allows clients to subscribe to user account related trading notifications using private channels like positions, orders, etc. This allows users to get real-time updates related to their orders, fills, liquidations, adl and pnl updates.

# auth message with signed request

import websocket
import hashlib
import hmac
import time

api_key = 'a207900b7693435a8fa9230a38195d'
api_secret = '7b6f39dcf660ec1c7c664f612c60410a2bd0c258416b498bf0311f94228f'

def generate_signature(secret, message):
    message = bytes(message, 'utf-8')
    secret = bytes(secret, 'utf-8')
    hash = hmac.new(secret, message, hashlib.sha256)
    return hash.hexdigest()

# Get open orders

method = 'GET'
timestamp = str(int(time.time()))
path = '/live'
signature_data = method + timestamp + path
signature = generate_signature(api_secret, signature_data)

ws = websocket.WebSocketApp('wss://socket.india.delta.exchange')

ws.send(json.dumps({
    "type": "key-auth",
    "payload": {
        "api-key": api_key,
        "signature": signature,
        "timestamp": timestamp
    }
}))

ws.send(json.dumps({
    "type": 'unauth',
    "payload": {}
}))
Note: For users migrating from older authentication method, the change is: "type" in request payload must be changed from "auth" to "key-auth". Rest of the request payload will remain the same. The response payloads have major changes. Check below for the response payloads.

To authenticate, you must send a request of type 'key-auth' on your socket connection. Authentication request is a json of the format:
{"type":"key-auth","payload":{"api-key":"#KEY#","timestamp":#TIMESTAMP#,"signature":"#SIGNATURE#"}}
KEY here is your API-key string.
TIMESTAMP is current epoch Unix timestamp in seconds as a number.
SIGNATURE is hash string of HMAC created using 'GET' + string(TIMESTAMP) + '/live' and your API-secret.
Note: Same timestamp must be used for TIMESTAMP and in generating SIGNATURE.

Refer to the right side for a sample code.

Authentication Responses
All authentication responses will be json containing following keys:
"type" will always be "key-auth"
"success" is a boolean indicating whether the authentication was a success or failure.
"status_code" is number just like HTTP response status.
"status" is a string describing the response status.
"message" is a string which may be present describing authentication failure reason.

Success response:
{"type":"key-auth", "success":true, "status_code":200, "status":"authenticated"}

Error responses:

Lacking 'api-key' or 'sign' or 'timestamp' in the payload:
{"type":"key-auth", "success":false, "status_code":400, "status":"incomplete_payload", "message":"Incomplete payload"}

Request received after 5 secs:
{"type":"key-auth", "success":false, "status_code":408, "status":"request_expired", "message":"Timestamp header outside of allowed time window"}}

ApiKey does not exist:
{"type":"key-auth", "success":false, "status_code":404, "status":"api_key_not_found", "message":"ApiKey not found"}}

Invalid/wrong Signature:
{"type":"key-auth", "success":false, "status_code":401, "status":"invalid_signature", "message":"Invalid Signature"}

IP address not whitelisted for the API-key:
{"type":"key-auth", "success":false, "status_code":401, "status":"ip_not_whitelisted", "message":"IP address not whitelisted. Your IP: 172.16.19.91"}

Some internal server error:
{"type":"key-auth", "success":false, "status_code":500, "status":"internal_server_error", "message": "Internal Server Error. Code: 1001"

Old method
Note: This method of authentication will stop working from 31st December 2025.

Authentication allows clients to receives private messages, like trading notifications. Examples of the trading notifications are: fills, liquidations, adl and pnl updates.

To authenticate, you need to send a signed request of type 'auth' on your socket connection. Check the authentication section above for more details on how to sign a request using api key and secret.

The payload for the signed request will be 'GET' + timestamp + '/live'

To subscribe to private channels, the client needs to first send an auth event, providing api-key, and signature.

To unsubscribe from all private channels, just send a 'unauth' message on the socket. This will automatically unsubscribe the connection from all authenticated channels.

Sample Python Code
Public Channels
Summary: The python script(right panel) connects to the Delta Exchange WebSocket to receive real-time market data.

It opens a connection.
Subscribes to v2/ticker(tickers data) and candlestick_1m(1 minute ohlc candlesticks) channels. (MARK:BTCUSD - mark price ohlc in candlesticks channel)
When data arrives, it processes and prints it.
If an error occurs, it prints an error message.
If the connection closes, it notifies the user.
The connection remains open indefinitely to keep receiving updates.
import websocket
import json

# production websocket base url

WEBSOCKET_URL = "wss://socket.india.delta.exchange"

def on_error(ws, error):
    print(f"Socket Error: {error}")

def on_close(ws, close_status_code, close_msg):
    print(f"Socket closed with status: {close_status_code} and message: {close_msg}")

def on_open(ws):
  print(f"Socket opened")

# subscribe tickers of perpetual futures - BTCUSD & ETHUSD, call option C-BTC-95200-200225 and put option - P-BTC-95200-200225

  subscribe(ws, "v2/ticker", ["BTCUSD", "ETHUSD", "C-BTC-95200-200225", "P-BTC-95200-200225"])

# subscribe 1 minute ohlc candlestick of perpetual futures - MARK:BTCUSD(mark price) & ETHUSD(ltp), call option C-BTC-95200-200225(ltp) and put option - P-BTC-95200-200225(ltp)

  subscribe(ws, "candlestick_1m", ["MARK:BTCUSD", "ETHUSD", "C-BTC-95200-200225", "P-BTC-95200-200225"])

def subscribe(ws, channel, symbols):
    payload = {
        "type": "subscribe",
        "payload": {
            "channels": [
                {
                    "name": channel,
                    "symbols": symbols
                }
            ]
        }
    }
    ws.send(json.dumps(payload))

def on_message(ws, message):
    # print json response
    message_json = json.loads(message)
    print(message_json)

if **name** == "**main**":
  ws = websocket.WebSocketApp(WEBSOCKET_URL, on_message=on_message, on_error=on_error, on_close=on_close)
  ws.on_open = on_open
  ws.run_forever() # runs indefinitely
Private Channels
Summary: The python script(right panel) connects to the Delta Exchange WebSocket to receive real-time market data.

It opens a connection.
Sends authentication payload over socket with api_key, signature & timestamp.
When authentication update arrives, it checks for success and then sends subscription for orders and positions channels for all contracts.
Prints all other updates in json format.
If an error occurs, it prints an error message.
If the connection closes, it notifies the user.
The connection remains open indefinitely to keep receiving updates.
import websocket
import hashlib
import hmac
import json
import time

# production websocket base url and api keys/secrets

WEBSOCKET_URL = "wss://socket.india.delta.exchange"
API_KEY = 'a207900b7693435a8fa9230a38195d'
API_SECRET = '7b6f39dcf660ec1c7c664f612c60410a2bd0c258416b498bf0311f94228f'

def on_error(ws, error):
    print(f"Socket Error: {error}")

def on_close(ws, close_status_code, close_msg):
    print(f"Socket closed with status: {close_status_code} and message: {close_msg}")

def on_open(ws):
    print(f"Socket opened")
    # api key authentication
    send_authentication(ws)

def send_authentication(ws):
    method = 'GET'
    timestamp = str(int(time.time()))
    path = '/live'
    signature_data = method + timestamp + path
    signature = generate_signature(API_SECRET, signature_data)
    ws.send(json.dumps({
        "type": "key-auth",
        "payload": {
            "api-key": API_KEY,
            "signature": signature,
            "timestamp": timestamp
        }
    }))

def generate_signature(secret, message):
    message = bytes(message, 'utf-8')
    secret = bytes(secret, 'utf-8')
    hash = hmac.new(secret, message, hashlib.sha256)
    return hash.hexdigest()

def on_message(ws, json_message):
    message = json.loads(json_message)
    # subscribe private channels after successful authentication
    if message['type'] == 'key-auth':
        if message['success']:
            print("Authentication successful")
            # subscribe orders channel for order updates for all contracts
            subscribe(ws, "orders", ["all"])
            # subscribe positions channel for position updates for all contracts
            subscribe(ws, "positions", ["all"])
        else:
            print("Authentication failed")
            print(message)
    else:
        print(json_message)

def subscribe(ws, channel, symbols):
    payload = {
        "type": "subscribe",
        "payload": {
            "channels": [
                {
                    "name": channel,
                    "symbols": symbols
                }
            ]
        }
    }
    ws.send(json.dumps(payload))

if **name** == "**main**":
  ws = websocket.WebSocketApp(WEBSOCKET_URL, on_message=on_message, on_error=on_error, on_close=on_close)
  ws.on_open = on_open
  ws.run_forever() # runs indefinitely
Detecting Connection Drops
Some client libraries might not detect connection drops properly. We provide two methods for the clients to ensure they are connected and getting subscribed data.

Heartbeat (Recommended)
The client can enable heartbeat on the socket. If heartbeat is enabled, the server is expected to periodically send a heartbeat message to the client. Right now, the heartbeat time is set to 30 seconds.

How to Implement on client side
Enable heartbeat (check sample code) after each successful socket connection
Set a timer with duration of 35 seconds (We take 5 seconds buffer for heartbeat to arrive).
When you receive a new heartbeat message, you reset the timer
If the timer is called, that means the client didn't receive any heartbeat in last 35 seconds. In this case, the client should exit the existing connection and try to reconnect.
// Enable Heartbeat on successful connection
ws.send({
    "type": "enable_heartbeat"
})

// Disable Heartbeat
ws.send({
    "type": "disable_heartbeat"
})

// Sample Heartbeat message received periodically by client
{
    "type": "heartbeat"
}
Ping/Pong
The client can periodically (~ every 30 seconds) send a ping frame or a raw ping message and the server will respond back with a pong frame or a raw pong response. If the client doesn't receive a pong response in next 5 seconds, the client should exit the existing connection and try to reconnect.

// Ping Request
ws.send({
    "type": "ping"
})

// Pong Response
ws.send({
    "type": "pong"
})
Public Channels
v2 ticker
The ticker channel provides price change data for the last 24 hrs (rolling window).
It is published every 5 seconds.

To subscribe to the ticker channel, you need to send the list of symbols for which you would like to receive updates.

You can also subscribe to ticker updates for a category of products by sending a list of category names.
For example, to receive updates for put options and futures, use the following format:
{"symbols": ["put_options", "futures"]}

If you would like to subscribe to all listed contracts, pass:
{ "symbols": ["all"] }

Important:
If you subscribe to the ticker channel without specifying a symbols list, you will not receive any data.

Ticker Sample

// Subscribe to specific symbol
{
    "type": "subscribe",
    "payload": {
        "channels": [
            {
                "name": "v2/ticker",
                "symbols": [
                    "BTCUSD"
                ]
            }
        ]
    }
}

// Subscribe to all symbols
{
    "type": "subscribe",
    "payload": {
        "channels": [
            {
                "name": "v2/ticker",
                "symbols": [
                    "all"
                ]
            }
        ]
    }
}
// Response
{
    "open": 0.00001347, // The price at the beginning of the 24-hour period
    "close": 0.00001327, // The price at the end of the 24-hour period
    "high": 0.00001359, // The highest price during the 24-hour period
    "low": 0.00001323, // The lowest price during the 24-hour period
    "mark_price": "0.00001325", // The current market price
    "mark_change_24h": "-0.1202", // Percentage change in market price over the last 24 hours
    "oi": "812.6100", // Open interest, indicating the total number of outstanding contracts
    "product_id": 27, // The unique identifier for the product
    "quotes": {
        "ask_iv": "0.25", // Implied volatility for the ask price (if available)
        "ask_size": "922", // The size of the ask (the amount available for sale)
        "best_ask": "3171.5", // The best ask price (the lowest price at which the asset is being offered)
        "best_bid": "3171.4", // The best bid price (the highest price a buyer is willing to pay)
        "bid_iv": "0.25", // Implied volatility for the bid price (if available)
        "bid_size": "191", // The size of the bid (the amount a buyer is willing to purchase)
        "impact_mid_price": "61200", // Mid price impact, if available (the price midpoint between the best bid and ask)
        "mark_iv": "0.29418049" // Mark volatility (volatility of the asset used for mark price calculation)
    },
    "greeks": { // Options-related metrics, will be null for Futures and Spot products
        "delta": "0.01939861", // Rate of change of the option price with respect to the underlying asset's price
        "gamma": "0.00006382", // Rate of change of delta with respect to the underlying asset's price
        "rho": "0.00718630", // Rate of change of option price with respect to interest rate
        "spot": "63449.5", // The current spot price of the underlying asset
        "theta": "-81.48397021", // Rate of change of option price with respect to time (time decay)
        "vega": "0.72486575" // Sensitivity of the option price to volatility changes
    },
    "size": 1254631, // Number of contracts traded
    "spot_price": "0.00001326", // Spot price at the time of the ticker
    "symbol": "BTCUSD", // The symbol of the contract
    "timestamp": 1595242187705121, // The timestamp of the data (in microseconds)
    "turnover": 16.805033569999996, // The total turnover in the settling symbol
    "turnover_symbol": "BTC", // The symbol used for settling
    "turnover_usd": 154097.09108233, // The turnover value in USD
    "volume": 1254631 // Total volume, defined as contract value * size
}
l1_orderbook
l1_orderbook channel provides level1 orderbook updates. You need to send the list of symbols for which you would like to subscribe to L1 orderbook. You can also subscribe to orderbook updates for category of products by sending category-names. For example: to receive updates for put options and futures, refer this: {"symbols": ["put_options", "futures"]}. If you would like to subscribe for all the listed contracts, pass: { "symbols": ["all"] }. Please note that if you subscribe to L1 channel without specifying the symbols list, you will not receive any data.
Publish interval: 100 millisecs
Max interval (in case of same data): 5 secs

L1 Orderbook Sample

//Subscribe
{
    "type": "subscribe",
    "payload": {
        "channels": [
            {
                "name": "l1_orderbook",
                "symbols": [
                    "ETHUSD"
                ]
            }
        ]
    }
}
// l1 orderbook Response
{
  "ask_qty":"839",
  "best_ask":"1211.3",
  "best_bid":"1211.25",
  "bid_qty":"772",
  "last_sequence_no":1671603257645135,
  "last_updated_at":1671603257623000,
  "product_id":176,"symbol":"ETHUSD",
  "timestamp":1671603257645134,
  "type":"l1_orderbook"
}
l2_orderbook
l2_orderbook channel provides the complete level2 orderbook for the sepecified list of symbols at a pre-determined frequency. The frequency of updates may vary for different symbols. You can only subscribe to upto 20 symbols on a single connection. Unlike L1 orderbook channel, L2 orderbook channel does not accept product category names or "all" as valid symbols. Please note that if you subscribe to L2 channel without specifying the symbols list, you will not receive any data.
Publish interval: 1 sec
Max interval (in case of same data): 10 secs

L2 Orderbook Sample

//Subscribe
{
    "type": "subscribe",
    "payload": {
        "channels": [
            {
                "name": "l2_orderbook",
                "symbols": [
                    "ETHUSD"
                ]
            }
        ]
    }
}
// l2 orderbook Response
{
  "type":"l2_orderbook",
  "symbol":"ETHUSD",
  "product_id": 176,
  "buy": [
    {
        "limit_price":"101.5",
        "size":10,              // For Futures & Options: number of contracts integer. Spot product: Asset token quantity in string.
        "depth":"10"            // total size from best bid
    },
  ],
  "sell": [
    {
        "limit_price":"102.0",
        "size":20,
        "depth":"20"            // total size from best ask
    },
  ],
  "last_sequence_no": 6435634,
  "last_updated_at": 1671600133884000,
  "timestamp":1671600134033215,
}
l2_updates
l2_updates channel provides initial snapshot and then incremental orderbook data. The frequency of updates may vary for different symbols. You can only subscribe to upto 100 symbols on a single connection. l2_updates channel does not accept product category names or "all" as valid symbols. Please note that if you subscribe to l2_updates channel without specifying the symbols list, you will not receive any data.
Publish interval: 100 millisecs
"action"="update" messages wont be published till there is an orderbook change.

//Subscribe
{
    "type": "subscribe",
    "payload": {
        "channels": [
            {
                "name": "l2_updates",
                "symbols": [
                    "BTCUSD"
                ]
            }
        ]
    }
}

// Initial snapshot response
{
  "action":"snapshot",
  "asks":[["16919.0", "1087"], ["16919.5", "1193"], ["16920.0", "510"]],
  "bids":[["16918.0", "602"], ["16917.5", "1792"], ["16917.0", "2039"]],
  "timestamp":1671140718980723,
  "sequence_no":6199,
  "symbol":"BTCUSD",
  "type":"l2_updates",
  "cs":2178756498
}

// Incremental update response
{
  "action":"update",
  "asks":[["16919.0", "0"], ["16919.5", "710"]],
  "bids":[["16918.5", "304"]],
  "sequence_no":6200,
  "symbol":"BTCUSD",
  "type":"l2_updates",
  "timestamp": 1671140769059031,
  "cs":3409694612
}

// Error response
{
  "action":"error",
  "symbol":"BTCUSD",
  "type":"l2_updates",
  "msg":"Snapshot load failed. Verify if product is live and resubscribe after a few secs."
}
How to maintain orderbook locally using this channel:

1) When you subscribe to this channel, the first message with "action"= "snapshot" resembles the complete l2_orderbook at this time. "asks" and "bids" are arrays of ["price", "size"]. (size is number of contracts at this price)

2) After the initial snapshot, messages will be with "action" = "update", resembling the difference between current and previous orderbook state. "asks" and "bids" are arrays of ["price", "new size"]. "asks" are sorted in increasing order of price. "bids" are sorted in decreasing order of price. This is true for both "snapshot" and "update" messages.

3) "sequence_no" field must be used to check if any messages were dropped. "sequence_no" must be +1 of the last message.
e.g. In the snapshot message it is 6199, and the update message has 6200. The next update message must have 6201. In case of sequence_no mismatch, resubscribe to the channel, and start from the beginning.

4) If sequence_no is correct, edit the in-memory orderbook using the "update" message.
Case 1: price already exists, new size is 0 -> Delete this price level.
Case 2: price already exists, new size isn't 0 -> Replace the old size with new size.
Case 3: price doesn’t exists -> insert the price level.
e.g. for the shown snapshot and update messages to create the new orderbook: in the ask side, price level of "16919.0" will be deleted. Size at price level "16919.5" will be changed from "1193" to "710". In the bids side there was no price level of "16918.5", so add a new level of "16918.5" of size "304". Other price levels from the snapshot will remain the same.

5) If "action":"error" message is received, resubscribe this symbol after a few seconds. Can occur in rare cases, e.g. Failed to send "action":"snapshot" message after subscribing due to a race condition, instead an "error" message will be sent.

Checksum: Using this, users can verify the accuracy of orderbook data created using l2_updates. checksum is the "cs" key in the message payload.
Steps to calculate checksum:

1) Edit the old in-memory orderbook with the "update" message received.
2) Create asks_string and bids_string as shown below. where priceN = price at Nth level, sizeN = size at Nth level. Asks are sorted in increasing order and bids in decreasing order by price.
asks_string = price0:size0,price1:size1,…,price9:size9
bids_string = price0:size0,price1:size1,…,price9:size9
checksum_string = asks_string + "|" + bids_string
Only consider the first 10 price levels on both sides. If orderbook as less than 10 levels, use only them.
e.g. If after applying the update, the new orderbook becomes ->
asks = [["100.00", "23"], ["100.05", "34"]]
bids = [["99.04", "87"], ["98.65", "102"], ["98.30", "16"]]
checksum_string = "100.00:23,100.05:34|99.04:87,98.65:102,98.30:16"
3) Calculate the CRC32 value (32-bit unsigned integer) of checksum_string. This should be equal to the checksum provided in the “update” message.

all_trades
all_trades channel provides a real time feed of all trades (fills). You need to send the list of symbols for which you would like to subscribe to all trades channel. After subscribing to this channel, you get a snapshot of last 50 trades and then trade data in real time. You can also subscribe to all trades updates for category of products by sending category-names. For example: to receive updates for put options and futures, refer this: {"symbols": ["put_options", "futures"]}. If you would like to subscribe for all the listed contracts, pass: { "symbols": ["all"] }. Please note that if you subscribe to all_trades channel without specifying the symbols list, you will not receive any data.

All Trades Sample

//Subscribe
{
    "type": "subscribe",
    "payload": {
        "channels": [
            {
                "name": "all_trades",
                "symbols": [
                    "BTCUSD"
                ]
            }
        ]
    }
}
// All Trades Response Snapshot
{
    "symbol": "BTCUSD",
    "type": "all_trades_snapshot",          // "type" is not "all_trades"
    "trades": [                             // Recent trades list
        {
            "buyer_role": "maker",
            "seller_role": "taker",
            "size": 53,                     // size in contracts
            "price": "25816.5",
            "timestamp": 1686577411879974   // time of the trade.
        },
         // More recent trades.
    ]
}
// All Trades Response
{
    "symbol": "BTCUSD",
    "price": "25816.5",
    "size": 100,
    "type": "all_trades",
    "buyer_role": "maker",
    "seller_role": "taker",
    "timestamp": 1686577411879974
}
mark_price
mark_price channel provides mark price updates at a fixed interval. This is the price on which all open positions are marked for liquidation.Please note that the product symbol is prepended with a "MARK:" to subscribe for mark price.
You need to send the list of symbols for which you would like to subscribe to mark price channel. You can also subscribe to mark price updates for category of products by sending category-names. For example: to receive updates for put options and futures, refer this: {"symbols": ["put_options", "futures"]}.
If you would like to subscribe for all the listed contracts, pass: { "symbols": ["all"] }.
You can also subscribe to a Options chain, by passing 'Asset-Expiry', e.g. {"symbols": ["BTC-310524"] } will subscribe to all BTC Options expirying on 31st May 2024.
Please note that if you subscribe to mark price channel without specifying the symbols list, you will not receive any data.
Publish interval: 2 secs.

Mark Price Sample

//Subscribe
{
    "type": "subscribe",
    "payload": {
        "channels": [
            {
                "name": "mark_price",
                "symbols": [
                    "MARK:C-BTC-13000-301222"
                ]
            }
        ]
    }
}
// Mark Price Response
{
    "ask_iv":null,
    "ask_qty":null,
    "best_ask":null,
    "best_bid":"9532",
    "bid_iv":"5.000",
    "bid_qty":"896",
    "delta":"0",
    "gamma":"0",
    "implied_volatility":"0",
    "price":"3910.088012",
    "price_band":{"lower_limit":"3463.375340559572217228510815","upper_limit":"4354.489445440427782771489185"},
    "product_id":39687,
    "rho":"0",
    "symbol":"MARK:C-BTC-13000-301222",
    "timestamp":1671867039712836,
    "type":"mark_price",
    "vega":"0"
}
candlesticks
This channel provides last ohlc candle for given time resolution. Traded price candles and Mark Price candles data can be received by sending appropriate symbol string. "product_symbol" gives traded_price candles, and "MARK:product_symbol" gives mark_price candles.
e.g. symbols: ["BTCUSD"] gives you Traded Price candlestick data for BTCUSD
symbols: ["MARK:C-BTC-75000-310325"] gives you Mark Price candlestick data for C-BTC-75000-310325
for options tick data ,dont use "MARK"
Subscribe to candlestick_${resolution} channel for updates.

List of supported resolutions ["1m","3m","5m","15m","30m","1h","2h","4h","6h","12h","1d","1w"]

You need to send the list of symbols for which you would like to subscribe to candlesticks channel. You can also subscribe to candlesticks updates for category of products by sending category-names. For example: to receive updates for put options and futures, refer this: {"symbols": ["put_options", "futures"]}. Please note that if you subscribe to candlesticks channel without specifying the symbols list, you will not receive any data.
