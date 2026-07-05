<?php
/**
 * Serve the layouts.json data file.
 *
 * @param mysqli $connect Unused DB connection.
 * @return void Outputs JSON and exits.
 */
function get_templates() {
    $templates = get_templates_data();
    if (!$templates) {
        respond(false, ["error" => "Templates data not found"]);
    }
    header('Content-Type: application/json');
    echo json_encode($templates);
    exit;
}
