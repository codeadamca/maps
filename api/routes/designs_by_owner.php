<?php
/**
 * Return a list of designs for a given owner, with a slimmed `state_json` summary.
 *
 * @param mysqli $connect MySQLi connection resource.
 * @param string $id Owner identifier.
 * @return void Sends JSON response via `respond()`.
 */
function get_designs_by_owner($connect, $id) {

    $owner = find_owner($connect, $id);

    if (!$owner) {
        http_response_code(404);
        respond(false, ["error" => "Owner not found"]);
    }

    $query = "
        SELECT design_id, design_type, copied_from, updated_at, state_json
        FROM designs
        WHERE owner_id='$owner[owner_id]' 
        AND deleted_at IS NULL
        ORDER BY updated_at DESC
    ";

    $res = mysqli_query($connect, $query);

    $designs = [];

    while ($row = mysqli_fetch_assoc($res)) {
        // Normalize state_json: only expose lakeName, lon, lat, region
        $state = null;
        if (isset($row['state_json']) && $row['state_json'] !== null && $row['state_json'] !== '') {
            $decoded = json_decode($row['state_json'], true);
            if ($decoded !== null) $state = $decoded;
        }

        $slim = null;
        if (is_array($state)) {
            $slim = [
                'lakeName' => $state['lakeName'] ?? ($state['lakeName'] ?? null),
                'lon' => isset($state['lon']) ? $state['lon'] : (isset($state['lng']) ? $state['lng'] : null),
                'lat' => $state['lat'] ?? null,
                'region' => $state['region'] ?? null,
            ];
        }

        // Attach slimmed state_json to row (overriding raw DB value)
        $row['state_json'] = $slim;
        $designs[] = $row;
    }
    
    respond(true, [
        "designs" => $designs,
        "records" => count($designs)
    ]);

}
