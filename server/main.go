package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/go-git/go-git/v5"
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
