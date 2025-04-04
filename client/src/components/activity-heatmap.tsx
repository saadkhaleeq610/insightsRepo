"use client"

import { useEffect, useRef } from "react"
import * as d3 from "d3"

interface Commit {
  hash: string
  author: string
  date: Date
  message: string
}

interface ActivityHeatmapProps {
  commits: Commit[]
}

// Add interfaces for data structures
interface HeatmapData {
  date: Date
  count: number
}

// interface LegendItem {
//   color: string
//   label: string
// }

const ActivityHeatmap = ({ commits }: ActivityHeatmapProps) => {
  const svgRef = useRef<SVGSVGElement | null>(null)

  useEffect(() => {
    if (!svgRef.current || commits.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll("*").remove()

    const width = svg.node()?.getBoundingClientRect().width || 800
    const height = svg.node()?.getBoundingClientRect().height || 400
    const margin = { top: 20, right: 30, bottom: 60, left: 40 }
    const innerWidth = width - margin.left - margin.right
    const innerHeight = height - margin.top - margin.bottom

    // Group commits by date
    const commitsByDate = d3.rollup(
      commits,
      (v) => v.length,
      (d) => d3.timeDay.floor(d.date).getTime(),
    )

    // Get date range
    const dateExtent = d3.extent(commits, (d) => d.date) as [Date, Date]
    const startDate = d3.timeDay.floor(dateExtent[0])
    const endDate = d3.timeDay.ceil(dateExtent[1])

    // Create all days in range
    const days = d3.timeDays(startDate, endDate)

    // Create data for heatmap
    const heatmapData: HeatmapData[] = days.map((date) => ({
      date,
      count: commitsByDate.get(date.getTime()) || 0,
    }))

    // Calculate number of weeks and days
    const numWeeks = Math.ceil(days.length / 7)
    const cellSize = Math.min(innerWidth / numWeeks, innerHeight / 7)

    // Create color scale
    const colorScale = d3.scaleSequential(d3.interpolateBlues).domain([0, d3.max(heatmapData, (d) => d.count) || 1])

    // Create the main group element
    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`)

    // Add day labels
    const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    g.selectAll<SVGTextElement, string>(".day-label")
      .data(dayLabels)
      .join("text")
      .attr("class", "day-label")
      .attr("x", -5)
      .attr("y", (d, i) => i * cellSize + cellSize / 2)
      .attr("text-anchor", "end")
      .attr("dominant-baseline", "middle")
      .attr("font-size", "10px")
      .text((d) => d)

    // Add month labels
    const monthLabels = d3.timeMonths(startDate, endDate)
    g.selectAll<SVGTextElement, Date>(".month-label")
      .data(monthLabels)
      .join("text")
      .attr("class", "month-label")
      .attr("x", (d) => {
        const firstDayOfMonth = d3.timeDay.count(startDate, d)
        return Math.floor(firstDayOfMonth / 7) * cellSize
      })
      .attr("y", -5)
      .attr("text-anchor", "start")
      .attr("font-size", "10px")
      .text((d) => d3.timeFormat("%b")(d))

    // Add cells
    g.selectAll<SVGRectElement, HeatmapData>(".day")
      .data(heatmapData)
      .join("rect")
      .attr("class", "day")
      .attr("width", cellSize - 1)
      .attr("height", cellSize - 1)
      .attr("x", (d) => {
        const daysSinceStart = d3.timeDay.count(startDate, d.date)
        return Math.floor(daysSinceStart / 7) * cellSize
      })
      .attr("y", (d) => d.date.getDay() * cellSize)
      .attr("fill", (d) => (d.count > 0 ? colorScale(d.count) : "#eee"))
      .attr("stroke", "#fff")
      .attr("stroke-width", 1)
      .on("mouseover", function (event, d) {
        d3.select(this).attr("stroke", "#000").attr("stroke-width", 2)

        const tooltip = d3
          .select("body")
          .append("div")
          .attr("class", "absolute bg-popover text-popover-foreground rounded shadow-md p-2 pointer-events-none z-50")
          .style("position", "absolute")
          .style("opacity", 0)

        tooltip.transition().duration(200).style("opacity", 1)

        tooltip
          .html(`
          <div>
            <div class="font-bold">${d.date.toLocaleDateString()}</div>
            <div>${d.count} commit${d.count !== 1 ? "s" : ""}</div>
          </div>
        `)
          .style("left", `${event.pageX + 10}px`)
          .style("top", `${event.pageY - 28}px`)
      })
      .on("mouseout", function () {
        d3.select(this).attr("stroke", "#fff").attr("stroke-width", 1)

        d3.selectAll(".tooltip").remove()
      })

    // Add legend
    const legendWidth = 200
    const legendHeight = 20

    const legendX = innerWidth - legendWidth
    const legendY = innerHeight + 30

    const legendScale = d3
      .scaleLinear()
      .domain([0, d3.max(heatmapData, (d) => d.count) || 1])
      .range([0, legendWidth])

    const legendAxis = d3.axisBottom(legendScale).ticks(5).tickSize(legendHeight)

    const defs = svg.append("defs")

    const legendGradient = defs
      .append("linearGradient")
      .attr("id", "legend-gradient")
      .attr("x1", "0%")
      .attr("y1", "0%")
      .attr("x2", "100%")
      .attr("y2", "0%")

    // Set the color for the start (0%)
    legendGradient.append("stop").attr("offset", "0%").attr("stop-color", colorScale(0))

    // Set the color for the end (100%)
    legendGradient
      .append("stop")
      .attr("offset", "100%")
      .attr("stop-color", colorScale(d3.max(heatmapData, (d) => d.count) || 1))

    const legend = svg.append("g").attr("transform", `translate(${margin.left + legendX},${margin.top + legendY})`)

    legend.append("rect").attr("width", legendWidth).attr("height", legendHeight).style("fill", "url(#legend-gradient)")

    legend.append("g").call(legendAxis)

    legend
      .append("text")
      .attr("x", legendWidth / 2)
      .attr("y", legendHeight + 30)
      .attr("text-anchor", "middle")
      .text("Commits per Day")

    // Cleanup
    return () => {
      d3.selectAll(".tooltip").remove()
    }
  }, [commits])

  return (
    <div className="w-full h-full">
      <svg ref={svgRef} width="100%" height="100%" />
    </div>
  )
}

export default ActivityHeatmap

