import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { within } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { AdapterProvider } from '../../../hooks/useAdapter';
import { createMockAdapter } from '../../mocks/mockAdapter';
import { FlowNode } from '../../../components/flow/FlowNode';

describe('FlowNode', () => {
    it('shows alias hover card and copies alias text to clipboard', async () => {
        const user = userEvent.setup();
        const { adapter, clipboard } = createMockAdapter();
        const writeTextSpy = vi.spyOn(clipboard, 'writeText');

        render(
            <AdapterProvider adapter={adapter}>
                <FlowNode
                    node={{
                        id: 'node-1',
                        alias: 'get-employee',
                        requestId: 'request-1',
                        name: 'Get Employee',
                        method: 'GET',
                        url: 'https://api.example.com/employees/1',
                        position: { x: 40, y: 40 },
                    }}
                />
            </AdapterProvider>,
        );

        const aliasTrigger = screen.getByText('get-employee');
        await user.hover(aliasTrigger);

        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Copy alias' })).toBeInTheDocument();
        });

        expect(screen.getAllByText('get-employee').length).toBeGreaterThan(0);
        expect(screen.getByText('Alias:', { exact: false })).toBeInTheDocument();
        const hoverCard = screen.getByText('https://api.example.com/employees/1').closest('[data-slot="hover-card-content"]');
        expect(hoverCard).not.toBeNull();
        expect(within(hoverCard as HTMLElement).getByText('GET')).toBeInTheDocument();
        expect(within(hoverCard as HTMLElement).getByText('https://api.example.com/employees/1')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Copy alias' }));

        await waitFor(() => {
            expect(writeTextSpy).toHaveBeenCalledWith('get-employee');
        });
        expect(screen.getByRole('button', { name: 'Alias copied' })).toBeInTheDocument();
    });
});
