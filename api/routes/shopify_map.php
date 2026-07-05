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
function shopify_map($connect) {

    $data = [];

    $ch = curl_init();

    curl_setopt($ch, CURLOPT_URL, "https://api.printful.com/sync/products");
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        "Authorization: Bearer " . PRINTFUL_API_KEY,
        "Content-Type: application/json"
    ]);

    $response = curl_exec($ch);

    if (curl_errno($ch)) {
        die("cURL error: " . curl_error($ch));
    }

    curl_close($ch);

    $products = json_decode($response, true);

    foreach($products['result'] as $key => $product)
    {

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, "https://api.printful.com/sync/products/".$product['id']);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            "Authorization: Bearer " . PRINTFUL_API_KEY,
            "Content-Type: application/json"
        ]);

        $response = curl_exec($ch);

        if (curl_errno($ch)) {
            die("cURL error: " . curl_error($ch));
        }

        curl_close($ch);

        $details = json_decode($response, true);

        $data[] = $details['result'];

    }

    // Save this JSON as products.json in /assets/json/
    file_put_contents(__DIR__ . '/../assets/json/products.json', json_encode($data, JSON_PRETTY_PRINT));

    // Return the JSON response
    respond(true, [
        "products" => $data,
        "records" => count($data)
    ]);

}

