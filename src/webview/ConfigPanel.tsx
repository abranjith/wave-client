import React, { useState } from 'react';
import { SunIcon , LibraryIcon , HistoryIcon } from 'lucide-react';
import {
   Tabs,
   TabsContent,
   TabsList,
   TabsTrigger,
} from "../components/ui/tabs"
import CollectionsPane, { CollectionsPaneProps } from '../components/common/CollectionsPane';
import EnvironmentsPane, {EnvironmentsPaneProps} from '../components/common/EnvironmentsPane';

interface ConfigPanelProps {
  collectionsProps: CollectionsPaneProps,
  environmentProps: EnvironmentsPaneProps
}


const TABS = [
  { key: 'collections', label: 'Collections', icon: <LibraryIcon size={20} /> },
  { key: 'history', label: 'History', icon: <HistoryIcon size={20} /> },
  { key: 'environments', label: 'Environments', icon: <SunIcon size={20} /> },
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


const ConfigPanel1: React.FC = () => {
  return (
    <div className="flex h-full">
      {/* Temporarily using simple div instead of Tabs */}
      <div className="w-full flex-row h-full flex">
        <div className="flex-col gap-1 bg-transparent py-0 h-full">
          {TABS.map(tab => (
            <div
              key={tab.key}
              className="hover:bg-accent hover:text-foreground relative w-full justify-start cursor-pointer p-3 flex items-center"
            >
              {tab.icon}
            </div>
          ))}
        </div>
        <div className="grow rounded-md border text-start h-full">
          <div>
            <p className="text-muted-foreground px-4 py-3 text-xs">
              Content for Collections
            </p>
          </div>
          <div>
            <p className="text-muted-foreground px-4 py-3 text-xs">
              Content for History
            </p>
          </div>
          <div>
            <p className="text-muted-foreground px-4 py-3 text-xs">
              Content for Environments
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

const ConfigPanel: React.FC<ConfigPanelProps> = ({ collectionsProps, environmentProps }) => {
  return (
    <div className="flex h-full w-full">
      <Tabs
        defaultValue="collections"
        orientation="vertical"
        className="w-full h-full flex flex-row"
      >
        <TabsList className="flex flex-col gap-2 bg-transparent py-4 px-2 w-16 flex-shrink-0 border-r border-gray-200">
          {TABS.map(tab => (
            <TabsTrigger
              key={tab.key}
              value={tab.key}
              className="flex items-center justify-center w-full h-12 text-gray-600 hover:bg-gray-100 hover:text-gray-900 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-600 data-[state=active]:border-r-2 data-[state=active]:border-blue-500 rounded-l-md transition-colors"
              title={tab.label}
            >
              {tab.icon}
            </TabsTrigger>
          ))}
        </TabsList>
        <div className="flex-1 overflow-hidden">
          <TabsContent value="collections" className="h-full overflow-hidden">
            <CollectionsPane 
                collections={collectionsProps.collections}
                onRequestSelect={collectionsProps.onRequestSelect}
                isLoading={collectionsProps.isLoading}
                error={collectionsProps.error}
              />
          </TabsContent>
          <TabsContent value="history" className="h-full overflow-hidden">
            <p className="text-muted-foreground px-4 py-3 text-xs">
              Content for History
            </p>
          </TabsContent>
          <TabsContent value="environments" className="h-full overflow-hidden">
            <EnvironmentsPane 
                environments={environmentProps.environments}
                onEnvironmentSelect={environmentProps.onEnvironmentSelect}
                isLoading={environmentProps.isLoading}
                error={environmentProps.error}
              />
          </TabsContent>
        </div>
    </Tabs>
    </div>
  )
}

export default ConfigPanel;
