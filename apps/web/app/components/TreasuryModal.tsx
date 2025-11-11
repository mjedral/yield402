"use client";

import { useState, Fragment } from "react";
import { X, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";

interface TreasuryModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: "deposit" | "withdraw";
  currentBalance?: number;
  onSuccess?: () => void;
}

export function TreasuryModal({ isOpen, onClose, type, currentBalance, onSuccess }: TreasuryModalProps) {
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const val = Number(amount);
      if (!val || val <= 0) {
        throw new Error("Podaj dodatnią kwotę w USDC");
      }

      const res = await fetch(`${apiBase}/treasury/${type}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountUsdc: val }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);

      toast.success(`${type === "deposit" ? "Deposit" : "Withdraw"} successful!`, {
        duration: 4000,
        icon: "✅",
      });
      
      setAmount("");
      onSuccess?.();
      onClose();
    } catch (e: any) {
      const errorMsg = e?.message || String(e);
      setError(errorMsg);
      toast.error(errorMsg, { duration: 4000 });
    } finally {
      setLoading(false);
    }
  };

  const isDeposit = type === "deposit";

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
            onClick={onClose}
          />

          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="bg-white rounded-lg shadow-xl max-w-md w-full overflow-hidden border border-gray-200"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="border-b border-gray-200 p-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-gray-900">
                    {isDeposit ? "Deposit USDC" : "Withdraw USDC"}
                  </h2>
                  <button
                    onClick={onClose}
                    className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <p className="text-gray-600 mt-1 text-sm">
                  {isDeposit
                    ? "Deposit to Solend to earn yield"
                    : "Withdraw from Solend to your wallet"}
                </p>
              </div>

              {/* Body */}
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                {/* Amount input */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Amount (USDC)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg font-semibold"
                      disabled={loading}
                      autoFocus
                    />
                    {currentBalance !== undefined && (
                      <button
                        type="button"
                        onClick={() => setAmount(currentBalance.toFixed(2))}
                        className="absolute right-3 top-1/2 -translate-y-1/2 px-3 py-1 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded transition-colors"
                        disabled={loading}
                      >
                        MAX
                      </button>
                    )}
                  </div>
                  {currentBalance !== undefined && (
                    <p className="text-xs text-gray-500 mt-1">
                      Available: {currentBalance.toFixed(2)} USDC
                    </p>
                  )}
                </div>

                {/* Info box */}
                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Protocol</span>
                    <span className="font-medium text-gray-900">Solend</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Est. Fee</span>
                    <span className="font-medium text-gray-900">~0.0001 SOL</span>
                  </div>
                </div>

                {/* Error message */}
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 text-sm"
                  >
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{error}</span>
                  </motion.div>
                )}

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
                    disabled={loading}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading || !amount || Number(amount) <= 0}
                    className="flex-1 px-4 py-2.5 font-medium rounded-lg transition-all flex items-center justify-center gap-2 bg-gray-900 hover:bg-gray-800 text-white disabled:bg-gray-300 disabled:text-gray-500"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        Confirm
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

