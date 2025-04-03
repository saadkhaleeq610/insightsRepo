import { useState, useEffect } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'

function App() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    fetch('http://localhost:8080/commits')
      .then((response) => response.json())
      .then((data) => {
        console.log('Commits:', data);
      })
      .catch((error) => {
        console.error('Error fetching commits:', error);
      });

    fetch('http://localhost:8080/branches')
      .then((response) => response.json())
      .then((data) => {
        console.log('Branches:', data);
      })
      .catch((error) => {
        console.error('Error fetching branches:', error);
      });

    fetch('http://localhost:8080/file-modifications')
      .then((response) => response.json())
      .then((data) => {
        console.log('File Modifications:', data);
      })
      .catch((error) => {
        console.error('Error fetching file modifications:', error);
      });
  }, []);

  return (
    <>
      <div>
        <a href="https://vite.dev" target="_blank">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <h1>Vite + React</h1>
      <div className="card">
        <button onClick={() => setCount((count) => count + 1)}>
          count is {count}
        </button>
        <p>
          Edit <code>src/App.tsx</code> and save to test HMR
        </p>
      </div>
      <p className="read-the-docs">
        Click on the Vite and React logos to learn more
      </p>
    </>
  )
}

export default App
