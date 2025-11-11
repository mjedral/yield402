"use client";

import { useState, useEffect } from "react";
import { ExternalLink, ArrowDownCircle, ArrowUpCircle, Loader2, RefreshCw } from "lucide-react";

interface Transaction {
  id: string;
  type: string;
  amountUsdc: number;
  txSignature: string | null;
  status: string;
  protocol: string | null;
  createdAt: string;
}

interface TransactionsTableProps {
  refreshTrigger?: number;
}

export function TransactionsTable({ refreshTrigger }: TransactionsTableProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

  const fetchTransactions = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/treasury/transactions?limit=10`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTransactions(data.transactions || []);
    } catch (e: any) {
      setError(e?.message || "Failed to load transactions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, [refreshTrigger]);

  const getTypeIcon = (type: string) => {
    if (type === "deposit") return <ArrowUpCircle className="w-4 h-4 text-green-600" />;
    if (type === "withdraw") return <ArrowDownCircle className="w-4 h-4 text-red-600" />;
    return <div className="w-4 h-4 rounded-full bg-blue-500" />;
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      success: "bg-green-50 text-green-700 border-green-200",
      pending: "bg-yellow-50 text-yellow-700 border-yellow-200",
      failed: "bg-red-50 text-red-700 border-red-200",
    };
    return (
      <span className={`px-2 py-0.5 text-xs font-medium border rounded ${styles[status as keyof typeof styles] || styles.pending}`}>
        {status}
      </span>
    );
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  const getSolscanUrl = (signature: string) => {
    // Always use mainnet for Solscan links
    return `https://solscan.io/tx/${signature}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={fetchTransactions}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p>No transactions yet. Start by depositing USDC to Solend!</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="text-left py-2 px-3 text-xs font-medium text-gray-500">
              Type
            </th>
            <th className="text-left py-2 px-3 text-xs font-medium text-gray-500">
              Amount
            </th>
            <th className="text-left py-2 px-3 text-xs font-medium text-gray-500">
              Status
            </th>
            <th className="text-left py-2 px-3 text-xs font-medium text-gray-500">
              Time
            </th>
            <th className="text-left py-2 px-3 text-xs font-medium text-gray-500">
              Transaction
            </th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((tx, idx) => (
            <tr
              key={tx.id}
              className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
            >
              <td className="py-3 px-3">
                <div className="flex items-center gap-2">
                  {getTypeIcon(tx.type)}
                  <span className="text-sm font-medium text-gray-900 capitalize">{tx.type}</span>
                </div>
              </td>
              <td className="py-3 px-3">
                <span className={`text-sm font-medium ${tx.type === "deposit" ? "text-green-600" : "text-red-600"}`}>
                  {tx.type === "deposit" ? "+" : "-"}
                  {tx.amountUsdc.toFixed(2)} USDC
                </span>
              </td>
              <td className="py-3 px-3">{getStatusBadge(tx.status)}</td>
              <td className="py-3 px-3 text-sm text-gray-600">{formatDate(tx.createdAt)}</td>
              <td className="py-3 px-3">
                {tx.txSignature ? (
                  <a
                    href={getSolscanUrl(tx.txSignature)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-gray-600 hover:text-gray-900 text-sm"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                ) : (
                  <span className="text-gray-400 text-sm">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

