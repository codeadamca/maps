<?php

function add_center_text(
    $canvas,
    $x,
    $y,
    $width,
    $colour,
    $fontSize,
    $fontPath,
    $text
) {

    if (!file_exists($fontPath)) {
        return false;
    }

    $bbox = imagettfbbox($fontSize, 0, $fontPath, $text);

    $textWidth = max($bbox[2], $bbox[4]) - min($bbox[0], $bbox[6]);

    $textX = $x + (($width - $textWidth) / 2);
    $textY = $y + $fontSize;

    $hex = ltrim($colour, '#');
    $colour = imagecolorallocate(
        $canvas,
        hexdec(substr($hex, 0, 2)),
        hexdec(substr($hex, 2, 2)),
        hexdec(substr($hex, 4, 2))
    );
    
    /*
    echo 'tx: '.$textX . ', ty: ' . $textY.'<br>';
    echo $fontSize.'<br>';
    echo 'col: '.$colour.'<br>';
    echo $fontPath.'<br>';
    echo (file_exists($fontPath) ? 'Font file exists' : 'Font file does not exist').'<br>';
    echo $text.'<br>';
    die();
    */
    
    imagettftext(
        $canvas,
        $fontSize,
        0,
        $textX,
        $textY,
        $colour,
        $fontPath,
        $text
    );
    
}

function add_text(
    $canvas,
    $x,
    $y,
    $colour,
    $fontSize,
    $fontPath,
    $text
) {

    if (!file_exists($fontPath)) {
        return false;
    }

    $bbox = imagettfbbox($fontSize, 0, $fontPath, $text);

    $hex = ltrim($colour, '#');
    $colour = imagecolorallocate(
        $canvas,
        hexdec(substr($hex, 0, 2)),
        hexdec(substr($hex, 2, 2)),
        hexdec(substr($hex, 4, 2))
    );
    
    /*
    echo 'tx: '.$textX . ', ty: ' . $textY.'<br>';
    echo $fontSize.'<br>';
    echo 'col: '.$colour.'<br>';
    echo $fontPath.'<br>';
    echo (file_exists($fontPath) ? 'Font file exists' : 'Font file does not exist').'<br>';
    echo $text.'<br>';
    die();
    */
    
    imagettftext(
        $canvas,
        $fontSize,
        0,
        $x,
        $y,
        $colour,
        $fontPath,
        $text
    );
    
}

function add_rectangle($canvas, $x, $y, $colour, $width, $height) {

    // Expect $colour as hex string like '#rrggbb' or 'rrggbb'
    $hex = ltrim($colour, '#');
    if (strlen($hex) !== 6) {
        return false;
    }

    $r = hexdec(substr($hex, 0, 2));
    $g = hexdec(substr($hex, 2, 2));
    $b = hexdec(substr($hex, 4, 2));

    $col = imagecolorallocate($canvas, $r, $g, $b);
    if ($col === false) {
        return false;
    }

    // Draw filled rectangle from (x,y) to (x+width, y+height)
    imagefilledrectangle($canvas, $x, $y, $x + $width, $y + $height, $col);

    return true;

}

/**
 * Format a latitude/longitude coordinate to a fixed number of decimal places.
 * Returns a string with the specified decimals (default 4).
 *
 * @param float|string $value
 * @param int $decimals
 * @return string|null  Formatted coordinate string or null if input not numeric
 */
function format_coord($value, $decimals = 4) {
    if (!is_numeric($value)) {
        return null;
    }

    $dec = max(0, (int)$decimals);
    return number_format((float)$value, $dec, '.', '');
}

function add_image($canvas, $x, $y, $imagePath, $width = null, $height = null, $opacity = 100) {

    if (!file_exists($imagePath)) {
        return false;
    }

    $ext = strtolower(pathinfo($imagePath, PATHINFO_EXTENSION));

    switch ($ext) {
        case 'png':
            $image = imagecreatefrompng($imagePath);
            break;

        case 'jpg':
        case 'jpeg':
            $image = imagecreatefromjpeg($imagePath);
            break;

        case 'gif':
            $image = imagecreatefromgif($imagePath);
            break;

        default:
            return false;
    }

    $srcWidth = imagesx($image);
    $srcHeight = imagesy($image);

    // Determine destination size
    $dstW = ($width !== null) ? $width : $srcWidth;
    $dstH = ($height !== null) ? $height : $srcHeight;

    // If fully opaque, copy directly to canvas (preserve alpha for PNGs)
    if ((int)$opacity === 100) {
        if ($dstW !== $srcWidth || $dstH !== $srcHeight) {
            imagecopyresampled(
                $canvas,
                $image,
                $x,
                $y,
                0,
                0,
                $dstW,
                $dstH,
                $srcWidth,
                $srcHeight
            );
        } else {
            imagecopy(
                $canvas,
                $image,
                $x,
                $y,
                0,
                0,
                $srcWidth,
                $srcHeight
            );
        }

        imagedestroy($image);
        return true;
    }

    // For partial transparency, prepare an overlay and merge with specified opacity
    $overlay = imagecreatetruecolor($dstW, $dstH);
    imagealphablending($overlay, false);
    imagesavealpha($overlay, true);

    // Fill with fully transparent background
    $transparent = imagecolorallocatealpha($overlay, 0, 0, 0, 127);
    imagefill($overlay, 0, 0, $transparent);

    // Copy/resample source into overlay
    if ($dstW !== $srcWidth || $dstH !== $srcHeight) {
        imagecopyresampled(
            $overlay,
            $image,
            0,
            0,
            0,
            0,
            $dstW,
            $dstH,
            $srcWidth,
            $srcHeight
        );
    } else {
        imagecopy(
            $overlay,
            $image,
            0,
            0,
            0,
            0,
            $srcWidth,
            $srcHeight
        );
    }

    // Merge overlay onto canvas with opacity (imagecopymerge uses 0-100)
    imagealphablending($canvas, true);
    imagesavealpha($canvas, true);
    $pct = max(0, min(100, (int)$opacity));
    imagecopymerge($canvas, $overlay, $x, $y, 0, 0, $dstW, $dstH, $pct);

    imagedestroy($overlay);
    imagedestroy($image);

    return true;

}

function add_remote_image($canvas, $x, $y, $url) {

    $imageData = file_get_contents($url);
    if ($imageData === false) {
        return false;
    }

    $overlay = imagecreatefromstring($imageData);
    if (!$overlay) {
        return false;
    }

    imagealphablending($canvas, true);
    imagesavealpha($canvas, true);

    imagecopy(
        $canvas,
        $overlay,
        $x,
        $y,
        0,
        0,
        imagesx($overlay),
        imagesy($overlay)
    );

    imagedestroy($overlay);

    return true;
    
}