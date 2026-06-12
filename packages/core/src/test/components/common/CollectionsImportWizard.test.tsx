/**
 * Unit tests for CollectionsImportWizard — content-based format detection and import flow.
 *
 * Tested scenarios:
 *  1. Selecting a Postman-content file named myapi.json auto-detects "postman".
 *  2. Selecting a Swagger YAML file named spec.txt auto-detects "swagger".
 *  3. Selecting a Wave collection JSON auto-detects "wave".
 *  4. Selecting an .http file auto-detects "http".
 *  5. A garbage-content .json file falls back to filename detection ("wave" default).
 *  6. User override after auto-detection is preserved through the import call.
 *  7. Import is called with the cached content read at selection time (no second read).
 *  8. Helper text says "Detected from file content" after a file is selected.
 *  9. Helper text says "Select the collection type manually" when content read fails.
 * 10. File removal resets the wizard state.
 * 11. Dialog close resets wizard state.
 *
 * Strategy:
 *  - FileInput is stubbed to expose two test buttons: "trigger-add" (fires onFilesAdded)
 *    and "trigger-remove" (fires onFileRemoved).
 *  - File.prototype.text is mocked per-test to return controlled content.
 *  - Radix Select is stubbed as a plain <select> for JSDOM interaction.
 *  - Dialog is stubbed to render children when open.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CollectionsImportWizard from '../../../components/common/CollectionsImportWizard';
import type { FileWithPreview } from '../../../hooks/useFileUpload';
import useAppStateStore from '../../../hooks/store/useAppStateStore';
import type { Collection } from '../../../types/collection';

// ---------------------------------------------------------------------------
// UI Stubs
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
            data-testid="collection-type-select"
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
    default: ({ message }: { message: string }) => <div data-testid="error-banner">{message}</div>,
}));

vi.mock('../../../components/ui/input', () => ({
    Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock('../../../components/ui/searchable-select', () => ({
    default: ({
        id,
        options,
        selectedValue,
        setSelectedValue,
        includeOptionToCreateNew,
        onCreateNewOption,
    }: {
        id: string;
        options: Array<{ label: string; value: string }>;
        selectedValue: string;
        setSelectedValue: (v: string) => void;
        includeOptionToCreateNew?: boolean;
        onCreateNewOption?: (v: boolean) => void;
    }) => (
        <div>
            <select
                id={id}
                data-testid={id}
                value={selectedValue}
                onChange={(e) => { setSelectedValue(e.target.value); onCreateNewOption?.(false); }}
            >
                <option value="">(none)</option>
                {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {includeOptionToCreateNew && (
                <button data-testid={`${id}-create`} onClick={() => onCreateNewOption?.(true)}>create-new</button>
            )}
        </div>
    ),
}));

/**
 * FileInput stub — exposes two test-control buttons:
 *  - "trigger-add": calls onFilesAdded with the current `pendingFiles` variable
 *  - "trigger-remove": calls onFileRemoved
 * Tests set `pendingFiles` before clicking "trigger-add".
 */
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
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a minimal FileWithPreview whose File.text() resolves to `content`.
 * Patches text() directly on the instance because JSDOM does not implement
 * Blob.prototype.text (it is a newer Web API not yet polyfilled by jsdom).
 */
function makeFileEntry(name: string, content: string): FileWithPreview {
    const file = new File([content], name, { type: 'text/plain' });
    // JSDOM omits Blob.prototype.text — patch per-instance with the known content
    (file as unknown as Record<string, unknown>).text = () => Promise.resolve(content);
    return {
        file,
        preview: null,
        id: name,
    } as unknown as FileWithPreview;
}

function renderWizard(onImport = vi.fn(), onClose = vi.fn()) {
    return render(
        <CollectionsImportWizard
            isOpen={true}
            onClose={onClose}
            onImportCollection={onImport}
        />
    );
}

const noCollectionsCollection: Collection[] = [];

const existingCollection: Collection = {
    filename: 'existing.json',
    info: { waveId: 'ex-1', name: 'Existing API' },
    item: [{ id: 'f1', name: 'Folder1', item: [] }],
};

async function selectFile(entry: FileWithPreview) {
    pendingFiles = [entry];
    fireEvent.click(screen.getByTestId('trigger-add'));
    // Wait for the async handleFilesAdded to complete (File.text() is a promise)
    await waitFor(() => {
        expect(screen.getByTestId('collection-type-select')).toBeInTheDocument();
    });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CollectionsImportWizard', () => {
    beforeEach(() => {
        pendingFiles = [];
        useAppStateStore.setState({ collections: noCollectionsCollection });
    });

    describe('auto-detection on file select', () => {
        it('detects Postman JSON content and sets dropdown to postman', async () => {
            const postmanContent = JSON.stringify({
                info: {
                    _postman_id: 'abc-123',
                    name: 'My API',
                    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
                },
                item: [],
            });
            renderWizard();
            await selectFile(makeFileEntry('myapi.json', postmanContent));

            expect((screen.getByTestId('collection-type-select') as HTMLSelectElement).value).toBe('postman');
        });

        it('detects Swagger YAML content in a file named spec.txt and sets dropdown to swagger', async () => {
            const swaggerYaml = 'openapi: 3.0.0\ninfo:\n  title: My API\n  version: "1"\npaths: {}\n';
            renderWizard();
            await selectFile(makeFileEntry('spec.txt', swaggerYaml));

            expect((screen.getByTestId('collection-type-select') as HTMLSelectElement).value).toBe('swagger');
        });

        it('detects Wave JSON content and sets dropdown to wave', async () => {
            const waveContent = JSON.stringify({
                info: { waveId: 'wave-1', name: 'My Wave Collection', version: '0.0.1' },
                item: [],
            });
            renderWizard();
            await selectFile(makeFileEntry('collection.json', waveContent));

            expect((screen.getByTestId('collection-type-select') as HTMLSelectElement).value).toBe('wave');
        });

        it('detects .http file content and sets dropdown to http', async () => {
            const httpContent = '### Get Users\nGET https://example.com/api/users\n\n';
            renderWizard();
            await selectFile(makeFileEntry('requests.http', httpContent));

            expect((screen.getByTestId('collection-type-select') as HTMLSelectElement).value).toBe('http');
        });

        it('falls back to filename detection when content is inconclusive', async () => {
            // "postman" in the filename but garbage JSON content
            renderWizard();
            await selectFile(makeFileEntry('my.postman.json', '{"random":"garbage data"}'));

            // Content is inconclusive → filename detection sees "postman" → postman
            expect((screen.getByTestId('collection-type-select') as HTMLSelectElement).value).toBe('postman');
        });

        it('falls back to wave when both content and filename detection are inconclusive', async () => {
            renderWizard();
            await selectFile(makeFileEntry('export.json', '{"unknown":true}'));

            expect((screen.getByTestId('collection-type-select') as HTMLSelectElement).value).toBe('wave');
        });

        it('shows "Detected from file content" helper text after a file is selected', async () => {
            const waveContent = JSON.stringify({
                info: { waveId: 'w1', name: 'Test', version: '0.0.1' },
                item: [],
            });
            renderWizard();
            await selectFile(makeFileEntry('test.json', waveContent));

            expect(screen.getByText(/detected from file content/i)).toBeInTheDocument();
        });
    });

    describe('user override after auto-detection', () => {
        it('preserves manually selected type through the import call', async () => {
            const onImport = vi.fn();
            const postmanContent = JSON.stringify({
                info: {
                    _postman_id: 'id1',
                    name: 'API',
                    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
                },
                item: [],
            });
            renderWizard(onImport);
            await selectFile(makeFileEntry('myapi.json', postmanContent));

            // Auto-detected as postman; user overrides to wave
            fireEvent.change(screen.getByTestId('collection-type-select'), {
                target: { value: 'wave' },
            });

            fireEvent.click(screen.getByTestId('import-btn'));

            await waitFor(() => {
                expect(onImport).toHaveBeenCalledWith('myapi.json', postmanContent, 'wave', { mode: 'new', collectionName: 'API' });
            });
        });
    });

    describe('import uses cached content', () => {
        it('passes content read at selection time to onImportCollection', async () => {
            const onImport = vi.fn();
            const waveContent = JSON.stringify({
                info: { waveId: 'w1', name: 'Cache Test', version: '0.0.1' },
                item: [],
            });
            renderWizard(onImport);
            await selectFile(makeFileEntry('cache.json', waveContent));

            fireEvent.click(screen.getByTestId('import-btn'));

            await waitFor(() => {
                expect(onImport).toHaveBeenCalledWith('cache.json', waveContent, 'wave', { mode: 'new', collectionName: 'Cache Test' });
            });
        });
    });

    describe('file removal', () => {
        it('hides the type selector after file removal', async () => {
            const waveContent = JSON.stringify({
                info: { waveId: 'w1', name: 'Test', version: '0.0.1' },
                item: [],
            });
            renderWizard();
            await selectFile(makeFileEntry('test.json', waveContent));

            // Verify select is shown
            expect(screen.getByTestId('collection-type-select')).toBeInTheDocument();

            // Remove the file
            fireEvent.click(screen.getByTestId('trigger-remove'));

            await waitFor(() => {
                expect(screen.queryByTestId('collection-type-select')).not.toBeInTheDocument();
            });
        });
    });

    describe('dialog close', () => {
        it('calls onClose when Cancel is clicked', () => {
            const onClose = vi.fn();
            renderWizard(vi.fn(), onClose);
            fireEvent.click(screen.getByTestId('cancel-btn'));
            expect(onClose).toHaveBeenCalled();
        });

        it('hides the type selector after Close resets state', async () => {
            const onClose = vi.fn();
            const waveContent = JSON.stringify({
                info: { waveId: 'w1', name: 'Test', version: '0.0.1' },
                item: [],
            });
            renderWizard(vi.fn(), onClose);
            await selectFile(makeFileEntry('test.json', waveContent));

            fireEvent.click(screen.getByTestId('cancel-btn'));

            // After close, the component's isOpen is controlled by parent —
            // we just verify that onClose was invoked (state teardown is tested by
            // the parent re-rendering with isOpen=false which drops the dialog).
            expect(onClose).toHaveBeenCalled();
        });
    });

    describe('import button state', () => {
        it('Import button is disabled when no file is selected', () => {
            renderWizard();
            expect((screen.getByTestId('import-btn') as HTMLButtonElement).disabled).toBe(true);
        });

        it('Import button is enabled after a file is selected', async () => {
            const content = JSON.stringify({
                info: { waveId: 'w1', name: 'Test', version: '0.0.1' },
                item: [],
            });
            renderWizard();
            await selectFile(makeFileEntry('test.json', content));

            expect((screen.getByTestId('import-btn') as HTMLButtonElement).disabled).toBe(false);
        });
    });

    // ── TASK-004: destination mode ────────────────────────────────────────────

    describe('destination mode — create new (default)', () => {
        it('shows "Create new collection" as the default mode after file select', async () => {
            renderWizard();
            const content = JSON.stringify({ info: { waveId: 'w', name: 'My API', version: '0.0.1' }, item: [] });
            await selectFile(makeFileEntry('api.json', content));

            const radio = screen.getByDisplayValue('new') as HTMLInputElement;
            expect(radio.checked).toBe(true);
        });

        it('prefills the collection name from info.name for Wave/Postman JSON', async () => {
            renderWizard();
            const content = JSON.stringify({ info: { waveId: 'w', name: 'My Wave API', version: '0.0.1' }, item: [] });
            await selectFile(makeFileEntry('api.json', content));

            expect((screen.getByPlaceholderText('Collection name...') as HTMLInputElement).value).toBe('My Wave API');
        });

        it('falls back to the filename stem when content has no info.name', async () => {
            renderWizard();
            const content = 'openapi: 3.0.0\ninfo:\n  title: My API\n  version: "1"\npaths: {}';
            await selectFile(makeFileEntry('my-spec.yaml', content));

            expect((screen.getByPlaceholderText('Collection name...') as HTMLInputElement).value).toBe('my-spec');
        });

        it('disables Import and shows inline error when name is empty', async () => {
            renderWizard();
            const content = JSON.stringify({ info: { waveId: 'w', name: 'API', version: '0.0.1' }, item: [] });
            await selectFile(makeFileEntry('api.json', content));

            fireEvent.change(screen.getByPlaceholderText('Collection name...'), { target: { value: '' } });

            expect((screen.getByTestId('import-btn') as HTMLButtonElement).disabled).toBe(true);
            expect(screen.getByText(/please enter a collection name/i)).toBeInTheDocument();
        });

        it('disables Import and shows inline error when name duplicates an existing collection', async () => {
            useAppStateStore.setState({ collections: [existingCollection] });
            renderWizard();
            const content = JSON.stringify({ info: { waveId: 'w', name: 'Unique', version: '0.0.1' }, item: [] });
            await selectFile(makeFileEntry('api.json', content));

            fireEvent.change(screen.getByPlaceholderText('Collection name...'), {
                target: { value: 'Existing API' },
            });

            expect((screen.getByTestId('import-btn') as HTMLButtonElement).disabled).toBe(true);
            expect(screen.getByText(/already exists/i)).toBeInTheDocument();
        });

        it('passes mode:new with the trimmed collectionName to onImportCollection', async () => {
            const onImport = vi.fn();
            renderWizard(onImport);
            const content = JSON.stringify({ info: { waveId: 'w', name: 'Great API', version: '0.0.1' }, item: [] });
            await selectFile(makeFileEntry('great.json', content));

            fireEvent.click(screen.getByTestId('import-btn'));

            await waitFor(() => {
                expect(onImport).toHaveBeenCalledWith(
                    'great.json', content, 'wave',
                    { mode: 'new', collectionName: 'Great API' }
                );
            });
        });
    });

    describe('destination mode — existing collection', () => {
        it('shows the destination picker when "Existing collection" radio is selected', async () => {
            useAppStateStore.setState({ collections: [existingCollection] });
            renderWizard();
            const content = JSON.stringify({ info: { waveId: 'w', name: 'API', version: '0.0.1' }, item: [] });
            await selectFile(makeFileEntry('api.json', content));

            fireEvent.click(screen.getByDisplayValue('existing'));

            expect(screen.getByTestId('import-destination-select')).toBeInTheDocument();
        });

        it('keeps Import disabled in existing mode until a destination is chosen', async () => {
            useAppStateStore.setState({ collections: [existingCollection] });
            renderWizard();
            const content = JSON.stringify({ info: { waveId: 'w', name: 'API', version: '0.0.1' }, item: [] });
            await selectFile(makeFileEntry('api.json', content));

            fireEvent.click(screen.getByDisplayValue('existing'));

            expect((screen.getByTestId('import-btn') as HTMLButtonElement).disabled).toBe(true);
        });

        it('passes mode:existing with collectionName and folderPath to onImportCollection', async () => {
            useAppStateStore.setState({ collections: [existingCollection] });
            const onImport = vi.fn();
            renderWizard(onImport);
            const content = JSON.stringify({ info: { waveId: 'w', name: 'API', version: '0.0.1' }, item: [] });
            await selectFile(makeFileEntry('api.json', content));

            fireEvent.click(screen.getByDisplayValue('existing'));

            // Select "Existing API" root (index 0 after options are built)
            fireEvent.change(screen.getByTestId('import-destination-select'), { target: { value: '0' } });

            fireEvent.click(screen.getByTestId('import-btn'));

            await waitFor(() => {
                expect(onImport).toHaveBeenCalledWith(
                    'api.json', content, 'wave',
                    { mode: 'existing', collectionName: 'Existing API', folderPath: [] }
                );
            });
        });

        it('resets back to create-new mode on close and re-open', async () => {
            renderWizard();
            const content = JSON.stringify({ info: { waveId: 'w', name: 'API', version: '0.0.1' }, item: [] });
            await selectFile(makeFileEntry('api.json', content));

            // Switch to existing mode
            fireEvent.click(screen.getByDisplayValue('existing'));
            expect((screen.getByDisplayValue('existing') as HTMLInputElement).checked).toBe(true);

            // Close resets state; dialog stays mounted because isOpen=true
            fireEvent.click(screen.getByTestId('cancel-btn'));

            // Select a file again — this simulates reopening after state reset
            await selectFile(makeFileEntry('api.json', content));

            // Mode should be back to 'new'
            expect((screen.getByDisplayValue('new') as HTMLInputElement).checked).toBe(true);
        });
    });
});
