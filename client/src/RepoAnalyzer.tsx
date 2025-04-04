import React, { useState, useRef, useCallback, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface CommitModification {
  file: string;
  additions: number;
  deletions: number;
}

interface CommitData {
  hash: string;
  author: string;
  email: string;
  message: string;
  date: string; 
  modifications?: CommitModification[];
}

interface StatusData {
    message: string;
    repoId?: string;
    repoUrl?: string;
}

interface ErrorData {
    message: string;
}

interface CompleteData {
    message: string;
    repoId?: string;
}

interface StreamMessage {
    type: 'status' | 'branches' | 'commit' | 'error' | 'complete' | 'info';
    payload: StatusData | string[] | CommitData | ErrorData | CompleteData | string;
    timestamp: Date;
}

interface CommitsByDay {
    date: string;
    count: number;
}

const BACKEND_URL = 'http://localhost:8080/repo';

const RepoAnalyzer: React.FC = () => {
    const [repoUrl, setRepoUrl] = useState<string>('');
    const [messages, setMessages] = useState<StreamMessage[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    const addMessage = useCallback((type: StreamMessage['type'], payload: StreamMessage['payload']) => {
        setMessages(prev => [...prev, { type, payload, timestamp: new Date() }]);
    }, []);

    const cleanup = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            console.log("Aborted previous fetch request.");
        }
        setIsLoading(false);
        setError(null);
    }, []);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!repoUrl || isLoading) return;

        cleanup(); 
        setMessages([]); 
        addMessage('info', `Starting analysis for: ${repoUrl}`);
        setIsLoading(true);

        const controller = new AbortController();
        abortControllerRef.current = controller;

        try {
            const response = await fetch(BACKEND_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ repoUrl }),
                signal: controller.signal,
            });

            if (!response.ok) {
                 let errorBody = `HTTP error! status: ${response.status}`;
                 try {
                     const errJson = await response.json();
                     errorBody = errJson.message || JSON.stringify(errJson);
                 } catch (e) { /* Ignore */ }
                 throw new Error(errorBody);
            }

            if (!response.body) {
                throw new Error("Response body is null.");
            }

            const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
            let buffer = '';

            while (true) {
                const { value, done } = await reader.read();
                if (done) {
                    console.log("Stream finished.");
                     if (!messages.some(msg => msg.type === 'complete' || msg.type === 'error')) {
                       addMessage('info', 'Processing stream ended.');
                    }
                    break;
                }

                buffer += value;
                let boundary = buffer.indexOf('\n\n');

                while (boundary !== -1) {
                    const message = buffer.substring(0, boundary);
                    buffer = buffer.substring(boundary + 2);

                    let eventType = 'message';
                    let eventData = '';

                    message.split('\n').forEach(line => {
                        if (line.startsWith('event:')) {
                            eventType = line.substring(6).trim();
                        } else if (line.startsWith('data:')) {
                            eventData = line.substring(5).trim();
                        }
                    });

                    if (eventData) {
                        try {
                            const parsedData = JSON.parse(eventData);
                            addMessage(eventType as any, parsedData);
                        } catch (e) {
                            console.error("Failed to parse JSON data:", eventData, e);
                            addMessage('error', { message: `Failed to parse message data: ${eventData}` });
                        }
                    }
                    boundary = buffer.indexOf('\n\n');
                }
            }

        } catch (err: any) {
            if (err.name === 'AbortError') {
                console.log("Fetch aborted.");
                addMessage('info', "Request aborted by user.");
            } else {
                console.error("Fetch or processing error:", err);
                const errorMessage = err instanceof Error ? err.message : String(err);
                setError(`Error: ${errorMessage}`);
                addMessage('error', { message: `Client-side Error: ${errorMessage}` });
            }
        } finally {
            setIsLoading(false);
            abortControllerRef.current = null;
        }
    };

    const commitsByDay = useMemo(() => {
        const commits = messages
            .filter(msg => msg.type === 'commit')
            .map(msg => msg.payload as CommitData);

        const commitDateMap = new Map<string, number>();
        
        commits.forEach(commit => {
            const date = new Date(commit.date);
            const dateStr = date.toISOString().split('T')[0];
            
            commitDateMap.set(dateStr, (commitDateMap.get(dateStr) || 0) + 1);
        });

        const result: CommitsByDay[] = Array.from(commitDateMap.entries())
            .map(([date, count]) => ({ date, count }))
            .sort((a, b) => a.date.localeCompare(b.date));

        return result;
    }, [messages]);

    const commitStats = useMemo(() => {
        const commits = messages
            .filter(msg => msg.type === 'commit')
            .map(msg => msg.payload as CommitData);

        if (commits.length === 0) {
            return null;
        }

        const totalCommits = commits.length;
        
        const uniqueAuthors = new Set(commits.map(commit => commit.email));
        
        let totalAdditions = 0;
        let totalDeletions = 0;
        commits.forEach(commit => {
            if (commit.modifications) {
                commit.modifications.forEach(mod => {
                    totalAdditions += mod.additions;
                    totalDeletions += mod.deletions;
                });
            }
        });

        let mostActiveDay = '';
        let maxCommitsPerDay = 0;
        
        commitsByDay.forEach(day => {
            if (day.count > maxCommitsPerDay) {
                maxCommitsPerDay = day.count;
                mostActiveDay = day.date;
            }
        });

        const dates = commits.map(commit => new Date(commit.date).getTime());
        const firstCommit = new Date(Math.min(...dates));
        const lastCommit = new Date(Math.max(...dates));
        
        return {
            totalCommits,
            uniqueAuthors: uniqueAuthors.size,
            totalAdditions,
            totalDeletions,
            mostActiveDay: mostActiveDay ? `${mostActiveDay} (${maxCommitsPerDay} commits)` : 'N/A',
            firstCommit: firstCommit.toLocaleDateString(),
            lastCommit: lastCommit.toLocaleDateString(),
            daysCovered: commitsByDay.length
        };
    }, [messages, commitsByDay]);

    const renderMessage = (msg: StreamMessage, index: number) => {
        let content = null;
        switch (msg.type) {
            case 'status':
                const statusPayload = msg.payload as StatusData;
                content = `${statusPayload.message}${statusPayload.repoId ? ` (Repo ID: ${statusPayload.repoId})` : ''}`;
                break;
            case 'branches':
                const branchesPayload = msg.payload as string[];
                content = (
                    <>
                        <span className="font-medium text-indigo-700">Branches:</span> {branchesPayload.join(', ')}
                    </>
                );
                break;
            case 'commit':
                const commitPayload = msg.payload as CommitData;
                content = (
                    <div className="text-sm">
                        <div>
                           <span className="font-medium text-violet-700">{commitPayload.hash.substring(0, 7)}</span> - {commitPayload.author} ({new Date(commitPayload.date).toLocaleString()})
                        </div>
                        <em className="block text-gray-600 truncate" title={commitPayload.message}>{commitPayload.message.split('\n')[0]}</em>
                        {commitPayload.modifications && commitPayload.modifications.length > 0 && (
                             <div className="mt-1 mb-1.5 ml-4 text-xs text-gray-500 flex flex-wrap">
                                {commitPayload.modifications.map((mod, i) => (
                                    <span key={i} className="mr-4">
                                        {mod.file.split('/').pop()} <span className="text-emerald-600">(+{mod.additions})</span> <span className="text-rose-600">(-{mod.deletions})</span>
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                );
                break;
            case 'error':
                 const errorPayload = msg.payload as ErrorData;
                content = <span className="text-rose-600 font-medium">Error: {errorPayload.message}</span>;
                break;
             case 'complete':
                 const completePayload = msg.payload as CompleteData;
                 content = <span className="font-medium text-emerald-600">{completePayload.message} (Repo ID: {completePayload.repoId})</span>;
                 break;
            case 'info':
                content = <span className="text-gray-400">{msg.payload as string}</span>;
                break;
            default:
                content = `Unknown message type: ${msg.type}`;
        }
        return <div key={index} className="py-2 border-b border-gray-100 last:border-b-0">{content}</div>;
    };

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-white p-3 border-none shadow-lg rounded-lg">
                    <p className="font-medium text-gray-800">{new Date(label).toLocaleDateString()}</p>
                    <p className="text-lg font-bold text-indigo-600">{`${payload[0].value} commits`}</p>
                </div>
            );
        }
        return null;
    };

    return (
        <div className="max-w-6xl mx-auto my-8 font-sans bg-gradient-to-br from-indigo-50 to-violet-50 rounded-2xl shadow-lg overflow-hidden">
            <div className="p-8">
                <h2 className="text-3xl font-bold mb-6 text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-600">Git Repository Analyzer</h2>

                <form onSubmit={handleSubmit} className="mb-8">
                    <div className="flex flex-col sm:flex-row gap-3">
                        <input
                            type="text"
                            value={repoUrl}
                            onChange={(e) => setRepoUrl(e.target.value)}
                            placeholder="Enter Git Repository URL (e.g., https://github.com/user/repo.git)"
                            required
                            className="flex-grow p-4 rounded-xl border-none bg-white shadow-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none disabled:bg-gray-100 disabled:opacity-70"
                            disabled={isLoading}
                        />
                        <div className="flex gap-2">
                            <button
                                type="submit"
                                className="px-6 py-4 bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-medium rounded-xl shadow-md hover:shadow-lg transition-all disabled:opacity-70 disabled:cursor-not-allowed"
                                disabled={isLoading}
                            >
                                {isLoading ? 'Analyzing...' : 'Analyze'}
                            </button>
                            {isLoading && (
                                <button
                                    type="button"
                                    onClick={cleanup}
                                    className="px-6 py-4 bg-amber-500 text-white font-medium rounded-xl shadow-md hover:shadow-lg transition-all"
                                >
                                    Cancel
                                </button>
                            )}
                        </div>
                    </div>
                </form>

                {error && (
                    <div className="mt-4 p-4 bg-rose-50 text-rose-700 rounded-xl text-sm mb-6 shadow-sm">
                        {error}
                    </div>
                )}

                {commitsByDay.length > 0 && (
                    <div className="mb-8 bg-white rounded-2xl shadow-sm overflow-hidden">
                        <div className="p-6">
                            <h3 className="text-xl font-bold mb-6 text-gray-800">Commit Analytics</h3>
                            
                            {commitStats && (
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
                                    <div className="p-4 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white">
                                        <div className="text-xs uppercase font-medium opacity-80">Total Commits</div>
                                        <div className="text-2xl font-bold">{commitStats.totalCommits}</div>
                                    </div>
                                    <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white">
                                        <div className="text-xs uppercase font-medium opacity-80">Contributors</div>
                                        <div className="text-2xl font-bold">{commitStats.uniqueAuthors}</div>
                                    </div>
                                    <div className="p-4 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 text-white">
                                        <div className="text-xs uppercase font-medium opacity-80">Lines Changed</div>
                                        <div className="text-lg font-bold flex items-center justify-between">
                                            <span>+{commitStats.totalAdditions}</span>
                                            <span>-{commitStats.totalDeletions}</span>
                                        </div>
                                    </div>
                                    <div className="p-4 rounded-xl bg-gradient-to-br from-fuchsia-500 to-pink-500 text-white">
                                        <div className="text-xs uppercase font-medium opacity-80">Time Span</div>
                                        <div className="text-sm font-bold">{commitStats.daysCovered} days</div>
                                        <div className="text-xs opacity-80 mt-1">{commitStats.firstCommit} - {commitStats.lastCommit}</div>
                                    </div>
                                </div>
                            )}
                            
                            <div className="h-72">
                                <h4 className="font-medium text-gray-700 mb-4">Commits Over Time</h4>
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart
                                        data={commitsByDay}
                                        margin={{ top: 5, right: 30, left: 20, bottom: 20 }}
                                    >
                                        <defs>
                                            <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.8}/>
                                                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                        <XAxis 
                                            dataKey="date" 
                                            tick={{ fontSize: 12, fill: '#6b7280' }}
                                            tickLine={false}
                                            axisLine={{ stroke: '#e5e7eb' }}
                                            tickFormatter={(value) => {
                                                const date = new Date(value);
                                                return `${date.getMonth()+1}/${date.getDate()}`;
                                            }}
                                        />
                                        <YAxis 
                                            allowDecimals={false} 
                                            tick={{ fontSize: 12, fill: '#6b7280' }}
                                            tickLine={false}
                                            axisLine={false}
                                        />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Line 
                                            type="monotone" 
                                            dataKey="count" 
                                            stroke="#6366f1" 
                                            strokeWidth={3}
                                            dot={{ r: 4, fill: '#6366f1', strokeWidth: 2, stroke: '#fff' }} 
                                            activeDot={{ r: 6, fill: '#6366f1', stroke: '#fff', strokeWidth: 2 }} 
                                            name="Commits"
                                            fill="url(#colorCount)"
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>
                )}

                {(messages.length > 0 || isLoading) && (
                    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                        <div className="p-6">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-xl font-bold text-gray-800">Activity Log</h3>
                                {commitStats && (
                                    <span className="text-sm text-indigo-600 font-medium">
                                        Most active: {commitStats.mostActiveDay.split(' ')[0]}
                                    </span>
                                )}
                            </div>
                            
                            <div className="max-h-96 overflow-y-auto space-y-1 pr-2">
                                {messages.map(renderMessage)}
                                {isLoading && (
                                    <div className="py-2 text-gray-400">
                                        <div className="flex items-center">
                                            <div className="w-4 h-4 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin mr-2"></div>
                                            Receiving data...
                                        </div>
                                    </div>
                                )}
                            </div>
                            
                            {messages.length > 0 && messages[messages.length - 1].type === 'complete' && !isLoading && (
                                <div className="mt-4 py-2 px-4 bg-emerald-50 text-emerald-700 rounded-lg text-sm inline-block">
                                    Analysis complete
                                </div>
                            )}
                            
                            {messages.length > 0 && messages[messages.length - 1].type === 'error' && !isLoading && (
                                <div className="mt-4 py-2 px-4 bg-rose-50 text-rose-700 rounded-lg text-sm inline-block">
                                    Analysis ended with an error
                                </div>
                            )}
                        </div>
                    </div>
                )}
                
                {messages.length === 0 && !isLoading && (
                    <div className="flex flex-col items-center justify-center py-12 text-center bg-white rounded-2xl shadow-sm">
                        <div className="w-16 h-16 mb-4 text-indigo-500 opacity-50">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                        </div>
                        <p className="text-gray-500">Enter a repository URL and click Analyze to begin</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default RepoAnalyzer;