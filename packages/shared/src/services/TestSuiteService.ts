import * as path from 'path';

import { BaseStorageService } from './BaseStorageService';
import { generateUniqueId } from '../utils';

/**
 * Test Suite type definitions for shared package
 * (Mirrors the TestSuite types from @wave-client/core)
 */
export interface TestSuite {
    id: string;
    name: string;
    description?: string;
    items: TestItem[];
    defaultEnvId?: string;
    defaultAuthId?: string;
    settings: TestSuiteSettings;
    createdAt: string;
    updatedAt: string;
}

export interface TestItem {
    id: string;
    type: 'request' | 'flow';
    referenceId: string;
    name: string;
    enabled: boolean;
    order: number;
}

export interface TestSuiteSettings {
    concurrentCalls: number;
    delayBetweenCalls: number;
    stopOnFailure: boolean;
}

/**
 * Service for managing test suites.
 */
export class TestSuiteService extends BaseStorageService {
    private readonly subDir = 'test-suites';

    /**
     * Gets the test suites directory path using current settings.
     */
    private async getTestSuitesDir(): Promise<string> {
        const appDir = await this.getAppDirFromSettings();
        return path.join(appDir, this.subDir);
    }

    /**
     * Loads all test suites from the test-suites directory.
     * @returns Array of test suites
     */
    async loadAll(): Promise<TestSuite[]> {
        const testSuitesDir = await this.getTestSuitesDir();
        this.ensureDirectoryExists(testSuitesDir);

        const testSuites: TestSuite[] = [];
        const files = this.listJsonFiles(testSuitesDir);

        for (const file of files) {
            const testSuite = await this.loadOne(file);
            if (testSuite) {
                testSuites.push(testSuite);
            }
        }

        // Sort by updatedAt (most recent first)
        testSuites.sort((a, b) => {
            return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        });

        return testSuites;
    }

    /**
     * Loads a single test suite by filename.
     * @param fileName The test suite filename
     * @returns The test suite or null if not found
     */
    async loadOne(fileName: string): Promise<TestSuite | null> {
        const testSuitesDir = await this.getTestSuitesDir();
        const filePath = path.join(testSuitesDir, fileName);

        if (!this.fileExists(filePath)) {
            return null;
        }

        const testSuite = await this.readJsonFileSecure<TestSuite | null>(filePath, null);
        
        if (testSuite) {
            // Ensure test suite has an ID
            if (!testSuite.id) {
                testSuite.id = generateUniqueId();
            }
            // Ensure settings exist with defaults
            if (!testSuite.settings) {
                testSuite.settings = {
                    concurrentCalls: 1,
                    delayBetweenCalls: 0,
                    stopOnFailure: false,
                };
            }
        }
        
        return testSuite;
    }

    /**
     * Saves a test suite to the test-suites directory.
     * Ensures test suite name is unique across all test suites.
     * @param testSuite The test suite to save
     * @returns The saved test suite
     * @throws Error if test suite name already exists
     */
    async save(testSuite: TestSuite): Promise<TestSuite> {
        const testSuitesDir = await this.getTestSuitesDir();
        this.ensureDirectoryExists(testSuitesDir);

        // Validate test suite name is not empty
        if (!testSuite.name || testSuite.name.trim().length === 0) {
            throw new Error('Test suite name cannot be empty.');
        }

        // Check for unique test suite name
        const existingTestSuites = await this.loadAll();
        const duplicateNameTestSuite = existingTestSuites.find(
            (ts) => ts.name.toLowerCase().trim() === testSuite.name.toLowerCase().trim() && ts.id !== testSuite.id
        );
        if (duplicateNameTestSuite) {
            throw new Error(`A test suite with the name "${testSuite.name}" already exists. Please choose a different name.`);
        }

        // Ensure test suite has an ID and timestamps
        if (!testSuite.id) {
            testSuite.id = generateUniqueId();
        }
        if (!testSuite.createdAt) {
            testSuite.createdAt = new Date().toISOString();
        }
        testSuite.updatedAt = new Date().toISOString();

        // Ensure settings exist with defaults
        if (!testSuite.settings) {
            testSuite.settings = {
                concurrentCalls: 1,
                delayBetweenCalls: 0,
                stopOnFailure: false,
            };
        }

        // Use test suite ID as filename
        const fileName = `${testSuite.id}.json`;
        const filePath = path.join(testSuitesDir, fileName);

        await this.writeJsonFileSecure(filePath, testSuite);
        
        return testSuite;
    }

    /**
     * Deletes a test suite by ID.
     * @param testSuiteId The test suite ID to delete
     */
    async delete(testSuiteId: string): Promise<void> {
        const testSuitesDir = await this.getTestSuitesDir();
        const fileName = `${testSuiteId}.json`;
        const filePath = path.join(testSuitesDir, fileName);

        if (this.fileExists(filePath)) {
            this.deleteFile(filePath);
        }
    }

    /**
     * Gets a test suite by ID.
     * @param testSuiteId The test suite ID
     * @returns The test suite or null if not found
     */
    async getById(testSuiteId: string): Promise<TestSuite | null> {
        return this.loadOne(`${testSuiteId}.json`);
    }
}

// Singleton instance
export const testSuiteService = new TestSuiteService();
