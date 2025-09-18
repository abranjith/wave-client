import React, { useState } from 'react';
import { BoxIcon, FolderIcon, HistoryIcon } from 'lucide-react';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../components/ui/tabs"

const TABS = [
  { key: 'collections', label: 'Collections', icon: <FolderIcon size={20} /> },
  { key: 'history', label: 'History', icon: <HistoryIcon size={20} /> },
  { key: 'environments', label: 'Environments', icon: <BoxIcon size={20} /> },
];

const ConfigPanel2: React.FC = () => {
  const [activeTab, setActiveTab] = useState('collections');

  return (
    <div className="flex h-full">
      {/* Vertical Tabs */}
      <nav className="flex flex-col w-14 bg-gray-50 border-r border-gray-200 py-4">
        {TABS.map(tab => (
          <button
            key={tab.key}
            className={`flex flex-col items-center justify-center h-14 mb-2 focus:outline-none transition-all ${
              activeTab === tab.key
                ? 'bg-white border-l-4 border-blue-500 text-blue-600'
                : 'text-gray-400 hover:bg-gray-100'
            }`}
            onClick={() => setActiveTab(tab.key)}
            aria-label={tab.label}
          >
            {tab.icon}
          </button>
        ))}
      </nav>
      {/* Tab Content */}
      <div className="flex-1 flex items-center justify-center">
        <div className="text-lg font-semibold text-gray-700">
          {TABS.find(tab => tab.key === activeTab)?.label}
        </div>
      </div>
    </div>
  );
};


const ConfigPanel: React.FC = () => {
  return (
    <div className="flex h-full">
    <Tabs
      defaultValue="collections"
      orientation="vertical"
      className="w-full flex-row h-full"
    >
      <TabsList className="flex-col gap-1 bg-transparent py-0 h-full">
        {TABS.map(tab => (
          <TabsTrigger
            key={tab.key}
            value={tab.key}
            className="hover:bg-accent hover:text-foreground data-[state=active]:after:bg-primary data-[state=active]:hover:bg-accent relative w-full justify-start after:absolute after:inset-y-0 after:start-0 after:-ms-1 after:w-0.5 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            {tab.icon}
          </TabsTrigger>
        ))}
      </TabsList>
      <div className="grow rounded-md border text-start h-full">
        <TabsContent value="collections">
          <p className="text-muted-foreground px-4 py-3 text-xs">
            Content for Collections
          </p>
        </TabsContent>
        <TabsContent value="history">
          <p className="text-muted-foreground px-4 py-3 text-xs">
            Content for History
          </p>
        </TabsContent>
        <TabsContent value="environments">
          <p className="text-muted-foreground px-4 py-3 text-xs">
            Content for Environments
          </p>
        </TabsContent>
      </div>
    </Tabs>
    </div>
  )
}


export default ConfigPanel;
