<?php
/**
 * Create a new design record for an owner (or create a new owner).
 * Inserts a default design state and returns the created design metadata.
 *
 * @param mysqli $connect MySQLi connection resource.
 * @return void Sends JSON response via `respond()`.
 */
function create_design($connect) {

    $data = input();

    $owner_id = $data['owner_id'] ?? null;

    if (!$owner_id) {
        $owner_id = "OW-" . strtoupper(bin2hex(random_bytes(4)));

        mysqli_query($connect, "
            INSERT INTO owners (owner_id)
            VALUES ('$owner_id')
        ");
    }

    $owner_id = mysqli_real_escape_string($connect, $owner_id);

    $design_id = "LL-" . strtoupper(bin2hex(random_bytes(4)));

    $state = default_design();

    $state_json = mysqli_real_escape_string($connect, json_encode($state));

    mysqli_query($connect, "
        INSERT INTO designs (design_id, owner_id, design_type, state_json)
        VALUES ('$design_id', '$owner_id', 'lake', '$state_json')
    ");

    respond(true, [
        "design" => [
            "design_id" => $design_id,
            "owner_id" => $owner_id,
            "state" => $state,
            "created_at" => date("Y-m-d H:i:s"),
            "updated_at" => date("Y-m-d H:i:s")
        ]
    ]);

}
