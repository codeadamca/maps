<?php
/**
 * Serve the layers.json data file.
 *
 * @param mysqli $connect Unused DB connection.
 * @return void Outputs JSON and exits.
 */
function get_layers($connect) {
    $layers = get_layers_data();
    if (!$layers) {
        respond(false, ["error" => "Layers data not found"]);
    }
    header('Content-Type: application/json');
    echo json_encode($layers);
    exit;
}
