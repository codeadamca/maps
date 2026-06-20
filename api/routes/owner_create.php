<?php
/**
 * Create a new owner record and return the owner_id.
 *
 * @param mysqli $connect MySQLi connection resource.
 * @return void Sends JSON response via `respond()`.
 */
function create_owner($connect) {

    $data = input();

    $owner_id = $data['owner_id'] ?? "OW-" . strtoupper(bin2hex(random_bytes(4)));
    $owner_id = mysqli_real_escape_string($connect, $owner_id);

    mysqli_query($connect, "
        INSERT INTO owners (owner_id)
        VALUES ('$owner_id')
    ");

    respond(true, [
        "owner" => [
            "owner_id" => $owner_id,
            "created_at" => date("Y-m-d H:i:s")
        ]
    ]);

}
