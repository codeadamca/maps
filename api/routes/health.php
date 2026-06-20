<?php
/**
 * Health check endpoint for the API.
 * Reports basic API and database connectivity status.
 *
 * @param mysqli $connect MySQLi connection resource.
 * @return void Sends JSON response via `respond()`.
 */
function health($connect) {

    respond(true, [
        "status" => [
            "api" => "ok",
            "database" => $connect ? "ok" : "error"
        ]
    ]);

}
