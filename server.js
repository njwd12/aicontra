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
const dbPath = process.env.DATABASE_URL || './inventory.db';

// Провери дали постои data папката на Render
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log(`Created directory: ${dataDir}`);
}

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
  // Креирај табела ако не постои
  db.run(`
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      qty INTEGER NOT NULL DEFAULT 0,
      lastUpdated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) {
      console.error('Table creation error:', err);
    } else {
      console.log('Items table ready');
      
      // Провери дали има податоци, ако не, внеси примерни
      db.get('SELECT COUNT(*) as count FROM items', [], (err, row) => {
        if (err) {
          console.error('Error counting items:', err);
        } else if (row.count === 0) {
          console.log('Database empty, inserting sample data...');
          insertSampleData();
        } else {
          console.log(`Database has ${row.count} items`);
        }
      });
    }
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
  
  const stmt = db.prepare('INSERT INTO items (name, qty) VALUES (?, ?)');
  
  sampleItems.forEach(([name, qty], index) => {
    stmt.run(name, qty, (err) => {
      if (err) {
        console.error(`Error inserting ${name}:`, err);
      } else {
        console.log(`✓ Inserted: ${name} (${qty})`);
      }
      
      // После последниот, затвори го statement
      if (index === sampleItems.length - 1) {
        stmt.finalize();
        console.log('✅ Sample data inserted successfully');
      }
    });
  });
}

// OpenAI клиент - креирај го само ако има клуч
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
  // Провери дали базата работи
  db.get('SELECT 1 as ok', [], (err) => {
    const dbStatus = err ? 'error' : 'ok';
    
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      service: 'AI Inventory Manager API',
      database: dbStatus,
      aiEnabled: openai !== null,
      endpoints: {
        products: '/api/products',
        ai: '/api/ai',
        health: '/api/health'
      }
    });
  });
});

// GET / - Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'AI Inventory Manager API',
    version: '1.0.0',
    endpoints: {
      products: '/api/products',
      ai: '/api/ai', 
      health: '/api/health'
    },
    documentation: 'See README for API usage'
  });
});

// Стартување на серверот
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 Available at: https://aicontra.onrender.com`);
  console.log(`📊 API: https://aicontra.onrender.com/api/products`);
  console.log(`🤖 AI: https://aicontra.onrender.com/api/ai`);
  console.log(`❤️ Health: https://aicontra.onrender.com/api/health`);
  console.log(`🔧 OpenAI: ${openai ? 'ENABLED' : 'DISABLED (no API key)'}`);
});