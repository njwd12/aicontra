<?php
// Initialize SQLite DB with sample items
$db = new PDO("sqlite:inventory.db");

$db->exec("DROP TABLE IF EXISTS items");
$db->exec("
CREATE TABLE items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    qty INTEGER NOT NULL
)
");

$db->exec("INSERT INTO items(name, qty) VALUES
    ('Apples', 10),
    ('Water Bottles', 25),
    ('Chips', 50)
");

echo "Database initialized!";
