<?php
require_once __DIR__ . "/vendor/autoload.php";
require_once "env.php";
require_once "db.php";

$action = $_GET["action"] ?? "";

if ($action === "list") {
    $items = $db->query("SELECT * FROM items")->fetchAll(PDO::FETCH_ASSOC);
    echo json_encode($items);
    exit;
}

if ($action === "add") {
    $name = $_POST["name"];
    $qty = $_POST["qty"];
    $stmt = $db->prepare("INSERT INTO items(name, qty) VALUES(?, ?)");
    $stmt->execute([$name, $qty]);
    exit("OK");
}

if ($action === "delete") {
    $id = $_GET["id"];
    $db->prepare("DELETE FROM items WHERE id=?")->execute([$id]);
    exit("OK");
}

if ($action === "ai") {
    $notes = $_POST["notes"];
    $apiKey = getenv("OPENAI_API_KEY");
    if (!$apiKey || $apiKey === "your_real_openai_api_key_here") {
        exit("Error: OpenAI API key not set.");
    }

    $client = OpenAI::client($apiKey);

    try {
        $response = $client->chat()->create([
            "model" => "gpt-4o-mini",
            "messages" => [
                ["role" => "system", "content" => "Summarize inventory notes professionally and give recommendations."],
                ["role" => "user", "content" => $notes]
            ]
        ]);

        echo $response->choices[0]->message->content;

    } catch (\OpenAI\Exceptions\RateLimitException $e) {
        echo "Rate limit exceeded. Please wait and try again.";
    } catch (\Exception $e) {
        echo "Error: " . $e->getMessage();
    }

    exit;
}

echo "Invalid action.";
