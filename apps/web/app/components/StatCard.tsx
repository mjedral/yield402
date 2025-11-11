"use client";

import { LucideIcon } from "lucide-react";
import { motion } from "framer-motion";

interface StatCardProps {
  title: string;
  value: string;
  icon: LucideIcon;
  change?: { value: string; isPositive: boolean };
  subtitle?: string;
  className?: string;
}

export function StatCard({ title, value, icon: Icon, change, subtitle, className = "" }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      whileHover={{ scale: 1.02, translateY: -4 }}
      className={`relative overflow-hidden rounded-2xl border border-gray-200/50 bg-white/80 backdrop-blur-sm p-6 shadow-lg hover:shadow-xl transition-all ${className}`}
    >
      {/* Gradient overlay */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-500/10 to-transparent rounded-full -mr-16 -mt-16" />
      
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-gray-600">{title}</span>
          <div className="p-2 bg-blue-50 rounded-lg">
            <Icon className="w-5 h-5 text-blue-600" />
          </div>
        </div>
        
        <div className="space-y-1">
          <div className="text-3xl font-bold text-gray-900">{value}</div>
          {subtitle && <div className="text-xs text-gray-500">{subtitle}</div>}
          {change && (
            <div className={`flex items-center gap-1 text-sm font-medium ${change.isPositive ? "text-green-600" : "text-red-600"}`}>
              <span>{change.isPositive ? "↑" : "↓"}</span>
              <span>{change.value}</span>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

