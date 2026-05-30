import type { FlowNode as FlowNodeType } from '../../types/flow';
import { generateNodeId } from '../../utils/flowUtils';
import type { SearchableRequest } from './FlowRequestSearch';

const REQUEST_INSERT_OFFSET_X = 300;
const REQUEST_INSERT_START_X = 50;
const REQUEST_INSERT_START_Y = 50;
const REQUEST_INSERT_VERTICAL_SPACING = 72;
const MAX_ALIAS_BASE_LENGTH = 20;

/**
 * Builds a deterministic, human-readable alias base from a request name.
 *
 * Rules:
 * - lowercase
 * - collapse runs of non-alphanumeric characters to a single `-`
 * - trim leading/trailing `-`
 * - truncate to `MAX_ALIAS_BASE_LENGTH`
 * - fallback to `alias` when no alphanumeric content remains
 *
 * This gives best-effort cross-flow consistency because identical request
 * names normalize to the same base alias when there is no collision.
 */
function buildAliasBase(name: string): string {
    const normalized = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    const truncated = normalized
        .slice(0, MAX_ALIAS_BASE_LENGTH)
        .replace(/^-+|-+$/g, '');

    return truncated || 'alias';
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
        let suffix = 2;

        while (usedAliases.has(alias.toLowerCase())) {
            // Reserve the base alias for the first node, then use -2, -3, ...
            alias = `${aliasBase}-${suffix}`;
            suffix += 1;
        }

        usedAliases.add(alias.toLowerCase());

        return {
            id: createNodeId(),
            alias,
            requestId: request.referenceId,
            name: request.name,
            method: request.method,
            url: request.url,
            position: {
                x: basePosition.x,
                y: basePosition.y + index * REQUEST_INSERT_VERTICAL_SPACING,
            },
        };
    });
}
