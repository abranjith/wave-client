import * as path from 'path';

import { BaseStorageService } from './BaseStorageService';
import { generateUniqueId } from '../utils';

/**
 * Flow type definition for shared package
 * (Mirrors the Flow type from @wave-client/core)
 */
export interface Flow {
    id: string;
    name: string;
    description?: string;
    nodes: FlowNode[];
    connectors: FlowConnector[];
    createdAt: string;
    updatedAt: string;
}

export interface FlowNode {
    id: string;
    requestId: string;
    alias: string;
    position: { x: number; y: number };
}

export interface FlowConnector {
    id: string;
    sourceNodeId: string;
    targetNodeId: string;
    condition: ConnectorCondition;
}

export type ConnectorCondition = 
    | { type: 'always' }
    | { type: 'success' }
    | { type: 'failure' }
    | { type: 'validationPass' }
    | { type: 'validationFail' };

/**
 * Service for managing flows (request orchestration chains).
 */
export class FlowService extends BaseStorageService {
    private readonly subDir = 'flows';

    /**
     * Gets the flows directory path using current settings.
     */
    private async getFlowsDir(): Promise<string> {
        const appDir = await this.getAppDirFromSettings();
        return path.join(appDir, this.subDir);
    }

    /**
     * Loads all flows from the flows directory.
     * @returns Array of flows with their IDs
     */
    async loadAll(): Promise<Flow[]> {
        const flowsDir = await this.getFlowsDir();
        this.ensureDirectoryExists(flowsDir);

        const flows: Flow[] = [];
        const files = this.listJsonFiles(flowsDir);

        for (const file of files) {
            const flow = await this.loadOne(file);
            if (flow) {
                flows.push(flow);
            }
        }

        // Sort by updatedAt (most recent first)
        flows.sort((a, b) => {
            return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        });

        return flows;
    }

    /**
     * Loads a single flow by filename.
     * @param fileName The flow filename
     * @returns The flow or null if not found
     */
    async loadOne(fileName: string): Promise<Flow | null> {
        const flowsDir = await this.getFlowsDir();
        const filePath = path.join(flowsDir, fileName);

        if (!this.fileExists(filePath)) {
            return null;
        }

        const flow = await this.readJsonFileSecure<Flow | null>(filePath, null);
        
        if (flow) {
            // Ensure flow has an ID
            if (!flow.id) {
                flow.id = generateUniqueId();
            }
        }
        
        return flow;
    }

    /**
     * Saves a flow to the flows directory.
     * @param flow The flow to save
     * @returns The saved flow
     */
    async save(flow: Flow): Promise<Flow> {
        const flowsDir = await this.getFlowsDir();
        this.ensureDirectoryExists(flowsDir);

        // Ensure flow has an ID and timestamps
        if (!flow.id) {
            flow.id = generateUniqueId();
        }
        if (!flow.createdAt) {
            flow.createdAt = new Date().toISOString();
        }
        flow.updatedAt = new Date().toISOString();

        // Use flow ID as filename
        const fileName = `${flow.id}.json`;
        const filePath = path.join(flowsDir, fileName);

        await this.writeJsonFileSecure(filePath, flow);
        
        return flow;
    }

    /**
     * Deletes a flow by ID.
     * @param flowId The flow ID to delete
     */
    async delete(flowId: string): Promise<void> {
        const flowsDir = await this.getFlowsDir();
        const fileName = `${flowId}.json`;
        const filePath = path.join(flowsDir, fileName);

        if (this.fileExists(filePath)) {
            this.deleteFile(filePath);
        }
    }

    /**
     * Gets a flow by ID.
     * @param flowId The flow ID
     * @returns The flow or null if not found
     */
    async getById(flowId: string): Promise<Flow | null> {
        return this.loadOne(`${flowId}.json`);
    }
}

// Singleton instance
export const flowService = new FlowService();
