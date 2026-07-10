<?php
/**
 * Generate an SVG preview for a design.
 * Returns an `image/svg+xml` response representing the design geometry.
 *
 * @param mysqli $connect MySQLi connection resource.
 * @param string $id Design identifier.
 * @return void Outputs SVG and exits.
 */
function get_design_lake_svg($connect, $id) {

    $design = find_design($connect, $id);

    if (!$design) {
        http_response_code(404);
        respond(false, ["error" => "Design not found"]);
    }

    $state = $design['state_json'];

    header("Content-Type: image/svg+xml");

    $width = 400;
    $height = 400;
    $padding = 20;

    $geo = $state['geojson'] ?? null;

    if (is_string($geo) && $geo !== '') {
        $decoded = json_decode($geo, true);
        if ($decoded !== null) $geo = $decoded;
    }

    // Colours
    // $colours = get_colours_data();
    // $colour = $colours['colours'][$state['colourId']]['primary'];

    $backgroundColor = '#FFFFFF';
    $lakeColor = '#000000';

    if(isset($_GET['colour'])) {
        $customColour = $_GET['colour'];
        if(preg_match('/^#[0-9A-Fa-f]{6}$/', $customColour)) {
            $lakeColor = $customColour;
        }
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

            // GEOGRAPHIC CORRECTION: Apply cosine correction to longitude for latitude convergence
            // At higher latitudes, degrees of longitude represent shorter distances than degrees of latitude.
            // Using a uniform scale preserves the true geographic aspect ratio of the lake.
            $cosLat = cos(deg2rad($centerLat));
            $correctedRotDx = $rotDx * $cosLat;  // Correct longitude range
            $maxRotGeoRange = max($correctedRotDx, $rotDy);  // Use max for uniform scaling
            
            // base scale fits the rotated bbox into the thumbnail taking into account user zoom
            // Use the same scale for both axes to preserve geographic proportions
            $baseScale = (min($width - 2 * $padding, $height - 2 * $padding) / $maxRotGeoRange) / max($zoom, 1e-6);

            // compute transform functions using scale and center it in the thumbnail
            $centerX = $width / 2;
            $centerY = $height / 2;

            // Apply cosine correction to longitude in the transform functions
            $transformX = function($lon) use ($centerLon, $baseScale, $centerX, $cosLat) {
                return (($lon - $centerLon) * $cosLat) * $baseScale + $centerX;
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
                $paths .= '<path d="' . $d . '" fill="' . $lakeColor . '" fill-rule="evenodd" stroke="none" />';
            } elseif ($type === 'MultiPolygon') {
                foreach ($geo['coordinates'] as $poly) {
                    $d = '';
                    foreach ($poly as $ring) {
                        $d .= $buildPathFromRing($ring);
                    }
                    $paths .= '<path d="' . $d . '" fill="' . $lakeColor . '" fill-rule="evenodd" stroke="none" />';
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
                    $paths .= '<path d="' . $d . '" fill="none" stroke="' . $lakeColor . '" stroke-width="1.5" />';
                }
            } elseif ($type === 'Point' || $type === 'MultiPoint') {
                $pts = $geo['coordinates'];
                if ($type === 'Point') $pts = [$pts];
                foreach ($pts as $pt) {
                    $x = $transformX($pt[0]);
                    $y = $transformY($pt[1]);
                    $paths .= '<circle cx="' . $x . '" cy="' . $y . '" r="2" fill="' . $lakeColor . '" />';
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

            <rect width="' . $width . '" height="' . $height . '" fill="transparent"/>

            ' . $paths . '

        </svg>';

    exit;

}
