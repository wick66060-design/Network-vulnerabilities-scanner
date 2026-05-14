/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from "react";
import { 
  ShieldCheck, 
  Search, 
  Activity, 
  Terminal, 
  Zap,
  ChevronRight,
  Globe,
  Monitor,
  ShieldAlert,
  Cpu,
  Info
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import ReactMarkdown from "react-markdown";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

interface ScanUpdate {
  current: number;
  total: number;
  openPorts: number[];
  done?: boolean;
}

export default function App() {
  const [target, setTarget] = useState("127.0.0.1");
  const [subnet, setSubnet] = useState("192.168.1");
  const [discoveredHosts, setDiscoveredHosts] = useState<string[]>([]);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryProgress, setDiscoveryProgress] = useState("");
  const [startPort, setStartPort] = useState(1);
  const [endPort, setEndPort] = useState(1024);
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [openPorts, setOpenPorts] = useState<number[]>([]);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);

  const addLog = (msg: string) => {
    setLogs((prev) => [...prev.slice(-49), `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const startDiscovery = async () => {
    setIsDiscovering(true);
    setDiscoveredHosts([]);
    setLogs([]);
    addLog(`Initiating network discovery on subnet ${subnet}.0/24...`);
    addLog(`Note: In a cloud environment, results may depend on provider internal networking.`);

    const eventSource = new EventSource(`/api/discover?subnet=${subnet}`);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.done) {
        setIsDiscovering(false);
        addLog(`Discovery complete. Found ${discoveredHosts.length} active hosts.`);
        eventSource.close();
        return;
      }

      if (data.activeHosts && data.activeHosts.length > 0) {
        setDiscoveredHosts((prev) => [...new Set([...prev, ...data.activeHosts])]);
        data.activeHosts.forEach((host: string) => addLog(`Device detected at ${host}`));
      }
      setDiscoveryProgress(data.current);
    };

    eventSource.onerror = () => {
      setIsDiscovering(false);
      addLog("Network discovery halted due to connection error.");
      eventSource.close();
    };
  };

  const startScan = async () => {
    setIsScanning(true);
    setOpenPorts([]);
    setAnalysis(null);
    setProgress(0);
    setLogs([]);
    addLog(`Initializing scan for ${target}...`);

    const eventSource = new EventSource(`/api/scan?target=${target}&startPort=${startPort}&endPort=${endPort}`);

    eventSource.onmessage = (event) => {
      const data: ScanUpdate = JSON.parse(event.data);
      
      if (data.done) {
        setIsScanning(false);
        addLog("Scan complete.");
        eventSource.close();
        return;
      }

      if (data.openPorts && data.openPorts.length > 0) {
        setOpenPorts((prev) => [...new Set([...prev, ...data.openPorts])].sort((a, b) => a - b));
        data.openPorts.forEach(p => addLog(`Found open port: ${p}`));
      }

      const currentProgress = Math.round((data.current / data.total) * 100);
      setProgress(currentProgress);
    };

    eventSource.onerror = (err) => {
      console.error("SSE Error:", err);
      addLog("Error occurred during scan.");
      setIsScanning(false);
      eventSource.close();
    };
  };

  const analyzeResults = async () => {
    if (openPorts.length === 0) return;
    setIsAnalyzing(true);
    addLog("Sending results to Gemini AI for deep vulnerability analysis...");
    
    try {
      const prompt = `
        As a cybersecurity expert, analyze the following port scan results for target: ${target}.
        The following ports were found OPEN: ${openPorts.join(", ")}.

        For each port:
        1. Identify the likely service running (e.g., 80: HTTP, 443: HTTPS, 22: SSH).
        2. List potential vulnerabilities associated with common misconfigurations of this service.
        3. Provide actionable remediation steps.

        Format the response in clear Markdown. Use tables for the port summaries. 
        Summarize the overall risk level (Low, Medium, High, Critical) clearly at the top.
      `;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
      });

      setAnalysis(response.text || "No analysis generated.");
      addLog("AI Vulnerability Analysis complete.");
    } catch (err) {
      console.error("AI Error:", err);
      addLog("AI Analysis failed. Check console for details.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans p-4 md:p-8">
      {/* Background decoration */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-20">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-500 blur-[120px] rounded-full" />
      </div>

      <div className="max-w-6xl mx-auto relative z-10">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-500/20 rounded-xl border border-blue-500/30">
              <ShieldCheck className="w-8 h-8 text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                NetScanner <span className="text-blue-400 font-mono text-sm px-2 py-0.5 bg-blue-400/10 rounded border border-blue-400/20">AI</span>
              </h1>
              <p className="text-slate-400 text-sm">Professional Security Analysis Tool</p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-slate-900/50 p-2 px-4 rounded-lg border border-slate-800">
            <Activity className="w-4 h-4 text-green-400" />
            <span className="text-xs font-mono">SYSTEM READY</span>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Controls Panel */}
          <section className="lg:col-span-1 space-y-6">
            {/* Subnet Scanner */}
            <div className="bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-800 p-6 shadow-xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <Globe className="w-12 h-12" />
              </div>
              
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-6 flex items-center gap-2">
                <Search className="w-4 h-4" /> Network Discovery
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5 ml-1">Subnet Base (/24)</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input 
                        type="text" 
                        value={subnet}
                        onChange={(e) => setSubnet(e.target.value)}
                        placeholder="e.g. 192.168.1"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-4 text-sm focus:border-blue-500/50 outline-none transition-all"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 font-mono text-xs">.0</span>
                    </div>
                  </div>
                </div>

                <button 
                  onClick={startDiscovery}
                  disabled={isDiscovering || isScanning}
                  className={`w-full py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all ${
                    isDiscovering 
                      ? "bg-slate-800 text-slate-500 cursor-not-allowed" 
                      : "bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
                  }`}
                >
                  {isDiscovering ? <Activity className="w-5 h-5 animate-spin" /> : <Monitor className="w-5 h-5" />}
                  {isDiscovering ? `PROBING ${discoveryProgress.split('.').pop()}/254` : "DISCOVER HOSTS"}
                </button>

                {discoveredHosts.length > 0 && (
                  <div className="pt-2">
                    <p className="text-[10px] text-slate-500 uppercase font-bold mb-2 ml-1">Detected Devices</p>
                    <div className="space-y-1.5 max-h-[120px] overflow-y-auto pr-2 custom-scrollbar">
                      {discoveredHosts.map(host => (
                        <button
                          key={host}
                          onClick={() => setTarget(host)}
                          className={`w-full flex items-center justify-between p-2 rounded-lg text-xs font-mono transition-colors ${
                            target === host ? "bg-blue-500/20 border border-blue-500/40 text-blue-300" : "bg-slate-950 border border-slate-800 text-slate-400 hover:border-slate-700"
                          }`}
                        >
                          <span>{host}</span>
                          <ChevronRight className={`w-3 h-3 ${target === host ? "opacity-100" : "opacity-0"}`} />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-800 p-6 shadow-xl relative">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-6 flex items-center gap-2">
                <Globe className="w-4 h-4" /> Final Scope
              </h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5 ml-1">Target Address</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input 
                      type="text" 
                      value={target}
                      onChange={(e) => setTarget(e.target.value)}
                      placeholder="e.g. 192.168.1.1"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5 ml-1">Start Port</label>
                    <input 
                      type="number" 
                      value={startPort}
                      onChange={(e) => setStartPort(parseInt(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-4 text-sm focus:border-blue-500/50 outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5 ml-1">End Port</label>
                    <input 
                      type="number" 
                      value={endPort}
                      onChange={(e) => setEndPort(parseInt(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-4 text-sm focus:border-blue-500/50 outline-none transition-all"
                    />
                  </div>
                </div>

                <button 
                  onClick={startScan}
                  disabled={isScanning}
                  className={`w-full py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all ${
                    isScanning 
                      ? "bg-slate-800 text-slate-500 cursor-not-allowed" 
                      : "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20 active:scale-95"
                  }`}
                >
                  {isScanning ? <Activity className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />}
                  {isScanning ? `SCANNING ${progress}%` : "INITIATE SCAN"}
                </button>
              </div>
            </div>

            {/* Results Quick View */}
            <div className="bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-800 p-6 overflow-hidden">
              <div className="flex items-center justify-between mb-4">
                 <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4" /> Open Ports
                </h3>
                <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 text-[10px] font-bold rounded border border-blue-500/20">
                  {openPorts.length} DETECTED
                </span>
              </div>
              
              <div className="grid grid-cols-3 gap-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                <AnimatePresence>
                  {openPorts.map((port) => (
                    <motion.div 
                      key={port}
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="bg-slate-950 border border-green-500/30 rounded-lg p-2 text-center"
                    >
                      <span className="text-xs font-mono text-green-400 font-bold">{port}</span>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {openPorts.length === 0 && !isScanning && (
                   <div className="col-span-3 py-8 text-center text-slate-600">
                    <p className="text-xs italic">No open ports found yet</p>
                  </div>
                )}
              </div>

              {openPorts.length > 0 && (
                <button 
                  onClick={analyzeResults}
                  disabled={isAnalyzing || isScanning}
                  className={`w-full mt-6 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all ${
                    isAnalyzing || isScanning
                      ? "bg-slate-800 text-slate-500"
                      : "bg-indigo-600 hover:bg-indigo-500 text-white"
                  }`}
                >
                  {isAnalyzing ? <Activity className="w-4 h-4 animate-spin" /> : <Cpu className="w-4 h-4" />}
                  AI ANALYSIS REPORT
                </button>
              )}

              <div className="mt-8 flex items-start gap-2 p-3 bg-blue-500/5 rounded-xl border border-blue-500/10">
                <Info className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                <p className="text-[10px] text-slate-500 leading-relaxed italic">
                  Note: Discovery occurs from the cloud server. To scan your local home network, ensure devices have reachable IPs or are routed to this endpoint.
                </p>
              </div>
            </div>
          </section>

          {/* Main Content: Logs & Analysis */}
          <section className="lg:col-span-2 space-y-6">
            {/* Log Terminal */}
            <div className="bg-slate-950 rounded-2xl border border-slate-800 shadow-2xl flex flex-col h-[300px]">
              <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-slate-900/40">
                <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
                  <Terminal className="w-3.5 h-3.5 italic" /> 
                  SCANNER_OUTPUT.LOG
                </div>
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-slate-700" />
                  <div className="w-2.5 h-2.5 rounded-full bg-slate-700" />
                  <div className="w-2.5 h-2.5 rounded-full bg-slate-700" />
                </div>
              </div>
              <div className="flex-1 p-4 font-mono text-[11px] overflow-y-auto space-y-1 custom-scrollbar">
                {logs.length === 0 && <span className="text-slate-700 italic">Waiting for process initiation...</span>}
                {logs.map((log, idx) => (
                  <div key={idx} className="text-blue-300">
                    <span className="text-slate-600">{log.split(']')[0]}]</span> 
                    {log.split(']')[1]}
                  </div>
                ))}
                <div ref={logEndRef} />
              </div>
            </div>

            {/* Analysis Result */}
            <div className="bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-800 p-6 shadow-xl min-h-[400px]">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-purple-400" /> AI Vulnerability Report
                </h3>
              </div>

              {!analysis && !isAnalyzing && (
                <div className="flex flex-col items-center justify-center py-20 text-slate-600 border-2 border-dashed border-slate-800/50 rounded-xl">
                  <Info className="w-10 h-10 mb-4 opacity-20" />
                  <p className="text-sm">Scan a target and click "AI Analysis Report" to generate insights.</p>
                </div>
              )}

              {isAnalyzing && (
                <div className="flex flex-col items-center justify-center py-20">
                  <div className="relative w-16 h-16">
                    <div className="absolute inset-0 border-4 border-indigo-500/20 rounded-full" />
                    <div className="absolute inset-0 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                  <p className="mt-4 text-sm text-indigo-400 animate-pulse font-mono tracking-widest uppercase">Analyzing Threat Vectors...</p>
                </div>
              )}

              {analysis && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="prose prose-invert prose-blue max-w-none prose-sm"
                >
                  <div className="markdown-body">
                    <ReactMarkdown>{analysis}</ReactMarkdown>
                  </div>
                </motion.div>
              )}
            </div>
          </section>
        </div>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(15, 23, 42, 0.5);
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(51, 65, 85, 0.8);
          border-radius: 10px;
        }
        .markdown-body table {
          width: 100%;
          border-collapse: collapse;
          margin: 1rem 0;
          font-size: 0.8rem;
          background: rgba(0, 0, 0, 0.2);
          border-radius: 8px;
          overflow: hidden;
        }
        .markdown-body th, .markdown-body td {
          border: 1px solid rgba(30, 41, 59, 1);
          padding: 8px 12px;
          text-align: left;
        }
        .markdown-body th {
          background: rgba(30, 41, 59, 0.8);
          color: white;
        }
        .markdown-body h1, .markdown-body h2, .markdown-body h3 {
          color: #93c5fd;
          margin-top: 1.5rem;
          margin-bottom: 0.75rem;
          font-weight: 700;
        }
      `}</style>
    </div>
  );
}
