<?php
/**
 * Soft-delete a design by setting its `deleted_at` timestamp.
 *
 * @param mysqli $connect MySQLi connection resource.
 * @param string $id Design identifier (e.g. LL-XXXX).
 * @return void Sends JSON response via `respond()`.
 */
function delete_design($connect, $id) {

    $design = find_design($connect, $id);

    if (!$design) {
        http_response_code(404);
        respond(false, ["error" => "Design not found"]);
    }

    $design_id = $design['design_id'];

    mysqli_query($connect, "
        UPDATE designs
        SET deleted_at = CURRENT_TIMESTAMP
        WHERE design_id='$design_id'
    ");

    respond(true, [
        "design" => [
            "design_id" => $design_id,
            "deleted_at" => date("Y-m-d H:i:s")
        ]
    ]);

}
