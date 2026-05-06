<!-- spec-lite managed — regenerated on spec-lite init/update -->

# Project Instructions

This project uses [spec-lite](https://github.com/abranjith/spec-lite) agent and skill prompts
for structured software engineering workflows.

## Available Agents & Skills

The following specialist agents and skills are available:

**Agent files** (`.claude/agents/`):

- [spec.architect](.claude/agents/spec.architect.md)
- [spec.brainstormer](.claude/agents/spec.brainstormer.md)
- [spec.explorer](.claude/agents/spec.explorer.md)
- [spec.planner](.claude/agents/spec.planner.md)
- [spec.feature_planner](.claude/agents/spec.feature_planner.md)
- [spec.yolo](.claude/agents/spec.yolo.md)
- [spec.devops](.claude/agents/spec.devops.md)
- [spec.feature](.claude/agents/spec.feature.md)
- [spec.fixer](.claude/agents/spec.fixer.md)
- [spec.implementer](.claude/agents/spec.implementer.md)
- [spec.memorize](.claude/agents/spec.memorize.md)
- [spec.todo](.claude/agents/spec.todo.md)
- [spec.tool_helper](.claude/agents/spec.tool_helper.md)

**Command files** (`.claude/commands/`):

- [spec.architect](.claude/commands/spec.architect.md)
- [spec.brainstorm](.claude/commands/spec.brainstorm.md)
- [spec.explore](.claude/commands/spec.explore.md)
- [spec.plan](.claude/commands/spec.plan.md)
- [spec.plan_feature](.claude/commands/spec.plan_feature.md)
- [spec.yolo](.claude/commands/spec.yolo.md)
- [spec.devops](.claude/commands/spec.devops.md)
- [spec.feature](.claude/commands/spec.feature.md)
- [spec.fix](.claude/commands/spec.fix.md)
- [spec.implement](.claude/commands/spec.implement.md)
- [spec.memorize](.claude/commands/spec.memorize.md)
- [spec.todo](.claude/commands/spec.todo.md)
- [spec.tool_help](.claude/commands/spec.tool_help.md)

## Usage

To use an agent, reference its prompt file in your conversation:

```text
Use the planner from .claude/agents/spec.planner.md to create a technical plan for this project.
```

## Output Directory

Agent and skill outputs are written to the `.spec-lite/` directory:

```text
.spec-lite/
├── brainstorm.md
├── plan.md                    # Default plan (simple projects)
├── plan_<name>.md              # Named plans (complex projects)
├── TODO.md
├── features/
└── reviews/
```
