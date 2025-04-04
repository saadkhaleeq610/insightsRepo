package main

import (
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/saadkhaleeq610/insightsRepo/handlers"

	"github.com/rs/cors"
)

func main() {
	if _, err := os.Stat("repos"); os.IsNotExist(err) {
		err := os.Mkdir("repos", os.ModePerm)
		if err != nil {
			log.Fatal("Failed to create repos directory:", err)
		}
	}

	http.HandleFunc("/clone", handlers.CloneHandler)
	http.HandleFunc("/commits", handlers.CommitsHandler)
	http.HandleFunc("/branches", handlers.BranchesHandler)
	http.HandleFunc("/file-modifications", handlers.FileModificationsHandler)
	http.HandleFunc("/stream", handlers.StreamHandler)

	handler := cors.New(cors.Options{
		AllowedOrigins:   []string{"http://localhost:5173"},
		AllowedMethods:   []string{"GET", "POST", "OPTIONS"},
		AllowedHeaders:   []string{"Content-Type"},
		AllowCredentials: true,
	}).Handler(http.DefaultServeMux)

	fmt.Println("Server is running on http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", handler))
}
