<?php
/**
 * Serve the layers.json data file.
 *
 * @param mysqli $connect Unused DB connection.
 * @return void Outputs JSON and exits.
 */
function get_products() {
    $products = get_products_data();
    if (!$products) {
        respond(false, ["error" => "Products data not found"]);
    }
    header('Content-Type: application/json');
    echo json_encode($products);
    exit;
}
