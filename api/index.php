<?php

// ======================================================
// CORS
// ======================================================
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Content-Type: application/json");

// Prevent caching of API responses (including SVG thumbnails)
header('Cache-Control: no-cache, no-store, must-revalidate'); // HTTP 1.1.
header('Pragma: no-cache'); // HTTP 1.0.
header('Expires: 0'); // Proxies.
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// ======================================================
// LOAD ENV
// ======================================================
$env = file(__DIR__.'/.env', FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);

foreach ($env as $value) {
    $value = explode('=', $value, 2);
    define(trim($value[0]), trim($value[1]));
}

// ======================================================
// DB CONNECT
// ======================================================
$connect = mysqli_connect(DB_HOST, DB_USERNAME, DB_PASSWORD, DB_DATABASE);

if (!$connect) {
    respond(false, ["error" => "Database connection failed"]);
}

mysqli_set_charset($connect, "utf8mb4");

// ======================================================
// LOAD HELPERS
// ======================================================
require_once __DIR__.'/thumbnail-helpers.php';

// ======================================================
// RESPONSE FORMAT
// ======================================================
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

    echo json_encode($res);
    exit;
}

function input() {
    return json_decode(file_get_contents("php://input"), true);
}

// ======================================================
// ROUTER
// ======================================================
$method = $_SERVER['REQUEST_METHOD'];
$path = strtok($_SERVER["REQUEST_URI"], '?');

// ----------------------
// HEALTH
// ----------------------
if ($method === 'GET' && $path === '/health') health($connect);

// ----------------------
// OWNER ROUTES
// ----------------------
if ($method === 'POST' && $path === '/owner/create') create_owner($connect);
if ($method === 'GET' && preg_match('#^/owner/([^/]+)$#', $path, $m)) get_owner($connect, $m[1]);
if ($method === 'POST' && $path === '/owner/edit') edit_owner($connect);
if ($method === 'DELETE' && preg_match('#^/owner/delete/([^/]+)$#', $path, $m)) delete_owner($connect, $m[1]);

// ----------------------
// DESIGN ROUTES
// ----------------------
if ($method === 'POST' && $path === '/design/create') create_design($connect);
if ($method === 'POST' && $path === '/design/edit') edit_design($connect);
if ($method === 'POST' && $path === '/design/reset') reset_design($connect);
if ($method === 'POST' && $path === '/design/duplicate') duplicate_design($connect);

if ($method === 'GET' && preg_match('#^/design/svg/([^/]+)$#', $path, $m)) get_design_svg($connect, $m[1]);
if ($method === 'GET' && preg_match('#^/design/thumb/([^/]+)$#', $path, $m)) get_design_thumb($connect, $m[1]);
if ($method === 'GET' && preg_match('#^/design/([^/]+)$#', $path, $m)) get_design($connect, $m[1]);
if ($method === 'GET' && preg_match('#^/designs/owner/([^/]+)$#', $path, $m)) get_designs_by_owner($connect, $m[1]);
if ($method === 'DELETE' && preg_match('#^/design/delete/([^/]+)$#', $path, $m)) delete_design($connect, $m[1]);

// fallback
respond(false, ["error" => "Route not found"]);

// ======================================================
// HELPERS
// ======================================================
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

// ======================================================
// HEALTH
// ======================================================
function health($connect) {

    respond(true, [
        "status" => [
            "api" => "ok",
            "database" => $connect ? "ok" : "error"
        ]
    ]);
}

// ======================================================
// OWNER ENDPOINTS
// ======================================================
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

// ======================================================
// DESIGN ENDPOINTS
// ======================================================
function default_design() {
    return [
        'colourId' => 'navy',
        'fontFamily' => 'Playfair Display',
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

function reset_design($connect) {

    $data = input();

    $design_id = $data['design_id'] ?? null;

    $state = default_design();

    $state_json = mysqli_real_escape_string($connect, json_encode($state));

    mysqli_query($connect, "
        UPDATE designs SET state_json = '$state_json'
        WHERE design_id='$design_id'
    ");

    respond(true, [
        "design" => [
            "design_id" => $design_id,
            "state" => $state,
            "created_at" => date("Y-m-d H:i:s"),
            "updated_at" => date("Y-m-d H:i:s")
        ]
    ]);
}

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

// ======================================================
// JSON DESIGN
// ======================================================
function get_design($connect, $id) {

    $row = find_design($connect, $id);

    if (!$row) {
        http_response_code(404);
        respond(false, ["error" => "Design not found"]);
    }

    respond(true, ["design" => $row]);
}

// ======================================================
// SVG DESIGN (MVP)
// ======================================================
function get_design_svg($connect, $id) {

    $design = find_design($connect, $id);

    if (!$design) {
        http_response_code(404);
        respond(false, ["error" => "Design not found"]);
    }

    $state = $design['state_json'];

    $label = "Untitled";

    if (isset($state['labels'][0])) {
        $label = $state['labels'][0];
    }

    header("Content-Type: image/svg+xml");

    $width = 400;
    $height = 400;
    $padding = 20;

    $geo = $state['geojson'] ?? null;

    if (is_string($geo) && $geo !== '') {
        $decoded = json_decode($geo, true);
        if ($decoded !== null) $geo = $decoded;
    }

    $paths = '';

    if (is_array($geo) && isset($geo['type'])) {
        // Handle Feature wrapper
        if ($geo['type'] === 'Feature') {
            $geo = $geo['geometry'] ?? null;
        }

        // Collect all coordinate pairs to compute bbox
        $allPoints = [];

        $collect = null;
        $collect = function($coords) use (&$allPoints, &$collect) {
            foreach ($coords as $c) {
                if (is_array($c) && isset($c[0]) && is_numeric($c[0])) {
                    $allPoints[] = [$c[0], $c[1]];
                } elseif (is_array($c)) {
                    $collect($c);
                }
            }
        };

        $type = $geo['type'] ?? null;

        if ($type === 'Polygon' || $type === 'MultiPolygon' || $type === 'LineString' || $type === 'MultiLineString' || $type === 'Point' || $type === 'MultiPoint') {
            $coords = $geo['coordinates'];
            $collect($coords);
        }

        if (count($allPoints) > 0) {
            $minX = $maxX = $allPoints[0][0];
            $minY = $maxY = $allPoints[0][1];
            foreach ($allPoints as $p) {
                $minX = min($minX, $p[0]);
                $maxX = max($maxX, $p[0]);
                $minY = min($minY, $p[1]);
                $maxY = max($maxY, $p[1]);
            }

            $dx = $maxX - $minX;
            $dy = $maxY - $minY;

            if ($dx == 0) $dx = 1e-6;
            if ($dy == 0) $dy = 1e-6;

            // rotation (degrees) and pan in pixels
            $rotation = isset($state['rotation']) ? floatval($state['rotation']) : 0;
            $panX = isset($state['panX']) ? floatval($state['panX']) : 0;
            $panY = isset($state['panY']) ? floatval($state['panY']) : 0;

            // user zoom will be applied as a group scale
            $zoom = isset($state['zoom']) ? floatval($state['zoom']) : 1.0;

            // compute center in lon/lat coordinates (rotation origin)
            $centerLon = ($minX + $maxX) / 2;
            $centerLat = ($minY + $maxY) / 2;

            // If there is rotation, compute the bbox of points after rotation about the center
            $angle = deg2rad($rotation);
            $c = cos($angle);
            $s = sin($angle);

            $rotMinX = $rotMaxX = null;
            $rotMinY = $rotMaxY = null;

            foreach ($allPoints as $p) {
                $dx0 = $p[0] - $centerLon;
                $dy0 = $p[1] - $centerLat;
                $rx = $c * $dx0 - $s * $dy0;
                $ry = $s * $dx0 + $c * $dy0;

                if ($rotMinX === null) {
                    $rotMinX = $rotMaxX = $rx;
                    $rotMinY = $rotMaxY = $ry;
                } else {
                    $rotMinX = min($rotMinX, $rx);
                    $rotMaxX = max($rotMaxX, $rx);
                    $rotMinY = min($rotMinY, $ry);
                    $rotMaxY = max($rotMaxY, $ry);
                }
            }

            // rotated bbox dimensions in lon/lat units
            $rotDx = ($rotMaxX - $rotMinX) ?: 1e-6;
            $rotDy = ($rotMaxY - $rotMinY) ?: 1e-6;

            // base scale fits the rotated bbox into the thumbnail taking into account user zoom
            $baseScale = min(($width - 2 * $padding) / $rotDx, ($height - 2 * $padding) / $rotDy) / max($zoom, 1e-6);

            // compute transform functions using scale and center it in the thumbnail
            $centerX = $width / 2;
            $centerY = $height / 2;

            $transformX = function($lon) use ($centerLon, $baseScale, $centerX) {
                return ($lon - $centerLon) * $baseScale + $centerX;
            };

            $transformY = function($lat) use ($centerLat, $baseScale, $centerY) {
                return ($centerLat - $lat) * $baseScale + $centerY;
            };

            // Build path strings for supported geometry types
            $buildPathFromRing = function($ring) use ($transformX, $transformY) {
                $d = '';
                $first = true;
                foreach ($ring as $pt) {
                    if (!is_array($pt) || !isset($pt[0])) continue;
                    $x = $transformX($pt[0]);
                    $y = $transformY($pt[1]);
                    if ($first) {
                        $d .= 'M ' . $x . ' ' . $y . ' ';
                        $first = false;
                    } else {
                        $d .= 'L ' . $x . ' ' . $y . ' ';
                    }
                }
                $d .= 'Z';
                return $d;
            };

            if ($type === 'Polygon') {
                // Combine outer ring + holes into a single path and use even-odd fill rule
                $d = '';
                foreach ($geo['coordinates'] as $ring) {
                    $d .= $buildPathFromRing($ring);
                }
                $paths .= '<path d="' . $d . '" fill="#ffffff" fill-rule="evenodd" stroke="#0b1b2b" stroke-width="1" />';
            } elseif ($type === 'MultiPolygon') {
                foreach ($geo['coordinates'] as $poly) {
                    $d = '';
                    foreach ($poly as $ring) {
                        $d .= $buildPathFromRing($ring);
                    }
                    $paths .= '<path d="' . $d . '" fill="#ffffff" fill-rule="evenodd" stroke="#0b1b2b" stroke-width="1" />';
                }
            } elseif ($type === 'LineString' || $type === 'MultiLineString') {
                $lines = $geo['coordinates'];
                if ($type === 'LineString') $lines = [$lines];
                foreach ($lines as $line) {
                    $d = '';
                    $first = true;
                    foreach ($line as $pt) {
                        $x = $transformX($pt[0]);
                        $y = $transformY($pt[1]);
                        if ($first) { $d .= 'M ' . $x . ' ' . $y . ' '; $first = false; }
                        else { $d .= 'L ' . $x . ' ' . $y . ' '; }
                    }
                    $paths .= '<path d="' . $d . '" fill="none" stroke="#ffffff" stroke-width="1.5" />';
                }
            } elseif ($type === 'Point' || $type === 'MultiPoint') {
                $pts = $geo['coordinates'];
                if ($type === 'Point') $pts = [$pts];
                foreach ($pts as $pt) {
                    $x = $transformX($pt[0]);
                    $y = $transformY($pt[1]);
                    $paths .= '<circle cx="' . $x . '" cy="' . $y . '" r="2" fill="#ffffff" />';
                }
            }
        }
    }

    // Fallback simple SVG when no geo is available
    if ($paths === '') {
        $paths = '';
    }

    // Apply rotation/zoom/pan by wrapping paths in a group transform
    if ($paths !== '') {
        $transforms = [];

        // translate to viewport center, apply zoom and rotation, then translate back
        $transforms[] = 'translate(' . $centerX . ' ' . $centerY . ')';

        if (isset($zoom) && $zoom != 1.0) {
            $transforms[] = 'scale(' . $zoom . ')';
        }

        if (isset($rotation) && $rotation != 0) {
            $transforms[] = 'rotate(' . $rotation . ')';
        }

        $transforms[] = 'translate(' . (-$centerX) . ' ' . (-$centerY) . ')';

        // apply pan last (in pixels)
        if ((isset($panX) && $panX != 0) || (isset($panY) && $panY != 0)) {
            $transforms[] = 'translate(' . $panX . ' ' . $panY . ')';
        }

        $groupAttrs = implode(' ', $transforms);
        $paths = '<g transform="' . $groupAttrs . '">' . $paths . '</g>';
    }

    echo '<svg width="' . $width . '" height="' . $height . '" xmlns="http://www.w3.org/2000/svg">

            <rect width="' . $width . '" height="' . $height . '" fill="#0b1b2b"/>

            ' . $paths . '

            <!--
            <text x="200" y="185"
                fill="#ffffff"
                text-anchor="middle"
                font-family="Arial"
                font-size="28"
                font-weight="bold">
                ' . htmlspecialchars($label) . '
            </text>

            <text x="200" y="215"
                fill="#a7b0bb"
                text-anchor="middle"
                font-family="Arial"
                font-size="20">
                ' . htmlspecialchars($design["design_type"]) . '
            </text>
            -->

        </svg>';

    exit;
}

// ======================================================
// PNG DESIGN THUMBNAIL
// ======================================================
/**
 * GET /design/thumb/:id?width=W&height=H
 * 
 * Generates a PNG thumbnail of a lake design with optional dynamic sizing.
 * Supports query parameters for custom dimensions:
 * - width: Canvas width in pixels (default: 400)
 * - height: Canvas height in pixels (default: 400)
 *
 * Examples:
 * - /design/thumb/LL-83C0E8E6 → 400x400 PNG
 * - /design/thumb/LL-83C0E8E6?width=800&height=800 → 800x800 PNG
 * - /design/thumb/LL-83C0E8E6?width=400&height=800 → 400x800 PNG
 *
 * Rendering:
 * - Matches the studio preview rendering exactly
 * - Uses same geometry transformation logic as lakeApp.js
 * - Lake is centered and scaled to fit arbitrary canvas sizes
 * - Preserves theme colors and user transforms (zoom, rotation, pan)
 * 
 * Returns: PNG image with proper Content-Type header
 * 
 * Reference Implementation:
 * - lakeApp.js: renderLakeSilhouette(), applyTransforms()
 * - Studio preview: lake silhouette with zoom, rotation, pan transforms
 */
function get_design_thumb($connect, $id) {
    $debug = isset($_GET['debug']) ? true : false;
    $debug_coords = isset($_GET['debug_coords']) ? true : false;
    $errors = [];

    // Parse sizing parameters with defaults
    $width = 400;
    $height = 400;

    if (isset($_GET['width'])) {
        $w = intval($_GET['width']);
        if ($w > 0 && $w <= 2000) {
            $width = $w;
        }
    }

    if (isset($_GET['height'])) {
        $h = intval($_GET['height']);
        if ($h > 0 && $h <= 2000) {
            $height = $h;
        }
    }

    error_log("[THUMB] GET /design/thumb/$id?width=$width&height=$height");

    try {
        $design = find_design($connect, $id);

        if (!$design) {
            if ($debug) {
                respond(false, ["error" => "Design not found: $id"]);
            }
            http_response_code(404);
            header('Content-Type: image/png');
            // Return transparent PNG for 404
            $img = imagecreatetruecolor($width, $height);
            $transparent = imagecolorallocatealpha($img, 0, 0, 0, 127);
            imagefill($img, 0, 0, $transparent);
            ob_start();
            imagepng($img);
            $data = ob_get_clean();
            imagedestroy($img);
            echo $data;
            exit;
        }

        // Validate state is array
        $state = $design['state_json'];
        if (!is_array($state)) {
            $errors[] = "state_json is not array: " . gettype($state);
            if ($debug) {
                respond(false, ["error" => "Invalid state: " . implode(", ", $errors)]);
            }
            $state = [];
        }

        // Extract state fields (with defaults matching lakeApp.js)
        $colourId = $state['colourId'] ?? 'navy';
        $geojson = $state['geojson'] ?? null;
        $zoom = isset($state['zoom']) ? floatval($state['zoom']) : 1.0;
        $rotation = isset($state['rotation']) ? floatval($state['rotation']) : 0;
        $panX = isset($state['panX']) ? floatval($state['panX']) : 0;
        $panY = isset($state['panY']) ? floatval($state['panY']) : 0;

        // Handle GeoJSON that might be stored as JSON string
        if (is_string($geojson) && $geojson !== '') {
            $decoded = json_decode($geojson, true);
            if ($decoded === null) {
                $errors[] = "geojson JSON parse failed";
            } else {
                $geojson = $decoded;
            }
        }

        // Validate geojson
        if (!$geojson || !is_array($geojson)) {
            $errors[] = "geojson is null or not array";
            if ($debug || $debug_coords) {
                respond(false, ["error" => "No geometry: " . implode(", ", $errors)]);
            }
        }

        // Load theme colours
        $coloursPath = __DIR__.'/../cursor/public/data/colours.json';
        $coloursData = load_colours_data($coloursPath);

        // Get theme colours (with fallback to navy)
        $theme = $coloursData[$colourId] ?? $coloursData['navy'] ?? [];
        $backgroundColor = $theme['background'] ?? '#FFFFFF';
        $lakeColor = $theme['primary'] ?? '#1F3B5C';

        if ($debug) {
            respond(true, [
                "design" => [
                    "design_id" => $id,
                    "colourId" => $colourId,
                    "zoom" => $zoom,
                    "rotation" => $rotation,
                    "panX" => $panX,
                    "panY" => $panY,
                    "backgroundColor" => $backgroundColor,
                    "lakeColor" => $lakeColor,
                    "geojsonType" => $geojson['type'] ?? null,
                    "hasCoordinates" => isset($geojson['coordinates']),
                ]
            ]);
        }

        // Debug coordinates mode
        if ($debug_coords) {
            $bounds = fit_geometry($geojson);
            $allPoints = collect_all_points($geojson['coordinates'] ?? []);
            $transforms = create_transform_functions($allPoints, $bounds, $zoom, $rotation, $panX, $panY, $width, $height, calculate_padding($width, $height));
            $toCanvas = $transforms['toCanvas'];
            $baseScale = $transforms['baseScale'];
            
            $type = $geojson['type'] ?? '';
            $coordinates = $geojson['coordinates'] ?? [];
            $rings = [];
            if ($type === 'Polygon') {
                $rings = $coordinates;
            } elseif ($type === 'MultiPolygon') {
                foreach ($coordinates as $polygon) {
                    $rings = array_merge($rings, $polygon);
                }
            }
            
            $ringCoords = [];
            foreach ($rings as $ringIdx => $ring) {
                $samplePoints = [];
                for ($i = 0; $i < min(5, count($ring)); $i++) {
                    $point = $ring[$i];
                    if (is_array($point) && count($point) >= 2) {
                        $pixelCoords = $toCanvas($point[0], $point[1]);
                        $samplePoints[] = [
                            'geo' => [$point[0], $point[1]],
                            'pixel' => [$pixelCoords['x'], $pixelCoords['y']],
                            'pixelInt' => [intval($pixelCoords['x']), intval($pixelCoords['y'])],
                        ];
                    }
                }
                $ringCoords[] = [
                    'ringIdx' => $ringIdx,
                    'pointCount' => count($ring),
                    'samplePoints' => $samplePoints,
                ];
            }
            
            respond(true, [
                "debug_coords" => [
                    "bounds" => $bounds,
                    "baseScale" => $baseScale,
                    "zoom" => $zoom,
                    "rotation" => $rotation,
                    "panX" => $panX,
                    "panY" => $panY,
                    "totalPoints" => count($allPoints),
                    "rings" => $ringCoords,
                ]
            ]);
        }

        // Render PNG using GD with dynamic sizing
        $image = render_lake_thumbnail($geojson, $backgroundColor, $lakeColor, $zoom, $rotation, $panX, $panY, $width, $height);

        // Generate PNG data
        ob_start();
        imagepng($image);
        $pngData = ob_get_clean();
        imagedestroy($image);

        // Return PNG with proper headers
        header('Content-Type: image/png');
        header('Content-Length: ' . strlen($pngData));
        header('Cache-Control: no-cache, no-store, must-revalidate');
        header('Pragma: no-cache');
        header('Expires: 0');

        echo $pngData;
        exit;

    } catch (Exception $e) {
        error_log("[THUMB ERROR] " . $e->getMessage() . " - " . $e->getTraceAsString());
        if ($debug) {
            respond(false, ["error" => "Exception: " . $e->getMessage()]);
        }
        
        // Return blank PNG on error
        http_response_code(500);
        header('Content-Type: image/png');
        $img = imagecreatetruecolor($width, $height);
        $white = imagecolorallocate($img, 255, 255, 255);
        imagefill($img, 0, 0, $white);
        ob_start();
        imagepng($img);
        $data = ob_get_clean();
        imagedestroy($img);
        echo $data;
        exit;
    }
}

// ======================================================
// LIST DESIGNS BY OWNER
// ======================================================
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

// ======================================================
// DELETE DESIGN
// ======================================================
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