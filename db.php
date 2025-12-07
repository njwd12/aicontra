<?php
$db = new PDO("sqlite:inventory.db");
$db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
