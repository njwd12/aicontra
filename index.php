<?php
// Modern AI Inventory Manager
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AI Inventory Manager</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="styles.css">
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body>
<h1>AI Inventory Manager</h1>

<div class="container">
    <!-- Add Item -->
    <h2>Add Item</h2>
    <input id="name" placeholder="Item name">
    <input id="qty" type="number" placeholder="Quantity">
    <button onclick="addItem()">Add Item</button>

    <!-- Inventory List -->
    <h2>Inventory</h2>
    <div id="items"></div>

    <!-- Inventory Chart -->
    <canvas id="inventoryChart" height="150"></canvas>

    <!-- AI Summary -->
    <h2>AI Summary & Recommendations</h2>
    <textarea id="notes" placeholder="Write notes about your stock..."></textarea>
    <button onclick="aiGenerate()">Generate AI Summary</button>
    <div id="ai_output"></div>
</div>

<script>
let inventoryData = [];

async function loadItems() {
    let res = await fetch('api.php?action=list');
    inventoryData = await res.json();
    const itemsDiv = document.getElementById("items");
    itemsDiv.innerHTML = "";
    inventoryData.forEach(item => {
        const div = document.createElement("div");
        div.className = "item";
        div.innerHTML = `<b>${item.name}</b> (${item.qty}) 
            <button onclick="deleteItem(${item.id})">Delete</button>`;
        itemsDiv.appendChild(div);
    });
    updateChart();
}

async function addItem() {
    const name = document.getElementById('name').value;
    const qty = document.getElementById('qty').value;
    if(!name || !qty) { alert("Enter name and quantity"); return; }

    await fetch('api.php?action=add', {
        method: 'POST',
        body: new URLSearchParams({ name, qty })
    });
    document.getElementById('name').value = '';
    document.getElementById('qty').value = '';
    loadItems();
}

async function deleteItem(id) {
    if(!confirm("Delete this item?")) return;
    await fetch('api.php?action=delete&id=' + id);
    loadItems();
}

async function aiGenerate() {
    const notes = document.getElementById("notes").value;
    if(!notes) return alert("Enter notes to generate AI summary");
    document.getElementById("ai_output").innerText = "Generating...";

    try {
        let res = await fetch('api.php?action=ai', {
            method: 'POST',
            body: new URLSearchParams({ notes })
        });
        const text = await res.text();
        document.getElementById("ai_output").innerText = text;
    } catch(e) {
        document.getElementById("ai_output").innerText = "Error: " + e.message;
    }
}

function updateChart() {
    const ctx = document.getElementById('inventoryChart').getContext('2d');
    const labels = inventoryData.map(i => i.name);
    const quantities = inventoryData.map(i => i.qty);

    if(window.inventoryChart) window.inventoryChart.destroy();

    window.inventoryChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Quantity',
                data: quantities,
                backgroundColor: 'rgba(59, 130, 246, 0.6)',
                borderColor: 'rgba(59, 130, 246, 1)',
                borderWidth: 1
            }]
        },
        options: { responsive: true, plugins: { legend: { display: false } } }
    });
}

loadItems();
</script>
</body>
</html>
