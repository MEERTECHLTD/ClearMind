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

export interface Task {
  id: string;
  title: string;
  completed: boolean;
  priority: 'High' | 'Medium' | 'Low';
  dueDate?: string;
  dueTime?: string;
  taskNumber?: number;
  notified?: boolean;
  description?: string;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
  lastEdited: string;
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
  createdAt: string;
  updatedAt?: string;
}

export interface ApplicationPreferences {
  id: string;
  sortBy: 'deadline' | 'priority' | 'created' | 'name';
  groupBy: 'none' | 'type' | 'status' | 'priority';
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
  | 'learningvault'
  | 'settings';