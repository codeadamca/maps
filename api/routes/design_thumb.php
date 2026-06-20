<?php
/**
 * Generate a PNG thumbnail for a design using GD.
 * Supports `width`, `height`, and debug query flags `debug` and `debug_coords`.
 *
 * @param mysqli $connect MySQLi connection resource.
 * @param string $id Design identifier.
 * @return void Outputs PNG (or JSON in debug) and exits.
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
