<?php
/**
 * Update a design's `state_json` and `updated_at` timestamp.
 * Expects `design_id` and `state` in the JSON POST body.
 *
 * @param mysqli $connect MySQLi connection resource.
 * @return void Sends JSON response via `respond()`.
 */
function edit_design($connect) {

    $data = input();

    if (!isset($data['design_id'], $data['state'])) {
        respond(false, ["error" => "Missing design_id or state"]);
    }

    $design_id = mysqli_real_escape_string($connect, $data['design_id']);
    $state_json = mysqli_real_escape_string($connect, json_encode($data['state']));

    mysqli_query($connect, "
        UPDATE designs
        SET state_json='$state_json',
            updated_at=CURRENT_TIMESTAMP
        WHERE design_id='$design_id' AND deleted_at IS NULL
    ");

    $row = find_design($connect, $design_id);

    if (!$row) {
        http_response_code(404);
        respond(false, ["error" => "Design not found"]);
    }

    respond(true, [
        "design" => [
            "design_id" => $design_id,
            "updated_at" => $row['updated_at']
        ]
    ]);

}
