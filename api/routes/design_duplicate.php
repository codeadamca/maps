<?php
/**
 * Duplicate an existing design, creating a new design row copied from the original.
 *
 * @param mysqli $connect MySQLi connection resource.
 * @return void Sends JSON response via `respond()`.
 */
function duplicate_design($connect) {

    $data = input();

    if (!isset($data['design_id'])) {
        respond(false, ["error" => "Missing design_id"]);
    }

    $original = find_design($connect, $data['design_id']);

    if (!$original) {
        http_response_code(404);
        respond(false, ["error" => "Design not found"]);
    }

    $new_id = "LL-" . strtoupper(bin2hex(random_bytes(4)));

    $state_json = mysqli_real_escape_string($connect, json_encode($original['state']));

    mysqli_query($connect, "
        INSERT INTO designs (design_id, owner_id, design_type, copied_from, state_json)
        VALUES (
            '$new_id',
            '{$original['owner_id']}',
            '{$original['design_type']}',
            '{$original['design_id']}',
            '$state_json'
        )
    ");

    respond(true, [
        "design" => [
            "design_id" => $new_id,
            "copied_from" => $original['design_id'],
            "created_at" => date("Y-m-d H:i:s")
        ]
    ]);

}
