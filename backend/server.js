const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

const posRoutes = require("./routes/posRoutes");

app.use("/api", posRoutes);

const orderRoutes = require("./routes/order");

app.use("/api/order", orderRoutes);

const salesRoutes = require("./routes/sales");
app.use("/api/sales", salesRoutes);

app.get("/", (req, res) => {
  res.send("POS Backend Running");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on ${PORT}`);
});