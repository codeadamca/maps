<?php
/**
 * Serve the icons.json data file.
 *
 * @param mysqli $connect Unused DB connection.
 * @return void Outputs JSON and exits.
 */
function get_icons() {
    $icons = get_icons_data();
    if (!$icons) {
        respond(false, ["error" => "Icons data not found"]);
    }
    header('Content-Type: application/json');
    echo json_encode($icons);
    exit;
}
