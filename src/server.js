import { createApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const app = createApp();

app.listen(config.port, () => {
  console.log(`Fantasy Betting API listening on http://localhost:${config.port}`);
});