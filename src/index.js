import dotenv from "dotenv";
import connectDB from "./db/index.js";
import { app } from "./app.js";

dotenv.config("./.env");

connectDB()
  .then(() => {
    const PORT = process.env.PORT || 4000;
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on http://0.0.0.0:${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/health`);
    });
  })

  .catch((error) => {
    console.log("Mongodb connection error", error);
  });
