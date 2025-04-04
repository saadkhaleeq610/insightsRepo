"use client"

import { useEffect, useRef } from "react"
import * as d3 from "d3"

interface Commit {
  hash: string
  author: string
  date: Date
  message: string
}

interface BranchNetworkProps {
  branches: string[]
  commits: Commit[]
  selectedBranch: string
  onSelectBranch: (branch: string) => void
}

// Add interfaces for node and link data
interface NodeData {
  id: string
  name: string
  type: "root" | "branch" | "commit"
  message?: string
  date?: Date
  x?: number
  y?: number
  fx?: number | null
  fy?: number | null
}

interface LinkData {
  source: string | NodeData
  target: string | NodeData
  value: number
}

// Add interface for legend data
interface LegendItem {
  color: string
  label: string
}

const BranchNetwork = ({ branches, commits, selectedBranch, onSelectBranch }: BranchNetworkProps) => {
  const svgRef = useRef<SVGSVGElement | null>(null)

  useEffect(() => {
    if (!svgRef.current || branches.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll("*").remove()

    const width = svg.node()?.getBoundingClientRect().width || 400
    const height = svg.node()?.getBoundingClientRect().height || 300
    const margin = { top: 20, right: 20, bottom: 20, left: 20 }
    const innerWidth = width - margin.left - margin.right
    const innerHeight = height - margin.top - margin.bottom

    // Create a force simulation
    const simulation = d3
      .forceSimulation<NodeData>()
      .force(
        "link",
        d3
          .forceLink<NodeData, LinkData>()
          .id((d) => d.id)
          .distance(100),
      )
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(innerWidth / 2, innerHeight / 2))
      .force("collision", d3.forceCollide().radius(30))

    // Create nodes and links
    const nodes: NodeData[] = [
      { id: "origin", name: "origin", type: "root" },
      ...branches.map((branch) => ({ id: branch, name: branch, type: "branch" as const })),
    ]

    const links: LinkData[] = branches.map((branch) => ({
      source: "origin",
      target: branch,
      value: 1,
    }))

    // Add commit nodes and links if we have commits
    if (commits.length > 0) {
      // Add the most recent commit from each author
      const authorCommits = new Map<string, Commit>()
      commits.forEach((commit) => {
        if (!authorCommits.has(commit.author) || commit.date > authorCommits.get(commit.author)!.date) {
          authorCommits.set(commit.author, commit)
        }
      })

      authorCommits.forEach((commit, author) => {
        nodes.push({
          id: commit.hash,
          name: author,
          type: "commit",
          message: commit.message,
          date: commit.date,
        })

        // Link to a random branch for visualization
        const targetBranch = branches[Math.floor(Math.random() * branches.length)]
        links.push({
          source: targetBranch,
          target: commit.hash,
          value: 0.5,
        })
      })
    }

    // Create the main group element
    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`)

    // Create links
    const link = g
      .append("g")
      .selectAll<SVGLineElement, LinkData>("line")
      .data(links)
      .join("line")
      .attr("stroke", "#999")
      .attr("stroke-opacity", 0.6)
      .attr("stroke-width", (d) => Math.sqrt(d.value) * 2)

    // Create nodes
    const node = g
      .append("g")
      .selectAll<SVGGElement, NodeData>("g")
      .data(nodes)
      .join("g")
      .attr("cursor", "pointer")
      .on("click", (event, d) => {
        if (d.type === "branch") {
          onSelectBranch(d.id)
        }
      })
      .call(drag(simulation))

    // Add circles to nodes
    node
      .append("circle")
      .attr("r", (d) => (d.type === "root" ? 15 : d.type === "branch" ? 12 : 8))
      .attr("fill", (d) => {
        if (d.type === "root") return "#ff6b6b"
        if (d.type === "branch") return d.id === selectedBranch ? "#4dabf7" : "#74c0fc"
        return "#69db7c" // commit
      })
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.5)

    // Add labels to nodes
    node
      .append("text")
      .attr("dy", (d) => (d.type === "root" ? -20 : d.type === "branch" ? -15 : -10))
      .attr("text-anchor", "middle")
      .attr("font-size", (d) => (d.type === "root" ? "12px" : "10px"))
      .text((d) => {
        if (d.type === "root") return "origin"
        if (d.type === "branch") return d.name
        return d.name.split(" ")[0] // Just first name for commits
      })

    // Add tooltips for commit nodes
    node
      .filter((d) => d.type === "commit")
      .append("title")
      .text((d) => `${d.name}: ${d.message}\n${d.date?.toLocaleString()}`)

    // Update positions on simulation tick
    simulation.nodes(nodes).on("tick", () => {
      link
        .attr("x1", (d) => (d.source as NodeData).x || 0)
        .attr("y1", (d) => (d.source as NodeData).y || 0)
        .attr("x2", (d) => (d.target as NodeData).x || 0)
        .attr("y2", (d) => (d.target as NodeData).y || 0)

      node.attr("transform", (d) => `translate(${d.x || 0},${d.y || 0})`)
    })

    // Add legend
    const legend = svg.append("g").attr("transform", `translate(${width - 100}, ${height - 80})`)

    const legendData: LegendItem[] = [
      { color: "#ff6b6b", label: "Origin" },
      { color: "#4dabf7", label: "Branch" },
      { color: "#69db7c", label: "Commit" },
    ]

    legendData.forEach((item, i) => {
      const legendRow = legend.append("g").attr("transform", `translate(0, ${i * 20})`)

      legendRow.append("rect").attr("width", 10).attr("height", 10).attr("fill", item.color)

      legendRow
        .append("text")
        .attr("x", 15)
        .attr("y", 10)
        .attr("text-anchor", "start")
        .style("font-size", "10px")
        .text(item.label)
    })

    // Cleanup
    return () => {
      simulation.stop()
    }
  }, [branches, commits, selectedBranch, onSelectBranch])

  // Drag function for nodes
  function drag(simulation: d3.Simulation<NodeData, undefined>) {
    function dragstarted(event: d3.D3DragEvent<SVGGElement, NodeData, NodeData>) {
      if (!event.active) simulation.alphaTarget(0.3).restart()
      event.subject.fx = event.subject.x
      event.subject.fy = event.subject.y
    }

    function dragged(event: d3.D3DragEvent<SVGGElement, NodeData, NodeData>) {
      event.subject.fx = event.x
      event.subject.fy = event.y
    }

    function dragended(event: d3.D3DragEvent<SVGGElement, NodeData, NodeData>) {
      if (!event.active) simulation.alphaTarget(0)
      event.subject.fx = null
      event.subject.fy = null
    }

    return d3.drag<SVGGElement, NodeData>().on("start", dragstarted).on("drag", dragged).on("end", dragended)
  }

  return (
    <div className="w-full h-full">
      <svg ref={svgRef} width="100%" height="100%" />
    </div>
  )
}

export default BranchNetwork

