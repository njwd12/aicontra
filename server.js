const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const { OpenAI } = require('openai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());

// Иницијализација на база
const db = new sqlite3.Database(process.env.DATABASE_URL || './inventory.db', (err) => {
  if (err) {
    console.error('Database connection error:', err);
  } else {
    console.log('Connected to SQLite database');
    initDatabase();
  }
});

function initDatabase() {
  db.run(`
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      qty INTEGER NOT NULL DEFAULT 0,
      lastUpdated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) console.error('Table creation error:', err);
    else console.log('Items table ready');
  });
}

// Иницијализација на OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// API Endpoints

// GET /api/products - Листа на сите продукти
app.get('/api/products', (req, res) => {
  db.all('SELECT * FROM items ORDER BY lastUpdated DESC', [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// GET /api/products/:id - Детали за продукт
app.get('/api/products/:id', (req, res) => {
  const id = parseInt(req.params.id);
  db.get('SELECT * FROM items WHERE id = ?', [id], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (!row) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }
    res.json(row);
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

// POST /api/ai - AI анализа на белешки
app.post('/api/ai', async (req, res) => {
  try {
    const { notes } = req.body;
    
    if (!notes || notes.trim().length === 0) {
      res.status(400).json({ error: 'Notes are required for AI analysis' });
      return;
    }
    
    if (!process.env.OPENAI_API_KEY) {
      res.status(500).json({ error: 'OpenAI API key is not configured' });
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
    
    if (error.status === 429) {
      res.status(429).json({ error: 'Rate limit exceeded. Please wait a moment and try again.' });
    } else if (error.status === 401) {
      res.status(500).json({ error: 'Invalid OpenAI API key configuration' });
    } else {
      res.status(500).json({ error: 'AI analysis failed. Please try again later.' });
    }
  }
});

// GET /api/health - Health check за Render
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'AI Inventory Manager API'
  });
});

// Стартување на серверот
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 API available at http://localhost:${PORT}/api/products`);
  console.log(`🤖 AI endpoint at http://localhost:${PORT}/api/ai`);
});