<?php
/**
 * Retrieve a design's full record (including `state_json`).
 *
 * @param mysqli $connect MySQLi connection resource.
 * @param string $id Design identifier.
 * @return void Sends JSON response via `respond()`.
 */
function get_design($connect, $id) {

    $row = find_design($connect, $id);

    if (!$row) {
        http_response_code(404);
        respond(false, ["error" => "Design not found"]);
    }

    respond(true, ["design" => $row]);

}
