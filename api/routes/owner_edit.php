<?php
/**
 * Update an owner's metadata (touch `updated_at`).
 * Expects `owner_id` in the JSON POST body.
 *
 * @param mysqli $connect MySQLi connection resource.
 * @return void Sends JSON response via `respond()`.
 */
function edit_owner($connect) {

    $data = input();

    if (!isset($data['owner_id'])) {
        respond(false, ["error" => "Missing owner_id"]);
    }

    $owner_id = mysqli_real_escape_string($connect, $data['owner_id']);

    mysqli_query($connect, "
        UPDATE owners
        SET updated_at = CURRENT_TIMESTAMP
        WHERE owner_id='$owner_id' AND deleted_at IS NULL
    ");

    $owner = find_owner($connect, $owner_id);

    respond(true, [
        "owner" => [
            "owner_id" => $owner_id,
            "updated_at" => $owner['updated_at']
        ]
    ]);

}
