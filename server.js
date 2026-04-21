const express = require('express');
const path = require('path');
const fs = require('fs');
require('dotenv').config();
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// Serve config.js with the access token
app.get('/config.js', (req, res) => {
  const token = process.env.MAPBOX_ACCESS_TOKEN || '';
  res.type('application/javascript');
  res.send(`window.MAPBOX_ACCESS_TOKEN = "${token}";\n`);
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
