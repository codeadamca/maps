<?php

$query = 'whitestone lake';
$limit = 100;
$countrycodes = 'us,ca';

$url = 'https://nominatim.openstreetmap.org/search?' .
    'format=jsonv2&' .
    'addressdetails=1&' .
    'extratags=1&' .
    'namedetails=1&' .
    'limit=' . intval($limit) . '&' .
    'countrycodes=' . urlencode($countrycodes) . '&' .
    'q=' . urlencode($query);

// GET to Nominatim
$ch = curl_init($url);

curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Accept: application/json'
]);

curl_setopt(
    $ch,
    CURLOPT_USERAGENT,
    isset($env['USER_AGENT']) 
        ? $env['USER_AGENT'] 
        : 'map-poster-test/1.0 (local)'
);

curl_setopt($ch, CURLOPT_TIMEOUT, 20);

$response = curl_exec($ch);

$err = curl_error($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

curl_close($ch);

if ($response === false) {
    die("cURL error: " . $err);
}

if ($httpCode < 200 || $httpCode >= 300) {
    die("HTTP error: " . $httpCode . "\n" . $response);
}

$results = json_decode($response, true);

echo '<pre>';
print_r($results);
echo '</pre>';

die();