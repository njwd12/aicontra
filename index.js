const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json());

let products = [];

app.get('/api/products', (req, res) => res.json(products));

app.post('/api/products', (req, res) => {
  const product = { id: Date.now(), ...req.body, lastUpdated: new Date() };
  products.push(product);
  res.json(product);
});

app.put('/api/products/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const index = products.findIndex(p => p.id === id);
  if (index !== -1) {
    products[index] = { ...products[index], ...req.body, lastUpdated: new Date() };
    res.json(products[index]);
  } else res.status(404).json({ error: 'Not found' });
});

app.delete('/api/products/:id', (req, res) => {
  const id = parseInt(req.params.id);
  products = products.filter(p => p.id !== id);
  res.json({ success: true });
});

app.listen(10000, () => console.log('Server running on port 10000'));
