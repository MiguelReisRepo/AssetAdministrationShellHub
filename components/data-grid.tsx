"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Database, Download, Filter, RefreshCw } from "lucide-react"

const sampleData = [
  { id: 1, name: "Product A", category: "Electronics", value: 1250, status: "Active" },
  { id: 2, name: "Product B", category: "Clothing", value: 850, status: "Active" },
  { id: 3, name: "Product C", category: "Electronics", value: 2100, status: "Pending" },
  { id: 4, name: "Product D", category: "Food", value: 450, status: "Active" },
  { id: 5, name: "Product E", category: "Electronics", value: 1800, status: "Inactive" },
]

export function DataGrid() {
  return (
    <Card className="bg-white dark:bg-gray-800 border-indigo-200 dark:border-gray-700 shadow-lg">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            Data Table
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="border-indigo-200 text-indigo-600 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-400 dark:hover:bg-indigo-900/20 bg-transparent"
            >
              <Filter className="w-4 h-4 mr-1" />
              Filter
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-indigo-200 text-indigo-600 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-400 dark:hover:bg-indigo-900/20 bg-transparent"
            >
              <RefreshCw className="w-4 h-4 mr-1" />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-indigo-200 text-indigo-600 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-400 dark:hover:bg-indigo-900/20 bg-transparent"
            >
              <Download className="w-4 h-4 mr-1" />
              Export
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold">ID</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Name</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Category</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Value</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {sampleData.map((row) => (
                <tr key={row.id} className="hover:bg-indigo-50 dark:hover:bg-indigo-900/10 transition-colors">
                  <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{row.id}</td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">{row.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{row.category}</td>
                  <td className="px-4 py-3 text-sm font-mono text-gray-900 dark:text-gray-100">
                    ${row.value.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <Badge
                      variant={row.status === "Active" ? "default" : "secondary"}
                      className={
                        row.status === "Active"
                          ? "bg-green-100 text-green-700 border-green-200"
                          : row.status === "Pending"
                            ? "bg-yellow-100 text-yellow-700 border-yellow-200"
                            : "bg-gray-100 text-gray-700 border-gray-200"
                      }
                    >
                      {row.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
          <span>Showing 1-5 of 1,284 records</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled>
              Previous
            </Button>
            <Button variant="outline" size="sm">
              Next
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
