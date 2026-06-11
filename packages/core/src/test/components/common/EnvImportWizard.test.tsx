/**
 * Unit tests for EnvImportWizard — environment type detection, transform before import, and wizard UX.
 *
 * Tested scenarios:
 *  1. Selecting a Postman environment export auto-preselects "Postman".
 *  2. Selecting a Wave environment JSON auto-preselects "Wave JSON".
 *  3. Garbage-content .json file falls back to 'wave'.
 *  4. User override after auto-detection — selecting a Postman file then switching to
 *     "Wave JSON" surfaces the validation error inline (Wave validation fails for Postman JSON).
 *  5. Successful Postman import calls onImportEnvironments with Wave-shaped JSON
 *     (values[0].type === 'secret' mapping verified).
 *  6. Successful Wave import calls onImportEnvironments with valid Wave JSON.
 *  7. Wave array import calls onImportEnvironments with the array JSON.
 *  8. Non-JSON file is rejected with an error banner.
 *  9. Helper text "Detected from file content" appears after file selection.
 * 10. File removal hides the type selector.
 * 11. Cancel/close calls onClose.
 * 12. Import button is disabled when no file is selected and enabled after selection.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import EnvImportWizard from '../../../components/common/EnvImportWizard';
import type { FileWithPreview } from '../../../hooks/useFileUpload';
import { CURRENT_ENVIRONMENT_SCHEMA_VERSION } from '../../../schemas/environmentSchema';

// ---------------------------------------------------------------------------
// UI Stubs (same pattern as CollectionsImportWizard.test.tsx)
// ---------------------------------------------------------------------------

vi.mock('../../../components/ui/dialog', () => ({
    Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
        open ? <div data-testid="dialog">{children}</div> : null,
    DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
    DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
    DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../../../components/ui/PrimaryButton', () => ({
    PrimaryButton: ({
        onClick,
        text,
        disabled,
    }: {
        onClick: () => void;
        text: string;
        disabled?: boolean;
    }) => (
        <button data-testid="import-btn" onClick={onClick} disabled={disabled}>
            {text}
        </button>
    ),
}));

vi.mock('../../../components/ui/SecondaryButton', () => ({
    SecondaryButton: ({
        onClick,
        text,
        disabled,
    }: {
        onClick: () => void;
        text: string;
        disabled?: boolean;
    }) => (
        <button data-testid="cancel-btn" onClick={onClick} disabled={disabled}>
            {text}
        </button>
    ),
}));

vi.mock('../../../components/ui/label', () => ({
    Label: ({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) => (
        <label htmlFor={htmlFor}>{children}</label>
    ),
}));

vi.mock('../../../components/ui/select', () => ({
    Select: ({
        value,
        onValueChange,
        children,
    }: {
        value: string;
        onValueChange: (val: string) => void;
        children: React.ReactNode;
    }) => (
        <select
            data-testid="env-type-select"
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
        >
            {children}
        </select>
    ),
    SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    SelectValue: () => null,
    SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
        <option value={value}>{children}</option>
    ),
}));

vi.mock('../../../components/ui/banner', () => ({
    default: ({ message }: { message: string }) => (
        <div data-testid="error-banner">{message}</div>
    ),
}));

let pendingFiles: FileWithPreview[] = [];
vi.mock('../../../components/ui/fileinput', () => ({
    FileInput: ({
        onFilesAdded,
        onFileRemoved,
    }: {
        onFilesAdded: (files: FileWithPreview[]) => void;
        onFileRemoved: () => void;
        initialFiles?: FileWithPreview[];
        useFileIcon?: boolean;
    }) => (
        <div data-testid="file-input">
            <button
                data-testid="trigger-add"
                onClick={() => onFilesAdded(pendingFiles)}
            >
                Add File
            </button>
            <button data-testid="trigger-remove" onClick={() => onFileRemoved()}>
                Remove File
            </button>
        </div>
    ),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const postmanEnvContent = JSON.stringify({
    id: 'pm-id-do-not-use',
    name: 'Production',
    values: [
        { key: 'API_URL', value: 'https://api.example.com', enabled: true, type: 'default' },
        { key: 'API_SECRET', value: 'topsecret', enabled: true, type: 'secret' },
        { key: 'DISABLED', value: 'off', enabled: false, type: 'default' },
    ],
    _postman_variable_scope: 'environment',
});

const waveEnvSingleContent = JSON.stringify({
    id: 'wave-env-1',
    name: 'Development',
    version: CURRENT_ENVIRONMENT_SCHEMA_VERSION,
    values: [
        { key: 'API_URL', value: 'http://localhost:3000', type: 'default', enabled: true },
    ],
});

const waveEnvArrayContent = JSON.stringify([
    {
        id: 'wave-env-1',
        name: 'Dev',
        version: CURRENT_ENVIRONMENT_SCHEMA_VERSION,
        values: [{ key: 'URL', value: 'http://localhost', type: 'default', enabled: true }],
    },
    {
        id: 'wave-env-2',
        name: 'Prod',
        version: CURRENT_ENVIRONMENT_SCHEMA_VERSION,
        values: [{ key: 'URL', value: 'https://prod.example.com', type: 'default', enabled: true }],
    },
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFileEntry(name: string, content: string): FileWithPreview {
    const file = new File([content], name, { type: 'application/json' });
    (file as unknown as Record<string, unknown>).text = () => Promise.resolve(content);
    return { file, preview: null, id: name } as unknown as FileWithPreview;
}

function renderWizard(onImport = vi.fn(), onClose = vi.fn()) {
    return render(
        <EnvImportWizard
            isOpen={true}
            onClose={onClose}
            onImportEnvironments={onImport}
        />
    );
}

async function selectFile(entry: FileWithPreview) {
    pendingFiles = [entry];
    fireEvent.click(screen.getByTestId('trigger-add'));
    await waitFor(() => {
        expect(screen.getByTestId('env-type-select')).toBeInTheDocument();
    });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EnvImportWizard', () => {
    beforeEach(() => {
        pendingFiles = [];
    });

    describe('auto-detection on file select', () => {
        it('preselects "postman" when a Postman environment export is selected', async () => {
            renderWizard();
            await selectFile(makeFileEntry('prod.json', postmanEnvContent));

            expect(
                (screen.getByTestId('env-type-select') as HTMLSelectElement).value,
            ).toBe('postman');
        });

        it('preselects "wave" when a Wave environment JSON is selected', async () => {
            renderWizard();
            await selectFile(makeFileEntry('dev.json', waveEnvSingleContent));

            expect(
                (screen.getByTestId('env-type-select') as HTMLSelectElement).value,
            ).toBe('wave');
        });

        it('falls back to "wave" when content is not a recognised environment format', async () => {
            renderWizard();
            await selectFile(makeFileEntry('unknown.json', '{"someRandomKey":true}'));

            expect(
                (screen.getByTestId('env-type-select') as HTMLSelectElement).value,
            ).toBe('wave');
        });

        it('shows "Detected from file content" helper text after selection', async () => {
            renderWizard();
            await selectFile(makeFileEntry('dev.json', waveEnvSingleContent));

            expect(screen.getByText(/detected from file content/i)).toBeInTheDocument();
        });
    });

    describe('successful Postman import', () => {
        it('calls onImportEnvironments with Wave-shaped JSON (type mapping verified)', async () => {
            const onImport = vi.fn();
            renderWizard(onImport);
            await selectFile(makeFileEntry('prod.json', postmanEnvContent));

            fireEvent.click(screen.getByTestId('import-btn'));

            await waitFor(() => {
                expect(onImport).toHaveBeenCalledTimes(1);
            });

            const [fileName, jsonArg] = onImport.mock.calls[0] as [string, string];
            expect(fileName).toBe('prod.json');

            const parsed = JSON.parse(jsonArg) as unknown[];
            expect(Array.isArray(parsed)).toBe(true);
            expect((parsed as Array<{ name: string }>)[0].name).toBe('Production');

            // Secret mapping
            const secretVar = (
                parsed as Array<{ values: Array<{ key: string; type: string }> }>
            )[0].values.find((v) => v.key === 'API_SECRET');
            expect(secretVar?.type).toBe('secret');

            // Default mapping
            const urlVar = (
                parsed as Array<{ values: Array<{ key: string; type: string }> }>
            )[0].values.find((v) => v.key === 'API_URL');
            expect(urlVar?.type).toBe('default');
        });

        it('generates a fresh id (not the Postman id)', async () => {
            const onImport = vi.fn();
            renderWizard(onImport);
            await selectFile(makeFileEntry('prod.json', postmanEnvContent));

            fireEvent.click(screen.getByTestId('import-btn'));

            await waitFor(() => expect(onImport).toHaveBeenCalledTimes(1));

            const parsed = JSON.parse(
                (onImport.mock.calls[0] as [string, string])[1],
            ) as Array<{ id: string }>;
            expect(parsed[0].id).not.toBe('pm-id-do-not-use');
        });

        it('stamps the current schema version on the imported environment', async () => {
            const onImport = vi.fn();
            renderWizard(onImport);
            await selectFile(makeFileEntry('prod.json', postmanEnvContent));

            fireEvent.click(screen.getByTestId('import-btn'));

            await waitFor(() => expect(onImport).toHaveBeenCalledTimes(1));

            const parsed = JSON.parse(
                (onImport.mock.calls[0] as [string, string])[1],
            ) as Array<{ version: string }>;
            expect(parsed[0].version).toBe(CURRENT_ENVIRONMENT_SCHEMA_VERSION);
        });
    });

    describe('successful Wave import', () => {
        it('calls onImportEnvironments with the Wave JSON for a single env', async () => {
            const onImport = vi.fn();
            renderWizard(onImport);
            await selectFile(makeFileEntry('dev.json', waveEnvSingleContent));

            fireEvent.click(screen.getByTestId('import-btn'));

            await waitFor(() => expect(onImport).toHaveBeenCalledTimes(1));

            const [fileName, jsonArg] = onImport.mock.calls[0] as [string, string];
            expect(fileName).toBe('dev.json');

            const parsed = JSON.parse(jsonArg) as unknown[];
            expect(Array.isArray(parsed)).toBe(true);
            expect((parsed as Array<{ name: string }>)[0].name).toBe('Development');
            expect((parsed as Array<{ id: string }>)[0].id).toBe('wave-env-1');
        });

        it('calls onImportEnvironments with both Wave envs for an array input', async () => {
            const onImport = vi.fn();
            renderWizard(onImport);
            await selectFile(makeFileEntry('envs.json', waveEnvArrayContent));

            fireEvent.click(screen.getByTestId('import-btn'));

            await waitFor(() => expect(onImport).toHaveBeenCalledTimes(1));

            const parsed = JSON.parse(
                (onImport.mock.calls[0] as [string, string])[1],
            ) as Array<{ name: string }>;
            expect(parsed).toHaveLength(2);
            expect(parsed[0].name).toBe('Dev');
            expect(parsed[1].name).toBe('Prod');
        });
    });

    describe('user override after auto-detection surfaces errors', () => {
        it('shows validation error when Postman file is imported with Wave type selected', async () => {
            const onImport = vi.fn();
            renderWizard(onImport);
            await selectFile(makeFileEntry('prod.json', postmanEnvContent));

            // Auto-detected as postman; user switches to wave
            fireEvent.change(screen.getByTestId('env-type-select'), {
                target: { value: 'wave' },
            });

            fireEvent.click(screen.getByTestId('import-btn'));

            // Wave validation should fail for Postman-shaped JSON (no id/version)
            await waitFor(() => {
                expect(screen.getByTestId('error-banner')).toBeInTheDocument();
            });
            expect(onImport).not.toHaveBeenCalled();
        });
    });

    describe('non-JSON file rejection', () => {
        it('shows an error banner when a non-JSON file is selected', async () => {
            renderWizard();
            const txtFile = new File(['hello world'], 'readme.txt', { type: 'text/plain' });
            pendingFiles = [{ file: txtFile, preview: null, id: 'readme.txt' } as unknown as FileWithPreview];
            fireEvent.click(screen.getByTestId('trigger-add'));

            await waitFor(() => {
                expect(screen.getByTestId('error-banner')).toBeInTheDocument();
            });
        });
    });

    describe('file removal', () => {
        it('hides the type selector after file removal', async () => {
            renderWizard();
            await selectFile(makeFileEntry('dev.json', waveEnvSingleContent));

            expect(screen.getByTestId('env-type-select')).toBeInTheDocument();

            fireEvent.click(screen.getByTestId('trigger-remove'));

            await waitFor(() => {
                expect(screen.queryByTestId('env-type-select')).not.toBeInTheDocument();
            });
        });
    });

    describe('cancel / close', () => {
        it('calls onClose when Cancel is clicked', () => {
            const onClose = vi.fn();
            renderWizard(vi.fn(), onClose);
            fireEvent.click(screen.getByTestId('cancel-btn'));
            expect(onClose).toHaveBeenCalled();
        });
    });

    describe('import button state', () => {
        it('is disabled when no file is selected', () => {
            renderWizard();
            expect(
                (screen.getByTestId('import-btn') as HTMLButtonElement).disabled,
            ).toBe(true);
        });

        it('is enabled after a file is selected', async () => {
            renderWizard();
            await selectFile(makeFileEntry('dev.json', waveEnvSingleContent));

            expect(
                (screen.getByTestId('import-btn') as HTMLButtonElement).disabled,
            ).toBe(false);
        });
    });
});
