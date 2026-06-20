<?php
/**
 * Reset a design to the default design state.
 * Expects `design_id` in the JSON POST body.
 *
 * @param mysqli $connect MySQLi connection resource.
 * @return void Sends JSON response via `respond()`.
 */
function reset_design($connect) {

    $data = input();

    $design_id = $data['design_id'] ?? null;

    $state = default_design();

    $state_json = mysqli_real_escape_string($connect, json_encode($state));

    mysqli_query($connect, "
        UPDATE designs SET state_json = '$state_json'
        WHERE design_id='$design_id'
    ");

    respond(true, [
        "design" => [
            "design_id" => $design_id,
            "state" => $state,
            "created_at" => date("Y-m-d H:i:s"),
            "updated_at" => date("Y-m-d H:i:s")
        ]
    ]);

}
