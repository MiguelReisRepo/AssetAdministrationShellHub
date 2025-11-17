"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { BarChart3, TrendingUp, PieChart } from "lucide-react"
import { Badge } from "@/components/ui/badge"

export function ChartView() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bar Chart Card */}
        <Card className="bg-white dark:bg-gray-800 border-purple-200 dark:border-gray-700 shadow-lg">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                Sales by Category
              </CardTitle>
              <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                Last 7 Days
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Electronics</span>
                  <span className="font-semibold text-gray-900 dark:text-gray-100">$24,500</span>
                </div>
                <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full"
                    style={{ width: "85%" }}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Clothing</span>
                  <span className="font-semibold text-gray-900 dark:text-gray-100">$18,200</span>
                </div>
                <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full"
                    style={{ width: "65%" }}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Food</span>
                  <span className="font-semibold text-gray-900 dark:text-gray-100">$12,800</span>
                </div>
                <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-green-500 to-emerald-500 rounded-full"
                    style={{ width: "45%" }}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Home & Garden</span>
                  <span className="font-semibold text-gray-900 dark:text-gray-100">$9,400</span>
                </div>
                <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-orange-500 to-red-500 rounded-full"
                    style={{ width: "35%" }}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Trend Chart Card */}
        <Card className="bg-white dark:bg-gray-800 border-green-200 dark:border-gray-700 shadow-lg">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
                Revenue Trend
              </CardTitle>
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                +23.5%
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-48 flex items-end justify-between gap-2">
              {[65, 78, 72, 85, 92, 88, 95].map((height, index) => (
                <div
                  key={index}
                  className="flex-1 bg-gradient-to-t from-green-500 to-emerald-400 rounded-t-lg hover:opacity-80 transition-opacity cursor-pointer"
                  style={{ height: `${height}%` }}
                />
              ))}
            </div>
            <div className="flex justify-between mt-4 text-xs text-gray-500 dark:text-gray-400">
              <span>Mon</span>
              <span>Tue</span>
              <span>Wed</span>
              <span>Thu</span>
              <span>Fri</span>
              <span>Sat</span>
              <span>Sun</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Distribution Card */}
      <Card className="bg-white dark:bg-gray-800 border-blue-200 dark:border-gray-700 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PieChart className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            Data Distribution
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mb-1">42%</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">North America</div>
            </div>
            <div className="p-4 bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-indigo-900/20 dark:to-indigo-800/20 rounded-lg border border-indigo-200 dark:border-indigo-800">
              <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mb-1">28%</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Europe</div>
            </div>
            <div className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 rounded-lg border border-purple-200 dark:border-purple-800">
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400 mb-1">20%</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Asia Pacific</div>
            </div>
            <div className="p-4 bg-gradient-to-br from-pink-50 to-pink-100 dark:from-pink-900/20 dark:to-pink-800/20 rounded-lg border border-pink-200 dark:border-pink-800">
              <div className="text-2xl font-bold text-pink-600 dark:text-pink-400 mb-1">10%</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Other Regions</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
