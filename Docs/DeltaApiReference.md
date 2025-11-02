# Delta Exchange API Reference

Based on the provided documentation, this is a comprehensive reference for the Delta Exchange API v2.

## Base URLs

- **Production**: `https://api.india.delta.exchange`
- **Testnet (Demo Account)**: `https://cdn-ind.testnet.deltaex.org`

## Authentication

Delta Exchange requires authentication for all trading-related endpoints. Each authenticated request must include:

### Required Headers

```http
api-key: YOUR_API_KEY
signature: HEX_ENCODED_SIGNATURE
timestamp: UNIX_TIMESTAMP
User-Agent: YOUR_APP_NAME
Content-Type: application/json
```

### Signature Generation

The signature is generated using SHA256 HMAC with the following formula:

```
signature = HMAC_SHA256(api_secret, method + timestamp + path + query_string + payload)
```

**Important Notes:**

- Timestamp must be within 5 seconds of server time
- Both IPv4 and IPv6 addresses must be whitelisted for trading APIs
- API keys can be created with `Read Data` and/or `Trading` permissions

### Python Example

```python
import hashlib
import hmac
import time

def generate_signature(secret, message):
    message = bytes(message, 'utf-8')
    secret = bytes(secret, 'utf-8')
    hash = hmac.new(secret, message, hashlib.sha256)
    return hash.hexdigest()

# Usage
timestamp = str(int(time.time()))
method = 'GET'
path = '/v2/orders'
query_string = '?product_id=1&state=open'
payload = ''
signature_data = method + timestamp + path + query_string + payload
signature = generate_signature(api_secret, signature_data)
```

## Rate Limiting

- **Limit**: 10,000 requests per 5-minute window
- **Reset**: Every 5 minutes
- **Weight-based**: Different endpoints have different costs
- **Rate Limit Header**: `X-RATE-LIMIT-RESET` (milliseconds until reset)

### Endpoint Weights

| Weight | Endpoints |
|--------|-----------|
| 3 | Get Products, Orderbook, Tickers, Open Orders, Positions, Balances, OHLC Candles |
| 5 | Place/Edit/Delete Order, Add Position Margin |
| 10 | Order History, Fills, Transaction Logs |
| 25 | Batch Order APIs |

### Example Rate Limit Calculation

```
100 Get Open Orders = 100 × 3 = 300 weight
50 Get Balances = 50 × 3 = 150 weight  
200 Place Orders = 200 × 5 = 1000 weight
20 Batch Orders = 20 × 25 = 500 weight

Total: 1950 weight (within 10,000 limit)
```

## Response Format

All API responses follow a standardized format:

```json
{
  "success": true,
  "result": {},          // Response data
  "meta": {              // Optional metadata
    "after": "cursor",   // For pagination
    "before": null
  }
}
```

### Error Format

```json
{
  "success": false,
  "error": {
    "code": "insufficient_margin",
    "context": {
      "additional_margin_required": "0.121"
    }
  }
}
```

## Data Types

### Timestamps

- ISO 8601 format with microseconds
- Example: `2019-09-18T10:41:20Z`

### Numbers

- Big Decimal numbers returned as strings
- Integer numbers (contract size, product_id) returned as numbers

### IDs

- Most identifiers are big integers
- UUIDs accepted with or without dashes

## Public Endpoints

### Get Assets

```http
GET /v2/assets
```

Returns list of all supported assets.

### Get Indices  

```http
GET /v2/indices
```

Returns spot price indices used for futures and options contracts.

### Get Products

```http
GET /v2/products?contract_types=perpetual_futures,call_options,put_options&states=live
```

Returns available trading products with detailed specifications.

**Parameters:**

- `contract_types`: Comma-separated list (perpetual_futures, call_options, put_options)
- `states`: Comma-separated list (upcoming, live, expired, settled)
- `after`, `before`: Pagination cursors
- `page_size`: Page size (default: 100)

### Get Ticker

```http
GET /v2/tickers/{symbol}
```

Returns current market data for a specific symbol.

### Get Orderbook

```http
GET /v2/orderbook/{symbol}?depth=20
```

Returns orderbook data with configurable depth.

### Get Historical Candles

```http
GET /v2/history/candles?symbol=BTCUSD&resolution=1m&start=1640995200&end=1641081600
```

Returns OHLC candlestick data.

**Valid Resolutions:** `1m, 3m, 5m, 15m, 30m, 1h, 2h, 4h, 6h, 1d, 1w, 2w, 7d, 30d`

## Private Endpoints (Authentication Required)

### Get Open Orders

```http
GET /v2/orders?product_id=27&state=open
```

### Place Order

```http
POST /v2/orders
Content-Type: application/json

{
  "order_type": "limit_order",
  "size": 1,
  "side": "buy",
  "limit_price": "45000",
  "product_id": 27
}
```

### Cancel Order

```http
DELETE /v2/orders/{order_id}
```

### Get Positions

```http
GET /v2/positions
```

### Get Fills

```http
GET /v2/fills
```

### Get Balances

```http
GET /v2/wallet/balances
```

## Common Error Codes

### Authentication Errors

- `SignatureExpired`: Signature older than 5 seconds
- `InvalidApiKey`: API key not found or invalid
- `UnauthorizedApiAccess`: Insufficient permissions
- `ip_not_whitelisted_for_api_key`: IP not in whitelist
- `Signature Mismatch`: Incorrect signature generated

### Trading Errors  

- `insufficient_margin`: Not enough margin for order
- `invalid_order_size`: Order size outside limits
- `invalid_price`: Price outside allowed range
- `product_not_tradable`: Product currently not available for trading

## WebSocket API

### Connection URL

- **Production**: `wss://stream.india.delta.exchange/feed`
- **Testnet**: `wss://cdn-ind.testnet.deltaex.org/feed`

### Authentication

```json
{
  "type": "key-auth",
  "payload": {
    "api_key": "your_api_key",
    "signature": "signature",
    "timestamp": "timestamp"
  }
}
```

### Subscribe to Channels

```json
{
  "type": "subscribe",
  "payload": {
    "channels": [
      {
        "name": "ticker",
        "symbols": ["BTCUSD"]
      },
      {
        "name": "v2/user_trades", 
        "symbols": ["BTCUSD"]
      }
    ]
  }
}
```

## Public Channels

- `ticker`: Real-time ticker data
- `candlesticks`: OHLC candlestick updates
- `all_trades`: All public trades
- `orderbook`: Orderbook updates
- `indices`: Index price updates

## Private Channels (Authentication Required)

- `orders`: Order lifecycle updates
- `v2/user_trades`: User fill updates (recommended)
- `user_trades`: User fill updates (legacy)
- `positions`: Position updates  
- `margins`: Margin/wallet updates
- `portfolio_margins`: Portfolio margin updates

## Options Contract Symbols

Options follow this format:

```
{Type}-{Asset}-{Strike}-{Expiry}

Example: C-BTC-90000-310125
C = Call Option
BTC = Bitcoin
90000 = Strike price
310125 = Expiry date (31st Jan 2025)
```

## Product Contract Symbols

Perpetual futures follow this format:

```
{Asset1}{Asset2}

Examples:
BTCUSD, ETHUSD
```

## Pagination

For endpoints supporting pagination:

- Include `after` cursor from previous response for next page
- Include `before` cursor for previous page  
- Set `page_size` parameter for custom page sizes

Example:

```json
GET /v2/products?page_size=30&after=an_arbitrary_string
```

## Data Centers

- **Location**: AWS Tokyo
- **Compliance**: Delta Exchange India operates under Indian regulatory framework

## Implementation Notes

1. **Always handle rate limits** - Check for 429 responses and implement backoff
2. **Use proper error handling** - Different error types require different handling
3. **Validate inputs** - Client-side validation prevents unnecessary API calls
4. **Cache public data** - Reduce API calls by caching products, assets, and indices
5. **Use WebSocket for real-time** - More efficient than polling for live data
6. **Test on testnet first** - Always test trading logic on testnet before production

## Latest Updates

- **2025-10-08**: New WebSocket authentication method (`key-auth`)
- **2025-06-01**: Added `liquidation` reason for v2/user_trades
- **2024-10-18**: Added testnet endpoints
- **2024-05-01**: Added positions field to v2/user_trades
