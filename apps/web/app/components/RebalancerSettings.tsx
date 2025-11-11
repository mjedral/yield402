"use client";

import { useState, useEffect } from "react";
import { Settings, Save } from "lucide-react";

interface RebalancerConfig {
  minBufferUsdc: number;
  minDepositUsdc: number;
  cooldownSec: number;
}

export function RebalancerSettings() {
  const [config, setConfig] = useState<RebalancerConfig>({
    minBufferUsdc: 10,
    minDepositUsdc: 1,
    cooldownSec: 180,
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const res = await fetch(`${apiBase}/rebalancer/config`);
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
      }
    } catch (e) {
      console.error("Failed to fetch rebalancer config:", e);
    }
  };

  const saveConfig = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`${apiBase}/rebalancer/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        setMessage("Configuration saved successfully!");
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage("Failed to save configuration");
      }
    } catch (e) {
      setMessage("Error saving configuration");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center gap-2 mb-4">
        <Settings className="w-5 h-5 text-gray-700" />
        <h2 className="text-lg font-semibold text-gray-900">Rebalancer Settings</h2>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Cash Buffer (USDC)
          </label>
          <input
            type="number"
            step="0.1"
            value={config.minBufferUsdc}
            onChange={(e) => setConfig({ ...config, minBufferUsdc: parseFloat(e.target.value) || 0 })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="10"
          />
          <p className="text-xs text-gray-500 mt-1">
            Minimum USDC to keep in wallet (not deposited)
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Minimum Deposit (USDC)
          </label>
          <input
            type="number"
            step="0.1"
            value={config.minDepositUsdc}
            onChange={(e) => setConfig({ ...config, minDepositUsdc: parseFloat(e.target.value) || 0 })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="1"
          />
          <p className="text-xs text-gray-500 mt-1">
            Minimum excess to trigger auto-deposit
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Cooldown (seconds)
          </label>
          <input
            type="number"
            value={config.cooldownSec}
            onChange={(e) => setConfig({ ...config, cooldownSec: parseInt(e.target.value) || 0 })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="180"
          />
          <p className="text-xs text-gray-500 mt-1">
            Time between auto-deposits (prevents spam)
          </p>
        </div>

        <button
          onClick={saveConfig}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Save className="w-4 h-4" />
          {loading ? "Saving..." : "Save Configuration"}
        </button>

        {message && (
          <div className={`text-sm text-center ${message.includes("success") ? "text-green-600" : "text-red-600"}`}>
            {message}
          </div>
        )}
      </div>
    </div>
  );
}

