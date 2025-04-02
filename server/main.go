package main

import (
	"fmt"
	"log"
	"os"

	"github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing/object"
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

	iter, err := repo.Log(&git.LogOptions{From: ref.Hash()})
	if err != nil {
		log.Fatal(err)
	}

	iter.ForEach(func(c *object.Commit) error {
		fmt.Printf("Commit: %s\nAuthor: %s\nDate: %s\nMessage: %s\n\n",
			c.Hash, c.Author.Name, c.Author.When, c.Message)
		return nil
	})
}
