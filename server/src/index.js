import express from 'express';
import cors from 'cors';
import cityRoutes      from './routes/cities.js';
import tileRoutes      from './routes/tiles.js';
import playerRoutes    from './routes/player.js';
import buildingRoutes  from './routes/buildings.js';
import marketRoutes    from './routes/market.js';
import agreementRoutes from './routes/agreements.js';
import researchRoutes  from './routes/research.js';
import marketingRoutes from './routes/marketing.js';
import politicsRoutes  from './routes/politics.js';
import bankRoutes      from './routes/bank.js';
import eventsRoutes    from './routes/events.js';

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.use('/api/cities',     cityRoutes);
app.use('/api/tiles',      tileRoutes);
app.use('/api/player',     playerRoutes);
app.use('/api/buildings',  buildingRoutes);
app.use('/api/market',     marketRoutes);
app.use('/api/agreements', agreementRoutes);
app.use('/api/research',   researchRoutes);
app.use('/api/marketing',  marketingRoutes);
app.use('/api/politics',   politicsRoutes);
app.use('/api/bank',      bankRoutes);
app.use('/api/events',     eventsRoutes);

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

const PORT = process.env.PORT ?? 3001;
app.listen(PORT, () => {
  console.log(`TradeMMO proxy running on http://localhost:${PORT}`);
  if (process.parentPort) {
    process.parentPort.postMessage({ type: 'ready', port: Number(PORT) });
  }
});
