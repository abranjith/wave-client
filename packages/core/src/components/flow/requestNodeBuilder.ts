import type { FlowNode as FlowNodeType } from '../../types/flow';
import { generateNodeId } from '../../utils/flowUtils';
import type { SearchableRequest } from './FlowRequestSearch';

const REQUEST_INSERT_OFFSET_X = 300;
const REQUEST_INSERT_START_X = 50;
const REQUEST_INSERT_START_Y = 50;
const REQUEST_INSERT_VERTICAL_SPACING = 72;
const MAX_ALIAS_BASE_LENGTH = 20;

function buildAliasBase(name: string): string {
    const aliasBase = name
        .replace(/[^a-zA-Z0-9]/g, '-')
        .replace(/-+$/g, '')
        .slice(0, MAX_ALIAS_BASE_LENGTH);

    return aliasBase || 'request';
}

interface BuildRequestNodesOptions {
    existingNodes: FlowNodeType[];
    requests: SearchableRequest[];
    createNodeId?: () => string;
}

export function buildRequestNodes({
    existingNodes,
    requests,
    createNodeId = generateNodeId,
}: BuildRequestNodesOptions): FlowNodeType[] {
    if (requests.length === 0) {
        return [];
    }

    const lastNode = existingNodes.at(-1);
    const basePosition = lastNode
        ? {
            x: lastNode.position.x + REQUEST_INSERT_OFFSET_X,
            y: lastNode.position.y,
        }
        : {
            x: REQUEST_INSERT_START_X,
            y: REQUEST_INSERT_START_Y,
        };

    const usedAliases = new Set(existingNodes.map((node) => node.alias.toLowerCase()));

    return requests.map((request, index) => {
        const aliasBase = buildAliasBase(request.name);
        let alias = aliasBase;
        let suffix = 1;

        while (usedAliases.has(alias.toLowerCase())) {
            alias = `${aliasBase}${suffix}`;
            suffix += 1;
        }

        usedAliases.add(alias.toLowerCase());

        return {
            id: createNodeId(),
            alias,
            requestId: request.referenceId,
            name: request.name,
            method: request.method,
            position: {
                x: basePosition.x,
                y: basePosition.y + index * REQUEST_INSERT_VERTICAL_SPACING,
            },
        };
    });
}
