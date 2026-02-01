import { z } from "zod";
import { environmentService } from "@wave-client/shared";

// Schema for list_environments
export const ListEnvironmentsSchema = z.object({});

export type ListEnvironmentsArgs = z.infer<typeof ListEnvironmentsSchema>;

export async function listEnvironmentsHandler(args: ListEnvironmentsArgs) {
    const environments = await environmentService.loadAll();

    // Simplify for LLM
    const result = environments.map(env => ({
        id: env.id,
        name: env.name,
    }));

    return {
        content: [
            {
                type: "text",
                text: JSON.stringify(result, null, 2)
            }
        ]
    };
}

// Schema for get_environment_variables
export const GetEnvironmentVariablesSchema = z.object({
    environmentName: z.string().describe("The name of the environment to retrieve. Use 'Global' for global variables."),
});

export type GetEnvironmentVariablesArgs = z.infer<typeof GetEnvironmentVariablesSchema>;

export async function getEnvironmentVariablesHandler(args: GetEnvironmentVariablesArgs) {
    const environments = await environmentService.loadAll();

    // Find environment (case-insensitive for convenience)
    const env = environments.find(
        e => e.name.toLowerCase() === args.environmentName.toLowerCase() ||
            e.id === args.environmentName
    );

    if (!env) {
        throw new Error(`Environment not found: ${args.environmentName}`);
    }

    // Mask secret values (simple heuristic or mask all)
    // For safety, we mask ALL values by default if they look like secrets 
    // or just mask everything with "*****" to start with as per plan.
    const maskedValues = env.values.map((v: any) => ({
        key: v.key,
        value: "*****", // Always mask for now
        type: v.type,
        enabled: v.enabled
    }));

    const result = {
        id: env.id,
        name: env.name,
        variables: maskedValues
    };

    return {
        content: [
            {
                type: "text",
                text: JSON.stringify(result, null, 2)
            }
        ]
    };
}
