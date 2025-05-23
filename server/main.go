package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/object"
	"github.com/rs/cors"
)

func main() {
	if _, err := os.Stat("repos"); os.IsNotExist(err) {
		err := os.Mkdir("repos", os.ModePerm)
		if err != nil {
			log.Fatal("Failed to create repos directory:", err)
		}
	}

	http.HandleFunc("/repo", RepoHandler)

	handler := cors.New(cors.Options{
		AllowedOrigins:   []string{"http://localhost:5173"},
		AllowedMethods:   []string{"GET", "POST", "OPTIONS"},
		AllowedHeaders:   []string{"Content-Type"},
		AllowCredentials: true,
	}).Handler(http.DefaultServeMux)

	fmt.Println("Server is running on http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", handler))
}

type CloneRequest struct {
	RepoURL string `json:"repoUrl"`
}

func RepoHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Only POST method is allowed", http.StatusMethodNotAllowed)
		return
	}

	var req CloneRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request payload", http.StatusBadRequest)
		return
	}

	parts := strings.Split(req.RepoURL, "/")
	repoID := strings.TrimSuffix(parts[len(parts)-1], ".git")

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	repoPath := filepath.Join("repos", repoID)

	sendSSEMessage(w, "status", map[string]interface{}{
		"message": "Starting repository processing",
		"repoId":  repoID,
	})

	var repo *git.Repository
	var err error

	if _, err := os.Stat(repoPath); os.IsNotExist(err) {
		sendSSEMessage(w, "status", map[string]interface{}{
			"message": "Cloning repository",
			"repoUrl": req.RepoURL,
		})

		repo, err = git.PlainClone(repoPath, false, &git.CloneOptions{
			URL:      req.RepoURL,
			Progress: os.Stdout,
		})
		if err != nil {
			sendSSEMessage(w, "error", map[string]string{
				"message": fmt.Sprintf("Clone failed: %v", err),
			})
			return
		}

		sendSSEMessage(w, "status", map[string]interface{}{
			"message": "Repository cloned successfully",
			"repoId":  repoID,
		})
	} else {
		sendSSEMessage(w, "status", map[string]interface{}{
			"message": "Repository already exists, opening existing repository",
			"repoId":  repoID,
		})

		repo, err = git.PlainOpen(repoPath)
		if err != nil {
			sendSSEMessage(w, "error", map[string]string{
				"message": fmt.Sprintf("Failed to open repository: %v", err),
			})
			return
		}
	}

	ref, err := repo.Head()
	if err != nil {
		sendSSEMessage(w, "error", map[string]string{
			"message": fmt.Sprintf("Failed to get HEAD reference: %v", err),
		})
		return
	}

	sendSSEMessage(w, "status", map[string]string{
		"message": "Fetching branches",
	})

	branches, err := getBranches(repo)
	if err != nil {
		sendSSEMessage(w, "error", map[string]string{
			"message": fmt.Sprintf("Failed to get branches: %v", err),
		})
	} else {
		sendSSEMessage(w, "branches", branches)
	}

	sendSSEMessage(w, "status", map[string]string{
		"message": "Fetching commits history",
	})

	iter, err := repo.Log(&git.LogOptions{From: ref.Hash()})
	if err != nil {
		sendSSEMessage(w, "error", map[string]string{
			"message": fmt.Sprintf("Failed to get commit logs: %v", err),
		})
		return
	}

	err = iter.ForEach(func(c *object.Commit) error {
		commitData := map[string]interface{}{
			"hash":    c.Hash.String(),
			"author":  c.Author.Name,
			"email":   c.Author.Email,
			"message": c.Message,
			"date":    c.Author.When.Format(time.RFC3339),
		}

		stats, err := c.Stats()
		if err == nil {
			modifications := []map[string]interface{}{}
			for _, stat := range stats {
				modifications = append(modifications, map[string]interface{}{
					"file":      stat.Name,
					"additions": stat.Addition,
					"deletions": stat.Deletion,
				})
			}
			commitData["modifications"] = modifications
		}

		sendSSEMessage(w, "commit", commitData)

		time.Sleep(100 * time.Millisecond)
		return nil
	})

	if err != nil {
		sendSSEMessage(w, "error", map[string]string{
			"message": fmt.Sprintf("Error processing commits: %v", err),
		})
	}

	sendSSEMessage(w, "complete", map[string]string{
		"message": "Repository analysis complete",
		"repoId":  repoID,
	})
}

func getBranches(repo *git.Repository) ([]string, error) {
	branches := []string{}
	refs, err := repo.References()
	if err != nil {
		return nil, err
	}

	refs.ForEach(func(ref *plumbing.Reference) error {
		if ref.Name().IsBranch() {
			branches = append(branches, ref.Name().Short())
		}
		return nil
	})

	return branches, nil
}

func sendSSEMessage(w http.ResponseWriter, eventType string, data interface{}) {
	jsonData, err := json.Marshal(data)
	if err != nil {
		log.Printf("Error marshaling JSON for SSE: %v", err)
		return
	}

	fmt.Fprintf(w, "event: %s\n", eventType)
	fmt.Fprintf(w, "data: %s\n\n", jsonData)
	if f, ok := w.(http.Flusher); ok {
		f.Flush()
	}
}
