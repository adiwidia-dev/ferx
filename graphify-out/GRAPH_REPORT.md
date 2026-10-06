# Graph Report - ferx  (2026-10-06)

## Corpus Check
- 194 files · ~87,681 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1099 nodes · 1859 edges · 152 communities (72 shown, 80 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 100 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `1dbddd84`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Rust Webview State Lifecycle
- Todos and Page Lifecycle
- Rust Behavioral Test Suite
- Frontend Dependency Ecosystem
- Webview Command Runtime
- Workspace Icon Catalog
- Workspace Group State
- DND and Runtime Badges
- Service Configuration Editor
- Badge Engine Test Harness
- Navigation Badge Payloads
- Content Security Policy
- Tauri Capability Permissions
- Native File Drop
- Notification Preference Integration
- Main Workspace Interface
- Shared UI Primitives
- Desktop Bundle Configuration
- Application Preferences
- Context Menu Components
- Shadcn Component Registry
- Settings Configuration State
- Package Metadata
- Rust Badge Script Loaders
- Service Editor Appearance
- Workspace Config Export
- Service URL Classification
- TypeScript Compiler Configuration
- Version Bump Automation
- Workspace Config Import
- Workspace Mutation Actions
- Native Download Dialog
- Desktop Tray Interface
- Tauri Plugin Dependencies
- Native Notification Logic
- Tauri Build Version Sync
- Webview Setup Validation
- Package Script Commands
- Tauri Application Wiring
- Dialog UI Components
- Resource Usage Monitoring
- Service Management Settings
- Product Distribution Concepts
- Pointer Drag State
- In-App Updater Service
- Contributor Quality and Security
- Badge Strategy Resolution
- Updater Endpoint Configuration
- Runtime Webview Scripts
- Injected Webview Behavior Tests
- Tooltip UI Components
- Webview Lifecycle Reliability
- Service Reordering Utilities
- Service Hibernation Store
- Service Icon Generation
- Webview Resource Usage
- Service Editor Dialog Tests
- Resource Monitor Script Tests
- Workspace State Boundaries
- Webview Event Bridges
- Badge Monitoring Engines
- Cross Platform Releases
- Root Layout Styling
- Svelte Adapter Configuration
- Rust Backend Boundaries
- Retina App Icon
- Retina Central Eye
- Retina Interlocking Rings
- Retina Rounded Background
- Standard App Icon
- Standard Central Leaf
- Standard Interlocking Rings
- Standard Rounded Background
- Compact App Icon
- Compact Central Leaf
- Compact Interlocking Rings
- Compact Rounded Background
- Medium App Icon
- Medium Central Eye
- Medium Interlocking Rings
- Medium Light Background
- HDPI Android Launcher
- HDPI Launcher Foreground
- HDPI Round Launcher
- MDPI Android Launcher
- MDPI Launcher Foreground
- MDPI Round Launcher
- XHDPI Android Launcher
- XHDPI Launcher Foreground
- XHDPI Round Launcher
- XXHDPI Android Launcher
- XXHDPI Launcher Foreground
- XXHDPI Round Launcher
- XXXHDPI Android Launcher
- Android Foreground Launcher
- Android Round Launcher
- Desktop Ferx App Icon
- iOS 20pt 1x Icon
- iOS 20pt Alternate 2x
- iOS 20pt 2x Icon
- iOS 20pt 3x Icon
- iOS 29pt 1x Icon
- iOS 29pt Alternate 2x
- iOS 29pt 2x Icon
- iOS 29pt 3x Icon
- iOS 40pt 1x Icon
- iOS 40pt Alternate 2x
- iOS 40pt 2x Icon
- iOS 40pt 3x Icon
- iOS 512pt 2x Icon
- iOS 60pt 2x Icon
- iOS 60pt 3x Icon
- iOS 76pt 1x Icon
- iOS 76pt 2x Icon
- iOS 83.5pt 2x Icon
- Windows 107px Square Logo
- Windows 142px Square Logo
- Windows 150px Square Logo
- Windows 284px Square Logo
- Windows 30px Square Logo
- Windows 310px Square Logo
- Windows 44px Square Logo
- Windows 71px Square Logo
- Windows 89px Square Logo
- Windows Store Logo
- Standard Tray Icon
- Unread Tray Indicator
- Static Raster App Icon
- Static Vector App Icon
- Svelte Favicon Asset
- page-todos-panel.test.ts
- pull_request_template.md

## God Nodes (most connected - your core abstractions)
1. `$lib/services/workspace-groups` - 58 edges
2. `$lib/services/workspace-state` - 35 edges
3. `$lib/services/workspace-config-import` - 34 edges
4. `$lib/services/notification-prefs` - 31 edges
5. `$lib/services/todos` - 29 edges
6. `$lib/services/workspace-page-lifecycle` - 29 edges
7. `$lib/services/webview-commands` - 27 edges
8. `normalizeWorkspaceGroupsState()` - 25 edges
9. `$lib/services/settings-page-state` - 24 edges
10. `$lib/services/todo-panel.svelte` - 23 edges

## Surprising Connections (you probably didn't know these)
- `Webview Lifecycle Invariant` --semantically_similar_to--> `Long-Lived Service Webviews`  [INFERRED] [semantically similar]
  AGENTS.md → docs/architecture.md
- `injected_js_for_url()` --calls--> `google_auth_compat_script()`  [INFERRED]
  src-tauri/src/service_webview.rs → src-tauri/src/service_webview_runtime_scripts.rs
- `Publish Latest Updater Manifest` --conceptually_related_to--> `Cross-Platform GitHub Distribution`  [INFERRED]
  docs/release-process.md → README.md
- `Webview Reliability Improvements` --conceptually_related_to--> `Serialized Webview Command Queue`  [INFERRED]
  CHANGELOG.md → docs/architecture.md
- `Webview Reliability Improvements` --conceptually_related_to--> `Webview Lifecycle Invariant`  [INFERRED]
  CHANGELOG.md → AGENTS.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Webview Lifecycle Safety** — docs_architecture_long_lived_service_webviews, docs_architecture_serialized_webview_queue, docs_architecture_service_hibernation, agents_webview_lifecycle_invariant, changelog_webview_reliability_improvements [EXTRACTED 1.00]
- **Signed Cross-Platform Release Pipeline** — docs_architecture_minisign_updater, github_workflows_release_serial_platform_builds, github_workflows_release_signed_updater_artifacts, docs_release_process_minisign_key_management, docs_release_process_publish_latest_manifest, readme_cross_platform_distribution [EXTRACTED 1.00]

## Communities (152 total, 80 thin omitted)

### Community 0 - "Rust Webview State Lifecycle"
Cohesion: 0.06
Nodes (81): AtomicU64, HashMap, Mutex, PhysicalPosition, active_resource_usage_monitoring(), ActiveResourceUsageMonitoring, ActiveWebview, badge_monitoring_pref() (+73 more)

### Community 1 - "Todos and Page Lifecycle"
Cohesion: 0.08
Nodes (42): $lib/components/workspace/todos-panel.svelte, #each(), sanitizeTextInputValue(), stripMacosNavigationPrivateUseChars(), $lib/services/todo-panel.svelte, createTodoPanelStore(), SetPanelWidth, splitTodoItems() (+34 more)

### Community 2 - "Rust Behavioral Test Suite"
Cohesion: 0.05
Nodes (16): cloud_teams_setup_uses_teams_safeguards(), discord_setup_keeps_existing_badge_transport(), gmail_setup_omits_chrome_google_auth_compat(), google_chat_setup_omits_chrome_google_auth_compat(), non_google_setup_omits_google_auth_compat(), outlook_badge_script_uses_navigation_bridge_payloads(), outlook_badge_script_uses_screen_reader_and_folder_fallbacks(), outlook_setup_restores_badge_detection_without_notify_navigation() (+8 more)

### Community 3 - "Frontend Dependency Ecosystem"
Cohesion: 0.05
Nodes (43): bits-ui, clsx, @fontsource-variable/inter, @internationalized/date, jsdom, @lucide/svelte, devDependencies, bits-ui (+35 more)

### Community 4 - "Webview Command Runtime"
Cohesion: 0.09
Nodes (34): createAudioMutedPayload(), createDeleteWebviewPayload(), createRightPanelWidthPayload(), createServiceWebviewPayload(), createWebviewIdPayload(), ServiceWebviewService, shouldPreloadService(), $lib/services/webview-commands (+26 more)

### Community 6 - "Workspace Group State"
Cohesion: 0.15
Nodes (28): $lib/services/workspace-groups, addServiceToWorkspace(), createDefaultWorkspaceGroupsState(), createNewWorkspace(), createServicesById(), createWorkspaceGroup(), getWorkspace(), isWorkspaceGroupsState() (+20 more)

### Community 7 - "DND and Runtime Badges"
Cohesion: 0.10
Nodes (21): $lib/services/dnd-state.svelte, clearDndState(), dndState, $lib/services/runtime-badges.svelte, applyRuntimeBadgePayload(), clearRuntimeBadges(), replaceRuntimeBadges(), runtimeBadges (+13 more)

### Community 8 - "Service Configuration Editor"
Cohesion: 0.15
Nodes (18): mountSidebar(), service(), SidebarTestService, workspaces, DEFAULT_NOTIFICATION_PREFS, $lib/services/service-editor.svelte, createServiceEditorStore(), SaveServiceContext (+10 more)

### Community 9 - "Badge Engine Test Harness"
Cohesion: 0.19
Nodes (16): CaptureObserver, runScaffold(), runGenericBadgeScript(), BadgeMockObserver, BadgeObserverObservation, cleanupBadgeTestGlobals(), flushBadgeAsync(), installMutationObserverMock() (+8 more)

### Community 10 - "Navigation Badge Payloads"
Cohesion: 0.13
Nodes (16): BadgePayload, parse_badge_payload(), Option, badge_update_event_payload(), emit_badge_update(), handle_special_navigation(), native_notification_preview_event_payload(), native_notification_preview_event_payload_normalizes_and_truncates_text() (+8 more)

### Community 11 - "Content Security Policy"
Cohesion: 0.16
Nodes (15): asset:, blob:, data:, http://asset.localhost, https://*.google.com, https://*.gstatic.com, https://www.google.com, self (+7 more)

### Community 12 - "Tauri Capability Permissions"
Cohesion: 0.08
Nodes (24): core:default, core:webview:allow-create-webview, core:webview:allow-webview-hide, core:webview:allow-webview-show, https://office.com/*, https://outlook.cloud.microsoft/*, https://outlook.live.com/*, https://outlook.office365.com/* (+16 more)

### Community 13 - "Native File Drop"
Cohesion: 0.15
Nodes (16): DragDropEvent, build_drag_event_js(), build_drag_event_js_uses_viewport_center(), build_file_drop_js(), build_file_drop_js_generates_drop_sequence_at_viewport_center(), build_file_drop_js_returns_none_for_empty_paths(), build_file_drop_js_returns_none_for_nonexistent_paths(), handle_file_drop() (+8 more)

### Community 14 - "Notification Preference Integration"
Cohesion: 0.24
Nodes (11): ensureServiceNotificationPrefs(), isNotificationPrefs(), isValidStorageKey(), normalizeServiceUrl(), parseStoredService(), readStoredServices(), StoredService, createStorageKey() (+3 more)

### Community 15 - "Main Workspace Interface"
Cohesion: 0.22
Nodes (5): $lib/components/workspace/resource-usage-strip.svelte, $lib/components/workspace/workspace-disabled-state.svelte, $lib/components/workspace/workspace-empty-state.svelte, invoke, listen

### Community 17 - "Desktop Bundle Configuration"
Cohesion: 0.17
Nodes (12): app, dmg, bundle, active, createUpdaterArtifacts, macOS, targets, windows (+4 more)

### Community 18 - "Application Preferences"
Cohesion: 0.32
Nodes (7): $lib/services/notification-prefs, countTrayRelevantUnreadServices(), hasOwn(), LegacyNotificationPrefs, normalizeNotificationPrefs(), ServiceWithNotificationPrefs, ServiceWithOptionalNotificationPrefs

### Community 19 - "Context Menu Components"
Cohesion: 0.13
Nodes (4): WithElementRef, WithoutChild, WithoutChildren, WithoutChildrenOrChild

### Community 20 - "Shadcn Component Registry"
Cohesion: 0.12
Nodes (16): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+8 more)

### Community 21 - "Settings Configuration State"
Cohesion: 0.07
Nodes (44): $lib/components/settings/settings-configuration-dialogs.svelte, formatWorkspaceCount(), sharedServiceCount(), $lib/components/settings/settings-configuration-section.svelte, $lib/components/settings/settings-preferences-section.svelte, $lib/components/settings/settings-restart-dialogs.svelte, $lib/components/settings/settings-services-section.svelte, $lib/components/settings/settings-updates-section.svelte (+36 more)

### Community 22 - "Package Metadata"
Cohesion: 0.05
Nodes (44): bugs, url, dependencies, @tauri-apps/api, @tauri-apps/plugin-notification, @tauri-apps/plugin-opener, @tauri-apps/plugin-process, @tauri-apps/plugin-updater (+36 more)

### Community 23 - "Rust Badge Script Loaders"
Cohesion: 0.25
Nodes (14): badge_engine_scaffold_script_exposes_init_function(), custom_badge_scripts_include_shared_utilities_before_engine_logic(), outlook_badge_script_keeps_badge_reporting_fallback_and_safety_poll(), teams_badge_script_keeps_badge_reporting_fallback_and_safety_poll(), badge_engine_runtime_script(), badge_engine_scaffold_script(), badge_engine_script(), badge_engine_utils_script() (+6 more)

### Community 24 - "Service Editor Appearance"
Cohesion: 0.14
Nodes (8): $lib/components/ui/input, $lib/components/ui/label, $lib/components/workspace/service-editor-dialog.svelte, customColorActive, dialogDescription, dialogTitle, previewName, previewUrl

### Community 25 - "Workspace Config Export"
Cohesion: 0.24
Nodes (12): AppSettings, NotificationPrefs, $lib/services/workspace-config-export, buildWorkspaceConfigExportPayload(), ExportedWorkspaceServiceV1, FerxWorkspaceConfigFile, FerxWorkspaceConfigFileV1, FerxWorkspaceConfigFileV2 (+4 more)

### Community 26 - "Service URL Classification"
Cohesion: 0.33
Nodes (11): badge_strategy_for_url(), extract_hostname(), hostname_matches(), microsoft_service_kind(), MicrosoftServiceKind, Option, injected_js_for_url(), is_google_auth_sensitive_service() (+3 more)

### Community 27 - "TypeScript Compiler Configuration"
Cohesion: 0.15
Nodes (12): ./.svelte-kit/tsconfig.json, compilerOptions, allowJs, checkJs, esModuleInterop, forceConsistentCasingInFileNames, moduleResolution, resolveJsonModule (+4 more)

### Community 28 - "Version Bump Automation"
Cohesion: 0.26
Nodes (12): bumpCargoToml(), bumpPackageJson(), bumpTauriConf(), cargoTomlPath, die(), main(), packageJsonPath, parseArgs() (+4 more)

### Community 29 - "Workspace Config Import"
Cohesion: 0.29
Nodes (13): $lib/services/workspace-config-import, ImportedServiceDraft, isRecord(), isValidStorageKey(), normalizeImportedServices(), parseImportedService(), parseNotificationPrefs(), ParseResult (+5 more)

### Community 30 - "Workspace Mutation Actions"
Cohesion: 0.30
Nodes (15): $lib/services/workspace-actions, applyCurrentWorkspaceServices(), deleteServiceFromWorkspaceState(), deleteWorkspaceWithEffects(), pruneOrphanedServicesFromWorkspaceState(), setWorkspaceDisabledWithEffects(), createService(), createWorkspaceState() (+7 more)

### Community 31 - "Native Download Dialog"
Cohesion: 0.38
Nodes (10): DownloadEvent, R, filename_from_url_heuristic(), handle_service_webview_download(), Path, String, Url, Webview (+2 more)

### Community 32 - "Desktop Tray Interface"
Cohesion: 0.29
Nodes (10): Image, cached_tray_icons(), AppHandle, String, Window, show_context_menu(), toggle_main_window_visibility(), tray_icon() (+2 more)

### Community 33 - "Tauri Plugin Dependencies"
Cohesion: 0.33
Nodes (6): http://ipc.localhost, https://github.com, https://*.githubusercontent.com, https://objects.githubusercontent.com, ipc:, connect-src

### Community 34 - "Native Notification Logic"
Cohesion: 0.27
Nodes (9): $lib/services/native-notifications, buildNativeNotificationPreview(), buildNativeUnreadNotification(), NativeNotificationService, NativeUnreadNotification, parseNativeNotificationPreviewPayload(), shouldSendNativeNotificationPreview(), shouldSendNativeUnreadNotification() (+1 more)

### Community 35 - "Tauri Build Version Sync"
Cohesion: 0.20
Nodes (8): app, macOSPrivateApi, windows, withGlobalTauri, identifier, productName, $schema, version

### Community 36 - "Webview Setup Validation"
Cohesion: 0.27
Nodes (11): external_webview_url_accepts_https_urls(), resource_usage_monitor_restores_page_hooks_when_disabled(), service_webview_setup_disables_spellcheck_when_requested(), service_webview_setup_injects_resource_usage_monitor_when_enabled(), service_webview_setup_skips_resource_usage_monitor_when_disabled(), external_webview_url(), Option, String (+3 more)

### Community 37 - "Package Script Commands"
Cohesion: 0.33
Nodes (6): icons/128x128@2x.png, icons/128x128.png, icons/32x32.png, icons/icon.icns, icons/icon.ico, icon

### Community 38 - "Tauri Application Wiring"
Cohesion: 0.24
Nodes (9): SpectaBuilder, build_specta(), AppHandle, String, Window, Wry, run(), show_context_menu() (+1 more)

### Community 40 - "Resource Usage Monitoring"
Cohesion: 0.39
Nodes (7): $lib/services/resource-usage, emptyResourceUsageSnapshot(), finiteOrNull(), formatNetworkMbps(), formatPercentEstimate(), parseResourceUsagePayload(), ResourceUsageSnapshot

### Community 41 - "Service Management Settings"
Cohesion: 0.29
Nodes (8): $lib/services/service-management, buildServiceManagementRows(), filterServiceManagementRows(), serviceManagementHostname(), ServiceManagementRow, ServiceManagementWorkspace, ServiceManagementWorkspaceFilter, setServiceHibernationEnabled()

### Community 42 - "Product Distribution Concepts"
Cohesion: 0.22
Nodes (9): Validated Config Import Replacement Flow, Minisign-Verified In-App Updater, Minisign Key Management, Publish Latest Updater Manifest, Signed Updater Artifact Publishing, Config-Only Backup and Restore, Cross-Platform GitHub Distribution, Ferx Desktop Workspace (+1 more)

### Community 43 - "Pointer Drag State"
Cohesion: 0.25
Nodes (3): $lib/services/drag-drop.svelte, createDragDropState(), DropCallback

### Community 44 - "In-App Updater Service"
Cohesion: 0.40
Nodes (5): build, beforeBuildCommand, beforeDevCommand, devUrl, frontendDist

### Community 45 - "Contributor Quality and Security"
Cohesion: 0.25
Nodes (8): Behavioral Test Policy, Contributor Validation Workflow, Generated Tauri Specta Types, Open Source Publication Readiness, Bug Report Security Diversion, Generated Tauri Type Freshness Check, CI Validation Pipeline, Private Vulnerability Reporting

### Community 46 - "Badge Strategy Resolution"
Cohesion: 0.39
Nodes (6): BadgeCapability, BadgeStrategyKind, BadgeStrategyName, getBadgeCapability(), matchesHostname(), resolveBadgeStrategy()

### Community 47 - "Updater Endpoint Configuration"
Cohesion: 0.29
Nodes (7): https://github.com/adiwidia-dev/ferx/releases/latest/download/latest.json, plugins, updater, endpoints, pubkey, windows, installMode

### Community 49 - "Runtime Webview Scripts"
Cohesion: 0.29
Nodes (3): audio_mute_controller_tracks_media_and_web_audio(), audio_mute_controller_script(), google_auth_compat_script()

### Community 50 - "Injected Webview Behavior Tests"
Cohesion: 0.29
Nodes (7): badge_evaluation_contains_strategy_errors(), injected_js_builds_observer_driven_badge_engine(), notification_shim_does_not_forward_previews_when_denied(), notification_shim_forwards_web_notification_previews_when_allowed(), title_observer_binds_to_title_then_tracks_head_child_list(), unsupported_strategy_stays_conservative(), injected_js()

### Community 54 - "Webview Lifecycle Reliability"
Cohesion: 0.50
Nodes (5): Webview Lifecycle Invariant, Webview Reliability Improvements, Long-Lived Service Webviews, Serialized Webview Command Queue, Service Hibernation Lifecycle

### Community 56 - "Service Reordering Utilities"
Cohesion: 0.50
Nodes (4): $lib/services/reorder, moveItemToTarget(), services, WithId

### Community 57 - "Service Hibernation Store"
Cohesion: 0.50
Nodes (4): $lib/services/service-hibernation.svelte, createServiceHibernationStore(), HibernateCallback, Timer

### Community 60 - "Webview Resource Usage"
Cohesion: 0.50
Nodes (3): resource_usage_script_processes_resource_entries_incrementally(), resource_usage_monitor_eval_script(), resource_usage_monitor_script()

### Community 161 - "pull_request_template.md"
Cohesion: 0.50
Nodes (3): Risk Review, Summary, Testing

## Knowledge Gaps
- **294 isolated node(s):** `name`, `version`, `private`, `description`, `repository` (+289 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **80 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `$lib/services/app-info` connect `Package Metadata` to `Tauri Build Version Sync`, `Settings Configuration State`?**
  _High betweenness centrality (0.073) - this node is a cross-community bridge._
- **Why does `$lib/components/ui/button` connect `Settings Configuration State` to `Service Editor Appearance`, `Todos and Page Lifecycle`, `Main Workspace Interface`, `Dialog UI Components`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Why does `$lib/services/workspace-groups` connect `Workspace Group State` to `Todos and Page Lifecycle`, `Workspace Icon Catalog`, `DND and Runtime Badges`, `Service Configuration Editor`, `Service Management Settings`, `Notification Preference Integration`, `Main Workspace Interface`, `Application Preferences`, `Settings Configuration State`, `Workspace Config Export`, `Workspace Config Import`, `Workspace Mutation Actions`, `page-todos-panel.test.ts`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _294 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Rust Webview State Lifecycle` be split into smaller, more focused modules?**
  _Cohesion score 0.06094627105052125 - nodes in this community are weakly interconnected._
- **Should `Todos and Page Lifecycle` be split into smaller, more focused modules?**
  _Cohesion score 0.08127721335268505 - nodes in this community are weakly interconnected._
- **Should `Rust Behavioral Test Suite` be split into smaller, more focused modules?**
  _Cohesion score 0.049019607843137254 - nodes in this community are weakly interconnected._