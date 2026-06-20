<?php
/**
 * Soft-delete an owner by setting `deleted_at` on the owner record.
 *
 * @param mysqli $connect MySQLi connection resource.
 * @param string $id Owner identifier.
 * @return void Sends JSON response via `respond()`.
 */
function delete_owner($connect, $id) {

    $owner = find_owner($connect, $id);

    if (!$owner) {
        http_response_code(404);
        respond(false, ["error" => "Owner not found"]);
    }

    $owner_id = $owner['owner_id'];

    mysqli_query($connect, "
        UPDATE owners
        SET deleted_at = CURRENT_TIMESTAMP
        WHERE owner_id='$owner_id'
    ");

    respond(true, [
        "owner" => [
            "owner_id" => $owner_id,
            "deleted_at" => date("Y-m-d H:i:s")
        ]
    ]);

}
