package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/object"
)

type CloneRequest struct {
	RepoURL string `json:"repoUrl"`
	RepoID  string `json:"repoId"`
}

func CloneHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Only POST method is allowed", http.StatusMethodNotAllowed)
		return
	}

	var req CloneRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request payload", http.StatusBadRequest)
		return
	}

	repoPath := filepath.Join("repos", req.RepoID)
	if _, err := os.Stat(repoPath); os.IsNotExist(err) {
		fmt.Println("Cloning repository from:", req.RepoURL)
		_, err := git.PlainClone(repoPath, false, &git.CloneOptions{
			URL:      req.RepoURL,
			Progress: os.Stdout,
		})
		if err != nil {
			http.Error(w, fmt.Sprintf("Clone failed: %v", err), http.StatusInternalServerError)
			return
		}
	} else {
		fmt.Println("Repository already exists. Skipping clone.")
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "Repository cloned successfully"})
}

func getRepo(refID string) (*git.Repository, *plumbing.Reference, error) {
	repoPath := filepath.Join("repos", refID)
	repo, err := git.PlainOpen(repoPath)
	if err != nil {
		return nil, nil, err
	}

	ref, err := repo.Head()
	if err != nil {
		return nil, nil, err
	}

	return repo, ref, nil
}

func CommitsHandler(w http.ResponseWriter, r *http.Request) {
	repoID := r.URL.Query().Get("repoId")
	repo, ref, err := getRepo(repoID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

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
}

func BranchesHandler(w http.ResponseWriter, r *http.Request) {
	repoID := r.URL.Query().Get("repoId")
	repo, _, err := getRepo(repoID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

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
}

func FileModificationsHandler(w http.ResponseWriter, r *http.Request) {
	repoID := r.URL.Query().Get("repoId")
	repo, ref, err := getRepo(repoID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	iter, err := repo.Log(&git.LogOptions{From: ref.Hash()})
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	fileModifications := []map[string]interface{}{}
	err = iter.ForEach(func(c *object.Commit) error {
		stats, err := c.Stats()
		if err != nil {
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
}

func StreamHandler(w http.ResponseWriter, r *http.Request) {
	repoID := r.URL.Query().Get("repoId")
	repo, ref, err := getRepo(repoID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	iter, err := repo.Log(&git.LogOptions{From: ref.Hash()})
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

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

		time.Sleep(2 * time.Second)
		return nil
	})
	if err != nil {
		log.Println("Error streaming commits:", err)
	}
}
