<?php

// Shared helper functions extracted from index.php

/**
 * Send a standardized JSON response and exit.
 *
 * The response object contains a `success` boolean and optional
 * `error`, `design`, `owner`, and `designs` payloads. When `designs`
 * is provided, a `records` count is included.
 *
 * @param bool $success Whether the request succeeded.
 * @param array $payload Optional additional payload values.
 * @return void Outputs JSON and exits the process.
 */
function respond($success, $payload = []) {

    $res = [
        "success" => $success,
        "error" => $payload["error"] ?? null
    ];

    if (isset($payload["design"])) {
        $res["design"] = $payload["design"];
    }

    if (isset($payload["owner"])) {
        $res["owner"] = $payload["owner"];
    }

    if (isset($payload["designs"])) {
        $res["designs"] = $payload["designs"];
        $res["records"] = $payload["records"] ?? count($payload["designs"]);
    }

    header('Content-Type: application/json');

    echo json_encode($res);
    exit;
}

/**
 * Read JSON request body and decode to associative array.
 *
 * @return array|null Decoded JSON body or null on parse failure.
 */
function input() {
    return json_decode(file_get_contents("php://input"), true);
}

/**
 * Find an owner by numeric `id` or string `owner_id`.
 *
 * @param mysqli $connect MySQLi connection resource.
 * @param string|int $id Numeric DB id or owner_id string.
 * @return array|null Owner record associative array or null if not found.
 */
function find_owner($connect, $id) {

    $id = mysqli_real_escape_string($connect, $id);

    if (is_numeric($id)) {
        $q = "SELECT * FROM owners WHERE id='$id' AND deleted_at IS NULL LIMIT 1";
    } else {
        $q = "SELECT * FROM owners WHERE owner_id='$id' AND deleted_at IS NULL LIMIT 1";
    }

    $res = mysqli_query($connect, $q);
    return mysqli_fetch_assoc($res);
}

/**
 * Find a design by numeric `id` or string `design_id` and decode `state_json`.
 *
 * @param mysqli $connect MySQLi connection resource.
 * @param string|int $id Numeric DB id or design_id string.
 * @return array|null Design record with `state_json` decoded to array, or null if not found.
 */
function find_design($connect, $id) {

    $id = mysqli_real_escape_string($connect, $id);

    if (is_numeric($id)) {
        $q = "SELECT * FROM designs WHERE id='$id' AND deleted_at IS NULL LIMIT 1";
    } else {
        $q = "SELECT * FROM designs WHERE design_id='$id' AND deleted_at IS NULL LIMIT 1";
    }

    $res = mysqli_query($connect, $q);
    $row = mysqli_fetch_assoc($res);

    if ($row) {
        if (isset($row['state_json']) && $row['state_json'] !== null) {
            $decoded = json_decode($row['state_json'], true);
            $row['state_json'] = $decoded !== null ? $decoded : $row['state_json'];
        }
    }

    return $row;
}

/**
 * Return the default design state used when creating or resetting designs.
 *
 * @return array Default design state keys and values.
 */
function default_design() {
    return [
        'colourId' => 'navy',
        'fontFamily' => 'playfair',
        'lakeId' => null,
        'lakeName' => 'Lake of the Ozarks',
        'region' => 'Missouri, Camden County, United States',
        'rotation' => 0,
        'zoom' => 1,
        'panX' => 0,
        'panY' => 0,
        'lat' => 38.144376,
        'lon' => -92.6594707,
        'osmType' => 'relation',
        'osmId' => '405844',
        'geojson' => null,
    ];
}

/**
 * Get colours from the json file and convert to an array
 * 
 * @return array|null Array of colours or null if file not found or JSON parse fails.
 */
function get_colours_data() {
    $path = __DIR__ . '/assets/json/colours.json';
    if (!file_exists($path)) {
        echo $path;
        echo '<br>';
        echo 'FE: '.file_exists($path);
        die();
        return null;
    }
    $data = file_get_contents($path);
    $decoded = json_decode($data, true);
    return $decoded !== null ? $decoded : null;
}

/**
 * Get fonts from the json file and convert to an array
 * 
 * @return array|null Array of fonts or null if file not found or JSON parse fails.
 */
function get_fonts_data() {
    $path = __DIR__ . '/assets/json/fonts.json';
    if (!file_exists($path)) {
        return null;
    }
    $data = file_get_contents($path);
    $decoded = json_decode($data, true);
    return $decoded !== null ? $decoded : null;
}

/**
 * Get themes from the json file and convert to an array
 * 
 * @return array|null Array of themes or null if file not found or JSON parse fails.
 */
function get_themes_data() {
    $path = __DIR__ . '/assets/json/themes.json';
    if (!file_exists($path)) {
        return null;
    }
    $data = file_get_contents($path);
    $decoded = json_decode($data, true);
    return $decoded !== null ? $decoded : null;
}

/**
 * Get layers from the json file and convert to an array    
 * 
 * @return array|null Array of layers or null if file not found or JSON parse fails.
 */
function get_layers_data() {
    $path = __DIR__ . '/assets/json/layers.json';
    if (!file_exists($path)) {
        return null;
    }
    $data = file_get_contents($path);
    $decoded = json_decode($data, true);
    return $decoded !== null ? $decoded : null;
}

/**
 * Get icons from the json file and convert to an array    
 * 
 * @return array|null Array of icons or null if file not found or JSON parse fails.
 */
function get_icons_data() {
    $path = __DIR__ . '/assets/json/icons.json';
    if (!file_exists($path)) {
        return null;
    }
    $data = file_get_contents($path);
    $decoded = json_decode($data, true);
    return $decoded !== null ? $decoded : null;
}

/**
 * Get layouts from the json file and convert to an array
 * 
 * @return array|null Array of layouts or null if file not found or JSON parse fails.
 */
function get_layouts_data() {
    $path = __DIR__ . '/assets/json/layouts.json';
    if (!file_exists($path)) {
        return null;
    }
    $data = file_get_contents($path);
    $decoded = json_decode($data, true);
    return $decoded !== null ? $decoded : null;
}

/**
 * Get templates from the json file and convert to an array
 * 
 * @return array|null Array of templates or null if file not found or JSON parse fails.
 */
function get_templates_data() {
    $path = __DIR__ . '/assets/json/templates.json';
    if (!file_exists($path)) {
        return null;
    }
    $data = file_get_contents($path);
    $decoded = json_decode($data, true);
    return $decoded !== null ? $decoded : null;
}

/**
 * Find a session by shopify_order_id or cart_token.
 *
 * @param mysqli $connect MySQLi connection resource.
 * @param int|null $shopify_order_id Shopify order ID.
 * @param string|null $cart_token Cart token.
 * @return array|null Session record or null if not found.
 */
function find_session($connect, $shopify_order_id, $cart_token) {
    if ($shopify_order_id) {
        $shopify_order_id = (int)$shopify_order_id;
        $res = mysqli_query($connect, "SELECT * FROM sessions WHERE shopify_order_id='$shopify_order_id' LIMIT 1");
        $row = mysqli_fetch_assoc($res);
        if ($row) {
            return $row;
        }
    }

    if ($cart_token) {
        $cart_token = mysqli_real_escape_string($connect, $cart_token);
        $res = mysqli_query($connect, "SELECT * FROM sessions WHERE cart_token='$cart_token' LIMIT 1");
        $row = mysqli_fetch_assoc($res);
        if ($row) {
            return $row;
        }
    }

    return null;
}

/**
 * Create a new session record.
 *
 * @param mysqli $connect MySQLi connection resource.
 * @param int|null $shopify_order_id Shopify order ID.
 * @param string|null $cart_token Cart token.
 * @param string $payload_json Initial payload as JSON string.
 * @return int|false Session ID or false on failure.
 */
function create_session($connect, $shopify_order_id, $cart_token, $payload_json) {
    $shopify_order_id_sql = $shopify_order_id ? (int)$shopify_order_id : "NULL";
    $cart_token_sql = $cart_token ? "'" . mysqli_real_escape_string($connect, $cart_token) . "'" : "NULL";
    $payload_json = mysqli_real_escape_string($connect, $payload_json);

    $query = "
        INSERT INTO sessions (shopify_order_id, cart_token, status, shopify_payload)
        VALUES ($shopify_order_id_sql, $cart_token_sql, 'session', '$payload_json')
    ";

    if (mysqli_query($connect, $query)) {
        return mysqli_insert_id($connect);
    }

    return false;
}

/**
 * Check if a session_event has already been inserted by webhook_id.
 * (Idempotency protection)
 *
 * @param mysqli $connect MySQLi connection resource.
 * @param string $webhook_id Shopify webhook ID.
 * @return bool True if webhook event exists, false otherwise.
 */
function session_event_exists($connect, $webhook_id) {
    $webhook_id = mysqli_real_escape_string($connect, $webhook_id);
    $res = mysqli_query($connect, "SELECT id FROM session_events WHERE webhook_id='$webhook_id' LIMIT 1");
    return mysqli_num_rows($res) > 0;
}

/**
 * Insert a session_event record (immutable webhook log).
 *
 * @param mysqli $connect MySQLi connection resource.
 * @param string $webhook_id Shopify webhook ID.
 * @param string $topic Shopify topic (e.g., "orders/create").
 * @param int|null $shopify_order_id Shopify order ID if applicable.
 * @param string|null $cart_token Cart token if applicable.
 * @param string $payload_json Full webhook payload as JSON string.
 * @return bool Success.
 */
function insert_session_event($connect, $webhook_id, $topic, $shopify_order_id, $cart_token, $payload_json) {
    $webhook_id = mysqli_real_escape_string($connect, $webhook_id);
    $topic = mysqli_real_escape_string($connect, $topic);
    $shopify_order_id_sql = $shopify_order_id ? (int)$shopify_order_id : "NULL";
    $cart_token_sql = $cart_token ? "'" . mysqli_real_escape_string($connect, $cart_token) . "'" : "NULL";
    $payload_json = mysqli_real_escape_string($connect, $payload_json);

    $query = "
        INSERT INTO session_events (webhook_id, topic, shopify_order_id, cart_token, payload)
        VALUES ('$webhook_id', '$topic', $shopify_order_id_sql, $cart_token_sql, '$payload_json')
    ";

    return mysqli_query($connect, $query) !== false;
}

/**
 * Update session status and fields based on topic.
 *
 * Topic handlers:
 * - carts/create, carts/update: status='session'
 * - orders/create: status='created', set shopify_order_id
 * - orders/paid: status='paid', extract and store design_ids
 * - orders/fulfilled: status='fulfilled'
 * - orders/cancelled: status='cancelled'
 *
 * @param mysqli $connect MySQLi connection resource.
 * @param int $session_id Session ID.
 * @param string $topic Shopify topic.
 * @param array $data Webhook payload data.
 * @return bool Success.
 */
function update_session_by_topic($connect, $session_id, $topic, $data) {
    $session_id = (int)$session_id;
    $payload_json = mysqli_real_escape_string($connect, json_encode($data));

    $status = 'session'; // Default
    $set_fields = [];

    // Determine status and additional fields to update
    if ($topic === 'carts/create' || $topic === 'carts/update') {
        $status = 'session';
        $set_fields[] = "shopify_payload='$payload_json'";
    }
    elseif ($topic === 'orders/create') {
        $status = 'created';
        $shopify_order_id = (int)($data['id'] ?? 0);
        $set_fields[] = "shopify_order_id='$shopify_order_id'";
        $set_fields[] = "shopify_payload='$payload_json'";
        
        // Extract order fields if available
        if (isset($data['currency'])) {
            $currency = mysqli_real_escape_string($connect, $data['currency']);
            $set_fields[] = "currency='$currency'";
        }
        if (isset($data['total_price'])) {
            $total_price = (float)$data['total_price'];
            $set_fields[] = "total_price='$total_price'";
        }
        if (isset($data['email'])) {
            $email = mysqli_real_escape_string($connect, $data['email']);
            $set_fields[] = "email='$email'";
        }
    }
    elseif ($topic === 'orders/paid') {
        $status = 'paid';
        $set_fields[] = "shopify_payload='$payload_json'";
        
        // Extract design IDs from line_items
        $design_ids = extract_design_ids($data['line_items'] ?? []);
        $design_ids_json = mysqli_real_escape_string($connect, json_encode($design_ids));
        $set_fields[] = "design_ids='$design_ids_json'";
    }
    elseif ($topic === 'orders/fulfilled') {
        $status = 'fulfilled';
        $set_fields[] = "shopify_payload='$payload_json'";
    }
    elseif ($topic === 'orders/cancelled') {
        $status = 'cancelled';
        $set_fields[] = "shopify_payload='$payload_json'";
    }

    $set_clause = implode(', ', $set_fields);
    if ($set_clause) {
        $set_clause .= ', ';
    }

    $query = "
        UPDATE sessions
        SET {$set_clause}status='$status'
        WHERE id='$session_id'
    ";

    return mysqli_query($connect, $query) !== false;
}

/**
 * Extract unique design IDs from line_items.
 *
 * @param array $line_items Array of line items from Shopify order.
 * @return array Array of unique design IDs found.
 */
function extract_design_ids($line_items) {
    $design_ids = [];

    if (!is_array($line_items)) {
        return $design_ids;
    }

    foreach ($line_items as $item) {
        if (!isset($item['properties']) || !is_array($item['properties'])) {
            continue;
        }

        foreach ($item['properties'] as $prop) {
            if (isset($prop['name']) && $prop['name'] === 'design_id' && isset($prop['value'])) {
                $design_id = $prop['value'];
                if (!in_array($design_id, $design_ids)) {
                    $design_ids[] = $design_id;
                }
            }
        }
    }

    return $design_ids;
}

/**
 * Find a session by cart_token.
 * (For linking cart updates to sessions)
 *
 * @param mysqli $connect MySQLi connection resource.
 * @param string $cart_token Shopify cart token.
 * @return array|null Session record or null if not found.
 */
function find_session_by_cart_token($connect, $cart_token) {
    $cart_token = mysqli_real_escape_string($connect, $cart_token);
    $res = mysqli_query($connect, "SELECT * FROM sessions WHERE cart_token='$cart_token' LIMIT 1");
    return mysqli_fetch_assoc($res);
}
