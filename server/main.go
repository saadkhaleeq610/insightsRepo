package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"
	"github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/object"
	"github.com/rs/cors"
)

const repoURL = "https://github.com/saadkhaleeq610/elltyTask.git" // Static GitHub repo link

func main() {
	repoPath := "./cloned-repo"

	// Check if the repo already exists
	if _, err := os.Stat(repoPath); os.IsNotExist(err) {
		fmt.Println("Cloning repository from:", repoURL)
		_, err := git.PlainClone(repoPath, false, &git.CloneOptions{
			URL:      repoURL,
			Progress: os.Stdout,
		})
		if err != nil {
			log.Fatal(err)
		}
	} else {
		fmt.Println("Repository already exists. Skipping clone.")
	}

	repo, err := git.PlainOpen(repoPath)
	if err != nil {
		log.Fatal(err)
	}

	ref, err := repo.Head()
	if err != nil {
		log.Fatal(err)
	}

	http.HandleFunc("/commits", func(w http.ResponseWriter, r *http.Request) {
		iter, err := repo.Log(&git.LogOptions{From: ref.Hash()})
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		var commits []map[string]string
		iter.ForEach(func(c *object.Commit) error {
			commits = append(commits, map[string]string{
				"hash":    c.Hash.String(),
				"author":  c.Author.Name,
				"date":    c.Author.When.String(),
				"message": c.Message,
			})
			return nil
		})

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(commits)
	})

	http.HandleFunc("/branches", func(w http.ResponseWriter, r *http.Request) {
		branches := []string{}
		refs, err := repo.References()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		refs.ForEach(func(ref *plumbing.Reference) error {
			if ref.Name().IsBranch() {
				branches = append(branches, ref.Name().Short())
			}
			return nil
		})

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(branches)
	})

	http.HandleFunc("/file-modifications", func(w http.ResponseWriter, r *http.Request) {
		iter, err := repo.Log(&git.LogOptions{From: ref.Hash()})
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		fileModifications := []map[string]interface{}{}
		err = iter.ForEach(func(c *object.Commit) error {
			stats, err := c.Stats()
			if err != nil {
				// Skip commits that do not have file stats
				return nil
			}

			for _, stat := range stats {
				fileModifications = append(fileModifications, map[string]interface{}{
					"file":       stat.Name,
					"additions":  stat.Addition,
					"deletions":  stat.Deletion,
					"commitHash": c.Hash.String(),
					"message":    c.Message,
				})
			}
			return nil
		})
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(fileModifications)
	})

	http.HandleFunc("/stream", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")

		iter, err := repo.Log(&git.LogOptions{From: ref.Hash()})
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		// Stream each commit in real time
		err = iter.ForEach(func(c *object.Commit) error {
			commitData := map[string]string{
				"hash":    c.Hash.String(),
				"author":  c.Author.Name,
				"message": c.Message,
				"date":    c.Author.When.String(),
			}
			jsonData, _ := json.Marshal(commitData)
			fmt.Fprintf(w, "data: %s\n\n", jsonData)
			w.(http.Flusher).Flush()

			// Simulate real-time updates with a delay
			time.Sleep(2 * time.Second)
			return nil
		})
		if err != nil {
			log.Println("Error streaming commits:", err)
		}
	})

	// Wrap the HTTP handler with CORS middleware
	handler := cors.New(cors.Options{
		AllowedOrigins:   []string{"http://localhost:5173"}, // Allow requests from the frontend
		AllowedMethods:   []string{"GET", "POST", "OPTIONS"},
		AllowedHeaders:   []string{"Content-Type"},
		AllowCredentials: true,
	}).Handler(http.DefaultServeMux)

	fmt.Println("Server is running on http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", handler))
}
