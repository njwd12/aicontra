const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

// Патека до базата
const dbPath = './inventory.db';

// Иницијализација на база
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Database connection error:', err);
  } else {
    console.log(`Connected to SQLite database at: ${dbPath}`);
    initDatabase();
  }
});

function initDatabase() {
  // Избриши ја старата табела и креирај нова
  db.run('DROP TABLE IF EXISTS items', (err) => {
    if (err) {
      console.error('Error dropping table:', err);
      return;
    }
    
    console.log('✓ Cleared old table');
    
    // Креирај нова табела со правилни колони
    db.run(`
      CREATE TABLE items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        qty INTEGER NOT NULL DEFAULT 0,
        lastUpdated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) {
        console.error('Table creation error:', err);
      } else {
        console.log('✓ Created items table with lastUpdated column');
        insertSampleData();
      }
    });
  });
}

function insertSampleData() {
  const sampleItems = [
    ['Apples', 50],
    ['Bottled Water', 120],
    ['Chips', 75],
    ['Chocolate Bars', 40],
    ['Coffee Packets', 30]
  ];
  
  let completed = 0;
  
  sampleItems.forEach(([name, qty]) => {
    db.run('INSERT INTO items (name, qty) VALUES (?, ?)', [name, qty], (err) => {
      if (err) {
        console.error(`Error inserting ${name}:`, err);
      } else {
        console.log(`✓ Inserted: ${name} (${qty})`);
      }
      
      completed++;
      if (completed === sampleItems.length) {
        console.log('✅ All sample data inserted');
      }
    });
  });
}

// OpenAI клиент
let openai = null;
if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.length > 30) {
  try {
    const { OpenAI } = require('openai');
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    console.log('✅ OpenAI client initialized');
  } catch (error) {
    console.warn('❌ Failed to initialize OpenAI:', error.message);
  }
} else {
  console.log('⚠️ OpenAI API key not configured');
  console.log('   AI features will be disabled');
}

// API Endpoints

// GET /api/products - Листа на сите продукти
app.get('/api/products', (req, res) => {
  db.all('SELECT * FROM items ORDER BY lastUpdated DESC', [], (err, rows) => {
    if (err) {
      console.error('Database error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows || []);
  });
});

// POST /api/products - Креирај нов продукт
app.post('/api/products', (req, res) => {
  const { name, qty } = req.body;
  
  if (!name || qty === undefined) {
    res.status(400).json({ error: 'Name and quantity are required' });
    return;
  }
  
  db.run(
    'INSERT INTO items (name, qty) VALUES (?, ?)',
    [name, parseInt(qty)],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      
      db.get('SELECT * FROM items WHERE id = ?', [this.lastID], (err, row) => {
        if (err) {
          res.status(500).json({ error: err.message });
          return;
        }
        res.status(201).json(row);
      });
    }
  );
});

// PUT /api/products/:id - Ажурирај продукт
app.put('/api/products/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const { name, qty } = req.body;
  
  if (!name || qty === undefined) {
    res.status(400).json({ error: 'Name and quantity are required' });
    return;
  }
  
  db.run(
    'UPDATE items SET name = ?, qty = ?, lastUpdated = CURRENT_TIMESTAMP WHERE id = ?',
    [name, parseInt(qty), id],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      
      if (this.changes === 0) {
        res.status(404).json({ error: 'Product not found' });
        return;
      }
      
      db.get('SELECT * FROM items WHERE id = ?', [id], (err, row) => {
        if (err) {
          res.status(500).json({ error: err.message });
          return;
        }
        res.json(row);
      });
    }
  );
});

// DELETE /api/products/:id - Избриши продукт
app.delete('/api/products/:id', (req, res) => {
  const id = parseInt(req.params.id);
  
  db.run('DELETE FROM items WHERE id = ?', [id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    if (this.changes === 0) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }
    
    res.json({ success: true, message: 'Product deleted' });
  });
});

// POST /api/ai - AI анализа
app.post('/api/ai', async (req, res) => {
  try {
    const { notes } = req.body;
    
    if (!notes || notes.trim().length === 0) {
      res.status(400).json({ error: 'Notes are required for AI analysis' });
      return;
    }
    
    if (!openai) {
      res.status(503).json({ 
        error: 'AI service unavailable',
        message: 'OpenAI API key is not configured',
        fix: 'Add OPENAI_API_KEY environment variable in Render dashboard'
      });
      return;
    }
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are an inventory management assistant. Analyze the inventory notes and provide: 1. A concise summary, 2. Key insights, 3. Actionable recommendations. Format the response clearly with bullet points."
        },
        {
          role: "user",
          content: `Please analyze these inventory notes and provide insights:\n\n${notes}`
        }
      ],
      temperature: 0.7,
      max_tokens: 500
    });
    
    const analysis = completion.choices[0].message.content;
    res.json({ analysis });
    
  } catch (error) {
    console.error('OpenAI API error:', error);
    res.status(500).json({ error: 'AI analysis failed' });
  }
});

// GET /api/health - Health check
app.get('/api/health', (req, res) => {
  db.get('SELECT 1 as ok', [], (err) => {
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      database: err ? 'error' : 'connected',
      aiEnabled: openai !== null
    });
  });
});

// GET / - Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'AI Inventory Manager API',
    endpoints: {
      products: '/api/products',
      ai: '/api/ai',
      health: '/api/health'
    }
  });
});

// Стартување на серверот
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 API: https://aicontra.onrender.com/api/products`);
  console.log(`🤖 AI: https://aicontra.onrender.com/api/ai`);
});