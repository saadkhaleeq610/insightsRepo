"use client"

import { useEffect, useRef } from "react"
import * as d3 from "d3"

interface Commit {
  hash: string
  author: string
  date: Date
  message: string
}

interface CommitTimelineProps {
  commits: Commit[]
}

// Add interface for legend data
interface LegendItem {
  color: string
  label: string
}

const CommitTimeline = ({ commits }: CommitTimelineProps) => {
  const svgRef = useRef<SVGSVGElement | null>(null)

  useEffect(() => {
    if (!svgRef.current || commits.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll("*").remove()

    const width = svg.node()?.getBoundingClientRect().width || 800
    const height = svg.node()?.getBoundingClientRect().height || 300
    const margin = { top: 20, right: 30, bottom: 30, left: 40 }
    const innerWidth = width - margin.left - margin.right
    const innerHeight = height - margin.top - margin.bottom

    // Create scales
    const xScale = d3
      .scaleTime()
      .domain(d3.extent(commits, (d) => d.date) as [Date, Date])
      .range([0, innerWidth])
      .nice()

    // Group commits by author
    const authorGroups = d3.group(commits, (d) => d.author)
    const authors = Array.from(authorGroups.keys())

    const yScale = d3.scaleBand().domain(authors).range([0, innerHeight]).padding(0.2)

    // Create a color scale for authors
    const colorScale = d3.scaleOrdinal<string>().domain(authors).range(d3.schemeCategory10)

    // Create the main group element
    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`)

    // Add X axis
    g.append("g")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(
        d3
          .axisBottom(xScale)
          .ticks(5)
          .tickFormat(d3.timeFormat("%b %d, %Y") as (date: Date | { valueOf(): number }) => string),
      )
      .selectAll("text")
      .attr("transform", "rotate(-45)")
      .style("text-anchor", "end")

    // Add Y axis
    g.append("g").call(d3.axisLeft(yScale))

    // Add grid lines
    g.append("g")
      .attr("class", "grid")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(
        d3
          .axisBottom(xScale)
          .tickSize(-innerHeight)
          .tickFormat(() => ""),
      )
      .selectAll("line")
      .attr("stroke", "rgba(0, 0, 0, 0.1)")

    // Create a group for each author
    authors.forEach((author) => {
      const authorCommits = authorGroups.get(author) || []

      // Add circles for each commit
      g.selectAll(`.commit-${author.replace(/\s+/g, "-")}`)
        .data(authorCommits)
        .join("circle")
        .attr("class", `commit-${author.replace(/\s+/g, "-")}`)
        .attr("cx", (d) => xScale(d.date))
        .attr("cy", yScale(author)! + yScale.bandwidth() / 2)
        .attr("r", 6)
        .attr("fill", colorScale(author))
        .attr("stroke", "white")
        .attr("stroke-width", 1)
        .style("cursor", "pointer")
        .on("mouseover", function (event, d) {
          d3.select(this).attr("r", 8).attr("stroke-width", 2)

          tooltip
            .style("opacity", 1)
            .html(`
              <div class="p-2">
                <div class="font-bold">${d.message}</div>
                <div>${d.author}</div>
                <div>${d.date.toLocaleString()}</div>
                <div class="text-xs">${d.hash.substring(0, 7)}</div>
              </div>
            `)
            .style("left", `${event.pageX + 10}px`)
            .style("top", `${event.pageY - 28}px`)
        })
        .on("mouseout", function () {
          d3.select(this).attr("r", 6).attr("stroke-width", 1)

          tooltip.style("opacity", 0)
        })

      // Connect commits with lines
      if (authorCommits.length > 1) {
        const line = d3
          .line<Commit>()
          .x((d) => xScale(d.date))
          .y(() => yScale(author)! + yScale.bandwidth() / 2)
          .curve(d3.curveMonotoneX)

        g.append("path")
          .datum(authorCommits)
          .attr("fill", "none")
          .attr("stroke", colorScale(author))
          .attr("stroke-width", 2)
          .attr("stroke-opacity", 0.6)
          .attr("d", line)
      }
    })

    // Add a tooltip
    const tooltip = d3
      .select("body")
      .append("div")
      .attr(
        "class",
        "absolute bg-popover text-popover-foreground rounded shadow-md pointer-events-none opacity-0 transition-opacity z-50",
      )
      .style("position", "absolute")
      .style("opacity", 0)

    // Add legend
    const legend = svg.append("g").attr("transform", `translate(${width - 120}, 10)`)

    // Create typed legend data
    const legendData: LegendItem[] = authors.map((author) => ({
      color: colorScale(author),
      label: author,
    }))

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

    // Cleanup
    return () => {
      tooltip.remove()
    }
  }, [commits])

  return (
    <div className="w-full h-full">
      <svg ref={svgRef} width="100%" height="100%" />
    </div>
  )
}

export default CommitTimeline

