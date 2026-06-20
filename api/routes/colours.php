<?php
/**
 * Serve the colours.json data file.
 *
 * @param mysqli $connect Unused DB connection (kept for uniform signature).
 * @return void Outputs JSON and exits.
 */
function get_colours($connect) {
    $colours = get_colours_data();
    if (!$colours) {
        respond(false, ["error" => "Colours data not found"]);
    }
    header('Content-Type: application/json');
    echo json_encode($colours);
    exit;
}
