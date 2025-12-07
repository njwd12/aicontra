<?php
$env = file(".env", FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);

foreach ($env as $line) {
    if (strpos($line, "=") === false) continue;
    list($key, $value) = explode("=", $line, 2);
    putenv("$key=$value");
}
