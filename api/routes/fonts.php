<?php
/**
 * Serve the fonts.json data file.
 *
 * @param mysqli $connect Unused DB connection.
 * @return void Outputs JSON and exits.
 */
function get_fonts($connect) {
    $fonts = get_fonts_data();
    if (!$fonts) {
        respond(false, ["error" => "Fonts data not found"]);
    }
    header('Content-Type: application/json');
    echo json_encode($fonts);
    exit;
}
