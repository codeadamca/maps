# Shopify Webhook Endpoint

## Endpoint

```
POST /shopify/webhook
```

## Purpose

Session-based webhook receiver for Shopify events. Manages the full lifecycle of a user journey from initial cart through order fulfillment or cancellation.

**Supported Topics**:
- `orders/create` - New order placed
- `orders/paid` - Payment completed (design IDs extracted)
- `orders/fulfilled` - Order shipped
- `orders/cancelled` - Order cancelled
- `carts/create` - Cart created
- `carts/update` - Cart updated

## Headers

- `X-Shopify-Topic`: Webhook topic (e.g., `orders/create`)
- `X-Shopify-Webhook-Id`: Unique webhook ID from Shopify (idempotency key)

## Request

**Headers**:
```
POST /shopify/webhook HTTP/1.1
X-Shopify-Topic: orders/create
X-Shopify-Webhook-Id: gid://shopify/WebhookEventBridge/abc123
Content-Type: application/json
```

**Body**: Complete Shopify webhook JSON payload

## Response

```json
{
  "success": true,
  "topic": "orders/create",
  "session_id": 42
}
```

## Database Schema

### sessions table

Tracks the full user journey: cart → order → payment → fulfillment

```sql
id (BIGINT, auto_increment, primary key)

shopify_order_id (BIGINT, NULL, UNIQUE)
cart_token (VARCHAR(255), NULL, UNIQUE)

status (VARCHAR(20), default='session')
  /*
  Values:
  - session    (user browsing or cart activity)
  - created    (order created in Shopify)
  - paid       (payment completed, design_ids extracted)
  - fulfilled  (order shipped)
  - cancelled  (order cancelled)
  */

currency (VARCHAR(10), NULL)
total_price (DECIMAL(10,2), NULL)
email (VARCHAR(255), NULL)

design_ids (JSON, NULL)           -- Array of design IDs (from orders/paid)
shopify_payload (JSON, NULL)      -- Most recent webhook payload

created_at (TIMESTAMP, default=CURRENT_TIMESTAMP)
updated_at (TIMESTAMP, auto-update)

Indexes:
  - idx_shopify_order_id (shopify_order_id)
  - idx_cart_token (cart_token)
  - idx_status (status)
```

### session_events table

Immutable audit log of all webhooks received. Prevents duplicate processing.

```sql
id (BIGINT, auto_increment, primary key)

webhook_id (VARCHAR(255), UNIQUE)  -- Shopify's webhook ID
topic (VARCHAR(100))

shopify_order_id (BIGINT, NULL)
cart_token (VARCHAR(255), NULL)

payload (JSON)                       -- Full webhook payload

created_at (TIMESTAMP, default=CURRENT_TIMESTAMP)

Indexes:
  - idx_webhook_id (webhook_id)
  - idx_shopify_order_id (shopify_order_id)
  - idx_cart_token (cart_token)
  - idx_topic (topic)
```

## Processing Flow

### STEP 1: Resolve or Create Session

Extract identifiers from payload:
- If topic is `orders/*`: Extract `shopify_order_id` from `data.id`
- If topic is `carts/*`: Extract `cart_token` from `data.token`

Find existing session by:
- `shopify_order_id` (if order webhook)
- `cart_token` (if cart webhook)

If no session found:
- INSERT new session with:
  - `status = 'session'`
  - `cart_token` or `shopify_order_id` (as applicable)
  - Initial `shopify_payload`

**Rule**: A session record MUST exist before any event is inserted.

### STEP 2: Check Idempotency

Query `session_events` for existing `webhook_id`.

If found: Return success immediately (duplicate detected).

If not found: Continue to Step 3.

### STEP 3: Insert Session Event

INSERT into `session_events`:
- `webhook_id` (from X-Shopify-Webhook-Id header)
- `topic` (from X-Shopify-Topic header)
- `shopify_order_id` (if available)
- `cart_token` (if available)
- `payload` (full webhook JSON)

**Rule**: Always insert event BEFORE updating session state.

### STEP 4: Update Session State

Based on topic, update `sessions` record:

| Topic | Status | Additional Updates |
|-------|--------|-------------------|
| `carts/create` | `session` | `shopify_payload` |
| `carts/update` | `session` | `shopify_payload` |
| `orders/create` | `created` | `shopify_order_id`, `currency`, `total_price`, `email`, `shopify_payload` |
| `orders/paid` | `paid` | Extract `design_ids`, store in `design_ids` column, update `shopify_payload` |
| `orders/fulfilled` | `fulfilled` | `shopify_payload` |
| `orders/cancelled` | `cancelled` | `shopify_payload` |

## Design ID Extraction

**Only extracted on `orders/paid` topic.**

From Shopify order payload:

```javascript
data.line_items[*].properties[*]
```

Algorithm:
1. Loop through `line_items` array
2. For each item, loop through `properties` array
3. If property `name === "design_id"`, collect the `value`
4. Store unique values as JSON array in `sessions.design_ids`

## Implementation Files

- **Route Handler**: `/api/routes/shopify_webhook.php`
- **Helper Functions**: `/api/functions.php`
  - `find_session()` - Query by shopify_order_id or cart_token
  - `create_session()` - Create new session record
  - `session_event_exists()` - Check idempotency
  - `insert_session_event()` - Insert webhook event
  - `update_session_by_topic()` - Update session state based on topic
  - `extract_design_ids()` - Extract design IDs from line_items
  - `find_session_by_cart_token()` - Query session by cart_token
- **Route Registration**: `/api/index.php` (POST /shopify/webhook)

## Examples

### Example: orders/create Webhook

**Request**:
```bash
curl -X POST https://api.lakelines.co/shopify/webhook \
  -H "X-Shopify-Topic: orders/create" \
  -H "X-Shopify-Webhook-Id: 12345-order-create" \
  -H "Content-Type: application/json" \
  -d '{
    "id": 9876543210,
    "order_number": 1001,
    "email": "customer@example.com",
    "currency": "USD",
    "total_price": "99.99",
    "financial_status": "authorized",
    "fulfillment_status": null,
    "line_items": [
      {
        "id": 1,
        "title": "Lake Mug",
        "properties": [
          { "name": "design_id", "value": "LL-ABC12345" }
        ]
      }
    ]
  }'
```

**Response**:
```json
{
  "success": true,
  "topic": "orders/create",
  "session_id": 42
}
```

**Session Updated**:
```sql
id: 42
shopify_order_id: 9876543210
cart_token: NULL
status: 'created'
currency: 'USD'
total_price: 99.99
email: 'customer@example.com'
design_ids: NULL  -- (not extracted yet, wait for orders/paid)
shopify_payload: { ... full payload ... }
```

### Example: orders/paid Webhook

**Request**:
```bash
curl -X POST https://api.lakelines.co/shopify/webhook \
  -H "X-Shopify-Topic: orders/paid" \
  -H "X-Shopify-Webhook-Id: 12345-order-paid" \
  -H "Content-Type: application/json" \
  -d '{
    "id": 9876543210,
    "order_number": 1001,
    "email": "customer@example.com",
    "currency": "USD",
    "total_price": "99.99",
    "financial_status": "paid",
    "fulfillment_status": null,
    "line_items": [
      {
        "id": 1,
        "title": "Lake Mug",
        "properties": [
          { "name": "design_id", "value": "LL-ABC12345" }
        ]
      }
    ]
  }'
```

**Response**:
```json
{
  "success": true,
  "topic": "orders/paid",
  "session_id": 42
}
```

**Session Updated** (existing session from orders/create):
```sql
id: 42
shopify_order_id: 9876543210
cart_token: NULL
status: 'paid'
currency: 'USD'
total_price: 99.99
email: 'customer@example.com'
design_ids: ["LL-ABC12345"]  -- Extracted from line_items
shopify_payload: { ... full payload ... }
```

### Example: carts/update Webhook

**Request**:
```bash
curl -X POST https://api.lakelines.co/shopify/webhook \
  -H "X-Shopify-Topic: carts/update" \
  -H "X-Shopify-Webhook-Id: cart-webhook-9999" \
  -H "Content-Type: application/json" \
  -d '{
    "token": "unique-cart-token-abc123",
    "line_items": [
      {
        "id": 1,
        "title": "Lake Mug",
        "properties": [
          { "name": "design_id", "value": "LL-DEF67890" }
        ]
      }
    ]
  }'
```

**Response**:
```json
{
  "success": true,
  "topic": "carts/update",
  "session_id": 99
}
```

**Session Created/Updated**:
```sql
id: 99
shopify_order_id: NULL
cart_token: 'unique-cart-token-abc123'
status: 'session'
currency: NULL
total_price: NULL
email: NULL
design_ids: NULL
shopify_payload: { ... full cart payload ... }
```

### Example: orders/fulfilled Webhook

**Request**:
```bash
curl -X POST https://api.lakelines.co/shopify/webhook \
  -H "X-Shopify-Topic: orders/fulfilled" \
  -H "X-Shopify-Webhook-Id: 12345-order-fulfilled" \
  -H "Content-Type: application/json" \
  -d '{
    "id": 9876543210,
    "order_number": 1001,
    "fulfillment_status": "fulfilled",
    ...
  }'
```

**Response**:
```json
{
  "success": true,
  "topic": "orders/fulfilled",
  "session_id": 42
}
```

**Session Updated**:
```sql
id: 42
status: 'fulfilled'  -- Changed from 'paid'
```

## Query Examples

```sql
-- View all sessions
SELECT * FROM sessions ORDER BY created_at DESC LIMIT 20;

-- View session by order ID
SELECT * FROM sessions WHERE shopify_order_id = 9876543210;

-- View session by cart token
SELECT * FROM sessions WHERE cart_token = 'unique-cart-token-abc123';

-- Find all sessions with design_ids
SELECT id, shopify_order_id, email, design_ids FROM sessions 
WHERE design_ids IS NOT NULL 
ORDER BY created_at DESC;

-- Find sessions in specific status
SELECT * FROM sessions WHERE status = 'paid' ORDER BY updated_at DESC;

-- View all webhook events for a session
SELECT * FROM session_events 
WHERE shopify_order_id = 9876543210 
ORDER BY created_at;

-- Check for duplicate webhooks
SELECT webhook_id, COUNT(*) as count FROM session_events 
GROUP BY webhook_id HAVING count > 1;

-- Find sessions that are not yet paid
SELECT * FROM sessions 
WHERE shopify_order_id IS NOT NULL AND status != 'paid' 
ORDER BY created_at;
```

## Implementation Notes

- **No Table Creation**: PHP code does NOT create tables. Use provided SQL schema only.
- **Idempotency**: Webhook IDs are UNIQUE in `session_events` table; duplicates are rejected at Step 2.
- **Session Priority**: Sessions always created before events, ensuring referential integrity.
- **Design ID Extraction**: Only performed on `orders/paid` topic to avoid duplicate extraction.
- **Cart Linking**: Use `find_session_by_cart_token()` helper to query sessions by cart token.
- **Full Payloads**: All webhooks store complete JSON payload for debugging and future replay.
- **No Dependencies**: Pure PHP with MySQLi, no frameworks or external libraries.

## Error Handling

**Missing Headers**:
```json
{ "success": false, "error": "Missing required parameters" }
```

**Invalid Topic**:
```json
{ "success": false, "error": "Unsupported topic: invalid/topic" }
```

**Duplicate Webhook** (Step 2 idempotency check):
```json
{ "success": true, "topic": "orders/create", "session_id": 42 }
```

Returns success even for duplicates to avoid Shopify retries. The duplicate is safely ignored.

## Shopify Configuration

In Shopify Admin:

1. Go to **Settings** → **Apps and integrations** → **Webhooks**
2. Create webhooks for each topic:
   - `orders/create`
   - `orders/paid`
   - `orders/fulfilled`
   - `orders/cancelled`
   - `carts/create`
   - `carts/update`
3. Endpoint: `https://api.lakelines.co/shopify/webhook`
4. Format: `JSON`
5. API version: Latest stable

## Deployment Checklist

- [ ] SQL schema created (`sessions` and `session_events` tables)
- [ ] `/api/routes/shopify_webhook.php` deployed
- [ ] `/api/functions.php` deployed (with new session helpers)
- [ ] `/api/index.php` deployed (with webhook route)
- [ ] Webhooks configured in Shopify Admin
- [ ] Test with `orders/create` webhook
- [ ] Verify session created in database
- [ ] Verify `session_events` record inserted
