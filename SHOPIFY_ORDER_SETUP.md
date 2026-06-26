# Shopify Order Endpoint - Setup & Testing Guide

## Files Created

1. **`/api/routes/order_create.php`** - Order endpoint handler with:
   - `create_order()` - Main webhook handler
   - `create_orders_table()` - Automatic table initialization
   - `fetch_design_snapshot()` - Design retrieval and caching

2. **`/api/index.php`** - Updated with route:
   ```php
   if ($method === 'POST' && $path === '/order') create_order($connect);
   ```

3. **`/SHOPIFY_ORDER_ENDPOINT.md`** - Complete API documentation

## Quick Start

### 1. Verify Files Are in Place

```bash
ls -la /api/routes/order_create.php     # Should exist
grep "if.*'/order'" /api/index.php       # Should find route
```

### 2. Test the Endpoint Locally

**Test 1: Valid Order with Design**

```bash
curl -X POST http://localhost/api/order \
  -H "Content-Type: application/json" \
  -d '{
    "id": 1234567890,
    "order_number": 100,
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
      "email": "test@example.com",
      "phone": "+1234567890",
      "default_address": { "name": "Test Customer" }
    },
    "shipping_address": {
      "name": "Test Customer",
      "address1": "123 Main St",
      "city": "Portland",
      "province": "OR",
      "postal_code": "97214",
      "country": "United States"
    },
    "billing_address": {
      "name": "Test Customer",
      "address1": "123 Main St",
      "city": "Portland",
      "province": "OR",
      "postal_code": "97214",
      "country": "United States"
    },
    "line_items": [
      {
        "id": 123456,
        "title": "Lake Mug",
        "quantity": 1,
        "price": "29.99",
        "properties": [
          { "name": "design_id", "value": "LL-ABC12345" }
        ]
      }
    ]
  }'
```

**Expected Response**:
```json
{
  "success": true,
  "order_id": 1,
  "shopify_order_id": 1234567890,
  "designs_saved": 0
}
```
(Note: `designs_saved: 0` because LL-ABC12345 likely doesn't exist; the order still records successfully)

**Test 2: Order with Real Design**

Replace `LL-ABC12345` with an actual design_id from your database:

```bash
# First, find a real design
mysql -u $DB_USER -p$DB_PASSWORD $DB_NAME -e "SELECT design_id FROM designs LIMIT 1;"

# Use that design_id in the test above
```

**Test 3: Order Without Design**

```bash
curl -X POST http://localhost/api/order \
  -H "Content-Type: application/json" \
  -d '{
    "id": 9876543210,
    "order_number": 101,
    "financial_status": "paid",
    "line_items": [
      {
        "id": 654321,
        "title": "Standard Product",
        "properties": []
      }
    ]
  }'
```

**Expected**: Order records with `designs_saved: 0`

### 3. Verify Database Table

```sql
-- Check if orders table was created
SHOW TABLES LIKE 'orders';

-- View the schema
DESCRIBE orders;

-- Query recent orders
SELECT id, order_number, shopify_order_id, designs_saved, created_at 
FROM orders 
ORDER BY created_at DESC 
LIMIT 5;

-- View Shopify JSON payload for an order
SELECT order_number, JSON_PRETTY(shopify_json) FROM orders WHERE id = 1;

-- View design snapshots
SELECT order_number, JSON_PRETTY(snapshot_json) FROM orders WHERE snapshot_json IS NOT NULL;
```

## Shopify Integration

### Configure Webhook in Shopify Admin

1. Go to **Settings** → **Apps and integrations** → **Webhooks** → **Create webhook**

2. Configure webhook:
   - **Event**: `Orders → Created` or `Orders → Paid`
   - **Endpoint URL**: `https://api.lakelines.co/order`
   - **API version**: 2024-01 or latest

3. Save and test from Shopify webhook dashboard

### Webhook Payload Validation

Shopify webhooks include verification headers. If you want to validate them:

```php
// In your handler (future enhancement):
$hmac = $_SERVER['HTTP_X_SHOPIFY_HMAC_SHA256'];
$data = file_get_contents('php://input');
$calculated = base64_encode(hash_hmac('sha256', $data, SHOPIFY_WEBHOOK_SECRET, true));

if ($calculated !== $hmac) {
    http_response_code(401);
    respond(false, ["error" => "Invalid webhook signature"]);
}
```

## Error Handling

### What Happens If...

**Design doesn't exist?**
- Logged: "Failed to retrieve design snapshot for design_id: LL-ABC12345..."
- Order: Still created and recorded
- Response: `designs_saved: 0`

**Database insert fails?**
- Logged: Full error message
- HTTP Response: 500 with error message
- Order: NOT recorded (data loss prevented)

**Duplicate Shopify Order ID?**
- Database: UNIQUE constraint prevents duplicate
- Behavior: `INSERT` fails, error logged
- Consider: Implement retry/upsert logic

**Malformed JSON payload?**
- HTTP Response: 400 "Invalid or missing JSON payload"
- Order: NOT recorded

## Monitoring

### Check Endpoint Health

```bash
# View recent order records
mysql -e "SELECT * FROM orders ORDER BY created_at DESC LIMIT 10;"

# Check for failed design snapshots
grep "Failed to retrieve design snapshot" /path/to/php-error.log

# View order summary
mysql -e "SELECT COUNT(*) as total_orders, SUM(designs_saved) as total_designs FROM orders;"
```

### Monitor Logs

```bash
# Check for errors
tail -f /var/log/php-errors.log | grep "order"

# Check for warnings
grep "Warning:" /var/log/php-errors.log | grep -i order
```

## Future Enhancements

1. **Duplicate Detection**: Implement idempotent retry logic via `shopify_order_id` UNIQUE key
2. **Webhook Signature Validation**: Verify requests originate from Shopify
3. **Async Processing**: Queue design snapshots for background processing
4. **Batch Operations**: Support bulk order imports
5. **Status Tracking**: Update `status` field as orders progress through fulfillment
6. **Failed Snapshot Recovery**: Retry mechanism for failed design retrievals

## Rollback (If Needed)

If you need to remove the implementation:

```bash
# Remove route handler
rm /api/routes/order_create.php

# Remove route from index.php
# (manually edit to remove the /order route line)

# Keep orders table (data preservation)
# Or drop it:
mysql -e "DROP TABLE orders;"
```

## Support

For issues or questions:

1. Check **Error Logs**: `/path/to/php-error.log`
2. Review **Database**: Query `orders` table for records
3. Check **Shopify Webhook Dashboard**: View recent deliveries and responses
4. Review **Implementation**: See `/SHOPIFY_ORDER_ENDPOINT.md` for full API spec
