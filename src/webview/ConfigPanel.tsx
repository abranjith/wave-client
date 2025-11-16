import React from 'react';
import { SunIcon , LibraryIcon , HistoryIcon, PlusIcon } from 'lucide-react';
import {
   Tabs,
   TabsContent,
   TabsList,
   TabsTrigger,
} from "../components/ui/tabs"
import CollectionsPane from '../components/common/CollectionsPane';
import EnvironmentsPane from '../components/common/EnvironmentsPane';
import HistoryPane from '../components/common/HistoryPane';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../components/ui/tooltip"
import { Button } from "../components/ui/button"
import { ParsedRequest, Environment } from '../types/collection';

interface ConfigPanelProps {
  onRequestSelect: ((request: ParsedRequest) => void)
  onEnvSelect: ((environment: Environment) => void)
  onImportCollection: (fileName: string, fileContent: string, collectionType: string) => void;
  onExportCollection: (collectionName: string) => void;
  onImportEnvironments: (fileName: string, fileContent: string) => void;
  onExportEnvironments: () => void;
}

const TABS = [
  { key: 'collections', label: 'Collections', icon: <LibraryIcon size={20} /> },
  { key: 'history', label: 'History', icon: <HistoryIcon size={20} /> },
  { key: 'environments', label: 'Environments', icon: <SunIcon size={20} /> },
];

const ConfigPanel: React.FC<ConfigPanelProps> = ({ onRequestSelect, onEnvSelect, onImportCollection, onExportCollection, onImportEnvironments, onExportEnvironments }) => {
  return (
    <div className="flex h-full w-full overflow-hidden">
      <Tabs
        defaultValue="collections"
        orientation="vertical"
        className="w-full h-full flex flex-row overflow-hidden"
      >
        <div className="flex flex-col gap-2 bg-transparent py-4 px-2 w-16 flex-shrink-0 border-r border-slate-200 dark:border-slate-700">
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  onClick={() => {
                    const request: ParsedRequest = {
                      id: '',
                      method: 'GET',
                      url: '',
                      headers: [],
                      body: '',
                      name: '',
                      params: [],
                      sourceRef: {
                        collectionFilename: '',
                        collectionName: '',
                        itemPath: []
                      }
                    };
                    onRequestSelect(request);
                  }}
                  className="flex items-center justify-center w-full h-12 text-slate-600 hover:bg-slate-100 hover:text-blue-600 rounded-md transition-colors mb-2 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-blue-400"
                >
                  <PlusIcon size={20}/>
                </Button>
              </TooltipTrigger>
              <TooltipContent className="px-2 py-1 text-xs">
                New Request
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TabsList className="flex flex-col gap-2 bg-transparent py-0 px-0 w-full flex-shrink-0">
          {TABS.map(tab => (
            <TooltipProvider delayDuration={0} key={tab.key}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="w-full">
                  <TabsTrigger
                    value={tab.key}
                    className="flex items-center justify-center w-full h-12 text-slate-600 hover:bg-slate-100 hover:text-slate-900 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-600 data-[state=active]:border-l-2 data-[state=active]:border-blue-500 rounded-md transition-colors dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 dark:data-[state=active]:bg-blue-900/20 dark:data-[state=active]:text-blue-400"
                  >
                    {tab.icon}
                  </TabsTrigger>
                </div>
              </TooltipTrigger>
              <TooltipContent className="px-2 py-1 text-xs">
                {tab.label}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          ))}
          </TabsList>
        </div>
        <div className="flex-1 overflow-hidden">
          <TabsContent value="collections" className="h-full overflow-hidden">
            <CollectionsPane 
                onRequestSelect={onRequestSelect}
                onImportCollection={onImportCollection}
                onExportCollection={onExportCollection}
              />
          </TabsContent>
          <TabsContent value="history" className="h-full overflow-hidden">
            <HistoryPane 
                onRequestSelect={onRequestSelect}
              />
          </TabsContent>
          <TabsContent value="environments" className="h-full overflow-hidden">
            <EnvironmentsPane 
                onEnvSelect={onEnvSelect}
                onImportEnvironments={onImportEnvironments}
                onExportEnvironments={onExportEnvironments}
              />
          </TabsContent>
        </div>
    </Tabs>
    </div>
  )
}

export default ConfigPanel;
