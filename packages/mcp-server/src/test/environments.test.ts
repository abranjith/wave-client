import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listEnvironmentsHandler, getEnvironmentVariablesHandler } from '../tools/environments';

// Mocking the shared module
const mockLoadAllEnvironments = vi.fn();

vi.mock('@wave-client/shared', () => ({
    environmentService: {
        loadAll: () => mockLoadAllEnvironments()
    }
}));

describe('Environment Tools', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const mockEnvironments = [
        {
            id: 'env1',
            name: 'Development',
            values: [
                { key: 'API_KEY', value: 'secret123', type: 'secret', enabled: true },
                { key: 'BASE_URL', value: 'http://localhost:3000', type: 'text', enabled: true }
            ]
        },
        {
            id: 'env2',
            name: 'Production',
            values: [
                { key: 'API_KEY', value: 'prod_secret', type: 'secret', enabled: true }
            ]
        }
    ];

    describe('list_environments', () => {
        it('should list all environments', async () => {
            mockLoadAllEnvironments.mockResolvedValue(mockEnvironments);

            const result = await listEnvironmentsHandler({});
            const content = JSON.parse(result.content[0].text);

            expect(content).toHaveLength(2);
            expect(content[0].name).toBe('Development');
            expect(content[1].name).toBe('Production');
        });
    });

    describe('get_environment_variables', () => {
        it('should return variables for a specific environment', async () => {
            mockLoadAllEnvironments.mockResolvedValue(mockEnvironments);

            const result = await getEnvironmentVariablesHandler({ environmentName: 'Development' });
            const content = JSON.parse(result.content[0].text);

            expect(content.name).toBe('Development');
            expect(content.variables).toHaveLength(2);
        });

        it('should MASK all variable values', async () => {
            mockLoadAllEnvironments.mockResolvedValue(mockEnvironments);

            const result = await getEnvironmentVariablesHandler({ environmentName: 'Development' });
            const content = JSON.parse(result.content[0].text);

            const apiKey = content.variables.find((v: any) => v.key === 'API_KEY');
            expect(apiKey.value).toBe('*****');
            expect(apiKey.value).not.toBe('secret123');

            const baseUrl = content.variables.find((v: any) => v.key === 'BASE_URL');
            expect(baseUrl.value).toBe('*****'); // Even non-secrets are masked by default currently
            expect(baseUrl.value).not.toBe('http://localhost:3000');
        });

        it('should throw error if environment not found', async () => {
            mockLoadAllEnvironments.mockResolvedValue(mockEnvironments);

            await expect(getEnvironmentVariablesHandler({ environmentName: 'Staging' }))
                .rejects.toThrow('Environment not found');
        });
    });
});
