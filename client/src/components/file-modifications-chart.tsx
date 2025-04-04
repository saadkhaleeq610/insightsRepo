"use client"

import { useEffect, useRef, useState } from "react"
import * as d3 from "d3"
import { Card, CardContent } from "../components/ui/card"
import { Button } from "../components/ui/button"

interface FileModification {
  file: string
  additions: number
  deletions: number
  commitHash: string
  message: string
}

interface FileModificationsChartProps {
  fileModifications: FileModification[]
}

// Add interfaces for data structures
interface FileData {
  file: string
  additions: number
  deletions: number
  total: number
  name?: string
  value?: number
  children?: FileData[]
}

interface LegendItem {
  color: string
  label: string
}

interface HierarchyNode extends d3.HierarchyNode<FileData> {
  x0?: number
  x1?: number
  y0?: number
  y1?: number
}

const FileModificationsChart = ({ fileModifications }: FileModificationsChartProps) => {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [viewMode, setViewMode] = useState<"stacked" | "treemap">("stacked")

  useEffect(() => {
    if (!svgRef.current || fileModifications.length === 0) return

    const svg = d3.select<SVGSVGElement, unknown>(svgRef.current as SVGSVGElement)
    svg.selectAll("*").remove()

    const width = svg.node()?.getBoundingClientRect().width || 800
    const height = svg.node()?.getBoundingClientRect().height || 400
    const margin = { top: 20, right: 30, bottom: 100, left: 60 }
    const innerWidth = width - margin.left - margin.right
    const innerHeight = height - margin.top - margin.bottom

    if (viewMode === "stacked") {
      renderStackedBarChart(svg, width, height, margin, innerWidth, innerHeight)
    } else {
      renderTreemap(svg, width, height)
    }
  }, [fileModifications, viewMode])

  const renderStackedBarChart = (
    svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
    width: number,
    height: number,
    margin: { top: number; right: number; bottom: number; left: number },
    innerWidth: number,
    innerHeight: number,
  ) => {
    // Group by file and aggregate additions/deletions
    const fileData: FileData[] = Array.from(
      d3.group(fileModifications, (d) => d.file),
      ([file, mods]) => ({
        file,
        additions: d3.sum(mods, (d) => d.additions),
        deletions: d3.sum(mods, (d) => d.deletions),
        total: d3.sum(mods, (d) => d.additions + d.deletions),
      }),
    )
      .sort((a, b) => b.total - a.total)
      .slice(0, 15) // Top 15 files by total changes

    // Create scales
    const xScale = d3
      .scaleBand()
      .domain(fileData.map((d) => d.file))
      .range([0, innerWidth])
      .padding(0.2)

    const yScale = d3
      .scaleLinear()
      .domain([0, d3.max(fileData, (d) => d.additions + d.deletions) || 0])
      .range([innerHeight, 0])
      .nice()

    // Create the main group element
    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`)

    // Add X axis
    g.append("g")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(d3.axisBottom(xScale))
      .selectAll("text")
      .attr("transform", "rotate(-45)")
      .style("text-anchor", "end")
      .attr("dx", "-.8em")
      .attr("dy", ".15em")
      .style("font-size", "10px")

    // Add Y axis
    g.append("g").call(d3.axisLeft(yScale))

    // Add Y axis label
    g.append("text")
      .attr("transform", "rotate(-90)")
      .attr("y", -40)
      .attr("x", -innerHeight / 2)
      .attr("text-anchor", "middle")
      .text("Number of Lines")

    // Create color scale
    const colorScale = d3.scaleOrdinal<string>().domain(["additions", "deletions"]).range(["#4ade80", "#f87171"])

    // Create stacked data
    type StackKey = "additions" | "deletions"
    const keys: StackKey[] = ["additions", "deletions"]

    const stackedData = d3.stack<FileData>().keys(keys).order(d3.stackOrderNone).offset(d3.stackOffsetNone)(fileData)

    // Add bars
    g.append("g")
      .selectAll("g")
      .data(stackedData)
      .join("g")
      .attr("fill", (d) => colorScale(d.key))
      .selectAll("rect")
      .data((d) => d)
      .join("rect")
      .attr("x", (d) => xScale(d.data.file) || 0)
      .attr("y", (d) => yScale(d[1]))
      .attr("height", (d) => yScale(d[0]) - yScale(d[1]))
      .attr("width", xScale.bandwidth())
      .on("mouseover", function (event, d) {
        const parentNode = (this as SVGRectElement).parentNode;
        if (!parentNode) return; // Add null check
        if (!parentNode) return; // Add null check

        const parentData = d3.select(parentNode as Element).datum() as d3.Series<FileData, StackKey>;
        const tooltip = d3
          .select("body")
          .append("div")
          .attr("class", "absolute bg-popover text-popover-foreground rounded shadow-md p-2 pointer-events-none z-50")
          .style("position", "absolute")
          .style("opacity", 0);

        tooltip.transition().duration(200).style("opacity", 1);

        tooltip
          .html(`
            <div>
              <div class="font-bold">${d.data.file}</div>
              <div>${parentData.key}: ${d[1] - d[0]}</div>
            </div>
          `)
          .style("left", `${event.pageX + 10}px`)
          .style("top", `${event.pageY - 28}px`);

        d3.select(this).attr("stroke", "white").attr("stroke-width", 2);
      })
      .on("mouseout", function () {
        d3.selectAll(".tooltip").remove();
        d3.select(this).attr("stroke", "none");
      });

    // Add legend
    const legend = svg.append("g").attr("transform", `translate(${width - 120}, 10)`)

    const legendData: LegendItem[] = [
      { color: "#4ade80", label: "Additions" },
      { color: "#f87171", label: "Deletions" },
    ]

    legendData.forEach((item, i) => {
      const legendRow = legend.append("g").attr("transform", `translate(0, ${i * 20})`)

      legendRow.append("rect").attr("width", 10).attr("height", 10).attr("fill", item.color)

      legendRow
        .append("text")
        .attr("x", 15)
        .attr("y", 10)
        .attr("text-anchor", "start")
        .style("font-size", "12px")
        .text(item.label)
    })
  }

  const renderTreemap = (
    svg: d3.Selection<SVGSVGElement, unknown, null, undefined>, // Updated type
    width: number,
    height: number,
  ) => {
    // Group by file and aggregate additions/deletions
    const fileData: FileData[] = Array.from(
      d3.group(fileModifications, (d) => d.file),
      ([file, mods]) => ({
        name: file,
        value: d3.sum(mods, (d) => d.additions + d.deletions),
        additions: d3.sum(mods, (d) => d.additions),
        deletions: d3.sum(mods, (d) => d.deletions),
        file: file,
        total: d3.sum(mods, (d) => d.additions + d.deletions),
      }),
    )

    // Create hierarchical data
    const root = d3
      .hierarchy<FileData>({ children: fileData } as FileData)
      .sum((d) => d.value || 0)
      .sort((a, b) => (b.value || 0) - (a.value || 0)) as HierarchyNode

    // Create treemap layout
    const treemap = d3.treemap<FileData>().size([width, height]).padding(2).round(true)

    treemap(root)

    // Create color scale based on additions/deletions ratio
    const colorScale = d3
      .scaleLinear<string>()
      .domain([0, 0.5, 1])
      .range(["#f87171", "#fbbf24", "#4ade80"])
      .interpolate(d3.interpolateRgb.gamma(2.2))

    // Add rectangles
    const cell = svg
      .selectAll<SVGGElement, HierarchyNode>("g")
      .data(root.leaves())
      .join("g")
      .attr("transform", (d) => `translate(${d.x0},${d.y0})`)

    cell
      .append("rect")
      .attr("width", (d) => (d.x1 || 0) - (d.x0 || 0))
      .attr("height", (d) => (d.y1 || 0) - (d.y0 || 0))
      .attr("fill", (d) => {
        const ratio = d.data.additions / (d.data.additions + d.data.deletions)
        return colorScale(isNaN(ratio) ? 0.5 : ratio)
      })
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
            <div class="font-bold">${d.data.name}</div>
            <div>Total Changes: ${d.data.value}</div>
            <div>Additions: ${d.data.additions}</div>
            <div>Deletions: ${d.data.deletions}</div>
          </div>
        `)
          .style("left", `${event.pageX + 10}px`)
          .style("top", `${event.pageY - 28}px`)
      })
      .on("mouseout", function () {
        d3.select(this).attr("stroke", "#fff").attr("stroke-width", 1)

        d3.selectAll(".tooltip").remove()
      })

    // Add text labels
    cell
      .append("text")
      .attr("x", 5)
      .attr("y", 15)
      .attr("font-size", "10px")
      .attr("fill", "#fff")
      .text((d) => {
        const fileName = d.data.name?.split("/").pop() || ""
        return fileName.length * 6 < (d.x1 || 0) - (d.x0 || 0) ? fileName : ""
      })

    // Add legend
    const legend = svg.append("g").attr("transform", `translate(${width - 150}, 10)`)

    const legendData: LegendItem[] = [
      { color: "#f87171", label: "Mostly Deletions" },
      { color: "#fbbf24", label: "Mixed Changes" },
      { color: "#4ade80", label: "Mostly Additions" },
    ]

    legendData.forEach((item, i) => {
      const legendRow = legend.append("g").attr("transform", `translate(0, ${i * 20})`)

      legendRow.append("rect").attr("width", 10).attr("height", 10).attr("fill", item.color)

      legendRow
        .append("text")
        .attr("x", 15)
        .attr("y", 10)
        .attr("text-anchor", "start")
        .style("font-size", "12px")
        .text(item.label)
    })
  }

  return (
    <div className="w-full h-full">
      <div className="flex justify-end mb-4 space-x-2">
        <Button
          variant={viewMode === "stacked" ? "default" : "outline"}
          size="sm"
          onClick={() => setViewMode("stacked")}
        >
          Stacked Bar
        </Button>
        <Button
          variant={viewMode === "treemap" ? "default" : "outline"}
          size="sm"
          onClick={() => setViewMode("treemap")}
        >
          Treemap
        </Button>
      </div>

      {fileModifications.length === 0 ? (
        <Card className="h-full flex items-center justify-center">
          <CardContent className="text-center p-6">
            <p className="text-muted-foreground">No file modifications to display</p>
          </CardContent>
        </Card>
      ) : (
        <svg ref={svgRef} width="100%" height="100%" />
      )}
    </div>
  )
}

export default FileModificationsChart

