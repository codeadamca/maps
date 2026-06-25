<?php

// Shared helper functions extracted from index.php

/**
 * Send a standardized JSON response and exit.
 *
 * The response object contains a `success` boolean and optional
 * `error`, `design`, `owner`, and `designs` payloads. When `designs`
 * is provided, a `records` count is included.
 *
 * @param bool $success Whether the request succeeded.
 * @param array $payload Optional additional payload values.
 * @return void Outputs JSON and exits the process.
 */
function respond($success, $payload = []) {

    $res = [
        "success" => $success,
        "error" => $payload["error"] ?? null
    ];

    if (isset($payload["design"])) {
        $res["design"] = $payload["design"];
    }

    if (isset($payload["owner"])) {
        $res["owner"] = $payload["owner"];
    }

    if (isset($payload["designs"])) {
        $res["designs"] = $payload["designs"];
        $res["records"] = $payload["records"] ?? count($payload["designs"]);
    }

    header('Content-Type: application/json');

    echo json_encode($res);
    exit;
}

/**
 * Read JSON request body and decode to associative array.
 *
 * @return array|null Decoded JSON body or null on parse failure.
 */
function input() {
    return json_decode(file_get_contents("php://input"), true);
}

/**
 * Find an owner by numeric `id` or string `owner_id`.
 *
 * @param mysqli $connect MySQLi connection resource.
 * @param string|int $id Numeric DB id or owner_id string.
 * @return array|null Owner record associative array or null if not found.
 */
function find_owner($connect, $id) {

    $id = mysqli_real_escape_string($connect, $id);

    if (is_numeric($id)) {
        $q = "SELECT * FROM owners WHERE id='$id' AND deleted_at IS NULL LIMIT 1";
    } else {
        $q = "SELECT * FROM owners WHERE owner_id='$id' AND deleted_at IS NULL LIMIT 1";
    }

    $res = mysqli_query($connect, $q);
    return mysqli_fetch_assoc($res);
}

/**
 * Find a design by numeric `id` or string `design_id` and decode `state_json`.
 *
 * @param mysqli $connect MySQLi connection resource.
 * @param string|int $id Numeric DB id or design_id string.
 * @return array|null Design record with `state_json` decoded to array, or null if not found.
 */
function find_design($connect, $id) {

    $id = mysqli_real_escape_string($connect, $id);

    if (is_numeric($id)) {
        $q = "SELECT * FROM designs WHERE id='$id' AND deleted_at IS NULL LIMIT 1";
    } else {
        $q = "SELECT * FROM designs WHERE design_id='$id' AND deleted_at IS NULL LIMIT 1";
    }

    $res = mysqli_query($connect, $q);
    $row = mysqli_fetch_assoc($res);

    if ($row) {
        if (isset($row['state_json']) && $row['state_json'] !== null) {
            $decoded = json_decode($row['state_json'], true);
            $row['state_json'] = $decoded !== null ? $decoded : $row['state_json'];
        }
    }

    return $row;
}

/**
 * Return the default design state used when creating or resetting designs.
 *
 * @return array Default design state keys and values.
 */
function default_design() {
    return [
        'colourId' => 'navy',
        'fontFamily' => 'playfair',
        'lakeId' => null,
        'lakeName' => 'Lake of the Ozarks',
        'region' => 'Missouri, Camden County, United States',
        'rotation' => 0,
        'zoom' => 1,
        'panX' => 0,
        'panY' => 0,
        'lat' => 38.144376,
        'lon' => -92.6594707,
        'osmType' => 'relation',
        'osmId' => '405844',
        'geojson' => null,
    ];
}

/**
 * Get colours from the json file and convert to an array
 * 
 * @return array|null Array of colours or null if file not found or JSON parse fails.
 */
function get_colours_data() {
    $path = __DIR__ . '/assets/json/colours.json';
    if (!file_exists($path)) {
        echo $path;
        echo '<br>';
        echo 'FE: '.file_exists($path);
        die();
        return null;
    }
    $data = file_get_contents($path);
    $decoded = json_decode($data, true);
    return $decoded !== null ? $decoded : null;
}

/**
 * Get fonts from the json file and convert to an array
 * 
 * @return array|null Array of fonts or null if file not found or JSON parse fails.
 */
function get_fonts_data() {
    $path = __DIR__ . '/assets/json/fonts.json';
    if (!file_exists($path)) {
        return null;
    }
    $data = file_get_contents($path);
    $decoded = json_decode($data, true);
    return $decoded !== null ? $decoded : null;
}

/**
 * Get themes from the json file and convert to an array
 * 
 * @return array|null Array of themes or null if file not found or JSON parse fails.
 */
function get_themes_data() {
    $path = __DIR__ . '/assets/json/themes.json';
    if (!file_exists($path)) {
        return null;
    }
    $data = file_get_contents($path);
    $decoded = json_decode($data, true);
    return $decoded !== null ? $decoded : null;
}

/**
 * Get layers from the json file and convert to an array    
 * 
 * @return array|null Array of layers or null if file not found or JSON parse fails.
 */
function get_layers_data() {
    $path = __DIR__ . '/assets/json/layers.json';
    if (!file_exists($path)) {
        return null;
    }
    $data = file_get_contents($path);
    $decoded = json_decode($data, true);
    return $decoded !== null ? $decoded : null;
}

/**
 * Get icons from the json file and convert to an array    
 * 
 * @return array|null Array of icons or null if file not found or JSON parse fails.
 */
function get_icons_data() {
    $path = __DIR__ . '/assets/json/icons.json';
    if (!file_exists($path)) {
        return null;
    }
    $data = file_get_contents($path);
    $decoded = json_decode($data, true);
    return $decoded !== null ? $decoded : null;
}

/**
 * Get layouts from the json file and convert to an array
 * 
 * @return array|null Array of layouts or null if file not found or JSON parse fails.
 */
function get_layouts_data() {
    $path = __DIR__ . '/assets/json/layouts.json';
    if (!file_exists($path)) {
        return null;
    }
    $data = file_get_contents($path);
    $decoded = json_decode($data, true);
    return $decoded !== null ? $decoded : null;
}
