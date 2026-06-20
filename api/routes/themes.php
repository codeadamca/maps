<?php
/**
 * Serve the themes.json data file.
 *
 * @param mysqli $connect Unused DB connection.
 * @return void Outputs JSON and exits.
 */
function get_themes($connect) {
    $themes = get_themes_data();
    if (!$themes) {
        respond(false, ["error" => "Themes data not found"]);
    }
    header('Content-Type: application/json');
    echo json_encode($themes);
    exit;
}
