import React, { useState } from 'react';
import { Folder, History, Variable } from 'lucide-react';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../components/ui/tabs"

const TABS = [
  { key: 'collections', label: 'Collections', icon: <Folder size={20} /> },
  { key: 'history', label: 'History', icon: <History size={20} /> },
  { key: 'environments', label: 'Environments', icon: <Variable size={20} /> },
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
    <Tabs
      defaultValue="tab-1"
      orientation="vertical"
      className="w-full flex-row"
    >
      <TabsList className="flex-col gap-1 bg-transparent py-0">
        {TABS.map(tab => (
          <TabsTrigger
            key={tab.key}
            value={tab.key}
            className="data-[state=active]:bg-muted w-full justify-start data-[state=active]:shadow-none"
          >
            {tab.icon}
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      <div className="grow rounded-md border text-start">
        <TabsContent value="tab-1">
          <p className="text-muted-foreground px-4 py-3 text-xs">
            Content for Tab 1
          </p>
        </TabsContent>
        <TabsContent value="tab-2">
          <p className="text-muted-foreground px-4 py-3 text-xs">
            Content for Tab 2
          </p>
        </TabsContent>
        <TabsContent value="tab-3">
          <p className="text-muted-foreground px-4 py-3 text-xs">
            Content for Tab 3
          </p>
        </TabsContent>
      </div>
    </Tabs>
  )
}


export default ConfigPanel;
