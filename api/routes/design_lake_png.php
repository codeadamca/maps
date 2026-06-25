<?php
/**
 * Generate a PNG thumbnail for a design using GD.
 * Supports `width`, `height`, and debug query flags `debug` and `debug_coords`.
 *
 * @param mysqli $connect MySQLi connection resource.
 * @param string $id Design identifier.
 * @return void Outputs PNG (or JSON in debug) and exits.
 */
function get_design_lake_png($connect, $id) {

    // Parse sizing parameters with defaults
    $width = 400;
    $height = 400;

    if (isset($_GET['width'])) $width = intval($_GET['width']);
    if (isset($_GET['height'])) $height = intval($_GET['height']);

    error_log("[THUMB] GET /design/thumb/$id?width=$width&height=$height");

    try {

        $design = find_design($connect, $id);

        if (!$design) {
            respond(false, ["error" => "Design not found: $id"]);
        }

        // Validate state is array
        $state = $design['state_json'];
        if (!is_array($state)) {
            $errors[] = "state_json is not array: " . gettype($state);
            respond(false, ["error" => "Invalid state: " . implode(", ", $errors)]);    
            $state = [];
        }

        // Extract state fields (with defaults mat  ching lakeApp.js)
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
    }

}
