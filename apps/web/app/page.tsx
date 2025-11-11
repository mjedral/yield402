"use client";

import { useState, useEffect } from "react";
import { Wallet, TrendingUp, DollarSign, Percent, ArrowUpCircle, ArrowDownCircle, RefreshCw } from "lucide-react";
import { TreasuryModal } from "./components/TreasuryModal";
import { TransactionsTable } from "./components/TransactionsTable";
import { Toaster } from "react-hot-toast";
import Link from "next/link";

interface Balances {
  cashBufferUsdc: number;
  inYieldUsdc: number;
  estimatedApyPercent: number | null;
  lastUpdated?: string;
}

export default function TreasuryDashboard() {
  const [balances, setBalances] = useState<Balances>({
    cashBufferUsdc: 0,
    inYieldUsdc: 0,
    estimatedApyPercent: null,
  });
  const [loading, setLoading] = useState(true);
  const [depositModalOpen, setDepositModalOpen] = useState(false);
  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

  const fetchBalances = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/treasury/balances`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setBalances({
          cashBufferUsdc: data.cashBufferUsdc ?? 0,
          inYieldUsdc: data.inYieldUsdc ?? 0,
          estimatedApyPercent: data.estimatedApyPercent ?? null,
          lastUpdated: data.lastUpdated,
        });
      }
    } catch (e) {
      console.error("Failed to fetch balances:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBalances();
  }, [refreshTrigger]);

  const totalBalance = balances.cashBufferUsdc + balances.inYieldUsdc;
  const estimatedYearlyYield = balances.inYieldUsdc * (balances.estimatedApyPercent || 0) / 100;

  const handleModalSuccess = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Toaster position="top-right" />

      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <img
              src="/yield402-logo.png"
              alt="yield402"
              className="h-20 w-auto"
            />
            <button
              onClick={fetchBalances}
              disabled={loading}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
              title="Refresh balances"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        {/* Portfolio Overview */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900">Portfolio</h2>
            <div className="text-right">
              <p className="text-sm text-gray-600">Total Value</p>
              <p className="text-3xl font-semibold text-gray-900">${totalBalance.toFixed(2)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Wallet className="w-4 h-4 text-gray-600" />
                <p className="text-xs font-medium text-gray-600">Cash Buffer</p>
              </div>
              <p className="text-2xl font-semibold text-gray-900">${balances.cashBufferUsdc.toFixed(2)}</p>
            </div>

            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-gray-600" />
                <p className="text-xs font-medium text-gray-600">In Yield</p>
              </div>
              <p className="text-2xl font-semibold text-gray-900">${balances.inYieldUsdc.toFixed(2)}</p>
            </div>

            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Percent className="w-4 h-4 text-gray-600" />
                <p className="text-xs font-medium text-gray-600">Current APY</p>
              </div>
              <p className="text-2xl font-semibold text-gray-900">
                {balances.estimatedApyPercent !== null && typeof balances.estimatedApyPercent === "number"
                  ? `${balances.estimatedApyPercent.toFixed(2)}%`
                  : "—%"}
              </p>
            </div>

            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-4 h-4 text-gray-600" />
                <p className="text-xs font-medium text-gray-600">Est. Yearly</p>
              </div>
              <p className="text-2xl font-semibold text-gray-900">${estimatedYearlyYield.toFixed(2)}</p>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Actions</h2>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => setDepositModalOpen(true)}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gray-900 text-white font-medium rounded-lg hover:bg-gray-800 transition-colors"
            >
              <ArrowUpCircle className="w-4 h-4" />
              Deposit
            </button>
            <button
              onClick={() => setWithdrawModalOpen(true)}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              <ArrowDownCircle className="w-4 h-4" />
              Withdraw
            </button>
            <Link
              href="/demo"
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors text-center"
            >
              📄 Demo Paywall
            </Link>
          </div>
        </div>

        {/* Transactions History */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Recent Transactions</h2>
          </div>
          <div className="p-6">
            <TransactionsTable refreshTrigger={refreshTrigger} />
          </div>
        </div>

        {/* Strategy Info */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-sm font-medium text-gray-600 mb-3">Strategy</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Protocol</span>
              <span className="font-medium text-gray-900">Solend Main Pool</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Network</span>
              <span className="font-medium text-gray-900">Solana Mainnet</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Auto-Rebalance</span>
              <span className="font-medium text-green-600">Active</span>
            </div>
          </div>
        </div>
      </main>

      {/* Modals */}
      <TreasuryModal
        isOpen={depositModalOpen}
        onClose={() => setDepositModalOpen(false)}
        type="deposit"
        currentBalance={balances.cashBufferUsdc}
        onSuccess={handleModalSuccess}
      />
      <TreasuryModal
        isOpen={withdrawModalOpen}
        onClose={() => setWithdrawModalOpen(false)}
        type="withdraw"
        currentBalance={balances.inYieldUsdc}
        onSuccess={handleModalSuccess}
      />
    </div>
  );
}
