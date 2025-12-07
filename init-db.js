const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./inventory.db', (err) => {
  if (err) {
    console.error('Database connection error:', err);
    process.exit(1);
  }
  console.log('Connected to SQLite database for initialization');
});

// Креирај табела и внеси пример податоци
db.serialize(() => {
  // Креирај табела
  db.run(`
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      qty INTEGER NOT NULL DEFAULT 0,
      lastUpdated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) {
      console.error('Error creating table:', err);
    } else {
      console.log('Table created or already exists');
    }
  });

  // Избриши постоечки податоци и внеси нови
  db.run('DELETE FROM items', (err) => {
    if (err) console.error('Error clearing table:', err);
  });

  const stmt = db.prepare('INSERT INTO items (name, qty) VALUES (?, ?)');
  
  const sampleItems = [
    ['Apples', 50],
    ['Bottled Water', 120],
    ['Chips', 75],
    ['Chocolate Bars', 40],
    ['Coffee Packets', 30]
  ];
  
  sampleItems.forEach(item => {
    stmt.run(item, (err) => {
      if (err) console.error('Error inserting item:', err);
    });
  });
  
  stmt.finalize();
  
  db.all('SELECT COUNT(*) as count FROM items', [], (err, rows) => {
    if (err) {
      console.error('Error counting items:', err);
    } else {
      console.log(`Database initialized with ${rows[0].count} sample items`);
    }
    db.close();
    process.exit(0);
  });
});