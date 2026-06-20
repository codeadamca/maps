<?php
/**
 * Serve the layouts.json data file.
 *
 * @param mysqli $connect Unused DB connection.
 * @return void Outputs JSON and exits.
 */
function get_layouts() {
    $layouts = get_layouts_data();
    if (!$layouts) {
        respond(false, ["error" => "Layouts data not found"]);
    }
    header('Content-Type: application/json');
    echo json_encode($layouts);
    exit;
}
