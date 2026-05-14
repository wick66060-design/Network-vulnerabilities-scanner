import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import net from "net";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route: Host Discovery (Subnet Scan)
  app.get("/api/discover", async (req, res) => {
    const { subnet } = req.query; // Expects format like "192.168.1"
    if (!subnet) return res.status(400).json({ error: "Missing subnet" });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const commonPorts = [80, 443, 22, 53, 8080];
    
    const checkHost = (ip: string): Promise<{ ip: string; status: "up" | "down" }> => {
      return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(400); // Fast timeout for discovery
        
        let resolved = false;
        const cleanup = () => {
          if (resolved) return;
          resolved = true;
          socket.destroy();
        };

        socket.on("connect", () => {
          cleanup();
          resolve({ ip, status: "up" });
        });
        
        socket.on("timeout", () => {
          cleanup();
          resolve({ ip, status: "down" });
        });
        
        socket.on("error", () => {
          cleanup();
          resolve({ ip, status: "down" });
        });

        // Try connecting to port 80 to see if it's up
        socket.connect(80, ip);
      });
    };

    const ips = Array.from({ length: 254 }, (_, i) => `${subnet}.${i + 1}`);
    const batchSize = 32;

    for (let i = 0; i < ips.length; i += batchSize) {
      const batch = ips.slice(i, i + batchSize);
      const results = await Promise.all(batch.map(checkHost));
      const active = results.filter(r => r.status === "up").map(r => r.ip);

      res.write(`data: ${JSON.stringify({ 
        current: ips[Math.min(i + batchSize - 1, ips.length - 1)],
        activeHosts: active 
      })}\n\n`);
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  });

  // API Route: Port Scanner (SSE)
  app.get("/api/scan", async (req, res) => {
    const { target, startPort, endPort } = req.query;

    if (!target || !startPort || !endPort) {
      return res.status(400).json({ error: "Missing parameters" });
    }

    const sStart = parseInt(startPort as string);
    const sEnd = parseInt(endPort as string);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const checkPort = (port: number): Promise<{ port: number; status: "open" | "closed" }> => {
      return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(800);
        
        socket.once("connect", () => {
          socket.destroy();
          resolve({ port, status: "open" });
        });
        
        socket.once("timeout", () => {
          socket.destroy();
          resolve({ port, status: "closed" });
        });
        
        socket.once("error", () => {
          socket.destroy();
          resolve({ port, status: "closed" });
        });
        
        socket.connect(port, target as string);
      });
    };

    const portsToScan = Array.from({ length: sEnd - sStart + 1 }, (_, i) => sStart + i);
    const batchSize = 25;

    for (let i = 0; i < portsToScan.length; i += batchSize) {
      const batch = portsToScan.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map(checkPort));
      
      const openInBatch = batchResults.filter(r => r.status === "open");

      res.write(`data: ${JSON.stringify({ 
        current: portsToScan[Math.min(i + batchSize - 1, portsToScan.length - 1)], 
        total: sEnd, 
        openPorts: openInBatch.map(r => r.port) 
      })}\n\n`);
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
