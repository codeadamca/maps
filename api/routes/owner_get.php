<?php
/**
 * Retrieve an owner and list their designs.
 *
 * @param mysqli $connect MySQLi connection resource.
 * @param string $id Owner identifier.
 * @return void Sends JSON response via `respond()`.
 */
function get_owner($connect, $id) {

    $owner = find_owner($connect, $id);

    if (!$owner) {
        http_response_code(404);
        respond(false, ["error" => "Owner not found"]);
    }

    $owner_id = $owner['owner_id'];

    $res = mysqli_query($connect, "
        SELECT design_id, design_type, copied_from, updated_at
        FROM designs
        WHERE owner_id='$owner_id' AND deleted_at IS NULL
        ORDER BY updated_at DESC
    ");

    $designs = [];

    while ($row = mysqli_fetch_assoc($res)) {
        $designs[] = $row;
    }

    respond(true, [
        "owner" => [
            "id" => $owner['id'],
            "owner_id" => $owner['owner_id'],
            "created_at" => $owner['created_at'],
            "updated_at" => $owner['updated_at'],
            "deleted_at" => $owner['deleted_at'],
            "designs" => $designs
        ]
    ]);

}
