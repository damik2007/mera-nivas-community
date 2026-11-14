import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";

import authRoutes from "./routes/auth";
import directoryRoutes from "./routes/directory";
import eventRoutes from "./routes/events";
import noticeRoutes from "./routes/notices";
import billingRoutes from "./routes/billing";
import guestRoutes from "./routes/guests";
import parkingRoutes from "./routes/parking";
import notificationRoutes from "./routes/notifications";
import adminRoutes from "./routes/admin";
import { setIO } from "./lib/realtime";

// In production, refuse to start without real secrets. Otherwise the built-in
// development defaults would be used, and anyone who knows them could forge logins.
if (process.env.NODE_ENV === "production") {
  const required = [
    "DATABASE_URL",
    "CORS_ORIGIN",
    "JWT_ACCESS_SECRET",
    "JWT_REFRESH_SECRET",
    "QR_SIGNING_SECRET",
    "PASSWORD_RESET_SECRET",
  ];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(", ")}`);
    process.exit(1);
  }
}

const app = express();
// Behind cPanel's reverse proxy, req.ip would otherwise be the proxy's own
// address for every request, which would defeat per-IP rate limiting.
app.set("trust proxy", 1);
const httpServer = createServer(app);

const io = new SocketIOServer(httpServer, {
  cors: { origin: process.env.CORS_ORIGIN || "*" },
});
setIO(io);

io.on("connection", (socket) => {
  // Clients join a room per society so events can be scoped.
  socket.on("join-society", (societyId: string) => {
    socket.join(`society:${societyId}`);
  });
});

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json());
app.use(morgan("dev"));

app.get("/health", (_req, res) => res.json({ ok: true, service: "mycommunity-api" }));

app.use("/auth", authRoutes);
app.use("/directory", directoryRoutes);
app.use("/events", eventRoutes);
app.use("/notices", noticeRoutes);
app.use("/bills", billingRoutes);
app.use("/guests", guestRoutes);
app.use("/parking", parkingRoutes);
app.use("/notifications", notificationRoutes);
app.use("/admin", adminRoutes);

// Central error handler — keeps stack traces out of API responses.
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || "Internal server error" });
});

const PORT = Number(process.env.PORT) || 4000;
httpServer.listen(PORT, () => {
  console.log(`Mera Nivas API listening on http://localhost:${PORT}`);
});
