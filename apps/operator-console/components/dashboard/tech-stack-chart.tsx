'use client'

import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

interface TechStackChartProps {
  data: { name: string; count: number }[]
}

export function TechStackChart({ data }: TechStackChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Top Tech Stacks</CardTitle>
        <CardDescription>
          Most common technologies across tracked accounts
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data} layout="vertical" margin={{ left: 0, right: 20 }}>
            <XAxis type="number" hide />
            <YAxis
              dataKey="name"
              type="category"
              tickLine={false}
              axisLine={false}
              width={80}
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
            />
            <Tooltip
              cursor={{ fill: 'hsl(var(--muted))', opacity: 0.3 }}
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  return (
                    <div className="rounded-lg border bg-background p-2 shadow-sm">
                      <div className="grid grid-cols-2 gap-2">
                        <span className="text-muted-foreground">
                          {payload[0].payload.name}
                        </span>
                        <span className="font-bold text-right">
                          {payload[0].value} accounts
                        </span>
                      </div>
                    </div>
                  )
                }
                return null
              }}
            />
            <Bar
              dataKey="count"
              fill="hsl(var(--primary))"
              radius={[0, 4, 4, 0]}
              barSize={24}
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
