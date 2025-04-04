"use client"

import { useEffect, useRef } from "react"
import * as d3 from "d3"

interface Commit {
  hash: string
  author: string
  date: Date
  message: string
}

interface ContributorsChartProps {
  commits: Commit[]
}

// Add interfaces for data structures
interface AuthorData {
  author: string
  commits: number
  firstCommit: Date
  lastCommit: Date
}

const ContributorsChart = ({ commits }: ContributorsChartProps) => {
  const svgRef = useRef<SVGSVGElement | null>(null)

  useEffect(() => {
    if (!svgRef.current || commits.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll("*").remove()

    const width = svg.node()?.getBoundingClientRect().width || 800
    const height = svg.node()?.getBoundingClientRect().height || 400
    const margin = { top: 20, right: 120, bottom: 30, left: 60 }
    const innerWidth = width - margin.left - margin.right
    const innerHeight = height - margin.top - margin.bottom

    // Group commits by author
    const authorData: AuthorData[] = Array.from(
      d3.group(commits, (d) => d.author),
      ([author, authorCommits]) => ({
        author,
        commits: authorCommits.length,
        firstCommit: d3.min(authorCommits, (d) => d.date) as Date,
        lastCommit: d3.max(authorCommits, (d) => d.date) as Date,
      }),
    ).sort((a, b) => b.commits - a.commits)

    // Create scales
    const xScale = d3
      .scaleTime()
      .domain([
        d3.min(authorData, (d) => d.firstCommit) || new Date(),
        d3.max(authorData, (d) => d.lastCommit) || new Date(),
      ])
      .range([0, innerWidth])
      .nice()

    const yScale = d3
      .scalePoint<string>()
      .domain(authorData.map((d) => d.author))
      .range([0, innerHeight])
      .padding(0.5)

    const radiusScale = d3
      .scaleSqrt()
      .domain([0, d3.max(authorData, (d) => d.commits) || 0])
      .range([3, 20])

    // Create color scale
    const colorScale = d3.scaleOrdinal<string>(d3.schemeCategory10).domain(authorData.map((d) => d.author))

    // Create the main group element
    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`)

    // Add X axis
    g.append("g")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(
        d3
          .axisBottom(xScale)
          .ticks(5)
          .tickFormat((date) => d3.timeFormat("%b %d, %Y")(date as Date)),
      )

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

    // Add lines connecting first and last commit
    g.selectAll(".author-line")
      .data(authorData)
      .join("line")
      .attr("class", "author-line")
      .attr("x1", (d) => xScale(d.firstCommit))
      .attr("y1", (d) => yScale(d.author) as number)
      .attr("x2", (d) => xScale(d.lastCommit))
      .attr("y2", (d) => yScale(d.author) as number)
      .attr("stroke", (d) => colorScale(d.author))
      .attr("stroke-width", 2)
      .attr("stroke-opacity", 0.6)

    // Add circles for first commit
    g.selectAll(".first-commit")
      .data(authorData)
      .join("circle")
      .attr("class", "first-commit")
      .attr("cx", (d) => xScale(d.firstCommit))
      .attr("cy", (d) => yScale(d.author) as number)
      .attr("r", 5)
      .attr("fill", (d) => colorScale(d.author))
      .attr("stroke", "#fff")
      .attr("stroke-width", 1)

    // Add circles for last commit
    g.selectAll(".last-commit")
      .data(authorData)
      .join("circle")
      .attr("class", "last-commit")
      .attr("cx", (d) => xScale(d.lastCommit))
      .attr("cy", (d) => yScale(d.author) as number)
      .attr("r", 5)
      .attr("fill", (d) => colorScale(d.author))
      .attr("stroke", "#fff")
      .attr("stroke-width", 1)

    // Add commit count circles
    g.selectAll(".commit-count")
      .data(authorData)
      .join("circle")
      .attr("class", "commit-count")
      .attr("cx", width - margin.right + 50)
      .attr("cy", (d) => yScale(d.author) as number)
      .attr("r", (d) => radiusScale(d.commits))
      .attr("fill", (d) => colorScale(d.author))
      .attr("fill-opacity", 0.7)
      .attr("stroke", (d) => colorScale(d.author))
      .attr("stroke-width", 1)

    // Add commit count labels
    g.selectAll(".commit-count-label")
      .data(authorData)
      .join("text")
      .attr("class", "commit-count-label")
      .attr("x", width - margin.right + 50)
      .attr("y", (d) => (yScale(d.author) as number) + 5)
      .attr("text-anchor", "middle")
      .attr("font-size", "10px")
      .attr("fill", "#fff")
      .text((d) => d.commits)

    // Add author labels
    g.selectAll(".author-label")
      .data(authorData)
      .join("text")
      .attr("class", "author-label")
      .attr("x", width - margin.right + 80)
      .attr("y", (d) => (yScale(d.author) as number) + 5)
      .attr("text-anchor", "start")
      .attr("font-size", "12px")
      .text((d) => `${d.commits} commits`)

    // Add tooltips
    const tooltip = d3
      .select("body")
      .append("div")
      .attr("class", "absolute bg-popover text-popover-foreground rounded shadow-md p-2 pointer-events-none z-50")
      .style("position", "absolute")
      .style("opacity", 0)

    g.selectAll<SVGCircleElement, AuthorData>("circle")
      .on("mouseover", function (event: MouseEvent, d: AuthorData) {
        d3.select(this).attr("stroke", "#000").attr("stroke-width", 2)

        tooltip.transition().duration(200).style("opacity", 1)

        let content = ""
        if (d3.select(this).classed("first-commit")) {
          content = `
            <div>
              <div class="font-bold">${d.author}</div>
              <div>First Commit: ${d.firstCommit.toLocaleDateString()}</div>
            </div>
          `
        } else if (d3.select(this).classed("last-commit")) {
          content = `
            <div>
              <div class="font-bold">${d.author}</div>
              <div>Last Commit: ${d.lastCommit.toLocaleDateString()}</div>
            </div>
          `
        } else if (d3.select(this).classed("commit-count")) {
          content = `
            <div>
              <div class="font-bold">${d.author}</div>
              <div>Total Commits: ${d.commits}</div>
              <div>Active for: ${Math.round(
                (d.lastCommit.getTime() - d.firstCommit.getTime()) / (1000 * 60 * 60 * 24),
              )} days</div>
            </div>
          `
        }

        tooltip
          .html(content)
          .style("left", `${event.pageX + 10}px`)
          .style("top", `${event.pageY - 28}px`)
      })
      .on("mouseout", function () {
        d3.select(this).attr("stroke", "#fff").attr("stroke-width", 1)

        tooltip.transition().duration(500).style("opacity", 0)
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

export default ContributorsChart

