# Graph Report - .  (2026-07-27)

## Corpus Check
- 477 files · ~225,122 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2150 nodes · 4596 edges · 125 communities (106 shown, 19 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 138 edges (avg confidence: 0.83)
- Token cost: 509,605 input · 89,936 output

## Community Hubs (Navigation)
- Settings API & SDK Queries
- Shared REST Contract
- Recap Period & Accounts
- Account Import Month Grid
- Issuer Matching Engine
- Sandcastle Orchestration Helpers
- Issuer Detail & Sorting
- Sandcastle Prompts & Standards
- API Effect Dependencies
- Web Route Tree
- Biome Lint Config
- Import Commit Flow
- Sidebar, Dialog & Theme
- Issuer Creation & Avatar
- Category Tree Utilities
- Web App TSConfig
- BMAD Agent Personas
- Context Map Glossary
- Database Row Mapping
- Transactions Repository
- Web Test Tooling Deps
- Root Monorepo Package
- API Handler Test Harness
- SDK Package Manifest
- Legacy Shared Types
- Web Runtime Dependencies
- API Live Layer Assembly
- Transaction Detail Sections
- Command Palette & Popover
- Database Migrations
- Transaction Table Cells
- Resource Port Issues
- Subscriptions Repository
- Button & Account Rows
- Web Node TSConfig
- Accounts & App Settings Repos
- Issuer Image Normalisation
- shadcn Component Registry
- Transactions Search & View
- TestArch Workflow Suite
- API Config & Server Entry
- Effect API Rework Map
- Shared Package Manifest
- Transactions Filters
- Column Visibility Toggle
- Rule Preview Lists
- Turbo Task Pipeline
- PDF Import Domain
- Category Icon Resolution
- Rule Form Page Tests
- Base TSConfig
- Cursor TestArch Mirrors
- Error Taxonomy & Contract Design
- HttpApi Stack Research
- Category Mutations
- Quick-Flow BMAD Workflows
- Categories Handler Tests
- Web Package Scripts
- Categories View Tests
- Analyst & PRD Workflows
- Excalidraw & Story Workflows
- Category Tree ADRs
- Merchant Uploads & Static
- Transactions Handler Tests
- API TSConfig
- Transfer Suggestions
- Value Matcher ADR
- Cutover & Gousse UI Bridge
- Issuer Handler Tests
- Brainstorming & Party Mode
- Issuer Image Cap Tests
- SDK TSConfig
- Query Client & Root Layout
- Transaction Detail Page
- Accounts View Tests
- Category Transactions Tests
- Import View & Search
- Rule Form Routes
- Excalidraw Diagram Family
- Category Filter Derivation
- Image Normalisation & Uploads
- Date Handling & Subscriptions
- Colour Inherit Migration
- Shared TSConfig
- Import Grid Tests
- Doc Sharding Tasks
- Rules Section Tests
- Category Picker Tests
- Branded Ids & NotFound
- Server-Side Issuer ADR
- Import Handler Tests
- PWA Icon Set
- Web Root TSConfig
- Server-Side PDF Extraction
- Categories Repository Tests
- Assignment Picker Tests
- Transfers View
- Web App Entry & Router
- Import Glossary Terms
- Transactions Pagination
- Root TSConfig
- hookform/resolvers Dep
- gousse-ui Dep
- lucide-react Dep
- next-themes Dep
- mamen/shared Dep
- papaparse Dep
- radix-ui Dep
- react-dom Dep
- sonner Dep
- tailwind-merge Dep
- tailwindcss/vite Dep
- react-query-devtools Dep
- tanstack/react-router Dep
- Sandcastle Setup Script
- Web PWA Manifest

## God Nodes (most connected - your core abstractions)
1. `cn()` - 80 edges
2. `Issuer` - 45 edges
3. `Transaction` - 40 edges
4. `AccountId` - 35 edges
5. `IssuerId` - 33 edges
6. `Category` - 32 edges
7. `Account` - 31 edges
8. `NotFound` - 31 edges
9. `formatCurrency()` - 31 edges
10. `Api` - 27 edges

## Surprising Connections (you probably didn't know these)
- `Cursor Command: create-excalidraw-wireframe` --semantically_similar_to--> `Create Excalidraw Wireframe Workflow`  [INFERRED] [semantically similar]
  .cursor/commands/bmad/bmm/workflows/create-excalidraw-wireframe.md → .claude/commands/bmad/bmm/workflows/create-excalidraw-wireframe.md
- `Cursor Command: create-story` --semantically_similar_to--> `Create Story Workflow`  [INFERRED] [semantically similar]
  .cursor/commands/bmad/bmm/workflows/create-story.md → .claude/commands/bmad/bmm/workflows/create-story.md
- `Cursor Command: prd` --semantically_similar_to--> `prd tri-modal workflow command`  [INFERRED] [semantically similar]
  .cursor/commands/bmad/bmm/workflows/prd.md → .claude/commands/bmad/bmm/workflows/prd.md
- `Cursor Command: research` --semantically_similar_to--> `research workflow command`  [INFERRED] [semantically similar]
  .cursor/commands/bmad/bmm/workflows/research.md → .claude/commands/bmad/bmm/workflows/research.md
- `Reviewer prompt (implement-review)` --semantically_similar_to--> `BMM Workflow: testarch-trace`  [INFERRED] [semantically similar]
  .sandcastle/implement-review/review-prompt.md → .cursor/commands/bmad/bmm/workflows/testarch-trace.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **All BMM slash-command agents delegating to _bmad/bmm/agents/*.md personas** — _claude_commands_bmad_bmm_agents_analyst_analyst, _claude_commands_bmad_bmm_agents_architect_architect, _claude_commands_bmad_bmm_agents_dev_dev, _claude_commands_bmad_bmm_agents_pm_pm, _claude_commands_bmad_bmm_agents_quick_flow_solo_dev_quick_flow_solo_dev, _claude_commands_bmad_bmm_agents_sm_sm, _claude_commands_bmad_bmm_agents_tea_tea, _claude_commands_bmad_bmm_agents_tech_writer_tech_writer, _claude_commands_bmad_bmm_agents_ux_designer_ux_designer [EXTRACTED 1.00]
- **BMM planning-to-implementation document chain: brief to UX to architecture to epics/stories to readiness check to story** — _claude_commands_bmad_bmm_workflows_create_product_brief_create_product_brief, _claude_commands_bmad_bmm_workflows_create_ux_design_create_ux_design, _claude_commands_bmad_bmm_workflows_create_architecture_create_architecture, _claude_commands_bmad_bmm_workflows_create_epics_and_stories_create_epics_and_stories, _claude_commands_bmad_bmm_workflows_check_implementation_readiness_check_implementation_readiness, _claude_commands_bmad_bmm_workflows_create_story_create_story [INFERRED 0.85]
- **Workflows dispatched through workflow.xml core OS with a workflow.yaml config parameter** — _claude_commands_bmad_bmm_workflows_code_review_code_review, _claude_commands_bmad_bmm_workflows_correct_course_correct_course, _claude_commands_bmad_bmm_workflows_create_story_create_story, _claude_commands_bmad_bmm_workflows_create_excalidraw_dataflow_create_excalidraw_dataflow, _claude_commands_bmad_bmm_workflows_create_excalidraw_diagram_create_excalidraw_diagram, _claude_commands_bmad_bmm_workflows_create_excalidraw_flowchart_create_excalidraw_flowchart, _claude_commands_bmad_bmm_workflows_create_excalidraw_wireframe_create_excalidraw_wireframe [EXTRACTED 1.00]
- **TestArch quality engineering workflow suite** — _claude_commands_bmad_bmm_workflows_testarch_atdd_testarchatdd, _claude_commands_bmad_bmm_workflows_testarch_automate_testarchautomate, _claude_commands_bmad_bmm_workflows_testarch_ci_testarchci, _claude_commands_bmad_bmm_workflows_testarch_framework_testarchframework, _claude_commands_bmad_bmm_workflows_testarch_nfr_testarchnfr, _claude_commands_bmad_bmm_workflows_testarch_test_design_testarchtestdesign, _claude_commands_bmad_bmm_workflows_testarch_test_review_testarchtestreview, _claude_commands_bmad_bmm_workflows_testarch_trace_testarchtrace [INFERRED 0.95]
- **Phase 4 implementation loop (plan, status, execute, retro)** — _claude_commands_bmad_bmm_workflows_sprint_planning_sprintplanning, _claude_commands_bmad_bmm_workflows_sprint_status_sprintstatus, _claude_commands_bmad_bmm_workflows_dev_story_devstory, _claude_commands_bmad_bmm_workflows_retrospective_retrospective, _claude_commands_bmad_bmm_workflows_sprint_planning_sprintstatusyaml [INFERRED 0.85]
- **BMAD quick-flow lightweight track** — _claude_commands_bmad_bmm_workflows_quick_spec_quickspec, _claude_commands_bmad_bmm_workflows_quick_dev_quickdev, _claude_commands_bmad_bmm_workflows_quick_dev_directworkflowmdloading [EXTRACTED 1.00]
- **BMAD Excalidraw diagram workflow family driven by workflow.xml** — _cursor_commands_bmad_bmm_workflows_create_excalidraw_dataflow_create_dataflow, _cursor_commands_bmad_bmm_workflows_create_excalidraw_diagram_create_diagram, _cursor_commands_bmad_bmm_workflows_create_excalidraw_flowchart_create_flowchart, _cursor_commands_bmad_bmm_workflows_code_review_workflow_xml_engine, _cursor_commands_bmad_bmm_workflows_create_excalidraw_diagram_excalidraw_format [EXTRACTED 1.00]
- **BMAD planning pipeline: PRD to Architecture to Epics/Stories to readiness gate** — _cursor_commands_bmad_bmm_workflows_create_epics_and_stories_prd, _cursor_commands_bmad_bmm_workflows_create_architecture_create_architecture, _cursor_commands_bmad_bmm_workflows_create_epics_and_stories_create_epics_and_stories, _cursor_commands_bmad_bmm_workflows_check_implementation_readiness_check_implementation_readiness [EXTRACTED 1.00]
- **BMAD BMM agent persona roster sharing one activation protocol** — _cursor_commands_bmad_bmm_agents_analyst_analyst, _cursor_commands_bmad_bmm_agents_architect_architect, _cursor_commands_bmad_bmm_agents_dev_dev, _cursor_commands_bmad_bmm_agents_pm_pm, _cursor_commands_bmad_bmm_agents_sm_sm, _cursor_commands_bmad_bmm_agents_tea_tea, _cursor_commands_bmad_bmm_agents_tech_writer_tech_writer, _cursor_commands_bmad_bmm_agents_ux_designer_ux_designer, _cursor_commands_bmad_bmm_agents_quick_flow_solo_dev_quick_flow_solo_dev, _cursor_commands_bmad_bmm_agents_analyst_agent_activation_protocol [EXTRACTED 1.00]
- **Cursor Phase-4 Implementation Loop (plan, create, dev, retro)** — _cursor_commands_bmad_bmm_workflows_sprint_planning_sprint_planning, _cursor_commands_bmad_bmm_workflows_sprint_status_sprint_status, _cursor_commands_bmad_bmm_workflows_create_story_create_story, _cursor_commands_bmad_bmm_workflows_dev_story_dev_story, _cursor_commands_bmad_bmm_workflows_retrospective_retrospective [INFERRED 0.85]
- **Cursor testarch Quality Suite** — _cursor_commands_bmad_bmm_workflows_testarch_atdd_testarch_atdd, _cursor_commands_bmad_bmm_workflows_testarch_automate_testarch_automate, _cursor_commands_bmad_bmm_workflows_testarch_ci_testarch_ci, _cursor_commands_bmad_bmm_workflows_testarch_framework_testarch_framework, _cursor_commands_bmad_bmm_workflows_testarch_nfr_testarch_nfr, _cursor_commands_bmad_bmm_workflows_testarch_test_design_testarch_test_design, _cursor_commands_bmad_bmm_workflows_testarch_test_review_testarch_test_review [EXTRACTED 1.00]
- **Cursor Planning-Phase Artifact Workflows (brief, PRD, UX, wireframe)** — _cursor_commands_bmad_bmm_workflows_create_product_brief_create_product_brief, _cursor_commands_bmad_bmm_workflows_prd_prd, _cursor_commands_bmad_bmm_workflows_create_ux_design_create_ux_design, _cursor_commands_bmad_bmm_workflows_create_excalidraw_wireframe_create_excalidraw_wireframe, _cursor_commands_bmad_bmm_workflows_research_research [INFERRED 0.85]
- **Sandcastle orchestration pipeline (plan -> implement -> review -> merge)** — _sandcastle_implement_review_plan_prompt_planner_prompt, _sandcastle_implement_review_implement_prompt_implementer_prompt, _sandcastle_implement_review_review_prompt_reviewer_prompt, _sandcastle_implement_review_merge_prompt_merger_prompt, _sandcastle_readme_sandcastle_config [EXTRACTED 1.00]
- **mamen package contract chain: shared -> api / sdk -> web** — context_map_package_shared, context_map_package_api, context_map_package_sdk, context_map_package_web [EXTRACTED 1.00]
- **Category kind & assignability model (folder/leaf/flip/spill/guarded delete)** — context_map_category_folder, context_map_category_leaf, context_map_leaf_assignable_invariant, context_map_kind_flip, context_map_spill, context_map_guarded_delete [EXTRACTED 1.00]
- **Category derivation flow: rule → issuer → derived category → filter/rollup** — docs_agents_domain_matching_rule, docs_agents_domain_issuer, docs_adr_0002_category_filter_matches_the_derivation_derived_category, docs_agents_domain_category, docs_adr_0003_categories_nest_to_any_depth_assignability_is_childlessness_recursive_rollup [EXTRACTED 1.00]
- **Contract foundations chain: taxonomy + contract design → shared foundations → accounts port** — docs_issues_0005_error_taxonomy_status_conventions_error_taxonomy, docs_issues_0006_design_new_rest_contract_new_rest_contract, docs_issues_0010_shared_contract_foundations_shared_contract_foundations, docs_issues_0011_port_accounts_port_accounts [EXTRACTED 1.00]
- **Server-side-only credential pattern (PDF extraction, logo search) with sanitized client errors** — docs_adr_0005_pdf_extraction_runs_server_side_server_side_pdf_extraction, docs_adr_0007_issuer_images_are_normalised_search_is_server_side_logo_search, docs_adr_0005_pdf_extraction_runs_server_side_extraction_failed, docs_adr_0007_issuer_images_are_normalised_search_is_server_side_ssrf_guards [INFERRED 0.85]
- **Per-resource port tickets → cutover → web SDK adaptation** — docs_issues_0012_port_categories_port_categories, docs_issues_0013_port_merchants_port_merchants, docs_issues_0014_port_transactions_core_port_transactions_core, docs_issues_0015_port_transactions_bulk_port_transactions_bulk, docs_issues_0016_port_rules_port_rules, docs_issues_0017_port_subscriptions_port_subscriptions, docs_issues_0018_port_settings_app_settings_port_settings_app_settings, docs_issues_0019_port_health_database_port_health_database, docs_issues_0020_cutover_cutover, docs_issues_0021_adapt_web_to_sdk_adapt_web_to_sdk [EXTRACTED 1.00]
- **Research foundation feeding the new REST contract** — docs_research_api_surface_inventory_api_surface_inventory, docs_research_error_taxonomy_error_taxonomy, docs_research_uploads_static_under_httpapi_uploads_static_under_httpapi, docs_research_effect_httpapi_stack_survey_httpapi_stack_survey, docs_research_api_contract_new_rest_contract [EXTRACTED 1.00]
- **PDF import: extraction → reconciliation → side-by-side validation → commit** — packages_web_context_pdf_extraction, packages_web_context_extracted_transaction, packages_web_context_declared_totals, packages_web_context_reconciliation_check, packages_web_context_side_by_side_validation, packages_web_context_import [EXTRACTED 1.00]
- **@mamen/web multi-resolution PWA and browser icon set** — packages_web_public_apple_touch_icon, packages_web_public_favicon_16x16, packages_web_public_favicon_32x32, packages_web_public_icon_192x192, packages_web_public_icon_512x512, packages_web_public_money_bag_brand_mark [INFERRED 0.95]

## Communities (125 total, 19 thin omitted)

### Community 0 - "Settings API & SDK Queries"
Cohesion: 0.05
Nodes (72): SettingsLive, CountResult, PagedSetting, SettingRepo, asSetting, make(), RepoTest, accountKeys (+64 more)

### Community 1 - "Shared REST Contract"
Cohesion: 0.06
Nodes (66): CategoryRow, CountResult, ListFilter, PagedCategory, ADR-0001, ADR-0003, ADR-0006, AccountsGroup (+58 more)

### Community 2 - "Recap Period & Accounts"
Cohesion: 0.05
Nodes (50): AccountMultiSelect(), AccountMultiSelectProps, triggerLabel(), ADR-0002, currentMonthPeriod(), monthKeyOf(), pad2(), Period (+42 more)

### Community 3 - "Account Import Month Grid"
Cohesion: 0.05
Nodes (57): ImportGrid(), MONTH_LABELS, nowMonth(), CellState, MonthCell(), availableYears(), isMonthImportable(), monthKey (+49 more)

### Community 4 - "Issuer Matching Engine"
Cohesion: 0.06
Nodes (54): AssignedOutcome, cents(), compareSpecificity(), compile(), CompiledRule, CompiledSet, deleteLists(), DeletePreviewLists (+46 more)

### Community 5 - "Sandcastle Orchestration Helpers"
Cohesion: 0.11
Nodes (46): checkConfigFreshness(), fetchWithTimeout(), git(), BranchCommit, closeCompletedIssue(), commitList(), Completion, completionComment() (+38 more)

### Community 6 - "Issuer Detail & Sorting"
Cohesion: 0.07
Nodes (34): IssuerDetailPage(), CATEGORIES, deleteImage, makeRouter(), removeIssuer, renderAt(), updateIssuer, uploadImage (+26 more)

### Community 7 - "Sandcastle Prompts & Standards"
Cohesion: 0.05
Nodes (51): BMM Workflow: testarch-trace, workflow.xml Core OS (BMAD execution engine), BMM Workflow: workflow-init, BMM Workflow: workflow-status, Sandcastle CODING_STANDARDS.md, Standard: Dev servers / logs (tee to logs/<service>.log), Standard: React / file structure (one component per file), Implementer prompt (implement) (+43 more)

### Community 8 - "API Effect Dependencies"
Cohesion: 0.04
Nodes (44): bun-types, claude-code-effect, @effect/platform-bun, @effect/platform-node, @effect/sql, @effect/sql-sqlite-bun, @effect/sql-sqlite-node, dependencies (+36 more)

### Community 9 - "Web Route Tree"
Cohesion: 0.06
Nodes (39): Route, Route, Route, Route, Route, Route, Route, Route (+31 more)

### Community 10 - "Biome Lint Config"
Cohesion: 0.05
Nodes (39): noLabelWithoutControl, source, assist, actions, enabled, css, parser, files (+31 more)

### Community 11 - "Import Commit Flow"
Cohesion: 0.11
Nodes (24): AccountId, DeclaredTotals, ExtractedTransaction, TransactionCreate, CommitBar(), commitImport(), CommitResult, distinctMonths() (+16 more)

### Community 12 - "Sidebar, Dialog & Theme"
Cohesion: 0.09
Nodes (29): NAV_LINKS, NavLink, ThemeToggle(), DialogContent(), DialogDescription(), DialogFooter(), DialogHeader(), DialogOverlay() (+21 more)

### Community 13 - "Issuer Creation & Avatar"
Cohesion: 0.09
Nodes (23): Issuer, Input(), InputProps, ADR-0002, CreateIssuerPage(), CATEGORIES, createIssuer, renderPage() (+15 more)

### Community 14 - "Category Tree Utilities"
Cohesion: 0.14
Nodes (30): MoveForm(), CategoryTransactionsView(), resolveCategoryIds(), routeApi, ADR-0002, ADR-0003, CategoryLeafPicker(), CategoryPicker() (+22 more)

### Community 15 - "Web App TSConfig"
Cohesion: 0.06
Nodes (32): compilerOptions, allowImportingTsExtensions, baseUrl, erasableSyntaxOnly, jsx, lib, module, moduleDetection (+24 more)

### Community 16 - "BMAD Agent Personas"
Cohesion: 0.11
Nodes (32): Agent Activation Protocol (load full persona file, stay in character), BMM Architect Agent, BMM Dev Agent, BMM PM Agent, BMM Quick Flow Solo Dev Agent, BMM TEA (Test Architect) Agent, BMM Tech Writer Agent, BMM UX Designer Agent (+24 more)

### Community 17 - "Context Map Glossary"
Cohesion: 0.07
Nodes (32): ADR 0003 — Categories nest to any depth, ADR 0004 — Value matcher rides the issuer, ADR 0006 — Category colour inherited, icons are Lucide names, ADR 0007 — Issuer images normalised, search is server-side, Avatar fallback chain (imageUrl > category icon > grey ?), Category folder (has children, never assignable), Category leaf (no children, only assignable kind), Category override (manualCategory + categoryId) (+24 more)

### Community 18 - "Database Row Mapping"
Cohesion: 0.08
Nodes (25): TABLES, toAccountRow, toAppSettingsRow, toCategoryRow, toIssuerRow, toRuleRow, toSettingRow, toSubscriptionRow (+17 more)

### Community 19 - "Transactions Repository"
Cohesion: 0.07
Nodes (29): TransactionsLive, ADR-0001, AnomalyFlagsJson, candidateFromRow(), CountResult, decodeTransactionRow, Filters, legFromRow() (+21 more)

### Community 20 - "Web Test Tooling Deps"
Cohesion: 0.06
Nodes (31): jsdom, devDependencies, jsdom, shadcn, @tanstack/router-plugin, @testing-library/jest-dom, @testing-library/react, @testing-library/user-event (+23 more)

### Community 21 - "Root Monorepo Package"
Cohesion: 0.07
Nodes (29): @ai-hero/sandcastle, @biomejs/biome, devDependencies, @ai-hero/sandcastle, @biomejs/biome, turbo, typescript, zod (+21 more)

### Community 22 - "API Handler Test Harness"
Cohesion: 0.11
Nodes (21): asId, HttpLive, ApiLive, HttpLive, EMPTY_DUMP, HttpLive, seed, ADR-0001 (+13 more)

### Community 23 - "SDK Package Manifest"
Cohesion: 0.07
Nodes (29): dependencies, effect, @effect/platform, @mamen/shared, devDependencies, @effect/vitest, vitest, @vitest/coverage-v8 (+21 more)

### Community 24 - "Legacy Shared Types"
Cohesion: 0.18
Nodes (20): Account, AccountType, AnomalyFlag, AnomalySettings, AnomalyType, Category, CategorySelection, CategoryTreeNode (+12 more)

### Community 25 - "Web Runtime Dependencies"
Cohesion: 0.07
Nodes (27): class-variance-authority, clsx, cmdk, date-fns, framer-motion, @mamen/sdk, dependencies, class-variance-authority (+19 more)

### Community 26 - "API Live Layer Assembly"
Cohesion: 0.12
Nodes (16): AccountsLive, AppSettingsLive, CategoriesLive, CategoryRepo, DatabaseLive, DatabaseRepo, HealthLive, extractPdf() (+8 more)

### Community 27 - "Transaction Detail Sections"
Cohesion: 0.14
Nodes (20): PreviewTable(), TransferSummary, TransferSummaryLine(), TransactionRow(), DetailField(), CoreFields(), DATE_TIME, DetailHeader() (+12 more)

### Community 28 - "Command Palette & Popover"
Cohesion: 0.22
Nodes (17): CategoryTreeItems(), Command(), CommandEmpty(), CommandGroup(), CommandInput(), CommandItem(), CommandList(), CommandSeparator() (+9 more)

### Community 29 - "Database Migrations"
Cohesion: 0.09
Nodes (8): Folder, Leaf, BunReMigrated, countCategories, NodeReMigrated, TREE, ADR-0004, migrations

### Community 30 - "Transaction Table Cells"
Cohesion: 0.14
Nodes (18): Category, Table(), TableBody(), TableCell(), TableHead(), TableHeader(), TableRow(), ADR-0002 (+10 more)

### Community 31 - "Resource Port Issues"
Cohesion: 0.13
Nodes (23): AnomalyFlag schema, Port transactions core (CRUD + composable list/count), TransactionsGroup, Transaction bulk + targeted-delete endpoints, Port transactions bulk, Port rules, RulesGroup, AppSettingsGroup (+15 more)

### Community 32 - "Subscriptions Repository"
Cohesion: 0.12
Nodes (20): CountResult, Filters, ListFilter, PagedSubscription, SubscriptionFromRow, SubscriptionRow, asIssuer, asSubscription (+12 more)

### Community 33 - "Button & Account Rows"
Cohesion: 0.18
Nodes (15): Button(), ButtonProps, buttonVariants, GousseVariant, AccountRow(), AccountRowProps, ACCOUNT_TYPE_OPTIONS, AccountType (+7 more)

### Community 34 - "Web Node TSConfig"
Cohesion: 0.09
Nodes (22): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, moduleResolution, noEmit (+14 more)

### Community 35 - "Accounts & App Settings Repos"
Cohesion: 0.13
Nodes (16): AccountRepo, AccountRow, CountResult, PagedAccount, asId, RepoTest, AppSettingsFromRow, AppSettingsRepo (+8 more)

### Community 36 - "Issuer Image Normalisation"
Cohesion: 0.14
Nodes (12): ALLOWED_MIME_TYPES, deleteIssuerImage(), deletePreviousImage(), imageUrlFor(), ImageDecodeFailed, normaliseIssuerImage(), BLUE, GREEN (+4 more)

### Community 37 - "shadcn Component Registry"
Cohesion: 0.10
Nodes (19): aliases, components, hooks, lib, ui, utils, iconLibrary, registries (+11 more)

### Community 38 - "Transactions Search & View"
Cohesion: 0.17
Nodes (14): TransactionsSearch, validateTransactionsSearch(), TransactionsTable(), routeApi, ACCOUNTS, CATEGORIES, ISSUERS, listMock (+6 more)

### Community 39 - "TestArch Workflow Suite"
Cohesion: 0.16
Nodes (19): Save outputs after each section, workflow-config YAML parameter indirection, workflow.xml Core OS execution engine, retrospective workflow command, sprint-planning workflow command, sprint-status.yaml tracking file, sprint-status workflow command, testarch-automate workflow command (+11 more)

### Community 40 - "API Config & Server Entry"
Cohesion: 0.16
Nodes (13): CorsOrigins, DbPath, Port, UploadsDir, DatabaseLive, MigratorLive, SqlLive, ClaudeCodeProdLive (+5 more)

### Community 41 - "Effect API Rework Map"
Cohesion: 0.16
Nodes (18): Frontier query (unblocked, unassigned children in map order), GitHub Issues as issue tracker (gh CLI), Wayfinder map and child tickets, Triage label vocabulary, Issue #1: Effect API rework (wayfinder map), Three-package layout (@mamen/shared, @mamen/api, @mamen/sdk), SqlClient tag indirection (bun:sqlite untestable under vitest), Issue #2: Survey the Effect HttpApi stack (+10 more)

### Community 42 - "Shared Package Manifest"
Cohesion: 0.12
Nodes (16): dependencies, effect, @effect/platform, exports, ./contract, effect, @effect/platform, main (+8 more)

### Community 43 - "Transactions Filters"
Cohesion: 0.15
Nodes (13): Account, MonthReplacement(), PeriodSelector(), inputClass, accounts, months, TransactionFilterValues, TransactionsFilters() (+5 more)

### Community 44 - "Column Visibility Toggle"
Cohesion: 0.18
Nodes (9): ColumnsToggle(), ColumnsToggleProps, readStored(), TOGGLEABLE_COLUMNS, TOGGLEABLE_IDS, ToggleableColumnId, useColumnVisibility(), UseColumnVisibilityResult (+1 more)

### Community 45 - "Rule Preview Lists"
Cohesion: 0.16
Nodes (11): Transaction, RulePreviewLists(), RulePreviewListsProps, TransactionPreviewList(), TransactionPreviewListProps, TransactionRowProps, CategoryPickerProps, IssuerPickerProps (+3 more)

### Community 46 - "Turbo Task Pipeline"
Cohesion: 0.15
Nodes (15): ^build, dependsOn, outputs, cache, dependsOn, persistent, dist/**, $schema (+7 more)

### Community 47 - "PDF Import Domain"
Cohesion: 0.16
Nodes (15): Operational dependency: the claude CLI, CLAUDE_CODE_OAUTH_TOKEN, ClaudeConfigLive fail-at-build token check, ADR 0001: Server-side issuer matching, Amount sign convention, Declared totals, Extracted transaction, Import (+7 more)

### Community 48 - "Category Icon Resolution"
Cohesion: 0.20
Nodes (12): CategoryIcon(), CategoryIconProps, inFlight, isIconName(), KNOWN_ICON_NAMES, load(), Resolution, resolutionOf() (+4 more)

### Community 49 - "Rule Form Page Tests"
Cohesion: 0.18
Nodes (8): createRule, EditRulePage(), makeRouter(), NewRulePage(), previewRule, removeManualIssuer, renderAt(), updateRule

### Community 50 - "Base TSConfig"
Cohesion: 0.14
Nodes (13): compilerOptions, composite, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames, isolatedModules, module (+5 more)

### Community 51 - "Cursor TestArch Mirrors"
Cohesion: 0.21
Nodes (13): Cursor Command: create-excalidraw-wireframe, Cursor Command: create-story, Cursor Command: dev-story, workflow.xml Core OS (Cursor dispatch runtime), Cursor Command: sprint-planning, Cursor Command: sprint-status, Cursor Command: testarch-atdd, Cursor Command: testarch-automate (+5 more)

### Community 52 - "Error Taxonomy & Contract Design"
Cohesion: 0.22
Nodes (13): ExtractionFailed (502) single collapsed failure, Issue #4: Inventory the current API surface, Settings vs app-settings split (LLM config duplication), Issue #5: Error taxonomy and status-code conventions, SqlError service boundary (UNIQUE → Conflict, else untyped 500), Flat per-error tagged envelope (NotFound/Conflict/InvalidFileType), Branded ids everywhere, Issue #6: Design the new REST contract (+5 more)

### Community 53 - "HttpApi Stack Research"
Cohesion: 0.18
Nodes (13): Current API surface inventory, BaseRepository port, Gotcha: bun:sqlite vs Node-run vitest, Gotcha: Effect 4.0 is in beta, Contract-in-its-own-package pattern, Effect HttpApi stack survey, @effect/sql-sqlite-bun data layer, Gotcha: vitest 4 breaks @effect/vitest (+5 more)

### Community 54 - "Category Mutations"
Cohesion: 0.23
Nodes (9): CategoryId, CategoryEditorDialog(), NodeActions, ADR-0003, useCategoryMutations(), ADR-0006, useCreateCategoryLeaf(), categoryHoldsMoney() (+1 more)

### Community 55 - "Quick-Flow BMAD Workflows"
Cohesion: 0.23
Nodes (12): dev-story workflow command, document-project workflow command, generate-project-context workflow command, prd tri-modal workflow command, Direct workflow.md loading pattern, quick-dev workflow command, quick-spec workflow command, research workflow command (+4 more)

### Community 56 - "Categories Handler Tests"
Cohesion: 0.17
Nodes (10): asAccount, asId, HttpLive, SEEDED_FOLDERS, SEEDED_LEAF_COUNT, SEEDED_TREE, ADR-0001, ADR-0003 (+2 more)

### Community 57 - "Web Package Scripts"
Cohesion: 0.17
Nodes (11): name, private, scripts, build, dev, preview, test, test:watch (+3 more)

### Community 58 - "Categories View Tests"
Cohesion: 0.18
Nodes (11): category(), countCalls, createCategory, removeCategory, renderView(), seedTree(), spillCategory, toastError (+3 more)

### Community 59 - "Analyst & PRD Workflows"
Cohesion: 0.20
Nodes (11): BMM Analyst Agent, Create Product Brief Workflow, Analyst Agent (Cursor), Cursor Command: create-product-brief, Cursor Command: document-project, Cursor Command: generate-project-context, Direct workflow.md Dispatch Pattern, Cursor Command: prd (+3 more)

### Community 60 - "Excalidraw & Story Workflows"
Cohesion: 0.27
Nodes (11): BMM Scrum Master Agent, workflow.xml Core OS (_bmad/core/tasks/workflow.xml), Correct Course Workflow, Create Excalidraw Dataflow Diagram Workflow, Create Excalidraw Technical Diagram Workflow, Excalidraw Diagram Workflow Family, Create Excalidraw Flowchart Workflow, Create Excalidraw Wireframe Workflow (+3 more)

### Community 61 - "Category Tree ADRs"
Cohesion: 0.25
Nodes (11): Enforcement at the API, not the UI, Folder rollup (folder total = sum of children), ADR 0001: Two-level category tree (superseded), assertLeaf child-count probe, Category error variants (CategoryNotLeaf, CategoryHasChildren, CategoryParentNotFolder), Re-parent cycle guard, ADR 0003: Categories nest to any depth; assignability is childlessness, ADR 0006: Category colour is inherited (null means inherit) (+3 more)

### Community 62 - "Merchant Uploads & Static"
Cohesion: 0.20
Nodes (11): MerchantsGroup, Port merchants (image upload + /uploads static), uploadImage multipart endpoint, /uploads/* static wildcard route, HttpApiClient derived client, InvalidFileType (415) domain error, HttpApiSchema.Multipart + SingleFileSchema, Handler-enforced MIME allow-list (+3 more)

### Community 63 - "Transactions Handler Tests"
Cohesion: 0.20
Nodes (10): ApiClient, asAccount, asCategory, asIssuer, asTx, DATE, HttpLive, make() (+2 more)

### Community 64 - "API TSConfig"
Cohesion: 0.18
Nodes (10): compilerOptions, outDir, rootDir, types, extends, include, src, ../../tsconfig.base.json (+2 more)

### Community 65 - "Transfer Suggestions"
Cohesion: 0.36
Nodes (7): TransferSection(), cents(), isTransferEligible(), suggestTransferCounterparts(), ids(), time(), useTransfer()

### Community 66 - "Value Matcher ADR"
Cohesion: 0.22
Nodes (10): Issuer invariant (a rule assigns only an issuer), Rule specificity comparator (value tier > literal length > newest), ADR 0004: Value matcher rides the issuer, Whole-cents, sign-agnostic amount comparison, winnerFor match predicate (regex + value), Flag ADR conflicts rather than silently overriding, CONTEXT-MAP.md / per-package CONTEXT.md glossary, Domain Docs convention (multi-context monorepo) (+2 more)

### Community 67 - "Cutover & Gousse UI Bridge"
Cohesion: 0.22
Nodes (10): Cutover — delete old packages, retire zod, rewire dev, Retire zod from @mamen/shared, Adapt web frontend onto @mamen/sdk, Web break scope (197 TS errors, two barrels), web — glossary, gousse-* design tokens, ADR 0002: gousse-ui theming under Tailwind v4, Base UI + Radix coexistence at the token seam (+2 more)

### Community 68 - "Issuer Handler Tests"
Cohesion: 0.20
Nodes (4): asId, FIRST_SEEN, HttpLive, ADR-0003

### Community 69 - "Brainstorming & Party Mode"
Cohesion: 0.22
Nodes (9): Brainstorming Workflow Command, Pointer Command Loading Convention, _bmad/core/workflows/brainstorming/workflow.md, Multi-Agent Group Conversation, Party Mode Workflow Command, _bmad/core/workflows/party-mode/workflow.md, BMAD Core Agent: bmad-master, BMAD Core Workflow: brainstorming (+1 more)

### Community 70 - "Issuer Image Cap Tests"
Cohesion: 0.22
Nodes (3): decodeSpy, ServerLive, tempDirs

### Community 71 - "SDK TSConfig"
Cohesion: 0.22
Nodes (8): compilerOptions, outDir, rootDir, extends, include, src, ../../tsconfig.base.json, references

### Community 73 - "Transaction Detail Page"
Cohesion: 0.28
Nodes (5): Empty(), EmptyProps, ADR-0002, routeApi, TransactionDetailPage()

### Community 74 - "Accounts View Tests"
Cohesion: 0.22
Nodes (6): accountsRoute, createAccount, importRoute, removeAccount, rootRoute, updateAccount

### Community 75 - "Category Transactions Tests"
Cohesion: 0.25
Nodes (8): ACCOUNTS, CATEGORIES, countMock, ISSUERS, listMock, makeRouter(), renderView(), TXNS

### Community 76 - "Import View & Search"
Cohesion: 0.31
Nodes (5): ImportView(), routeApi, ImportSearch, validateImportSearch(), Route

### Community 77 - "Rule Form Routes"
Cohesion: 0.22
Nodes (4): RuleFormPage(), NewRuleSearch, Route, Route

### Community 78 - "Excalidraw Diagram Family"
Cohesion: 0.32
Nodes (8): Create Excalidraw Dataflow Workflow (Claude), Create Excalidraw Diagram Workflow (Claude), Create Excalidraw Flowchart Workflow (Claude), workflow.xml Execution Engine, Create Excalidraw Dataflow Workflow (Cursor), Create Excalidraw Diagram Workflow (Cursor), Excalidraw Diagram Format, Create Excalidraw Flowchart Workflow (Cursor)

### Community 79 - "Category Filter Derivation"
Cohesion: 0.32
Nodes (8): Category id set filter (IN a set of ids), Derived category (manualCategory ? t.categoryId : i.defaultCategoryId), ADR 0002: Category filter matches the derivation, Client-side recursive rollup (one shared module, five callers), Issuer (domain concept), Transaction (domain concept), Transactions query-param fan-out (9-branch either/or dispatch), Fully composable AND filters for the transactions list

### Community 80 - "Image Normalisation & Uploads"
Cohesion: 0.25
Nodes (8): Lucide kebab-case icon names replace emoji, Search fires only on explicit submit (free-tier quota), ADR 0007: Issuer images normalised to 128x128 WebP cover-crop, Server-side Logo search (Google Programmable Search proxy), SSRF guards on the fetch-and-store sink, HttpApiSchema.Multipart + PersistedFile upload pattern, Path-traversal guard on the /uploads/* wildcard route, Issue #3: Uploads and static files under HttpApi

### Community 81 - "Date Handling & Subscriptions"
Cohesion: 0.25
Nodes (8): Composable parentId/orderBy category list filter, Composable AND transaction filters, Port subscriptions, Subscription string date fields (faithful-port gotcha), SubscriptionsGroup, Per-field date schema handling, dateParserPlugin / dateReviver, Transactions 9-branch query fan-out

### Community 82 - "Colour Inherit Migration"
Cohesion: 0.25
Nodes (6): ICON_TRANSLATION, allCategories, Row, ADR-0006, ADR-0003, ADR-0006

### Community 83 - "Shared TSConfig"
Cohesion: 0.25
Nodes (7): compilerOptions, outDir, rootDir, extends, include, src, ../../tsconfig.base.json

### Community 84 - "Import Grid Tests"
Cohesion: 0.25
Nodes (5): accountsRoute, importRoute, NOW, rootRoute, stashHandoff

### Community 85 - "Doc Sharding Tasks"
Cohesion: 0.29
Nodes (7): Index Docs Task, _bmad/core/tasks/index-docs.xml, Level-2 Section Sharding, _bmad/core/tasks/shard-doc.xml, Shard Document Task, BMAD Core Task: index-docs, BMAD Core Task: shard-doc

### Community 86 - "Rules Section Tests"
Cohesion: 0.33
Nodes (3): makeRouter(), removeRule, renderSection()

### Community 87 - "Category Picker Tests"
Cohesion: 0.29
Nodes (4): CATEGORIES, createCategory, groceries, updateTransaction

### Community 88 - "Branded Ids & NotFound"
Cohesion: 0.33
Nodes (6): CategoriesGroup, Port categories, Branded resource ids, Zero DB foreign keys, NotFound (404) domain error, Per-endpoint error-set discipline

### Community 89 - "Server-Side Issuer ADR"
Cohesion: 0.47
Nodes (6): The Issuer invariant (manual > specificity-winner > unmatched), IssuerMatcher service, Regex in JS, not SQL, Assignment, Matching Rule, Raw issuer string

### Community 90 - "Import Handler Tests"
Cohesion: 0.40
Nodes (3): CCF_OBJECT, httpLiveWith(), claudeCodeTestLayer()

### Community 91 - "PWA Icon Set"
Cohesion: 0.47
Nodes (6): apple-touch-icon.png (180px iOS home-screen icon), favicon-16x16.png (smallest browser favicon), favicon-32x32.png (standard browser favicon), icon-192x192.png (PWA manifest icon), icon-512x512.png (PWA maskable/splash-size icon), Money-bag brand mark (3D beige sack, rope tie, gold dollar sign)

### Community 92 - "Web Root TSConfig"
Cohesion: 0.33
Nodes (5): compilerOptions, baseUrl, paths, files, references

### Community 93 - "Server-Side PDF Extraction"
Cohesion: 0.40
Nodes (5): Account-agnostic extraction (pure function of the file), claude CLI + CLAUDE_CODE_OAUTH_TOKEN operational dependency, ADR 0005: PDF extraction runs server-side, Transient scoped temp dir (PDF never persists), Account (domain concept)

### Community 94 - "Categories Repository Tests"
Cohesion: 0.40
Nodes (3): asId, RepoTest, ADR-0006

### Community 95 - "Assignment Picker Tests"
Cohesion: 0.50
Nodes (4): createIssuer, makeRouter(), open(), updateTransaction

### Community 97 - "Web App Entry & Router"
Cohesion: 0.40
Nodes (4): Register, router, @tanstack/react-router, routeTree

### Community 99 - "Import Glossary Terms"
Cohesion: 0.67
Nodes (4): ADR 0005 — PDF extraction runs server-side, Declared totals (statement's printed TOTAL DES OPERATIONS), Extracted transaction (PDF candidate operation), Server-side extraction (claude CLI via claude-code-effect)

## Knowledge Gaps
- **670 isolated node(s):** `BranchCommit`, `RtkSummary`, `runTimer`, `rtkTotals`, `runTimer` (+665 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **19 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Transaction` connect `Rule Preview Lists` to `Settings API & SDK Queries`, `Shared REST Contract`, `Recap Period & Accounts`, `Account Import Month Grid`, `Issuer Matching Engine`, `Transfer Suggestions`, `Issuer Detail & Sorting`, `Transactions Search & View`, `Transaction Detail Page`, `Issuer Creation & Avatar`, `Category Tree Utilities`, `Rule Form Page Tests`, `Transactions Repository`, `Rules Section Tests`, `Category Picker Tests`, `Transaction Detail Sections`, `Command Palette & Popover`, `Transaction Table Cells`?**
  _High betweenness centrality (0.010) - this node is a cross-community bridge._
- **Why does `AccountId` connect `Import Commit Flow` to `Settings API & SDK Queries`, `Shared REST Contract`, `Button & Account Rows`, `Accounts & App Settings Repos`, `Issuer Matching Engine`, `Account Import Month Grid`, `Transactions Search & View`, `Import View & Search`, `Category Tree Utilities`, `Transactions Repository`, `API Handler Test Harness`, `Categories Handler Tests`, `Transactions Handler Tests`?**
  _High betweenness centrality (0.010) - this node is a cross-community bridge._
- **Why does `cn()` connect `Sidebar, Dialog & Theme` to `Button & Account Rows`, `Recap Period & Accounts`, `Transfer Suggestions`, `Issuer Detail & Sorting`, `Transaction Detail Page`, `Transactions Filters`, `Column Visibility Toggle`, `Issuer Creation & Avatar`, `Category Tree Utilities`, `Category Icon Resolution`, `Category Mutations`, `Transaction Detail Sections`, `Command Palette & Popover`, `Transaction Table Cells`?**
  _High betweenness centrality (0.010) - this node is a cross-community bridge._
- **What connects `BranchCommit`, `RtkSummary`, `runTimer` to the rest of the system?**
  _670 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Settings API & SDK Queries` be split into smaller, more focused modules?**
  _Cohesion score 0.05177993527508091 - nodes in this community are weakly interconnected._
- **Should `Shared REST Contract` be split into smaller, more focused modules?**
  _Cohesion score 0.061419753086419754 - nodes in this community are weakly interconnected._
- **Should `Recap Period & Accounts` be split into smaller, more focused modules?**
  _Cohesion score 0.05228105228105228 - nodes in this community are weakly interconnected._