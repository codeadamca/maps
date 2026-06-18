<?php

/**
 * Thumbnail and Geometry Rendering Helpers
 * 
 * Provides reusable functions for:
 * - Loading and normalizing geometry
 * - Calculating transformations (scale, rotate, pan)
 * - Rendering to PNG using GD library
 * 
 * These functions follow the same transformation logic as the lake studio (lakeApp.js)
 * to ensure thumbnail rendering matches the studio preview exactly.
 * 
 * Reference Implementation: lakeApp.js
 * - Coordinate normalization: ((lon - minLon) / lonRange) * 90 + 5
 * - Viewbox calculation: fitLakeSilhouette()
 * - Transform application: applyTransforms() → translate(panX) scale(zoom) rotate(rotation)
 */

// ======================================================
// GEOMETRY STRUCTURE HELPERS
// ======================================================

/**
 * Extract bounding box from GeoJSON geometry
 * 
 * @param array $geojson GeoJSON Polygon or MultiPolygon
 * @return array ['minLon', 'maxLon', 'minLat', 'maxLat', 'lonRange', 'latRange']
 */
function fit_geometry($geojson) {
    if (!$geojson || !isset($geojson['coordinates'])) {
        return ['minLon' => 0, 'maxLon' => 100, 'minLat' => 0, 'maxLat' => 100, 'lonRange' => 100, 'latRange' => 100];
    }

    $type = $geojson['type'] ?? '';
    $coordinates = $geojson['coordinates'];
    $rings = [];

    if ($type === 'Polygon') {
        $rings = $coordinates;
    } elseif ($type === 'MultiPolygon') {
        foreach ($coordinates as $polygon) {
            $rings = array_merge($rings, $polygon);
        }
    }

    $minLon = INF;
    $maxLon = -INF;
    $minLat = INF;
    $maxLat = -INF;

    foreach ($rings as $ring) {
        foreach ($ring as $point) {
            if (count($point) >= 2) {
                $lon = $point[0];
                $lat = $point[1];
                $minLon = min($minLon, $lon);
                $maxLon = max($maxLon, $lon);
                $minLat = min($minLat, $lat);
                $maxLat = max($maxLat, $lat);
            }
        }
    }

    $lonRange = $maxLon - $minLon ?: 1;
    $latRange = $maxLat - $minLat ?: 1;

    return [
        'minLon' => $minLon,
        'maxLon' => $maxLon,
        'minLat' => $minLat,
        'maxLat' => $maxLat,
        'lonRange' => $lonRange,
        'latRange' => $latRange,
    ];
}

/**
 * Collect all coordinate points from GeoJSON
 * Recursively extracts all [lon, lat] pairs
 * 
 * @param array $coords GeoJSON coordinates (nested arrays)
 * @return array Array of [lon, lat] points
 */
function collect_all_points($coords) {
    $allPoints = [];

    $collect = null;
    $collect = function($coords) use (&$allPoints, &$collect) {
        foreach ($coords as $c) {
            if (is_array($c) && isset($c[0]) && is_numeric($c[0]) && isset($c[1]) && is_numeric($c[1])) {
                // Check if this is a point pair or a nested array
                if (is_numeric($c[1])) {
                    // Looks like [lon, lat]
                    if (!isset($c[2]) || is_numeric($c[2])) {
                        $allPoints[] = [$c[0], $c[1]];
                        continue;
                    }
                }
            }
            if (is_array($c)) {
                $collect($c);
            }
        }
    };

    $collect($coords);
    return $allPoints;
}

// ======================================================
// TRANSFORMATION HELPERS
// ======================================================

/**
 * Normalize geo coordinates to canvas space (0-100 range with padding)
 * Matches lakeApp.js: ((lon - minLon) / lonRange) * (100 - 2 * padding) + padding
 * 
 * @param float $lon Longitude
 * @param float $lat Latitude
 * @param array $bounds Bounds from fit_geometry()
 * @param int $padding SVG padding (default 5)
 * @return array ['x', 'y'] normalized coordinates
 */
function coord_to_normalized($lon, $lat, $bounds, $padding = 5) {
    $x = (($lon - $bounds['minLon']) / $bounds['lonRange']) * (100 - 2 * $padding) + $padding;
    $y = (($bounds['maxLat'] - $lat) / $bounds['latRange']) * (100 - 2 * $padding) + $padding;
    return ['x' => $x, 'y' => $y];
}

/**
 * Rotate a point around a center by angle in degrees
 * 
 * @param float $x Point x coordinate
 * @param float $y Point y coordinate
 * @param float $centerX Center x coordinate
 * @param float $centerY Center y coordinate
 * @param float $degrees Rotation angle in degrees
 * @return array ['x', 'y'] rotated coordinates
 */
function rotate_point($x, $y, $centerX, $centerY, $degrees) {
    $angle = deg2rad($degrees);
    $cos = cos($angle);
    $sin = sin($angle);

    $dx = $x - $centerX;
    $dy = $y - $centerY;

    $newX = $centerX + ($dx * $cos - $dy * $sin);
    $newY = $centerY + ($dx * $sin + $dy * $cos);

    return ['x' => $newX, 'y' => $newY];
}

/**
 * Calculate the bounding box of rotated points
 * Used to compute scaling for rotated geometry
 * 
 * @param array $allPoints Array of [lon, lat] points
 * @param float $centerLon Center longitude (rotation origin)
 * @param float $centerLat Center latitude (rotation origin)
 * @param float $degrees Rotation angle
 * @return array ['minX', 'maxX', 'minY', 'maxY'] rotated bounds
 */
function calculate_rotated_bounds($allPoints, $centerLon, $centerLat, $degrees) {
    if (count($allPoints) === 0) {
        return ['minX' => 0, 'maxX' => 1, 'minY' => 0, 'maxY' => 1];
    }

    $angle = deg2rad($degrees);
    $cos = cos($angle);
    $sin = sin($angle);

    $minX = null;
    $maxX = null;
    $minY = null;
    $maxY = null;

    foreach ($allPoints as $p) {
        $dx0 = $p[0] - $centerLon;
        $dy0 = $p[1] - $centerLat;
        $rx = $cos * $dx0 - $sin * $dy0;
        $ry = $sin * $dx0 + $cos * $dy0;

        if ($minX === null) {
            $minX = $maxX = $rx;
            $minY = $maxY = $ry;
        } else {
            $minX = min($minX, $rx);
            $maxX = max($maxX, $rx);
            $minY = min($minY, $ry);
            $maxY = max($maxY, $ry);
        }
    }

    return ['minX' => $minX, 'maxX' => $maxX, 'minY' => $minY, 'maxY' => $maxY];
}

/**
 * Calculate transform functions for mapping geo coordinates to canvas pixels
 * 
 * This matches the SVG endpoint logic which is proven to work:
 * 1. Calculate bounding box of rotated geometry
 * 2. Compute baseScale to fit rotated geometry in canvas
 * 3. For each point: apply baseScale transform (centerX, centerY, baseScale)
 * 4. Apply rotation, zoom, pan to transformed point
 * 
 * @param array $allPoints Array of [lon, lat] points
 * @param array $bounds Bounds from fit_geometry()
 * @param float $zoom User zoom factor (0.5-3)
 * @param float $rotation Rotation in degrees (0-360)
 * @param float $panX Pan x offset in pixels
 * @param float $panY Pan y offset in pixels
 * @param int $canvasWidth Canvas width in pixels
 * @param int $canvasHeight Canvas height in pixels
 * @param int $padding Canvas padding (default 20, matching SVG)
 * @return array ['baseScale' => float, 'centerX' => float, 'centerY' => float, 'toCanvas' => callable]
 */
function create_transform_functions($allPoints, $bounds, $zoom, $rotation, $panX, $panY, $canvasWidth, $canvasHeight, $padding = 20) {
    if (empty($allPoints)) {
        $allPoints = [[0, 0]];
    }

    // Geometry center (rotation origin in geo coords)
    $centerLon = ($bounds['minLon'] + $bounds['maxLon']) / 2;
    $centerLat = ($bounds['minLat'] + $bounds['maxLat']) / 2;

    // Canvas center
    $centerX = $canvasWidth / 2;
    $centerY = $canvasHeight / 2;

    // Calculate rotated bounding box (same as SVG endpoint)
    $angle = deg2rad($rotation);
    $cos = cos($angle);
    $sin = sin($angle);

    $rotMinX = null;
    $rotMaxX = null;
    $rotMinY = null;
    $rotMaxY = null;

    foreach ($allPoints as $p) {
        $dx0 = $p[0] - $centerLon;
        $dy0 = $p[1] - $centerLat;
        $rx = $cos * $dx0 - $sin * $dy0;
        $ry = $sin * $dx0 + $cos * $dy0;

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

    // Rotated bbox dimensions
    $rotDx = ($rotMaxX - $rotMinX) ?: 1e-6;
    $rotDy = ($rotMaxY - $rotMinY) ?: 1e-6;

    // Base scale: fit rotated geometry into canvas with padding, accounting for user zoom
    $baseScale = min(
        ($canvasWidth - 2 * $padding) / $rotDx,
        ($canvasHeight - 2 * $padding) / $rotDy
    ) / max($zoom, 1e-6);

    // Initial transform to get pixel bounds
    $pixelMinX = null;
    $pixelMaxX = null;
    $pixelMinY = null;
    $pixelMaxY = null;

    foreach ($allPoints as $p) {
        // Map to canvas
        $x = ($p[0] - $centerLon) * $baseScale + $centerX;
        $y = ($centerLat - $p[1]) * $baseScale + $centerY;

        // Rotate around center
        $dx = $x - $centerX;
        $dy = $y - $centerY;
        $rotX = $cos * $dx - $sin * $dy;
        $rotY = $sin * $dx + $cos * $dy;

        // Translate back (pan is added later, not here)
        $px = $centerX + $rotX;
        $py = $centerY + $rotY;

        if ($pixelMinX === null) {
            $pixelMinX = $pixelMaxX = $px;
            $pixelMinY = $pixelMaxY = $py;
        } else {
            $pixelMinX = min($pixelMinX, $px);
            $pixelMaxX = max($pixelMaxX, $px);
            $pixelMinY = min($pixelMinY, $py);
            $pixelMaxY = max($pixelMaxY, $py);
        }
    }

    // Calculate pixel-space bounds and check if we have room
    $pixelDx = $pixelMaxX - $pixelMinX;
    $pixelDy = $pixelMaxY - $pixelMinY;
    
    // Calculate margins
    $topMargin = $pixelMinY;
    $bottomMargin = $canvasHeight - $pixelMaxY;
    $leftMargin = $pixelMinX;
    $rightMargin = $canvasWidth - $pixelMaxX;

    // Center rotated bounds in canvas (aim for even padding)
    $offsetX = $centerX - (($pixelMinX + $pixelMaxX) / 2);
    $offsetY = $centerY - (($pixelMinY + $pixelMaxY) / 2);

    // Ensure offsets respect padding boundaries
    $minOffsetX = $padding - $pixelMinX; // left edge at least `padding`
    $maxOffsetX = ($canvasWidth - $padding) - $pixelMaxX; // right edge at most canvasWidth-padding
    if ($offsetX < $minOffsetX) $offsetX = $minOffsetX;
    if ($offsetX > $maxOffsetX) $offsetX = $maxOffsetX;

    $minOffsetY = $padding - $pixelMinY;
    $maxOffsetY = ($canvasHeight - $padding) - $pixelMaxY;
    if ($offsetY < $minOffsetY) $offsetY = $minOffsetY;
    if ($offsetY > $maxOffsetY) $offsetY = $maxOffsetY;

    // Clamp pan so that after applying offset + pan the geometry stays within canvas
    $minAllowedPanX = -($pixelMinX + $offsetX);
    $maxAllowedPanX = $canvasWidth - ($pixelMaxX + $offsetX);
    $usedPanX = $panX;
    if ($usedPanX < $minAllowedPanX) $usedPanX = $minAllowedPanX;
    if ($usedPanX > $maxAllowedPanX) $usedPanX = $maxAllowedPanX;

    $minAllowedPanY = -($pixelMinY + $offsetY);
    $maxAllowedPanY = $canvasHeight - ($pixelMaxY + $offsetY);
    $usedPanY = $panY;
    if ($usedPanY < $minAllowedPanY) $usedPanY = $minAllowedPanY;
    if ($usedPanY > $maxAllowedPanY) $usedPanY = $maxAllowedPanY;

    // Ensure a minimum padding by reducing baseScale if needed
    // Iterate a few times to converge
    $maxIterations = 3;
    $iter = 0;
    while ($iter < $maxIterations) {
        // compute final pixel bounds with current baseScale, offset and usedPan
        $fMinX = null; $fMaxX = null; $fMinY = null; $fMaxY = null;
        foreach ($allPoints as $p) {
            $x = ($p[0] - $centerLon) * $baseScale + $centerX;
            $y = ($centerLat - $p[1]) * $baseScale + $centerY;
            $dx = $x - $centerX; $dy = $y - $centerY;
            $rotX = $cos * $dx - $sin * $dy;
            $rotY = $sin * $dx + $cos * $dy;
            $px = $centerX + $rotX + $offsetX + $usedPanX;
            $py = $centerY + $rotY + $offsetY + $usedPanY;
            if ($fMinX === null) { $fMinX = $fMaxX = $px; $fMinY = $fMaxY = $py; }
            else { $fMinX = min($fMinX, $px); $fMaxX = max($fMaxX, $px); $fMinY = min($fMinY, $py); $fMaxY = max($fMaxY, $py); }
        }

        $fDx = $fMaxX - $fMinX; $fDy = $fMaxY - $fMinY;
        $availW = $canvasWidth - 2 * $padding;
        $availH = $canvasHeight - 2 * $padding;

        // If geometry already fits with padding, break
        if ($fDx <= $availW + 1e-6 && $fDy <= $availH + 1e-6) break;

        // Compute required scale factor to fit
        $scaleW = $availW / max($fDx, 1e-6);
        $scaleH = $availH / max($fDy, 1e-6);
        $scaleFactor = min($scaleW, $scaleH, 1);

        if ($scaleFactor >= 1) break;

        // Apply scale reduction and recompute offsets/pan clamps
        $baseScale *= $scaleFactor;

        // Recompute pixel-based bounds (un-rotated) to recalc margins and offsets
        $pixelMinX = $pixelMaxX = $pixelMinY = $pixelMaxY = null;
        foreach ($allPoints as $p) {
            $x = ($p[0] - $centerLon) * $baseScale + $centerX;
            $y = ($centerLat - $p[1]) * $baseScale + $centerY;
            $dx = $x - $centerX; $dy = $y - $centerY;
            $rotX = $cos * $dx - $sin * $dy;
            $rotY = $sin * $dx + $cos * $dy;
            $px = $centerX + $rotX; $py = $centerY + $rotY;
            if ($pixelMinX === null) { $pixelMinX = $pixelMaxX = $px; $pixelMinY = $pixelMaxY = $py; }
            else { $pixelMinX = min($pixelMinX, $px); $pixelMaxX = max($pixelMaxX, $px); $pixelMinY = min($pixelMinY, $py); $pixelMaxY = max($pixelMaxY, $py); }
        }

        // Recompute offsets by centering rotated bounds and clamp to padding
        $offsetX = $centerX - (($pixelMinX + $pixelMaxX) / 2);
        $offsetY = $centerY - (($pixelMinY + $pixelMaxY) / 2);
        $minOffsetX = $padding - $pixelMinX;
        $maxOffsetX = ($canvasWidth - $padding) - $pixelMaxX;
        if ($offsetX < $minOffsetX) $offsetX = $minOffsetX;
        if ($offsetX > $maxOffsetX) $offsetX = $maxOffsetX;
        $minOffsetY = $padding - $pixelMinY;
        $maxOffsetY = ($canvasHeight - $padding) - $pixelMaxY;
        if ($offsetY < $minOffsetY) $offsetY = $minOffsetY;
        if ($offsetY > $maxOffsetY) $offsetY = $maxOffsetY;

        $minAllowedPanX = -($pixelMinX + $offsetX);
        $maxAllowedPanX = $canvasWidth - ($pixelMaxX + $offsetX);
        if ($usedPanX < $minAllowedPanX) $usedPanX = $minAllowedPanX;
        if ($usedPanX > $maxAllowedPanX) $usedPanX = $maxAllowedPanX;
        $minAllowedPanY = -($pixelMinY + $offsetY);
        $maxAllowedPanY = $canvasHeight - ($pixelMaxY + $offsetY);
        if ($usedPanY < $minAllowedPanY) $usedPanY = $minAllowedPanY;
        if ($usedPanY > $maxAllowedPanY) $usedPanY = $maxAllowedPanY;

        $iter++;
    }

        // Recompute final bounds and apply a last-centering adjustment so
        // the final rendered bbox is centered in the canvas (even after pan clamp)
        $fMinX = $fMaxX = $fMinY = $fMaxY = null;
        $angle = deg2rad($rotation);
        $cos = cos($angle); $sin = sin($angle);
        foreach ($allPoints as $p) {
            $x = ($p[0] - $centerLon) * $baseScale + $centerX;
            $y = ($centerLat - $p[1]) * $baseScale + $centerY;
            $dx = $x - $centerX; $dy = $y - $centerY;
            $rotX = $cos * $dx - $sin * $dy;
            $rotY = $sin * $dx + $cos * $dy;
            $px = $centerX + $rotX + $offsetX + $usedPanX;
            $py = $centerY + $rotY + $offsetY + $usedPanY;
            if ($fMinX === null) { $fMinX = $fMaxX = $px; $fMinY = $fMaxY = $py; }
            else { $fMinX = min($fMinX, $px); $fMaxX = max($fMaxX, $px); $fMinY = min($fMinY, $py); $fMaxY = max($fMaxY, $py); }
        }

        if ($fMinX !== null) {
            // Compute center adjustment to align bbox center with canvas center
            $desiredAdjX = $centerX - (($fMinX + $fMaxX) / 2);
            $desiredAdjY = $centerY - (($fMinY + $fMaxY) / 2);

            // Recompute un-panned/un-offset pixel bounds for offset clamping
            $pixelMinX = $pixelMaxX = $pixelMinY = $pixelMaxY = null;
            foreach ($allPoints as $p) {
                $x = ($p[0] - $centerLon) * $baseScale + $centerX;
                $y = ($centerLat - $p[1]) * $baseScale + $centerY;
                $dx = $x - $centerX; $dy = $y - $centerY;
                $rotX = $cos * $dx - $sin * $dy;
                $rotY = $sin * $dx + $cos * $dy;
                $px = $centerX + $rotX; $py = $centerY + $rotY;
                if ($pixelMinX === null) { $pixelMinX = $pixelMaxX = $px; $pixelMinY = $pixelMaxY = $py; }
                else { $pixelMinX = min($pixelMinX, $px); $pixelMaxX = max($pixelMaxX, $px); $pixelMinY = min($pixelMinY, $py); $pixelMaxY = max($pixelMaxY, $py); }
            }

            $minOffsetX = $padding - $pixelMinX;
            $maxOffsetX = ($canvasWidth - $padding) - $pixelMaxX;
            $offsetX += $desiredAdjX;
            if ($offsetX < $minOffsetX) $offsetX = $minOffsetX;
            if ($offsetX > $maxOffsetX) $offsetX = $maxOffsetX;

            $minOffsetY = $padding - $pixelMinY;
            $maxOffsetY = ($canvasHeight - $padding) - $pixelMaxY;
            $offsetY += $desiredAdjY;
            if ($offsetY < $minOffsetY) $offsetY = $minOffsetY;
            if ($offsetY > $maxOffsetY) $offsetY = $maxOffsetY;

            // Ensure usedPan still lies within allowed range after offset tweak
            $minAllowedPanX = -($pixelMinX + $offsetX);
            $maxAllowedPanX = $canvasWidth - ($pixelMaxX + $offsetX);
            if ($usedPanX < $minAllowedPanX) $usedPanX = $minAllowedPanX;
            if ($usedPanX > $maxAllowedPanX) $usedPanX = $maxAllowedPanX;
            $minAllowedPanY = -($pixelMinY + $offsetY);
            $maxAllowedPanY = $canvasHeight - ($pixelMaxY + $offsetY);
            if ($usedPanY < $minAllowedPanY) $usedPanY = $minAllowedPanY;
            if ($usedPanY > $maxAllowedPanY) $usedPanY = $maxAllowedPanY;
        }

    // Return closure that transforms geo coords to canvas pixels with even centering
    $toCanvas = function($lon, $lat) use ($centerLon, $centerLat, $baseScale, $centerX, $centerY, $rotation, $offsetX, $offsetY, $usedPanX, $usedPanY) {
        // Step 1: Map geo coords to canvas space
        $x = ($lon - $centerLon) * $baseScale + $centerX;
        $y = ($centerLat - $lat) * $baseScale + $centerY;

        // Step 2: Rotate around canvas center
        $dx = $x - $centerX;
        $dy = $y - $centerY;
        
        $angle = deg2rad($rotation);
        $cos = cos($angle);
        $sin = sin($angle);
        
        $rotX = $cos * $dx - $sin * $dy;
        $rotY = $sin * $dx + $cos * $dy;

        // Step 3: Translate back to canvas center, apply centering offset, then apply pan
        $finalX = $centerX + $rotX + $offsetX + $usedPanX;
        $finalY = $centerY + $rotY + $offsetY + $usedPanY;

        return ['x' => $finalX, 'y' => $finalY];
    };

    return [
        'baseScale' => $baseScale,
        'centerX' => $centerX,
        'centerY' => $centerY,
        'offsetX' => $offsetX,
        'offsetY' => $offsetY,
        'toCanvas' => $toCanvas,
    ];
}

// ======================================================
// PNG RENDERING
// ======================================================

/**
 * Render lake geometry to PNG image
 * 
 * Generates a 400x400 PNG matching the studio preview rendering.
 * Uses GD library for image generation.
 * 
 * @param array $geojson GeoJSON Polygon or MultiPolygon
 * @param string $backgroundColor Hex color for background (e.g. "#FFFFFF")
 * @param string $lakeColor Hex color for lake fill (e.g. "#1F3B5C")
 * @param float $zoom Zoom factor (0.5-3)
 * @param float $rotation Rotation in degrees
 * @param float $panX Pan x offset in pixels
 * @param float $panY Pan y offset in pixels
 * @return resource GD image resource
 */
function render_lake_thumbnail($geojson, $backgroundColor, $lakeColor, $zoom = 1.0, $rotation = 0, $panX = 0, $panY = 0) {
    $width = 400;
    $height = 400;

    // Create image
    $image = imagecreatetruecolor($width, $height);
    imageantialias($image, true);

    // Parse colors
    $bgRgb = hex_to_rgb($backgroundColor);
    $lakeRgb = hex_to_rgb($lakeColor);

    $bgColor = imagecolorallocate($image, $bgRgb['r'], $bgRgb['g'], $bgRgb['b']);
    $lakeColorInt = imagecolorallocate($image, $lakeRgb['r'], $lakeRgb['g'], $lakeRgb['b']);

    // Fill background
    imagefill($image, 0, 0, $bgColor);

    if (!$geojson || !isset($geojson['coordinates'])) {
        error_log("[RENDER] No geojson or no coordinates");
        return $image;
    }

    $type = $geojson['type'] ?? '';
    $coordinates = $geojson['coordinates'];

    error_log("[RENDER] Type: $type, zoom: $zoom, rotation: $rotation, pan: ($panX, $panY)");

    // Extract all rings
    $rings = [];
    if ($type === 'Polygon') {
        $rings = $coordinates;
    } elseif ($type === 'MultiPolygon') {
        foreach ($coordinates as $polygon) {
            $rings = array_merge($rings, $polygon);
        }
    } else {
        error_log("[RENDER] Unsupported type: $type");
        return $image;
    }

    if (empty($rings)) {
        error_log("[RENDER] No rings found");
        return $image;
    }

    error_log("[RENDER] Found " . count($rings) . " rings");

    // Get bounds and all points
    $bounds = fit_geometry($geojson);
    $allPoints = collect_all_points($coordinates);

    error_log("[RENDER] Bounds: " . json_encode($bounds) . ", Points: " . count($allPoints));

    if (empty($allPoints)) {
        error_log("[RENDER] No points collected");
        return $image;
    }

    // Create transform function (use larger padding so thumbnail has equal breathing room)
    $transforms = create_transform_functions($allPoints, $bounds, $zoom, $rotation, $panX, $panY, $width, $height, 36);
    $toCanvas = $transforms['toCanvas'];
    $baseScale = $transforms['baseScale'];

    error_log("[RENDER] BaseScale: $baseScale");

    // --- Center the lake by adjusting pan based on the current lake bbox ---
    // Compute pixel bbox for all points using current transform
    $pMinX = $pMaxX = $pMinY = $pMaxY = null;
    foreach ($allPoints as $p) {
        $pc = $toCanvas($p[0], $p[1]);
        if ($pMinX === null) { $pMinX = $pMaxX = $pc['x']; $pMinY = $pMaxY = $pc['y']; }
        else { $pMinX = min($pMinX, $pc['x']); $pMaxX = max($pMaxX, $pc['x']); $pMinY = min($pMinY, $pc['y']); $pMaxY = max($pMaxY, $pc['y']); }
    }

    if ($pMinX !== null) {
        $canvasCenterX = $width / 2;
        $canvasCenterY = $height / 2;
        $bboxCenterX = ($pMinX + $pMaxX) / 2;
        $bboxCenterY = ($pMinY + $pMaxY) / 2;
        $adjX = $canvasCenterX - $bboxCenterX;
        $adjY = $canvasCenterY - $bboxCenterY;

        // If adjustment is noticeable, apply it by modifying pan and recomputing transforms
        if (abs($adjX) >= 1 || abs($adjY) >= 1) {
            $panX += $adjX;
            $panY += $adjY;
            // Recompute transforms with adjusted pan so toCanvas reflects the centering
            $transforms = create_transform_functions($allPoints, $bounds, $zoom, $rotation, $panX, $panY, $width, $height, 36);
            $toCanvas = $transforms['toCanvas'];
            $baseScale = $transforms['baseScale'];
            error_log("[RENDER] Applied centering adj: ($adjX, $adjY); new pan: ($panX,$panY)");
        } else {
            error_log("[RENDER] Centering adj negligible: ($adjX, $adjY)");
        }
    }

    // If vertical position is still too high, apply a small downward bias and recompute.
    // This helps visual centering for asymmetrical lake shapes.
    $pMinX = $pMaxX = $pMinY = $pMaxY = null;
    foreach ($allPoints as $p) {
        $pc = $toCanvas($p[0], $p[1]);
        if ($pMinX === null) { $pMinX = $pMaxX = $pc['x']; $pMinY = $pMaxY = $pc['y']; }
        else { $pMinX = min($pMinX, $pc['x']); $pMaxX = max($pMaxX, $pc['x']); $pMinY = min($pMinY, $pc['y']); $pMaxY = max($pMaxY, $pc['y']); }
    }
    if ($pMinY !== null) {
        $canvasCenterY = $height / 2;
        $bboxCenterY = ($pMinY + $pMaxY) / 2;
        if ($bboxCenterY < $canvasCenterY - 1) {
            $verticalBias = intval(round($height * 0.04)); // ~4% of canvas height
            $panY += $verticalBias;
            $transforms = create_transform_functions($allPoints, $bounds, $zoom, $rotation, $panX, $panY, $width, $height, 36);
            $toCanvas = $transforms['toCanvas'];
            $baseScale = $transforms['baseScale'];
            error_log("[RENDER] Applied vertical bias of $verticalBias px to lower bbox center (was $bboxCenterY)");
        }
    }

    // VALIDATION: Check if rotated geometry fits in canvas
    // If any points exceed bounds after rotation, detect clipping
    $canvasBounds = ['minX' => 0, 'maxX' => $width, 'minY' => 0, 'maxY' => $height];
    $clipDetected = false;
    $clippedPoints = 0;

    foreach ($allPoints as $p) {
        $pixelCoords = $toCanvas($p[0], $p[1]);
        if ($pixelCoords['x'] < $canvasBounds['minX'] || $pixelCoords['x'] > $canvasBounds['maxX'] ||
            $pixelCoords['y'] < $canvasBounds['minY'] || $pixelCoords['y'] > $canvasBounds['maxY']) {
            $clipDetected = true;
            $clippedPoints++;
        }
    }

    if ($clipDetected) {
        error_log("[RENDER] WARNING: Clipping detected! $clippedPoints / " . count($allPoints) . " points exceed canvas bounds. Consider reducing zoom or adjusting pan.");
        error_log("[RENDER] Proceeding anyway - GD will handle out-of-bounds points gracefully");
    }

    // Render each ring as a filled polygon
    // Global bbox for all rings (lake)
    $globalMinX = $globalMaxX = $globalMinY = $globalMaxY = null;

    foreach ($rings as $ringIdx => $ring) {
        if (count($ring) < 3) {
            error_log("[RENDER] Ring $ringIdx has < 3 points: " . count($ring));
            continue; // Need at least 3 points for a polygon
        }

        // Convert ring to pixel coordinates
        $pixelRing = [];
        $minX = $maxX = $minY = $maxY = null;
        $pointLog = [];
        foreach ($ring as $ptIdx => $point) {
            if (is_array($point) && count($point) >= 2) {
                $pixelCoords = $toCanvas($point[0], $point[1]);
                $x = intval($pixelCoords['x']);
                $y = intval($pixelCoords['y']);
                $pixelRing[] = $x;
                $pixelRing[] = $y;
                
                if ($ptIdx < 3) {
                    $pointLog[] = sprintf("pt%d: [%.2f, %.2f] => [%.1f, %.1f] => [%d, %d]", 
                        $ptIdx, $point[0], $point[1], $pixelCoords['x'], $pixelCoords['y'], $x, $y);
                }
                
                if ($minX === null) {
                    $minX = $maxX = $x;
                    $minY = $maxY = $y;
                } else {
                    $minX = min($minX, $x);
                    $maxX = max($maxX, $x);
                    $minY = min($minY, $y);
                    $maxY = max($maxY, $y);
                }
            }
        }

        if (count($pixelRing) >= 6) { // At least 3 x,y pairs
            error_log("[RENDER] Ring $ringIdx: " . count($pixelRing) / 2 . " points");
            error_log("[RENDER]   First 3: " . implode(", ", $pointLog));
            error_log("[RENDER]   Bounds: ($minX-$maxX, $minY-$maxY)");
            $result = imagefilledpolygon($image, $pixelRing, count($pixelRing) / 2, $lakeColorInt);
            error_log("[RENDER]   imagefilledpolygon returned: " . ($result ? 'true' : 'false'));
            // Expand global bbox
            if ($globalMinX === null) {
                $globalMinX = $minX; $globalMaxX = $maxX; $globalMinY = $minY; $globalMaxY = $maxY;
            } else {
                $globalMinX = min($globalMinX, $minX);
                $globalMaxX = max($globalMaxX, $maxX);
                $globalMinY = min($globalMinY, $minY);
                $globalMaxY = max($globalMaxY, $maxY);
            }
        } else {
            error_log("[RENDER] Ring $ringIdx: insufficient pixel data: " . count($pixelRing));
        }
    }

    // Draw red bounding box around the lake to help debug centering
    if ($globalMinX !== null) {
        $pad = 2; // pixels
        $rx1 = max(0, $globalMinX - $pad);
        $ry1 = max(0, $globalMinY - $pad);
        $rx2 = min($width, $globalMaxX + $pad);
        $ry2 = min($height, $globalMaxY + $pad);
        $red = imagecolorallocate($image, 255, 0, 0);
        // Draw a 2px thick rectangle by drawing two rectangles
        // imagerectangle($image, $rx1, $ry1, $rx2, $ry2, $red);
        // imagerectangle($image, $rx1+1, $ry1+1, $rx2-1, $ry2-1, $red);
    }

    return $image;
}

/**
 * Convert hex color to RGB array
 * 
 * @param string $hex Hex color (e.g. "#FFFFFF" or "FFFFFF")
 * @return array ['r' => 255, 'g' => 255, 'b' => 255]
 */
function hex_to_rgb($hex) {
    $hex = str_replace('#', '', $hex);
    
    if (strlen($hex) === 3) {
        $hex = $hex[0] . $hex[0] . $hex[1] . $hex[1] . $hex[2] . $hex[2];
    }

    if (strlen($hex) !== 6) {
        return ['r' => 128, 'g' => 128, 'b' => 128]; // Default gray
    }

    return [
        'r' => hexdec(substr($hex, 0, 2)),
        'g' => hexdec(substr($hex, 2, 2)),
        'b' => hexdec(substr($hex, 4, 2)),
    ];
}

/**
 * Load colours data from JSON file
 * 
 * @param string $filePath Path to colours.json
 * @return array Colours data indexed by colourId
 */
function load_colours_data($filePath) {
    if (!file_exists($filePath)) {
        return [
            'navy' => ['name' => 'Navy', 'primary' => '#1F3B5C', 'background' => '#FFFFFF'],
            'forest' => ['name' => 'Forest', 'primary' => '#2F5D50', 'background' => '#FFFFFF'],
            'charcoal' => ['name' => 'Charcoal', 'primary' => '#333333', 'background' => '#FFFFFF'],
        ];
    }

    $json = file_get_contents($filePath);
    $data = json_decode($json, true);
    return $data['colours'] ?? [];
}
