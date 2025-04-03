import * as d3 from 'd3';
import { useEffect, useState } from 'react';

function App() {
  const [commits, setCommits] = useState([]);
  const [branches, setBranches] = useState([]);
  const [fileModifications, setFileModifications] = useState([]);

  useEffect(() => {
    // Fetch commits
    fetch('http://localhost:8080/commits')
      .then((response) => response.json())
      .then((data) => {
        console.log('Commits:', data);
        setCommits(data);
      })
      .catch((error) => {
        console.error('Error fetching commits:', error);
      });

    // Fetch branches
    fetch('http://localhost:8080/branches')
      .then((response) => response.json())
      .then((data) => {
        console.log('Branches:', data);
        setBranches(data);
      })
      .catch((error) => {
        console.error('Error fetching branches:', error);
      });

    // Fetch file modifications
    fetch('http://localhost:8080/file-modifications')
      .then((response) => response.json())
      .then((data) => {
        console.log('File Modifications:', data);
        setFileModifications(data);
      })
      .catch((error) => {
        console.error('Error fetching file modifications:', error);
      });

    // Stream real-time updates
    const eventSource = new EventSource('http://localhost:8080/stream');
    eventSource.onmessage = (event) => {
      const newCommit = JSON.parse(event.data);
      console.log('Real-Time Update:', newCommit);
      setCommits((prevCommits) => [...prevCommits, newCommit]);
    };

    return () => {
      eventSource.close();
    };
  }, []);

  useEffect(() => {
    // Render commits as a timeline using D3.js
    const svg = d3.select('#timeline');
    svg.selectAll('circle')
      .data(commits)
      .join('circle')
      .attr('cx', (d, i) => i * 30 + 20)
      .attr('cy', 50)
      .attr('r', 10)
      .attr('fill', 'blue')
      .append('title') // Add tooltips
      .text((d) => `${d.author}: ${d.message}`);
  }, [commits]);

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">GitHub Repo Evolution Animator</h1>

      {/* Commits Timeline */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-2">Commits Timeline</h2>
        <svg id="timeline" width="800" height="100" className="border"></svg>
      </div>

      {/* Branches Table */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-2">Branches</h2>
        <table className="table-auto border-collapse border border-gray-300 w-full">
          <thead>
            <tr>
              <th className="border border-gray-300 px-4 py-2">Branch Name</th>
            </tr>
          </thead>
          <tbody>
            {branches.map((branch, index) => (
              <tr key={index}>
                <td className="border border-gray-300 px-4 py-2">{branch}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* File Modifications Bar Chart */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-2">File Modifications</h2>
        <svg id="file-modifications" width="800" height="400" className="border"></svg>
      </div>

      {/* Real-Time Updates */}
      <div>
        <h2 className="text-xl font-semibold mb-2">Real-Time Updates</h2>
        <ul className="list-disc pl-5">
          {commits.slice(-5).map((commit, index) => (
            <li key={index}>
              <strong>{commit.author}</strong>: {commit.message} ({commit.date})
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default App;
