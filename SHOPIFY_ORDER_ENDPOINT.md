# Shopify Order Webhook Endpoint

## Endpoint

```
POST /order
```

## Purpose

Records completed Shopify orders and creates permanent snapshots of ordered designs. This ensures orders are preserved exactly as they existed at purchase time, independent of any subsequent design modifications or deletions by customers.

## Request

Accept the complete Shopify `orders/create` or `orders/paid` webhook JSON payload without modification.

**Headers**: `Content-Type: application/json`

**Body**: Complete Shopify webhook JSON (e.g., from `orders/create` or `orders/paid` webhook)

## Database Schema

The endpoint automatically creates an `orders` table with the following structure:

```sql
CREATE TABLE IF NOT EXISTS orders (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    order_number INT NOT NULL,
    shopify_order_id BIGINT NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    financial_status VARCHAR(50),
    fulfillment_status VARCHAR(50),
    currency VARCHAR(10),
    total_price DECIMAL(12, 2),
    subtotal_price DECIMAL(12, 2),
    total_tax DECIMAL(12, 2),
    total_shipping DECIMAL(12, 2),
    customer_name VARCHAR(255),
    customer_email VARCHAR(255),
    customer_phone VARCHAR(20),
    shipping_name VARCHAR(255),
    shipping_address JSON,
    billing_name VARCHAR(255),
    billing_address JSON,
    shopify_json JSON NOT NULL,
    snapshot_json JSON,
    status VARCHAR(50) DEFAULT 'pending',
    deleted_at TIMESTAMP NULL,
    INDEX idx_shopify_order_id (shopify_order_id),
    INDEX idx_created_at (created_at),
    INDEX idx_status (status)
)
```

### Column Details

- **id**: Internal database ID (auto-increment)
- **order_number**: Shopify order number
- **shopify_order_id**: Shopify's unique order ID
- **created_at** / **updated_at**: Timestamp tracking
- **financial_status**: e.g., "authorized", "paid", "refunded"
- **fulfillment_status**: e.g., "unshipped", "partial", "shipped"
- **currency**: ISO currency code (e.g., "USD")
- **total_price**: Total order amount
- **subtotal_price**: Subtotal before tax/shipping
- **total_tax**: Tax amount
- **total_shipping**: Shipping cost
- **customer_name**: Customer name
- **customer_email**: Customer email
- **customer_phone**: Customer phone
- **shipping_name**: Recipient name (may differ from customer)
- **shipping_address**: Full shipping address (JSON)
- **billing_address**: Full billing address (JSON)
- **shopify_json**: **Complete original Shopify webhook payload** (stored as-is, never modified)
- **snapshot_json**: Array of design snapshots (see below)
- **status**: Order processing status (e.g., "pending", "processed")
- **deleted_at**: Soft-delete timestamp (if applicable)

## Design Snapshots

For each line item containing a `properties.design_id`, the endpoint:

1. Retrieves the design from the internal design database
2. Stores the complete design object in `snapshot_json`

### Snapshot Structure

```json
[
  {
    "design_type": "lake",
    "design_id": "LL-ABC12345",
    "design_snapshot": {
      "id": 123,
      "design_id": "LL-ABC12345",
      "owner_id": "OW-XYZ789",
      "design_type": "lake",
      "state_json": { ... },
      "created_at": "2026-06-20 12:30:45",
      "updated_at": "2026-06-20 12:30:45",
      "deleted_at": null
    }
  },
  {
    "design_type": "map",
    "design_id": "LM-DEF67890",
    "design_snapshot": { ... }
  }
]
```

### Design Type Inference

Design types are inferred from the design ID prefix:

| Prefix | Type |
| ------ | ---- |
| LL-    | lake |
| LM-    | map  |
| LP-    | park |

Extension is straightforward for future design types.

## Line Item Processing

The endpoint scans all line items in the order:

```javascript
line_items: [
  {
    id: 123456789,
    properties: [
      { name: "design_id", value: "LL-ABC12345" }
    ],
    ...
  }
]
```

### Design ID Extraction

- Looks for `properties[].name === "design_id"`
- Retrieves the corresponding `properties[].value`
- Fetches and snapshots the design if found
- **Continues processing** if design_id is missing (does not reject the order)

### Error Handling

- If a design cannot be retrieved:
  - Logs the error with the order ID and design_id
  - Does NOT reject the order
  - Continues processing other line items
- The original Shopify payload is **always** preserved, even if design snapshot retrieval fails
- Order is fully recorded with whatever designs were successfully retrieved

## Response

**Status Code**: 200 on success, 400/500 on error

**Success Response**:

```json
{
  "success": true,
  "order_id": 42,
  "shopify_order_id": 1234567890123456789,
  "designs_saved": 2
}
```

**Error Response**:

```json
{
  "success": false,
  "error": "Invalid or missing JSON payload"
}
```

### Response Fields

- **success**: Boolean indicating endpoint success
- **order_id**: Internal database ID of created order record
- **shopify_order_id**: Shopify's order ID (from webhook)
- **designs_saved**: Count of design snapshots successfully retrieved and stored

## Examples

### Example Shopify Webhook Payload (simplified)

```json
{
  "id": 1234567890123456789,
  "order_number": 12345,
  "financial_status": "paid",
  "fulfillment_status": "unshipped",
  "currency": "USD",
  "total_price": "99.99",
  "subtotal_price": "89.99",
  "total_tax": "0.00",
  "total_shipping_price_set": {
    "shop_money": { "amount": "10.00" }
  },
  "customer": {
    "email": "john@example.com",
    "phone": "+1234567890",
    "default_address": {
      "name": "John Doe"
    }
  },
  "shipping_address": {
    "name": "John Doe",
    "address1": "123 Main St",
    "city": "Portland",
    "province": "OR",
    "country": "United States",
    "postal_code": "97214"
  },
  "billing_address": { ... },
  "line_items": [
    {
      "id": 987654321,
      "title": "Lake Silhouette Ceramic Mug",
      "quantity": 2,
      "price": "29.99",
      "properties": [
        { "name": "design_id", "value": "LL-ABC12345" }
      ]
    },
    {
      "id": 987654322,
      "title": "Map Print",
      "quantity": 1,
      "price": "39.99",
      "properties": [
        { "name": "design_id", "value": "LM-XYZ78901" }
      ]
    }
  ]
}
```

### Example cURL Request

```bash
curl -X POST https://api.lakelines.co/order \
  -H "Content-Type: application/json" \
  -d '{
    "id": 1234567890123456789,
    "order_number": 12345,
    "financial_status": "paid",
    "line_items": [
      {
        "properties": [
          { "name": "design_id", "value": "LL-ABC12345" }
        ]
      }
    ]
  }'
```

### Example Response

```json
{
  "success": true,
  "order_id": 42,
  "shopify_order_id": 1234567890123456789,
  "designs_saved": 1
}
```

## Edge Cases

### No design_id in Properties

```json
{
  "line_items": [
    {
      "title": "Standard Product",
      "properties": []
    }
  ]
}
```

**Behavior**: Order is fully recorded. `designs_saved` is 0. No error returned.

### Multiple Designs in One Order

```json
{
  "line_items": [
    {
      "properties": [
        { "name": "design_id", "value": "LL-ABC12345" }
      ]
    },
    {
      "properties": [
        { "name": "design_id", "value": "LL-DEF67890" }
      ]
    },
    {
      "properties": [
        { "name": "design_id", "value": "LM-GHI11111" }
      ]
    }
  ]
}
```

**Response**: `designs_saved: 3` (all three snapshots stored)

### Design Not Found

If a design_id references a design that doesn't exist or has been deleted:

- Error is logged with order ID and design_id
- Order is still recorded
- `designs_saved` count reflects only successfully retrieved designs
- No exception thrown

## Querying Orders

Once orders are recorded, you can query them via SQL:

```sql
-- Find orders by Shopify ID
SELECT * FROM orders WHERE shopify_order_id = 1234567890123456789;

-- Find orders with designs
SELECT id, order_number, customer_email, designs_saved FROM orders 
WHERE JSON_LENGTH(snapshot_json) > 0;

-- Extract design info from snapshot
SELECT 
  order_number,
  JSON_EXTRACT(snapshot_json, '$[0].design_id') AS design_id,
  JSON_EXTRACT(snapshot_json, '$[0].design_type') AS design_type
FROM orders
WHERE JSON_LENGTH(snapshot_json) > 0;

-- Get all orders from a date range
SELECT * FROM orders 
WHERE created_at BETWEEN '2026-06-01' AND '2026-06-30'
ORDER BY created_at DESC;
```

## Integration with Shopify Webhooks

Configure Shopify to POST to this endpoint on order events:

**Shopify Admin Settings** → Apps → Your App → Webhook Configuration

Add webhook:
- **Topic**: Orders/Created or Orders/Paid
- **URL**: `https://api.lakelines.co/order`
- **API Version**: Latest (e.g., 2024-01)

Shopify will POST the complete order JSON to your endpoint.

## Data Preservation Guarantees

1. ✅ **Original Shopify payload**: Stored completely in `shopify_json`, never modified
2. ✅ **No data loss**: Even if design snapshots fail, the order record and Shopify data are preserved
3. ✅ **Immutable records**: Orders are inserted once and updated only to add design snapshots
4. ✅ **Soft-delete support**: `deleted_at` field supports logical deletion without data loss
5. ✅ **Transaction safety**: Each order ID is unique; duplicate orders handled gracefully

## Future Expansion

This structure supports future design types without schema changes:

```json
{
  "design_type": "your_new_type",
  "design_id": "NEW-ABC12345",
  "design_snapshot": { ... }
}
```

Simply add new prefix patterns to the `fetch_design_snapshot()` type inference logic.

## Status Codes

| Code | Meaning |
| ---- | ------- |
| 200  | Order successfully recorded |
| 400  | Invalid/missing JSON payload |
| 500  | Database error (order not recorded) |

## Error Handling

- **Invalid payload**: Returns 400 with error message
- **Database failure**: Returns 500 and logs full error
- **Missing design**: Logs error, continues processing, order still recorded
- **Network timeout**: Shopify webhook may retry; duplicate order detection via `shopify_order_id` UNIQUE index
