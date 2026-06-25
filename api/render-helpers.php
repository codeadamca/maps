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

function add_image($canvas, $x, $y, $imagePath, $width = null, $height = null) {

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

    if ($width !== null && $height !== null) {

        imagecopyresampled(
            $canvas,
            $image,
            $x,
            $y,
            0,
            0,
            $width,
            $height,
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