"use client"

import { useEffect, useState } from "react"
import CommitTimeline from "./components/commit-timeline"
import BranchNetwork from "./components/branch-network"
import FileModificationsChart from "./components/file-modifications-chart"
import ContributorsChart from "./components/contributors-chart"
import ActivityHeatmap from "./components/activity-heatmap"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "./components/ui/alert"
import { Loader2, AlertCircle, GitBranch, GitCommit, FileText, Users } from "lucide-react"
import { Button } from "./components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select"

export default function Home() {
  const [commits, setCommits] = useState<{ hash: string; date: Date; author: string; message: string }[]>([])
  const [branches, setBranches] = useState([])
  const [fileModifications, setFileModifications] = useState<{ commitHash: string; fileName: string; changes: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedBranch, setSelectedBranch] = useState("")
  const [animationSpeed, setAnimationSpeed] = useState(1)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentCommitIndex, setCurrentCommitIndex] = useState(0)

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)

        // Fetch all data in parallel
        const [commitsRes, branchesRes, fileModsRes] = await Promise.all([
          fetch("http://localhost:8080/commits"),
          fetch("http://localhost:8080/branches"),
          fetch("http://localhost:8080/file-modifications"),
        ])

        if (!commitsRes.ok || !branchesRes.ok || !fileModsRes.ok) {
          throw new Error("Failed to fetch data from API")
        }

        const commitsData: { hash: string; date: string; author: string; message: string }[] = await commitsRes.json()
        const branchesData = await branchesRes.json()
        const fileModsData = await fileModsRes.json()

        // Process and sort commits by date
        const processedCommits = commitsData
          .map((commit: { hash: string; date: string; author: string; message: string }) => ({
            hash: commit.hash,
            date: new Date(commit.date),
            author: commit.author,
            message: commit.message,
          }))
          .sort((a, b) => a.date.getTime() - b.date.getTime())

        setCommits(processedCommits)
        setBranches(branchesData)
        setFileModifications(fileModsData)

        if (branchesData.length > 0) {
          setSelectedBranch(branchesData[0])
        }
      } catch (err) {
        console.error("Error fetching data:", err)
        if (err instanceof Error) {
          setError(err.message)
        } else {
          setError("An unknown error occurred")
        }
      } finally {
        setLoading(false)
      }
    }

    fetchData()

    // Setup real-time updates
    try {
      const eventSource = new EventSource("http://localhost:8080/stream")

      eventSource.onmessage = (event) => {
        const newCommit = JSON.parse(event.data)
        setCommits((prevCommits) => [
          ...prevCommits,
          {
            ...newCommit,
            date: new Date(newCommit.date),
          },
        ])
      }

      eventSource.onerror = () => {
        console.log("EventSource failed, real-time updates disabled")
        eventSource.close()
      }

      return () => {
        eventSource.close()
      }
    } catch {
      console.log("EventSource not supported or available")
    }
  }, [])

  // Animation logic
  useEffect(() => {
    if (!isPlaying || commits.length === 0) return

    const interval = setInterval(() => {
      setCurrentCommitIndex((prev) => {
        const next = prev + 1
        if (next >= commits.length) {
          setIsPlaying(false)
          return prev
        }
        return next
      })
    }, 1000 / animationSpeed)

    return () => clearInterval(interval)
  }, [isPlaying, commits, animationSpeed])

  const handlePlayPause = () => {
    if (currentCommitIndex >= commits.length - 1) {
      setCurrentCommitIndex(0)
    }
    setIsPlaying(!isPlaying)
  }

  const handleReset = () => {
    setCurrentCommitIndex(0)
    setIsPlaying(false)
  }

  // Filter data based on current animation state
  const getVisibleCommits = () => {
    if (!isPlaying && currentCommitIndex === 0) {
      return commits
    }
    return commits.slice(0, currentCommitIndex + 1)
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4 text-primary" />
          <h2 className="text-2xl font-semibold">Loading Repository Data...</h2>
          <p className="text-muted-foreground">Fetching commits, branches, and file modifications</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            Failed to load repository data: {error}
            <div className="mt-2">
              <Button variant="outline" onClick={() => window.location.reload()}>
                Try Again
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  const visibleCommits = getVisibleCommits()
  const filteredFileModifications = fileModifications.filter((mod) =>
    visibleCommits.some((commit) => commit.hash === mod.commitHash),
  )

  return (
    <div className="container mx-auto p-4 md:p-6">
      <header className="mb-8">
        <h1 className="text-3xl md:text-4xl font-bold mb-2">GitHub Repository Evolution Visualizer</h1>
        <p className="text-muted-foreground">
          Visualizing the evolution of {commits.length} commits across {branches.length} branches
        </p>
      </header>

      <div className="mb-8 flex flex-col md:flex-row gap-4 items-start">
        <Card className="w-full md:w-2/3">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center">
              <GitCommit className="mr-2 h-5 w-5" />
              Repository Timeline
            </CardTitle>
            <CardDescription>
              Visualizing {visibleCommits.length} of {commits.length} commits
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4 mb-4">
              <Button onClick={handlePlayPause} variant="outline" className="flex items-center">
                {isPlaying ? "Pause" : "Play"} Animation
              </Button>

              <Button
                onClick={handleReset}
                variant="outline"
                disabled={currentCommitIndex === 0}
                className="flex items-center"
              >
                Reset
              </Button>

              <div className="flex items-center gap-2">
                <span className="text-sm">Speed:</span>
                <Select value={animationSpeed.toString()} onValueChange={(value) => setAnimationSpeed(Number(value))}>
                  <SelectTrigger className="w-[100px]">
                    <SelectValue placeholder="Speed" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0.5">0.5x</SelectItem>
                    <SelectItem value="1">1x</SelectItem>
                    <SelectItem value="2">2x</SelectItem>
                    <SelectItem value="5">5x</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {commits.length > 0 && (
                <div className="text-sm text-muted-foreground">
                  Showing commits: 1 - {visibleCommits.length} of {commits.length}
                </div>
              )}
            </div>

            <div className="h-[300px] border rounded-md p-4 bg-background">
              <CommitTimeline commits={visibleCommits} />
            </div>
          </CardContent>
        </Card>

        <Card className="w-full md:w-1/3">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center">
              <GitBranch className="mr-2 h-5 w-5" />
              Branch Network
            </CardTitle>
            <CardDescription>Visualizing {branches.length} branches</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] border rounded-md p-4 bg-background">
              <BranchNetwork
                branches={branches}
                commits={visibleCommits}
                selectedBranch={selectedBranch}
                onSelectBranch={setSelectedBranch}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="file-changes" className="mb-8">
        <TabsList className="mb-4">
          <TabsTrigger value="file-changes" className="flex items-center">
            <FileText className="mr-2 h-4 w-4" />
            File Changes
          </TabsTrigger>
          <TabsTrigger value="contributors" className="flex items-center">
            <Users className="mr-2 h-4 w-4" />
            Contributors
          </TabsTrigger>
          <TabsTrigger value="activity" className="flex items-center">
            <GitCommit className="mr-2 h-4 w-4" />
            Activity
          </TabsTrigger>
        </TabsList>

        <TabsContent value="file-changes">
          <Card>
            <CardHeader>
              <CardTitle>File Modifications Over Time</CardTitle>
              <CardDescription>
                Visualizing changes across {filteredFileModifications.length} file modifications
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[400px]">
                <FileModificationsChart
                  fileModifications={filteredFileModifications.map((mod) => ({
                    file: mod.fileName,
                    additions: mod.changes, // Assuming changes represent additions
                    deletions: 0, // Default to 0 if deletions are not provided
                    message: "", // Default to an empty string if message is not provided
                    ...mod,
                  }))}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contributors">
          <Card>
            <CardHeader>
              <CardTitle>Contributors Activity</CardTitle>
              <CardDescription>Visualizing contributions by author</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[400px]">
                <ContributorsChart commits={visibleCommits} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity">
          <Card>
            <CardHeader>
              <CardTitle>Commit Activity Heatmap</CardTitle>
              <CardDescription>Visualizing commit frequency over time</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[400px]">
                <ActivityHeatmap commits={visibleCommits} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

