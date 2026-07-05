<?php
/**
 * Shopify Webhook Handler - Session-Based Architecture
 *
 * POST /shopify/webhook
 *
 * Receives Shopify webhooks and manages the full session lifecycle:
 * session → created (order) → paid → fulfilled (or cancelled)
 *
 * Supported Topics:
 * - orders/create
 * - orders/paid
 * - orders/cancelled
 * - orders/fulfilled
 * - carts/create
 * - carts/update
 *
 * @param mysqli $connect MySQLi connection resource.
 * @return void Sends JSON response via `respond()`.
 */
function shopify_webhook($connect) {

    file_put_contents('webhook_test.log', "WEBHOOK HIT\n", FILE_APPEND);

    // Read headers and payload
    $topic = $_SERVER['HTTP_X_SHOPIFY_TOPIC'] ?? null;
    $webhook_id = $_SERVER['HTTP_X_SHOPIFY_WEBHOOK_ID'] ?? null;
    $data = input();

    // Validate required inputs
    if (!$topic || !$webhook_id || !$data) {
        http_response_code(400);
        respond(false, ["error" => "Missing required parameters"]);
        return;
    }

    // Validate topic is supported
    $valid_topics = ['orders/create', 'orders/paid', 'orders/cancelled', 'orders/fulfilled', 'carts/create', 'carts/update'];
    if (!in_array($topic, $valid_topics)) {
        http_response_code(400);
        respond(false, ["error" => "Unsupported topic: $topic"]);
        return;
    }

    // Extract identifiers from payload based on topic
    $shopify_order_id = null;
    $cart_token = null;

    if (strpos($topic, 'orders/') === 0) {
        $shopify_order_id = $data['id'] ?? null;
    } elseif (strpos($topic, 'carts/') === 0) {
        $cart_token = $data['token'] ?? null;
    }

    // STEP 1: Resolve or create session (MUST exist before inserting events)
    $session = find_session($connect, $shopify_order_id, $cart_token);

    if (!$session) {
        $session_id = create_session($connect, $shopify_order_id, $cart_token, json_encode($data));
        $session = ['id' => $session_id];
    } else {
        $session_id = $session['id'];
    }

    // STEP 2: Check if event already exists (idempotency protection)
    if (session_event_exists($connect, $webhook_id)) {
        respond(true, ["success" => true, "topic" => $topic, "session_id" => $session_id]);
        return;
    }

    // STEP 3: Insert session event (always before updating session state)
    insert_session_event($connect, $webhook_id, $topic, $shopify_order_id, $cart_token, json_encode($data));

    // STEP 4: Update session state based on topic
    update_session_by_topic($connect, $session_id, $topic, $data);

    // Return success with session ID
    respond(true, ["success" => true, "topic" => $topic, "session_id" => $session_id]);

}

