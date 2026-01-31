import { useState } from 'react';
import { SearchWidget } from './components/SearchWidget';
import { GapDashboard } from './components/GapDashboard';

type Tab = 'search' | 'gaps';

export function App() {
  const [activeTab, setActiveTab] = useState<Tab>('search');

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-4xl mx-auto py-8 px-4">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Thought Leadership Knowledge Base
        </h1>
        <p className="text-gray-600 mb-6">
          Search AI thought leadership content and identify content gaps
        </p>

        {/* Tab Navigation */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('search')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'search'
                ? 'bg-blue-500 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            Semantic Search
          </button>
          <button
            onClick={() => setActiveTab('gaps')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'gaps'
                ? 'bg-blue-500 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            Content Gaps
          </button>
        </div>

        {/* Content */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          {activeTab === 'search' && (
            <SearchWidget
              apiUrl="http://localhost:8787"
              placeholder="Ask anything about AI coding, agents, or development workflows..."
            />
          )}
          {activeTab === 'gaps' && (
            <GapDashboard apiUrl="http://localhost:8787" />
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-gray-400 text-sm mt-8">
          Powered by semantic search with OpenAI embeddings
        </p>
      </div>
    </div>
  );
}

export default App;
