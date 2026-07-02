import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json()); // Mengizinkan parsing JSON body

// Health Check Route
app.get('/', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'success',
    message: 'SIMPUL Backend API is running!'
  });
});

// Jalankan Server
app.listen(PORT, () => {
  console.log(`🚀 Server SIMPUL berjalan di http://localhost:${PORT}`);
});
