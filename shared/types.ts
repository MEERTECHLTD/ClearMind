export interface ProjectMilestone {
  id: string;
  title: string;
  dueDate?: string;
  completed: boolean;
}

// Project Implementation Plan Phase
export interface ProjectPhase {
  id: string;
  name: string;
  description?: string;
  status: 'Not Started' | 'In Progress' | 'Completed' | 'Blocked';
  startDate?: string;
  endDate?: string;
  progress: number;
  deliverables: string[];
  dependencies?: string[]; // Phase IDs this depends on
  order: number;
}

// Team Check-in Entry
export interface TeamCheckIn {
  id: string;
  date: string;
  attendees: string[];
  notes: string;
  blockers?: string[];
  nextSteps?: string[];
  mood?: 'Positive' | 'Neutral' | 'Concerned';
}

// Project Risk
export interface ProjectRisk {
  id: string;
  title: string;
  description?: string;
  severity: 'Low' | 'Medium' | 'High' | 'Critical';
  likelihood: 'Low' | 'Medium' | 'High';
  mitigation?: string;
  status: 'Open' | 'Mitigated' | 'Closed';
}

// Resource/Budget Item
export interface ProjectResource {
  id: string;
  name: string;
  type: 'Budget' | 'Personnel' | 'Equipment' | 'Software' | 'Other';
  allocated: number;
  used: number;
  unit?: string; // e.g., "$", "hours", "units"
}

// Performance Metric
export interface PerformanceMetric {
  id: string;
  name: string;
  target: number;
  current: number;
  unit: string;
  trend?: 'Up' | 'Down' | 'Stable';
}

// Implementation Plan Template
export interface ImplementationPlanTemplate {
  id: string;
  name: string;
  category: ProjectCategory;
  phases: Omit<ProjectPhase, 'id' | 'status' | 'progress'>[];
  defaultRisks?: Omit<ProjectRisk, 'id' | 'status'>[];
  defaultMetrics?: Omit<PerformanceMetric, 'id' | 'current' | 'trend'>[];
}

// Project Categories
export type ProjectCategory = 
  | 'Energy'
  | 'Green Energy'
  | 'Finance'
  | 'Health'
  | 'IT'
  | 'Education'
  | 'Construction'
  | 'Manufacturing'
  | 'Retail'
  | 'Marketing'
  | 'Research'
  | 'Government'
  | 'Non-Profit'
  | 'Startup'
  | 'Personal'
  | 'Other';

// Alignment/Goals Connection
export interface ProjectAlignment {
  strategicGoal: string;
  alignmentScore: number; // 0-100
  notes?: string;
}

export interface Project {
  id: string;
  title: string;
  description: string;
  status: 'Not Started' | 'Planning' | 'In Progress' | 'On Hold' | 'Completed' | 'Cancelled';
  progress: number;
  tags: string[];
  deadline?: string;
  // Enhanced project fields
  startDate?: string;
  projectMilestones?: ProjectMilestone[];
  reportingStructure?: string; // e.g., "Reports to: Manager Name"
  team?: string[]; // Team members
  priority?: 'Critical' | 'High' | 'Medium' | 'Low';
  category?: ProjectCategory;
  notes?: string;
  
  // Implementation Plan
  implementationPlan?: {
    templateId?: string;
    phases: ProjectPhase[];
    objectives?: string[];
    scope?: string;
    outOfScope?: string[];
    assumptions?: string[];
    constraints?: string[];
  };
  
  // Team Management
  projectManager?: string;
  stakeholders?: string[];
  teamCheckIns?: TeamCheckIn[];
  nextCheckInDate?: string;
  
  // Risk Management
  risks?: ProjectRisk[];
  
  // Resources & Budget
  resources?: ProjectResource[];
  totalBudget?: number;
  budgetUsed?: number;
  
  // Performance & Alignment
  performanceMetrics?: PerformanceMetric[];
  alignments?: ProjectAlignment[];
  healthStatus?: 'On Track' | 'At Risk' | 'Off Track';
  
  // Audit Trail
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string;

  // Task-list fields (Todoist-style task layer). Optional; absent on older records.
  color?: string | null;
  parentId?: string | null;   // nested project
  order?: number | null;
  archived?: boolean | null;
  icon?: string | null;       // emoji or icon name
  favorite?: boolean | null;
  view?: 'list' | 'board' | 'calendar' | null;
  /** Collaboration-ready: member uids/emails (unused in the single-user UI). */
  members?: string[] | null;
  source?: ChangeSource | null;
  // Sync metadata
  _fc?: Record<string, string> | null;
  version?: number | null;
  clientId?: string | null;
  mutationId?: string | null;
  deleted?: boolean | null;
}

export interface LogEntry {
  id: string;
  date: string;
  content: string;
  mood: 'Productive' | 'Neutral' | 'Frustrated' | 'Flow State';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
}

// Four priority levels (P1..P4). 'None' (P4) was added for the Todoist-style
// task layer; the original three keep their meaning, so existing records are
// untouched. Every field added below is optional and nullable (Firestore
// sanitising turns `undefined` into `null`), so old records stay valid.
export type TaskPriority = 'High' | 'Medium' | 'Low' | 'None';

// Repeat rule. Expandable: new options can be added without migrating.
export interface TaskRecurrence {
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number;           // every N units (>= 1)
  weekdays?: number[] | null; // weekly: 0=Sun..6=Sat
  /** monthly: day of month (1..31) or -1 = last day of month. */
  monthDay?: number | null;
  /** monthly: nth weekday — e.g. { weekday: 1, ordinal: 1 } = first Monday; ordinal -1 = last. */
  nthWeekday?: { weekday: number; ordinal: number } | null;
  /** 'scheduled' (default): next date from the due date. 'completion': from the day it was completed. */
  anchor?: 'scheduled' | 'completion' | null;
  /** Optional end date (inclusive, 'YYYY-MM-DD'). */
  until?: string | null;
}

/** Where a change came from — every synced record and activity entry carries one. */
export type ChangeSource = 'android' | 'ios' | 'web' | 'mcp' | 'api' | 'cli' | 'widget' | 'notification' | 'system';

/** A reminder attached to a task. */
export interface TaskReminder {
  id: string;
  /** 'relative' = minutes before the due date/time; 'absolute' = a fixed moment. */
  type: 'relative' | 'absolute';
  minutesBefore?: number | null;
  /** absolute: local 'YYYY-MM-DDTHH:MM' interpreted in the task/user time zone. */
  at?: string | null;
}

/**
 * Field-level sync metadata stamped on every synced record (see
 * shared/sync/fields.ts). Optional so legacy records stay valid.
 */
export interface SyncMeta {
  updatedAt?: string;
  /** Per-field change clocks: field name → ISO timestamp of its last change. */
  _fc?: Record<string, string> | null;
  /** Monotonic per-record version (incremented on each local change). */
  version?: number | null;
  /** Device/agent that made the last change. */
  clientId?: string | null;
  /** Idempotency: id of the mutation that produced this state. */
  mutationId?: string | null;
  /** Server write time (Firestore server timestamp) — the delta-sync cursor. */
  _serverAt?: unknown;
  deleted?: boolean | null;
  deletedAt?: string | null;
}

export interface Task extends SyncMeta {
  id: string;
  title: string;
  completed: boolean;
  priority: TaskPriority;
  dueDate?: string;  // 'YYYY-MM-DD' (local to `timezone`)
  dueTime?: string;  // 'HH:MM' (local to `timezone`)
  taskNumber?: number;
  notified?: boolean;
  description?: string;
  projectId?: string | null;   // absent/null = Inbox
  sectionId?: string | null;
  parentId?: string | null;    // set = subtask of that task
  labelIds?: string[] | null;
  recurrence?: TaskRecurrence | null;
  order?: number | null;
  createdAt?: string | null;
  completedAt?: string | null;
  // Deep task model (all optional)
  /** Planned duration in minutes. */
  duration?: number | null;
  /** IANA time zone the due date/time is expressed in (e.g. 'Africa/Lagos'). Absent = floating local time. */
  timezone?: string | null;
  reminders?: TaskReminder[] | null;
  assigneeId?: string | null;
  createdBy?: string | null;
  /** Where the task was created. */
  source?: ChangeSource | null;
  /** For agent-created items: the connected agent's name. */
  agent?: string | null;
  /** Inbox capture kind: a quick thought/note vs. an actionable task. */
  kind?: 'task' | 'note' | null;
}

export interface Label extends SyncMeta {
  id: string;
  name: string;
  color: string;
  order?: number | null;
  favorite?: boolean | null;
}

/** A section inside a project ("Backlog", "In progress", …). */
export interface Section extends SyncMeta {
  id: string;
  projectId: string;
  name: string;
  order: number;
  collapsed?: boolean | null;
  archived?: boolean | null;
}

/** A comment / note on a task or a project. */
export interface Comment extends SyncMeta {
  id: string;
  taskId?: string | null;
  projectId?: string | null;
  text: string;
  createdAt: string;
  authorName?: string | null;
  source?: ChangeSource | null;
  agent?: string | null;
}

/**
 * Canonical completion event — the basis of every productivity metric.
 * id = `${taskId}@${occurrence}` so completing the same occurrence twice (retry,
 * two devices) is idempotent; reopening tombstones it (deleted: true).
 */
export interface Completion extends SyncMeta {
  id: string;
  taskId: string;
  title: string;
  projectId?: string | null;
  priority: TaskPriority;
  /** Occurrence key: the due date completed, or 'once' for non-recurring. */
  occurrence: string;
  completedAt: string;
  /** Local calendar day ('YYYY-MM-DD') in the user's time zone when completed. */
  day: string;
  /** Whether the task was overdue when completed. */
  wasOverdue?: boolean | null;
  source?: ChangeSource | null;
}

/** Append-only activity entry (history + audit for agent actions). */
export interface Activity extends SyncMeta {
  id: string;
  at: string;
  entity: 'task' | 'project' | 'section' | 'label' | 'comment' | 'settings';
  entityId: string;
  /** e.g. created, completed, reopened, deleted, moved, priority, rescheduled, renamed, commented, updated */
  action: string;
  title?: string | null;
  projectId?: string | null;
  /** Small human-readable change summary, e.g. { from: 'P3', to: 'P1' }. */
  details?: Record<string, unknown> | null;
  source?: ChangeSource | null;
  agent?: string | null;
}

/** Per-user preferences, one synced document (id 'preferences'). */
export interface Preferences extends SyncMeta {
  id: 'preferences';
  theme?: 'system' | 'light' | 'dark';
  appIcon?: string | null;
  homeView?: 'today' | 'inbox' | 'upcoming' | 'search' | 'browse' | `project:${string}`;
  syncHomeView?: boolean;
  smartDates?: boolean;
  weekStart?: 0 | 1 | 6; // Sun / Mon / Sat
  nextWeek?: 'monday' | 'plus7';
  weekend?: 'saturday' | 'sunday';
  timezone?: string | null; // null = device time zone
  completeSound?: boolean;
  swipeRight?: SwipeAction;
  swipeLeft?: SwipeAction;
  navTabs?: string[];
  quickAddProjectId?: string | null;
  quickAddPriority?: TaskPriority;
  quickAddParse?: boolean;
  density?: 'comfortable' | 'compact';
  dailyGoal?: number;
  weeklyGoal?: number;
  daysOff?: number[];      // weekdays excluded from streaks
  vacation?: boolean;      // pause streaks
  defaultReminder?: number | null; // minutes before due (null = none); 0 = at due time
  autoReminders?: boolean; // add the default reminder to timed tasks automatically
  notifyReminders?: boolean;
  notifyOverdue?: boolean;
  dailyPlanAt?: string | null;    // 'HH:MM' daily planning reminder, null = off
  weeklySummary?: boolean;
  quietStart?: string | null;     // 'HH:MM'
  quietEnd?: string | null;
}

export type SwipeAction = 'complete' | 'schedule' | 'delete' | 'priority' | 'move' | 'select' | 'none';

/** A saved filter / custom view ("High priority this week", "RanaWallet blockers"). */
export interface SavedFilter extends SyncMeta {
  id: string;
  name: string;
  /** Filter query, e.g. "p1 & #RanaWallet & !@waiting" (see shared/domain/filters.ts). */
  query: string;
  color?: string | null;
  order?: number | null;
  favorite?: boolean | null;
}

/** A scoped, revocable credential for an AI agent / API client (stored hashed). */
export interface AgentToken {
  id: string;        // sha256(token) — the secret itself is never stored
  name: string;
  scopes: AgentScope[];
  createdAt: string;
  lastUsedAt?: string | null;
  revoked?: boolean | null;
  revokedAt?: string | null;
  /** Requests per minute this token may make. */
  rateLimit?: number | null;
  prefix: string;    // first characters, for display ("cm_live_ab12…")
}

export type AgentScope =
  | 'tasks:read' | 'tasks:write' | 'tasks:delete'
  | 'projects:read' | 'projects:write' | 'projects:delete'
  | 'productivity:read' | 'bulk'
  | 'notes:read' | 'notes:write' | 'notes:delete';

/** Audit entry for every agent/API call (users/{uid}/agentAudit). */
export interface AgentAudit {
  id: string;
  at: string;
  tokenId: string;
  agent: string;
  tool: string;
  ok: boolean;
  error?: string | null;
  summary?: string | null;
  source: ChangeSource;
}

export interface Note extends SyncMeta {
  id: string;
  title: string;
  /** Markdown. Supports [[wikilinks]], ![[embeds]], #tags and YAML frontmatter. */
  content: string;
  /** Derived from #tags in the body + frontmatter `tags` (kept for search/mobile). */
  tags: string[];
  lastEdited: string;
  /** Vault folder path, e.g. "Projects/ClearMind" (null/absent = vault root). */
  folder?: string | null;
  createdAt?: string;
  bookmarked?: boolean;
  /** 'daily' notes are keyed by `dailyDate`; 'template' notes feed "Insert template". */
  /** 'canvas' notes hold JSON Canvas 1.0 in `content` (see shared/notes/canvas.ts). */
  kind?: 'note' | 'daily' | 'template' | 'canvas';
  dailyDate?: string | null;
  /** Where the note was created/last written from (e.g. 'mcp', 'api', 'cli', 'web'). */
  source?: ChangeSource;
  /** Agent (token) name when written by an AI agent. */
  agent?: string | null;
}

/**
 * A file in the notes vault (image, PDF, audio, video, any file). Metadata is
 * a Firestore doc at users/{uid}/attachments/{id}; the bytes are stored in
 * `chunks` base64 docs at users/{uid}/attachmentChunks/{id}_{i} (works on the
 * free Firebase plan; swap for Cloud Storage later behind shared/data/attachments).
 */
export interface Attachment {
  id: string;
  /** File name with extension, e.g. "diagram.png". Unique per folder. */
  name: string;
  folder?: string | null;
  mime: string;
  size: number;
  chunks: number;
  createdAt: string;
  updatedAt: string;
  width?: number | null;
  height?: number | null;
  deleted?: boolean;
}

export interface Habit {
  id: string;
  name: string;
  streak: number;
  completedToday: boolean;
  history: boolean[]; // Last 7 days
  monthlyHistory?: { [date: string]: boolean }; // Monthly tracking: { "2026-01-04": true }
  description?: string;
  color?: string;
  createdAt?: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  date: string; // YYYY-MM-DD
  startTime?: string; // HH:MM
  endTime?: string; // HH:MM
  location?: string;
  color: string;
  reminder: boolean;
  notified?: boolean;
}

export interface DailyMapperEntry {
  id: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM (e.g., "05:00")
  endTime: string; // HH:MM (e.g., "05:30")
  task: string;
  completed: 'yes' | 'no' | 'partial';
  comment?: string;
  adjustment?: string;
  color?: string;
  location?: 'home' | 'work' | 'other'; // Location of the todo
  // For permanent/recurring todos
  isPermanent?: boolean;
  permanentType?: 'daily' | 'workday' | 'weekend'; // daily = every day, workday = Mon-Fri, weekend = Sat-Sun
  templateId?: string; // Links to the permanent template it was created from
}

// Template for permanent daily mapper entries
export interface DailyMapperTemplate {
  id: string;
  startTime: string;
  endTime: string;
  task: string;
  color?: string;
  location?: 'home' | 'work' | 'other'; // Location of the todo
  permanentType: 'daily' | 'workday' | 'weekend';
  createdAt: string;
}

export interface Goal {
  id: string;
  title: string;
  targetDate: string;
  progress: number;
  category: 'Career' | 'Personal' | 'Health' | 'Skill';
}

export interface Milestone {
  id: string;
  title: string;
  date: string;
  completed: boolean;
  description: string;
}

export interface Rant {
  id: string;
  content: string;
  createdAt: string;
  timestamp?: string; // Alias for createdAt for backwards compatibility
  mood?: 'frustrated' | 'angry' | 'overwhelmed' | 'confused' | 'venting';
}

// A person attached to an application (recruiter, program officer, referee…).
export interface ApplicationContact {
  id: string;
  name: string;
  email?: string;
  role?: string; // e.g. "Recruiter", "Program Officer"
}

// A requirement/document checklist item (CV, cover letter, references…).
export interface ApplicationRequirement {
  id: string;
  label: string;
  done: boolean;
}

export interface Application {
  id: string;
  name: string;
  link?: string;
  type: 'job' | 'grant' | 'scholarship' | 'other';
  status: 'draft' | 'open' | 'submitted' | 'closed' | 'accepted' | 'rejected';
  priority: 'High' | 'Medium' | 'Low';
  openingDate?: string;
  closingDate?: string;
  submissionDeadline?: string;
  submittedDate?: string;
  notes?: string;
  organization?: string;
  // Type-specific detail fields (surfaced for grant / scholarship).
  funder?: string; // awarding body, often distinct from the host organization
  awardAmount?: string; // free-text so it can hold currency symbols / ranges ("$50,000", "£10k–15k")
  referenceNumber?: string; // portal / solicitation reference number
  // Power-tracker fields (all types).
  tags?: string[];
  contacts?: ApplicationContact[];
  requirements?: ApplicationRequirement[];
  // Deadline reminders: which days-before-deadline to alert. Absent => default [7,3,1].
  reminderLeadDays?: number[];
  createdAt: string;
  updatedAt?: string;
}

export interface ApplicationPreferences {
  id: string;
  sortBy: 'deadline' | 'priority' | 'created' | 'name';
  groupBy: 'none' | 'type' | 'status' | 'priority';
}

// A shared, collaborative Applications workspace. Lives in Firestore at
// `workspaces/{id}` with applications under `workspaces/{id}/applications/{appId}`.
// Membership is by email (the auth token carries it), so no uid lookup / Cloud
// Function is needed to invite someone — the owner just adds their email.
// Every member has FULL edit access to the applications (no viewer/editor roles).
export interface Workspace {
  id: string;
  name: string;
  ownerUid: string;
  ownerEmail: string;
  memberEmails: string[]; // lowercased; always includes the owner
  createdAt: string;
  updatedAt?: string;
}

// Learning Vault Types
export type LearningContentType = 'video' | 'audio';
export type LearningContentStatus = 'unwatched' | 'in-progress' | 'completed';
export type LearningSourcePlatform = 
  | 'youtube' 
  | 'vimeo' 
  | 'spotify' 
  | 'apple-podcasts' 
  | 'soundcloud' 
  | 'coursera' 
  | 'udemy' 
  | 'khan-academy' 
  | 'mit-ocw' 
  | 'ted' 
  | 'other';

export interface LearningResourceNote {
  id: string;
  content: string;
  timestamp?: number; // Timestamp in seconds for media-linked notes
  createdAt: string;
}

export interface LearningResource {
  id: string;
  url: string;
  title: string;
  description?: string;
  thumbnail?: string;
  contentType: LearningContentType;
  duration?: number; // Duration in seconds
  sourcePlatform: LearningSourcePlatform;
  author?: string; // Channel name or author
  status: LearningContentStatus;
  progress?: number; // Playback progress in seconds
  tags: string[];
  folder?: string; // Optional folder/collection name
  notes: LearningResourceNote[];
  isSourceAvailable: boolean; // Track if external link is still available
  savedAt: string;
  completedAt?: string;
  lastAccessedAt?: string;
  updatedAt?: string;
}

export interface LearningFolder {
  id: string;
  name: string;
  color?: string;
  createdAt: string;
}

export interface LearningVaultStats {
  totalItems: number;
  completedItems: number;
  totalWatchTime: number; // in seconds
  weeklyWatchTime: number; // in seconds
  averageSessionLength: number; // in seconds
}

export interface IrisConversation {
  id: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
  title?: string;
}

export interface MindMapNode {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
  isRoot?: boolean;
  isDecision?: boolean; // For decision tree nodes
}

export interface MindMapEdge {
  id: string;
  from: string; // Node ID
  to: string; // Node ID
  label?: string; // For decision tree labels (e.g., "Yes", "No")
}

export interface MindMap {
  id: string;
  title: string;
  nodes: MindMapNode[];
  edges: MindMapEdge[];
  type: 'mindmap' | 'decision-tree';
  createdAt: string;
  updatedAt: string;
}

export interface UserProfile {
  id: string; // usually 'current-user'
  nickname: string;
  githubUsername?: string;
  joinedAt: string;
  // Cloud user fields (optional for local-only users)
  email?: string;
  photoURL?: string;
  provider?: 'email' | 'google' | 'github' | 'anonymous' | 'local';
  cloudUserId?: string; // Firebase UID
  lastSyncedAt?: string;
}

export type ViewState = 
  | 'dashboard' 
  | 'projects' 
  | 'tasks' 
  | 'notes' 
  | 'habits' 
  | 'goals' 
  | 'milestones' 
  | 'iris' 
  | 'rant' 
  | 'dailylog' 
  | 'analytics' 
  | 'mindmap'
  | 'calendar'
  | 'dailymapper'
  | 'applications'
  | 'reviewer'
  | 'learningvault'
  | 'settings'
  // Todoist-style task views (web). `project` / `label` / `filter` take an id
  // from the hash: #project/<id>.
  | 'inbox'
  | 'today'
  | 'upcoming'
  | 'search'
  | 'filters'
  | 'completed'
  | 'project'
  | 'label'
  | 'filter'
  // Productivity, activity history and project templates (web).
  | 'productivity'
  | 'activity'
  | 'templates';